/**
 * components/EmotionGuide.tsx
 *
 * Static list of the seven label definitions with a made-up example each.
 * Rendered on the instructions page and inside the help dialog, so the
 * definitions are always one tap away ("recognition rather than recall").
 */
import { EMOTIONS } from "@/lib/emotions";

/**
 * Renders the emotion guide list.
 *
 * @returns A list of definitions and examples.
 */
export function EmotionGuide() {
  return (
    <ul className="guide">
      {EMOTIONS.map((e) => (
        <li key={e.key}>
          <strong>{e.label}</strong>
          {e.definition}
          <br />
          <em>Example: “{e.example}”</em>
        </li>
      ))}
    </ul>
  );
}
