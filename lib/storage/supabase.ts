/**
 * lib/storage/supabase.ts
 *
 * Supabase (Postgres) implementation of {@link Storage}, used in production.
 * Talks to the database through supabase-js with the SERVICE-ROLE key, so it
 * must only ever run on the server. Table definitions are in
 * `supabase/schema.sql`.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
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

/** PostgREST returns at most 1000 rows per request; we page through larger tables. */
const PAGE = 1000;

/** Row shapes as returned by PostgREST for the queries below. */
interface LabelRow {
  participant_id: string;
  tweet_id: string;
  label: LabelKey;
  confidence: number;
  rationale: string | null;
  time_spent_ms: number;
  submitted_at: string;
}
interface AssignmentRow {
  participant_id: string;
  tweet_id: string;
  position: number;
}

/**
 * Throws if a Supabase response carries an error, otherwise returns its data.
 *
 * @param res A supabase-js response `{ data, error }`.
 * @returns The non-null `data`.
 * @throws Error with the database message when `error` is set.
 */
function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(`Supabase: ${res.error.message}`);
  return res.data as T;
}

/**
 * Creates a Storage backed by a Supabase project.
 *
 * @param url The project URL (SUPABASE_URL).
 * @param serviceRoleKey The service-role secret (SUPABASE_SERVICE_ROLE_KEY).
 * @returns A ready-to-use {@link Storage}.
 */
