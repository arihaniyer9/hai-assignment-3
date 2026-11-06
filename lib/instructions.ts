/**
 * lib/instructions.ts
 *
 * The instruction check shown before the trials. It asks about the one rule that matters for
 * scoring, and is easy for anyone who read the instructions (Assignment 3 asks for checks that are
 * not unreasonably hard). Shared by server and client; the server decides which answer is right.
 */
export const CHECK_QUESTION = "In this study, what makes a headline Satire?";

export const CHECK_OPTIONS = [
  { id: "funny", text: "It is funny or hard to believe" },
  { id: "source", text: "It was published by a satire website, not a news outlet" },
  { id: "ai", text: "The AI says it is Satire" },
] as const;

export type CheckOptionId = (typeof CHECK_OPTIONS)[number]["id"];

/** The correct option. */
export const CHECK_ANSWER: CheckOptionId = "source";
