/**
 * lib/use-visible-timer.ts
 *
 * Counts the milliseconds a step was on screen while the tab was visible, so switching tabs does
 * not inflate response times. `reset()` starts a new step; `read()` returns the time so far.
 */
import { useCallback, useEffect, useRef } from "react";

export function useVisibleTimer() {
  const total = useRef(0);
  const since = useRef<number | null>(null);

  useEffect(() => {
    since.current = document.visibilityState === "visible" ? performance.now() : null;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        if (since.current !== null) total.current += performance.now() - since.current;
        since.current = null;
      } else {
        since.current = performance.now();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const reset = useCallback(() => {
    total.current = 0;
    since.current = document.visibilityState === "visible" ? performance.now() : null;
  }, []);

  const read = useCallback(
    () => Math.round(total.current + (since.current === null ? 0 : performance.now() - since.current)),
    [],
  );

  return { reset, read };
}
