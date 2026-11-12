"use client";
/**
 * components/study/UndoBar.tsx
 *
 * "Changed your mind?" with a countdown, shown for UNDO_WINDOW_MS after an answer that may still
 * be changed. The server enforces the same window (plus a little grace for network delay), so the
 * bar is a convenience, not the rule.
 */
import { useEffect, useState } from "react";

interface Props {
  expiresAt: number;
  number: number;
  onBack: () => void;
  onExpire: () => void;
}

export function UndoBar({ expiresAt, number, onBack, onExpire }: Props) {
  const [left, setLeft] = useState(() => Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)));
  useEffect(() => {
    const tick = setInterval(() => {
      const s = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
      setLeft(s);
      if (s === 0) onExpire();
    }, 250);
    return () => clearInterval(tick);
  }, [expiresAt, onExpire]);
  if (left === 0) return null;
  return (
    <div className="undo-bar" role="status">
      <span>Answer to headline {number} saved.</span>
      <button className="btn btn--secondary" type="button" onClick={onBack}>
        Go back and change it ({left} s)
      </button>
    </div>
  );
}
