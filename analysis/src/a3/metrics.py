"""The measures and tests. Pure functions over the tidy trial table from a3.data.

Unit of analysis: the participant. Each person's accuracy (or median time, or mean confidence) is
computed per condition, and conditions are compared within person with paired tests, because every
participant did both conditions on different headlines.
"""

import itertools
import math
from dataclasses import dataclass

import numpy as np
import pandas as pd
from scipy import stats


def wilson(k: int, n: int, z: float = 1.959964) -> tuple[float, float]:
    """95% Wilson score interval for a proportion k/n."""
    if n == 0:
        return (float("nan"), float("nan"))
    p = k / n
    centre = (p + z * z / (2 * n)) / (1 + z * z / n)
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / (1 + z * z / n)
    return (centre - half, centre + half)


@dataclass(frozen=True)
class PairedTest:
    n: int
    mean_a: float
    mean_b: float
    mean_diff: float  # b - a
    wilcoxon_stat: float
    wilcoxon_p: float
    nonzero: int  # pairs that differ (Wilcoxon drops ties)
    rank_biserial: float  # effect size in [-1, 1]; positive means b > a
    permutation_p: float  # exact sign-flip test on the mean difference
    wilcoxon_method: str  # "exact" (no tied |differences|) or "normal approximation with tie correction"


def paired(a: pd.Series, b: pd.Series) -> PairedTest:
    """Wilcoxon signed-rank and an exact sign-flip permutation test.

    a and b are aligned per participant. Differences are rounded to 9 decimals first: accuracies are
    multiples of 1/20, and in floating point 0.80 - 0.75 and 0.85 - 0.80 differ in the 17th digit,
    which would split true ties into different ranks. Zero differences are dropped by the Wilcoxon
    test, as is standard; the permutation test keeps them. The exact Wilcoxon distribution is used
    only when no two |differences| are tied; otherwise the normal approximation with tie correction.
    """
    d = np.round((b - a).to_numpy(dtype=float), 9)
    nz = d[d != 0]
    method = "exact"
    if len(nz) == 0:
        w_stat, w_p, rb = 0.0, 1.0, 0.0
    else:
        tied = len(np.unique(np.abs(nz))) < len(nz)
        method = "normal approximation with tie correction" if tied else "exact"
        res = stats.wilcoxon(nz, zero_method="wilcox", method="approx" if tied else "exact", correction=False)
        w_stat, w_p = float(res.statistic), float(res.pvalue)
        ranks = stats.rankdata(np.abs(nz))
        rb = float((ranks[nz > 0].sum() - ranks[nz < 0].sum()) / ranks.sum())
        # W is reported as the smaller signed-rank sum, the textbook convention
        w_stat = float(min(ranks[nz > 0].sum(), ranks[nz < 0].sum()))
    observed = abs(d.mean())
    flips = [abs(np.mean(d * np.array(s))) for s in itertools.product([1, -1], repeat=len(d))]
    perm_p = float(np.mean([f >= observed - 1e-12 for f in flips]))
    return PairedTest(
        n=len(d),
        mean_a=float(a.mean()),
        mean_b=float(b.mean()),
        mean_diff=float(d.mean()),
        wilcoxon_stat=w_stat,
        wilcoxon_p=w_p,
        nonzero=int(len(nz)),
        rank_biserial=rb,
        permutation_p=perm_p,
        wilcoxon_method=method,
    )


def cluster_bootstrap_ci(per_person: pd.Series, reps: int = 10_000, seed: int = 20261122) -> tuple[float, float]:
    """95% percentile interval for the mean of per-participant values, resampling participants."""
    values = per_person.to_numpy(dtype=float)
    rng = np.random.default_rng(seed)
    means = rng.choice(values, size=(reps, len(values)), replace=True).mean(axis=1)
    return (float(np.percentile(means, 2.5)), float(np.percentile(means, 97.5)))


