/**
 * tests/sampling.test.ts — what each session is given.
 */
import { describe, expect, it } from "vitest";
import {
  CATCH_EARLIEST,
  CATCH_ITEM_ID,
  CATCH_LATEST,
  ITEM_TYPES,
  STUDY_TRIALS,
  TRIALS_PER_TYPE,
} from "../lib/constants";
import { loadItemSeeds } from "../lib/items";
import { drawSession, sample } from "../lib/sampling";

const pool = loadItemSeeds();
const typeOf = new Map(pool.map((i) => [i.id, i.type]));

describe("sample", () => {
  it("returns n distinct members of the pool and leaves the pool alone", () => {
    const xs = Array.from({ length: 30 }, (_, i) => i);
    const copy = [...xs];
    const drawn = sample(xs, 10);
    expect(new Set(drawn).size).toBe(10);
    for (const x of drawn) expect(xs).toContain(x);
    expect(xs).toEqual(copy);
  });
  it("throws when the pool is too small", () => {
    expect(() => sample([1, 2], 3)).toThrow(RangeError);
  });
  it("is roughly uniform", () => {
    const counts = new Array(20).fill(0);
    for (let i = 0; i < 4000; i++) for (const x of sample([...Array(20).keys()], 5)) counts[x]++;
    for (const c of counts) {
      expect(c).toBeGreaterThan(850); // expected 1000
      expect(c).toBeLessThan(1150);
    }
  });
});

describe("drawSession", () => {
  it("gives TRIALS_PER_TYPE distinct items of each type plus one attention check", () => {
    const ids = drawSession(pool, new Set());
    expect(ids).toHaveLength(STUDY_TRIALS + 1);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.filter((id) => id === CATCH_ITEM_ID)).toHaveLength(1);
    for (const type of ITEM_TYPES) {
      expect(ids.filter((id) => typeOf.get(id) === type)).toHaveLength(TRIALS_PER_TYPE);
    }
  });

  it("places the attention check between the configured positions, at every allowed one", () => {
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const at = drawSession(pool, new Set()).indexOf(CATCH_ITEM_ID) + 1;
      expect(at).toBeGreaterThanOrEqual(CATCH_EARLIEST);
      expect(at).toBeLessThanOrEqual(CATCH_LATEST);
      seen.add(at);
    }
    expect(seen.size).toBe(CATCH_LATEST - CATCH_EARLIEST + 1);
  });

  it("never repeats an item the code already saw", () => {
    for (let i = 0; i < 50; i++) {
      const first = drawSession(pool, new Set());
      const second = drawSession(pool, new Set(first.filter((id) => id !== CATCH_ITEM_ID)));
      const study = (ids: string[]) => ids.filter((id) => id !== CATCH_ITEM_ID);
      expect(study(second).some((id) => study(first).includes(id))).toBe(false);
    }
  });

  it("mixes the types rather than presenting them in blocks", () => {
    const blocks = drawSession(pool, new Set())
      .filter((id) => id !== CATCH_ITEM_ID)
      .map((id) => typeOf.get(id));
    const grouped = ITEM_TYPES.flatMap((t) => Array(TRIALS_PER_TYPE).fill(t));
    // a 1-in-millions chance of matching the blocked order by accident
    expect(blocks).not.toEqual(grouped);
  });

  it("refuses when a type has too few unseen items", () => {
    const seen = new Set(pool.filter((i) => i.type === "obvious_satire").map((i) => i.id).slice(0, 41));
    expect(() => drawSession(pool, seen)).toThrow(RangeError);
  });

  it("gives different sessions different items", () => {
    expect(drawSession(pool, new Set())).not.toEqual(drawSession(pool, new Set()));
  });
});
