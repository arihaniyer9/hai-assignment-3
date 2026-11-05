/**
 * lib/emotions.ts
 *
 * The single source of truth for the label set used by the task: the six
 * emotions of the Emotion dataset plus an "unsure" escape hatch. The UI, the
 * validation schemas and the database CHECK constraints all derive from here.
 *
 * Options are listed alphabetically (a neutral, fixed order) so no emotion is
 * visually favoured and the layout is consistent across tweets.
 */

/** The six emotion categories of the dair-ai/emotion dataset. */
export const EMOTION_KEYS = ["anger", "fear", "joy", "love", "sadness", "surprise"] as const;

/** One of the six dataset emotions. */
export type Emotion = (typeof EMOTION_KEYS)[number];

/** Every value a participant may submit: an emotion or "unsure". */
export const LABEL_KEYS = [...EMOTION_KEYS, "unsure"] as const;

/** A label a participant can pick for a tweet. */
export type LabelKey = (typeof LABEL_KEYS)[number];

/** Display information for one label option. */
export interface EmotionInfo {
  key: LabelKey;
  /** Human-readable name shown on the option card. */
  label: string;
  /** One-sentence definition shown in the guide and on the card. */
  definition: string;
  /** A made-up example (deliberately NOT taken from the dataset). */
  example: string;
  /** Keyboard shortcut: "1"-"6" for emotions, "0" for unsure. */
  shortcut: string;
}

/** All label options in display order. */
export const EMOTIONS: readonly EmotionInfo[] = [
  {
    key: "anger",
    label: "Anger",
    definition: "Feeling annoyed, irritated, furious or hostile toward something or someone.",
    example: "I can't believe they ignored my request again.",
    shortcut: "1",
  },
  {
    key: "fear",
    label: "Fear",
    definition: "Feeling afraid, anxious, worried or threatened.",
    example: "I keep checking the door because something feels wrong.",
    shortcut: "2",
  },
  {
    key: "joy",
    label: "Joy",
    definition: "Feeling happy, pleased, content or excited.",
    example: "I finally got the job and I can't stop smiling.",
    shortcut: "3",
  },
  {
    key: "love",
    label: "Love",
    definition: "Feeling affection, care, tenderness or attachment toward someone or something.",
    example: "I adore how gently she looks after her little brother.",
    shortcut: "4",
  },
  {
    key: "sadness",
    label: "Sadness",
    definition: "Feeling sorrow, grief, disappointment or loneliness.",
    example: "The house feels so empty since he moved away.",
    shortcut: "5",
  },
  {
    key: "surprise",
    label: "Surprise",
    definition: "Feeling astonished, startled or caught off guard by something unexpected.",
    example: "I opened the door and the whole family was standing there.",
    shortcut: "6",
  },
  {
    key: "unsure",
    label: "None of these / Unsure",
    definition:
      "The tweet is neutral, mixes several emotions, or you cannot tell from the text alone.",
    example: "It's Tuesday and I'm at my desk.",
    shortcut: "0",
  },
];

/**
 * Looks up the display information for a label.
 * @param key A label key such as "joy" or "unsure".
 * @returns The matching {@link EmotionInfo}, or undefined for unknown keys.
 */
export function getEmotionInfo(key: string): EmotionInfo | undefined {
  return EMOTIONS.find((e) => e.key === key);
}

/**
 * Gets the display name of a label, falling back to the raw key.
 * @param key A label key such as "joy" or "unsure".
 * @returns The human-readable name.
 */
export function labelName(key: string): string {
  return getEmotionInfo(key)?.label ?? key;
}
