"use client";
/**
 * components/CopyButton.tsx
 *
 * Small button that copies text to the clipboard and confirms with a polite
 * live-region announcement.
 */
import { useState } from "react";

/**
 * Renders a "Copy" button for the given text.
 *
 * @param props.text Text to copy.
 * @param props.label Accessible name, e.g. "Copy participant ID".
 * @returns The button plus a visually hidden status message.
 */
export function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <>
      <button
        type="button"
        className="btn btn--secondary"
        aria-label={label}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            /* clipboard blocked: the ID is still visible on screen */
          }
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
      <span className="sr-only" role="status">
        {copied ? "Copied to clipboard" : ""}
      </span>
    </>
  );
}
