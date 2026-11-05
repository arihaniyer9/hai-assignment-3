/**
 * tests/ids-validation.test.ts — participant IDs and API input schemas.
 */
import { describe, expect, it } from "vitest";
import { ID_ALPHABET, PARTICIPANT_ID_RE, generateParticipantId } from "../lib/ids";
import {
  adminLoginSchema,
  createParticipantSchema,
  labelSubmitSchema,
  MAX_TIME_SPENT_MS,
} from "../lib/validation";

describe("generateParticipantId", () => {
  it("produces IDs like P-XXXXXX using only unambiguous characters", () => {
    for (let i = 0; i < 200; i++) {
      const id = generateParticipantId();
      expect(id).toMatch(PARTICIPANT_ID_RE);
      for (const ch of id.slice(2)) expect(ID_ALPHABET).toContain(ch);
    }
    expect(ID_ALPHABET).not.toMatch(/[01ILO]/);
  });
});

describe("createParticipantSchema", () => {
  it("requires consent to be exactly true", () => {
    expect(createParticipantSchema.safeParse({}).success).toBe(false);
    expect(createParticipantSchema.safeParse({ consent: false }).success).toBe(false);
    expect(createParticipantSchema.safeParse({ consent: true }).success).toBe(true);
  });
  it("trims the nickname, drops blanks and control characters, caps length", () => {
    expect(createParticipantSchema.parse({ consent: true, nickname: "  Sam  " }).nickname).toBe("Sam");
    expect(createParticipantSchema.parse({ consent: true, nickname: "   " }).nickname).toBeUndefined();
    expect(createParticipantSchema.parse({ consent: true, nickname: "a\u0000b" }).nickname).toBe("a b");
    expect(createParticipantSchema.safeParse({ consent: true, nickname: "x".repeat(31) }).success).toBe(false);
  });
});

describe("labelSubmitSchema", () => {
  const ok = { tweetId: "t001", label: "joy", confidence: 4, rationale: "  happy words ", timeSpentMs: 5200 };
  it("accepts a valid label and trims the rationale", () => {
    const parsed = labelSubmitSchema.parse(ok);
    expect(parsed.rationale).toBe("happy words");
  });
  it("turns an empty/missing rationale into null", () => {
    expect(labelSubmitSchema.parse({ ...ok, rationale: "" }).rationale).toBeNull();
    expect(labelSubmitSchema.parse({ ...ok, rationale: undefined }).rationale).toBeNull();
  });
  it("rejects unknown labels and out-of-range confidence", () => {
    expect(labelSubmitSchema.safeParse({ ...ok, label: "disgust" }).success).toBe(false);
    expect(labelSubmitSchema.safeParse({ ...ok, confidence: 0 }).success).toBe(false);
    expect(labelSubmitSchema.safeParse({ ...ok, confidence: 6 }).success).toBe(false);
    expect(labelSubmitSchema.safeParse({ ...ok, confidence: 2.5 }).success).toBe(false);
  });
  it("accepts 'unsure' and clamps absurd timings", () => {
    expect(labelSubmitSchema.parse({ ...ok, label: "unsure" }).label).toBe("unsure");
    expect(labelSubmitSchema.parse({ ...ok, timeSpentMs: 9e9 }).timeSpentMs).toBe(MAX_TIME_SPENT_MS);
  });
  it("rejects rationales over 500 characters", () => {
    expect(labelSubmitSchema.safeParse({ ...ok, rationale: "x".repeat(501) }).success).toBe(false);
  });
});

describe("adminLoginSchema", () => {
  it("requires a non-empty password", () => {
    expect(adminLoginSchema.safeParse({ password: "" }).success).toBe(false);
    expect(adminLoginSchema.safeParse({ password: "pw" }).success).toBe(true);
  });
});
