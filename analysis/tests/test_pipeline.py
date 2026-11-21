"""End-to-end checks of the analysis on the real collected data, and of the report builder."""

import json

import pandas as pd
import pytest

from a3 import analyze, data, metrics, report


@pytest.fixture(scope="module")
def loaded():
    trials, sessions = data.load()
    return trials, sessions, data.load_items(), data.load_pilot_items()


def test_valid_codes_need_both_parts_and_the_attention_check(loaded):
    trials, sessions, *_ = loaded
    codes = data.valid_codes(sessions)
    assert "R1" in codes  # valid, but excluded from the primary sample as the researcher
    broken = sessions.copy()
    broken.loc[broken["code"] == codes[0], "catch_passed"] = False
    assert codes[0] not in data.valid_codes(broken)
    one_part = sessions[~((sessions["code"] == codes[1]) & (sessions["condition"] == "assisted"))]
    assert codes[1] not in data.valid_codes(one_part)


def test_samples_apply_the_stated_rules(loaded):
    trials, sessions, items, pilot = loaded
    s = {x.name: x for x in data.samples(trials, sessions, pilot)}
    assert "R1" not in set(s["primary"].trials["code"])
    assert "R1" in set(s["with_researcher"].trials["code"])
    assert set(s["class_only"].trials["app_version"].astype(str)) == {"2"}
    exposed = s["no_prior_exposure"].trials
    assert not (exposed["code"].isin(data.PRIOR_EXPOSURE_CODES) & exposed["item_id"].isin(pilot)).any()
    for x in s.values():
        assert not x.trials["is_catch"].any()  # the attention check never counts
        assert (x.trials.groupby(["code", "condition"]).size() <= 20).all()


def test_the_logged_ai_matches_the_a2_model(loaded):
    trials, sessions, items, pilot = loaded
    primary = data.samples(trials, sessions, pilot)[0].trials
    c = analyze.consistency(primary, items)
    assert c["ai_matches_a2"] == c["assisted_trials"] > 0


def test_per_participant_scores_match_a_direct_count(loaded):
    trials, sessions, items, pilot = loaded
    t = data.samples(trials, sessions, pilot)[0].trials
    pp = metrics.per_participant(t).set_index("code")
    for code, g in t.groupby("code"):
        base = g[g["condition"] == "baseline"]
        assert pp.loc[code, "acc_baseline"] == pytest.approx(base["scored_correct"].mean())


def test_full_run_writes_results_and_the_report_resolves(loaded, tmp_path, monkeypatch):
    monkeypatch.setattr(analyze, "OUT", tmp_path)
    assert analyze.main() == 0
    results = json.loads((tmp_path / "results.json").read_text())
    assert set(results["samples"]) == {
        "primary",
        "class_only",
        "no_prior_exposure",
        "with_researcher",
    }
    assert (tmp_path / "figures" / "paired_accuracy.png").is_file()
    text = report.fill(report.TEMPLATE.read_text(), report.values(results))
    assert "{{" not in text
    assert report.missing_images(text) == []


def test_fill_refuses_unknown_placeholders():
    with pytest.raises(report.ReportError, match="nope"):
        report.fill("{{ nope }}", {})
    assert report.fill("a {{x}} b", {"x": "1"}) == "a 1 b"


def test_formatting_helpers():
    assert report.pct(0.8) == "80.0%" and report.pct(None) == "n/a"
    assert report.pval(0.0004) == "< 0.001" and report.pval(0.0312) == "0.031" and report.pval(None) == "n/a"
    assert "<table" in report.to_html("| a |\n|---|\n| 1 |")


def test_gee_failure_is_reported_not_fatal(loaded, monkeypatch):
    trials, sessions, items, pilot = loaded
    sample = data.samples(trials, sessions, pilot)[0]
    monkeypatch.setattr(analyze, "gee", lambda t: (_ for _ in ()).throw(ValueError("singular")))
    assert analyze.analyse(sample, items, sessions)["gee"] == {"error": "singular"}


def test_clean_makes_json_safe_values():
    assert analyze._clean({"a": float("nan"), "b": [1.0, pd.NA if False else 2]}) == {
        "a": None,
        "b": [1.0, 2],
    }


