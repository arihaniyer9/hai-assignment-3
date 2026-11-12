/**
 * lib/service.ts
 *
 * The study's rules, independent of HTTP and of the database. API routes call these functions;
 * these functions call `Storage`.
 *
 * Rules enforced here:
 *   - one open session per participant code and condition; returning with the same code resumes it;
 *   - the instruction check comes first; failing it MAX_CHECK_FAILURES times ends the session, and
 *     the person may start over with the same code;
 *   - trials are drawn only after the check is passed: TRIALS_PER_TYPE of each type, none the code
 *     has already seen in the other condition, plus one attention check;
 *   - trials are answered strictly in order;
 *   - in the assisted condition the AI is shown only after the participant's own answer is saved,
 *     and that answer can never change afterwards; the final answer needs the AI to have been shown;
 *   - an answer can be changed only within UNDO_WINDOW_MS of saving it (plus UNDO_GRACE_MS for network
 *     delay), only before the next headline is answered, and never the participant's own answer on
 *     an assisted trial (the AI has been seen by then); each change is counted. Otherwise answers are
 *     write-once (a retry with the same values is accepted);
 *   - the results page (every headline, the correct answer, the AI's answer) unlocks only when the
 *     code has finished BOTH conditions, so nothing learned there can affect the other condition;
 *   - the AI output is computed live, logged once, and the same logged output is returned on reload;
 *   - ground truth never leaves the server before completion, and then only as a score.
 */
import { aiFor } from "./ai";
import {
  APP_VERSION,
  CATCH_ITEM_ID,
  CONDITIONS,
  MAX_CHECK_FAILURES,
  UNDO_GRACE_MS,
  UNDO_WINDOW_MS,
  type Answer,
  type Condition,
} from "./constants";
import { scoredAnswer } from "./export";
import { generateSessionId } from "./ids";
import { CHECK_ANSWER } from "./instructions";
import { drawSession } from "./sampling";
import { getStorage } from "./storage";
import type { Storage } from "./storage/types";
import type {
  AiOutput,
  DebriefSummary,
  ParticipantResults,
  PartResults,
  SessionRecord,
  SessionState,
  SessionStatus,
  TrialPublic,
  TrialRecord,
} from "./types";

export type ServiceErrorCode = "not_found" | "forbidden" | "conflict" | "invalid" | "unavailable";

/** An expected, participant-facing failure (as opposed to a bug or outage). */
export class ServiceError extends Error {
  constructor(
    public readonly code: ServiceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ServiceError";
  }
}

export interface StartInput {
  condition: Condition;
  code: string;
}

export interface AnswerInput {
  itemId: string;
  answer: Answer;
  confidence: number;
  timeMs: number;
}

const now = () => new Date().toISOString();

function statusOf(s: SessionRecord): SessionStatus {
  if (s.terminatedAt) return "terminated";
  if (s.completedAt) return "done";
  if (!s.checkPassedAt) return "check";
  return "trials";
}

const isCatch = (t: TrialRecord) => t.itemId === CATCH_ITEM_ID;

/** Whether a trial needs a final (post-AI) answer: assisted study trials only. */
const needsFinal = (s: SessionRecord, t: TrialRecord) => s.condition === "assisted" && !isCatch(t);

/** Whether the participant has finished this trial. */
function trialDone(s: SessionRecord, t: TrialRecord): boolean {
  return needsFinal(s, t) ? t.finalAnswer !== null : t.initialAnswer !== null;
}

function toPublic(t: TrialRecord): TrialPublic {
  return {
    position: t.position,
    itemId: t.itemId,
    headline: t.headline,
    isCatch: isCatch(t),
    initialAnswer: t.initialAnswer,
    initialConfidence: t.initialConfidence,
    ai: t.ai,
    finalAnswer: t.finalAnswer,
    finalConfidence: t.finalConfidence,
  };
}

async function requireSession(store: Storage, id: string): Promise<SessionRecord> {
  const s = await store.getSession(id);
  if (!s) throw new ServiceError("not_found", "Session not found.");
  return s;
}

async function stateOf(store: Storage, s: SessionRecord): Promise<SessionState> {
  const trials = statusOf(s) === "check" ? [] : await store.listTrials(s.id);
  return {
    sessionId: s.id,
    code: s.code,
    condition: s.condition,
    status: statusOf(s),
    checkFailures: s.checkFailures,
    trials: trials.map(toPublic),
  };
}

/**
 * Starts a session, or resumes the code's open session in this condition.
 *
 * @throws ServiceError `conflict` when this code already completed this condition.
 */
export async function startSession(input: StartInput, storage?: Storage): Promise<SessionState> {
  const store = storage ?? (await getStorage());
  for (let attempt = 0; attempt < 5; attempt++) {
    const open = await store.findOpenSession(input.code, input.condition);
    if (open) {
      if (open.completedAt) {
        throw new ServiceError(
          "conflict",
          "This code has already finished this part. If that wasn't you, please choose a different code.",
        );
      }
      return stateOf(store, open);
    }
    const id = generateSessionId();
    const result = await store.createSession({
      id,
      code: input.code,
      condition: input.condition,
      consentedAt: now(),
      appVersion: APP_VERSION,
    });
    if (result === "ok") return stateOf(store, await requireSession(store, id));
    // "code_taken": another tab created it a moment ago; loop and resume it. "id_taken": draw again.
  }
  throw new ServiceError("unavailable", "Could not start a session. Please try again.");
}

