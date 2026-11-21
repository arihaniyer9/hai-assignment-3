"""Run every analysis and write analysis/results/: results.json, tables/*.md and figures/*.png.

    analysis/.venv/bin/python -m a3.analyze      (from analysis/, with PYTHONPATH=src)

Everything quoted in the report comes from results.json, so the text cannot drift from the code.
"""

import json
import math
import warnings
from pathlib import Path
from typing import Any

import pandas as pd
import statsmodels.api as sm
import statsmodels.formula.api as smf

from a3 import data, figures, metrics

OUT = Path(__file__).resolve().parents[2] / "results"
A2_AI_ACCURACY = 0.6333333333333333  # A2 results/metrics.json, the deployed v2 model on all 240 items


def _clean(x: Any) -> Any:
    """JSON-safe values: NaN becomes None, numpy scalars become Python numbers."""
    if isinstance(x, dict):
        return {k: _clean(v) for k, v in x.items()}
    if isinstance(x, list | tuple):
        return [_clean(v) for v in x]
    if hasattr(x, "item"):
        x = x.item()
    if isinstance(x, float) and math.isnan(x):
        return None
    return x


def gee(t: pd.DataFrame) -> dict[str, float]:
    """Trial-level logistic GEE: correct ~ AI shown + session order, clustered by participant.

    A check on the participant-level tests that uses every trial; with few clusters its standard
    errors are optimistic, so it is reported as secondary.
    """
    d = t.assign(
        correct=t["correct"].astype(int),
        ai=t["ai_shown"].astype(int),
        second=(t["session_order"] == 2).astype(int),
    )
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        fit = smf.gee(
            "correct ~ ai + second", groups="code", data=d, family=sm.families.Binomial(),
            cov_struct=sm.cov_struct.Exchangeable(),
        ).fit()  # fmt: skip
    ci = fit.conf_int()
    return {
        "odds_ratio_ai": float(math.exp(fit.params["ai"])),
        "ci_low_ai": float(math.exp(ci.loc["ai", 0])),
        "ci_high_ai": float(math.exp(ci.loc["ai", 1])),
        "p_ai": float(fit.pvalues["ai"]),
        "odds_ratio_second": float(math.exp(fit.params["second"])),
        "p_second": float(fit.pvalues["second"]),
    }


def error_patterns(t: pd.DataFrame, items: dict[str, dict[str, Any]]) -> pd.DataFrame:
    """For each A2 error pattern (items the AI gets wrong), how people did without and with the AI."""
    t = t.assign(pattern=t["item_id"].map(lambda i: items[i]["a2_error_category"] or "AI right in A2"))
    return metrics.accuracy_table(t, "pattern")


def political(ai_trials: pd.DataFrame) -> dict[str, int]:
    """How the AI labelled headlines naming Trump, a participant's complaint checked against the log."""
    named = ai_trials["headline"].str.contains("Trump")
    return {
        "headlines": int(named.sum()),
        "ai_said_satire": int((named & (ai_trials["ai_label"] == "Satire")).sum()),
        "truly_satire": int((named & (ai_trials["label"] == "Satire")).sum()),
    }


def durations(sessions: pd.DataFrame, codes: list[str]) -> dict[str, dict[str, float]]:
    """Minutes from consent to completion per condition (median, min, max) for the given codes."""
    s = sessions[sessions["code"].isin(codes) & sessions["completed_at"].notna()].copy()
    minutes = (pd.to_datetime(s["completed_at"]) - pd.to_datetime(s["consented_at"])).dt.total_seconds() / 60
    s = s.assign(minutes=minutes)
    out = {}
    for c, g in s.groupby("condition"):
        out[str(c)] = {"median": float(g["minutes"].median()), "min": float(g["minutes"].min()),
                       "max": float(g["minutes"].max())}  # fmt: skip
    both = s.groupby("code")["minutes"].sum()
    out["both"] = {"median": float(both.median()), "min": float(both.min()), "max": float(both.max())}
    return out


