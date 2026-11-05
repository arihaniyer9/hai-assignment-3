/**
 * lib/constants.ts
 *
 * Tiny dependency-free constants shared by server and client code (kept out of
 * `service.ts` so client bundles never import the storage layer).
 */

/** How many tweets each participant labels. */
export const TWEETS_PER_PARTICIPANT = 5;
