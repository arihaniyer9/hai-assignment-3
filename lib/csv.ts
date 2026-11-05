/**
 * lib/csv.ts
 *
 * Minimal CSV writer for the admin export. Follows RFC 4180 quoting and also
 * defuses "CSV injection": participant-supplied text (nickname, rationale) that
 * begins with = + - @ could be run as a formula when the file is opened in
 * Excel/Sheets, so such cells are prefixed with an apostrophe.
 */
import type { AdminRow } from "./types";

/**
 * Converts one value into a safe CSV cell.
 *
 * @param value Any cell value; null/undefined become an empty cell.
 * @returns The escaped cell text (quoted when it contains commas, quotes or newlines).
 */
export function escapeCsvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Builds a CSV document (CRLF line endings, header first).
 *
 * @param headers Column names.
 * @param rows Arrays of cell values, aligned with `headers`.
 * @returns The CSV text.
 */
export function toCsv(
  headers: readonly string[],
  rows: readonly (readonly (string | number | boolean | null | undefined)[])[],
): string {
  return [headers, ...rows].map((r) => r.map(escapeCsvCell).join(",")).join("\r\n") + "\r\n";
}

/** Column headers of the admin CSV export. */
export const ADMIN_CSV_HEADERS = [
  "participant_id",
  "nickname",
  "participant_completed",
  "position",
  "tweet_id",
  "tweet_text",
  "label",
  "ground_truth",
  "matches_ground_truth",
  "confidence",
  "rationale",
  "time_spent_ms",
  "submitted_at",
] as const;

/**
 * Serialises the joined admin rows to CSV.
 *
 * @param rows Rows from `Storage.listAllLabelRows()`.
 * @returns CSV text ready to download.
 */
export function adminRowsToCsv(rows: readonly AdminRow[]): string {
  return toCsv(
    ADMIN_CSV_HEADERS,
    rows.map((r) => [
      r.participantId,
      r.nickname,
      r.participantCompleted,
      r.position,
      r.tweetId,
      r.tweetText,
      r.label,
      r.groundTruth,
      r.matchesGroundTruth,
      r.confidence,
      r.rationale,
      r.timeSpentMs,
      r.submittedAt,
    ]),
  );
}
