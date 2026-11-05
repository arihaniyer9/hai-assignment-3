/**
 * tests/model.test.ts — the TypeScript predictor must match the Assignment 2 Python predictor.
 *
 * data/a2/parity.json holds Python's full-precision output for all 240 study headlines plus edge
 * cases (Unicode, apostrophes, repeats, empty text), written by scripts/export_from_a2.py.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ModelError,
  contributions,
  logit,
  parseModel,
  probabilitySatire,
  type Model,
} from "../lib/model";

const raw = JSON.parse(readFileSync("data/a2/model.json", "utf8"));
const model = parseModel(raw);
interface Case {
  text: string;
  probability_satire: number;
  contributions: { text: string; value: number }[];
}
const cases: Case[] = JSON.parse(readFileSync("data/a2/parity.json", "utf8"));

describe("parity with the Python predictor", () => {
  it("covers every study headline and the edge cases", () => {
    expect(cases.length).toBe(254);
  });

  it("gives the same probability for every case, to 1e-9", () => {
    let worst = 0;
    for (const c of cases) {
      worst = Math.max(worst, Math.abs(probabilitySatire(model, c.text) - c.probability_satire));
    }
    expect(worst).toBeLessThan(1e-9);
  });

  it("finds the same words with the same pushes, and spans slice back to the word", () => {
    for (const c of cases) {
      const mine = contributions(model, c.text);
      expect(mine.map((w) => w.text)).toEqual(c.contributions.map((w) => w.text));
      mine.forEach((w, i) => {
        expect(Math.abs(w.value - c.contributions[i].value)).toBeLessThan(1e-9);
        expect(c.text.slice(w.start, w.end).toLowerCase()).toBe(w.text);
      });
    }
  });
});

describe("predictor details", () => {
  const tiny: Model = parseModel({
    format: 1,
    terms: ["lamp", "lamp man", "man"],
    idf: [1, 3, 2],
    coef: [1, 0.5, -1],
    intercept: 0.25,
    platt: null,
    meta: {},
  });

  it("contributions add up to the logit minus the intercept", () => {
    const text = "Lamp man lamp";
    const sum = contributions(tiny, text).reduce((s, w) => s + w.value, 0);
    expect(sum).toBeCloseTo(logit(tiny, text) - tiny.intercept, 12);
  });

  it("text with no known words scores the intercept", () => {
    expect(probabilitySatire(tiny, "")).toBeCloseTo(1 / (1 + Math.exp(-0.25)), 12);
    expect(contributions(tiny, "zebra")).toEqual([
      { text: "zebra", start: 0, end: 5, value: 0 },
    ]);
  });

  it("applies Platt scaling when the model has it", () => {
    const scaled = parseModel({ ...JSON.parse(JSON.stringify(rawTiny())), platt: [2, -1] });
    const z = logit(scaled, "lamp");
    expect(probabilitySatire(scaled, "lamp")).toBeCloseTo(1 / (1 + Math.exp(-(2 * z - 1))), 12);
  });

  it("single letters are not tokens, matching scikit-learn", () => {
    expect(contributions(tiny, "a b lamp").map((w) => w.text)).toEqual(["lamp"]);
  });
});

function rawTiny() {
  return {
    format: 1,
    terms: ["lamp", "man"],
    idf: [1, 1],
    coef: [1, -1],
    intercept: 0,
    platt: null,
    meta: {},
  };
}

describe("parseModel refuses malformed files", () => {
  const bad: [string, unknown, RegExp][] = [
    ["not an object", [], /object/],
    ["extra key", { ...rawTiny(), extra: 1 }, /unexpected keys/],
    ["wrong format", { ...rawTiny(), format: 2 }, /format/],
    ["empty terms", { ...rawTiny(), terms: [], idf: [], coef: [] }, /at least one/],
    ["empty term", { ...rawTiny(), terms: ["", "man"] }, /non-empty/],
    ["duplicate terms", { ...rawTiny(), terms: ["man", "man"] }, /duplicate/],
    ["length mismatch", { ...rawTiny(), idf: [1] }, /same length/],
    ["non-finite", { ...rawTiny(), coef: [1, null] }, /finite/],
    ["zero idf", { ...rawTiny(), idf: [0, 1] }, /positive/],
    ["bad platt", { ...rawTiny(), platt: [1] }, /platt/],
    ["bad meta", { ...rawTiny(), meta: [] }, /meta/],
    ["non-finite intercept", { ...rawTiny(), intercept: Infinity }, /intercept/],
  ];
  for (const [name, payload, message] of bad) {
    it(name, () => expect(() => parseModel(payload)).toThrow(message));
  }

  it("refuses more features than the limit", () => {
    expect(() => parseModel(rawTiny(), 1)).toThrow(ModelError);
  });

  it("accepts a valid file (positive twin)", () => {
    expect(parseModel(rawTiny()).terms).toEqual(["lamp", "man"]);
  });
});
