/**
 * tests/service.test.ts — the study rules, against a throwaway in-memory SQLite database through
 * the same Storage interface Supabase implements.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { aiFor } from "../lib/ai";
import { CATCH_ITEM_ID, ITEM_TYPES, STUDY_TRIALS, TRIALS_PER_TYPE, type Condition } from "../lib/constants";
import { CHECK_ANSWER } from "../lib/instructions";
import { loadItemSeeds } from "../lib/items";
import {
  answerCheck,
  completeSession,
  getSessionState,
  getSummary,
  saveFinal,
  saveInitial,
  showAi,
  startSession,
} from "../lib/service";
import { createSqliteStorage } from "../lib/storage/sqlite";
import type { Storage } from "../lib/storage/types";
import type { SessionState } from "../lib/types";
import { failure } from "./helpers";

let store: Storage;
const items = loadItemSeeds();
const labelOf = new Map(items.map((i) => [i.id, i.label]));
const typeOf = new Map(items.map((i) => [i.id, i.type]));

beforeEach(async () => {
  store = createSqliteStorage(":memory:");
  await store.seedItems(items);
});

const ans = (itemId: string, answer: "Satire" | "Real" = "Satire", confidence = 3) => ({
  itemId,
  answer,
  confidence,
  timeMs: 1000,
});

async function started(condition: Condition, code = "blue-otter-7"): Promise<SessionState> {
  const s = await startSession({ condition, code }, store);
  return (await answerCheck(s.sessionId, CHECK_ANSWER, store)).state;
}

/** Answers every trial: `right` decides whether each scored answer matches the truth. */
async function answerAll(s: SessionState, right: (i: number) => boolean = () => true) {
  for (const [i, t] of s.trials.entries()) {
    const truth = labelOf.get(t.itemId)!;
    const other = truth === "Satire" ? "Real" : "Satire";
    const pick = right(i) ? truth : other;
    if (s.condition === "assisted" && !t.isCatch) {
      await saveInitial(s.sessionId, ans(t.itemId, other), store);
      await showAi(s.sessionId, t.itemId, store);
      await saveFinal(s.sessionId, ans(t.itemId, pick), store);
    } else {
      await saveInitial(s.sessionId, ans(t.itemId, pick), store);
    }
  }
}

describe("starting and resuming", () => {
  it("a new session waits for the instruction check and has no trials yet", async () => {
    const s = await startSession({ condition: "baseline", code: "blue-otter-7" }, store);
    expect(s.status).toBe("check");
    expect(s.trials).toEqual([]);
    expect(s.sessionId).toMatch(/^S-/);
  });

  it("the same code and condition resumes the same session", async () => {
    const a = await startSession({ condition: "baseline", code: "blue-otter-7" }, store);
    const b = await startSession({ condition: "baseline", code: "blue-otter-7" }, store);
    expect(b.sessionId).toBe(a.sessionId);
  });

  it("the other condition, or another code, gets a new session (positive twins)", async () => {
    const a = await startSession({ condition: "baseline", code: "blue-otter-7" }, store);
    const b = await startSession({ condition: "assisted", code: "blue-otter-7" }, store);
    const c = await startSession({ condition: "baseline", code: "red-fox-2" }, store);
    expect(new Set([a.sessionId, b.sessionId, c.sessionId]).size).toBe(3);
  });

  it("a code that finished a condition cannot take it again", async () => {
    const s = await started("baseline");
    await answerAll(s);
    await completeSession(s.sessionId, null, store);
    const err = await failure(() => startSession({ condition: "baseline", code: "blue-otter-7" }, store));
    expect(err.code).toBe("conflict");
  });

  it("unknown sessions are not found", async () => {
    expect((await failure(() => getSessionState("S-AAAAAA", store))).code).toBe("not_found");
  });

  it("the database refuses a second open session for a code, even if the service is bypassed", async () => {
    await store.createSession({ id: "S-AAAAAA", code: "x-y-z", condition: "baseline", consentedAt: "t" });
    const again = await store.createSession({ id: "S-BBBBBB", code: "x-y-z", condition: "baseline", consentedAt: "t" });
    expect(again).toBe("code_taken");
    const sameId = await store.createSession({ id: "S-AAAAAA", code: "other", condition: "baseline", consentedAt: "t" });
    expect(sameId).toBe("id_taken");
  });
});

