/**
 * scripts/build-dataset.mjs
 *
 * Builds the task's tweet pool (`data/tweets.json`) from the HuggingFace
 * `dair-ai/emotion` dataset (Saravia et al., 2018).
 *
 * What it does:
 *   1. Downloads the whole `train` split (16,000 rows) through the public
 *      datasets-server API, 100 rows per request.
 *   2. Keeps tweets that are 8-40 words long and removes duplicate texts.
 *   3. With a seeded PRNG (mulberry32, seed 42) picks exactly 10 tweets per
 *      emotion, so the pool has 60 tweets and every run gives the same file.
 *   4. Writes `data/tweets.json` with the tweet text left exactly as in the
 *      dataset (lowercase, no punctuation).
 *
 * Run with:  npm run build-dataset
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Dataset label ids -> emotion names, as published by the dataset card. */
const LABEL_NAMES = ["sadness", "joy", "love", "anger", "fear", "surprise"];
const PER_EMOTION = 10;
const MIN_WORDS = 8;
const MAX_WORDS = 40;
const SEED = 42;
const PAGE_SIZE = 100;
const CACHE_FILE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  ".data",
  "hf-train-cache.json",
);
const BASE_URL =
  "https://datasets-server.huggingface.co/rows?dataset=dair-ai/emotion&config=split&split=train";

/**
 * mulberry32: a tiny deterministic PRNG so the sample is reproducible.
 * @param {number} seed Any 32-bit integer.
 * @returns {() => number} A function returning floats in [0, 1).
 */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deterministic in-place Fisher-Yates shuffle.
 * @template T
 * @param {T[]} items The array to shuffle (mutated).
 * @param {() => number} rand Random source returning floats in [0, 1).
 * @returns {T[]} The same array, shuffled.
 */
function shuffle(items, rand) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

/**
 * Sleeps for the given number of milliseconds.
 * @param {number} ms Delay length.
 * @returns {Promise<void>} Resolves after the delay.
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Fetches one page of rows. On HTTP 429/5xx or a network error it waits (the
 * server's `Retry-After` when given, otherwise exponential backoff capped at
 * 60 s) and tries again, because the public API rate-limits bulk downloads.
 * @param {number} offset Row offset of the page.
 * @returns {Promise<{row: {text: string, label: number}}[]>} The page's rows.
 */
async function fetchPage(offset) {
  const url = `${BASE_URL}&offset=${offset}&length=${PAGE_SIZE}`;
  for (let attempt = 0; attempt < 12; attempt++) {
    let waitMs = Math.min(1000 * 2 ** attempt, 60000);
    try {
      const res = await fetch(url);
      if (res.ok) return (await res.json()).rows;
      if (res.status !== 429 && res.status < 500) {
        throw new Error(`HTTP ${res.status} for ${url}`);
      }
      const retryAfter = Number(res.headers.get("retry-after"));
      if (retryAfter > 0) waitMs = Math.min(retryAfter * 1000, 120000);
    } catch (err) {
      if (attempt === 11) throw err;
    }
    process.stdout.write(`\n  rate limited, waiting ${Math.round(waitMs / 1000)}s...`);
    await sleep(waitMs);
  }
  throw new Error(`Gave up fetching ${url}`);
}

/**
 * Loads rows saved by an earlier, interrupted run so the download can resume.
 * @returns {Promise<{text: string, label: number}[]>} Cached rows (maybe empty).
 */
async function loadCache() {
  try {
    return JSON.parse(await readFile(CACHE_FILE, "utf8"));
  } catch {
    return [];
  }
}

/**
 * Downloads every row of the train split, paced politely and resumable: the
 * rows fetched so far are cached in `.data/hf-train-cache.json`.
 * @returns {Promise<{text: string, label: number}[]>} All rows.
 */
async function fetchAllRows() {
  const rows = await loadCache();
  await mkdir(path.dirname(CACHE_FILE), { recursive: true });
  for (let offset = rows.length; offset < 16000; offset += PAGE_SIZE) {
    const page = await fetchPage(offset);
    for (const item of page) rows.push(item.row);
    await writeFile(CACHE_FILE, JSON.stringify(rows));
    process.stdout.write(`\rDownloaded ${rows.length} rows`);
    await sleep(400);
  }
  process.stdout.write("\n");
  return rows;
}

/**
 * Script entry point: download, filter, sample, write the JSON file.
 * @returns {Promise<void>} Resolves when the file is written.
 */
async function main() {
  const rows = await fetchAllRows();
  const seen = new Set();
  const byEmotion = Object.fromEntries(LABEL_NAMES.map((n) => [n, []]));

  for (const { text, label } of rows) {
    const words = text.trim().split(/\s+/).length;
    if (words < MIN_WORDS || words > MAX_WORDS || seen.has(text)) continue;
    seen.add(text);
    byEmotion[LABEL_NAMES[label]].push(text);
  }

  const rand = mulberry32(SEED);
  const picked = [];
  for (const emotion of LABEL_NAMES) {
    const chosen = shuffle(byEmotion[emotion], rand).slice(0, PER_EMOTION);
    if (chosen.length < PER_EMOTION) {
      throw new Error(`Not enough ${emotion} tweets after filtering`);
    }
    for (const text of chosen) picked.push({ text, groundTruth: emotion });
  }

  // Shuffle so ids are not grouped by emotion, then assign stable ids.
  const tweets = shuffle(picked, rand).map((t, i) => ({
    id: `t${String(i + 1).padStart(3, "0")}`,
    text: t.text,
    groundTruth: t.groundTruth,
  }));

  const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data");
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, "tweets.json"), JSON.stringify(tweets, null, 2) + "\n");

  const counts = {};
  for (const t of tweets) counts[t.groundTruth] = (counts[t.groundTruth] ?? 0) + 1;
  console.log(`Wrote ${tweets.length} tweets to data/tweets.json`, counts);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
