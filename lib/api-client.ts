/**
 * lib/api-client.ts
 *
 * Typed `fetch` wrappers for the app's own API, used by React components. Every call resolves with
 * typed data or rejects with an {@link ApiError} whose message is safe to show to the participant.
 */
import type { Answer, Condition } from "./constants";
import type { AdminStats, AiOutput, DebriefSummary, SessionRecord, SessionState, TrialRecord } from "./types";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
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

export interface AnswerPayload {
  itemId: string;
  answer: Answer;
  confidence: number;
  timeMs: number;
}

const post = (body: unknown) => ({ method: "POST", body: JSON.stringify(body) });
const put = (body: unknown) => ({ method: "PUT", body: JSON.stringify(body) });

export const api = {
  start: (condition: Condition, code: string) =>
    request<SessionState>("/api/sessions", post({ condition, code, consent: true })),
  getState: (id: string) => request<SessionState>(`/api/sessions/${id}`),
  check: (id: string, answer: string) =>
    request<{ correct: boolean; state: SessionState }>(`/api/sessions/${id}/check`, post({ answer })),
  saveInitial: (id: string, p: AnswerPayload) => request<{ ok: true }>(`/api/sessions/${id}/initial`, put(p)),
  showAi: (id: string, itemId: string) => request<{ ai: AiOutput }>(`/api/sessions/${id}/ai`, post({ itemId })),
  saveFinal: (id: string, p: AnswerPayload) => request<{ ok: true }>(`/api/sessions/${id}/final`, put(p)),
  complete: (id: string, comment: string) =>
    request<DebriefSummary>(`/api/sessions/${id}/complete`, post({ comment })),
  summary: (id: string) => request<DebriefSummary>(`/api/sessions/${id}/summary`),
  adminLogin: (password: string) => request<{ ok: true }>("/api/admin/login", post({ password })),
  adminLogout: () => request<{ ok: true }>("/api/admin/logout", { method: "POST" }),
  adminData: () =>
    request<{ sessions: SessionRecord[]; trials: TrialRecord[]; stats: AdminStats }>("/api/admin/data"),
};
