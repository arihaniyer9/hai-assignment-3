/**
 * e2e/responsive.spec.ts
 *
 * At five widths and in light and dark schemes, every screen of the study fits with no horizontal
 * page scroll: landing, instructions, check, a headline, and the AI step. Runs after flow.spec.ts
 * (alphabetical order), which asserts exact row counts in the shared database.
 */
import { expect, test, type Page } from "@playwright/test";
import { answerStep, passCheck, start } from "./helpers";

const WIDTHS = [320, 375, 768, 1024, 1440];

async function fits(page: Page, where: string) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, `horizontal overflow on ${where}`).toBeLessThanOrEqual(0);
}

for (const scheme of ["light", "dark"] as const) {
  for (const width of WIDTHS) {
    test(`${scheme}, ${width}px: every study screen fits`, async ({ browser }) => {
      const context = await browser.newContext({
        viewport: { width, height: width < 500 ? 740 : 900 },
        colorScheme: scheme,
        isMobile: width < 500,
        hasTouch: width < 500,
      });
      const page = await context.newPage();
      const at = (p: string) => `${p} @ ${width}px ${scheme}`;
      await page.goto("/");
      await fits(page, at("/"));
      await page.goto("/assisted");
      await fits(page, at("/assisted intro"));
      await start(page, "assisted", `r-${scheme}-${width}`);
      await fits(page, at("check"));
      await passCheck(page);
      await fits(page, at("headline"));
      await answerStep(page, "Satire");
      await expect(page.locator(".ai-panel")).toBeVisible();
      await fits(page, at("AI step"));
      await context.close();
    });
  }
}
