/**
 * e2e/theme-layout.spec.ts
 *
 * Checks two things a user asked for:
 *   1. The Light / Dark / Auto theme switch works, is remembered, and never
 *      flashes the wrong theme on reload.
 *   2. On a wide desktop screen the layout uses the available width: a wide
 *      content area, instructions beside the start panel, and the tweet beside
 *      the answer controls.
 *
 * Runs after flow.spec.ts and responsive.spec.ts (alphabetical order), because
 * flow.spec.ts asserts exact row counts in the shared test database.
 */
import { expect, test, type Page } from "@playwright/test";

/** Page background colours produced by the two themes (see --bg in globals.css). */
const LIGHT_BG = "rgb(245, 246, 248)";
const DARK_BG = "rgb(15, 18, 22)";

/**
 * Reads the computed page background colour.
 *
 * @param page The page to inspect.
 * @returns A CSS colour string like "rgb(15, 18, 22)".
 */
const background = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.body).backgroundColor);

/**
 * Picks a theme in the header switch.
 *
 * @param page The page to drive.
 * @param name "Light", "Dark" or "Auto".
 */
async function chooseTheme(page: Page, name: "Light" | "Dark" | "Auto") {
  await page.getByRole("group", { name: "Colour theme" }).getByRole("radio", { name }).check();
}

test.describe("theme switch", () => {
  test("Auto follows the device; Light and Dark override it; the choice is remembered", async ({
    browser,
  }) => {
    // Device is set to DARK.
    const context = await browser.newContext({ colorScheme: "dark", viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    await page.goto("/");
    expect(await background(page)).toBe(DARK_BG); // Auto -> follows the device
    await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.+/);

    await chooseTheme(page, "Light"); // override the device
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    expect(await background(page)).toBe(LIGHT_BG);

    await page.reload(); // remembered, and applied before first paint
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    expect(await background(page)).toBe(LIGHT_BG);
    await expect(
      page.getByRole("group", { name: "Colour theme" }).getByRole("radio", { name: "Light" }),
    ).toBeChecked();

    await chooseTheme(page, "Auto"); // back to following the device (dark)
    await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.+/);
    expect(await background(page)).toBe(DARK_BG);
    await context.close();
  });

  test("Dark overrides a light device and persists across pages", async ({ browser }) => {
    const context = await browser.newContext({ colorScheme: "light", viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    await page.goto("/");
    expect(await background(page)).toBe(LIGHT_BG);
    await chooseTheme(page, "Dark");
    expect(await background(page)).toBe(DARK_BG);
    await page.goto("/reflection");
    expect(await background(page)).toBe(DARK_BG);
    await context.close();
  });

  test("the switch is usable on a small phone (icons only, no overflow)", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 320, height: 700 }, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    await page.goto("/");
    const group = page.getByRole("group", { name: "Colour theme" });
    await expect(group).toBeVisible();
    const box = (await group.boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(320);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    await context.close();
  });
});

test.describe("wide desktop layout (1470x900)", () => {
  test.use({ viewport: { width: 1470, height: 900 } });

  test("home: wide content, instructions beside the start panel", async ({ page }) => {
    await page.goto("/");
    const container = (await page.locator("main .container").first().boundingBox())!;
    expect(container.width).toBeGreaterThan(1150); // was 720 before
    const instructions = (await page.getByRole("heading", { name: "What you will do" }).boundingBox())!;
    const start = (await page.getByRole("heading", { name: "Ready to start?" }).boundingBox())!;
    expect(start.x).toBeGreaterThan(instructions.x + 500); // side by side, not stacked
    expect(start.y).toBeLessThan(900); // visible without scrolling
  });

  test("task: tweet on the left, answer controls on the right", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Start the task" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tweet 1 of 5");
    const tweet = (await page.locator(".tweet-card").boundingBox())!;
    const options = (await page.locator(".option-grid").boundingBox())!;
    expect(options.x).toBeGreaterThan(tweet.x + tweet.width - 1); // right of the tweet
    expect(Math.abs(options.y - tweet.y)).toBeLessThan(200); // roughly level with it
    expect(tweet.x + tweet.width + options.width).toBeGreaterThan(1000);
  });
});
