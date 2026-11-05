/**
 * lib/theme.ts
 *
 * Shared constants for the Light / Dark / Auto theme switch. Dependency-free so
 * both the server layout (which inlines the init script) and the client toggle
 * can import it.
 *
 * How theming works: colours live in CSS variables (app/globals.css). With no
 * `data-theme` attribute on <html> the page follows the device's colour scheme
 * ("Auto"). Choosing Light or Dark sets `data-theme` and remembers the choice
 * in localStorage.
 */

/** localStorage key holding "light" or "dark" (absent = Auto). */
export const THEME_KEY = "emotion-task.theme";

/** Fired on the window when this tab changes the theme choice. */
export const THEME_EVENT = "emotion-task-theme-change";

/** The three choices offered by the switch. */
export type ThemeChoice = "auto" | "light" | "dark";

/**
 * Tiny script run in <head> before the page paints, so a saved Light/Dark
 * choice is applied immediately and the page never flashes the wrong theme.
 */
export const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem(${JSON.stringify(
  THEME_KEY,
)});if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;