export function createSupabaseStorage(url: string, serviceRoleKey: string): Storage {
  const sb: SupabaseClient = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  /**
   * Reads every row of a query by paging with `.range()`.
   *
   * @param build Function that returns a fresh query for a given [from, to] range.
   * @returns All rows, concatenated.
   */
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
    /** Inserts or updates the whole tweet pool (idempotent, keyed by tweet id). */
    async seedTweets(tweets) {
      const rows = tweets.map((t) => ({ id: t.id, text: t.text, ground_truth: t.groundTruth }));
      unwrap(await sb.from("tweets").upsert(rows, { onConflict: "id" }).select("id"));
    },

    /** Returns every tweet in the pool including ground truth (server-side use only). */
    async listTweets() {
      const rows = await fetchAll<{ id: string; text: string; ground_truth: Emotion }>((from, to) =>
        sb.from("tweets").select("id, text, ground_truth").order("id").range(from, to),
      );
      return rows.map((r): TweetSeed => ({ id: r.id, text: r.text, groundTruth: r.ground_truth }));
    },

    /** Inserts a participant row; returns false if the ID is already taken so the caller can retry. */
    async createParticipant({ id, nickname, consentedAt }) {
      const { error } = await sb
        .from("participants")
        .insert({ id, nickname, consented_at: consentedAt, created_at: consentedAt });
      if (!error) return true;
      if (error.code === "23505") return false; // unique_violation: ID already taken
      throw new Error(`Supabase: ${error.message}`);
    },

    /** Deletes a participant; assignments and labels are removed by ON DELETE CASCADE. */
    async deleteParticipant(id) {
      unwrap(await sb.from("participants").delete().eq("id", id).select("id"));
    },

    /** Stores the participant's 5 tweets, using each tweet's index + 1 as its position. */
    async createAssignments(participantId, tweetIds) {
      const rows = tweetIds.map((tweet_id, i) => ({
        participant_id: participantId,
        tweet_id,
        position: i + 1,
      }));
      unwrap(await sb.from("assignments").insert(rows).select("tweet_id"));
    },

    /** Loads a participant's resumable state (tweets + saved labels, no ground truth), or null if unknown. */
    async getParticipantState(id) {
      const { data: p, error } = await sb
        .from("participants")
        .select("id, nickname, completed_at")
        .eq("id", id)
        .maybeSingle();
      if (error) throw new Error(`Supabase: ${error.message}`);
      if (!p) return null;

      const assignments = unwrap(
        await sb
          .from("assignments")
          .select("tweet_id, position")
          .eq("participant_id", id)
          .order("position"),
      ) as { tweet_id: string; position: number }[];
      const tweetRows = assignments.length
        ? (unwrap(
            await sb
              .from("tweets")
              .select("id, text")
              .in(
                "id",
                assignments.map((a) => a.tweet_id),
              ),
          ) as { id: string; text: string }[])
        : [];
      const textById = new Map(tweetRows.map((t) => [t.id, t.text]));
      const labels = unwrap(
        await sb
          .from("labels")
          .select("tweet_id, label, confidence, rationale, time_spent_ms, submitted_at")
          .eq("participant_id", id),
      ) as Omit<LabelRow, "participant_id">[];

      const state: ParticipantState = {
        participantId: p.id,
        nickname: p.nickname,
        completed: p.completed_at !== null,
        tweets: assignments.map((a) => ({
          id: a.tweet_id,
          text: textById.get(a.tweet_id) ?? "",
          position: a.position,
        })),
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
      unwrap(
        await sb
          .from("labels")
          .upsert(
            {
              participant_id: participantId,
              tweet_id: tweetId,
              label: input.label,
              confidence: input.confidence,
              rationale: input.rationale,
              time_spent_ms: input.timeSpentMs,
              submitted_at: submittedAt,
            },
            { onConflict: "participant_id,tweet_id" },
          )
          .select("tweet_id"),
      );
    },

    /** Marks the participant as submitted by setting completed_at. */
    async completeParticipant(id, completedAt) {
      unwrap(
        await sb.from("participants").update({ completed_at: completedAt }).eq("id", id).select("id"),
      );
    },

    /** Joins the participant's labels with tweet text and ground truth, ordered by position. */
    async getParticipantResults(id) {
      const assignments = unwrap(
        await sb
          .from("assignments")
          .select("tweet_id, position")
          .eq("participant_id", id)
          .order("position"),
      ) as { tweet_id: string; position: number }[];
      if (!assignments.length) return [];
      const tweets = unwrap(
        await sb
          .from("tweets")
          .select("id, text, ground_truth")
          .in(
            "id",
            assignments.map((a) => a.tweet_id),
          ),
      ) as { id: string; text: string; ground_truth: Emotion }[];
      const labels = unwrap(
        await sb.from("labels").select("tweet_id, label, confidence").eq("participant_id", id),
      ) as { tweet_id: string; label: LabelKey; confidence: number }[];
      const tweetById = new Map(tweets.map((t) => [t.id, t]));
      const labelById = new Map(labels.map((l) => [l.tweet_id, l]));

      const items: DebriefItem[] = [];
      for (const a of assignments) {
        const t = tweetById.get(a.tweet_id);
        const l = labelById.get(a.tweet_id);
        if (!t || !l) continue;
        items.push({
          position: a.position,
          tweetId: a.tweet_id,
          text: t.text,
          yourLabel: l.label,
          confidence: l.confidence,
          groundTruth: t.ground_truth,
        });
      }
      return items;
    },

    /** Returns every label joined with participant and tweet data (admin table and CSV), oldest first. */
    async listAllLabelRows() {
      const labels = await fetchAll<LabelRow>((from, to) =>
        sb
          .from("labels")
          .select("participant_id, tweet_id, label, confidence, rationale, time_spent_ms, submitted_at")
          .order("submitted_at")
          .order("participant_id")
          .order("tweet_id")
          .range(from, to),
      );
      const [participants, tweets, assignments] = await Promise.all([
        fetchAll<{ id: string; nickname: string | null; completed_at: string | null }>((from, to) =>
          sb.from("participants").select("id, nickname, completed_at").order("id").range(from, to),
        ),
        fetchAll<{ id: string; text: string; ground_truth: Emotion }>((from, to) =>
          sb.from("tweets").select("id, text, ground_truth").order("id").range(from, to),
        ),
        fetchAll<AssignmentRow>((from, to) =>
          sb
            .from("assignments")
            .select("participant_id, tweet_id, position")
            .order("participant_id")
            .order("tweet_id")
            .range(from, to),
        ),
      ]);
      const participantById = new Map(participants.map((p) => [p.id, p]));
      const tweetById = new Map(tweets.map((t) => [t.id, t]));
      const positionByKey = new Map(
        assignments.map((a) => [`${a.participant_id}|${a.tweet_id}`, a.position]),
      );

      return labels.map((l): AdminRow => {
        const p = participantById.get(l.participant_id);
        const t = tweetById.get(l.tweet_id);
        const groundTruth = (t?.ground_truth ?? "joy") as Emotion;
        return {
          participantId: l.participant_id,
          nickname: p?.nickname ?? null,
          participantCompleted: Boolean(p?.completed_at),
          position: positionByKey.get(`${l.participant_id}|${l.tweet_id}`) ?? 0,
          tweetId: l.tweet_id,
          tweetText: t?.text ?? "",
          label: l.label,
          groundTruth,
          matchesGroundTruth: l.label === groundTruth,
          confidence: l.confidence,
          rationale: l.rationale,
          timeSpentMs: l.time_spent_ms,
          submittedAt: l.submitted_at,
        };
      });
    },

    /** Counts participants who started and who completed the task. */
    async getParticipantCounts() {
      const started = await sb.from("participants").select("id", { count: "exact", head: true });
      const completed = await sb
        .from("participants")
        .select("id", { count: "exact", head: true })
        .not("completed_at", "is", null);
      if (started.error) throw new Error(`Supabase: ${started.error.message}`);
      if (completed.error) throw new Error(`Supabase: ${completed.error.message}`);
      const counts: ParticipantCounts = {
        started: started.count ?? 0,
        completed: completed.count ?? 0,
      };
      return counts;
    },
  };
}
