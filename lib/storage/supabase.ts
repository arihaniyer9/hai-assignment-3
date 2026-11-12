/**
 * lib/storage/supabase.ts
 *
 * Supabase (Postgres) implementation of {@link Storage}, used in production. Uses the SERVICE-ROLE
 * key, so it must only run on the server. Tables are defined in supabase/schema.sql.
 * tests/storage-contract.test.ts runs the same contract against this back end when
 * SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Answer, Condition } from "../constants";
import type { AiOutput, ItemSeed, SessionRecord, TrialRecord } from "../types";
import type { SessionPatch, Storage, TrialPatch } from "./types";

/** PostgREST returns at most 1000 rows per request; larger reads are paged. */
const PAGE = 1000;

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
  app_version: string | null;
}

interface TrialRow {
  session_id: string;
  item_id: string;
  position: number;
  initial_answer: Answer | null;
  initial_confidence: number | null;
  initial_time_ms: number | null;
  initial_at: string | null;
  initial_revisions: number;
  ai_json: AiOutput | null;
  ai_shown_at: string | null;
  final_answer: Answer | null;
  final_confidence: number | null;
  final_time_ms: number | null;
  final_at: string | null;
  final_revisions: number;
  items: { headline: string; label: Answer; type: string };
}

const TRIAL_FIELDS =
  "session_id, item_id, position, initial_answer, initial_confidence, initial_time_ms, initial_at, " +
  "initial_revisions, ai_json, ai_shown_at, final_answer, final_confidence, final_time_ms, final_at, " +
  "final_revisions, " +
  "items!inner(headline, label, type)";

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
  appVersion: r.app_version,
});

const toTrial = (r: TrialRow): TrialRecord => ({
  sessionId: r.session_id,
  itemId: r.item_id,
  position: r.position,
  headline: r.items.headline,
  label: r.items.label,
  type: r.items.type,
  initialAnswer: r.initial_answer,
  initialConfidence: r.initial_confidence,
  initialTimeMs: r.initial_time_ms,
  initialAt: r.initial_at,
  initialRevisions: r.initial_revisions,
  ai: r.ai_json,
  aiShownAt: r.ai_shown_at,
  finalAnswer: r.final_answer,
  finalConfidence: r.final_confidence,
  finalTimeMs: r.final_time_ms,
  finalAt: r.final_at,
  finalRevisions: r.final_revisions,
});

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
  initialRevisions: "initial_revisions",
  ai: "ai_json",
  aiShownAt: "ai_shown_at",
  finalAnswer: "final_answer",
  finalConfidence: "final_confidence",
  finalTimeMs: "final_time_ms",
  finalAt: "final_at",
  finalRevisions: "final_revisions",
};

function columns(map: Record<string, string>, patch: object): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(patch)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [map[k], v]),
  );
}

function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(`Supabase: ${res.error.message}`);
  return res.data as T;
}

/**
 * Creates a Storage backed by a Supabase project.
 *
 * @param url The project URL (SUPABASE_URL).
 * @param serviceRoleKey The service-role secret (SUPABASE_SERVICE_ROLE_KEY).
 */
export function createSupabaseStorage(url: string, serviceRoleKey: string): Storage {
  const sb: SupabaseClient = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  async function fetchAll<T>(
    build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  ): Promise<T[]> {
    const all: T[] = [];
    for (let from = 0; ; from += PAGE) {
      const rows = unwrap(await build(from, from + PAGE - 1));
      all.push(...rows);
      if (rows.length < PAGE) return all;
    }
  }

  return {
    async seedItems(items) {
      unwrap(await sb.from("items").upsert([...items], { onConflict: "id" }).select("id"));
    },

    async listItems() {
      return fetchAll<ItemSeed>((from, to) =>
        sb.from("items").select("id, headline, label, type, topic, source").order("id").range(from, to),
      );
    },

    async createSession({ id, code, condition, consentedAt, appVersion }) {
      const { error } = await sb
        .from("sessions")
        .insert({ id, code, condition, consented_at: consentedAt, app_version: appVersion });
      if (!error) return "ok";
      if (error.code === "23505") {
        // unique_violation: which constraint tells us whether the id or the open code clashed
        return error.message.includes("sessions_open_code") ? "code_taken" : "id_taken";
      }
      throw new Error(`Supabase: ${error.message}`);
    },

    async getSession(id) {
      const row = unwrap(await sb.from("sessions").select("*").eq("id", id).maybeSingle()) as SessionRow | null;
      return row ? toSession(row) : null;
    },

    async sessionsForCode(code) {
      const rows = unwrap(
        await sb.from("sessions").select("*").eq("code", code).order("consented_at").order("id"),
      ) as SessionRow[];
      return rows.map(toSession);
    },

    async findOpenSession(code, condition) {
      const row = unwrap(
        await sb
          .from("sessions")
          .select("*")
          .eq("code", code)
          .eq("condition", condition)
          .is("terminated_at", null)
          .maybeSingle(),
      ) as SessionRow | null;
      return row ? toSession(row) : null;
    },

    async updateSession(id, patch) {
      const values = columns(SESSION_COLUMNS, patch);
      if (Object.keys(values).length === 0) return;
      unwrap(await sb.from("sessions").update(values).eq("id", id).select("id"));
    },

    async seenItemIds(code) {
      const sessions = unwrap(await sb.from("sessions").select("id").eq("code", code)) as { id: string }[];
      if (sessions.length === 0) return new Set();
      const rows = unwrap(
        await sb
          .from("trials")
          .select("item_id")
          .in(
            "session_id",
            sessions.map((s) => s.id),
          ),
      ) as { item_id: string }[];
      return new Set(rows.map((r) => r.item_id));
    },

    async createTrials(sessionId, itemIds) {
      const rows = itemIds.map((item_id, i) => ({ session_id: sessionId, item_id, position: i + 1 }));
      unwrap(await sb.from("trials").insert(rows).select("item_id"));
    },

    async listTrials(sessionId) {
      const rows = unwrap(
        await sb.from("trials").select(TRIAL_FIELDS).eq("session_id", sessionId).order("position"),
      ) as unknown as TrialRow[];
      return rows.map(toTrial);
    },

    async updateTrial(sessionId, itemId, patch) {
      const values = columns(TRIAL_COLUMNS, patch);
      if (Object.keys(values).length === 0) return;
      unwrap(
        await sb
          .from("trials")
          .update(values)
          .eq("session_id", sessionId)
          .eq("item_id", itemId)
          .select("item_id"),
      );
    },

    async listAllSessions() {
      const rows = await fetchAll<SessionRow>((from, to) =>
        sb.from("sessions").select("*").order("consented_at").order("id").range(from, to),
      );
      return rows.map(toSession);
    },

    async listAllTrials() {
      const sessions = await this.listAllSessions();
      const order = new Map(sessions.map((s, i) => [s.id, i]));
      const rows = await fetchAll<TrialRow>(
        (from, to) =>
          sb
            .from("trials")
            .select(TRIAL_FIELDS)
            .order("session_id")
            .order("position")
            .range(from, to) as unknown as PromiseLike<{
            data: TrialRow[] | null;
            error: { message: string } | null;
          }>,
      );
      return rows
        .map(toTrial)
        .sort(
          (a, b) =>
            (order.get(a.sessionId) ?? 0) - (order.get(b.sessionId) ?? 0) || a.position - b.position,
        );
    },
  };
}
