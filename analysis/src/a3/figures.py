"""Report figures, in the A2 palette: blue = with the AI, orange = on their own, grey = the AI."""

from pathlib import Path
from typing import Any

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

SURFACE = "#fcfcfb"
INK = "#0b0b0b"
INK2 = "#52514e"
GRID = "#e4e3de"
WITH_AI = "#2a78d6"
ALONE = "#eb6834"
AI = "#8a8985"


def _style(ax: Any) -> None:
    ax.set_facecolor(SURFACE)
    for side in ("top", "right"):
        ax.spines[side].set_visible(False)
    for side in ("left", "bottom"):
        ax.spines[side].set_color(INK2)
    ax.tick_params(colors=INK2, labelsize=8)
    ax.grid(axis="y", color=GRID, linewidth=0.6)
    ax.set_axisbelow(True)


def paired_accuracy(sample: dict[str, Any], path: Path) -> None:
    """Each participant's accuracy on their own and with the AI, joined by a line."""
    pp = sample["per_participant"]
    fig, ax = plt.subplots(figsize=(6.4, 3.8), facecolor=SURFACE)
    _style(ax)
    # Several people share a score, so each person gets a small fixed horizontal offset (no randomness)
    offsets = [(i - (len(pp) - 1) / 2) * 0.035 for i in range(len(pp))]
    for p, dx in zip(pp, offsets, strict=True):
        ax.plot([dx, 1 + dx], [p["acc_baseline"], p["acc_assisted_final"]], color=GRID, linewidth=1.5, zorder=1)
    ax.scatter(offsets, [p["acc_baseline"] for p in pp], s=60, color=ALONE, edgecolor=SURFACE, zorder=3,
               label="On their own")  # fmt: skip
    ax.scatter([1 + dx for dx in offsets], [p["acc_assisted_final"] for p in pp], s=60, color=WITH_AI,
               edgecolor=SURFACE, zorder=3, label="With the AI (final answer)")  # fmt: skip
    ai = sample["pooled"]["ai_on_assisted_items"]["accuracy"]
    ax.axhline(ai, color=AI, linestyle=(0, (4, 3)), linewidth=1)
    ax.text(1.32, ai + 0.008, f"AI alone {ai:.0%}", va="bottom", fontsize=8, color=INK2)
    ax.set_xticks([0, 1], ["On their own", "With the AI"], color=INK)
    ax.set_xlim(-0.4, 1.7)
    ax.set_ylim(0.4, 1.02)
    ax.yaxis.set_major_formatter(matplotlib.ticker.PercentFormatter(1.0))
    ax.set_ylabel("accuracy (20 headlines each)", color=INK2, fontsize=9)
    ax.legend(frameon=False, fontsize=8, loc="lower right", labelcolor=INK2)
    fig.tight_layout()
    path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(path, dpi=200, facecolor=SURFACE, metadata={"Software": None})
    plt.close(fig)


def by_type(sample: dict[str, Any], path: Path) -> None:
    """Accuracy by headline type: people alone, people with the AI, and the AI."""
    rows = sample["by_type"]
    order = ["obvious_satire", "subtle_satire", "real_absurd", "plain_real"]
    rows = sorted(rows, key=lambda r: order.index(r["item_type"]))
    fig, ax = plt.subplots(figsize=(6.4, 3.6), facecolor=SURFACE)
    _style(ax)
    width = 0.26
    for i, (key, colour, label) in enumerate(
        [
            ("human_alone", ALONE, "On their own"),
            ("human_with_ai", WITH_AI, "With the AI"),
            ("ai", AI, "AI alone"),
        ]
    ):
        xs = [j + (i - 1) * width for j in range(len(rows))]
        ax.bar(xs, [r[key] for r in rows], width=width - 0.03, color=colour, label=label)
    ax.set_xticks(range(len(rows)), [r["item_type"].replace("_", " ") for r in rows], color=INK, fontsize=8)
    ax.set_ylim(0, 1.05)
    ax.yaxis.set_major_formatter(matplotlib.ticker.PercentFormatter(1.0))
    ax.set_ylabel("accuracy", color=INK2, fontsize=9)
    ax.legend(
        frameon=False,
        fontsize=8,
        ncols=3,
        loc="upper center",
        bbox_to_anchor=(0.5, 1.13),
        labelcolor=INK2,
    )
    fig.tight_layout()
    fig.savefig(path, dpi=200, facecolor=SURFACE, metadata={"Software": None})
    plt.close(fig)


def make_all(sample: dict[str, Any], folder: Path) -> None:
    folder.mkdir(parents=True, exist_ok=True)
    paired_accuracy(sample, folder / "paired_accuracy.png")
    by_type(sample, folder / "accuracy_by_type.png")
