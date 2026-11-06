/**
 * components/AiPanel.tsx
 *
 * What the AI shows on an assisted trial: its suggested answer, how sure it is, a "Confident"
 * badge at the threshold frozen in Assignment 2, and the headline with every word that pushed it
 * marked by direction (solid underline and + toward Satire, dashed underline and − toward Real) and
 * strength (the number). Colour is never the only cue. The same design as the A2 report's trials.
 */
import type { AiOutput } from "@/lib/types";

interface Props {
  headline: string;
  ai: AiOutput;
}

export function AiPanel({ headline, ai }: Props) {
  const top = Math.max(...ai.words.map((w) => Math.abs(w.value)), 1e-9);
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  ai.words.forEach((w, i) => {
    parts.push(headline.slice(cursor, w.start));
    const toward = w.value > 0 ? "satire" : "real";
    const strength = 0.12 + 0.38 * Math.min(Math.abs(w.value) / top, 1);
    parts.push(
      <span
        key={i}
        className={`ai-word ai-word--${toward}`}
        style={{ "--strength": strength } as React.CSSProperties}
        title={`pushes toward ${toward === "satire" ? "Satire" : "Real"}`}
      >
        {headline.slice(w.start, w.end)}
        <span className="ai-word__value">
          {w.value > 0 ? "+" : "−"}
          {Math.abs(w.value).toFixed(2)}
        </span>
      </span>,
    );
    cursor = w.end;
  });
  parts.push(headline.slice(cursor));

  return (
    <section className="ai-panel" aria-labelledby="ai-title">
      <h2 id="ai-title" className="ai-panel__title">
        AI suggestion
      </h2>
      <p className="ai-panel__verdict">
        The AI suggests <strong>{ai.label}</strong>, {Math.round(ai.confidence * 100)}% sure
        {ai.confident && <span className="badge">Confident</span>}
      </p>
      <p className="ai-panel__headline">{parts}</p>
      <p className="ai-panel__key small muted">
        Words the AI relied on: <span className="ai-key ai-key--satire">solid underline, +</span> pushed it
        toward Satire; <span className="ai-key ai-key--real">dashed underline, −</span> toward Real. Bigger
        numbers pushed harder. The AI only looks at the words and can be wrong.
      </p>
    </section>
  );
}
