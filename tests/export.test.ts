/**
 * tests/export.test.ts — the analysis files and the dashboard numbers.
 */
import { describe, expect, it } from "vitest";
import { escapeCsvCell, toCsv } from "../lib/csv";
import {
  SESSION_HEADERS,
  TRIAL_HEADERS,
  adminStats,
  scoredAnswer,
  sessionOrder,
  sessionRows,
  sessionsCsv,
  trialRows,
  trialsCsv,
} from "../lib/export";
import type { AiOutput, SessionRecord, TrialRecord } from "../lib/types";

const session = (over: Partial<SessionRecord>): SessionRecord => ({
  id: "S-AAAAAA",
  code: "c1",
  condition: "baseline",
  consentedAt: "2026-11-12T10:00:00Z",
  checkFailures: 0,
  checkPassedAt: "2026-11-12T10:01:00Z",
  terminatedAt: null,
  completedAt: "2026-11-12T10:05:00Z",
  comment: null,
  appVersion: "2",
  ...over,
});

const ai: AiOutput = {
  label: "Satire",
  probSatire: 0.8,
  confidence: 0.8,
  confident: true,
  words: [{ text: "area", start: 0, end: 4, value: 1.23456 }, { text: "man", start: 5, end: 8, value: -0.5 }],
};

const trial = (over: Partial<TrialRecord>): TrialRecord => ({
  sessionId: "S-AAAAAA",
  itemId: "h1",
  position: 1,
  headline: "Area Man",
  label: "Satire",
  type: "obvious_satire",
  initialAnswer: null,
  initialConfidence: null,
  initialTimeMs: null,
  initialAt: null,
  initialRevisions: 0,
  ai: null,
  aiShownAt: null,
  finalAnswer: null,
  finalConfidence: null,
  finalTimeMs: null,
  finalAt: null,
  finalRevisions: 0,
  ...over,
});

const col = (row: unknown[], name: (typeof TRIAL_HEADERS)[number]) => row[TRIAL_HEADERS.indexOf(name)];
const scol = (row: unknown[], name: (typeof SESSION_HEADERS)[number]) => row[SESSION_HEADERS.indexOf(name)];

describe("scoredAnswer", () => {
  it("is the final answer for assisted study trials and the only answer otherwise", () => {
    const t = trial({ initialAnswer: "Real", finalAnswer: "Satire" });
    expect(scoredAnswer("assisted", t)).toBe("Satire");
    expect(scoredAnswer("baseline", t)).toBe("Real");
    expect(scoredAnswer("assisted", { ...t, itemId: "catch-1" })).toBe("Real");
  });
});

describe("sessionOrder", () => {
  it("numbers each code's conditions by consent time and ignores abandoned attempts", () => {
    const sessions = [
      session({ id: "S-B", condition: "assisted", consentedAt: "2026-11-12T10:10:00Z" }),
      session({ id: "S-A", consentedAt: "2026-11-12T10:00:00Z", terminatedAt: "x" }),
      session({ id: "S-C", consentedAt: "2026-11-12T10:20:00Z" }),
      session({ id: "S-D", code: "c2", consentedAt: "2026-11-12T09:00:00Z" }),
    ];
    const order = sessionOrder(sessions);
    expect(order.get("S-B")).toBe(1);
    expect(order.get("S-C")).toBe(2);
    expect(order.has("S-A")).toBe(false);
    expect(order.get("S-D")).toBe(1);
  });
});

