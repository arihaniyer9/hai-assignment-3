/**
 * lib/model.ts — the Assignment 2 satire model, ported from Python (src/satire/model.py in A2).
 *
 * TF-IDF on words and word pairs + logistic regression + Platt scaling, read from a validated JSON
 * file. tests/model.test.ts checks every study headline against the Python predictor's output.
 *
 * Tokens match scikit-learn's default pattern `(?u)\b\w\w+\b`: Python's Unicode `\w` is letters,
 * numbers and underscore, which is `[\p{L}\p{N}_]` here (JavaScript's plain `\w` is ASCII only).
 */

const TOKEN = /[\p{L}\p{N}_]{2,}/gu;
const FORMAT = 1;
const KEYS = ["coef", "format", "idf", "intercept", "meta", "platt", "terms"];
export const MAX_FEATURES = 50_000;

export class ModelError extends Error {}

export interface Model {
  terms: string[];
  idf: number[];
  coef: number[];
  intercept: number;
  platt: [number, number] | null;
  meta: Record<string, unknown>;
  index: Map<string, number>;
}

export interface WordContribution {
  text: string; // lower-cased token
  start: number; // UTF-16 offsets into the original text, for slicing in JavaScript
  end: number;
  value: number; // log-odds push toward Satire (positive) or Real (negative)
}

function finite(value: unknown, what: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ModelError(`${what} must be a finite number`);
  }
  return value;
}

function numbers(value: unknown, what: string): number[] {
  if (!Array.isArray(value)) throw new ModelError(`${what} must be a list of finite numbers`);
  return value.map((v) => finite(v, `${what} entry`));
}

/** Parse and validate a model file. Mirrors from_json in the Python package. */
export function parseModel(payload: unknown, maxFeatures = MAX_FEATURES): Model {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new ModelError("model JSON must be an object");
  }
  const p = payload as Record<string, unknown>;
  if (Object.keys(p).sort().join() !== KEYS.join()) {
    throw new ModelError(`unexpected keys: expected exactly ${KEYS.join(", ")}`);
  }
  if (p.format !== FORMAT) throw new ModelError(`unsupported format ${String(p.format)}`);

  const terms = p.terms;
  if (!Array.isArray(terms) || terms.length === 0) {
    throw new ModelError("terms must be a list with at least one term");
  }
  if (terms.length > maxFeatures) {
    throw new ModelError(`too many features: ${terms.length} (limit ${maxFeatures})`);
  }
  if (!terms.every((t) => typeof t === "string" && t.length > 0)) {
    throw new ModelError("every term must be a non-empty string");
  }
  const index = new Map<string, number>(terms.map((t: string, i) => [t, i]));
  if (index.size !== terms.length) throw new ModelError("duplicate terms");

  const idf = numbers(p.idf, "idf");
  const coef = numbers(p.coef, "coef");
  if (idf.length !== terms.length || coef.length !== terms.length) {
    throw new ModelError("terms, idf and coef must have the same length");
  }
  if (idf.some((v) => v <= 0)) throw new ModelError("every idf value must be positive");

  let platt: [number, number] | null = null;
  if (p.platt !== null) {
    if (!Array.isArray(p.platt) || p.platt.length !== 2) {
      throw new ModelError("platt must be null or a pair [a, b]");
    }
    platt = [finite(p.platt[0], "platt"), finite(p.platt[1], "platt")];
  }
  if (typeof p.meta !== "object" || p.meta === null || Array.isArray(p.meta)) {
    throw new ModelError("meta must be an object");
  }
  return {
    terms: terms as string[],
    idf,
    coef,
    intercept: finite(p.intercept, "intercept"),
    platt,
    meta: p.meta as Record<string, unknown>,
    index,
  };
}

interface Token {
  word: string;
  start: number;
  end: number;
}

function tokens(text: string): Token[] {
  return [...text.matchAll(TOKEN)].map((m) => ({
    word: m[0].toLowerCase(),
    start: m.index,
    end: m.index + m[0].length,
  }));
}

function ngrams(words: string[]): string[] {
  const pairs = words.slice(1).map((w, i) => `${words[i]} ${w}`);
  return [...words, ...pairs];
}

/** L2-normalised sublinear tf-idf value of every known term in grams. */
function featureValues(model: Model, grams: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const g of grams) if (model.index.has(g)) counts.set(g, (counts.get(g) ?? 0) + 1);
  const raw = new Map<string, number>();
  for (const [t, n] of counts) raw.set(t, (1 + Math.log(n)) * model.idf[model.index.get(t)!]);
  let squares = 0;
  for (const v of raw.values()) squares += v * v;
  const norm = Math.sqrt(squares);
  const values = new Map<string, number>();
  for (const [t, v] of raw) values.set(t, v / norm);
  return values;
}

export function logit(model: Model, text: string): number {
  const values = featureValues(model, ngrams(tokens(text).map((t) => t.word)));
  let z = model.intercept;
  for (const [t, v] of values) z += model.coef[model.index.get(t)!] * v;
  return z;
}

function sigmoid(z: number): number {
  if (z >= 0) return 1 / (1 + Math.exp(-z));
  const e = Math.exp(z);
  return e / (1 + e);
}

export function probabilitySatire(model: Model, text: string): number {
  let z = logit(model, text);
  if (model.platt) z = model.platt[0] * z + model.platt[1];
  return sigmoid(z);
}

/**
 * Per-word log-odds contributions, in text order: a term's coefficient times its feature value,
 * shared across a word's repeats, with a word pair's share split evenly between its two words.
 */
export function contributions(model: Model, text: string): WordContribution[] {
  const spans = tokens(text);
  const words = spans.map((s) => s.word);
  const values = featureValues(model, ngrams(words));

  const places = new Map<string, number[][]>();
  const add = (term: string, at: number[]) => {
    const list = places.get(term);
    if (list) list.push(at);
    else places.set(term, [at]);
  };
  words.forEach((w, i) => add(w, [i]));
  for (let i = 0; i < words.length - 1; i++) add(`${words[i]} ${words[i + 1]}`, [i, i + 1]);

  const pushed = new Array<number>(words.length).fill(0);
  for (const [term, value] of values) {
    const occurrences = places.get(term)!;
    const share = (model.coef[model.index.get(term)!] * value) / occurrences.length;
    for (const occurrence of occurrences) {
      for (const position of occurrence) pushed[position] += share / occurrence.length;
    }
  }
  return spans.map((s, i) => ({ text: s.word, start: s.start, end: s.end, value: pushed[i] }));
}
