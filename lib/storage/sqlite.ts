/**
 * lib/storage/sqlite.ts
 *
 * SQLite implementation of {@link Storage}, built on Node's built-in
 * `node:sqlite` module (no native dependency). Used for local development and
 * automated tests only; it is never loaded in production (see `index.ts`)
 * because Vercel's filesystem is ephemeral.
 *
 * The schema mirrors `supabase/schema.sql`. Timestamps are stored as ISO-8601
 * strings.
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Emotion, LabelKey } from "../emotions";
import type {
  AdminRow,
  DebriefItem,
  LabelInput,
  ParticipantCounts,
  ParticipantState,
  TweetSeed,
} from "../types";
import type { Storage } from "./types";

/** DDL executed on every start (all statements are idempotent). */
const SCHEMA = `
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS tweets (
    id TEXT PRIMARY KEY,
    text TEXT NOT NULL,
    ground_truth TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS participants (
    id TEXT PRIMARY KEY,
    nickname TEXT,
    consented_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    completed_at TEXT
  );
  CREATE TABLE IF NOT EXISTS assignments (
    participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
    tweet_id TEXT NOT NULL REFERENCES tweets(id),
    position INTEGER NOT NULL CHECK (position BETWEEN 1 AND 5),
    PRIMARY KEY (participant_id, tweet_id),
    UNIQUE (participant_id, position)
  );
  CREATE TABLE IF NOT EXISTS labels (
    participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
    tweet_id TEXT NOT NULL REFERENCES tweets(id),
    label TEXT NOT NULL CHECK (label IN
      ('anger','fear','joy','love','sadness','surprise','unsure')),
    confidence INTEGER NOT NULL CHECK (confidence BETWEEN 1 AND 5),
    rationale TEXT,
    time_spent_ms INTEGER NOT NULL,
    submitted_at TEXT NOT NULL,
    PRIMARY KEY (participant_id, tweet_id)
  );
`;

/** Row shape returned by the admin join query. */
interface AdminJoinRow {
  participant_id: string;
  nickname: string | null;
  completed_at: string | null;
  position: number;
  tweet_id: string;
  text: string;
  label: LabelKey;
  ground_truth: Emotion;
  confidence: number;
  rationale: string | null;
  time_spent_ms: number;
  submitted_at: string;
}

/**
 * Opens (creating if needed) a SQLite database and returns a Storage backed by it.
 *
 * @param file Path of the database file, or ":memory:" for a throwaway DB.
 * @returns A ready-to-use {@link Storage}.
 */
