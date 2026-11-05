/**
 * scripts/seed.ts
 *
 * Loads `data/tweets.json` into the active database (Supabase when
 * SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set, otherwise the local SQLite
 * file). Safe to run repeatedly: tweets are upserted by id.
 *
 * Run with:  npm run seed
 *   (env vars are read from .env.local via Node's --env-file flag, see package.json)
 */
import { loadTweetSeeds } from "../lib/dataset";
import { getStorage } from "../lib/storage";

/**
 * Script entry point: seeds the tweet pool and prints how many tweets exist.
 *
 * @returns Resolves when seeding is done.
 */
async function main(): Promise<void> {
  const target = process.env.SUPABASE_URL ? "Supabase" : "local SQLite";
  const tweets = loadTweetSeeds();
  const storage = await getStorage();
  await storage.seedTweets(tweets);
  const stored = await storage.listTweets();
  console.log(`Seeded ${tweets.length} tweets into ${target}; database now holds ${stored.length}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
