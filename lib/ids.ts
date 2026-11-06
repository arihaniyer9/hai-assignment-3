/**
 * lib/ids.ts
 *
 * Anonymous session identifiers such as `S-7F3K9Q`. The alphabet leaves out
 * characters that are easy to confuse when read aloud or copied by hand
 * (0/O, 1/I/L), and the ID is the only credential a session holds, so it is
 * drawn with a cryptographically secure generator.
 */
import { randomInt } from "node:crypto";

/** 31 unambiguous characters: A-Z without I, L, O, plus digits 2-9. */
export const ID_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Number of random characters after the "S-" prefix. */
export const ID_LENGTH = 6;

/** Matches a well-formed session ID (used to validate URL input). */
export const SESSION_ID_RE = /^S-[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{6}$/;

/**
 * Generates a new random session ID. Callers must still handle the (very
 * unlikely) case that the ID already exists, by retrying.
 *
 * @param rng Uniform integer generator; defaults to `crypto.randomInt`.
 * @returns A string like "S-7F3K9Q".
 */
export function generateSessionId(rng: (max: number) => number = randomInt): string {
  let id = "S-";
  for (let i = 0; i < ID_LENGTH; i++) id += ID_ALPHABET[rng(ID_ALPHABET.length)];
  return id;
}