export function createSqliteStorage(file: string): Storage {
  if (file !== ":memory:") mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(SCHEMA);

  /**
   * Runs `fn` inside a transaction, rolling back if it throws.
   * @param fn Work to perform atomically.
   */
  function transaction(fn: () => void): void {
    db.exec("BEGIN");
    try {
      fn();
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  }

  return {
    /** Inserts or updates the whole tweet pool (idempotent, keyed by tweet id). */
    async seedTweets(tweets) {
      const stmt = db.prepare(
        `INSERT INTO tweets (id, text, ground_truth) VALUES (?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET text = excluded.text, ground_truth = excluded.ground_truth`,
      );
      transaction(() => {
        for (const t of tweets) stmt.run(t.id, t.text, t.groundTruth);
      });
    },

    /** Returns every tweet in the pool including ground truth (server-side use only). */
    async listTweets() {
      const rows = db.prepare("SELECT id, text, ground_truth FROM tweets ORDER BY id").all() as {
        id: string;
        text: string;
        ground_truth: Emotion;
      }[];
      return rows.map((r): TweetSeed => ({ id: r.id, text: r.text, groundTruth: r.ground_truth }));
    },

    /** Inserts a participant row; returns false if the ID is already taken so the caller can retry. */
    async createParticipant({ id, nickname, consentedAt }) {
      try {
        db.prepare(
          "INSERT INTO participants (id, nickname, consented_at, created_at) VALUES (?, ?, ?, ?)",
        ).run(id, nickname, consentedAt, consentedAt);
        return true;
      } catch (err) {
        if (err instanceof Error && /UNIQUE constraint/i.test(err.message)) return false;
        throw err;
      }
    },

    /** Deletes a participant; assignments and labels are removed by ON DELETE CASCADE. */
    async deleteParticipant(id) {
      db.prepare("DELETE FROM participants WHERE id = ?").run(id);
    },

    /** Stores the participant's 5 tweets, using each tweet's index + 1 as its position. */
    async createAssignments(participantId, tweetIds) {
      const stmt = db.prepare(
        "INSERT INTO assignments (participant_id, tweet_id, position) VALUES (?, ?, ?)",
      );
      transaction(() => {
        tweetIds.forEach((tweetId, i) => stmt.run(participantId, tweetId, i + 1));
      });
    },

    /** Loads a participant's resumable state (tweets + saved labels, no ground truth), or null if unknown. */
    async getParticipantState(id) {
      const p = db
        .prepare("SELECT id, nickname, completed_at FROM participants WHERE id = ?")
        .get(id) as { id: string; nickname: string | null; completed_at: string | null } | undefined;
      if (!p) return null;
      const tweets = db
        .prepare(
          `SELECT a.tweet_id AS id, t.text, a.position
           FROM assignments a JOIN tweets t ON t.id = a.tweet_id
           WHERE a.participant_id = ? ORDER BY a.position`,
        )
        .all(id) as { id: string; text: string; position: number }[];
      const labels = db
        .prepare(
          `SELECT tweet_id, label, confidence, rationale, time_spent_ms, submitted_at
           FROM labels WHERE participant_id = ?`,
        )
        .all(id) as {
        tweet_id: string;
        label: LabelKey;
        confidence: number;
        rationale: string | null;
        time_spent_ms: number;
        submitted_at: string;
      }[];
      const state: ParticipantState = {
        participantId: p.id,
        nickname: p.nickname,
        completed: p.completed_at !== null,
        tweets: tweets.map((t) => ({ id: t.id, text: t.text, position: t.position })),
        labels: labels.map((l) => ({
          tweetId: l.tweet_id,
          label: l.label,
          confidence: l.confidence,
          rationale: l.rationale,
          timeSpentMs: l.time_spent_ms,
          submittedAt: l.submitted_at,
        })),
      };
      return state;
    },

    /** Inserts the participant's label for a tweet, or replaces it if one already exists. */
    async upsertLabel(participantId, tweetId, input: LabelInput, submittedAt) {
      db.prepare(
        `INSERT INTO labels
           (participant_id, tweet_id, label, confidence, rationale, time_spent_ms, submitted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(participant_id, tweet_id) DO UPDATE SET
           label = excluded.label, confidence = excluded.confidence,
           rationale = excluded.rationale, time_spent_ms = excluded.time_spent_ms,
           submitted_at = excluded.submitted_at`,
      ).run(
        participantId,
        tweetId,
        input.label,
        input.confidence,
        input.rationale,
        input.timeSpentMs,
        submittedAt,
      );
    },

    /** Marks the participant as submitted by setting completed_at. */
    async completeParticipant(id, completedAt) {
      db.prepare("UPDATE participants SET completed_at = ? WHERE id = ?").run(completedAt, id);
    },

    /** Joins the participant's labels with tweet text and ground truth, ordered by position. */
    async getParticipantResults(id) {
      const rows = db
        .prepare(
          `SELECT a.position, a.tweet_id, t.text, t.ground_truth, l.label, l.confidence
           FROM assignments a
           JOIN tweets t ON t.id = a.tweet_id
           JOIN labels l ON l.participant_id = a.participant_id AND l.tweet_id = a.tweet_id
           WHERE a.participant_id = ? ORDER BY a.position`,
        )
        .all(id) as {
        position: number;
        tweet_id: string;
        text: string;
        ground_truth: Emotion;
        label: LabelKey;
        confidence: number;
      }[];
      return rows.map(
        (r): DebriefItem => ({
          position: r.position,
          tweetId: r.tweet_id,
          text: r.text,
          yourLabel: r.label,
          confidence: r.confidence,
          groundTruth: r.ground_truth,
        }),
      );
    },

    /** Returns every label joined with participant and tweet data (admin table and CSV), oldest first. */
    async listAllLabelRows() {
      const rows = db
        .prepare(
          `SELECT l.participant_id, p.nickname, p.completed_at, a.position, l.tweet_id,
                  t.text, l.label, t.ground_truth, l.confidence, l.rationale,
                  l.time_spent_ms, l.submitted_at
           FROM labels l
           JOIN participants p ON p.id = l.participant_id
           JOIN tweets t ON t.id = l.tweet_id
           JOIN assignments a ON a.participant_id = l.participant_id AND a.tweet_id = l.tweet_id
           ORDER BY l.submitted_at, l.participant_id, a.position`,
        )
        .all() as unknown as AdminJoinRow[];
      return rows.map(
        (r): AdminRow => ({
          participantId: r.participant_id,
          nickname: r.nickname,
          participantCompleted: r.completed_at !== null,
          position: r.position,
          tweetId: r.tweet_id,
          tweetText: r.text,
          label: r.label,
          groundTruth: r.ground_truth,
          matchesGroundTruth: r.label === r.ground_truth,
          confidence: r.confidence,
          rationale: r.rationale,
          timeSpentMs: r.time_spent_ms,
          submittedAt: r.submitted_at,
        }),
      );
    },

    /** Counts participants who started and who completed the task. */
    async getParticipantCounts() {
      const row = db
        .prepare(
          "SELECT COUNT(*) AS started, COUNT(completed_at) AS completed FROM participants",
        )
        .get() as { started: number; completed: number };
      const counts: ParticipantCounts = { started: row.started, completed: row.completed };
      return counts;
    },
  };
}
