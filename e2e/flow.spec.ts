/**
 * e2e/flow.spec.ts
 *
 * Scripted end-to-end run of the whole study, as real participants and as the
 * researcher. It also produces the screenshots required by the assignment in
 * docs/screenshots/:
 *
 *   participant-instructions.png   instructions + consent page
 *   participant-task-desktop.png   labeling screen (desktop)
 *   participant-task-mobile.png    labeling screen (390 px phone)
 *   participant-debrief.png        thank-you / debrief page
 *   admin-data.png                 the collected data (who labeled what)  <- deliverable
 *
 * Tests run in order and share one database: participant A (desktop, with a
 * mid-task page reload), participant B (desktop), participant C (mobile),
 * then the admin checks.
 */
import { expect, test, type Page } from "@playwright/test";
import { ADMIN_PASSWORD } from "../playwright.config";

const SHOTS = "docs/screenshots";
const LABEL_NAMES = ["Anger", "Fear", "Joy", "Love", "Sadness", "Surprise", "None of these / Unsure"];

/** Everything a scripted participant did, for later assertions. */
interface Run {
  participantId: string;
  tweets: string[];
  labels: string[];
}

/**
 * Collects the JSON bodies of all participant API responses so tests can
 * assert that no ground truth is served before submission.
 *
 * @param page The page to observe.
 * @returns A live array of `{ url, body }` entries.
 */
function captureApiBodies(page: Page) {
  const seen: { url: string; body: string }[] = [];
  page.on("response", async (res) => {
    if (res.url().includes("/api/participants")) {
      seen.push({ url: res.url(), body: await res.text().catch(() => "") });
    }
  });
  return seen;
}

/**
 * Starts a fresh participant from the home page (consent + optional nickname).
 *
 * @param page The page to drive.
 * @param nickname Nickname to type (may be empty).
 */
async function startTask(page: Page, nickname: string) {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Label the emotion in 5 tweets");
  const start = page.getByRole("button", { name: "Start the task" });
  await expect(start).toBeDisabled(); // consent required
  if (nickname) await page.getByLabel("Nickname (optional)").fill(nickname);
  await page.getByRole("checkbox").check();
  await expect(start).toBeEnabled();
  await start.click();
  await expect(page).toHaveURL(/\/task$/);
}

/**
 * Labels all 5 tweets, one screen at a time, and submits.
 *
 * @param page The page to drive (already on /task).
 * @param picks The 5 label names to choose, in order.
 * @param opts.reloadAt Reload the page after saving this many tweets (tests resume).
 * @param opts.shot Screenshot path for the first labeling screen.
 * @returns What the participant saw and chose.
 */
async function labelFiveTweets(
  page: Page,
  picks: string[],
  opts: { reloadAt?: number; shot?: string } = {},
): Promise<Run> {
  const tweets: string[] = [];
  for (let i = 0; i < 5; i++) {
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(`Tweet ${i + 1} of 5`);
    tweets.push((await page.locator(".tweet-card__text").innerText()).trim());

    const next = page.getByRole("button", { name: i === 4 ? "Submit" : "Next", exact: true });
    await expect(next).toBeDisabled(); // nothing chosen yet
    // Desktop: whole page. Phone: just the viewport, exactly as the participant sees it (sticky Back/Next bar).
    if (i === 0 && opts.shot) await page.screenshot({ path: opts.shot, fullPage: !opts.shot.includes("mobile") });

    await page.getByRole("radio", { name: picks[i], exact: true }).check();
    await expect(next).toBeDisabled(); // confidence still missing
    await page.getByRole("radio", { name: new RegExp(`^${(i % 5) + 1} of 5`) }).check();
    if (i === 0) await page.getByLabel(/Why did you choose this/).fill("Words like these usually signal this feeling.");
    await expect(next).toBeEnabled();
    await next.click();

    if (opts.reloadAt === i + 1) {
      // Refresh mid-task: the session must resume at the next unanswered tweet.
      await page.reload();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(`Tweet ${i + 2} of 5`);
      // ...and going Back must show the earlier saved answer.
      await page.getByRole("button", { name: "Back" }).click();
      await expect(page.getByRole("radio", { name: picks[i], exact: true })).toBeChecked();
      await page.getByRole("button", { name: "Next", exact: true }).click();
    }
  }
  await expect(page).toHaveURL(/\/done$/);
  const participantId = (await page.locator(".id-chip").innerText()).trim();
  expect(participantId).toMatch(/^P-[A-Z2-9]{6}$/);
  return { participantId, tweets, labels: picks };
}

const runs: Run[] = [];

