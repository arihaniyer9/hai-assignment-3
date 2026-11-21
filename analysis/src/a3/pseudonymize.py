"""Replace participant-chosen codes with P1, P2, ... before any data file is shared.

Some participants used their uniqname as their code, so the raw admin exports identify them. This
reads the raw files in data/private/ (never committed), writes the shareable copies to
data/collected/ and keeps the key in data/private/code_key.csv. Participants are numbered by
their first session time; the researcher's own test run becomes R1.

    PYTHONPATH=src .venv/bin/python -m a3.pseudonymize
"""

from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[3]
PRIVATE = ROOT / "data" / "private"
PUBLIC = ROOT / "data" / "collected"
RESEARCHER_RAW = frozenset({"otter-92"})


def key(sessions: pd.DataFrame) -> dict[str, str]:
    """code -> pseudonym: R1, R2, ... for the researcher, P1, P2, ... by first session time otherwise."""
    first = sessions.groupby("code")["consented_at"].min().sort_values()
    out: dict[str, str] = {}
    p = r = 0
    for code in first.index:
        if code in RESEARCHER_RAW:
            r += 1
            out[code] = f"R{r}"
        else:
            p += 1
            out[code] = f"P{p}"
    return out


def session_labels(sessions: pd.DataFrame, mapping: dict[str, str]) -> dict[str, str]:
    """session id -> "P3-assisted" (with "-2", "-3" for repeat attempts), so real ids are never shared."""
    labels: dict[str, str] = {}
    counts: dict[str, int] = {}
    for row in sessions.sort_values(["consented_at", "session_id"]).itertuples():
        base = f"{mapping[row.code]}-{row.condition}"
        counts[base] = counts.get(base, 0) + 1
        labels[row.session_id] = base if counts[base] == 1 else f"{base}-{counts[base]}"
    return labels


def apply(frame: pd.DataFrame, mapping: dict[str, str], sessions: dict[str, str] | None = None) -> pd.DataFrame:
    """A copy with `code` (and `session_id`) replaced; anything missing from the key is an error."""
    codes = frame["code"].fillna("")
    unknown = sorted(set(codes) - set(mapping) - {""})
    if unknown:
        raise ValueError(f"codes without a pseudonym: {unknown}")
    out = frame.assign(code=codes.map(lambda c: mapping.get(c, "")))
    if sessions is not None and "session_id" in out:
        missing = sorted(set(out["session_id"]) - set(sessions))
        if missing:
            raise ValueError(f"sessions without a label: {missing}")
        out = out.assign(session_id=out["session_id"].map(sessions))
    return out


def main() -> int:
    sessions = pd.read_csv(PRIVATE / "sessions_raw.csv", dtype={"code": str})
    trials = pd.read_csv(PRIVATE / "trials_raw.csv", dtype={"code": str})
    feedback = pd.read_csv(PRIVATE / "class_feedback_raw.csv", dtype={"code": str}, keep_default_na=False)
    mapping = key(sessions)
    labels = session_labels(sessions, mapping)
    PUBLIC.mkdir(parents=True, exist_ok=True)
    apply(sessions, mapping, labels).to_csv(PUBLIC / "sessions.csv", index=False)
    apply(trials, mapping, labels).to_csv(PUBLIC / "trials.csv", index=False)
    apply(feedback, mapping).to_csv(PUBLIC / "class_feedback.csv", index=False)
    pd.DataFrame(sorted(mapping.items(), key=lambda kv: kv[1]), columns=["code", "pseudonym"]).to_csv(
        PRIVATE / "code_key.csv", index=False
    )
    print(f"wrote pseudonymized files for {len(mapping)} codes to {PUBLIC}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
