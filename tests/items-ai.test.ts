/**
 * tests/items-ai.test.ts — the trial pool and the live AI output.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CONFIDENT_THRESHOLD, aiFor, getModel } from "../lib/ai";
import { CATCH_ITEM_ID, ITEM_TYPES } from "../lib/constants";
import { CATCH_ITEM, loadItemSeeds, validateItems } from "../lib/items";

const raw = JSON.parse(readFileSync("data/a2/study_items.json", "utf8"));
const parity: { text: string; probability_satire: number }[] = JSON.parse(
  readFileSync("data/a2/parity.json", "utf8"),
);

describe("item pool", () => {
  it("is the 240 A2 study items, 120 per label, in the A2 type quotas, plus the attention check", () => {
    const items = loadItemSeeds();
    expect(items).toHaveLength(241);
    const study = items.filter((i) => i.id !== CATCH_ITEM_ID);
    expect(study.filter((i) => i.label === "Satire")).toHaveLength(120);
    const counts = Object.fromEntries(ITEM_TYPES.map((t) => [t, study.filter((i) => i.type === t).length]));
    expect(counts).toEqual({ obvious_satire: 45, subtle_satire: 75, real_absurd: 55, plain_real: 65 });
    expect(items.at(-1)).toEqual(CATCH_ITEM);
  });

  it("the attention check states its own answer", () => {
    expect(CATCH_ITEM.headline).toMatch(/choose real/i);
    expect(CATCH_ITEM.label).toBe("Real");
  });

  it("refuses malformed exports", () => {
    expect(() => validateItems({})).toThrow(/list/);
    expect(() => validateItems([{ ...raw[0], label: "satire" }, ...raw.slice(1)])).toThrow(/malformed/);
    expect(() => validateItems([{ ...raw[0], type: "other" }, ...raw.slice(1)])).toThrow(/malformed/);
    expect(() => validateItems([{ ...raw[0], headline: "" }, ...raw.slice(1)])).toThrow(/malformed/);
    expect(() => validateItems([raw[0], ...raw])).toThrow(/duplicate/);
  });

  it("refuses a pool that cannot give one code two disjoint sessions", () => {
    const few = raw.filter((r: { type: string }) => r.type !== "obvious_satire").concat(
      raw.filter((r: { type: string }) => r.type === "obvious_satire").slice(0, 9),
    );
    expect(() => validateItems(few)).toThrow(/too few obvious_satire/);
    expect(validateItems(raw)).toHaveLength(240); // positive twin
  });
});

describe("aiFor", () => {
  it("matches the A2 Python probability for every study headline", () => {
    for (const c of parity.slice(0, 240)) {
      const ai = aiFor(c.text);
      expect(Math.abs(ai.probSatire - c.probability_satire)).toBeLessThan(1e-9);
      expect(ai.label).toBe(c.probability_satire >= 0.5 ? "Satire" : "Real");
      expect(ai.confidence).toBeCloseTo(Math.max(c.probability_satire, 1 - c.probability_satire), 12);
    }
  });

  it("uses the threshold frozen in A2 (0.7) for the confident badge, inclusive", () => {
    expect(CONFIDENT_THRESHOLD).toBe(0.7);
    const ai = aiFor(parity[0].text);
    expect(aiFor(parity[0].text, getModel(), ai.confidence).confident).toBe(true);
    expect(aiFor(parity[0].text, getModel(), ai.confidence + 1e-9).confident).toBe(false);
  });

  it("flags as confident the same 97 study headlines as A2", () => {
    const n = parity.slice(0, 240).filter((c) => aiFor(c.text).confident).length;
    expect(n).toBe(97);
  });

  it("lists only words that visibly push the answer, with spans into the headline", () => {
    const text = "Scientists Discover New Little Blue Octopus in Galapagos";
    const ai = aiFor(text);
    expect(ai.words.map((w) => w.text)).toEqual([
      "scientists", "discover", "new", "little", "blue", "octopus", "in",
    ]); // prettier-ignore
    for (const w of ai.words) {
      expect(Math.abs(w.value)).toBeGreaterThanOrEqual(0.005);
      expect(text.slice(w.start, w.end).toLowerCase()).toBe(w.text);
    }
    expect(ai.label).toBe("Satire");
    expect(Math.round(ai.confidence * 100)).toBe(87); // as in the A2 report's example
  });
});