export async function getSessionState(id: string, storage?: Storage): Promise<SessionState> {
  const store = storage ?? (await getStorage());
  return stateOf(store, await requireSession(store, id));
}

/**
 * Checks the answer to the instruction question. A pass draws the trials.
 *
 * @returns Whether the answer was right, and the new state.
 * @throws ServiceError `conflict` unless the session is waiting for the check.
 */
export async function answerCheck(
  id: string,
  answer: string,
  storage?: Storage,
): Promise<{ correct: boolean; state: SessionState }> {
  const store = storage ?? (await getStorage());
  const s = await requireSession(store, id);
  if (statusOf(s) !== "check") throw new ServiceError("conflict", "The check is not open for this session.");

  if (answer !== CHECK_ANSWER) {
    const failures = s.checkFailures + 1;
    await store.updateSession(id, {
      checkFailures: failures,
      ...(failures >= MAX_CHECK_FAILURES ? { terminatedAt: now() } : {}),
    });
    return { correct: false, state: await stateOf(store, await requireSession(store, id)) };
  }

  const [items, seen] = await Promise.all([store.listItems(), store.seenItemIds(s.code)]);
  let order: string[];
  try {
    order = drawSession(items, seen);
  } catch {
    throw new ServiceError("unavailable", "The study is not set up yet. Please tell the researcher.");
  }
  await store.createTrials(id, order);
  await store.updateSession(id, { checkPassedAt: now() });
  return { correct: true, state: await stateOf(store, await requireSession(store, id)) };
}

/** Loads the session and the trial the participant is answering, enforcing the order. */
async function requireCurrentTrial(
  store: Storage,
  id: string,
  itemId: string,
): Promise<{ s: SessionRecord; trial: TrialRecord; trials: TrialRecord[] }> {
  const s = await requireSession(store, id);
  if (statusOf(s) !== "trials") throw new ServiceError("conflict", "This session is not taking answers.");
  const trials = await store.listTrials(id);
  const trial = trials.find((t) => t.itemId === itemId);
  if (!trial) throw new ServiceError("forbidden", "That headline is not part of your session.");
  if (trials.some((t) => t.position < trial.position && !trialDone(s, t))) {
    throw new ServiceError("invalid", "Please answer the headlines in order.");
  }
  return { s, trial, trials };
}

/**
 * Throws unless a saved answer may still be changed: within the go-back window of when it was
 * first saved, and before any later headline has been answered.
 */
function requireRevisable(trials: TrialRecord[], trial: TrialRecord, savedAt: string | null): void {
  const age = Date.now() - Date.parse(savedAt ?? "");
  if (!(age <= UNDO_WINDOW_MS + UNDO_GRACE_MS)) {
    throw new ServiceError("conflict", "The 10 seconds to change this answer have passed.");
  }
  if (trials.some((t) => t.position > trial.position && t.initialAnswer !== null)) {
    throw new ServiceError("conflict", "You have already answered the next headline.");
  }
}

function sameAnswer(a: Answer | null, c: number | null, input: AnswerInput): boolean {
  return a === input.answer && c === input.confidence;
}

/** Saves the participant's own answer (the only answer in the baseline condition). */
export async function saveInitial(id: string, input: AnswerInput, storage?: Storage): Promise<void> {
  const store = storage ?? (await getStorage());
  const { s, trial, trials } = await requireCurrentTrial(store, id, input.itemId);
  if (trial.initialAnswer !== null) {
    if (sameAnswer(trial.initialAnswer, trial.initialConfidence, input)) return; // retry
    if (needsFinal(s, trial)) {
      // On an assisted trial the AI is shown as soon as the own answer is saved.
      throw new ServiceError("conflict", "Your own answer cannot be changed once the AI has been shown.");
    }
    requireRevisable(trials, trial, trial.initialAt);
    await store.updateTrial(id, input.itemId, {
      initialAnswer: input.answer,
      initialConfidence: input.confidence,
      initialTimeMs: (trial.initialTimeMs ?? 0) + input.timeMs,
      initialRevisions: trial.initialRevisions + 1,
    });
    return;
  }
  await store.updateTrial(id, input.itemId, {
    initialAnswer: input.answer,
    initialConfidence: input.confidence,
    initialTimeMs: input.timeMs,
    initialAt: now(),
  });
}

/**
 * Computes, logs and returns the AI's output for a trial (assisted condition, after the own answer).
 * Calling it again returns the logged output unchanged.
 */
