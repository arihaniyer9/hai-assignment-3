/**
 * tests/sampling.test.ts — random selection of the 5 tweets per participant.
 */
import { describe, expect, it } from "vitest";
import { sampleTweets } from "../lib/sampling";

const pool = Array.from({ length: 60 }, (_, i) => `t${i}`);

describe("sampleTweets", () => {
  it("returns exactly n unique items that all come from the pool", () => {
    const drawn = sampleTweets(pool, 5);
    expect(drawn).toHaveLength(5);
    expect(new Set(drawn).size).toBe(5);
    for (const item of drawn) expect(pool).toContain(item);
  });

  it("does not mutate the input pool", () => {
    const copy = [...pool];
    sampleTweets(pool, 5);
    expect(pool).toEqual(copy);
  });

  it("throws when the pool is smaller than n", () => {
    expect(() => sampleTweets(["a", "b"], 5)).toThrow(RangeError);
  });

  it("is roughly uniform: every tweet is drawn at a similar rate", () => {
    const counts = new Map<string, number>();
    const draws = 6000; // expected per-tweet count = 6000 * 5 / 60 = 500
    for (let i = 0; i < draws; i++) {
      for (const t of sampleTweets(pool, 5)) counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    expect(counts.size).toBe(60);
    for (const c of counts.values()) {
      expect(c).toBeGreaterThan(380);
      expect(c).toBeLessThan(620);
    }
  });

  it("gives different participants different sets (not always the same 5)", () => {
    const sets = new Set(Array.from({ length: 20 }, () => sampleTweets(pool, 5).sort().join(",")));
    expect(sets.size).toBeGreaterThan(15);
  });
});
