/**
 * lib/constants.ts
 *
 * Study parameters shared by server and client code. Kept free of imports so client bundles never
 * pull in the storage layer. Every number here is a design decision recorded in the README.
 */

/** The two study conditions, one link each. */
export const CONDITIONS = ["baseline", "assisted"] as const;
export type Condition = (typeof CONDITIONS)[number];

/** The four trial types of the A2 study set; each participant gets the same number of each. */
export const ITEM_TYPES = ["obvious_satire", "subtle_satire", "real_absurd", "plain_real"] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

export const ANSWERS = ["Satire", "Real"] as const;
export type Answer = (typeof ANSWERS)[number];

/** Study trials per condition per type: 5 x 4 types = 20 study trials per condition. */
export const TRIALS_PER_TYPE = 5;
export const STUDY_TRIALS = TRIALS_PER_TYPE * ITEM_TYPES.length;

/** One attention-check trial is mixed into each session, never in the first or last places. */
export const CATCH_ITEM_ID = "catch-1";
export const CATCH_EARLIEST = 6;
export const CATCH_LATEST = 15;

/** Failing the instruction check this many times ends the session; the person may start over. */
export const MAX_CHECK_FAILURES = 2;

/** Confidence scale (1 = guessing, 5 = certain), as in Assignment 1. */
export const CONFIDENCE_MIN = 1;
export const CONFIDENCE_MAX = 5;

/** Participant codes: lowercase letters, digits and hyphens, 3 to 24 characters. */
export const CODE_RE = /^[a-z0-9][a-z0-9-]{2,23}$/;
