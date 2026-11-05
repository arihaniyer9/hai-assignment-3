"use client";
/**
 * components/ThemeToggle.tsx
 *
 * Header switch with three options: Light, Dark, Auto (follow the device).
 * Built from native radio inputs, so it is keyboard-operable (arrow keys) and
 * announced by screen readers as a labelled group. On phones only the icons are
 * shown; the text remains available to assistive technology.
 *
 * The choice is saved in localStorage and applied by setting `data-theme` on
 * <html>. The same attribute is applied before first paint by the inline script
 * in app/layout.tsx (see lib/theme.ts).
 */
import { useSyncExternalStore, type ReactNode } from "react";
import { THEME_EVENT, THEME_KEY, type ThemeChoice } from "@/lib/theme";

/** Reads the saved choice; anything other than light/dark means Auto. */
function readChoice(): ThemeChoice {
  try {
    const value = window.localStorage.getItem(THEME_KEY);
    return value === "light" || value === "dark" ? value : "auto";
  } catch {
    return "auto";
  }
}

/**
 * Applies a choice to the document (no storage, no events).
 *
 * @param choice The theme to show; "auto" removes the override.
 */
function applyToDocument(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === "auto") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", choice);
}

/**
 * Saves and applies the user's choice, then notifies subscribers.
 *
 * @param choice The theme the user picked.
 */
function chooseTheme(choice: ThemeChoice): void {
  try {
    if (choice === "auto") window.localStorage.removeItem(THEME_KEY);
    else window.localStorage.setItem(THEME_KEY, choice);
  } catch {
    /* storage blocked: the choice still applies until the page is closed */
  }
  applyToDocument(choice);
  window.dispatchEvent(new Event(THEME_EVENT));
}

/**
 * Subscribes to theme changes made in this tab or (via the `storage` event)
 * in another tab, keeping the document attribute in sync for the latter.
 *
 * @param callback Called when the choice may have changed.
 * @returns An unsubscribe function.
 */
function subscribe(callback: () => void): () => void {
  /** Another tab changed the saved theme: mirror it here. */
  const onStorage = (e: StorageEvent) => {
    if (e.key === THEME_KEY || e.key === null) {
      applyToDocument(readChoice());
      callback();
    }
  };
  window.addEventListener(THEME_EVENT, callback);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(THEME_EVENT, callback);
    window.removeEventListener("storage", onStorage);
  };
}

/** Stroke-icon wrapper shared by the three icons. */
function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/** The three options, in display order. */
const OPTIONS: { value: ThemeChoice; label: string; title: string; icon: ReactNode }[] = [
  {
    value: "light",
    label: "Light",
    title: "Light theme",
    icon: (
      <Icon>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </Icon>
    ),
  },
  {
    value: "dark",
    label: "Dark",
    title: "Dark theme",
    icon: (
      <Icon>
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
      </Icon>
    ),
  },
  {
    value: "auto",
    label: "Auto",
    title: "Match my device setting",
    icon: (
      <Icon>
        <rect x="3" y="4" width="18" height="12" rx="2" />
        <path d="M8 20h8M12 16v4" />
      </Icon>
    ),
  },
];

/**
 * Renders the Light / Dark / Auto switch.
 *
 * @returns The radio group.
 */
export function ThemeToggle() {
  // Server render (and hydration) assume "auto"; the real value is read right after.
  const choice = useSyncExternalStore(subscribe, readChoice, () => "auto" as ThemeChoice);
  return (
    <fieldset className="theme-toggle">
      <legend className="sr-only">Colour theme</legend>
      {OPTIONS.map((o) => (
        <label className="theme-toggle__item" key={o.value} title={o.title}>
          <input
            className="theme-toggle__input"
            type="radio"
            name="theme"
            value={o.value}
            checked={choice === o.value}
            onChange={() => chooseTheme(o.value)}
          />
          <span className="theme-toggle__face">
            {o.icon}
            <span className="theme-toggle__text">{o.label}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}
