/**
 * lib/validation.ts
 *
 * zod schemas that validate every piece of input arriving at the API. Nothing
 * from the network reaches the storage layer without passing through one of
 * these. Schemas double as the documentation of each endpoint's request body.
 */
import { z } from "zod";
import { LABEL_KEYS } from "./emotions";
import { PARTICIPANT_ID_RE } from "./ids";

/** Longest visible-tab time we accept for a single tweet (30 minutes). */
export const MAX_TIME_SPENT_MS = 30 * 60 * 1000;

/** Longest allowed nickname and rationale, in characters. */
export const MAX_NICKNAME = 30;
export const MAX_RATIONALE = 500;

/** Removes ASCII control characters (keeps normal text, tabs become spaces). */
const stripControl = (s: string) => s.replace(/[\u0000-\u001f\u007f]+/g, " ").trim();

/** Body of POST /api/participants: optional nickname + mandatory consent. */
export const createParticipantSchema = z.object({
  nickname: z
    .string()
    .max(MAX_NICKNAME)
    .optional()
    .transform((v) => (v ? stripControl(v) : "") || undefined),
  consent: z.literal(true),
});

/** Body of PUT /api/participants/[id]/labels: one tweet's answer. */
export const labelSubmitSchema = z.object({
  tweetId: z.string().min(1).max(20),
  label: z.enum(LABEL_KEYS),
  confidence: z.number().int().min(1).max(5),
  rationale: z
    .string()
    .max(MAX_RATIONALE)
    .nullish()
    .transform((v) => (v ? v.trim() : "") || null),
  // Clamp rather than reject so an idle tab never blocks a valid answer.
  timeSpentMs: z
    .number()
    .min(0)
    .transform((v) => Math.min(Math.round(v), MAX_TIME_SPENT_MS)),
});

/** Body of POST /api/admin/login. */
export const adminLoginSchema = z.object({
  password: z.string().min(1).max(200),
});

/** A participant ID taken from a URL path segment. */
export const participantIdSchema = z.string().regex(PARTICIPANT_ID_RE);

/** Parsed (output) type of {@link createParticipantSchema}; nickname may be omitted. */
export interface CreateParticipantInput {
  nickname?: string;
  consent: true;
}
/** Parsed (output) type of {@link labelSubmitSchema}. */
export type LabelSubmitInput = z.output<typeof labelSubmitSchema>;