describe("trialRows", () => {
  const s = session({ condition: "assisted" });
  it("derives correctness, the AI's correctness, switching and the scored answer", () => {
    const [row] = trialRows([s], [trial({ initialAnswer: "Real", ai, finalAnswer: "Satire", aiShownAt: "t" })]);
    expect(col(row, "initial_correct")).toBe(false);
    expect(col(row, "ai_correct")).toBe(true);
    expect(col(row, "final_correct")).toBe(true);
    expect(col(row, "switched")).toBe(true);
    expect(col(row, "scored_answer")).toBe("Satire");
    expect(col(row, "scored_correct")).toBe(true);
    expect(col(row, "ai_words")).toBe("area:1.235;man:-0.500");
    expect(col(row, "session_order")).toBe(1);
    expect(row).toHaveLength(TRIAL_HEADERS.length);
  });

  it("leaves derived columns empty when the step did not happen", () => {
    const [row] = trialRows([session({})], [trial({ initialAnswer: "Satire" })]);
    expect(col(row, "ai_label")).toBeNull();
    expect(col(row, "ai_correct")).toBeNull();
    expect(col(row, "switched")).toBeNull();
    expect(col(row, "final_correct")).toBeNull();
    expect(col(row, "scored_correct")).toBe(true);
  });

  it("an unchanged answer is not a switch", () => {
    const [row] = trialRows([s], [trial({ initialAnswer: "Real", ai, finalAnswer: "Real" })]);
    expect(col(row, "switched")).toBe(false);
  });
});

describe("sessionRows", () => {
  it("reports the attention check, the study accuracy and the comment", () => {
    const s = session({ comment: "=cmd" });
    const trials = [
      trial({ itemId: "h1", initialAnswer: "Satire" }),
      trial({ itemId: "h2", position: 2, label: "Real", initialAnswer: "Satire" }),
      trial({ itemId: "catch-1", position: 3, label: "Real", initialAnswer: "Real" }),
    ];
    const [row] = sessionRows([s], trials);
    expect(scol(row, "catch_passed")).toBe(true);
    expect(scol(row, "study_trials_answered")).toBe(2);
    expect(scol(row, "study_trials_correct")).toBe(1);
    expect(scol(row, "accuracy")).toBe(0.5);
    expect(sessionsCsv([s], trials)).toContain("'=cmd"); // formula defused
  });

  it("a failed or missing attention check is reported as such", () => {
    const failed = sessionRows([session({})], [trial({ itemId: "catch-1", label: "Real", initialAnswer: "Satire" })]);
    expect(scol(failed[0], "catch_passed")).toBe(false);
    const missing = sessionRows([session({})], []);
    expect(scol(missing[0], "catch_passed")).toBeNull();
    expect(scol(missing[0], "accuracy")).toBeNull();
  });
});

describe("csv", () => {
  it("quotes and escapes per RFC 4180 and defuses formulas", () => {
    expect(escapeCsvCell('a,"b"')).toBe('"a,""b"""');
    expect(escapeCsvCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(escapeCsvCell("@x")).toBe("'@x");
    expect(escapeCsvCell(-0.5)).toBe("-0.5"); // numbers are never altered
    expect(escapeCsvCell(null)).toBe("");
    expect(toCsv(["a", "b"], [[1, true]])).toBe("a,b\r\n1,true\r\n");
  });
  it("the trial export has one header line plus one line per trial", () => {
    const lines = trialsCsv([session({})], [trial({}), trial({ itemId: "h2", position: 2 })]).trim().split("\r\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe(TRIAL_HEADERS.join(","));
  });
});

describe("adminStats", () => {
  it("counts sessions per condition and the accuracy of completed sessions only", () => {
    const sessions = [
      session({ id: "S-1" }),
      session({ id: "S-2", completedAt: null }),
      session({ id: "S-3", condition: "assisted", completedAt: null, terminatedAt: "t" }),
    ];
    const trials = [
      trial({ sessionId: "S-1", initialAnswer: "Satire" }),
      trial({ sessionId: "S-1", itemId: "h2", label: "Real", initialAnswer: "Satire" }),
      trial({ sessionId: "S-1", itemId: "catch-1", label: "Real", initialAnswer: "Satire" }),
      trial({ sessionId: "S-2", initialAnswer: "Real" }),
    ];
    const stats = adminStats(sessions, trials);
    expect(stats.sessions.baseline).toEqual({ started: 2, completed: 1, terminated: 0 });
    expect(stats.sessions.assisted).toEqual({ started: 1, completed: 0, terminated: 1 });
    expect(stats.accuracy).toEqual({ baseline: 0.5, assisted: null });
    expect(stats.trialsAnswered).toBe(4);
  });
});
