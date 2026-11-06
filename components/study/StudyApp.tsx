"use client";
/**
 * components/study/StudyApp.tsx
 *
 * The whole participant flow for one condition, as a small state machine driven by the server's
 * session state: intro (consent + code) -> instruction check -> trials -> optional comment -> done.
 * The server enforces every rule (order, write-once answers, AI only after the own answer); this
 * component only follows the state it is given, so a refresh always resumes at the right step.
 */
import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api-client";
import { clearStoredSessionId, getStoredSessionId, storeSessionId } from "@/lib/client-session";
import type { Answer, Condition } from "@/lib/constants";
import type { DebriefSummary, SessionState, TrialPublic } from "@/lib/types";
import { CheckStep } from "./CheckStep";
import { DoneStep, FinishStep, TerminatedStep } from "./EndSteps";
import { IntroStep } from "./IntroStep";
import { TrialStep } from "./TrialStep";

const errorText = (err: unknown) => (err instanceof Error ? err.message : "Something went wrong.");

/** Whether the participant still has to do something on this trial. */
function pending(session: SessionState, t: TrialPublic): boolean {
  const needsFinal = session.condition === "assisted" && !t.isCatch;
  return needsFinal ? t.finalAnswer === null : t.initialAnswer === null;
}

export function StudyApp({ condition }: { condition: Condition }) {
  const [loaded, setLoaded] = useState(false);
  const [session, setSession] = useState<SessionState | null>(null);
  const [summary, setSummary] = useState<DebriefSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Resume this browser's session for this condition, if any.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const id = getStoredSessionId(condition);
      if (id) {
        try {
          const state = await api.getState(id);
          if (cancelled) return;
          setSession(state);
          if (state.status === "done") setSummary(await api.summary(id));
        } catch (err) {
          if (err instanceof ApiError && err.status === 404) clearStoredSessionId(condition);
          else if (!cancelled) setError(errorText(err));
        }
      }
      if (!cancelled) setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [condition]);

  const run = useCallback(async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }, []);

  const updateTrial = (itemId: string, patch: Partial<TrialPublic>) =>
    setSession((s) => s && { ...s, trials: s.trials.map((t) => (t.itemId === itemId ? { ...t, ...patch } : t)) });

  const current = session?.status === "trials" ? session.trials.find((t) => pending(session, t)) : undefined;
  const assisted = condition === "assisted";
  const needsAi = !!current && assisted && !current.isCatch && current.initialAnswer !== null && !current.ai;

  // After the own answer is saved, fetch (and so log) the AI's output for this trial.
  useEffect(() => {
    if (!session || !current || !needsAi) return;
    let cancelled = false;
    api
      .showAi(session.sessionId, current.itemId)
      .then(({ ai }) => !cancelled && updateTrial(current.itemId, { ai }))
      .catch((err) => !cancelled && setError(errorText(err)));
    return () => {
      cancelled = true;
    };
  }, [session, current, needsAi]);

  if (!loaded) {
    return <div className="skeleton" style={{ height: 240 }} aria-busy="true" aria-label="Loading" />;
  }

  if (!session) {
    return (
      <IntroStep
        condition={condition}
        busy={busy}
        error={error}
        onStart={(code) =>
          run(async () => {
            const state = await api.start(condition, code);
            storeSessionId(condition, state.sessionId);
            setSession(state);
          })
        }
      />
    );
  }

  if (session.status === "terminated") {
    return (
      <TerminatedStep
        onRestart={() => {
          clearStoredSessionId(condition);
          setSession(null);
          setError(null);
        }}
      />
    );
  }

  if (session.status === "check") {
    return (
      <CheckStep
        failures={session.checkFailures}
        busy={busy}
        error={error}
        onAnswer={(answer) => run(async () => setSession((await api.check(session.sessionId, answer)).state))}
      />
    );
  }

  if (session.status === "done") {
    return summary ? (
      <DoneStep summary={summary} />
    ) : (
      <div className="notice notice--error" role="alert">
        {error ?? "Loading your score…"}
      </div>
    );
  }

  if (!current) {
    return (
      <FinishStep
        busy={busy}
        error={error}
        onFinish={(comment) =>
          run(async () => {
            const result = await api.complete(session.sessionId, comment);
            setSummary(result);
            setSession({ ...session, status: "done" });
          })
        }
      />
    );
  }

  if (needsAi) {
    return error ? (
      <div className="notice notice--error" role="alert">
        {error}{" "}
        <button
          className="btn btn--secondary"
          type="button"
          onClick={() => {
            setError(null);
            setSession({ ...session });
          }}
        >
          Try again
        </button>
      </div>
    ) : (
      <div className="card" aria-busy="true">
        <p>Getting the AI&apos;s suggestion…</p>
      </div>
    );
  }

  const phase = assisted && !current.isCatch && current.ai ? "final" : "own";
  const save = (answer: Answer, confidence: number, timeMs: number) =>
    run(async () => {
      const payload = { itemId: current.itemId, answer, confidence, timeMs };
      if (phase === "own") {
        await api.saveInitial(session.sessionId, payload);
        updateTrial(current.itemId, { initialAnswer: answer, initialConfidence: confidence });
      } else {
        await api.saveFinal(session.sessionId, payload);
        updateTrial(current.itemId, { finalAnswer: answer, finalConfidence: confidence });
      }
    });

  return (
    <TrialStep
      key={`${current.itemId}-${phase}`}
      trial={current}
      phase={phase}
      number={current.position}
      total={session.trials.length}
      assisted={assisted}
      busy={busy}
      error={error}
      onSubmit={save}
    />
  );
}
