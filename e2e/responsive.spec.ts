/**
 * e2e/responsive.spec.ts
 *
 * Responsive-layout check: at five widths (small phone, phone, tablet, laptop,
 * wide desktop) and in both light and dark colour schemes, every page must fit
 * the screen with no horizontal page scroll, and the primary controls must be
 * reachable. Runs after flow.spec.ts (Playwright orders files alphabetically),
 * because flow.spec.ts asserts exact row counts in the shared test database.
 */
import { expect, test, type Page } from "@playwright/test";
import { ADMIN_PASSWORD } from "../playwright.config";

const WIDTHS = [320, 375, 768, 1024, 1440];

/**
 * Asserts the page has no horizontal overflow at its current viewport width.
 *
 * @param page The page to measure.
 * @param where Human-readable location used in the failure message.
 */
async function expectNoHorizontalScroll(page: Page, where: string) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, `horizontal overflow on ${where}`).toBeLessThanOrEqual(0);
}

for (const scheme of ["light", "dark"] as const) {
  for (const width of WIDTHS) {
    test(`${scheme} mode, ${width}px wide: every page fits the screen`, async ({ browser }) => {
      const context = await browser.newContext({
        viewport: { width, height: width < 500 ? 740 : 900 },
        colorScheme: scheme,
        hasTouch: width < 500,
        isMobile: width < 500,
      });
      const page = await context.newPage();
      /** Builds the location label used in overflow failure messages, e.g. "/task @ 375px dark". */
      const at = (p: string) => `${p} @ ${width}px ${scheme}`;

      // Home
      await page.goto("/");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expectNoHorizontalScroll(page, at("/"));

      // Task: start, check the first step, then answer all 5 tweets.
      await page.getByRole("checkbox").check();
      await page.getByRole("button", { name: "Start the task" }).click();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tweet 1 of 5");
      await expectNoHorizontalScroll(page, at("/task"));
      for (let i = 0; i < 5; i++) {
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(`Tweet ${i + 1} of 5`);
        await page.getByRole("radio", { name: "Joy", exact: true }).check();
        await page.getByRole("radio", { name: /^3 of 5/ }).check();
        // The Next/Submit button must be reachable without horizontal scrolling and be on screen when clicked.
        await page.getByRole("button", { name: i === 4 ? "Submit" : "Next", exact: true }).click();
      }

      // Debrief
      await expect(page).toHaveURL(/\/done$/);
      await expect(page.getByRole("heading", { name: "Thank you!" })).toBeVisible();
      await expectNoHorizontalScroll(page, at("/done"));

      // Reflection
      await page.goto("/reflection");
      await expectNoHorizontalScroll(page, at("/reflection"));

      // Admin
      await page.goto("/admin");
      await page.getByLabel("Password").fill(ADMIN_PASSWORD);
      await page.getByRole("button", { name: "Log in" }).click();
      await expect(page.getByRole("heading", { name: "Collected data" })).toBeVisible();
      await expectNoHorizontalScroll(page, at("/admin"));

      await context.close();
    });
  }
}
