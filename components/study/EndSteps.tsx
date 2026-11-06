"use client";
/**
 * components/study/EndSteps.tsx
 *
 * The last screens: an optional comment before finishing, the thank-you screen with the score
 * (only the total, so no answers are revealed that could teach the other condition), and the
 * screen shown when the instruction check ended the session.
 */
import Link from "next/link";
import { useState } from "react";
import type { Condition } from "@/lib/constants";
import { MAX_COMMENT } from "@/lib/validation";
import type { DebriefSummary } from "@/lib/types";

export function FinishStep({
  busy,
  error,
  onFinish,
}: {
  busy: boolean;
  error: string | null;
  onFinish: (comment: string) => void;
}) {
  const [comment, setComment] = useState("");
  return (
    <section className="card container--narrow" aria-labelledby="finish-title">
      <h1 id="finish-title" tabIndex={-1}>
        Last step
      </h1>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy) onFinish(comment);
        }}
      >
        <div className="field">
          <label htmlFor="comment">Anything you want to tell us? (optional)</label>
          <p className="field__hint">For example, how you decided, or anything that was confusing.</p>
          <textarea
            id="comment"
            className="textarea"
            maxLength={MAX_COMMENT}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
        </div>
        {error && (
          <div className="notice notice--error" role="alert">
            {error}
          </div>
        )}
        <button className="btn btn--primary" type="submit" disabled={busy}>
          {busy ? "Finishing…" : "Finish"}
        </button>
      </form>
    </section>
  );
}

const OTHER: Record<Condition, { path: string; name: string }> = {
  baseline: { path: "/assisted", name: "the part with the AI assistant" },
  assisted: { path: "/baseline", name: "the part on your own" },
};

export function DoneStep({ summary }: { summary: DebriefSummary }) {
  const other = OTHER[summary.condition];
  return (
    <section className="card container--narrow" aria-labelledby="done-title">
      <h1 id="done-title" tabIndex={-1}>
        Thank you!
      </h1>
      <p className="lede">
        You got <strong>{summary.correct} of {summary.total}</strong> headlines right.
      </p>
      <p>
        Your code is <span className="id-chip">{summary.code}</span>. If you have not done{" "}
        {other.name} yet, please do it next with the <strong>same code</strong>:{" "}
        <Link href={other.path}>{other.name}</Link>.
      </p>
      <p className="muted small">
        Your answers are saved. You can close this page. Please do not share the headlines with classmates
        who have not taken part yet.
      </p>
    </section>
  );
}

export function TerminatedStep({ onRestart }: { onRestart: () => void }) {
  return (
    <section className="card container--narrow" aria-labelledby="stop-title">
      <h1 id="stop-title" tabIndex={-1}>
        Please start again
      </h1>
      <p>
        The quick check was not passed twice, so this attempt has ended. Please read the instructions again
        and restart. You can use the same code.
      </p>
      <button className="btn btn--primary" type="button" onClick={onRestart}>
        Start again
      </button>
    </section>
  );
}
