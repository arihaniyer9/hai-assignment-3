"use client";
/**
 * components/study/IntroStep.tsx
 *
 * Instructions, what is recorded, consent, and the participant code. The text differs only where
 * the conditions differ (the AI step), so the two links are otherwise identical.
 */
import { useState } from "react";
import { CODE_RE, STUDY_TRIALS, type Condition } from "@/lib/constants";

interface Props {
  condition: Condition;
  busy: boolean;
  error: string | null;
  onStart: (code: string) => void;
}

export function IntroStep({ condition, busy, error, onStart }: Props) {
  const [code, setCode] = useState("");
  const [consent, setConsent] = useState(false);
  const normalised = code.trim().toLowerCase();
  const codeOk = CODE_RE.test(normalised);
  const assisted = condition === "assisted";

  return (
    <div className="home-grid">
      <div className="home-grid__main">
        <h1>Satire or real? {assisted ? "(with an AI assistant)" : "(on your own)"}</h1>
        <p className="lede">
          A short study, about 5 minutes. You will read {STUDY_TRIALS + 1} news headlines and decide whether
          each one comes from a satire website or a real news outlet.
        </p>

        <section className="card" aria-labelledby="how">
          <h2 id="how">What you will do</h2>
          <ol>
            <li>
              You will see one headline at a time. Every headline is real: it was published either by a
              <strong> satire website</strong> (such as Reductress or The Babylon Bee) or by a
              <strong> news outlet</strong> (such as Reuters or the BBC). The outlet name is removed and all
              headlines are written in the same style, so judge the headline itself.
            </li>
            {assisted ? (
              <>
                <li>
                  Give <strong>your own answer first</strong>, Satire or Real, and say how sure you are
                  (1 to 5).
                </li>
                <li>
                  Then you will see what an <strong>AI model</strong> suggests, how sure it is, and which
                  words it relied on. The AI only looks at the words and can be wrong.
                </li>
                <li>
                  Give your <strong>final answer</strong>: keep yours or change it, and say how sure you are
                  now. Your first answer cannot be changed once you have seen the AI.
                </li>
              </>
            ) : (
              <li>
                Choose <strong>Satire or Real</strong> and say how sure you are (1 to 5).
              </li>
            )}
            <li>Please do not search for the headlines or use any other AI tool. Go with your judgement.</li>
            <li>One of the headlines is an attention check that tells you what to answer.</li>
          </ol>
        </section>

        <section className="card" aria-labelledby="data">
          <h2 id="data">What is recorded</h2>
          <ul>
            <li>The code you choose below. Please do not use your name.</li>
            <li>
              Your answers and how sure you were, how long each one took
              {assisted ? ", and what the AI showed you" : ""}.
            </li>
            <li>An optional comment at the end.</li>
            <li>
              Nothing else: no name, email or account. Taking part is voluntary and you can stop at any time by
              closing the page.
            </li>
          </ul>
          <p className="muted small">
            This is a class study for a Human-AI Interaction course. Headlines come from public satire and news
            websites, and a few mention politics or crime.
          </p>
        </section>
      </div>

      <aside className="home-grid__aside" aria-label="Start the study">
        <section className="card" aria-labelledby="start-title">
          <h2 id="start-title">Ready to start?</h2>
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              if (codeOk && consent && !busy) onStart(normalised);
            }}
          >
            <div className="field">
              <label htmlFor="code">Your code</label>
              <p className="field__hint" id="code-hint">
                Make one up, such as an animal and a number (<code>otter-42</code>). Use the{" "}
                <strong>same code on both study links</strong>, so your two parts can be matched. 3 to 24
                letters, numbers or hyphens.
              </p>
              <input
                id="code"
                className="input"
                type="text"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={24}
                aria-describedby="code-hint"
                aria-invalid={code !== "" && !codeOk}
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </div>
            <label className="check">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span>I have read the information above and agree to take part.</span>
            </label>
            {error && (
              <div className="notice notice--error" role="alert">
                {error}
              </div>
            )}
            <button className="btn btn--primary btn--block" type="submit" disabled={!codeOk || !consent || busy}>
              {busy ? "Starting…" : "Start"}
            </button>
            {(!codeOk || !consent) && (
              <p className="action-bar__hint" aria-live="polite">
                {!codeOk ? "Enter a code (3 to 24 letters, numbers or hyphens)." : "Tick the box to agree."}
              </p>
            )}
          </form>
        </section>
      </aside>
    </div>
  );
}
