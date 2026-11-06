/**
 * e2e/flow.spec.ts
 *
 * Scripted end-to-end runs of both conditions against a throwaway SQLite database, as real
 * participants and as the researcher. Tests run in order and share the database. They also write
 * the interface screenshots used in the report to docs/screenshots/.
 */
import { expect, test } from "@playwright/test";
import { ADMIN_PASSWORD } from "../playwright.config";
import { CATCH_TEXT, TOTAL, answerStep, captureApi, passCheck, start } from "./helpers";

const SHOTS = "docs/screenshots";
const CODE = "otter-42";
const seen: Record<string, string[]> = {};

test.describe.serial("participant flow", () => {
  test("baseline: instructions, check (one retry), 21 headlines with a reload, comment, score", async ({ page }) => {
    const api = captureApi(page);
    await page.goto("/baseline");
    await page.screenshot({ path: `${SHOTS}/baseline-instructions.png`, fullPage: true });
    await start(page, "baseline", "  Otter-42 ");

    // A wrong answer explains the rule and allows one more try.
    await page.getByRole("radio", { name: /funny or hard to believe/ }).check();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.locator("main [role=alert]")).toContainText("who published the headline");
    await passCheck(page);

    const headlines: string[] = [];
    for (let i = 1; i <= TOTAL; i++) {
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(`Headline ${i} of ${TOTAL}`);
      if (i === 1) await page.screenshot({ path: `${SHOTS}/baseline-trial.png`, fullPage: true });
      await expect(page.locator(".ai-panel")).toHaveCount(0); // never an AI in the baseline
      headlines.push(await answerStep(page, i % 2 ? "Satire" : "Real"));
      if (i === 5) {
        await page.reload(); // resumes at the next unanswered headline
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(`Headline 6 of ${TOTAL}`);
      }
    }
    expect(headlines).toContain(CATCH_TEXT);
    seen.baseline = headlines.filter((h) => h !== CATCH_TEXT);

    await page.getByLabel(/Anything you want to tell us/).fill("I looked for absurd premises.");
    await page.getByRole("button", { name: "Finish" }).click();
    await expect(page.getByRole("heading", { name: "Thank you!" })).toBeVisible();
    await expect(page.locator(".lede")).toContainText(/of 20/);
    await expect(page.locator(".id-chip")).toHaveText(CODE); // normalised code
    await page.screenshot({ path: `${SHOTS}/done.png`, fullPage: true });

    // No session response ever carried the answer key.
    for (const { body } of api) {
      const parsed = JSON.parse(body || "{}");
      for (const t of parsed.trials ?? parsed.state?.trials ?? []) {
        expect(Object.keys(t)).not.toContain("label");
        expect(Object.keys(t)).not.toContain("type");
      }
    }
  });

  test("assisted, same code: own answer, then live AI, then final answer; no repeated headlines", async ({ page }) => {
    await start(page, "assisted", CODE);
    await passCheck(page);
    const headlines: string[] = [];
    for (let i = 1; i <= TOTAL; i++) {
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(`Headline ${i} of ${TOTAL}`);
      if (i === 1) await page.screenshot({ path: `${SHOTS}/assisted-own-answer.png`, fullPage: true });
      const text = await answerStep(page, "Real", 2);
      headlines.push(text);
      if (text === CATCH_TEXT) continue; // no AI on the attention check

      // The AI appears only now, with the own answer recapped and locked.
      await expect(page.locator(".ai-panel")).toBeVisible();
      await expect(page.locator(".recap")).toContainText("Your own answer: Real, confidence 2 of 5");
      await expect(page.locator(".ai-panel__verdict")).toContainText(/The AI suggests (Satire|Real), \d+% sure/);
      await expect(page.getByRole("radio", { name: /^Real\b/ })).toBeChecked(); // pre-filled
      if (i === 1) await page.screenshot({ path: `${SHOTS}/assisted-ai.png`, fullPage: true });

      if (i === 2) {
        // A reload on the AI step shows the same, logged AI output.
        const before = await page.locator(".ai-panel").innerText();
        await page.reload();
        await expect(page.locator(".ai-panel")).toBeVisible();
        expect(await page.locator(".ai-panel").innerText()).toBe(before);
      }
      await answerStep(page, i % 3 ? "Real" : "Satire", 4);
    }
    const study = headlines.filter((h) => h !== CATCH_TEXT);
    expect(study).toHaveLength(20);
    expect(study.filter((h) => seen.baseline.includes(h))).toEqual([]);
    await page.getByRole("button", { name: "Finish" }).click();
    await expect(page.getByRole("heading", { name: "Thank you!" })).toBeVisible();
  });

  test("a code cannot take the same condition twice", async ({ page }) => {
    await start(page, "baseline", CODE);
    await expect(page.locator("main [role=alert]")).toContainText("already finished this part");
  });

  test("two wrong check answers end the attempt; the person can start again", async ({ page }) => {
    await start(page, "baseline", "fox-7");
    for (let i = 0; i < 2; i++) {
      await page.getByRole("radio", { name: /The AI says/ }).check();
      await page.getByRole("button", { name: "Continue" }).click();
      if (i === 0) await expect(page.locator("main [role=alert]")).toBeVisible();
    }
    await expect(page.getByRole("heading", { name: "Please start again" })).toBeVisible();
    await page.getByRole("button", { name: "Start again" }).click();
    await start(page, "baseline", "fox-7");
    await passCheck(page);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(`Headline 1 of ${TOTAL}`);
  });

  test("phone (390x844): the assisted flow works and fits the screen", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    await start(page, "assisted", "phone-1");
    await passCheck(page);
    await answerStep(page, "Satire", 3);
    await expect(page.locator(".ai-panel")).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/assisted-ai-mobile.png` });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    await context.close();
  });
});

test.describe.serial("researcher", () => {
  test("the admin data is refused without a valid login", async ({ page, request }) => {
    expect((await request.get("/api/admin/data")).status()).toBe(401);
    await page.goto("/admin");
    await page.getByLabel("Password").fill("wrong");
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page.locator("main [role=alert]")).toBeVisible();
  });

  test("the admin sees every session and downloads both analysis files", async ({ page }) => {
    await page.goto("/admin");
    await page.getByLabel("Password").fill(ADMIN_PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page.getByRole("heading", { name: "Collected data" })).toBeVisible();
    await expect(page.locator("tbody tr")).toHaveCount(5); // otter x2, fox stopped + fox again, phone
    await page.screenshot({ path: `${SHOTS}/admin.png`, fullPage: true });

    const trials = await (await page.request.get("/api/admin/data?format=trials")).text();
    const lines = trials.trim().split("\r\n");
    expect(lines[0]).toContain("scored_correct");
    const otter = lines.filter((l) => l.includes(",otter-42,"));
    expect(otter).toHaveLength(2 * TOTAL);
    const assisted = otter.filter((l) => l.includes(",assisted,") && !l.includes("catch-1"));
    expect(assisted.every((l) => /,(Satire|Real),(true|false),\d,\d+,/.test(l))).toBe(true);

    const sessions = await (await page.request.get("/api/admin/data?format=sessions")).text();
    expect(sessions).toContain("I looked for absurd premises.");
    expect(sessions.trim().split("\r\n")).toHaveLength(1 + 5);
  });
});