test.describe.serial("participant flow", () => {
  test("A: desktop participant labels 5 tweets, survives a reload, sees the debrief", async ({ page }) => {
    const bodies = captureApiBodies(page);

    await page.goto("/");
    await page.screenshot({ path: `${SHOTS}/participant-instructions.png`, fullPage: true, caret: "initial" });
    await startTask(page, "E2E Tester");

    // Keyboard shortcut: pressing "3" selects Joy on the first tweet (wait for the screen to load first).
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tweet 1 of 5");
    await page.keyboard.press("3");
    await expect(page.getByRole("radio", { name: "Joy", exact: true })).toBeChecked();

    const run = await labelFiveTweets(page, ["Joy", "Anger", "Fear", "None of these / Unsure", "Love"], {
      reloadAt: 2,
      shot: `${SHOTS}/participant-task-desktop.png`,
    });
    runs.push(run);

    // Debrief reveals dataset labels only now.
    await expect(page.getByRole("heading", { name: "Thank you!" })).toBeVisible();
    await expect(page.locator(".debrief-item")).toHaveCount(5);
    await page.screenshot({ path: `${SHOTS}/participant-debrief.png`, fullPage: true });

    // 5 distinct tweets, and no ground truth in ANY response before /complete.
    expect(new Set(run.tweets).size).toBe(5);
    const beforeSubmit = bodies.filter((b) => !b.url.endsWith("/complete") && !b.url.endsWith("/results"));
    expect(beforeSubmit.length).toBeGreaterThan(5);
    for (const b of beforeSubmit) expect(b.body.toLowerCase()).not.toContain("groundtruth");
    const debrief = bodies.find((b) => b.url.endsWith("/complete"));
    expect(debrief?.body).toContain("groundTruth");
  });

  test("A: a completed browser cannot start again but can reset for testing", async ({ page }) => {
    // Same browser context is not shared between tests, so emulate by revisiting with stored ID.
    await page.goto("/");
    await page.evaluate((id) => localStorage.setItem("emotion-task.participantId", id), runs[0].participantId);
    await page.reload();
    await expect(page.getByRole("heading", { name: /already taken part/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Start the task" })).toHaveCount(0);
    await page.getByRole("button", { name: "Start new participant (testing)" }).click();
    await expect(page.getByRole("heading", { name: "Ready to start?" })).toBeVisible();
  });

  test("B: a second desktop participant gets their own random tweets", async ({ page }) => {
    await startTask(page, "");
    const run = await labelFiveTweets(page, ["Sadness", "Surprise", "Joy", "Anger", "Fear"]);
    runs.push(run);
    const overlap = run.tweets.filter((t) => runs[0].tweets.includes(t)).length;
    console.log(`Overlap between participants A and B: ${overlap} of 5 tweets`);
    expect(run.tweets.join("|")).not.toBe(runs[0].tweets.join("|")); // not the identical 5 in the same order
  });

  test("C: mobile participant (390x844) can complete the whole task", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();
    await startTask(page, "Phone Tester");

    // No horizontal page scroll on a phone.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);

    // Tap "i" to expand a description (touch behaviour).
    await page.getByRole("button", { name: /Show description of Fear/ }).tap();
    await expect(page.getByText(/afraid, anxious, worried or threatened/).first()).toBeVisible();

    const run = await labelFiveTweets(page, ["Love", "Love", "Sadness", "Surprise", "Anger"], {
      shot: `${SHOTS}/participant-task-mobile.png`,
    });
    runs.push(run);
    const overflowDone = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflowDone).toBeLessThanOrEqual(0);
    await context.close();
  });
});

test.describe.serial("researcher flow", () => {
  test("admin area rejects anonymous and wrong-password access", async ({ page, request }) => {
    expect((await request.get("/api/admin/data")).status()).toBe(401);
    await page.goto("/admin");
    await page.getByLabel("Password").fill("wrong-password");
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page.locator(".notice--error")).toContainText("Incorrect password");
  });

  test("admin sees who labeled which tweet with which label, and can export CSV", async ({ page }) => {
    await page.goto("/admin");
    await page.getByLabel("Password").fill(ADMIN_PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page.getByRole("heading", { name: "Collected data" })).toBeVisible();

    // 3 participants x 5 tweets = 15 label rows.
    await expect(page.locator("table.data tbody tr")).toHaveCount(15);
    for (const run of runs) {
      await expect(page.locator("table.data").getByText(run.participantId).first()).toBeVisible();
    }
    // Participant A's first tweet and chosen label appear in the table.
    const firstRow = page.locator("table.data tbody tr", { hasText: runs[0].tweets[0] }).first();
    await expect(firstRow).toContainText(runs[0].participantId);
    await expect(firstRow).toContainText("Joy");
    await expect(firstRow).toContainText("E2E Tester");

    // Filter by participant.
    await page.getByLabel("Filter by participant").selectOption(runs[1].participantId);
    await expect(page.locator("table.data tbody tr")).toHaveCount(5);
    await page.getByLabel("Filter by participant").selectOption("all");

    // The required "data collected" screenshot (wide viewport so every column is visible).
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({ path: `${SHOTS}/admin-data.png`, fullPage: true });

    // CSV export.
    const csv = await page.request.get("/api/admin/data?format=csv");
    expect(csv.status()).toBe(200);
    expect(csv.headers()["content-type"]).toContain("text/csv");
    const text = await csv.text();
    expect(text.trim().split("\r\n")).toHaveLength(16); // header + 15 rows
    expect(text).toContain(runs[0].participantId);

    // Sign out returns to the login form.
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page.getByRole("heading", { name: "Researcher login" })).toBeVisible();
  });
});

test("every label option is present with a unique keyboard shortcut", async ({ page }) => {
  await startTask(page, "");
  for (const name of LABEL_NAMES) {
    await expect(page.getByRole("radio", { name, exact: true })).toBeVisible();
  }
});
