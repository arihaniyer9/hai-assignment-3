/**
 * tests/storage-contract.test.ts — both storage back ends must behave the same.
 *
 * Always runs against in-memory SQLite. Runs against Supabase too when SUPABASE_CONTRACT_TEST=1
 * and SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are set. Run it on the study database BEFORE any
 * real participant, then empty the tables with supabase/reset.sql (README, "Deploy").
 */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { aiFor } from "../lib/ai";
import { loadItemSeeds } from "../lib/items";
import { createSqliteStorage } from "../lib/storage/sqlite";
import type { Storage } from "../lib/storage/types";

const backends: [string, () => Promise<Storage>][] = [["sqlite", async () => createSqliteStorage(":memory:")]];
const env = process.env;
if (env.SUPABASE_CONTRACT_TEST === "1" && env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
  backends.push([
    "supabase",
    async () => (await import("../lib/storage/supabase")).createSupabaseStorage(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!),
  ]);
}

const items = loadItemSeeds();

describe.each(backends)("storage contract: %s", (_name, make) => {
  it("seeds the pool idempotently and returns every item", { timeout: 30_000 }, async () => {
    const store = await make();
    await store.seedItems(items);
    await store.seedItems(items);
    const listed = await store.listItems();
    expect(listed).toHaveLength(items.length);
    expect(listed.find((i) => i.id === "catch-1")).toEqual(items.at(-1));
  });

  it("runs a whole session the way the service does", { timeout: 30_000 }, async () => {
    const store = await make();
    await store.seedItems(items);
    const tag = randomUUID().slice(0, 8);
    const id = `S-${tag.toUpperCase().replace(/[^A-Z2-9]/g, "A").slice(0, 6).padEnd(6, "A")}`;
    const code = `contract-${tag}`;

    expect(await store.createSession({ id, code, condition: "assisted", consentedAt: new Date().toISOString(), appVersion: "2" })).toBe("ok");
    expect(await store.createSession({ id: `${id.slice(0, -1)}Z`, code, condition: "assisted", consentedAt: "2026-01-01T00:00:00Z", appVersion: "2" })).toBe("code_taken");
    expect(await store.createSession({ id, code: `${code}-b`, condition: "assisted", consentedAt: "2026-01-01T00:00:00Z", appVersion: "2" })).toBe("id_taken");
    expect((await store.findOpenSession(code, "assisted"))?.id).toBe(id);
    expect(await store.findOpenSession(code, "baseline")).toBeNull();

    const picked = [items[0].id, items[1].id, "catch-1"];
    await store.createTrials(id, picked);
    expect([...(await store.seenItemIds(code))].sort()).toEqual([...picked].sort());

    const ai = aiFor(items[0].headline);
    await store.updateTrial(id, items[0].id, { initialAnswer: "Real", initialConfidence: 2, initialTimeMs: 1500, initialAt: new Date().toISOString() });
    await store.updateTrial(id, items[0].id, { ai, aiShownAt: new Date().toISOString() });
    await store.updateTrial(id, items[0].id, { finalAnswer: "Satire", finalConfidence: 4, finalTimeMs: 900, finalAt: new Date().toISOString() });

    const trials = await store.listTrials(id);
    expect(trials.map((t) => t.itemId)).toEqual(picked);
    expect(trials[0]).toMatchObject({
      headline: items[0].headline,
      label: items[0].label,
      type: items[0].type,
      initialAnswer: "Real",
      initialConfidence: 2,
      initialTimeMs: 1500,
      finalAnswer: "Satire",
      finalConfidence: 4,
    });
    expect(trials[0].ai).toEqual(ai); // the AI output survives the round trip exactly
    expect(trials[1].initialAnswer).toBeNull();

    await store.updateSession(id, { checkFailures: 1, checkPassedAt: new Date().toISOString(), comment: "ok" });
    await store.updateSession(id, { terminatedAt: new Date().toISOString() });
    const s = (await store.getSession(id))!;
    expect(s).toMatchObject({ code, condition: "assisted", checkFailures: 1, comment: "ok" });
    expect(s.terminatedAt).not.toBeNull();
    expect(await store.findOpenSession(code, "assisted")).toBeNull(); // terminated is not open
    expect(await store.createSession({ id: `${id.slice(0, -1)}Y`, code, condition: "assisted", consentedAt: new Date().toISOString(), appVersion: "2" })).toBe("ok");

    expect((await store.listAllSessions()).some((x) => x.id === id)).toBe(true);
    expect((await store.listAllTrials()).filter((t) => t.sessionId === id)).toHaveLength(3);
    expect(await store.getSession("S-NOPE22")).toBeNull();
  });
});
