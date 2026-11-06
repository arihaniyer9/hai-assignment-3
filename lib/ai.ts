/**
 * lib/ai.ts
 *
 * The live AI assistant (server only): scores a headline with the Assignment 2 model, ported in
 * lib/model.ts. The model file and the frozen "confident" threshold come from data/a2/, exported
 * from A2 with their checksums. The output is returned to the participant AND logged with the
 * trial, so the analysis sees exactly what each person was shown.
 */
import modelJson from "../data/a2/model.json";
import sources from "../data/a2/SOURCES.json";
import { contributions, parseModel, probabilitySatire, type Model } from "./model";
import type { AiOutput } from "./types";

/** The threshold frozen in A2 before scoring (0.7). */
export const CONFIDENT_THRESHOLD: number = sources.confident_threshold;

let cached: Model | null = null;

/** The validated model, parsed once per server instance. */
export function getModel(): Model {
  cached ??= parseModel(modelJson);
  return cached;
}

/** Contributions too small to show (they round to +/-0.00). */
const VISIBLE = 0.005;

/**
 * What the AI says about one headline.
 *
 * @param headline The text exactly as shown to the participant.
 * @param model The model (defaults to the A2 model).
 * @param threshold Confidence at which the "Confident" badge appears.
 */
export function aiFor(headline: string, model: Model = getModel(), threshold = CONFIDENT_THRESHOLD): AiOutput {
  const probSatire = probabilitySatire(model, headline);
  const label = probSatire >= 0.5 ? "Satire" : "Real";
  const confidence = Math.max(probSatire, 1 - probSatire);
  return {
    label,
    probSatire,
    confidence,
    confident: confidence >= threshold,
    words: contributions(model, headline).filter((w) => Math.abs(w.value) >= VISIBLE),
  };
}
