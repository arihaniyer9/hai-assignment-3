"use client";
/**
 * components/EmotionGuideDialog.tsx
 *
 * Modal help dialog showing the emotion guide during labeling. Uses the native
 * <dialog> element, which provides focus trapping, Esc-to-close and a backdrop
 * for free, and restores focus to the opener when closed.
 */
import { useEffect, useRef } from "react";
import { EmotionGuide } from "./EmotionGuide";

/** Props for {@link EmotionGuideDialog}. */
interface Props {
  /** Whether the dialog should be showing. */
  open: boolean;
  /** Called when the dialog closes (button, Esc or backdrop click). */
  onClose: () => void;
}

/**
 * Renders the guide dialog, syncing the native dialog with the `open` prop.
 *
 * @param props See {@link Props}.
 * @returns The <dialog> element.
 */
export function EmotionGuideDialog({ open, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="guide-dialog"
      aria-labelledby="guide-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose(); // click on the backdrop
      }}
    >
      <div className="dialog-head">
        <h2 id="guide-title">Emotion guide</h2>
        <button type="button" className="btn btn--secondary" onClick={onClose}>
          Close
        </button>
      </div>
      <p className="muted small">
        These are short descriptions to help you stay consistent. Use your own judgement about what the
        writer is expressing.
      </p>
      <EmotionGuide />
    </dialog>
  );
}
