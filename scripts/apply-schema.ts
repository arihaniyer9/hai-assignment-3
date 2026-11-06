/**
 * scripts/apply-schema.ts
 *
 * Creates the study tables by running supabase/schema.sql over a direct Postgres connection
 * (DATABASE_URL in .env.local), as an alternative to pasting the file into the Supabase SQL
 * Editor. Every statement is idempotent ("if not exists"), so running it twice is safe. It then
 * lists the tables and confirms Row Level Security is on for each. The certificate is
 * Supabase Root 2021 CA, SHA-256 80:70:25:AD:...:72:E6:CA:FA, valid to 2031-04-26.
 *
 * Run with:  npm run db:schema
 */
import { readFileSync } from "node:fs";
import { Client } from "pg";

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Set DATABASE_URL in .env.local (Supabase: Connect -> Session pooler).");
  // Supabase signs its database certificates with its own root CA (public, committed in
  // supabase/prod-ca-2021.crt), so the connection is fully verified, never `rejectUnauthorized: false`.
  const ca = readFileSync("supabase/prod-ca-2021.crt", "utf8");
  const client = new Client({ connectionString: url, ssl: { ca, rejectUnauthorized: true } });
  await client.connect();
  try {
    await client.query(readFileSync("supabase/schema.sql", "utf8"));
    const { rows } = await client.query<{ tablename: string; rowsecurity: boolean }>(
      `select tablename, rowsecurity from pg_tables
       where schemaname = 'public' and tablename in ('items', 'sessions', 'trials') order by tablename`,
    );
    for (const r of rows) console.log(`${r.tablename}: row level security ${r.rowsecurity ? "on" : "OFF"}`);
    if (rows.length !== 3 || rows.some((r) => !r.rowsecurity)) throw new Error("schema not complete");
    console.log("Schema applied.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
