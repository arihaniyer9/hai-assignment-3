/**
 * lib/types.ts
 *
 * Plain data types shared by the storage layer, the service layer, the API
 * routes and the React components. Nothing here has runtime behaviour.
 *
 * Privacy note: types used by the labeling phase (TweetPublic, ParticipantState)
 * deliberately have NO ground-truth field, so the compiler helps us keep the
 * answer key away from participants until they have submitted.
 */
import type { Emotion, LabelKey } from "./emotions";

/** A tweet as stored in the pool, including the answer key (server only). */
export interface TweetSeed {
  id: string;
  text: string;
  groundTruth: Emotion;
}

/** A tweet as shown to a participant while labeling (no ground truth). */
export interface TweetPublic {
  id: string;
  text: string;
  /** 1-based position in this participant's personal sequence. */
  position: number;
}

/** What a participant submits for one tweet. */
export interface LabelInput {
  label: LabelKey;
  /** Self-reported confidence, 1 (not at all sure) to 5 (very sure). */
  confidence: number;
  rationale: string | null;
  /** Visible-tab milliseconds spent on this tweet. */
  timeSpentMs: number;
}

/** A stored label for one tweet. */
export interface LabelRecord extends LabelInput {
  tweetId: string;
  submittedAt: string;
}

/** Everything the client needs to resume a participant's session. */
export interface ParticipantState {
  participantId: string;
  nickname: string | null;
  completed: boolean;
  tweets: TweetPublic[];
  labels: LabelRecord[];
}

/** One row of the post-submission debrief (ground truth is revealed here). */
export interface DebriefItem {
  position: number;
  tweetId: string;
  text: string;
  yourLabel: LabelKey;
  confidence: number;
  groundTruth: Emotion;
}

/** One joined row for the admin table and CSV export. */
export interface AdminRow {
  participantId: string;
  nickname: string | null;
  participantCompleted: boolean;
  position: number;
  tweetId: string;
  tweetText: string;
  label: LabelKey;
  groundTruth: Emotion;
  /** True when the participant's label equals the dataset label. */
  matchesGroundTruth: boolean;
  confidence: number;
  rationale: string | null;
  timeSpentMs: number;
  submittedAt: string;
}

/** Participant totals for the admin summary. */
export interface ParticipantCounts {
  started: number;
  completed: number;
}

/** Aggregated numbers shown on the admin dashboard. */
export interface AdminStats {
  participantsStarted: number;
  participantsCompleted: number;
  labelsCollected: number;
  /** Share (0-1) of labels equal to the dataset label; null when no labels. */
  matchRate: number | null;
  /** How often each label (incl. "unsure") was chosen. */
  labelCounts: Record<LabelKey, number>;
}
