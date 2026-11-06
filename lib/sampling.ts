/**
 * lib/sampling.ts
 *
 * Draws the trials for one session: TRIALS_PER_TYPE random items of each type, never one the same
 * participant code already saw in the other condition, shuffled, with the attention check placed
 * at a random position between CATCH_EARLIEST and CATCH_LATEST. Uses `crypto.randomInt`, so each
 * participant gets an independent, unbiased draw.
 */
import { randomInt } from "node:crypto";
import {
  CATCH_EARLIEST,
  CATCH_ITEM_ID,
  CATCH_LATEST,
  ITEM_TYPES,
  TRIALS_PER_TYPE,
} from "./constants";
import type { ItemSeed } from "./types";

/** A function returning a uniform integer in [0, max). Injectable for tests. */
export type RandomInt = (max: number) => number;

/**
 * Draws `n` distinct items uniformly at random, in random order (partial Fisher-Yates on a copy).
 *
 * @throws RangeError when the pool has fewer than `n` items.
 */
export function sample<T>(pool: readonly T[], n: number, rng: RandomInt = randomInt): T[] {
  if (pool.length < n) throw new RangeError(`Cannot sample ${n} items from a pool of ${pool.length}`);
  const items = [...pool];
  for (let i = 0; i < n; i++) {
    const j = i + rng(items.length - i);
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items.slice(0, n);
}

/**
 * The ordered item ids for a new session.
 *
 * @param pool Every item, including the attention check.
 * @param seen Item ids this participant code has already been given (other condition).
 * @param rng Uniform integer generator.
 * @returns STUDY_TRIALS study ids plus the catch id, in presentation order.
 * @throws RangeError when a type has too few unseen items left.
 */
export function drawSession(
  pool: readonly ItemSeed[],
  seen: ReadonlySet<string>,
  rng: RandomInt = randomInt,
): string[] {
  const study = ITEM_TYPES.flatMap((type) =>
    sample(
      pool.filter((i) => i.type === type && !seen.has(i.id)),
      TRIALS_PER_TYPE,
      rng,
    ),
  );
  const order = sample(study, study.length, rng).map((i) => i.id);
  const at = CATCH_EARLIEST - 1 + rng(CATCH_LATEST - CATCH_EARLIEST + 1);
  order.splice(at, 0, CATCH_ITEM_ID);
  return order;
}
