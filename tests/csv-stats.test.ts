/**
 * tests/csv-stats.test.ts — CSV escaping/injection defence and dashboard stats.
 */
import { describe, expect, it } from "vitest";
import { adminRowsToCsv, escapeCsvCell, toCsv } from "../lib/csv";
import { computeAdminStats } from "../lib/stats";
import type { AdminRow } from "../lib/types";

/** Builds a complete AdminRow with sensible defaults, overriding only what a test cares about. */
const row = (over: Partial<AdminRow> = {}): AdminRow => ({
  participantId: "P-AAAAAA",
  nickname: null,
  participantCompleted: true,
  position: 1,
  tweetId: "t001",
  tweetText: "i feel fine",
  label: "joy",
  groundTruth: "joy",
  matchesGroundTruth: true,
  confidence: 4,
  rationale: null,
  timeSpentMs: 1000,
  submittedAt: "2026-01-01T00:00:00.000Z",
  ...over,
});

describe("escapeCsvCell", () => {
  it("leaves plain values alone and blanks out null/undefined", () => {
    expect(escapeCsvCell("hello")).toBe("hello");
    expect(escapeCsvCell(5)).toBe("5");
    expect(escapeCsvCell(true)).toBe("true");
    expect(escapeCsvCell(null)).toBe("");
    expect(escapeCsvCell(undefined)).toBe("");
  });
  it("quotes cells containing commas, quotes or newlines (RFC 4180)", () => {
    expect(escapeCsvCell("a,b")).toBe('"a,b"');
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvCell("line1\nline2")).toBe('"line1\nline2"');
  });
  it("neutralises spreadsheet formula injection", () => {
    for (const evil of ["=1+1", "+1", "-1", "@SUM(A1)", "\tcmd"]) {
      expect(escapeCsvCell(evil).startsWith("'")).toBe(true);
    }
  });
});

describe("toCsv / adminRowsToCsv", () => {
  it("writes a header plus one line per row with CRLF endings", () => {
    expect(toCsv(["a", "b"], [[1, "x"]])).toBe("a,b\r\n1,x\r\n");
  });
  it("serialises admin rows, escaping the rationale", () => {
    const csv = adminRowsToCsv([row({ rationale: "=HYPERLINK(\"x\")" })]);
    const lines = csv.trim().split("\r\n");
    expect(lines[0]).toContain("participant_id,nickname");
    expect(lines[1]).toContain("P-AAAAAA");
    expect(lines[1]).toContain("'=HYPERLINK");
  });
});

describe("computeAdminStats", () => {
  it("handles the empty case", () => {
    const s = computeAdminStats([], { started: 0, completed: 0 });
    expect(s.matchRate).toBeNull();
    expect(s.labelsCollected).toBe(0);
  });
  it("computes match rate and label counts", () => {
    const s = computeAdminStats(
      [
        row(),
        row({ label: "anger", matchesGroundTruth: false }),
        row({ label: "unsure", matchesGroundTruth: false }),
        row(),
      ],
      { started: 3, completed: 2 },
    );
    expect(s.matchRate).toBe(0.5);
    expect(s.labelCounts.joy).toBe(2);
    expect(s.labelCounts.unsure).toBe(1);
    expect(s.participantsStarted).toBe(3);
    expect(s.participantsCompleted).toBe(2);
  });
});
