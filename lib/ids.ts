/**
 * lib/ids.ts
 *
 * Anonymous participant identifiers such as `P-7F3K9Q`. The alphabet leaves out
 * characters that are easy to confuse when read aloud or copied by hand
 * (0/O, 1/I/L), and the ID is the only credential a participant holds, so it is
 * drawn with a cryptographically secure generator.
 */
import { randomInt } from "node:crypto";

/** 31 unambiguous characters: A-Z without I, L, O, plus digits 2-9. */
export const ID_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Number of random characters after the "P-" prefix. */
export const ID_LENGTH = 6;

/** Matches a well-formed participant ID (used to validate URL/body input). */
export const PARTICIPANT_ID_RE = /^P-[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{6}$/;

/**
 * Generates a new random participant ID. Callers must still handle the (very
 * unlikely) case that the ID already exists, by retrying.
 *
 * @param rng Uniform integer generator; defaults to `crypto.randomInt`.
 * @returns A string like "P-7F3K9Q".
 */
export function generateParticipantId(rng: (max: number) => number = randomInt): string {
  let id = "P-";
  for (let i = 0; i < ID_LENGTH; i++) id += ID_ALPHABET[rng(ID_ALPHABET.length)];
  return id;
}
