/** Shared steps for the end-to-end specs. */
import { expect, type Page } from "@playwright/test";

export const CATCH_TEXT = "Attention Check: Please Choose Real for This One";
export const TOTAL = 21;

/** Collects every /api/sessions response body, to check that no ground truth is ever served. */
export function captureApi(page: Page) {
  const seen: { url: string; body: string }[] = [];
  page.on("response", async (res) => {
    if (res.url().includes("/api/sessions")) seen.push({ url: res.url(), body: await res.text().catch(() => "") });
  });
  return seen;
}

/** Fills in the intro (code + consent) and starts. */
export async function start(page: Page, condition: "baseline" | "assisted", code: string) {
  await page.goto(`/${condition}`);
  const button = page.getByRole("button", { name: "Start" });
  await expect(button).toBeDisabled();
  await page.getByLabel("Your code").fill(code);
  await expect(button).toBeDisabled(); // consent still missing
  await page.getByRole("checkbox").check();
  await expect(button).toBeEnabled();
  await button.click();
}

/** Answers the instruction check correctly. */
export async function passCheck(page: Page) {
  await expect(page.getByRole("heading", { name: "Quick check before you start" })).toBeVisible();
  await page.getByRole("radio", { name: /published by a satire website/ }).check();
  await page.getByRole("button", { name: "Continue" }).click();
}

const confidence = (n: number) => new RegExp(`^${n} of 5`);

/**
 * Answers one step on the current screen: Satire/Real (Real for the attention check) and a
 * confidence, then presses the primary button. Returns the headline text.
 */
export async function answerStep(page: Page, pick: "Satire" | "Real", conf = 3): Promise<string> {
  const card = page.locator(".tweet-card__text, .ai-panel__headline").first();
  const raw = (await card.innerText()).trim();
  const answer = raw === CATCH_TEXT ? "Real" : pick;
  const button = page.locator("form .btn--primary");
  await expect(button).toBeDisabled();
  await page.getByRole("radio", { name: new RegExp(`^${answer}\\b`) }).check();
  await page.getByRole("radio", { name: confidence(conf) }).check();
  await expect(button).toBeEnabled();
  await button.click();
  return raw;
}