describe("instruction check", () => {
  it("a right answer draws 20 study trials, 5 per type, plus the attention check", async () => {
    const s = await started("baseline");
    expect(s.status).toBe("trials");
    expect(s.trials).toHaveLength(STUDY_TRIALS + 1);
    for (const type of ITEM_TYPES) {
      expect(s.trials.filter((t) => typeOf.get(t.itemId) === type)).toHaveLength(TRIALS_PER_TYPE);
    }
    expect(s.trials.filter((t) => t.isCatch).map((t) => t.itemId)).toEqual([CATCH_ITEM_ID]);
  });

  it("one wrong answer allows a retry; a second ends the session", async () => {
    const s = await startSession({ condition: "baseline", code: "blue-otter-7" }, store);
    const first = await answerCheck(s.sessionId, "funny", store);
    expect(first.correct).toBe(false);
    expect(first.state.status).toBe("check");
    expect(first.state.checkFailures).toBe(1);
    const second = await answerCheck(s.sessionId, "ai", store);
    expect(second.state.status).toBe("terminated");
    expect(second.state.trials).toEqual([]);
  });

  it("after being stopped the person can start over with the same code", async () => {
    const s = await startSession({ condition: "baseline", code: "blue-otter-7" }, store);
    await answerCheck(s.sessionId, "funny", store);
    await answerCheck(s.sessionId, "funny", store);
    const again = await startSession({ condition: "baseline", code: "blue-otter-7" }, store);
    expect(again.sessionId).not.toBe(s.sessionId);
    expect(again.status).toBe("check");
    expect((await answerCheck(again.sessionId, CHECK_ANSWER, store)).correct).toBe(true);
  });

  it("the check cannot be taken again once passed", async () => {
    const s = await started("baseline");
    expect((await failure(() => answerCheck(s.sessionId, CHECK_ANSWER, store))).code).toBe("conflict");
  });

  it("a code's second condition never repeats a headline from its first", async () => {
    for (let i = 0; i < 10; i++) {
      const code = `person-${i}`;
      const a = await started("baseline", code);
      const b = await started("assisted", code);
      const study = (s: SessionState) => s.trials.filter((t) => !t.isCatch).map((t) => t.itemId);
      expect(study(b).filter((id) => study(a).includes(id))).toEqual([]);
    }
  });
});

describe("baseline trials", () => {
  it("are answered in order, once each", async () => {
    const s = await started("baseline");
    const [t1, t2] = s.trials;
    expect((await failure(() => saveInitial(s.sessionId, ans(t2.itemId), store))).code).toBe("invalid");
    await saveInitial(s.sessionId, ans(t1.itemId, "Real", 4), store);
    await saveInitial(s.sessionId, ans(t1.itemId, "Real", 4), store); // a retry is fine
    const changed = await failure(() => saveInitial(s.sessionId, ans(t1.itemId, "Satire", 4), store));
    expect(changed.code).toBe("conflict");
    await saveInitial(s.sessionId, ans(t2.itemId), store); // now in order
    const state = await getSessionState(s.sessionId, store);
    expect(state.trials[0]).toMatchObject({ initialAnswer: "Real", initialConfidence: 4 });
  });

  it("refuse items outside the session", async () => {
    const s = await started("baseline");
    const foreign = items.find((i) => !s.trials.some((t) => t.itemId === i.id))!;
    expect((await failure(() => saveInitial(s.sessionId, ans(foreign.id), store))).code).toBe("forbidden");
  });

  it("have no AI and no second answer", async () => {
    const s = await started("baseline");
    const t = s.trials[0];
    await saveInitial(s.sessionId, ans(t.itemId), store);
    expect((await failure(() => showAi(s.sessionId, t.itemId, store))).code).toBe("forbidden");
    expect((await failure(() => saveFinal(s.sessionId, ans(t.itemId), store))).code).toBe("forbidden");
  });

  it("refuse answers before the check is passed", async () => {
    const s = await startSession({ condition: "baseline", code: "blue-otter-7" }, store);
    expect((await failure(() => saveInitial(s.sessionId, ans("h1"), store))).code).toBe("conflict");
  });
});

