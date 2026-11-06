/**
 * lib/export.ts
 *
 * Turns stored sessions and trials into the two analysis files (one row per trial, one row per
 * session) and the admin dashboard numbers. Pure functions, so every derived column is unit-tested.
 * The README's data dictionary documents each column.
 */
import { CATCH_ITEM_ID, CONDITIONS, type Condition } from "./constants";
import { toCsv, type Cell } from "./csv";
import type { AdminStats, SessionRecord, TrialRecord } from "./types";

const isCatch = (t: TrialRecord) => t.itemId === CATCH_ITEM_ID;

/** The answer that counts: the final answer for assisted study trials, the only answer otherwise. */
export function scoredAnswer(condition: Condition, t: TrialRecord) {
  return condition === "assisted" && !isCatch(t) ? t.finalAnswer : t.initialAnswer;
}

/** For each session, whether it was this code's 1st or 2nd condition (by consent time). */
export function sessionOrder(sessions: readonly SessionRecord[]): Map<string, number> {
  const byCode = new Map<string, SessionRecord[]>();
  for (const s of sessions) {
    if (s.terminatedAt) continue; // abandoned attempts do not count as a condition taken
    byCode.set(s.code, [...(byCode.get(s.code) ?? []), s]);
  }
  const order = new Map<string, number>();
  for (const list of byCode.values()) {
    [...list]
      .sort((a, b) => a.consentedAt.localeCompare(b.consentedAt) || a.id.localeCompare(b.id))
      .forEach((s, i) => order.set(s.id, i + 1));
  }
  return order;
}

export const TRIAL_HEADERS = [
  "session_id", "code", "condition", "session_order", "session_completed",
  "position", "item_id", "is_catch", "item_type", "headline", "label",
  "initial_answer", "initial_correct", "initial_confidence", "initial_time_ms", "initial_at",
  "ai_label", "ai_prob_satire", "ai_confidence", "ai_confident", "ai_correct", "ai_words", "ai_shown_at",
  "final_answer", "final_correct", "final_confidence", "final_time_ms", "final_at",
  "switched", "scored_answer", "scored_correct",
] as const; // prettier-ignore

const correct = (answer: string | null, label: string): boolean | null =>
  answer === null ? null : answer === label;

export function trialRows(sessions: readonly SessionRecord[], trials: readonly TrialRecord[]): Cell[][] {
  const byId = new Map(sessions.map((s) => [s.id, s]));
  const order = sessionOrder(sessions);
  return trials.map((t) => {
    const s = byId.get(t.sessionId)!;
    const scored = scoredAnswer(s.condition, t);
    return [
      s.id, s.code, s.condition, order.get(s.id) ?? null, s.completedAt !== null,
      t.position, t.itemId, isCatch(t), t.type, t.headline, t.label,
      t.initialAnswer, correct(t.initialAnswer, t.label), t.initialConfidence, t.initialTimeMs, t.initialAt,
      t.ai?.label ?? null, t.ai?.probSatire ?? null, t.ai?.confidence ?? null, t.ai?.confident ?? null,
      t.ai ? t.ai.label === t.label : null,
      t.ai ? t.ai.words.map((w) => `${w.text}:${w.value.toFixed(3)}`).join(";") : null,
      t.aiShownAt,
      t.finalAnswer, correct(t.finalAnswer, t.label), t.finalConfidence, t.finalTimeMs, t.finalAt,
      t.finalAnswer === null || t.initialAnswer === null ? null : t.finalAnswer !== t.initialAnswer,
      scored, correct(scored, t.label),
    ]; // prettier-ignore
  });
}

export const SESSION_HEADERS = [
  "session_id", "code", "condition", "session_order", "consented_at", "check_failures",
  "check_passed_at", "terminated_at", "completed_at", "catch_passed", "study_trials_answered",
  "study_trials_correct", "accuracy", "comment",
] as const; // prettier-ignore

export function sessionRows(sessions: readonly SessionRecord[], trials: readonly TrialRecord[]): Cell[][] {
  const order = sessionOrder(sessions);
  return sessions.map((s) => {
    const own = trials.filter((t) => t.sessionId === s.id);
    const catchTrial = own.find(isCatch);
    const answered = own.filter((t) => !isCatch(t) && scoredAnswer(s.condition, t) !== null);
    const right = answered.filter((t) => scoredAnswer(s.condition, t) === t.label).length;
    return [
      s.id, s.code, s.condition, order.get(s.id) ?? null, s.consentedAt, s.checkFailures,
      s.checkPassedAt, s.terminatedAt, s.completedAt,
      catchTrial?.initialAnswer == null ? null : catchTrial.initialAnswer === catchTrial.label,
      answered.length, right, answered.length ? right / answered.length : null, s.comment,
    ]; // prettier-ignore
  });
}

export const trialsCsv = (s: readonly SessionRecord[], t: readonly TrialRecord[]) =>
  toCsv(TRIAL_HEADERS, trialRows(s, t));
export const sessionsCsv = (s: readonly SessionRecord[], t: readonly TrialRecord[]) =>
  toCsv(SESSION_HEADERS, sessionRows(s, t));

/** Dashboard numbers: session counts and the accuracy of completed sessions per condition. */
export function adminStats(sessions: readonly SessionRecord[], trials: readonly TrialRecord[]): AdminStats {
  const byId = new Map(sessions.map((s) => [s.id, s]));
  const sessionsOut = Object.fromEntries(
    CONDITIONS.map((c) => {
      const mine = sessions.filter((s) => s.condition === c);
      return [
        c,
        {
          started: mine.length,
          completed: mine.filter((s) => s.completedAt).length,
          terminated: mine.filter((s) => s.terminatedAt).length,
        },
      ];
    }),
  ) as AdminStats["sessions"];
  const accuracy = Object.fromEntries(
    CONDITIONS.map((c) => {
      const scored = trials.filter((t) => {
        const s = byId.get(t.sessionId);
        return s && s.condition === c && s.completedAt && !isCatch(t);
      });
      const right = scored.filter((t) => scoredAnswer(c, t) === t.label).length;
      return [c, scored.length ? right / scored.length : null];
    }),
  ) as AdminStats["accuracy"];
  return {
    sessions: sessionsOut,
    accuracy,
    trialsAnswered: trials.filter((t) => t.initialAnswer !== null).length,
  };
}
