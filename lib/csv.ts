/**
 * lib/csv.ts
 *
 * Minimal RFC 4180 CSV writer for the admin exports. It also defuses "CSV injection": text that
 * begins with = + - @ (such as a participant's comment) could run as a formula in Excel or
 * Sheets, so such cells get a leading apostrophe. Numbers are never altered.
 */

export type Cell = string | number | boolean | null | undefined;

export function escapeCsvCell(value: Cell): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** A CSV document: header first, CRLF line endings. */
export function toCsv(headers: readonly string[], rows: readonly (readonly Cell[])[]): string {
  return [headers, ...rows].map((r) => r.map(escapeCsvCell).join(",")).join("\r\n") + "\r\n";
}