describe("assisted trials", () => {
  it("show the AI only after the participant's own answer", async () => {
    const s = await started("assisted");
    const t = s.trials[0]; // position 1 is never the attention check (CATCH_EARLIEST > 1)
    expect(t.isCatch).toBe(false);
    expect((await failure(() => showAi(s.sessionId, t.itemId, store))).code).toBe("invalid");
    await saveInitial(s.sessionId, ans(t.itemId), store);
    const ai = await showAi(s.sessionId, t.itemId, store);
    expect(ai).toEqual(aiFor(t.headline));
  });

  it("log the AI output once and return the logged output on reload", async () => {
    const s = await started("assisted");
    const t = s.trials[0];
    await saveInitial(s.sessionId, ans(t.itemId), store);
    const first = await showAi(s.sessionId, t.itemId, store);
    const shownAt = (await store.listTrials(s.sessionId))[0].aiShownAt;
    const second = await showAi(s.sessionId, t.itemId, store);
    expect(second).toEqual(first);
    expect((await store.listTrials(s.sessionId))[0].aiShownAt).toBe(shownAt);
    expect((await getSessionState(s.sessionId, store)).trials[0].ai).toEqual(first);
  });

  it("lock the participant's own answer once the AI has been shown", async () => {
    const s = await started("assisted");
    const t = s.trials[0];
    await saveInitial(s.sessionId, ans(t.itemId, "Real"), store);
    await showAi(s.sessionId, t.itemId, store);
    expect((await failure(() => saveInitial(s.sessionId, ans(t.itemId, "Satire"), store))).code).toBe("conflict");
  });

  it("need the AI to have been shown before the final answer, and the final answer before moving on", async () => {
    const s = await started("assisted");
    const [t1, t2] = s.trials;
    await saveInitial(s.sessionId, ans(t1.itemId, "Real"), store);
    expect((await failure(() => saveFinal(s.sessionId, ans(t1.itemId), store))).code).toBe("invalid");
    expect((await failure(() => saveInitial(s.sessionId, ans(t2.itemId), store))).code).toBe("invalid");
    await showAi(s.sessionId, t1.itemId, store);
    await saveFinal(s.sessionId, ans(t1.itemId, "Satire", 5), store);
    const changed = await failure(() => saveFinal(s.sessionId, ans(t1.itemId, "Real", 5), store));
    expect(changed.code).toBe("conflict");
    await saveInitial(s.sessionId, ans(t2.itemId), store);
    expect((await getSessionState(s.sessionId, store)).trials[0]).toMatchObject({
      initialAnswer: "Real",
      finalAnswer: "Satire",
      finalConfidence: 5,
    });
  });

  it("the attention check has no AI and needs one answer", async () => {
    const s = await started("assisted");
    const catchTrial = s.trials.find((t) => t.isCatch)!;
    for (const t of s.trials) {
      if (t === catchTrial) break;
      await saveInitial(s.sessionId, ans(t.itemId), store);
      await showAi(s.sessionId, t.itemId, store);
      await saveFinal(s.sessionId, ans(t.itemId), store);
    }
    await saveInitial(s.sessionId, ans(catchTrial.itemId, "Real"), store);
    expect((await failure(() => showAi(s.sessionId, catchTrial.itemId, store))).code).toBe("forbidden");
    const next = s.trials[catchTrial.position]; // the trial after the catch
    await saveInitial(s.sessionId, ans(next.itemId), store); // allowed: the catch is done
  });
});

describe("completion", () => {
  it("needs every trial answered", async () => {
    const s = await started("baseline");
    await saveInitial(s.sessionId, ans(s.trials[0].itemId), store);
    expect((await failure(() => completeSession(s.sessionId, null, store))).code).toBe("invalid");
  });

  it("scores the answer that counts, excluding the attention check, and stores the comment", async () => {
    for (const condition of ["baseline", "assisted"] as const) {
      const s = await started(condition, `scorer-${condition}`);
      await answerAll(s, (i) => i % 2 === 0);
      const scoredRight = s.trials.filter((t, i) => !t.isCatch && i % 2 === 0).length;
      const summary = await completeSession(s.sessionId, "fun", store);
      expect(summary).toEqual({ condition, code: `scorer-${condition}`, correct: scoredRight, total: STUDY_TRIALS });
      expect((await store.getSession(s.sessionId))!.comment).toBe("fun");
      expect(await getSummary(s.sessionId, store)).toEqual(summary);
      expect(await completeSession(s.sessionId, "again", store)).toEqual(summary); // idempotent
      expect((await store.getSession(s.sessionId))!.comment).toBe("fun");
    }
  });

  it("in the assisted condition the final answer counts, not the first one", async () => {
    const s = await started("assisted");
    await answerAll(s); // first answers all wrong, final answers all right
    expect((await completeSession(s.sessionId, null, store)).correct).toBe(STUDY_TRIALS);
  });

  it("no answers after completion, and no score before it", async () => {
    const s = await started("baseline");
    expect((await failure(() => getSummary(s.sessionId, store))).code).toBe("forbidden");
    await answerAll(s);
    await completeSession(s.sessionId, null, store);
    expect((await failure(() => saveInitial(s.sessionId, ans(s.trials[0].itemId), store))).code).toBe("conflict");
  });

  it("a terminated or unchecked session cannot be completed", async () => {
    const s = await startSession({ condition: "baseline", code: "blue-otter-7" }, store);
    expect((await failure(() => completeSession(s.sessionId, null, store))).code).toBe("conflict");
    await answerCheck(s.sessionId, "funny", store);
    await answerCheck(s.sessionId, "funny", store);
    expect((await failure(() => completeSession(s.sessionId, null, store))).code).toBe("conflict");
  });
});

describe("privacy", () => {
  it("the participant's view of a session never carries the answer key", async () => {
    const s = await started("assisted");
    await saveInitial(s.sessionId, ans(s.trials[0].itemId), store);
    await showAi(s.sessionId, s.trials[0].itemId, store);
    const state = await getSessionState(s.sessionId, store);
    for (const t of state.trials) {
      expect(Object.keys(t)).not.toContain("label");
      expect(Object.keys(t)).not.toContain("type");
    }
    expect(JSON.stringify(state)).not.toMatch(/"(type|topic|source)"/);
  });
});
