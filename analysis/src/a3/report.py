"""Build the A3 report: fill {{name}} placeholders from results/results.json, render HTML, print PDF.

    PYTHONPATH=src .venv/bin/python -m a3.report        (after a3.analyze)

An unknown placeholder is an error, so every number in the report comes from the analysis.
"""

import json
import os
import re
import shutil
import subprocess
from html import escape
from pathlib import Path
from typing import Any

import markdown

ANALYSIS = Path(__file__).resolve().parents[2]
REPO = ANALYSIS.parent
TEMPLATE = REPO / "report" / "A3_report.md"
RESULTS = ANALYSIS / "results" / "results.json"
OUT_HTML = REPO / "report" / "A3_report.html"
OUT_PDF = REPO / "report" / "A3_report.pdf"
CHROME = os.environ.get("CHROME_PATH") or str(
    Path.home() / "Desktop" / "Google Chrome.app" / "Contents" / "MacOS" / "Google Chrome"
)

_PLACEHOLDER = re.compile(r"\{\{\s*([a-z0-9_]+)\s*\}\}")


class ReportError(Exception):
    pass


def pct(x: float | None, digits: int = 1) -> str:
    return "n/a" if x is None else f"{x * 100:.{digits}f}%"


def pval(p: float | None) -> str:
    if p is None:
        return "n/a"
    return "< 0.001" if p < 0.001 else f"{p:.3f}"


def _test_values(prefix: str, t: dict[str, Any], kind: str = "pct") -> dict[str, str]:
    fmt = (lambda v: pct(v)) if kind == "pct" else (lambda v: f"{v:.2f}")
    diff = t["mean_diff"]
    sign = "+" if diff >= 0 else "−"
    d = f"{sign}{abs(diff) * 100:.1f} points" if kind == "pct" else f"{sign}{abs(diff):.2f}"
    return {
        f"{prefix}_a": fmt(t["mean_a"]),
        f"{prefix}_b": fmt(t["mean_b"]),
        f"{prefix}_d": d,
        f"{prefix}_w": f"{t['wilcoxon_stat']:g}",
        f"{prefix}_p": pval(t["wilcoxon_p"]),
        f"{prefix}_perm": pval(t["permutation_p"]),
        f"{prefix}_r": f"{t['rank_biserial']:+.2f}",
        f"{prefix}_nz": str(t["nonzero"]),
        f"{prefix}_method": t["wilcoxon_method"],
    }


def _table(headers: list[str], rows: list[list[str]]) -> str:
    lines = ["| " + " | ".join(headers) + " |", "|" + "---|" * len(headers)]
    lines += ["| " + " | ".join(r) + " |" for r in rows]
    return "\n".join(lines)


TYPE_NAMES = {
    "obvious_satire": "obvious satire",
    "subtle_satire": "subtle satire",
    "real_absurd": "real but absurd",
    "plain_real": "plain real",
}


