"use client";
/**
 * components/AnswerChoice.tsx
 *
 * The Satire / Real choice: two large radio cards (native inputs, so keyboard and screen readers
 * work), with selection shown by border, fill and a check mark, never colour alone. The two
 * options are always in the same order and the same neutral style.
 */
import { ANSWERS, type Answer } from "@/lib/constants";

interface Props {
  name: string;
  value: Answer | null;
  onChange: (value: Answer) => void;
  legend: string;
}

const HINT: Record<Answer, string> = {
  Satire: "from a satire website",
  Real: "from a real news outlet",
};

export function AnswerChoice({ name, value, onChange, legend }: Props) {
  return (
    <fieldset className="group">
      <legend>{legend}</legend>
      <div className="option-grid option-grid--two">
        {ANSWERS.map((a) => (
          <div className="option" key={a}>
            <input
              id={`${name}-${a}`}
              className="option__input"
              type="radio"
              name={name}
              value={a}
              checked={value === a}
              onChange={() => onChange(a)}
            />
            <label htmlFor={`${name}-${a}`} className="option__face option__face--plain">
              <span className="option__dot" aria-hidden="true">
                ✓
              </span>
              <span className="option__name">
                {a} <span className="option__sub">{HINT[a]}</span>
              </span>
              <span className="option__key" aria-hidden="true">
                {a[0]}
              </span>
            </label>
          </div>
        ))}
      </div>
    </fieldset>
  );
}
