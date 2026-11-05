"use client";
/**
 * components/StartPanel.tsx
 *
 * The consent + start card on the home page. It adapts to the browser's
 * session state, which it looks up on the server:
 *
 *   no session          -> nickname field, consent checkbox, "Start" button
 *   session in progress -> "Continue where you left off"
 *   session completed   -> "Thanks" + link to the summary (one submission per browser)
 *
 * A "Start new participant (testing)" control clears the browser session.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api-client";
import { clearStoredParticipantId, storeParticipantId, useStoredParticipantId } from "@/lib/client-session";
import type { ParticipantState } from "@/lib/types";
import { NewParticipantButton } from "./NewParticipantButton";

/** Result of looking up the stored session on the server. */
interface Lookup {
  id: string;
  /** The participant's state, or null when it could not be loaded. */
  state: ParticipantState | null;
}

/**
 * Renders the consent / continue / completed panel.
 *
 * @returns The panel card.
 */
export function StartPanel() {
  const router = useRouter();
  const storedId = useStoredParticipantId();
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [consent, setConsent] = useState(false);
  const [nickname, setNickname] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // When this browser has a stored session, ask the server what state it is in.
  useEffect(() => {
    if (!storedId) return;
    let cancelled = false;
    api
      .getState(storedId)
      .then((state) => {
        if (!cancelled) setLookup({ id: storedId, state });
      })
      .catch((err) => {
        if (cancelled) return;
        // Unknown ID (e.g. the database was reset): forget it. Otherwise offer a fresh start.
        if (err instanceof ApiError && err.status === 404) clearStoredParticipantId();
        else setLookup({ id: storedId, state: null });
      });
    return () => {
      cancelled = true;
    };
  }, [storedId]);

  // Derive which variant to show (loading until we know).
  const state = lookup && lookup.id === storedId ? lookup.state : undefined;
  let view: "loading" | "new" | "resume" | "done";
  if (storedId === undefined) view = "loading";
  else if (storedId === null) view = "new";
  else if (state === undefined) view = "loading";
  else if (state === null) view = "new";
  else view = state.completed ? "done" : "resume";

  /**
   * Registers a participant, remembers their ID and goes to the task.
   *
   * @param e The form submit event.
   */
  async function start(e: React.FormEvent) {
    e.preventDefault();
    if (!consent || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { participantId } = await api.createParticipant(nickname.trim(), true);
      storeParticipantId(participantId);
      router.push("/task");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
    }
  }

  if (view === "loading") {
    return (
      <section className="card" aria-busy="true" aria-label="Loading">
        <div className="skeleton" style={{ height: 24, width: "40%", marginBottom: 16 }} />
        <div className="skeleton" style={{ height: 44, marginBottom: 12 }} />
        <div className="skeleton" style={{ height: 44 }} />
      </section>
    );
  }

  if (view === "resume" && state) {
    const done = state.labels.length;
    return (
      <section className="card" aria-labelledby="resume-title">
        <h2 id="resume-title">Welcome back</h2>
        <p>
          You have labeled {done} of {state.tweets.length} tweets as participant{" "}
          <strong>{state.participantId}</strong>. Your answers are saved.
        </p>
        <p>
          <Link href="/task" className="btn btn--primary">
            Continue where you left off
          </Link>
        </p>
        <NewParticipantButton />
      </section>
    );
  }

  if (view === "done" && state) {
    return (
      <section className="card" aria-labelledby="done-title">
        <h2 id="done-title">Thank you, you have already taken part</h2>
        <p>
          This browser has submitted its answers as participant <strong>{state.participantId}</strong>.
        </p>
        <p>
          <Link href="/done" className="btn btn--primary">
            View your summary
          </Link>
        </p>
        <NewParticipantButton />
      </section>
    );
  }

  return (
    <section className="card" aria-labelledby="start-title">
      <h2 id="start-title">Ready to start?</h2>
      <form onSubmit={start} noValidate>
        <div className="field">
          <label htmlFor="nickname">Nickname (optional)</label>
          <p className="field__hint" id="nickname-hint">
            Only if you want to be recognisable in the results. Leave it blank to stay anonymous.
          </p>
          <input
            id="nickname"
            className="input"
            type="text"
            maxLength={30}
            autoComplete="off"
            aria-describedby="nickname-hint"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
          />
        </div>

        <label className="check">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>
            I have read the information above, I understand what is recorded, and I agree to take part.
          </span>
        </label>

        {error && (
          <div className="notice notice--error" role="alert">
            {error}
          </div>
        )}

        <button type="submit" className="btn btn--primary btn--block" disabled={!consent || busy}>
          {busy ? "Starting…" : "Start the task"}
        </button>
        {!consent && (
          <p className="muted small" style={{ marginTop: 8 }}>
            Tick the box above to enable the Start button.
          </p>
        )}
      </form>
    </section>
  );
}
