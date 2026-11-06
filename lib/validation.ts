/**
 * lib/validation.ts
 *
 * zod schemas for every input arriving at the API. Nothing from the network reaches the service or
 * storage layer without passing through one of these.
 */
import { z } from "zod";
import { ANSWERS, CODE_RE, CONDITIONS, CONFIDENCE_MAX, CONFIDENCE_MIN } from "./constants";
import { SESSION_ID_RE } from "./ids";
import { CHECK_OPTIONS } from "./instructions";

/** Longest time we record for one step (30 minutes); longer values are clamped, not rejected. */
export const MAX_TIME_MS = 30 * 60 * 1000;
export const MAX_COMMENT = 1000;

/** Removes ASCII control characters (tabs and newlines become spaces). */
const stripControl = (s: string) => s.replace(/[\u0000-\u001f\u007f]+/g, " ").trim();

/** A participant code: trimmed and lower-cased before it is checked. */
export const codeSchema = z
  .string()
  .max(64)
  .transform((v) => v.trim().toLowerCase())
  .pipe(z.string().regex(CODE_RE));

/** POST /api/sessions */
export const startSchema = z.object({
  condition: z.enum(CONDITIONS),
  code: codeSchema,
  consent: z.literal(true),
});

/** POST /api/sessions/[id]/check */
export const checkSchema = z.object({
  answer: z.enum(CHECK_OPTIONS.map((o) => o.id) as [string, ...string[]]),
});

/** PUT /api/sessions/[id]/initial and /final */
export const answerSchema = z.object({
  itemId: z.string().min(1).max(40),
  answer: z.enum(ANSWERS),
  confidence: z.number().int().min(CONFIDENCE_MIN).max(CONFIDENCE_MAX),
  timeMs: z
    .number()
    .min(0)
    .transform((v) => Math.min(Math.round(v), MAX_TIME_MS)),
});

/** POST /api/sessions/[id]/ai */
export const aiSchema = z.object({ itemId: z.string().min(1).max(40) });

/** POST /api/sessions/[id]/complete */
export const completeSchema = z.object({
  comment: z
    .string()
    .max(MAX_COMMENT)
    .nullish()
    .transform((v) => (v ? stripControl(v) : "") || null),
});

/** POST /api/admin/login */
export const adminLoginSchema = z.object({ password: z.string().min(1).max(200) });

/** A session id from a URL path segment. */
export const sessionIdSchema = z.string().regex(SESSION_ID_RE);

export type StartBody = z.output<typeof startSchema>;
export type AnswerBody = z.output<typeof answerSchema>;