export async function showAi(id: string, itemId: string, storage?: Storage): Promise<AiOutput> {
  const store = storage ?? (await getStorage());
  const { s, trial } = await requireCurrentTrial(store, id, itemId);
  if (!needsFinal(s, trial)) throw new ServiceError("forbidden", "There is no AI suggestion for this item.");
  if (trial.initialAnswer === null) {
    throw new ServiceError("invalid", "Please give your own answer before seeing the AI's.");
  }
  if (trial.ai) return trial.ai;
  const ai = aiFor(trial.headline);
  await store.updateTrial(id, itemId, { ai, aiShownAt: now() });
  return ai;
}

/** Saves the answer given after seeing the AI (assisted condition). */
export async function saveFinal(id: string, input: AnswerInput, storage?: Storage): Promise<void> {
  const store = storage ?? (await getStorage());
  const { s, trial, trials } = await requireCurrentTrial(store, id, input.itemId);
  if (!needsFinal(s, trial)) throw new ServiceError("forbidden", "This item has no second answer.");
  if (!trial.ai) throw new ServiceError("invalid", "Please look at the AI's suggestion first.");
  if (trial.finalAnswer !== null) {
    if (sameAnswer(trial.finalAnswer, trial.finalConfidence, input)) return; // retry
    requireRevisable(trials, trial, trial.finalAt);
    await store.updateTrial(id, input.itemId, {
      finalAnswer: input.answer,
      finalConfidence: input.confidence,
      finalTimeMs: (trial.finalTimeMs ?? 0) + input.timeMs,
      finalRevisions: trial.finalRevisions + 1,
    });
    return;
  }
  await store.updateTrial(id, input.itemId, {
    finalAnswer: input.answer,
    finalConfidence: input.confidence,
    finalTimeMs: input.timeMs,
    finalAt: now(),
  });
}

function summarise(s: SessionRecord, trials: TrialRecord[]): DebriefSummary {
  const study = trials.filter((t) => !isCatch(t));
  return {
    condition: s.condition,
    code: s.code,
    correct: study.filter((t) => scoredAnswer(s.condition, t) === t.label).length,
    total: study.length,
  };
}

/**
 * Finishes the session (every trial answered) and returns the score. Idempotent.
 *
 * @throws ServiceError `invalid` while trials are unanswered, `conflict` for a session in the
 *   check stage or terminated.
 */
export async function completeSession(
  id: string,
  comment: string | null,
  storage?: Storage,
): Promise<DebriefSummary> {
  const store = storage ?? (await getStorage());
  const s = await requireSession(store, id);
  const status = statusOf(s);
  if (status === "check" || status === "terminated") {
    throw new ServiceError("conflict", "This session cannot be completed.");
  }
  const trials = await store.listTrials(id);
  if (status === "trials") {
    if (!trials.every((t) => trialDone(s, t))) {
      throw new ServiceError("invalid", "Please answer every headline before finishing.");
    }
    await store.updateSession(id, { completedAt: now(), comment });
  }
  return summarise(s, trials);
}

/** The score of a completed session. */
export async function getSummary(id: string, storage?: Storage): Promise<DebriefSummary> {
  const store = storage ?? (await getStorage());
  const s = await requireSession(store, id);
  if (!s.completedAt) throw new ServiceError("forbidden", "Your score is available when you finish.");
  return summarise(s, await store.listTrials(id));
}

/**
 * Every headline of both parts with the participant's answer, the correct answer and the AI's
 * answer: as shown in the AI part, and as it would have been (never shown) in the baseline part.
 *
 * @throws ServiceError `forbidden` unless this code has finished both conditions.
 */
export async function getResults(code: string, storage?: Storage): Promise<ParticipantResults> {
  const store = storage ?? (await getStorage());
  const done = (await store.sessionsForCode(code)).filter((s) => s.completedAt && !s.terminatedAt);
  if (!CONDITIONS.every((c) => done.some((s) => s.condition === c))) {
    throw new ServiceError("forbidden", "Your results unlock once you have finished both parts with this code.");
  }
  const parts: PartResults[] = [];
  for (const s of done) {
    const trials = (await store.listTrials(s.id)).filter((t) => !isCatch(t));
    const rows = trials.map((t) => {
      const ai = t.ai ?? aiFor(t.headline);
      const yours = scoredAnswer(s.condition, t)!;
      return {
        position: t.position,
        headline: t.headline,
        correctAnswer: t.label,
        yourAnswer: yours,
        yourCorrect: yours === t.label,
        firstAnswer: s.condition === "assisted" ? t.initialAnswer : null,
        aiAnswer: ai.label,
        aiConfidence: ai.confidence,
        aiCorrect: ai.label === t.label,
      };
    });
    const switched = s.condition === "assisted" ? trials.filter((t) => t.finalAnswer !== t.initialAnswer) : null;
    parts.push({
      condition: s.condition,
      yourCorrect: rows.filter((r) => r.yourCorrect).length,
      aiCorrect: rows.filter((r) => r.aiCorrect).length,
      total: rows.length,
      rows,
      switchedToRight: switched ? switched.filter((t) => t.finalAnswer === t.label).length : null,
      switchedToWrong: switched ? switched.filter((t) => t.finalAnswer !== t.label).length : null,
    });
  }
  return { code, parts };
}
