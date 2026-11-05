"use client";
/**
 * components/Debrief.tsx
 *
 * The thank-you / debrief screen shown after submission: the participant's ID,
 * their labels next to the dataset's labels (worded neutrally: "matches" /
 * "differs", never "correct" / "wrong"), and a short explanation of why a single
 * "ground truth" emotion label is questionable.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api-client";
import { clearStoredParticipantId, useStoredParticipantId } from "@/lib/client-session";
import { labelName } from "@/lib/emotions";
import type { DebriefItem } from "@/lib/types";
import { CopyButton } from "./CopyButton";
import { NewParticipantButton } from "./NewParticipantButton";

/**
 * Loads and renders the debrief for this browser's participant.
 *
 * @returns The debrief page content, or a loading/error state.
 */
export function Debrief() {
  const router = useRouter();
  const participantId = useStoredParticipantId();
  const [items, setItems] = useState<DebriefItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (participantId === null) {
      router.replace("/"); // no session in this browser
      return;
    }
    if (!participantId) return; // still hydrating
    let cancelled = false;
    api
      .getResults(participantId)
      .then((r) => {
        if (!cancelled) setItems(r.items);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 403)
          router.replace("/task"); // not submitted yet
        else if (err instanceof ApiError && err.status === 404) {
          clearStoredParticipantId();
          router.replace("/");
        } else setError(err instanceof Error ? err.message : "Could not load your summary.");
      });
    return () => {
      cancelled = true;
    };
  }, [router, participantId]);

  if (error) {
    return (
      <div className="notice notice--error" role="alert">
        {error} <Link href="/">Back to start</Link>
      </div>
    );
  }
  if (!items || !participantId) {
    return (
      <div aria-busy="true" aria-label="Loading your summary">
        <div className="skeleton" style={{ height: 32, width: "60%", marginBottom: 16 }} />
        <div className="skeleton" style={{ height: 200 }} />
      </div>
    );
  }

  const matches = items.filter((i) => i.yourLabel === i.groundTruth).length;

  return (
    <>
      <h1 tabIndex={-1}>Thank you!</h1>
      <p className="lede">Your answers have been submitted and saved.</p>

      <div className="debrief-grid">
        <section className="card debrief-grid__id" aria-labelledby="id-title">
          <h2 id="id-title">Your participant ID</h2>
          <p className="muted">Keep this if you want to refer to your answers later.</p>
          <p style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <span className="id-chip">{participantId}</span>
            <CopyButton text={participantId} label="Copy participant ID" />
          </p>
        </section>

        <section className="card debrief-grid__compare" aria-labelledby="compare-title">
          <h2 id="compare-title">Your labels next to the dataset’s labels</h2>
          <p>
            For {matches} of {items.length} tweets your label matched the dataset’s label.
          </p>
          <ul className="debrief-list">
            {items.map((item) => {
              const match = item.yourLabel === item.groundTruth;
              return (
                <li className="debrief-item" key={item.tweetId}>
                  <p className="debrief-item__text">“{item.text}”</p>
                  <dl>
                    <dt>Your label</dt>
                    <dd>
                      {labelName(item.yourLabel)} (confidence {item.confidence}/5)
                    </dd>
                    <dt>Dataset label</dt>
                    <dd>{labelName(item.groundTruth)}</dd>
                    <dt>Comparison</dt>
                    <dd>
                      {match ? (
                        <span className="tag tag--match">✓ Matches</span>
                      ) : (
                        <span className="tag">≠ Differs</span>
                      )}
                    </dd>
                  </dl>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="card debrief-grid__note" aria-labelledby="note-title">
          <h2 id="note-title">A note on “ground truth” emotions</h2>
          <p>
            The dataset’s label is not an objective fact about what the writer felt. The dataset’s
            documentation lists its labels as machine-generated, not chosen by people reading each
            tweet, so they carry the assumptions and errors of that process. Even careful human
            labelers often disagree, because emotions are subjective, depend on context and culture,
            and are frequently mixed.
          </p>
          <p>
            That is why using AI to infer people’s emotions is a questionable use case: a single
            label per text hides ambiguity, and acting on a wrong guess about someone’s feelings can
            cause real harm. Where your label differed from the dataset’s, that is a useful data
            point, not a mistake.
          </p>
          <p>
            <Link href="/reflection">Read more in the Reflection page</Link>
          </p>
        </section>
      </div>

      <p>
        <NewParticipantButton />
      </p>
    </>
  );
}
