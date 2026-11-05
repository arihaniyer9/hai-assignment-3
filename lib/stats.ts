/**
 * lib/stats.ts
 *
 * Pure function that turns the joined admin rows into the numbers shown on the
 * admin dashboard. Kept separate from storage so it is trivial to unit-test.
 */
import { LABEL_KEYS, type LabelKey } from "./emotions";
import type { AdminRow, AdminStats, ParticipantCounts } from "./types";

/**
 * Computes dashboard statistics.
 *
 * @param rows All label rows (one per participant x tweet).
 * @param counts Participant totals (started / completed).
 * @returns Aggregated stats; `matchRate` is null when there are no labels yet.
 */
export function computeAdminStats(
  rows: readonly AdminRow[],
  counts: ParticipantCounts,
): AdminStats {
  const labelCounts = Object.fromEntries(LABEL_KEYS.map((k) => [k, 0])) as Record<LabelKey, number>;
  let matches = 0;
  for (const row of rows) {
    labelCounts[row.label] += 1;
    if (row.matchesGroundTruth) matches += 1;
  }
  return {
    participantsStarted: counts.started,
    participantsCompleted: counts.completed,
    labelsCollected: rows.length,
    matchRate: rows.length ? matches / rows.length : null,
    labelCounts,
  };
}
