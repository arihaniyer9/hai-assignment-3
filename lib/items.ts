/**
 * lib/items.ts
 *
 * The trial pool: the 240 Assignment 2 study headlines (data/a2/study_items.json, exported from A2
 * with its SHA-256 recorded in data/a2/SOURCES.json) plus one attention-check item. Server only.
 */
import studyItems from "../data/a2/study_items.json";
import { ANSWERS, CATCH_ITEM_ID, ITEM_TYPES, TRIALS_PER_TYPE } from "./constants";
import type { ItemSeed } from "./types";

/** The attention check: an instruction dressed as a headline, with an obvious answer. */
export const CATCH_ITEM: ItemSeed = {
  id: CATCH_ITEM_ID,
  headline: "Attention Check: Please Choose Real for This One",
  label: "Real",
  type: "catch",
  topic: "attention_check",
  source: "study",
};

/**
 * Validates the raw study items so a bad export cannot reach participants.
 *
 * @param raw Parsed JSON from the A2 export.
 * @returns The items, typed.
 * @throws Error when an item is malformed, an id repeats, or a type has too few items.
 */
export function validateItems(raw: unknown): ItemSeed[] {
  if (!Array.isArray(raw)) throw new Error("study items must be a list");
  const items = raw.map((r, i): ItemSeed => {
    const ok =
      r &&
      typeof r.id === "string" &&
      r.id.length > 0 &&
      typeof r.headline === "string" &&
      r.headline.length > 0 &&
      (ANSWERS as readonly string[]).includes(r.label) &&
      (ITEM_TYPES as readonly string[]).includes(r.type) &&
      typeof r.topic === "string" &&
      typeof r.source === "string";
    if (!ok) throw new Error(`study item ${i} is malformed`);
    return { id: r.id, headline: r.headline, label: r.label, type: r.type, topic: r.topic, source: r.source };
  });
  if (new Set(items.map((i) => i.id)).size !== items.length) throw new Error("duplicate item ids");
  for (const type of ITEM_TYPES) {
    // Two sessions per code (one per condition) never share items, so each type needs 2x.
    const n = items.filter((i) => i.type === type).length;
    if (n < 2 * TRIALS_PER_TYPE) throw new Error(`too few ${type} items: ${n}`);
  }
  return items;
}

/** All items to seed into the database: the study set plus the attention check. */
export function loadItemSeeds(): ItemSeed[] {
  return [...validateItems(studyItems), CATCH_ITEM];
}
