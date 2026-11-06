/**
 * lib/types.ts
 *
 * Plain data types shared by the storage layer, the service layer, the API routes and the React
 * components. Nothing here has runtime behaviour.
 *
 * Privacy: the types sent to participants during the task (TrialPublic, SessionState) have NO
 * ground-truth field, so the compiler helps keep the answer key away from them.
 */
import type { Answer, Condition } from "./constants";

/** A headline in the pool, with its answer key (server only). */
export interface ItemSeed {
  id: string;
  headline: string;
  label: Answer;
  /** One of ITEM_TYPES for study items, or "catch" for the attention check. */
  type: string;
  topic: string;
  source: string;
}

/** What the AI showed for one trial, exactly as logged. */
export interface AiOutput {
  label: Answer;
  /** Calibrated probability that the headline is satire. */
  probSatire: number;
  /** Probability of the suggested label (what the participant sees as "% sure"). */
  confidence: number;
  /** True when confidence reaches the frozen A2 threshold. */
  confident: boolean;
  /** Per-word pushes: UTF-16 spans into the headline, positive toward Satire. */
  words: { text: string; start: number; end: number; value: number }[];
}

/** One trial as the participant's browser sees it: no ground truth. */
export interface TrialPublic {
  position: number;
  itemId: string;
  headline: string;
  isCatch: boolean;
  initialAnswer: Answer | null;
  initialConfidence: number | null;
  ai: AiOutput | null;
  finalAnswer: Answer | null;
  finalConfidence: number | null;
}

export type SessionStatus = "check" | "trials" | "done" | "terminated";

/** Everything the client needs to show or resume a session. */
export interface SessionState {
  sessionId: string;
  code: string;
  condition: Condition;
  status: SessionStatus;
  checkFailures: number;
  trials: TrialPublic[];
}

/** A stored session (server side). */
export interface SessionRecord {
  id: string;
  code: string;
  condition: Condition;
  consentedAt: string;
  checkFailures: number;
  checkPassedAt: string | null;
  terminatedAt: string | null;
  completedAt: string | null;
  comment: string | null;
}

/** A stored trial (server side), including the item's answer key. */
export interface TrialRecord {
  sessionId: string;
  itemId: string;
  position: number;
  headline: string;
  label: Answer;
  type: string;
  initialAnswer: Answer | null;
  initialConfidence: number | null;
  initialTimeMs: number | null;
  initialAt: string | null;
  ai: AiOutput | null;
  aiShownAt: string | null;
  finalAnswer: Answer | null;
  finalConfidence: number | null;
  finalTimeMs: number | null;
  finalAt: string | null;
}

/** The end-of-session summary shown to the participant. */
export interface DebriefSummary {
  condition: Condition;
  code: string;
  correct: number;
  total: number;
}

/** Admin dashboard numbers. */
export interface AdminStats {
  sessions: Record<Condition, { started: number; completed: number; terminated: number }>;
  /** Accuracy of completed sessions' study trials, per condition; null when none. */
  accuracy: Record<Condition, number | null>;
  trialsAnswered: number;
}
