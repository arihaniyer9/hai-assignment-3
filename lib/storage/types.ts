/**
 * lib/storage/types.ts
 *
 * The persistence contract. The app talks only to this interface; two
 * implementations exist: SQLite (local development and tests) and Supabase
 * Postgres (production). Storage is intentionally "dumb": all business rules
 * (who may label what, when a participant is complete) live in `lib/service.ts`
 * so they are written once and behave identically on both back ends.
 */
import type { LabelInput } from "../types";
import type {
  AdminRow,
  DebriefItem,
  ParticipantCounts,
  ParticipantState,
  TweetSeed,
} from "../types";

/** Persistence operations required by the app. */
export interface Storage {
  /** Inserts or updates the tweet pool (idempotent, keyed by tweet id). */
  seedTweets(tweets: readonly TweetSeed[]): Promise<void>;

  /** Returns every tweet in the pool, including ground truth (server use only). */
  listTweets(): Promise<TweetSeed[]>;

  /**
   * Inserts a participant row.
   * @returns false when the ID already exists (caller retries with a new ID).
   */
  createParticipant(p: { id: string; nickname: string | null; consentedAt: string }): Promise<boolean>;

  /** Removes a participant and its rows (used to roll back a failed start). */
  deleteParticipant(id: string): Promise<void>;

  /** Stores the participant's 5 tweets; index + 1 becomes each `position`. */
  createAssignments(participantId: string, tweetIds: readonly string[]): Promise<void>;

  /** Loads a participant's resumable state (no ground truth), or null if unknown. */
  getParticipantState(id: string): Promise<ParticipantState | null>;

  /** Inserts or replaces the participant's label for one tweet. */
  upsertLabel(
    participantId: string,
    tweetId: string,
    input: LabelInput,
    submittedAt: string,
  ): Promise<void>;

  /** Marks the participant as completed. */
  completeParticipant(id: string, completedAt: string): Promise<void>;

  /** Joins a participant's labels with tweet text and ground truth, by position. */
  getParticipantResults(id: string): Promise<DebriefItem[]>;

  /** All labels joined with participant and tweet data, oldest first. */
  listAllLabelRows(): Promise<AdminRow[]>;

  /** How many participants have started / completed the task. */
  getParticipantCounts(): Promise<ParticipantCounts>;
}