def analyse(sample: data.Sample, items: dict[str, dict[str, Any]], sessions_frame: pd.DataFrame) -> dict[str, Any]:
    t = sample.trials
    pp = metrics.per_participant(t)
    ai_trials = t[t["condition"] == "assisted"]
    base = t[t["condition"] == "baseline"]
    pooled = {
        "human_alone": (int(base["correct"].sum()), len(base)),
        "human_before_ai": (int(ai_trials["initial_correct"].astype(bool).sum()), len(ai_trials)),
        "human_with_ai": (int(ai_trials["correct"].sum()), len(ai_trials)),
        "ai_on_assisted_items": (int(ai_trials["ai_correct"].astype(bool).sum()), len(ai_trials)),
    }
    out: dict[str, Any] = {
        "name": sample.name,
        "description": sample.description,
        "participants": len(pp),
        "trials": len(t),
        "per_participant": pp.to_dict(orient="records"),
        "pooled": {
            k: {"correct": c, "n": n, "accuracy": c / n, "ci": metrics.wilson(c, n)} for k, (c, n) in pooled.items()
        },
        # mean of per-participant accuracies, with a 95% interval from resampling participants
        "per_person_ci": {
            "human_alone": metrics.cluster_bootstrap_ci(pp["acc_baseline"]),
            "human_before_ai": metrics.cluster_bootstrap_ci(pp["acc_assisted_initial"]),
            "human_with_ai": metrics.cluster_bootstrap_ci(pp["acc_assisted_final"]),
            "ai_on_assisted_items": metrics.cluster_bootstrap_ci(pp["ai_acc_assisted_items"]),
            "difference_with_minus_alone": metrics.cluster_bootstrap_ci(pp["acc_assisted_final"] - pp["acc_baseline"]),
        },
        "discrimination": metrics.discrimination(ai_trials),
        "durations": durations(sessions_frame, list(pp["code"])),
        "tests": {
            "human_alone_vs_with_ai": metrics.paired(pp["acc_baseline"], pp["acc_assisted_final"]).__dict__,
            "before_vs_after_ai": metrics.paired(pp["acc_assisted_initial"], pp["acc_assisted_final"]).__dict__,
            "ai_vs_with_ai": metrics.paired(pp["ai_acc_assisted_items"], pp["acc_assisted_final"]).__dict__,
            "confidence": metrics.paired(pp["conf_baseline"], pp["conf_assisted_final"]).__dict__,
            "time": metrics.paired(pp["time_baseline_s"], pp["time_assisted_s"]).__dict__,
            "time_first_answer": metrics.paired(pp["time_baseline_s"], pp["time_assisted_initial_s"]).__dict__,
        },
        "mcnemar_before_after": metrics.mcnemar(
            ai_trials["initial_correct"].astype(bool), ai_trials["final_correct"].astype(bool)
        ),
        "reliance": metrics.reliance(ai_trials),
        "complementarity": metrics.complementarity(ai_trials),
        "by_type": metrics.accuracy_table(t, "item_type").to_dict(orient="records"),
        "by_pattern": error_patterns(t, items).to_dict(orient="records"),
        "calibration": metrics.calibration(t).to_dict(orient="records"),
        "political": political(ai_trials),
        "leave_one_out": metrics.leave_one_out(pp, "acc_baseline", "acc_assisted_final").to_dict(orient="records"),
    }
    try:
        out["gee"] = gee(t)
    except Exception as error:  # noqa: BLE001 - a failed secondary model is reported, not fatal
        out["gee"] = {"error": str(error)}
    return out


def consistency(t: pd.DataFrame, items: dict[str, dict[str, Any]]) -> dict[str, int]:
    """The AI logged in A3 must agree with the A2 model on every assisted trial."""
    a = t[t["condition"] == "assisted"]
    agree = sum(bool(r.ai_correct) == bool(items[r.item_id]["a2_model_correct"]) for r in a.itertuples())
    return {"assisted_trials": len(a), "ai_matches_a2": agree}


def main() -> int:
    trials, sessions = data.load()
    items = data.load_items()
    pilot = data.load_pilot_items()
    samples = data.samples(trials, sessions, pilot)
    results = {
        "a2_ai_accuracy_all_240": A2_AI_ACCURACY,
        "sessions_total": int(len(sessions)),
        "sessions_stopped_at_check": int(sessions["terminated_at"].notna().sum()),
        "valid_codes": data.valid_codes(sessions),
        "researcher_codes": sorted(data.RESEARCHER_CODES),
        "consistency": consistency(samples[0].trials, items),
        "samples": {s.name: analyse(s, items, sessions) for s in samples},
        "comments": sessions[sessions["comment"].notna() & ~sessions["code"].isin(data.RESEARCHER_CODES)][
            ["code", "condition", "comment"]
        ].to_dict(orient="records"),
        "participant_ids": data.participant_ids(
            sessions, [c for c in data.valid_codes(sessions) if c not in data.RESEARCHER_CODES]
        ),
        "class_feedback": data.load_class_feedback().to_dict(orient="records"),
    }
    OUT.mkdir(exist_ok=True)
    (OUT / "results.json").write_text(json.dumps(_clean(results), indent=2, sort_keys=True) + "\n", encoding="utf-8")
    figures.make_all(results["samples"]["primary"], OUT / "figures")
    print(f"wrote {OUT / 'results.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
