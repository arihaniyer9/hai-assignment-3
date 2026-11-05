# Build Prompt

> Save this section verbatim as `BUILD_PROMPT.md` and follow it. It is the source of truth for the build.

You are an expert full-stack engineer and an HCI / Human-AI Interaction specialist. Build
the web application below in `/Users/arihaniyer/Desktop/HAI-assignment-1`. Do not invent
requirements. Every requirement here has been confirmed by the user. Where something is
ambiguous, pick the simplest option and note it in the README, never silently.

## 1. Goal

A participant-facing web app where each participant labels **5 randomly selected tweets**
from the HuggingFace Emotion dataset with one of six emotions, and the app **records who
labeled which tweet with which label**. Single Next.js deployment (frontend + API routes),
deployable to Vercel with Supabase Postgres. Works on desktop and mobile.

## 2. Stack

- Next.js (latest stable, App Router), React, TypeScript (`strict`).
- Plain CSS with CSS-variable design tokens (`app/globals.css`). No UI framework.
- `zod` for validation. `@supabase/supabase-js` for production storage (server side only, service-role key).
- Dev/test storage: `node:sqlite` (file `./.data/dev.sqlite`).
- Tests: Vitest (unit), Playwright (e2e).
- Every route handler: `export const runtime = "nodejs"; export const dynamic = "force-dynamic";`.

## 3. Dataset

- `scripts/build-dataset.mjs`: fetch the `train` split of `dair-ai/emotion` (config `split`) via
  `https://datasets-server.huggingface.co/rows?dataset=dair-ai/emotion&config=split&split=train&offset=N&length=100`
  (160 pages; retry with backoff on HTTP 429/5xx).
- Label map: `0 sadness, 1 joy, 2 love, 3 anger, 4 fear, 5 surprise`.
- Keep rows with **8–40 words**, dedupe by text, use a **seeded PRNG (mulberry32, seed 42)** to pick **10 per emotion → 60 tweets**.
- Output `data/tweets.json`: `[{ "id": "t001", "text": "...", "groundTruth": "joy" }, ...]` (text unaltered).
- Print the per-emotion counts. The script must be re-runnable and deterministic.

## 4. Data model (identical logical schema in SQLite and Postgres)

