/**
 * lib/client-session.ts
 *
 * Remembers this browser's participant ID in localStorage so a refresh resumes
 * the task and a completed browser cannot casually submit twice. The server is
 * the source of truth; localStorage is only a convenience pointer, so every
 * access is wrapped in try/catch (private windows and blocked storage throw).
 *
 * Client-side only: import from client components.
 */
import { useSyncExternalStore } from "react";

const KEY = "emotion-task.participantId";
/** Fired on the window whenever this tab changes the stored ID. */
const CHANGE_EVENT = "participant-session-change";

/**
 * Reads the stored participant ID.
 *
 * @returns The ID, or null when none is stored or storage is unavailable.
 */
export function getStoredParticipantId(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/**
 * Stores the participant ID for this browser.
 *
 * @param id The participant ID to remember.
 */
export function storeParticipantId(id: string): void {
  try {
    window.localStorage.setItem(KEY, id);
  } catch {
    /* storage unavailable: the task still works, it just cannot resume */
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Forgets the stored participant ID ("Start new participant"). */
export function clearStoredParticipantId(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/**
 * Subscribes to changes of the stored ID (this tab and other tabs).
 *
 * @param callback Called when the ID may have changed.
 * @returns An unsubscribe function.
 */
function subscribe(callback: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(CHANGE_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

/**
 * React hook returning the stored participant ID.
 *
 * @returns `undefined` during server rendering / hydration (unknown yet),
 *   then the ID string, or `null` when this browser has no session.
 */
export function useStoredParticipantId(): string | null | undefined {
  return useSyncExternalStore(subscribe, getStoredParticipantId, () => undefined);
}
