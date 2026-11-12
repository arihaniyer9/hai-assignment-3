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

/** Splits one RFC 4180 CSV line (quoted cells may contain commas and doubled quotes). */
function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      cells.push(cell);
      cell = "";
    } else cell += ch;
  }
  cells.push(cell);
  return cells;
}
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
      if (i === 3) {
        // Go back within 10 seconds and change the answer to headline 3 (Satire -> Real).
        const back = page.getByRole("button", { name: /Go back and change it/ });
        await expect(back).toBeVisible();
        await page.screenshot({ path: `${SHOTS}/go-back.png` });
        await back.click();
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(`Headline 3 of ${TOTAL}`);
        await expect(page.getByRole("radio", { name: /^Satire\b/ })).toBeChecked(); // prefilled
        await page.getByRole("radio", { name: /^Real\b/ }).check();
        await page.getByRole("button", { name: "Save the change" }).click();
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(`Headline 4 of ${TOTAL}`);
        await expect(page.getByRole("button", { name: /Go back and change it/ })).toHaveCount(0);
      }
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

    // Results stay locked until both parts are done.
    await page.getByRole("link", { name: "see your results" }).click();
    await expect(page.locator("main [role=alert]")).toContainText("unlock once you have finished both parts");
    await expect(page.locator("table")).toHaveCount(0);

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
      // the own answer is locked by the AI that follows: no go-back offer for it
      await expect(page.getByRole("button", { name: /Go back and change it/ })).toHaveCount(0);

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

    // After a final answer the go-back offer appears; check it once, without using it.
    await expect(page.getByRole("button", { name: /Go back and change it/ })).toBeVisible();
    await page.getByRole("button", { name: "Finish" }).click();
    await expect(page.getByRole("heading", { name: "Thank you!" })).toBeVisible();

    // Both parts done: the results page lists every headline of both parts.
    await page.getByRole("link", { name: "see your results" }).click();
    await expect(page.getByRole("heading", { name: "Part on your own" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Part with the AI" })).toBeVisible();
    await expect(page.locator("table")).toHaveCount(2);
    await expect(page.locator("tbody tr")).toHaveCount(40);
    await expect(page.getByText("AI would have said")).toBeVisible();
    await expect(page.getByText(/After seeing the AI you changed your answer \d+ times/)).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/results.png`, fullPage: true });
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

    // The one go-back change (otter-42, baseline headline 3) is counted; nothing else was revised.
    const header = parseCsvLine(lines[0]);
    const col = (line: string, name: string) => parseCsvLine(line)[header.indexOf(name)];
    const revised = otter.filter((l) => col(l, "initial_revisions") !== "0" || col(l, "final_revisions") !== "0");
    expect(revised).toHaveLength(1);
    expect(col(revised[0], "position")).toBe("3");
    expect(col(revised[0], "initial_answer")).toBe("Real");
    expect(otter.every((l) => col(l, "app_version") === "2")).toBe(true);

    const sessions = await (await page.request.get("/api/admin/data?format=sessions")).text();
    expect(sessions).toContain("I looked for absurd premises.");
    expect(sessions.trim().split("\r\n")).toHaveLength(1 + 5);
  });
});