def test_headings_and_forced_breaks():
    html = "<h2>2. Data</h2><p>x</p><h3>2.1 Who</h3><h2>3. More</h2>"
    assert report.headings(html) == [("h2", "2. Data"), ("h3", "2.1 Who"), ("h2", "3. More")]
    out = report.with_breaks(html, {"3. More"})
    assert '<h2 style="break-before:page">3. More</h2>' in out and "<h2>2. Data</h2>" in out


def test_break_rules_follow_the_free_space_thresholds():
    low, middle, high = 0.80, 0.45, 0.20  # distance from the top edge of the page
    assert report.needs_break("h2", low, first=False)  # little room left: new page
    assert report.needs_break("h2", middle, first=False)  # about half free: still a new page for a section
    assert not report.needs_break("h2", high, first=False)  # plenty of room: stays
    assert not report.needs_break("h3", middle, first=False)  # a subsection needs only 30% free
    assert report.needs_break("h3", low, first=False)
    assert not report.needs_break("h2", low, first=True)  # the first section follows the title
    assert not report.needs_break("h2", report.TOP + 0.01, first=False)  # already at the top of a page


def test_images_in_figures_are_checked_too(tmp_path):
    assert report.missing_images('<img src="nope.png">') == ["nope.png"]
    assert report.missing_images('<img src="report/A3_report.md">') == []


def test_paginate_adds_breaks_until_no_heading_is_too_low(monkeypatch):
    html = "<h2>1. One</h2><h2>2. Two</h2><h3>2.1 Sub</h3><h2>3. Three</h2>"
    printed: list[str] = []
    monkeypatch.setattr(report, "print_pdf", printed.append)

    def fake_locate(heads):
        # a heading with a forced break lands at the top of a page; otherwise low on the page
        current = printed[-1]
        return [(0, report.TOP if f'style="break-before:page">{text}' in current else 0.8) for _, text in heads]

    monkeypatch.setattr(report, "locate", fake_locate)
    out = report.paginate(html)
    assert '<h2 style="break-before:page">2. Two</h2>' in out
    assert '<h2 style="break-before:page">3. Three</h2>' in out
    assert "<h2>1. One</h2>" in out  # the first section is never moved


def test_paginate_keeps_chromes_layout_without_a_locator(monkeypatch):
    monkeypatch.setattr(report, "print_pdf", lambda html: None)
    monkeypatch.setattr(report, "locate", lambda heads: None)
    assert report.paginate("<h2>1. One</h2><h2>2. Two</h2>") == "<h2>1. One</h2><h2>2. Two</h2>"


def test_shared_data_files_hold_only_pseudonyms():
    trials, sessions = data.load()
    feedback = data.load_class_feedback()
    for frame in (trials, sessions, feedback):
        codes = set(frame["code"]) - {""}
        assert codes and all(c.startswith(("P", "R")) and c[1:].isdigit() for c in codes)
    assert not sessions["session_id"].str.match(r"^S-[A-Z2-9]{6}$").any()  # real session ids never shared


def test_pseudonymize_numbers_by_first_session_and_refuses_unknown_codes():
    from a3 import pseudonymize

    s = pd.DataFrame({"code": ["zed", "otter-92", "amy", "zed"], "consented_at": ["3", "1", "2", "4"],
                      "session_id": ["S-A", "S-B", "S-C", "S-D"], "condition": ["baseline", "baseline",
                      "baseline", "assisted"]})  # fmt: skip
    key = pseudonymize.key(s)
    assert key == {"otter-92": "R1", "amy": "P1", "zed": "P2"}
    labels = pseudonymize.session_labels(s, key)
    assert labels == {"S-B": "R1-baseline", "S-C": "P1-baseline", "S-A": "P2-baseline", "S-D": "P2-assisted"}
    out = pseudonymize.apply(s, key, labels)
    assert set(out["code"]) == {"R1", "P1", "P2"} and "S-A" not in set(out["session_id"])
    with pytest.raises(ValueError, match="without a pseudonym"):
        pseudonymize.apply(pd.DataFrame({"code": ["stranger"]}), key)
    with pytest.raises(ValueError, match="without a label"):
        pseudonymize.apply(pd.DataFrame({"code": ["amy"], "session_id": ["S-Z"]}), key, labels)
