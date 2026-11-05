"use client";
/**
 * components/TaskClient.tsx
 *
 * Loads the browser's participant session from the server and decides what
 * the /task route shows: a loading skeleton, the labeling screen, an error
 * with a retry, or a redirect (no session -> home, already submitted -> /done).
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api-client";
import { clearStoredParticipantId, getStoredParticipantId } from "@/lib/client-session";
import type { ParticipantState } from "@/lib/types";
import { LabelTask } from "./LabelTask";

/**
 * Renders the /task route's content.
 *
 * @returns The labeling flow or a status screen.
 */
export function TaskClient() {
  const router = useRouter();
  const [state, setState] = useState<ParticipantState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const id = getStoredParticipantId();
    if (!id) {
      router.replace("/");
      return;
    }
    let cancelled = false;
    api
      .getState(id)
      .then((s) => {
        if (cancelled) return;
        if (s.completed) router.replace("/done");
        else setState(s);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          clearStoredParticipantId(); // stale ID (e.g. database was reset)
          router.replace("/");
        } else {
          setError(err instanceof Error ? err.message : "Could not load your task.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [router, attempt]);

  if (error) {
    return (
      <div className="container">
        <div className="notice notice--error" role="alert">
          <p>{error}</p>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => {
              setError(null);
              setAttempt((n) => n + 1);
            }}
          >
            Try again
          </button>{" "}
          <Link href="/">Back to start</Link>
        </div>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="container" aria-busy="true" aria-label="Loading your task">
        <div className="skeleton" style={{ height: 28, width: "50%", marginBottom: 16 }} />
        <div className="skeleton" style={{ height: 120, marginBottom: 16 }} />
        <div className="skeleton" style={{ height: 240 }} />
      </div>
    );
  }

  return <LabelTask participantId={state.participantId} tweets={state.tweets} savedLabels={state.labels} />;
}
