/**
 * lib/storage/index.ts
 *
 * Chooses the storage back end from environment variables:
 *
 *   SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY set  -> Supabase Postgres
 *   otherwise, when NODE_ENV !== "production"      -> local SQLite file
 *   otherwise (production without Supabase)        -> throw (never silently
 *                                                     fall back to an ephemeral
 *                                                     SQLite file on Vercel)
 *
 * The instance is cached on `globalThis` so it survives hot reloads in dev.
 */
import type { Storage } from "./types";

const globalForStorage = globalThis as unknown as { __storagePromise?: Promise<Storage> };

/**
 * Builds the storage for the current environment (see file comment).
 *
 * @returns A ready-to-use {@link Storage}.
 * @throws Error when running in production without Supabase configuration.
 */
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
  // Loaded lazily so the SQLite module is never touched in production.
  const [{ createSqliteStorage }, { loadTweetSeeds }] = await Promise.all([
    import("./sqlite"),
    import("../dataset"),
  ]);
  const storage = createSqliteStorage(process.env.SQLITE_PATH ?? ".data/dev.sqlite");
  // Convenience for local dev: make sure the pool is present.
  if ((await storage.listTweets()).length === 0) await storage.seedTweets(loadTweetSeeds());
  return storage;
}

/**
 * Returns the process-wide Storage, creating it on first use.
 *
 * @returns The shared {@link Storage} instance.
 */
export function getStorage(): Promise<Storage> {
  if (!globalForStorage.__storagePromise) {
    globalForStorage.__storagePromise = createStorage().catch((err) => {
      // Do not cache a failure: allow a retry after the configuration is fixed.
      globalForStorage.__storagePromise = undefined;
      throw err;
    });
  }
  return globalForStorage.__storagePromise;
}
