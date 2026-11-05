"use client";
/**
 * components/ConfidenceScale.tsx
 *
 * A 1-5 segmented "how sure are you?" control built from native radio inputs
 * (so arrow keys, focus and screen-reader semantics come for free), with
 * end-point captions under the scale.
 */

/** Props for {@link ConfidenceScale}. */
interface Props {
  /** Radio group name (unique per tweet). */
  name: string;
  /** Currently selected value, or null when unanswered. */
  value: number | null;
  onChange: (value: number) => void;
}

/** Spoken names for each value, used as accessible labels. */
const WORDS = ["Not at all sure", "Slightly sure", "Moderately sure", "Fairly sure", "Very sure"];

/**
 * Renders the confidence scale.
 *
 * @param props See {@link Props}.
 * @returns The five-segment control.
 */
export function ConfidenceScale({ name, value, onChange }: Props) {
  return (
    <>
      <div className="scale">
        {[1, 2, 3, 4, 5].map((n) => (
          <div className="scale__item" key={n}>
            <input
              id={`${name}-${n}`}
              className="scale__input"
              type="radio"
              name={name}
              value={n}
              checked={value === n}
              onChange={() => onChange(n)}
              aria-label={`${n} of 5, ${WORDS[n - 1]}`}
            />
            <label htmlFor={`${name}-${n}`} className="scale__face" aria-hidden="true">
              {n}
            </label>
          </div>
        ))}
      </div>
      <div className="scale__ends" aria-hidden="true">
        <span>1 = Not at all sure</span>
        <span>5 = Very sure</span>
      </div>
    </>
  );
}
