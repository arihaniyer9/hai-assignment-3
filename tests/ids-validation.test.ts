/**
 * tests/ids-validation.test.ts — session ids and every API input schema.
 */
import { describe, expect, it } from "vitest";
import { ID_ALPHABET, SESSION_ID_RE, generateSessionId } from "../lib/ids";
import {
  MAX_TIME_MS,
  adminLoginSchema,
  aiSchema,
  answerSchema,
  checkSchema,
  completeSchema,
  sessionIdSchema,
  startSchema,
} from "../lib/validation";

describe("generateSessionId", () => {
  it("produces ids like S-XXXXXX from unambiguous characters", () => {
    for (let i = 0; i < 200; i++) {
      const id = generateSessionId();
      expect(id).toMatch(SESSION_ID_RE);
      for (const ch of id.slice(2)) expect(ID_ALPHABET).toContain(ch);
    }
    expect(ID_ALPHABET).not.toMatch(/[01ILO]/);
  });
  it("sessionIdSchema accepts generated ids and rejects anything else", () => {
    expect(sessionIdSchema.safeParse(generateSessionId()).success).toBe(true);
    for (const bad of ["P-7F3K9Q", "S-7F3K9", "S-7F3K9QQ", "s-7f3k9q", "S-7F3K0Q", "../x"]) {
      expect(sessionIdSchema.safeParse(bad).success).toBe(false);
    }
  });
});

describe("startSchema", () => {
  const ok = { condition: "baseline", code: "blue-otter-7", consent: true };
  it("accepts a valid start", () => {
    expect(startSchema.parse(ok)).toEqual(ok);
  });
  it("trims and lower-cases the code so the same person types it either way", () => {
    expect(startSchema.parse({ ...ok, code: "  Blue-Otter-7 " }).code).toBe("blue-otter-7");
  });
  it("rejects codes that are too short, too long, or use other characters", () => {
    for (const code of ["ab", "x".repeat(25), "blue otter", "-blue", "ötter7", "a;drop", ""]) {
      expect(startSchema.safeParse({ ...ok, code }).success, code).toBe(false);
    }
  });
  it("requires consent to be exactly true and a known condition", () => {
    expect(startSchema.safeParse({ ...ok, consent: false }).success).toBe(false);
    expect(startSchema.safeParse({ ...ok, consent: undefined }).success).toBe(false);
    expect(startSchema.safeParse({ ...ok, condition: "control" }).success).toBe(false);
  });
});

describe("checkSchema", () => {
  it("accepts only the listed options", () => {
    expect(checkSchema.safeParse({ answer: "source" }).success).toBe(true);
    expect(checkSchema.safeParse({ answer: "funny" }).success).toBe(true);
    expect(checkSchema.safeParse({ answer: "anything" }).success).toBe(false);
  });
});

describe("answerSchema", () => {
  const ok = { itemId: "h123", answer: "Satire", confidence: 4, timeMs: 5200.4 };
  it("accepts a valid answer and rounds the time", () => {
    expect(answerSchema.parse(ok).timeMs).toBe(5200);
  });
  it("rejects unknown answers and out-of-range or fractional confidence", () => {
    expect(answerSchema.safeParse({ ...ok, answer: "satire" }).success).toBe(false);
    for (const confidence of [0, 6, 2.5]) {
      expect(answerSchema.safeParse({ ...ok, confidence }).success).toBe(false);
    }
  });
  it("clamps absurd times instead of rejecting the answer, and rejects negative ones", () => {
    expect(answerSchema.parse({ ...ok, timeMs: 9e9 }).timeMs).toBe(MAX_TIME_MS);
    expect(answerSchema.safeParse({ ...ok, timeMs: -1 }).success).toBe(false);
  });
  it("aiSchema needs an item id", () => {
    expect(aiSchema.safeParse({ itemId: "h1" }).success).toBe(true);
    expect(aiSchema.safeParse({}).success).toBe(false);
  });
});

describe("completeSchema", () => {
  it("trims the comment, turns blanks into null, removes control characters", () => {
    expect(completeSchema.parse({ comment: "  nice  " }).comment).toBe("nice");
    expect(completeSchema.parse({ comment: "   " }).comment).toBeNull();
    expect(completeSchema.parse({}).comment).toBeNull();
    expect(completeSchema.parse({ comment: "a\u0000b" }).comment).toBe("a b");
  });
  it("rejects comments over 1000 characters", () => {
    expect(completeSchema.safeParse({ comment: "x".repeat(1001) }).success).toBe(false);
  });
});

describe("adminLoginSchema", () => {
  it("needs a non-empty password", () => {
    expect(adminLoginSchema.safeParse({ password: "" }).success).toBe(false);
    expect(adminLoginSchema.safeParse({ password: "pw" }).success).toBe(true);
  });
});
