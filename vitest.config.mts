/**
 * vitest.config.ts
 *
 * Unit-test configuration. Only files under `tests/` are unit tests; the
 * Playwright end-to-end specs live in `e2e/` and are run by `npm run test:e2e`.
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
