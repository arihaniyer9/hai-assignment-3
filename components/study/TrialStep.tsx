"use client";
/**
 * components/study/TrialStep.tsx
 *
 * One answer on one headline. The parent decides the phase:
 *   "own"   the participant's own answer (the only one in the baseline condition);
 *   "final" the answer after seeing the AI (assisted condition), shown under the AI panel and
 *           pre-filled with their own answer, while confidence must be given again.
 * Next stays disabled until an answer and a confidence are chosen, and says why. Keyboard: S picks
 * Satire, R picks Real. Time on screen is counted only while the tab is visible.
 */
import { useEffect, useRef, useState } from "react";
import { type Answer } from "@/lib/constants";
import type { TrialPublic } from "@/lib/types";
import { useVisibleTimer } from "@/lib/use-visible-timer";
import { AiPanel } from "../AiPanel";
import { AnswerChoice } from "../AnswerChoice";
import { ConfidenceScale } from "../ConfidenceScale";

interface Props {
  trial: TrialPublic;
  phase: "own" | "final";
  number: number;
  total: number;
  assisted: boolean;
  busy: boolean;
  error: string | null;
  onSubmit: (answer: Answer, confidence: number, timeMs: number) => void;
}

export function TrialStep({ trial, phase, number, total, assisted, busy, error, onSubmit }: Props) {
  const [answer, setAnswer] = useState<Answer | null>(phase === "final" ? trial.initialAnswer : null);
  const [confidence, setConfidence] = useState<number | null>(null);
  const timer = useVisibleTimer();
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement && e.target.type === "text") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "s" || e.key === "S") setAnswer("Satire");
      if (e.key === "r" || e.key === "R") setAnswer("Real");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const ready = answer !== null && confidence !== null;
  const last = number === total;
  const willSeeAi = assisted && phase === "own" && !trial.isCatch;
  const button = willSeeAi ? "Lock in and see the AI" : last ? "Finish" : "Next headline";

  return (
    <div className="trial">
      <div className="task-header">
        <div className="task-header__row">
          <h1 ref={heading} tabIndex={-1}>
            Headline {number} of {total}
          </h1>
          <span className="muted small">{phase === "final" ? "Step 2 of 2: your final answer" : willSeeAi ? "Step 1 of 2: your own answer" : ""}</span>
        </div>
        <div className="progress" aria-hidden="true">
          <div className="progress__bar" style={{ width: `${((number - 1) / total) * 100}%` }} />
        </div>
      </div>

      {phase === "final" && trial.ai ? (
        <>
          <p className="recap">
            Your own answer: <strong>{trial.initialAnswer}</strong>, confidence {trial.initialConfidence} of 5
          </p>
          <AiPanel headline={trial.headline} ai={trial.ai} />
        </>
      ) : (
        <div className="tweet-card">
          <p className="tweet-card__label">Headline</p>
          <p className="tweet-card__text">{trial.headline}</p>
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (ready && !busy) onSubmit(answer, confidence, timer.read());
        }}
      >
        <AnswerChoice
          name={`answer-${phase}`}
          legend={phase === "final" ? "Your final answer: Satire or Real?" : "Satire or Real?"}
          value={answer}
          onChange={setAnswer}
        />
        <fieldset className="group">
          <legend>{phase === "final" ? "How sure are you now?" : "How sure are you?"}</legend>
          <ConfidenceScale name={`confidence-${phase}`} value={confidence} onChange={setConfidence} />
        </fieldset>
        {error && (
          <div className="notice notice--error" role="alert">
            {error}
          </div>
        )}
        <div className="action-bar">
          {!ready && (
            <p className="action-bar__hint" aria-live="polite">
              {answer === null ? "Choose Satire or Real." : "Choose how sure you are."}
            </p>
          )}
          <div className="action-bar__buttons">
            <button className="btn btn--primary" type="submit" disabled={!ready || busy}>
              {busy ? "Saving…" : button}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
