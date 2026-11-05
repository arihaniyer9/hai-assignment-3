"use client";
/**
 * components/EmotionOption.tsx
 *
 * One selectable emotion card. Structure (per card):
 *
 *   <input type=radio>   invisible, covers the whole card: the real control
 *                        (native arrow-key navigation, focus, form semantics)
 *   .option__face        the visible card: dot indicator, name, shortcut hint
 *   <button> "i"         toggles the definition + example
 *   .option__details     definition; expands in place on touch devices, floats
 *                        as a tooltip on hover/keyboard focus for mouse users
 *
 * Selection is shown by a filled dot with a check mark plus a thick border, so
 * it never relies on colour alone.
 */
import { useState } from "react";
import type { EmotionInfo } from "@/lib/emotions";

/** Props for {@link EmotionOption}. */
interface Props {
  info: EmotionInfo;
  checked: boolean;
  /** Shared radio group name (unique per tweet so state never leaks between steps). */
  name: string;
  onSelect: () => void;
}

/**
 * Renders one emotion option card.
 *
 * @param props See {@link Props}.
 * @returns The card.
 */
export function EmotionOption({ info, checked, name, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const inputId = `${name}-${info.key}`;
  const detailsId = `${inputId}-details`;

  return (
    <div className={`option${info.key === "unsure" ? " option--unsure" : ""}`} data-open={open}>
      <input
        id={inputId}
        className="option__input"
        type="radio"
        name={name}
        value={info.key}
        checked={checked}
        onChange={onSelect}
        aria-describedby={detailsId}
        aria-keyshortcuts={info.shortcut}
      />
      <label htmlFor={inputId} className="option__face">
        <span className="option__dot" aria-hidden="true">
          ✓
        </span>
        <span className="option__name">{info.label}</span>
        <kbd className="option__key" aria-hidden="true">
          {info.shortcut}
        </kbd>
      </label>
      <button
        type="button"
        className="option__info"
        aria-expanded={open}
        aria-controls={detailsId}
        aria-label={`${open ? "Hide" : "Show"} description of ${info.label}`}
        onClick={() => setOpen((v) => !v)}
      >
        <span aria-hidden="true">i</span>
      </button>
      <div id={detailsId} className="option__details">
        <p>{info.definition}</p>
        <p className="muted">Example: “{info.example}”</p>
      </div>
    </div>
  );
}
