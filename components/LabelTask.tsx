"use client";
/**
 * components/LabelTask.tsx
 *
 * The core labeling screen: ONE tweet per screen, with a progress bar, seven
 * emotion cards, a 1-5 confidence scale, an optional rationale, and Back/Next.
 *
 * Behaviour highlights
 *  - Each Next saves that tweet's answer to the server (idempotent PUT), so
 *    progress survives refreshes; the last step's button submits the session.
 *  - Next is disabled until an emotion AND a confidence are chosen, with a
 *    visible explanation next to it.
 *  - A failed save shows an inline error with "Try again"; the participant's
 *    input is kept in component state and never lost.
 *  - Time spent per tweet counts only while the tab is visible.
 *  - Keyboard: 1-6 pick an emotion, 0 picks "Unsure" (ignored while typing).
 *  - After each step change focus moves to the step heading for screen readers.
 */
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api-client";
import { EMOTIONS, type LabelKey } from "@/lib/emotions";
import type { LabelRecord, TweetPublic } from "@/lib/types";
import { MAX_RATIONALE } from "@/lib/validation";
import { ConfidenceScale } from "./ConfidenceScale";
import { EmotionGuideDialog } from "./EmotionGuideDialog";
import { EmotionOption } from "./EmotionOption";

/** The participant's in-progress answer for one tweet. */
interface Answer {
  label: LabelKey | null;
  confidence: number | null;
  rationale: string;
}

/** Props for {@link LabelTask}. */
interface Props {
  participantId: string;
  tweets: TweetPublic[];
  /** Labels already saved on the server (for resuming). */
  savedLabels: LabelRecord[];
}

/** Save indicator states shown in the header. */
type SaveStatus = "idle" | "saving" | "saved" | "error";

/**
 * Builds the initial answers map from labels saved on the server.
 *
 * @param tweets The participant's tweets.
 * @param saved Labels already stored.
 * @returns One Answer per tweet id.
 */
function initialAnswers(tweets: TweetPublic[], saved: LabelRecord[]): Record<string, Answer> {
  const answers: Record<string, Answer> = {};
  for (const t of tweets) {
    const s = saved.find((l) => l.tweetId === t.id);
    answers[t.id] = {
      label: s?.label ?? null,
      confidence: s?.confidence ?? null,
      rationale: s?.rationale ?? "",
    };
  }
  return answers;
}

/**
 * Renders the labeling flow for one participant.
 *
 * @param props See {@link Props}.
 * @returns The labeling screen.
 */
