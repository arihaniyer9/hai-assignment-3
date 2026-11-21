import math

import pandas as pd
import pytest

from a3 import metrics


def test_wilson_interval_contains_the_proportion_and_handles_empty():
    lo, hi = metrics.wilson(8, 10)
    assert lo < 0.8 < hi and 0 <= lo and hi <= 1
    assert all(math.isnan(x) for x in metrics.wilson(0, 0))


def test_paired_detects_a_consistent_improvement_and_ties():
    a = pd.Series([0.5, 0.6, 0.7, 0.6, 0.5, 0.55])
    b = a + 0.1
    t = metrics.paired(a, b)
    assert t.mean_diff == pytest.approx(0.1)
    assert t.rank_biserial == 1.0 and t.nonzero == 6
    # six identical differences are all tied, so the tie-corrected normal approximation is used
    assert t.wilcoxon_method == "normal approximation with tie correction" and t.wilcoxon_p < 0.05
    assert t.permutation_p == pytest.approx(2 / 64)
    same = metrics.paired(a, a)
    assert same.wilcoxon_p == 1.0 and same.nonzero == 0 and same.permutation_p == 1.0


def test_paired_effect_is_negative_when_b_is_lower():
    a = pd.Series([0.8, 0.9, 0.7, 0.85])
    t = metrics.paired(a, a - pd.Series([0.1, 0.2, 0.05, 0.1]))
    assert t.rank_biserial == -1.0 and t.mean_diff < 0


def test_mcnemar_counts_only_discordant_pairs():
    before = pd.Series([True, True, False, False, False, True])
    after = pd.Series([True, False, True, True, False, True])
    m = metrics.mcnemar(before, after)
    assert m == {"right_to_wrong": 1, "wrong_to_right": 2, "p": pytest.approx(1.0)}
    assert metrics.mcnemar(before, before)["p"] == 1.0


def trials(rows):
    cols = ["initial_answer", "ai_label", "final_answer", "label"]
    return pd.DataFrame(rows, columns=cols)


def test_reliance_matches_the_published_definitions():
    t = trials(
        [
            ("Real", "Satire", "Satire", "Satire"),  # wrong, AI right, switched -> RAIR hit
            ("Real", "Satire", "Real", "Satire"),  # wrong, AI right, stayed
            ("Satire", "Real", "Satire", "Satire"),  # right, AI wrong, kept -> RSR hit
            ("Satire", "Real", "Real", "Satire"),  # right, AI wrong, switched to wrong
            ("Real", "Real", "Real", "Real"),  # agree
        ]
    )
    r = metrics.reliance(t)
    assert r["initial_agreement"] == pytest.approx(0.2)
    assert r["agreement_fraction"] == pytest.approx(3 / 5)
    assert r["switch_fraction"] == pytest.approx(2 / 4)
    assert r["rair"] == 0.5 and r["opportunities_rair"] == 2
    assert r["rsr"] == 0.5 and r["opportunities_rsr"] == 2
    assert (r["switches_to_right"], r["switches_to_wrong"]) == (1, 1)


def test_reliance_is_undefined_without_opportunities():
    r = metrics.reliance(trials([("Real", "Real", "Real", "Real")]))
    assert math.isnan(r["switch_fraction"]) and math.isnan(r["rair"]) and math.isnan(r["rsr"])


def test_complementarity_partitions_the_trials():
    t = trials([("Real", "Real", "Real", "Real"), ("Real", "Satire", "Real", "Real"),
                ("Satire", "Real", "Real", "Real"), ("Satire", "Satire", "Satire", "Real")])  # fmt: skip
    assert metrics.complementarity(t) == {
        "both_right": 1,
        "human_only_right": 1,
        "ai_only_right": 1,
        "both_wrong": 1,
    }


def test_paired_treats_equal_accuracy_steps_as_ties_despite_floating_point():
    # 0.80 - 0.75 and 0.85 - 0.80 differ in the 17th digit in floating point; they must tie
    a = pd.Series([0.75, 0.80, 0.85, 0.65, 0.75, 1.00, 0.80, 0.60])
    b = pd.Series([0.80, 0.80, 0.80, 0.80, 0.85, 0.90, 0.65, 0.85])
    t = metrics.paired(a, b)
    ints = metrics.paired(a * 20, b * 20)  # the same comparison on counts out of 20
    assert (t.wilcoxon_stat, t.rank_biserial, t.wilcoxon_p) == pytest.approx(
        (ints.wilcoxon_stat, ints.rank_biserial, ints.wilcoxon_p)
    )
    assert t.wilcoxon_method == "normal approximation with tie correction"


def test_paired_uses_the_exact_distribution_without_ties():
    t = metrics.paired(pd.Series([1.0, 2.0, 3.0, 4.0]), pd.Series([1.5, 3.1, 4.7, 6.3]))
    assert t.wilcoxon_method == "exact" and t.wilcoxon_p == pytest.approx(0.125)


def test_cluster_bootstrap_ci_brackets_the_mean_and_is_reproducible():
    x = pd.Series([0.6, 0.7, 0.8, 0.9])
    lo, hi = metrics.cluster_bootstrap_ci(x, reps=2000)
    assert lo < x.mean() < hi
    assert metrics.cluster_bootstrap_ci(x, reps=2000) == (lo, hi)


def test_discrimination_splits_disagreements_by_ai_correctness_and_badge():
    rows = [
        # initial, ai, final, truth, ai_confident, initial_confidence
        ("Real", "Satire", "Satire", "Satire", True, 2),  # AI right, confident, person unsure -> switched
        ("Real", "Satire", "Real", "Satire", False, 4),  # AI right, kept
        ("Satire", "Real", "Satire", "Satire", True, 5),  # AI wrong, kept
        ("Satire", "Satire", "Satire", "Satire", False, 3),  # agreement: not a disagreement
    ]
    t = pd.DataFrame(rows, columns=["initial_answer", "ai_label", "final_answer", "label", "ai_confident",
                                    "initial_confidence"])  # fmt: skip
    d = metrics.discrimination(t)
    assert (d["switch_when_ai_right_k"], d["switch_when_ai_right_n"]) == (1, 2)
    assert (d["switch_when_ai_wrong_k"], d["switch_when_ai_wrong_n"]) == (0, 1)
    assert (d["switch_when_confident_and_unsure_k"], d["switch_when_confident_and_unsure_n"]) == (1, 1)
    assert d["ai_right_on_disagreements"] == pytest.approx(2 / 3)
    assert d["policy_always_keep"] == pytest.approx(0.5) and d["actual"] == pytest.approx(0.75)
    assert 0 <= d["fisher_ai_right_vs_wrong_p"] <= 1