def discrimination(ai_trials: pd.DataFrame, unsure_max: int = 2) -> dict[str, float | int]:
    """Could people tell which disagreements to accept? Disagreement trials only.

    Splits the trials where the person's own answer differed from the AI's by whether the AI was
    right, by the AI's Confident badge, and by the person's own confidence (<= unsure_max = unsure).
    """
    a = ai_trials
    dis = a[a["initial_answer"] != a["ai_label"]]
    ai_right = dis["ai_label"] == dis["label"]
    switched = dis["final_answer"] != dis["initial_answer"]
    confident = dis["ai_confident"].astype(bool)
    unsure = dis["initial_confidence"] <= unsure_max

    def rate(mask: pd.Series) -> tuple[int, int, float]:
        n = int(mask.sum())
        k = int((switched & mask).sum())
        return k, n, (k / n if n else float("nan"))

    def acc(mask: pd.Series) -> tuple[int, int, float]:
        n = int(mask.sum())
        k = int((ai_right & mask).sum())
        return k, n, (k / n if n else float("nan"))

    every = pd.Series(True, index=dis.index)
    out: dict[str, float | int] = {}
    for name, (k, n, r) in {
        "switch_when_ai_right": rate(ai_right),
        "switch_when_ai_wrong": rate(~ai_right),
        "switch_when_ai_confident": rate(confident),
        "switch_when_ai_not_confident": rate(~confident),
        "switch_when_confident_and_unsure": rate(confident & unsure),
        "switch_when_person_unsure": rate(unsure),
        "switch_when_person_sure": rate(~unsure),
        "ai_right_on_disagreements": acc(every),
        "ai_right_on_disagreements_confident": acc(confident),
        "ai_right_on_disagreements_not_confident": acc(~confident),
    }.items():
        out[f"{name}_k"], out[f"{name}_n"], out[name] = k, n, r
    # Fisher's exact test: did people switch more often when the AI was right than when it was wrong?
    sr, sw = int((switched & ai_right).sum()), int((switched & ~ai_right).sum())
    table = [[sr, int(ai_right.sum()) - sr], [sw, int((~ai_right).sum()) - sw]]
    out["fisher_ai_right_vs_wrong_p"] = float(stats.fisher_exact(table)[1]) if len(dis) else float("nan")
    # The AI's accuracy with and without its badge, on every AI-part trial (not only disagreements)
    c_all = a["ai_confident"].astype(bool)
    right_all = a["ai_label"] == a["label"]
    out["ai_acc_confident_k"], out["ai_acc_confident_n"] = int((right_all & c_all).sum()), int(c_all.sum())
    out["ai_acc_not_confident_k"], out["ai_acc_not_confident_n"] = int((right_all & ~c_all).sum()), int((~c_all).sum())
    out["ai_acc_confident"] = out["ai_acc_confident_k"] / max(1, out["ai_acc_confident_n"])
    out["ai_acc_not_confident"] = out["ai_acc_not_confident_k"] / max(1, out["ai_acc_not_confident_n"])
    # Accuracy of simple policies on the AI-part trials, for comparison with what people did
    out["policy_always_keep"] = float((a["initial_answer"] == a["label"]).mean())
    out["policy_always_ai"] = float(right_all.mean())
    out["policy_ai_when_confident"] = float(
        np.where(c_all, a["ai_label"], a["initial_answer"]).__eq__(a["label"].to_numpy()).mean()
    )
    out["actual"] = float((a["final_answer"] == a["label"]).mean())
    return out


def mcnemar(before: pd.Series, after: pd.Series) -> dict[str, float]:
    """Exact McNemar test on paired correctness (e.g. the answer before vs after seeing the AI)."""
    b = int((before & ~after).sum())  # right -> wrong
    c = int((~before & after).sum())  # wrong -> right
    p = 1.0 if b + c == 0 else float(stats.binomtest(c, b + c, 0.5).pvalue)
    return {"right_to_wrong": b, "wrong_to_right": c, "p": p}


def per_participant(t: pd.DataFrame) -> pd.DataFrame:
    """One row per participant with every per-condition summary used in the report."""
    rows = []
    for code, g in t.groupby("code"):
        base = g[g["condition"] == "baseline"]
        ai = g[g["condition"] == "assisted"]
        first = base["session_order"].iloc[0] == 1
        rows.append(
            {
                "code": code,
                "first_condition": "baseline" if first else "assisted",
                "app_version": str(g["app_version"].iloc[0]),
                "n_baseline": len(base),
                "n_assisted": len(ai),
                "acc_baseline": base["correct"].mean(),
                "acc_assisted_initial": ai["initial_correct"].astype(bool).mean(),
                "acc_assisted_final": ai["correct"].mean(),
                "ai_acc_assisted_items": ai["ai_correct"].astype(bool).mean(),
                "conf_baseline": base["initial_confidence"].mean(),
                "conf_assisted_initial": ai["initial_confidence"].mean(),
                "conf_assisted_final": ai["final_confidence"].mean(),
                "time_baseline_s": base["initial_time_ms"].median() / 1000,
                "time_assisted_s": (ai["initial_time_ms"] + ai["final_time_ms"]).median() / 1000,
                "time_assisted_initial_s": ai["initial_time_ms"].median() / 1000,
                "switches": int(ai["switched"].astype(bool).sum()),
                # wrong in the AI part although the AI was right and the person did not switch (under-reliance)
                "errors_ai_right_kept": int(
                    (~ai["correct"] & ai["ai_correct"].astype(bool) & ~ai["switched"].astype(bool)).sum()
                ),
                # wrong in the AI part because the person switched to a wrong AI answer (over-reliance)
                "errors_switched_to_ai": int((~ai["correct"] & ai["switched"].astype(bool)).sum()),
                "revisions": int(g["initial_revisions"].fillna(0).sum() + g["final_revisions"].fillna(0).sum()),
                "correct_baseline": int(base["correct"].sum()),
                "correct_assisted_initial": int(ai["initial_correct"].astype(bool).sum()),
                "correct_assisted_final": int(ai["correct"].sum()),
                "correct_ai_assisted_items": int(ai["ai_correct"].astype(bool).sum()),
            }
        )
    return pd.DataFrame(rows).sort_values("code").reset_index(drop=True)