export function LabelTask({ participantId, tweets, savedLabels }: Props) {
  const router = useRouter();
  const total = tweets.length;

  const [answers, setAnswers] = useState(() => initialAnswers(tweets, savedLabels));
  // Resume at the first unanswered tweet (or the last one if everything is answered).
  const [index, setIndex] = useState(() => {
    const first = tweets.findIndex((t) => !savedLabels.some((l) => l.tweetId === t.id));
    return first === -1 ? total - 1 : first;
  });
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const tweet = tweets[index];
  const answer = answers[tweet.id];
  const isLast = index === total - 1;
  const complete = answer.label !== null && answer.confidence !== null;

  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  // ----- time tracking (visible-tab milliseconds per tweet) -----
  const timeMs = useRef<Record<string, number>>(
    Object.fromEntries(savedLabels.map((l) => [l.tweetId, l.timeSpentMs])),
  );
  const visibleSince = useRef<number | null>(null);

  /**
   * Adds the time elapsed since the last flush to the current tweet's total.
   *
   * @param tweetId The tweet currently on screen.
   * @returns That tweet's accumulated milliseconds.
   */
  const flushTime = useCallback((tweetId: string): number => {
    const now = performance.now();
    if (visibleSince.current !== null) {
      timeMs.current[tweetId] = (timeMs.current[tweetId] ?? 0) + (now - visibleSince.current);
      visibleSince.current = now;
    }
    return timeMs.current[tweetId] ?? 0;
  }, []);

  // Start/stop the clock when the tab becomes visible/hidden.
  useEffect(() => {
    visibleSince.current = document.visibilityState === "visible" ? performance.now() : null;
    /** Pauses the clock when hidden and resumes it when visible again. */
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        flushTime(tweet.id);
        visibleSince.current = null;
      } else {
        visibleSince.current = performance.now();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [tweet.id, flushTime]);

  // Move focus to the step heading whenever the step changes (not on first load).
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [index]);

  /**
   * Updates the current tweet's answer.
   *
   * @param patch Fields to change.
   */
  const update = useCallback(
    (patch: Partial<Answer>) => {
      setAnswers((prev) => ({ ...prev, [tweet.id]: { ...prev[tweet.id], ...patch } }));
      setStatus("idle");
      setError(null);
    },
    [tweet.id],
  );

  // Keyboard shortcuts for choosing an emotion.
  useEffect(() => {
    /**
     * Selects the emotion whose shortcut key was pressed.
     * @param e The keydown event.
     */
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || guideOpen) return;
      const el = e.target as HTMLElement;
      if (
        el.tagName === "TEXTAREA" ||
        (el.tagName === "INPUT" && (el as HTMLInputElement).type === "text")
      ) {
        return;
      }
      const match = EMOTIONS.find((o) => o.shortcut === e.key);
      if (match) update({ label: match.key });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [update, guideOpen]);

  /**
   * Saves the current tweet's answer to the server.
   *
   * @returns True on success (or when there is nothing complete to save).
   */
  async function saveCurrent(): Promise<boolean> {
    if (answer.label === null || answer.confidence === null) return true;
    setStatus("saving");
    setError(null);
    try {
      await api.saveLabel(participantId, {
        tweetId: tweet.id,
        label: answer.label,
        confidence: answer.confidence,
        rationale: answer.rationale.trim() || null,
        timeSpentMs: Math.round(flushTime(tweet.id)),
      });
      setStatus("saved");
      return true;
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Could not save your answer.");
      return false;
    }
  }

  /** Saves, then advances to the next tweet or (on the last one) submits. */
  async function next() {
    if (!complete || submitting) return;
    setSubmitting(true);
    const ok = await saveCurrent();
    if (ok && isLast) {
      try {
        await api.complete(participantId);
        router.push("/done");
        return; // keep the button disabled while navigating
      } catch (err) {
        setStatus("error");
        setError(err instanceof Error ? err.message : "Could not submit. Please try again.");
      }
    } else if (ok) {
      setIndex(index + 1);
    }
    setSubmitting(false);
  }

  /** Goes back one tweet, saving the current answer in the background. */
  function back() {
    if (index === 0) return;
    if (complete) void saveCurrent(); // best effort: it is saved again on the next "Next"
    flushTime(tweet.id);
    setIndex(index - 1);
  }

  const groupName = `emotion-${tweet.id}`;
  const remaining = MAX_RATIONALE - answer.rationale.length;

  return (
    <div className="container">
      <div className="task-header">
        <div className="task-header__row">
          <h1 ref={headingRef} tabIndex={-1} id="step-title">
            Tweet {index + 1} of {total}
          </h1>
          <button type="button" className="btn btn--secondary" onClick={() => setGuideOpen(true)}>
            Emotion guide
          </button>
        </div>
        <div
          className="progress"
          role="progressbar"
          aria-labelledby="step-title"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={index + 1}
          aria-valuetext={`Tweet ${index + 1} of ${total}`}
        >
          <span className="progress__bar" style={{ width: `${((index + 1) / total) * 100}%` }} />
        </div>
        <p className="status" role="status" aria-live="polite">
          {status === "saving" && "Saving…"}
          {status === "saved" && "Saved. You can leave and continue later in this browser."}
        </p>
      </div>

      {/* Wide screens: tweet on the left (stays in view), answer controls on the right. */}
      <div className="task-grid">
        <figure className="tweet-card task-grid__tweet" aria-label="Tweet to label">
          <p className="tweet-card__label">Tweet</p>
          <blockquote className="tweet-card__text" style={{ margin: 0 }}>
            {tweet.text}
          </blockquote>
        </figure>

        <div className="task-grid__controls">
          <fieldset className="group">
            <legend>Which emotion is the writer expressing?</legend>
            <p className="field__hint">
              Choose one. Tap the “i” on a card for its description. Keyboard: press 1–6, or 0 for
              Unsure.
            </p>
            <div className="option-grid">
              {EMOTIONS.map((info) => (
                <EmotionOption
                  key={info.key}
                  info={info}
                  name={groupName}
                  checked={answer.label === info.key}
                  onSelect={() => update({ label: info.key })}
                />
              ))}
            </div>
          </fieldset>

          <fieldset className="group">
            <legend>How sure are you?</legend>
            <ConfidenceScale
              name={`confidence-${tweet.id}`}
              value={answer.confidence}
              onChange={(confidence) => update({ confidence })}
            />
          </fieldset>

          <div className="field">
            <label htmlFor="rationale">Why did you choose this? (optional)</label>
            <p className="field__hint" id="rationale-hint">
              A few words are enough, for example which words or cues you noticed.
            </p>
            <textarea
              id="rationale"
              className="textarea"
              maxLength={MAX_RATIONALE}
              aria-describedby="rationale-hint rationale-count"
              value={answer.rationale}
              onChange={(e) => update({ rationale: e.target.value })}
            />
            <p className="counter" id="rationale-count">
              {remaining} characters left
            </p>
          </div>

          {error && (
            <div className="notice notice--error" role="alert">
              <p>{error}</p>
              <button
                type="button"
                className="btn btn--secondary"
                onClick={next}
                disabled={submitting}
              >
                Try again
              </button>
            </div>
          )}

          <div className="action-bar">
            {!complete && (
              <p className="action-bar__hint" id="next-hint">
                Choose an emotion and how sure you are to continue.
              </p>
            )}
            {complete && isLast && (
              <p className="action-bar__hint" id="next-hint">
                Submitting saves your {total} answers. You cannot change them afterwards.
              </p>
            )}
            <div className="action-bar__buttons">
              <button
                type="button"
                className="btn btn--secondary"
                onClick={back}
                disabled={index === 0 || submitting}
              >
                Back
              </button>
              <button
                type="button"
                className="btn btn--primary"
                onClick={next}
                disabled={!complete || submitting}
                aria-describedby="next-hint"
              >
                {submitting ? (isLast ? "Submitting…" : "Saving…") : isLast ? "Submit" : "Next"}
              </button>
            </div>
          </div>
        </div>
      </div>

      <EmotionGuideDialog open={guideOpen} onClose={() => setGuideOpen(false)} />
    </div>
  );
}
