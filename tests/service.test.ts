/**
 * tests/service.test.ts — business rules, run against a throwaway in-memory
 * SQLite database through the same Storage interface Supabase implements.
 * Also acts as the storage "contract" test for the SQLite adapter.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { loadTweetSeeds } from "../lib/dataset";
import {
  ServiceError,
  TWEETS_PER_PARTICIPANT,
  completeParticipant,
  getParticipantState,
  getResults,
  saveLabel,
  startParticipant,
} from "../lib/service";
import { computeAdminStats } from "../lib/stats";
import { createSqliteStorage } from "../lib/storage/sqlite";
import type { Storage } from "../lib/storage/types";
import type { LabelSubmitInput } from "../lib/validation";

let storage: Storage;

/** Builds a valid label payload for a tweet, overriding only what a test cares about. */
const label = (tweetId: string, over: Partial<LabelSubmitInput> = {}): LabelSubmitInput => ({
  tweetId,
  label: "joy",
  confidence: 3,
  rationale: null,
  timeSpentMs: 1234,
  ...over,
});

/** Runs `fn` and returns the ServiceError it throws (fails if it doesn't). */
async function failure(fn: () => Promise<unknown>): Promise<ServiceError> {
  try {
    await fn();
  } catch (err) {
    expect(err).toBeInstanceOf(ServiceError);
    return err as ServiceError;
  }
  throw new Error("expected a ServiceError");
}

beforeEach(async () => {
  storage = createSqliteStorage(":memory:");
  await storage.seedTweets(loadTweetSeeds());
});

describe("dataset", () => {
  it("has at least 50 tweets covering all six emotions", async () => {
    const tweets = await storage.listTweets();
    expect(tweets.length).toBeGreaterThanOrEqual(50);
    expect(new Set(tweets.map((t) => t.groundTruth)).size).toBe(6);
  });
  it("seeding twice does not duplicate tweets", async () => {
    const before = (await storage.listTweets()).length;
    await storage.seedTweets(loadTweetSeeds());
    expect((await storage.listTweets()).length).toBe(before);
  });
});

describe("startParticipant", () => {
  it("assigns 5 distinct tweets and never exposes ground truth", async () => {
    const { participantId, tweets } = await startParticipant({ consent: true }, storage);
    expect(participantId).toMatch(/^P-/);
    expect(tweets).toHaveLength(TWEETS_PER_PARTICIPANT);
    expect(new Set(tweets.map((t) => t.id)).size).toBe(5);
    expect(tweets.map((t) => t.position)).toEqual([1, 2, 3, 4, 5]);
    expect(JSON.stringify(tweets)).not.toContain("groundTruth");
  });
  it("gives different participants different sets", async () => {
    const sets = new Set<string>();
    for (let i = 0; i < 10; i++) {
      const { tweets } = await startParticipant({ consent: true }, storage);
      sets.add(tweets.map((t) => t.id).sort().join(","));
    }
    expect(sets.size).toBeGreaterThan(5);
  });
  it("stores the optional nickname", async () => {
    const { participantId } = await startParticipant({ consent: true, nickname: "Sam" }, storage);
    expect((await getParticipantState(participantId, storage)).nickname).toBe("Sam");
  });
  it("reports unavailable when the pool is empty", async () => {
    const empty = createSqliteStorage(":memory:");
    expect((await failure(() => startParticipant({ consent: true }, empty))).code).toBe("unavailable");
  });
});

describe("saveLabel", () => {
  it("records who labeled which tweet with which label, and upserts on re-save", async () => {
    const { participantId, tweets } = await startParticipant({ consent: true }, storage);
    await saveLabel(participantId, label(tweets[0].id, { label: "anger", confidence: 5 }), storage);
    await saveLabel(participantId, label(tweets[0].id, { label: "fear", confidence: 2, rationale: "ok" }), storage);
    const state = await getParticipantState(participantId, storage);
    expect(state.labels).toHaveLength(1);
    expect(state.labels[0]).toMatchObject({ tweetId: tweets[0].id, label: "fear", confidence: 2, rationale: "ok" });
    expect(JSON.stringify(state)).not.toContain("groundTruth");
  });
  it("rejects tweets not assigned to the participant", async () => {
    const { participantId, tweets } = await startParticipant({ consent: true }, storage);
    const assigned = new Set(tweets.map((t) => t.id));
    const other = (await storage.listTweets()).find((t) => !assigned.has(t.id))!;
    expect((await failure(() => saveLabel(participantId, label(other.id), storage))).code).toBe("forbidden");
  });
  it("rejects unknown participants", async () => {
    expect((await failure(() => saveLabel("P-AAAAAA", label("t001"), storage))).code).toBe("not_found");
  });
});

describe("completeParticipant / getResults", () => {
  it("requires all 5 tweets to be labeled", async () => {
    const { participantId, tweets } = await startParticipant({ consent: true }, storage);
    for (const t of tweets.slice(0, 4)) await saveLabel(participantId, label(t.id), storage);
    expect((await failure(() => completeParticipant(participantId, storage))).code).toBe("invalid");
  });
  it("hides results until completion, then reveals ground truth and locks editing", async () => {
    const { participantId, tweets } = await startParticipant({ consent: true }, storage);
    expect((await failure(() => getResults(participantId, storage))).code).toBe("forbidden");
    for (const t of tweets) await saveLabel(participantId, label(t.id), storage);
    const items = await completeParticipant(participantId, storage);
    expect(items).toHaveLength(5);
    for (const item of items) expect(item.groundTruth).toBeTruthy();
    expect(await getResults(participantId, storage)).toEqual(items);
    expect((await getParticipantState(participantId, storage)).completed).toBe(true);
    expect((await failure(() => saveLabel(participantId, label(tweets[0].id), storage))).code).toBe("conflict");
    expect(await completeParticipant(participantId, storage)).toEqual(items); // idempotent
  });
});

describe("admin data", () => {
  it("joins labels with participant, tweet and ground truth and counts participants", async () => {
    const a = await startParticipant({ consent: true, nickname: "Ada" }, storage);
    const b = await startParticipant({ consent: true }, storage);
    for (const t of a.tweets) await saveLabel(a.participantId, label(t.id), storage);
    await completeParticipant(a.participantId, storage);
    await saveLabel(b.participantId, label(b.tweets[0].id, { label: "unsure" }), storage);

    const rows = await storage.listAllLabelRows();
    expect(rows).toHaveLength(6);
    const adaRows = rows.filter((r) => r.participantId === a.participantId);
    expect(adaRows.every((r) => r.nickname === "Ada" && r.participantCompleted)).toBe(true);
    expect(adaRows.map((r) => r.position).sort()).toEqual([1, 2, 3, 4, 5]);
    for (const r of rows) expect(r.matchesGroundTruth).toBe(r.label === r.groundTruth);

    const counts = await storage.getParticipantCounts();
    expect(counts).toEqual({ started: 2, completed: 1 });
    expect(computeAdminStats(rows, counts).labelsCollected).toBe(6);
  });
});
