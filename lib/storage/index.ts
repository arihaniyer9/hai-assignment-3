/**
 * lib/storage/index.ts
 *
 * Chooses the storage back end from environment variables:
 *
 *   SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY set  -> Supabase Postgres
 *   otherwise, when NODE_ENV !== "production"      -> local SQLite file
 *   otherwise (production without Supabase)        -> throw, never an ephemeral SQLite file
 *
 * The instance is cached on `globalThis` so it survives hot reloads in development.
 */
import type { Storage } from "./types";

const globalForStorage = globalThis as unknown as { __storagePromise?: Promise<Storage> };

async function createStorage(): Promise<Storage> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) {
    const { createSupabaseStorage } = await import("./supabase");
    return createSupabaseStorage(url, key);
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Storage is not configured: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY " +
        "(SQLite is only available outside production).",
    );
  }
  const [{ createSqliteStorage }, { loadItemSeeds }] = await Promise.all([
    import("./sqlite"),
    import("../items"),
  ]);
  const storage = createSqliteStorage(process.env.SQLITE_PATH ?? ".data/dev.sqlite");
  // Local convenience: make sure the item pool is present.
  if ((await storage.listItems()).length === 0) await storage.seedItems(loadItemSeeds());
  return storage;
}

/** The process-wide Storage, created on first use; a failed creation is not cached. */
export function getStorage(): Promise<Storage> {
  if (!globalForStorage.__storagePromise) {
    globalForStorage.__storagePromise = createStorage().catch((err) => {
      globalForStorage.__storagePromise = undefined;
      throw err;
    });
  }
  return globalForStorage.__storagePromise;
}
