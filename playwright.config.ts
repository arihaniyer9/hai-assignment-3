/**
 * playwright.config.ts
 *
 * End-to-end test setup. Playwright starts the real Next.js dev server on port
 * 3100 with a throwaway SQLite database (`.data/e2e.sqlite`, deleted before
 * every run) and known admin credentials, then drives the app in Chromium.
 *
 * (The dev server is used because the app deliberately refuses to fall back to
 * SQLite in production mode; see lib/storage/index.ts.)
 */
import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
export const ADMIN_PASSWORD = "e2e-admin-password";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    ...devices["Desktop Chrome"],
    viewport: { width: 1280, height: 900 },
  },
  webServer: {
    // Delete the old test database first so every run starts empty (exact row counts).
    // (Done in the server command, not in this file: Playwright re-imports the
    // config in each worker process, which would delete the DB under the live server.)
    command: `rm -f .data/e2e.sqlite .data/e2e.sqlite-shm .data/e2e.sqlite-wal && npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      NEXT_DIST_DIR: ".next-e2e", // separate build folder: can run next to your own `npm run dev`
      SQLITE_PATH: ".data/e2e.sqlite",
      SUPABASE_URL: "",
      SUPABASE_SERVICE_ROLE_KEY: "",
      ADMIN_PASSWORD,
      ADMIN_SESSION_SECRET: "e2e-session-secret",
    },
  },
});
