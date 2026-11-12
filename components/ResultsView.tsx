"use client";
/**
 * components/ResultsView.tsx
 *
 * A participant's results for both parts: every headline, their answer, the correct answer and
 * the AI's answer (as shown in the AI part; as it would have been, never shown, in the part on
 * their own), plus how the AI changed their answers. The server releases this only when the code
 * has finished both parts.
 */
import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { CODE_RE } from "@/lib/constants";
import type { ParticipantResults, PartResults } from "@/lib/types";

const TITLE = { baseline: "Part on your own", assisted: "Part with the AI" } as const;

function Mark({ ok }: { ok: boolean }) {
  return <span className={ok ? "tag tag--match" : "tag"}>{ok ? "✓ right" : "✗ wrong"}</span>;
}

function Part({ part }: { part: PartResults }) {
  const assisted = part.condition === "assisted";
  return (
    <section className="card" aria-labelledby={`part-${part.condition}`}>
      <h2 id={`part-${part.condition}`}>{TITLE[part.condition]}</h2>
      <p className="lede">
        You: <strong>{part.yourCorrect} of {part.total}</strong> right. The AI on the same headlines:{" "}
        <strong>{part.aiCorrect} of {part.total}</strong>
        {assisted ? "." : " (it was not shown to you in this part)."}
      </p>
      {assisted && (
        <p>
          After seeing the AI you changed your answer {part.switchedToRight! + part.switchedToWrong!} times:{" "}
          <strong>{part.switchedToRight}</strong> to the right answer and <strong>{part.switchedToWrong}</strong> to
          a wrong one.
        </p>
      )}
      <div className="table-wrap">
        <table className="data">
          <caption className="sr-only">{TITLE[part.condition]}: every headline</caption>
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Headline</th>
              <th scope="col">Correct</th>
              {assisted && <th scope="col">Your first answer</th>}
              <th scope="col">{assisted ? "Your final answer" : "Your answer"}</th>
              <th scope="col">{assisted ? "AI said" : "AI would have said"}</th>
            </tr>
          </thead>
          <tbody>
            {part.rows.map((r, i) => (
              <tr key={r.position}>
                <td data-label="#">{i + 1}</td>
                <td data-label="Headline" className="wrap">
                  {r.headline}
                </td>
                <td data-label="Correct">
                  <strong>{r.correctAnswer}</strong>
                </td>
                {assisted && <td data-label="Your first answer">{r.firstAnswer}</td>}
                <td data-label={assisted ? "Your final answer" : "Your answer"}>
                  {r.yourAnswer} <Mark ok={r.yourCorrect} />
                </td>
                <td data-label={assisted ? "AI said" : "AI would have said"}>
                  {r.aiAnswer} ({Math.round(r.aiConfidence * 100)}%) <Mark ok={r.aiCorrect} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function ResultsView({ initialCode }: { initialCode: string }) {
  const startCode = CODE_RE.test(initialCode) ? initialCode : "";
  const [code, setCode] = useState(startCode);
  const [results, setResults] = useState<ParticipantResults | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(startCode !== "");

  async function load(c: string) {
    setBusy(true);
    setError(null);
    try {
      setResults(await api.results(c));
    } catch (err) {
      setResults(null);
      setError(err instanceof Error ? err.message : "Could not load results.");
    } finally {
      setBusy(false);
    }
  }

  // /results?code=otter-42 (the thank-you page links here) loads straight away.
  useEffect(() => {
    if (!startCode) return;
    let cancelled = false;
    api
      .results(startCode)
      .then((r) => !cancelled && setResults(r))
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : "Could not load results."))
      .finally(() => !cancelled && setBusy(false));
    return () => {
      cancelled = true;
    };
  }, [startCode]);

  const normalised = code.trim().toLowerCase();
  return (
    <>
      <h1>Your results</h1>
      <p className="lede">
        Every headline from both parts, with the correct answer and what the AI said. Available once you have
        finished both parts with the same code.
      </p>
      <form
        className="card"
        onSubmit={(e) => {
          e.preventDefault();
          if (CODE_RE.test(normalised)) void load(normalised);
        }}
      >
        <div className="field">
          <label htmlFor="results-code">Your code</label>
          <input
            id="results-code"
            className="input"
            type="text"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={24}
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </div>
        {error && (
          <div className="notice notice--error" role="alert">
            {error}
          </div>
        )}
        <button className="btn btn--primary" type="submit" disabled={!CODE_RE.test(normalised) || busy}>
          {busy ? "Loading…" : "Show my results"}
        </button>
      </form>
      {results && results.parts.map((p) => <Part key={p.condition} part={p} />)}
    </>
  );
}
