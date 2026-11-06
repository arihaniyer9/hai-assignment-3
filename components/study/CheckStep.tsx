"use client";
/**
 * components/study/CheckStep.tsx
 *
 * The instruction check. A wrong answer explains the rule and allows one more try; a second wrong
 * answer ends the session (the parent shows the "start over" screen).
 */
import { useState } from "react";
import { CHECK_OPTIONS, CHECK_QUESTION } from "@/lib/instructions";

interface Props {
  failures: number;
  busy: boolean;
  error: string | null;
  onAnswer: (answer: string) => void;
}

export function CheckStep({ failures, busy, error, onAnswer }: Props) {
  const [choice, setChoice] = useState<string | null>(null);
  return (
    <section className="card container--narrow" aria-labelledby="check-title">
      <h1 id="check-title" tabIndex={-1}>
        Quick check before you start
      </h1>
      {failures > 0 && (
        <div className="notice notice--warn" role="alert">
          Not quite. Satire or Real depends only on <strong>who published the headline</strong>: a satire
          website or a news outlet. You have one more try.
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (choice && !busy) onAnswer(choice);
        }}
      >
        <fieldset className="group">
          <legend>{CHECK_QUESTION}</legend>
          <div className="option-grid option-grid--stack">
            {CHECK_OPTIONS.map((o) => (
              <div className="option" key={o.id}>
                <input
                  id={`check-${o.id}`}
                  className="option__input"
                  type="radio"
                  name="check"
                  checked={choice === o.id}
                  onChange={() => setChoice(o.id)}
                />
                <label htmlFor={`check-${o.id}`} className="option__face option__face--plain">
                  <span className="option__dot" aria-hidden="true">
                    ✓
                  </span>
                  <span className="option__name">{o.text}</span>
                </label>
              </div>
            ))}
          </div>
        </fieldset>
        {error && (
          <div className="notice notice--error" role="alert">
            {error}
          </div>
        )}
        <button className="btn btn--primary" type="submit" disabled={!choice || busy}>
          {busy ? "Checking…" : "Continue"}
        </button>
      </form>
    </section>
  );
}