def reliance(ai_trials: pd.DataFrame) -> dict[str, float | int]:
    """Reliance on the AI in the assisted condition.

    agreement_fraction and switch_fraction follow Yin et al. (2019); RAIR and RSR follow Schemmer
    et al. (2023): RAIR = share of cases where the person was wrong, the AI right, and the person
    switched to the AI; RSR = share of cases where the person was right, the AI wrong, and the
    person kept their answer.
    """
    a = ai_trials
    init = a["initial_answer"]
    final = a["final_answer"]
    ai = a["ai_label"]
    truth = a["label"]
    disagree = init != ai
    human_wrong_ai_right = (init != truth) & (ai == truth)
    human_right_ai_wrong = (init == truth) & (ai != truth)
    switched = final != init
    return {
        "trials": int(len(a)),
        "initial_agreement": float((init == ai).mean()),
        "agreement_fraction": float((final == ai).mean()),
        "disagreements": int(disagree.sum()),
        "switch_fraction": float((disagree & (final == ai)).sum() / disagree.sum()) if disagree.any() else float("nan"),
        "switches": int(switched.sum()),
        "switches_to_right": int((switched & (final == truth)).sum()),
        "switches_to_wrong": int((switched & (final != truth)).sum()),
        "opportunities_rair": int(human_wrong_ai_right.sum()),
        "rair": float((human_wrong_ai_right & (final == ai)).sum() / human_wrong_ai_right.sum())
        if human_wrong_ai_right.any()
        else float("nan"),
        "opportunities_rsr": int(human_right_ai_wrong.sum()),
        "rsr": float((human_right_ai_wrong & (final == init)).sum() / human_right_ai_wrong.sum())
        if human_right_ai_wrong.any()
        else float("nan"),
    }


def complementarity(ai_trials: pd.DataFrame) -> dict[str, int]:
    """2x2 of the person's own (pre-AI) answer and the AI's, on the assisted trials."""
    h = ai_trials["initial_answer"] == ai_trials["label"]
    m = ai_trials["ai_label"] == ai_trials["label"]
    return {
        "both_right": int((h & m).sum()),
        "human_only_right": int((h & ~m).sum()),
        "ai_only_right": int((~h & m).sum()),
        "both_wrong": int((~h & ~m).sum()),
    }


def accuracy_table(t: pd.DataFrame, by: str) -> pd.DataFrame:
    """Trial-level accuracy by a grouping column for: people alone, people with the AI, the AI."""
    base = t[t["condition"] == "baseline"]
    ai = t[t["condition"] == "assisted"]
    groups = sorted(set(t[by].dropna()))
    rows = []
    for gname in groups:
        b = base[base[by] == gname]
        a = ai[ai[by] == gname]
        rows.append(
            {
                by: gname,
                "n_baseline": len(b),
                "human_alone": b["correct"].mean() if len(b) else float("nan"),
                "n_assisted": len(a),
                "human_before_ai": a["initial_correct"].astype(bool).mean() if len(a) else float("nan"),
                "human_with_ai": a["correct"].mean() if len(a) else float("nan"),
                "ai": a["ai_correct"].astype(bool).mean() if len(a) else float("nan"),
            }
        )
    return pd.DataFrame(rows)


def calibration(t: pd.DataFrame) -> pd.DataFrame:
    """Accuracy at each confidence level, for the answer that counts in each condition."""
    t = t.copy()
    t["conf"] = np.where(t["condition"] == "assisted", t["final_confidence"], t["initial_confidence"])
    out = t.groupby(["condition", "conf"]).agg(n=("correct", "size"), accuracy=("correct", "mean")).reset_index()
    return out


def leave_one_out(pp: pd.DataFrame, a: str, b: str) -> pd.DataFrame:
    """The mean paired difference (b - a) with each participant left out, to spot outliers."""
    rows = []
    for code in pp["code"]:
        rest = pp[pp["code"] != code]
        rows.append({"left_out": code, "mean_diff": float((rest[b] - rest[a]).mean())})
    return pd.DataFrame(rows)
