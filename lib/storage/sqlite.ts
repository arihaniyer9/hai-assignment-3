/**
 * lib/storage/sqlite.ts
 *
 * SQLite implementation of {@link Storage} on Node's built-in `node:sqlite`. Local development and
 * automated tests only; never loaded in production (Vercel's disk is ephemeral). The schema mirrors
 * supabase/schema.sql, including the partial unique index that allows one open session per code
 * and condition.
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Answer, Condition } from "../constants";
import type { AiOutput, ItemSeed, SessionRecord, TrialRecord } from "../types";
import type { SessionPatch, Storage, TrialPatch } from "./types";

const SCHEMA = `
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS items (
    id TEXT PRIMARY KEY,
    headline TEXT NOT NULL,
    label TEXT NOT NULL CHECK (label IN ('Satire','Real')),
    type TEXT NOT NULL,
    topic TEXT NOT NULL,
    source TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    condition TEXT NOT NULL CHECK (condition IN ('baseline','assisted')),
    consented_at TEXT NOT NULL,
    check_failures INTEGER NOT NULL DEFAULT 0,
    check_passed_at TEXT,
    terminated_at TEXT,
    completed_at TEXT,
    comment TEXT
  );
  CREATE UNIQUE INDEX IF NOT EXISTS sessions_open_code
    ON sessions (code, condition) WHERE terminated_at IS NULL;
  CREATE TABLE IF NOT EXISTS trials (
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    item_id TEXT NOT NULL REFERENCES items(id),
    position INTEGER NOT NULL CHECK (position >= 1),
    initial_answer TEXT CHECK (initial_answer IN ('Satire','Real')),
    initial_confidence INTEGER CHECK (initial_confidence BETWEEN 1 AND 5),
    initial_time_ms INTEGER CHECK (initial_time_ms >= 0),
    initial_at TEXT,
    ai_json TEXT,
    ai_shown_at TEXT,
    final_answer TEXT CHECK (final_answer IN ('Satire','Real')),
    final_confidence INTEGER CHECK (final_confidence BETWEEN 1 AND 5),
    final_time_ms INTEGER CHECK (final_time_ms >= 0),
    final_at TEXT,
    PRIMARY KEY (session_id, item_id),
    UNIQUE (session_id, position)
  );
`;

interface SessionRow {
  id: string;
  code: string;
  condition: Condition;
  consented_at: string;
  check_failures: number;
  check_passed_at: string | null;
  terminated_at: string | null;
  completed_at: string | null;
  comment: string | null;
}

interface TrialRow {
  session_id: string;
  item_id: string;
  position: number;
  headline: string;
  label: Answer;
  type: string;
  initial_answer: Answer | null;
  initial_confidence: number | null;
  initial_time_ms: number | null;
  initial_at: string | null;
  ai_json: string | null;
  ai_shown_at: string | null;
  final_answer: Answer | null;
  final_confidence: number | null;
  final_time_ms: number | null;
  final_at: string | null;
}

const toSession = (r: SessionRow): SessionRecord => ({
  id: r.id,
  code: r.code,
  condition: r.condition,
  consentedAt: r.consented_at,
  checkFailures: r.check_failures,
  checkPassedAt: r.check_passed_at,
  terminatedAt: r.terminated_at,
  completedAt: r.completed_at,
  comment: r.comment,
});

const toTrial = (r: TrialRow): TrialRecord => ({
  sessionId: r.session_id,
  itemId: r.item_id,
  position: r.position,
  headline: r.headline,
  label: r.label,
  type: r.type,
  initialAnswer: r.initial_answer,
  initialConfidence: r.initial_confidence,
  initialTimeMs: r.initial_time_ms,
  initialAt: r.initial_at,
  ai: r.ai_json ? (JSON.parse(r.ai_json) as AiOutput) : null,
  aiShownAt: r.ai_shown_at,
  finalAnswer: r.final_answer,
  finalConfidence: r.final_confidence,
  finalTimeMs: r.final_time_ms,
  finalAt: r.final_at,
});

/** Column names for each patchable field (the only identifiers ever interpolated into SQL). */
const SESSION_COLUMNS: Record<keyof SessionPatch, string> = {
  checkFailures: "check_failures",
  checkPassedAt: "check_passed_at",
  terminatedAt: "terminated_at",
  completedAt: "completed_at",
  comment: "comment",
};
const TRIAL_COLUMNS: Record<keyof TrialPatch, string> = {
  initialAnswer: "initial_answer",
  initialConfidence: "initial_confidence",
  initialTimeMs: "initial_time_ms",
  initialAt: "initial_at",
  ai: "ai_json",
  aiShownAt: "ai_shown_at",
  finalAnswer: "final_answer",
  finalConfidence: "final_confidence",
  finalTimeMs: "final_time_ms",
  finalAt: "final_at",
};

