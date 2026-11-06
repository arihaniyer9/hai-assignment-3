/**
 * lib/storage/types.ts
 *
 * The persistence contract. Two implementations: SQLite (local development and tests) and Supabase
 * Postgres (production). Storage is deliberately "dumb": every study rule (order of steps, no
 * changing an answer once the AI has been shown, one open session per code and condition) lives in
 * lib/service.ts, so it is written once and behaves the same on both back ends.
 */
import type { Answer, Condition } from "../constants";
import type { AiOutput, ItemSeed, SessionRecord, TrialRecord } from "../types";

export type { Answer };

/** Fields of a session the service may change after creation. */
export type SessionPatch = Partial<
  Pick<SessionRecord, "checkFailures" | "checkPassedAt" | "terminatedAt" | "completedAt" | "comment">
>;

/** Fields of a trial the service may fill in, step by step. */
export type TrialPatch = Partial<{
  initialAnswer: Answer;
  initialConfidence: number;
  initialTimeMs: number;
  initialAt: string;
  ai: AiOutput;
  aiShownAt: string;
  finalAnswer: Answer;
  finalConfidence: number;
  finalTimeMs: number;
  finalAt: string;
}>;

export type CreateSessionResult = "ok" | "id_taken" | "code_taken";

export interface Storage {
  /** Inserts or updates the item pool (idempotent, keyed by id). */
  seedItems(items: readonly ItemSeed[]): Promise<void>;
  /** Every item, including the answer key (server use only). */
  listItems(): Promise<ItemSeed[]>;

  /**
   * Inserts a session. Returns "code_taken" when this code already has a session in this condition
   * that was not terminated (a database constraint, so two tabs cannot race past it).
   */
  createSession(s: {
    id: string;
    code: string;
    condition: Condition;
    consentedAt: string;
  }): Promise<CreateSessionResult>;
  getSession(id: string): Promise<SessionRecord | null>;
  /** The code's session in this condition that was not terminated, if any. */
  findOpenSession(code: string, condition: Condition): Promise<SessionRecord | null>;
  updateSession(id: string, patch: SessionPatch): Promise<void>;

  /** Item ids already given to any session with this code. */
  seenItemIds(code: string): Promise<Set<string>>;
  /** Creates one empty trial per item; index + 1 is the position. */
  createTrials(sessionId: string, itemIds: readonly string[]): Promise<void>;
  /** A session's trials joined with their items, by position. */
  listTrials(sessionId: string): Promise<TrialRecord[]>;
  updateTrial(sessionId: string, itemId: string, patch: TrialPatch): Promise<void>;

  /** Admin: every session, oldest first. */
  listAllSessions(): Promise<SessionRecord[]>;
  /** Admin: every trial joined with its item, by session then position. */
  listAllTrials(): Promise<TrialRecord[]>;
}
