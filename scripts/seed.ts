/**
 * scripts/seed.ts
 *
 * Loads the 240 study headlines and the attention-check item into the active database (Supabase
 * when SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set, otherwise the local SQLite file). Safe to
 * run repeatedly: items are upserted by id.
 *
 * Run with:  npm run seed
 */
import { loadItemSeeds } from "../lib/items";
import { getStorage } from "../lib/storage";

async function main(): Promise<void> {
  const target = process.env.SUPABASE_URL ? "Supabase" : "local SQLite";
  const items = loadItemSeeds();
  const storage = await getStorage();
  await storage.seedItems(items);
  const stored = await storage.listItems();
  console.log(`Seeded ${items.length} items into ${target}; database now holds ${stored.length}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
