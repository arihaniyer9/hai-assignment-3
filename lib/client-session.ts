/**
 * lib/client-session.ts
 *
 * Remembers this browser's session id per condition in localStorage, so a refresh resumes where
 * the participant left off. The server is the source of truth; localStorage is only a pointer, and
 * every access is wrapped in try/catch (private windows and blocked storage throw). Client only.
 */
import type { Condition } from "./constants";

const key = (condition: Condition) => `satire-study.${condition}.sessionId`;

export function getStoredSessionId(condition: Condition): string | null {
  try {
    return window.localStorage.getItem(key(condition));
  } catch {
    return null;
  }
}

export function storeSessionId(condition: Condition, id: string): void {
  try {
    window.localStorage.setItem(key(condition), id);
  } catch {
    /* storage unavailable: the study still works, it just cannot resume after a refresh */
  }
}

export function clearStoredSessionId(condition: Condition): void {
  try {
    window.localStorage.removeItem(key(condition));
  } catch {
    /* nothing to clear */
  }
}
