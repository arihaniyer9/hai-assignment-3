/**
 * lib/service.ts
 *
 * The application's business rules, independent of HTTP and of the database
 * back end. API routes call these functions; these functions call `Storage`.
 *
 * Rules enforced here:
 *   - each participant gets 5 distinct tweets drawn uniformly at random;
 *   - a participant may only label tweets assigned to them;
 *   - labels can be edited until the participant submits, and never after;
 *   - submission requires all 5 tweets to be labeled;
 *   - ground truth is only returned by {@link getResults}/{@link completeParticipant},
 *     i.e. after the participant has submitted.
 */
import { TWEETS_PER_PARTICIPANT } from "./constants";
import { generateParticipantId } from "./ids";
import { sampleTweets } from "./sampling";
import { getStorage } from "./storage";
import type { Storage } from "./storage/types";
import type { DebriefItem, ParticipantState, TweetPublic } from "./types";
import type { CreateParticipantInput, LabelSubmitInput } from "./validation";

export { TWEETS_PER_PARTICIPANT };

/** Machine-readable failure categories the API layer maps to HTTP statuses. */
export type ServiceErrorCode = "not_found" | "forbidden" | "conflict" | "invalid" | "unavailable";

/** An expected, user-facing failure (as opposed to a bug or outage). */
export class ServiceError extends Error {
  /**
   * @param code Failure category.
   * @param message Short explanation safe to show to the participant.
   */
  constructor(
    public readonly code: ServiceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ServiceError";
  }
}

/**
 * Loads a participant's state or throws `not_found`.
 *
 * @param storage The storage to read from.
 * @param id Participant ID.
 * @returns The participant's state.
 */
async function requireState(storage: Storage, id: string): Promise<ParticipantState> {
  const state = await storage.getParticipantState(id);
  if (!state) throw new ServiceError("not_found", "Participant not found.");
  return state;
}

/**
 * Registers a new participant (after consent) and draws their 5 random tweets.
 *
 * @param input Validated request body (nickname optional, consent must be true).
 * @param storage Storage to use (defaults to the environment's storage).
 * @returns The new participant ID and their tweets, WITHOUT ground truth.
 * @throws ServiceError `unavailable` when the tweet pool has not been seeded.
 */
export async function startParticipant(
  input: CreateParticipantInput,
  storage?: Storage,
): Promise<{ participantId: string; tweets: TweetPublic[] }> {
  const store = storage ?? (await getStorage());
  const pool = await store.listTweets();
  if (pool.length < TWEETS_PER_PARTICIPANT) {
    throw new ServiceError("unavailable", "The task is not set up yet. Please try again later.");
  }

  // IDs are random; on the (very unlikely) collision simply draw another one.
  let participantId = "";
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = generateParticipantId();
    const created = await store.createParticipant({
      id: candidate,
      nickname: input.nickname ?? null,
      consentedAt: new Date().toISOString(),
    });
    if (created) {
      participantId = candidate;
      break;
    }
  }
  if (!participantId) throw new ServiceError("unavailable", "Could not create a participant ID.");

  const drawn = sampleTweets(pool, TWEETS_PER_PARTICIPANT);
  try {
    await store.createAssignments(
      participantId,
      drawn.map((t) => t.id),
    );
  } catch (err) {
    await store.deleteParticipant(participantId); // do not leave an orphan participant
    throw err;
  }
  return {
    participantId,
    tweets: drawn.map((t, i) => ({ id: t.id, text: t.text, position: i + 1 })),
  };
}

/**
 * Returns a participant's resumable state (tweets and saved labels, no ground truth).
 *
 * @param id Participant ID.
 * @param storage Storage to use (defaults to the environment's storage).
 * @throws ServiceError `not_found` for unknown IDs.
 */
export async function getParticipantState(id: string, storage?: Storage): Promise<ParticipantState> {
  return requireState(storage ?? (await getStorage()), id);
}

/**
 * Saves (creates or overwrites) one label for one of the participant's tweets.
 *
 * @param id Participant ID.
 * @param input Validated label payload.
 * @param storage Storage to use (defaults to the environment's storage).
 * @throws ServiceError `not_found`, `conflict` (already submitted) or
 *   `forbidden` (tweet not assigned to this participant).
 */
export async function saveLabel(
  id: string,
  input: LabelSubmitInput,
  storage?: Storage,
): Promise<void> {
  const store = storage ?? (await getStorage());
  const state = await requireState(store, id);
  if (state.completed) throw new ServiceError("conflict", "This session has already been submitted.");
  if (!state.tweets.some((t) => t.id === input.tweetId)) {
    throw new ServiceError("forbidden", "That tweet is not part of your task.");
  }
  await store.upsertLabel(
    id,
    input.tweetId,
    {
      label: input.label,
      confidence: input.confidence,
      rationale: input.rationale,
      timeSpentMs: input.timeSpentMs,
    },
    new Date().toISOString(),
  );
}

/**
 * Submits the participant's session. Requires every assigned tweet to be
 * labeled. Idempotent: submitting twice just returns the debrief again.
 *
 * @param id Participant ID.
 * @param storage Storage to use (defaults to the environment's storage).
 * @returns The debrief (now including ground truth).
 * @throws ServiceError `not_found` or `invalid` (some tweets still unlabeled).
 */
export async function completeParticipant(id: string, storage?: Storage): Promise<DebriefItem[]> {
  const store = storage ?? (await getStorage());
  const state = await requireState(store, id);
  if (!state.completed) {
    const labeled = new Set(state.labels.map((l) => l.tweetId));
    if (!state.tweets.every((t) => labeled.has(t.id))) {
      throw new ServiceError("invalid", "Please label all of your tweets before submitting.");
    }
    await store.completeParticipant(id, new Date().toISOString());
  }
  return store.getParticipantResults(id);
}

/**
 * Returns the debrief (labels vs. ground truth). Only available after submission,
 * so ground truth can never influence the labeling itself.
 *
 * @param id Participant ID.
 * @param storage Storage to use (defaults to the environment's storage).
 * @throws ServiceError `not_found`, or `forbidden` when not yet submitted.
 */
export async function getResults(id: string, storage?: Storage): Promise<DebriefItem[]> {
  const store = storage ?? (await getStorage());
  const state = await requireState(store, id);
  if (!state.completed) {
    throw new ServiceError("forbidden", "Results are available after you submit.");
  }
  return store.getParticipantResults(id);
}