const TRIAL_SELECT = `
  SELECT t.session_id, t.item_id, t.position, i.headline, i.label, i.type,
         t.initial_answer, t.initial_confidence, t.initial_time_ms, t.initial_at,
         t.ai_json, t.ai_shown_at, t.final_answer, t.final_confidence, t.final_time_ms, t.final_at
  FROM trials t JOIN items i ON i.id = t.item_id`;

/**
 * Opens (creating if needed) a SQLite database and returns a Storage backed by it.
 *
 * @param file Path of the database file, or ":memory:" for a throwaway database.
 */
export function createSqliteStorage(file: string): Storage {
  if (file !== ":memory:") mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(SCHEMA);

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

  function update(table: string, columns: Record<string, string>, patch: object, where: string, keys: string[]) {
    const entries = Object.entries(patch).filter(([, v]) => v !== undefined);
    if (entries.length === 0) return;
    const sets = entries.map(([k]) => `${columns[k]} = ?`).join(", ");
    const values = entries.map(([k, v]) => (k === "ai" ? JSON.stringify(v) : v));
    db.prepare(`UPDATE ${table} SET ${sets} WHERE ${where}`).run(...values, ...keys);
  }

  return {
    async seedItems(items) {
      const stmt = db.prepare(
        `INSERT INTO items (id, headline, label, type, topic, source) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET headline = excluded.headline, label = excluded.label,
           type = excluded.type, topic = excluded.topic, source = excluded.source`,
      );
      transaction(() => {
        for (const i of items) stmt.run(i.id, i.headline, i.label, i.type, i.topic, i.source);
      });
    },

    async listItems() {
      return db
        .prepare("SELECT id, headline, label, type, topic, source FROM items ORDER BY id")
        .all() as unknown as ItemSeed[];
    },

    async createSession({ id, code, condition, consentedAt }) {
      try {
        db.prepare(
          "INSERT INTO sessions (id, code, condition, consented_at) VALUES (?, ?, ?, ?)",
        ).run(id, code, condition, consentedAt);
        return "ok";
      } catch (err) {
        const message = err instanceof Error ? err.message : "";
        if (/UNIQUE constraint failed: sessions\.id/i.test(message)) return "id_taken";
        if (/UNIQUE constraint failed: sessions\.code/i.test(message)) return "code_taken";
        throw err;
      }
    },

    async getSession(id) {
      const row = db.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as SessionRow | undefined;
      return row ? toSession(row) : null;
    },

    async findOpenSession(code, condition) {
      const row = db
        .prepare(
          "SELECT * FROM sessions WHERE code = ? AND condition = ? AND terminated_at IS NULL",
        )
        .get(code, condition) as SessionRow | undefined;
      return row ? toSession(row) : null;
    },

    async updateSession(id, patch) {
      update("sessions", SESSION_COLUMNS, patch, "id = ?", [id]);
    },

    async seenItemIds(code) {
      const rows = db
        .prepare(
          `SELECT DISTINCT t.item_id FROM trials t JOIN sessions s ON s.id = t.session_id
           WHERE s.code = ?`,
        )
        .all(code) as { item_id: string }[];
      return new Set(rows.map((r) => r.item_id));
    },

    async createTrials(sessionId, itemIds) {
      const stmt = db.prepare("INSERT INTO trials (session_id, item_id, position) VALUES (?, ?, ?)");
      transaction(() => itemIds.forEach((itemId, i) => stmt.run(sessionId, itemId, i + 1)));
    },

    async listTrials(sessionId) {
      const rows = db
        .prepare(`${TRIAL_SELECT} WHERE t.session_id = ? ORDER BY t.position`)
        .all(sessionId) as unknown as TrialRow[];
      return rows.map(toTrial);
    },

    async updateTrial(sessionId, itemId, patch) {
      update("trials", TRIAL_COLUMNS, patch, "session_id = ? AND item_id = ?", [sessionId, itemId]);
    },

    async listAllSessions() {
      const rows = db
        .prepare("SELECT * FROM sessions ORDER BY consented_at, id")
        .all() as unknown as SessionRow[];
      return rows.map(toSession);
    },

    async listAllTrials() {
      const rows = db
        .prepare(
          `${TRIAL_SELECT} JOIN sessions s ON s.id = t.session_id
           ORDER BY s.consented_at, t.session_id, t.position`,
        )
        .all() as unknown as TrialRow[];
      return rows.map(toTrial);
    },
  };
}
