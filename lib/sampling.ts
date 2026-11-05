/**
 * lib/sampling.ts
 *
 * Random selection of the tweets a participant will label. Uses the
 * cryptographically secure `crypto.randomInt` so selection is unbiased and
 * unpredictable, and each participant gets an independent random draw.
 */
import { randomInt } from "node:crypto";

/** A function returning a uniform integer in [0, max). Injectable for tests. */
export type RandomInt = (max: number) => number;

/**
 * Draws `n` distinct items uniformly at random from `pool`, in random order,
 * using a partial Fisher-Yates shuffle on a copy (the input is not mutated).
 *
 * @param pool The full set of candidates (must contain at least `n` items).
 * @param n How many items to draw (default 5).
 * @param rng Uniform integer generator; defaults to `crypto.randomInt`.
 * @returns A new array of `n` unique items in random order.
 * @throws RangeError when the pool has fewer than `n` items.
 */
export function sampleTweets<T>(pool: readonly T[], n = 5, rng: RandomInt = randomInt): T[] {
  if (pool.length < n) {
    throw new RangeError(`Cannot sample ${n} items from a pool of ${pool.length}`);
  }
  const items = [...pool];
  for (let i = 0; i < n; i++) {
    // Pick a random element from the not-yet-fixed tail and swap it into place i.
    const j = i + rng(items.length - i);
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items.slice(0, n);
}
