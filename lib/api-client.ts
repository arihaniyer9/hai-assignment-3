/**
 * lib/api-client.ts
 *
 * Typed `fetch` wrappers for the app's own API, used by React components.
 * Every function either resolves with typed data or rejects with an
 * {@link ApiError} whose `message` is safe to show to the participant.
 */
import type { LabelKey } from "./emotions";
import type { AdminRow, AdminStats, DebriefItem, ParticipantState, TweetPublic } from "./types";

/** An API failure with an HTTP status (0 = network problem) and machine code. */
export class ApiError extends Error {
  /**
   * @param status HTTP status, or 0 when the server could not be reached.
   * @param code Machine-readable error code from the server.
   * @param message Human-readable message.
   */
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Performs a JSON request and unwraps the `{ error }` envelope on failure.
 *
 * @param path API path, e.g. "/api/participants".
 * @param init Optional fetch settings.
 * @returns The parsed JSON body.
 * @throws ApiError on network failure or a non-2xx response.
 */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch {
    throw new ApiError(0, "network", "Can't reach the server. Check your connection and try again.");
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(
      res.status,
      body?.error?.code ?? "unknown",
      body?.error?.message ?? "Something went wrong. Please try again.",
    );
  }
  return body as T;
}

/** The payload for saving one label. */
export interface LabelPayload {
  tweetId: string;
  label: LabelKey;
  confidence: number;
  rationale: string | null;
  timeSpentMs: number;
}

/** All API calls used by the UI. */
export const api = {
  /** Registers a participant (requires consent) and returns their 5 tweets. */
  createParticipant: (nickname: string, consent: true) =>
    request<{ participantId: string; tweets: TweetPublic[] }>("/api/participants", {
      method: "POST",
      body: JSON.stringify({ nickname: nickname || undefined, consent }),
    }),
  /** Loads a participant's resumable state. */
  getState: (id: string) => request<ParticipantState>(`/api/participants/${id}`),
  /** Saves one label (idempotent, safe to retry). */
  saveLabel: (id: string, payload: LabelPayload) =>
    request<{ ok: true }>(`/api/participants/${id}/labels`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  /** Submits the session and returns the debrief. */
  complete: (id: string) =>
    request<{ items: DebriefItem[] }>(`/api/participants/${id}/complete`, { method: "POST" }),
  /** Fetches the debrief of a completed participant. */
  getResults: (id: string) => request<{ items: DebriefItem[] }>(`/api/participants/${id}/results`),
  /** Admin: logs in with the shared password. */
  adminLogin: (password: string) =>
    request<{ ok: true }>("/api/admin/login", { method: "POST", body: JSON.stringify({ password }) }),
  /** Admin: logs out. */
  adminLogout: () => request<{ ok: true }>("/api/admin/logout", { method: "POST" }),
  /** Admin: loads all rows and stats (401 when not logged in). */
  adminData: () => request<{ rows: AdminRow[]; stats: AdminStats }>("/api/admin/data"),
};