def values(r: dict[str, Any]) -> dict[str, str]:
    """Every value the report may quote, formatted. Participants appear only as P1, P2, ..."""
    s = r["samples"]
    p = s["primary"]
    ids: dict[str, str] = r["participant_ids"]
    v: dict[str, str] = {
        "n_participants": str(p["participants"]),
        "n_trials": str(p["trials"]),
        "n_trials_condition": str(p["trials"] // 2),
        "n_class": str(s["class_only"]["participants"]),
        "n_preclass": str(p["participants"] - s["class_only"]["participants"]),
        "sessions_total": str(r["sessions_total"]),
        "sessions_stopped": str(r["sessions_stopped_at_check"]),
        "n_valid_all": str(len(r["valid_codes"])),
        "a2_ai": pct(r["a2_ai_accuracy_all_240"]),
        "ai_matches_a2": f"{r['consistency']['ai_matches_a2']} of {r['consistency']['assisted_trials']}",
    }
    for key, label in [
        ("human_alone", "alone"),
        ("human_before_ai", "before"),
        ("human_with_ai", "with"),
        ("ai_on_assisted_items", "ai"),
    ]:
        x = p["pooled"][key]
        v[f"acc_{label}"] = pct(x["accuracy"])
        v[f"acc_{label}_ci"] = f"{pct(x['ci'][0], 0)} to {pct(x['ci'][1], 0)}"
        v[f"acc_{label}_k"] = f"{x['correct']}/{x['n']}"
    t = p["tests"]
    v |= _test_values("t_main", t["human_alone_vs_with_ai"])
    v |= _test_values("t_ai", t["ai_vs_with_ai"])
    v |= _test_values("t_switch", t["before_vs_after_ai"])
    v |= _test_values("t_conf", t["confidence"], kind="num")
    v |= _test_values("t_time", t["time"], kind="num")
    v |= _test_values("t_time1", t["time_first_answer"], kind="num")
    m = p["mcnemar_before_after"]
    v |= {
        "mc_rw": str(m["right_to_wrong"]),
        "mc_wr": str(m["wrong_to_right"]),
        "mc_p": pval(m["p"]),
    }
    rel = p["reliance"]
    v |= {
        "rel_initial_agree": pct(rel["initial_agreement"]),
        "rel_agree": pct(rel["agreement_fraction"]),
        "rel_disagree": str(rel["disagreements"]),
        "rel_switch": pct(rel["switch_fraction"]),
        "rel_switches": str(rel["switches"]),
        "rel_to_right": str(rel["switches_to_right"]),
        "rel_to_wrong": str(rel["switches_to_wrong"]),
        "rel_rair": pct(rel["rair"]),
        "rel_rair_n": str(rel["opportunities_rair"]),
        "rel_rsr": pct(rel["rsr"]),
        "rel_rsr_n": str(rel["opportunities_rsr"]),
    }
    c = p["complementarity"]
    v |= {f"comp_{k}": str(n) for k, n in c.items()}
    g = p["gee"]
    if "error" not in g:
        v |= {
            "gee_or": f"{g['odds_ratio_ai']:.2f}",
            "gee_ci": f"{g['ci_low_ai']:.2f} to {g['ci_high_ai']:.2f}",
            "gee_p": pval(g["p_ai"]),
            "gee_order_or": f"{g['odds_ratio_second']:.2f}",
            "gee_order_p": pval(g["p_second"]),
        }
    ci = p["per_person_ci"]
    for key, label in [("human_alone", "alone"), ("human_before_ai", "before"), ("human_with_ai", "with"),
                       ("ai_on_assisted_items", "ai")]:  # fmt: skip
        v[f"acc_{label}_pci"] = f"{pct(ci[key][0], 0)} to {pct(ci[key][1], 0)}"
    lo, hi = ci["difference_with_minus_alone"]
    v["diff_ci"] = f"{lo * 100:+.1f} to {hi * 100:+.1f} points"
    d = p["discrimination"]

    def frac(name: str) -> str:
        return f"{d[name + '_k']} of {d[name + '_n']} ({pct(d[name], 0)})" if d[name + "_n"] else "none occurred"

    for name in ["switch_when_ai_right", "switch_when_ai_wrong", "switch_when_ai_confident",
                 "switch_when_ai_not_confident", "switch_when_person_unsure", "switch_when_person_sure",
                 "switch_when_confident_and_unsure", "ai_right_on_disagreements",
                 "ai_right_on_disagreements_confident", "ai_right_on_disagreements_not_confident"]:  # fmt: skip
        v[f"d_{name}"] = frac(name)
    v["d_confident_and_unsure_n"] = str(d["switch_when_confident_and_unsure_n"])
    v["d_unsure_n"] = str(d["switch_when_person_unsure_n"])
    v["d_fisher_p"] = pval(d["fisher_ai_right_vs_wrong_p"])
    v["d_ai_acc_conf"] = f"{pct(d['ai_acc_confident'])} ({d['ai_acc_confident_k']}/{d['ai_acc_confident_n']})"
    v["d_ai_acc_notconf"] = (
        f"{pct(d['ai_acc_not_confident'])} ({d['ai_acc_not_confident_k']}/{d['ai_acc_not_confident_n']})"
    )
    v |= {
        "pol_keep": pct(d["policy_always_keep"]),
        "pol_ai": pct(d["policy_always_ai"]),
        "pol_ai_conf": pct(d["policy_ai_when_confident"]),
        "pol_actual": pct(d["actual"]),
    }
    du = p["durations"]
    for cond, label in [("baseline", "base"), ("assisted", "ai"), ("both", "both")]:
        v[f"dur_{label}"] = f"{du[cond]['median']:.1f}"
        v[f"dur_{label}_range"] = f"{du[cond]['min']:.1f} to {du[cond]['max']:.1f}"
    loo = [x["mean_diff"] for x in p["leave_one_out"]]
    v["loo_min"] = f"{min(loo) * 100:+.1f}"
    v["loo_max"] = f"{max(loo) * 100:+.1f}"
    pp = sorted(p["per_participant"], key=lambda x: int(ids[x["code"]][1:]))
    for x in pp:
        pid = ids[x["code"]].lower()
        v[f"{pid}_acc_base"] = pct(x["acc_baseline"], 0)
        v[f"{pid}_acc_final"] = pct(x["acc_assisted_final"], 0)
        v[f"{pid}_k_base"] = f"{round(x['acc_baseline'] * x['n_baseline'])}/{x['n_baseline']}"
        v[f"{pid}_k_final"] = f"{round(x['acc_assisted_final'] * x['n_assisted'])}/{x['n_assisted']}"
        v[f"{pid}_conf_base"] = f"{x['conf_baseline']:.2f}"
        v[f"{pid}_conf_first"] = f"{x['conf_assisted_initial']:.2f}"
        v[f"{pid}_conf_final"] = f"{x['conf_assisted_final']:.2f}"
        v[f"{pid}_switches"] = str(x["switches"])
        v[f"{pid}_under"] = str(x["errors_ai_right_kept"])
        v[f"{pid}_over"] = str(x["errors_switched_to_ai"])
    v["errors_under_total"] = str(sum(x["errors_ai_right_kept"] for x in pp))
    v["errors_over_total"] = str(sum(x["errors_switched_to_ai"] for x in pp))
    pol = p["political"]
    v |= {
        "pol_n": str(pol["headlines"]),
        "pol_ai_satire": str(pol["ai_said_satire"]),
        "pol_satire": str(pol["truly_satire"]),
    }
    v["n_feedback"] = str(len(r["class_feedback"]))
    v["n_feedback_linked"] = str(sum(bool(c["code"]) for c in r["class_feedback"]))
    v["n_first_baseline"] = str(sum(x["first_condition"] == "baseline" for x in pp))
    v["n_first_assisted"] = str(sum(x["first_condition"] == "assisted" for x in pp))
    v["n_switchers"] = str(sum(x["switches"] > 0 for x in pp))
    v["revisions_total"] = str(sum(x["revisions"] for x in pp))
    n_rev = sum(x["revisions"] for x in pp)
    v["revisions_text"] = {0: "never", 1: "once", 2: "twice"}.get(n_rev, f"{n_rev} times")
    v["n_no_switch"] = str(sum(x["switches"] == 0 for x in pp))

    v["table_participants"] = _table(
        ["Participant", "First part", "Version", "On their own", "With AI: before", "With AI: final",
         "AI on their AI items", "Switches", "Median s/headline (own / AI)"],
        [[ids[x["code"]], x["first_condition"], x["app_version"], pct(x["acc_baseline"], 0),
          pct(x["acc_assisted_initial"], 0), pct(x["acc_assisted_final"], 0), pct(x["ai_acc_assisted_items"], 0),
          str(x["switches"]),
          f"{x['time_baseline_s']:.1f} / {x['time_assisted_s']:.1f}"] for x in pp],
    )  # fmt: skip
    order = list(TYPE_NAMES)
    bt = sorted(p["by_type"], key=lambda x: order.index(x["item_type"]))
    v["table_types"] = _table(
        ["Type", "On their own", "With AI: before", "With AI: final", "AI", "Headlines (own / AI)"],
        [[TYPE_NAMES[x["item_type"]], pct(x["human_alone"], 0), pct(x["human_before_ai"], 0),
          pct(x["human_with_ai"], 0), pct(x["ai"], 0), f"{x['n_baseline']} / {x['n_assisted']}"] for x in bt],
    )  # fmt: skip
    bp = sorted(
        p["by_pattern"],
        key=lambda x: (x["pattern"] != "AI right in A2", -(x["n_baseline"] + x["n_assisted"])),
    )
    v["table_patterns"] = _table(
        ["Headlines (A2 error pattern)", "On their own", "With AI: before", "With AI: final", "Headlines (own / AI)"],
        [[x["pattern"].replace("_", " "), pct(x["human_alone"], 0), pct(x["human_before_ai"], 0),
          pct(x["human_with_ai"], 0), f"{x['n_baseline']} / {x['n_assisted']}"] for x in bp],
    )  # fmt: skip
    cal: dict[int, dict[str, Any]] = {}
    for x in p["calibration"]:
        cal.setdefault(int(x["conf"]), {})[x["condition"]] = x
    v["table_calibration"] = _table(
        ["Confidence", "On their own: accuracy (n)", "With AI (final): accuracy (n)"],
        [[str(k)] + [f"{pct(cal[k][c]['accuracy'], 0)} ({cal[k][c]['n']})" if c in cal[k] else "-"
                     for c in ("baseline", "assisted")] for k in sorted(cal)],
    )  # fmt: skip
    rows = []
    for x in s.values():
        tt = x["tests"]["human_alone_vs_with_ai"]
        pooled = x["pooled"]
        rows.append([x["description"], str(x["participants"]), pct(pooled["human_alone"]["accuracy"]),
                     pct(pooled["human_with_ai"]["accuracy"]), pct(pooled["ai_on_assisted_items"]["accuracy"]),
                     pval(tt["wilcoxon_p"]), str(x["reliance"]["switches"])])  # fmt: skip
    v["table_sensitivity"] = _table(
        [
            "Sample",
            "People",
            "On their own",
            "With AI",
            "AI",
            "Wilcoxon p (own vs with AI)",
            "Switches",
        ],
        rows,
    )
    v["comments"] = "\n".join(
        f"- *{ids.get(c['code'], 'A participant')}, after the "
        f"{'AI part' if c['condition'] == 'assisted' else 'part on their own'}:* “{escape(c['comment'])}”"
        for c in r["comments"]
    )
    feedback = []
    for c in r["class_feedback"]:
        who = ids[c["code"]] if c["code"] in ids else "Unlinked participant"
        note = f" *Other notes:* “{escape(c['other_notes'])}”" if c["other_notes"] else ""
        feedback.append(f"- **{who}:** “{escape(c['comment_comparing_conditions'])}”{note}")
    v["class_feedback"] = "\n".join(feedback)
    return v


def fill(template: str, vals: dict[str, str]) -> str:
    missing = sorted({n for n in _PLACEHOLDER.findall(template) if n not in vals})
    if missing:
        raise ReportError("unresolved placeholders: " + ", ".join(missing))
    return _PLACEHOLDER.sub(lambda m: vals[m.group(1)], template)


CSS = """
@page{size:Letter;margin:0.7in}
html{background:#fff}
body{font:10.5pt/1.45 -apple-system,Helvetica,Arial,sans-serif;color:#0b0b0b;width:7.1in;margin:0 auto;padding:0}
h1{font-size:19pt;margin:0 0 .3em}
h2{font-size:14pt;margin:1.4em 0 .5em;border-bottom:1px solid #e4e3de}
h3{font-size:11.5pt;margin:1.2em 0 .4em}
table{border-collapse:collapse;margin:.3em 0 .9em;font-size:8.8pt;break-inside:avoid}
th,td{border:1px solid #c9c8c3;padding:.22em .45em;text-align:left;vertical-align:top}
th{background:#f1f0ec}
figure{margin:.8em 0 1em;break-inside:avoid}
figure img{max-width:100%;border:1px solid #e4e3de}
figcaption{font-size:9pt;color:#3a3936;margin-top:.35em}
p.caption{font-size:9pt;color:#3a3936;margin:.8em 0 .2em;break-after:avoid}
h2,h3{break-after:avoid}
"""

LOCATE = Path(__file__).with_name("locate.swift")
# Printed page geometry (Letter, 0.7 in margins): content runs from 0.7/11 to 10.3/11 of the height.
TOP, BOTTOM = 0.7 / 11, 10.3 / 11
# A section heading starts a new page unless about two thirds of the page is still free below it;
# a subsection heading moves on when less than 30% is free.
FREE_FOR_H2, FREE_FOR_H3 = 0.65, 0.30


def to_html(text: str) -> str:
    body = markdown.markdown(text, extensions=["tables", "sane_lists", "md_in_html", "fenced_code"])
    return (
        '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><title>Assignment 3 report</title>'
        f'<base href="{REPO.resolve().as_uri()}/"><style>{CSS}</style></head>'
        f"<body>\n{body}\n</body></html>\n"
    )


def missing_images(text: str) -> list[str]:
    paths = re.findall(r"!\[[^\]]*\]\(([^)\s]+)\)", text) + re.findall(r'<img src="([^"]+)"', text)
    return [p for p in paths if not (REPO / p).is_file()]


def headings(html: str) -> list[tuple[str, str]]:
    """(tag, text) of every h2 and h3, in order."""
    return [(t, re.sub(r"<[^>]+>", "", x)) for t, x in re.findall(r"<(h[23])>(.*?)</h[23]>", html)]


def with_breaks(html: str, breaks: set[str]) -> str:
    """Forces a page break before each heading whose text is in `breaks`."""
    for text in breaks:
        html = re.sub(rf"<(h[23])>({re.escape(text)})</h[23]>", r'<\1 style="break-before:page">\2</\1>', html)
    return html


def print_pdf(html: str) -> None:
    OUT_HTML.write_text(html, encoding="utf-8")
    subprocess.run(  # noqa: S603 - fixed argument list, no shell
        [CHROME, "--headless=new", "--disable-gpu", "--no-pdf-header-footer", f"--print-to-pdf={OUT_PDF}",
         OUT_HTML.resolve().as_uri()],
        check=True, capture_output=True, timeout=120,
    )  # fmt: skip


def locate(heads: list[tuple[str, str]]) -> list[tuple[int, float]] | None:
    """(page, top) of each heading in the printed PDF, or None when the locator cannot run."""
    needles = [text[:40] for _, text in heads]
    swift = shutil.which("swift")
    if swift is None:
        return None
    try:
        out = subprocess.run(  # noqa: S603 - fixed argument list, no shell
            [swift, str(LOCATE), str(OUT_PDF), *needles], check=True, capture_output=True, text=True, timeout=300
        ).stdout
    except (OSError, subprocess.SubprocessError):
        return None
    hits: dict[int, list[tuple[int, float]]] = {}
    for line in out.split():
        i, page, top = line.split("|")
        hits.setdefault(int(i), []).append((int(page), float(top)))
    found: list[tuple[int, float]] = []
    last = (0, 0.0)
    for i in range(len(heads)):
        later = sorted(h for h in hits.get(i, []) if h >= last)
        if not later:
            return None
        last = later[0]
        found.append(last)
    return found


def needs_break(tag: str, top: float, first: bool) -> bool:
    free = (BOTTOM - top) / (BOTTOM - TOP)
    at_top = top - TOP < 0.05
    if first or at_top:
        return False
    return free < (FREE_FOR_H2 if tag == "h2" else FREE_FOR_H3)


def paginate(html: str) -> str:
    """Prints, measures where headings landed, adds breaks for any too low on a page, and repeats."""
    heads = headings(html)
    breaks: set[str] = set()
    for _ in range(len(heads) + 1):  # each pass fixes the earliest offender, so this always converges
        current = with_breaks(html, breaks)
        print_pdf(current)
        where = locate(heads)
        if where is None:
            return current  # no locator available (not macOS): keep Chrome's own layout
        new = {text for (tag, text), (_, top), n in zip(heads, where, range(len(heads)), strict=True)
               if text not in breaks and needs_break(tag, top, n == 0)}  # fmt: skip
        if not new:
            return current
        breaks |= {min(new, key=lambda t: [h[1] for h in heads].index(t))}  # earliest first: later ones move
    return with_breaks(html, breaks)


def main() -> int:
    results = json.loads(RESULTS.read_text(encoding="utf-8"))
    text = fill(TEMPLATE.read_text(encoding="utf-8"), values(results))
    absent = missing_images(text)
    if absent:
        raise ReportError("missing images: " + ", ".join(absent))
    paginate(to_html(text))
    print(f"wrote {OUT_PDF}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
