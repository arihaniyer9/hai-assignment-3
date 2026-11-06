/**
 * scripts/reset-db.ts
 *
 * Runs supabase/reset.sql over DATABASE_URL: deletes every session and trial, keeps the item pool.
 * Used after the contract test and dry runs, never once real data is being collected. It refuses
 * to run without --yes, and prints the row counts before and after.
 *
 * Run with:  npm run db:reset -- --yes
 */
import { readFileSync } from "node:fs";
import { Client } from "pg";

async function counts(client: Client) {
  const q = async (t: string) => Number((await client.query(`select count(*) from public.${t}`)).rows[0].count);
  return { items: await q("items"), sessions: await q("sessions"), trials: await q("trials") };
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Set DATABASE_URL in .env.local.");
  const ca = readFileSync("supabase/prod-ca-2021.crt", "utf8");
  const client = new Client({ connectionString: url, ssl: { ca, rejectUnauthorized: true } });
  await client.connect();
  try {
    console.log("before:", await counts(client));
    if (!process.argv.includes("--yes")) {
      console.log("Nothing deleted. Add --yes to delete every session and trial.");
      return;
    }
    await client.query(readFileSync("supabase/reset.sql", "utf8"));
    console.log("after: ", await counts(client));
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
