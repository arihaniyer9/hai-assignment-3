"""Copy the Assignment 2 model and study set into this repo, and write the parity file.

Run from the Assignment 2 folder with its virtual environment active (this needs the A2 Python
package, `satire`):

    PYTHONPATH=src python HAI-assignment-3/scripts/export_from_a2.py

It writes, into HAI-assignment-3/data/a2/:
- model.json: the calibrated v2 model, byte-for-byte the A2 file;
- study_items.json: the 240 study trials (no model outputs: the app computes them live);
- parity.json: the A2 Python predictor's probability and per-word contributions for every study
  headline plus edge cases, at full precision, so the TypeScript port can be tested against it;
- SOURCES.json: SHA-256 of every source file, so the copy can be traced to A2.
"""

import csv
import hashlib
import json
import sys
from pathlib import Path

from satire import config
from satire.model import contributions, from_json, probability_satire

EDGE_CASES = [
    "",
    "a",
    "Zebra",
    "Area Man Thrilled By Own Lamp",
    "A.I. Assures Everyone It Won't Exterminate Humanity",
    "Café Owner's Crème Brûlée Wins Ünïcode Award",
    "İstanbul Mayor Says ΣΊΣΥΦΟΣ Is Fine",
    "Ünlü Şef Ödül Aldı 2026",
    "lamp lamp lamp lamp",
    "new new york york",
    "snake_case and CamelCase 42 x1 1x",
    "‘Curly Quotes’ – “and” — Dashes…",
    "日本語のテキスト 東京",
    "emoji 🙂 test 🙂🙂",
]


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> int:
    out = config.ROOT / "HAI-assignment-3" / "data" / "a2"
    out.mkdir(parents=True, exist_ok=True)
    model_path = config.MODEL_DIR / "model_calibrated.json"
    study_path = config.STUDY_SET_PATH
    model = from_json(model_path.read_text(encoding="utf-8"))

    (out / "model.json").write_bytes(model_path.read_bytes())
    with study_path.open(encoding="utf-8", newline="") as handle:
        rows = list(csv.DictReader(handle))
    items = [
        {k: r[k] for k in ("id", "headline", "label", "type", "topic", "source")} for r in rows
    ]
    (out / "study_items.json").write_text(json.dumps(items, indent=1) + "\n", encoding="utf-8")

    cases = []
    for text in [r["headline"] for r in rows] + EDGE_CASES:
        cases.append(
            {
                "text": text,
                "probability_satire": probability_satire(model, text),
                "contributions": [
                    {"text": c.text, "start": c.start, "end": c.end, "value": c.value}
                    for c in contributions(model, text)
                ],
            }
        )
    (out / "parity.json").write_text(json.dumps(cases, ensure_ascii=False) + "\n", encoding="utf-8")
    sources = {
        "model_calibrated.json": sha256(model_path),
        "study_set.csv": sha256(study_path),
        "confident_threshold": config.CONFIDENT_THRESHOLD,
    }
    (out / "SOURCES.json").write_text(json.dumps(sources, indent=1) + "\n", encoding="utf-8")
    print(f"wrote {len(items)} items and {len(cases)} parity cases to {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
