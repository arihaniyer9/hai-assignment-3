"""Load the exported study data and decide who is in each analysis sample.

Inputs are the two admin exports (data/collected/trials.csv and sessions.csv) and the A2 item file
(data/a2/item_analysis.json). Every rule that drops data is a named constant here, so the report
can state it and the sensitivity analyses can switch it off.
"""

import json
from dataclasses import dataclass
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[3]
TRIALS = ROOT / "data" / "collected" / "trials.csv"
SESSIONS = ROOT / "data" / "collected" / "sessions.csv"
ITEMS = ROOT / "data" / "a2" / "item_analysis.json"
A2_PILOT_ITEMS = ROOT / "data" / "a2" / "a2_pilot_items.json"
CLASS_FEEDBACK = ROOT / "data" / "collected" / "class_feedback.csv"

# Codes in data/collected/ are pseudonyms (a3.pseudonymize). R1 is the researcher's own test run on
# the live site before any participant (2026-11-05/06).
RESEARCHER_CODES = frozenset({"R1"})
# P2 also rated 40 study headlines in the A2 pilot (2026-10-09), so had seen some before.
PRIOR_EXPOSURE_CODES = frozenset({"P2"})
CONDITIONS = ("baseline", "assisted")


@dataclass(frozen=True)
class Sample:
    name: str
    description: str
    trials: pd.DataFrame  # study trials only (no attention check), one row per trial


def load(trials_path: Path = TRIALS, sessions_path: Path = SESSIONS) -> tuple[pd.DataFrame, pd.DataFrame]:
    trials = pd.read_csv(trials_path, dtype={"code": str})
    sessions = pd.read_csv(sessions_path, dtype={"code": str})
    return trials, sessions


def valid_codes(sessions: pd.DataFrame) -> list[str]:
    """Codes that completed both conditions and passed the attention check in both."""
    done = sessions[sessions["completed_at"].notna() & sessions["terminated_at"].isna()]
    ok = done[done["catch_passed"] == True]  # noqa: E712 (pandas boolean column)
    per = ok.groupby("code")["condition"].nunique()
    return sorted(per[per == len(CONDITIONS)].index)


def study_trials(trials: pd.DataFrame, codes: list[str]) -> pd.DataFrame:
    """Completed study trials (attention check removed) of the given codes, with tidy columns."""
    t = trials[trials["code"].isin(codes) & trials["session_completed"] & ~trials["is_catch"]].copy()
    t["correct"] = t["scored_correct"].astype(bool)
    t["ai_shown"] = t["condition"] == "assisted"
    return t.reset_index(drop=True)


def samples(trials: pd.DataFrame, sessions: pd.DataFrame, pilot_items: set[str]) -> list[Sample]:
    """The primary sample and the sensitivity samples, in report order."""
    valid = valid_codes(sessions)
    version = sessions.drop_duplicates("code").set_index("code")["app_version"].astype(str)
    primary = [c for c in valid if c not in RESEARCHER_CODES]
    class_only = [c for c in primary if version.get(c) == "2"]
    t_primary = study_trials(trials, primary)
    exposed = t_primary["code"].isin(PRIOR_EXPOSURE_CODES) & t_primary["item_id"].isin(pilot_items)
    return [
        Sample("primary", "All valid participants except the researcher's own test", t_primary),
        Sample(
            "class_only",
            "Only the in-class session (interface version 2)",
            study_trials(trials, class_only),
        ),
        Sample(
            "no_prior_exposure",
            "Primary, without headlines a participant had already seen in the A2 pilot",
            t_primary[~exposed].reset_index(drop=True),
        ),
        Sample("with_researcher", "Primary plus the researcher's test run", study_trials(trials, valid)),
    ]


def participant_ids(sessions: pd.DataFrame, codes: list[str]) -> dict[str, str]:
    """Anonymous IDs P1, P2, ... for the report, numbered by each person's first session time."""
    first = sessions[sessions["code"].isin(codes)].groupby("code")["consented_at"].min().sort_values()
    return {code: f"P{i}" for i, code in enumerate(first.index, 1)}


def load_class_feedback(path: Path = CLASS_FEEDBACK) -> pd.DataFrame:
    """Comments from the class spreadsheet (names removed; `code` only where it equals a session code)."""
    return pd.read_csv(path, dtype={"code": str}, keep_default_na=False)


def load_items(path: Path = ITEMS) -> dict[str, dict[str, object]]:
    return dict(json.loads(path.read_text(encoding="utf-8")))


def load_pilot_items(path: Path = A2_PILOT_ITEMS) -> set[str]:
    return set(json.loads(path.read_text(encoding="utf-8")))