- `tweets(id text pk, text text not null, ground_truth text not null)`
- `participants(id text pk, nickname text null, consented_at timestamptz not null, created_at timestamptz not null, completed_at timestamptz null)`
- `assignments(participant_id text fk, tweet_id text fk, position int (1..5), primary key(participant_id, tweet_id), unique(participant_id, position))`
- `labels(participant_id text fk, tweet_id text fk, label text not null check in (anger,fear,joy,love,sadness,surprise,unsure), confidence int not null check 1..5, rationale text null, time_spent_ms int not null, submitted_at timestamptz not null, primary key(participant_id, tweet_id))`
- `supabase/schema.sql` creates these tables, enables RLS on all with **no policies** (only the server's service-role key accesses them), and adds helpful indexes.
- `scripts/seed.mjs` upserts `data/tweets.json` into the active storage (`npm run seed`). Also run automatically for SQLite on first dev start.

## 5. Storage adapter (`lib/storage/`)

One `Storage` interface (`types.ts`) with: `seedTweets`, `listTweets`, `createParticipant`, `createAssignments`, `getParticipantState`, `upsertLabel`, `completeParticipant`, `getParticipantResults`, `listAllLabelRows` (joined view for admin/CSV), `getAdminStats`.
- `sqlite.ts` and `supabase.ts` implement it. `index.ts` picks Supabase when `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set; otherwise SQLite **only when `NODE_ENV !== "production"`**; in production without Supabase config, throw a clear error.
- A shared contract test runs the same assertions against SQLite (Supabase contract test is skipped unless env vars are present).

## 6. Core logic (`lib/`)

- `emotions.ts`: the six emotions plus `unsure`, each with `label`, `definition` (1 sentence), `example` (a made-up example, **not** from the dataset), `shortcut` key (1–6, 0 for unsure).
- `sampling.ts`: `sampleTweets(pool, n=5)`, a Fisher–Yates shuffle using `crypto.randomInt`; returns n unique tweets in random order. Unit-test uniqueness, size, and rough uniformity.
- `ids.ts`: `generateParticipantId()` → `P-` + 6 chars from an unambiguous alphabet (no 0/O/1/I/L); retry on collision.
- `validation.ts`: zod schemas for create-participant, label submit, admin login.
- `admin-auth.ts`: sign/verify an HMAC-SHA256 token (`ADMIN_SESSION_SECRET`), 8h expiry, constant-time password compare (`ADMIN_PASSWORD`).
- `csv.ts`: RFC-4180 escaping and **CSV-injection protection** (prefix cells starting with `= + - @` with `'`).
- **JSDoc on every function** (purpose, params, returns), plus a header comment on every file explaining its role.

## 7. API (all JSON, all validated, generic error messages, correct status codes)

- `POST /api/participants` `{ nickname?, consent: true }` → creates the participant, draws 5 tweets, stores assignments → `{ participantId, tweets: [{id,text,position}] }`.
- `GET /api/participants/[id]` → `{ participantId, tweets (no groundTruth), labels (existing), completed }` (used for resume).
- `PUT /api/participants/[id]/labels` `{ tweetId, label, confidence, rationale?, timeSpentMs }` → upsert. The tweet must be one of the participant's assignments (403/400 otherwise); rejected if already completed.
- `POST /api/participants/[id]/complete` → requires all 5 labels; sets `completed_at`; returns debrief `{ items: [{ text, yourLabel, confidence, groundTruth }] }`.
- `GET /api/participants/[id]/results` → the same debrief; only when completed.
- `POST /api/admin/login`, `POST /api/admin/logout` (HttpOnly, Secure in prod, SameSite=Lax cookie).
- `GET /api/admin/data` (JSON) and `GET /api/admin/data?format=csv` (download) → admin only (401 otherwise).
- **`groundTruth` must never appear in any response before completion.**

## 8. Pages and UX requirements

Routes: `/` (instructions + consent), `/task` (labeling), `/done` (debrief), `/reflection`, `/admin`, plus a friendly `not-found` and `error` page.

**`/` Instructions + consent**
- Plain-language explanation: what the study is, what to do (label 5 tweets), ~3 minutes, what is recorded (anonymous ID, optional nickname, labels, confidence, rationale, timing), voluntary and can stop any time, no right/wrong answers ("label what emotion the writer is expressing").
- Content notice: tweets are unfiltered public text and may be offensive.
- Emotion guide (six definitions) visible here.
- Optional nickname field; required consent checkbox; primary "Start" button (disabled until consent is checked). If a session exists in this browser: show "Continue where you left off" or the completed state, plus a "Start new participant (testing)" link.

**`/task` Labeling (one tweet per screen)**
- Header: "Tweet 2 of 5" + progress bar (`role="progressbar"` with aria values), Emotion-guide help button (modal/drawer), saving indicator ("Saving… / Saved" via `aria-live="polite"`).
- Tweet card: large readable text, verbatim.
- Seven option cards in a `radiogroup` (6 emotions + "None of these / Unsure"); each shows the name; the definition + example expand on tap (mobile) or are shown on hover/focus (desktop); keyboard shortcuts 1–6 and 0; minimum 44×44px touch targets; selection shown with a border, check icon and text, not by color alone.
- Confidence: 1–5 segmented control ("Not at all sure" … "Very sure"), required.
- Rationale: optional textarea, a 500-char counter.
- Back / Next; Next disabled until label + confidence are set (with an inline explanation of why it is disabled); the last step's button is "Submit"; submit shows a confirm sentence, not a modal maze. Labels are saved on each Next/Back (retry with an inline error and a "Try again" button on failure; never lose input). Track `time_spent_ms` per tweet (visible-tab time).
- Focus moves to the tweet heading on each step change. Page does not scroll-jump. On mobile, the Back/Next bar is sticky at the bottom with safe-area padding.
- Guard: if the participant is already completed → redirect to `/done`.

**`/done` Debrief**
- Thank-you + the participant ID (copyable).
- Table/cards: each tweet, the participant's label + confidence vs the dataset's ground-truth label (neutral tone; **no "wrong"/"correct" language**, use "matches"/"differs").
- Short explanation: the dataset label is one annotation method's outcome, not an objective truth; emotion inference from text is subjective and context-dependent; why AI emotion classification is a questionable use (link to `/reflection`).
- "Start new participant (testing)" button that clears the browser session.

**`/reflection`** Reflection page skeleton rendered from `content/reflection.md` (headings + guiding prompts and a "Full essay to be added" note). **No citations to papers I haven't been given.** `docs/essay-draft.md` holds the essay template (thesis, 3 argument sections, counterpoint, conclusion, references placeholders).

**`/admin`**
- Login form (password). After login: stat cards (participants started/completed, labels collected, % matching ground truth, per-emotion counts), a filter by participant, and a responsive table (participant ID, nickname, position, tweet text, label, ground truth, match, confidence, rationale, time spent, submitted at); "Download CSV"; "Sign out". On mobile the table becomes stacked cards or scrolls horizontally inside a container (never the whole page).

**Global UX / accessibility**
- Mobile-first responsive layout (breakpoints ≈ 480 / 768 / 1024; content max-width ≈ 720px; option cards 1 col on phones, 2 on tablets, 3 on desktop); `100dvh`; `viewport-fit=cover`.
- Auto light/dark via `prefers-color-scheme`; all text ≥ WCAG AA contrast; `prefers-reduced-motion` respected.
- Semantic HTML (landmarks, one `h1` per page, labelled controls), visible focus ring, skip link, no color-only signals, error messages that say what to do next.
- Loading skeletons and empty/error states everywhere data is fetched. Persist the session id in `localStorage` (wrapped in try/catch); the server is the source of truth.
- Neutral, non-leading copy. No emoji, and no visual cue that favors any emotion.
- Nielsen heuristics are explicitly mapped in the README (visibility of status, user control, error prevention, recognition over recall, consistency, help).

## 9. Environment variables (document in `.env.example`)

`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (server only; never `NEXT_PUBLIC_`), `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`. If Supabase vars are absent in dev → SQLite.

## 10. Scripts (`package.json`)

`dev`, `build`, `start`, `seed`, `build-dataset`, `test` (Vitest), `test:e2e` (Playwright), `lint`.

## 11. Tests

- **Vitest**: sampling (size, uniqueness, membership, distribution smoke test), validation schemas, ID generation, CSV escaping/injection, admin token sign/verify/expiry, storage contract on SQLite (labels upsert, completion requires 5, no groundTruth leak in the participant state).
- **Playwright** (`e2e/`): with a fresh temp SQLite DB and a test admin password: (1) desktop: consent → label 5 tweets (varying labels/confidence, one rationale) → resume test (reload mid-way) → submit → debrief; (2) a second participant gets a different set (assert not identical across several runs or log the overlap); (3) mobile viewport (390×844) run; (4) admin login → assert the rows → **save `docs/screenshots/admin-data.png`**, plus `docs/screenshots/participant-*.png`; (5) assert `groundTruth` is absent from pre-completion responses.

## 12. Documentation

- **README.md** sections: overview; live demo URL placeholder; features mapped to the assignment requirements (checklist); tech stack and why; architecture diagram (ASCII) and request flow; data model; API reference; project structure with a one-line description of every file; setup and run (local); dataset provenance, citation (Saravia et al., 2018, "CARER: Contextualized Affect Representations for Emotion Recognition") and how to regenerate; deployment guide (Supabase project → run `supabase/schema.sql` → `npm run seed` against Supabase → Vercel import → env vars → redeploy → verify) and Render notes; testing; UX/HCI design rationale (Nielsen heuristics, accessibility, responsiveness); ethics and privacy; the screenshot deliverable; the bonus essay pointer; known limitations.
- Comments: file header + JSDoc on every function/component/hook; inline comments only for non-obvious logic.

## 13. Definition of done

All items in §8 work on desktop and 390px mobile; `npm run build`, `npm test`, `npm run test:e2e` pass; `docs/screenshots/admin-data.png` exists and shows the collected rows; no `groundTruth` leaks pre-completion; README complete; every function has a JSDoc comment; `.env*` and `.data/` are git-ignored. Do not commit or push unless the user asks. Report anything skipped or failing, plainly.

---

## Build-time amendments (added during the build; the sections above are unchanged)

- **Next.js 16.3**: `export const dynamic = "force-dynamic"` is no longer documented as a segment option, and route handlers are dynamic by default, so handlers only export `runtime = "nodejs"` (required for `node:crypto`/`node:sqlite`). `params` in route handlers is a `Promise`.
- `@types/node` was bumped to `^24` because Vitest 5 requires it (matches the Node 24 runtime).
- Scripts (`seed`, `build-dataset`) are run with `tsx` so they can import the TypeScript storage layer.
- The `Storage` interface has `getParticipantCounts()` instead of `getAdminStats()`; the statistics are computed by the pure function `computeAdminStats` in `lib/stats.ts`, and all business rules live in `lib/service.ts` (not in the storage adapters), so both back ends behave identically.
- `content/reflection.md` is rendered by a tiny dependency-free renderer (`lib/mini-markdown.tsx`); `lib/constants.ts` holds constants shared by server and client code.
- The Playwright suite runs against `next dev` (not `next start`) because the app deliberately refuses SQLite when `NODE_ENV=production`.
- The dataset script caches downloaded rows in `.data/hf-train-cache.json` and honours `Retry-After`, because the public HuggingFace API rate-limits bulk downloads.
