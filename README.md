# Satire or Real? A study of an AI-assisted judgement task

Code for Human-AI Interaction Assignment 3 (FA26). In Assignment 2 I designed a task: decide whether a news headline comes from a satire website or a real news outlet. I also built a 240-headline study set and trained a TF-IDF logistic-regression assistant. This app runs that task as a study with two conditions, one link each:

- **`/baseline`**: the participant judges each headline on their own.
- **`/assisted`**: the participant answers first, then sees the AI's live suggestion and gives a final answer.

> **Status: work in progress.** The interfaces, live AI, data storage and tests are built. Deployment, the pre-registration, data collection and the analysis come next.

## 1. Requirement map

| Assignment 3 requirement | Where it is met |
|---|---|
| Baseline interface without AI, clear instructions, data recorded correctly | `/baseline`; `components/study/`; every answer saved by the server (`lib/service.ts`) |
| Own backend, not a survey platform | Next.js API routes + Supabase Postgres (`app/api/`, `lib/storage/`) |
| N trials per participant, under 10 minutes, randomly drawn per participant | 20 study headlines + 1 attention check per condition, 5 of each type, drawn with `crypto.randomInt` (`lib/sampling.ts`) |
| At least one additional measurement, justified | Per-trial confidence (1 to 5) and time on screen, plus reliance measures from the answer-first design (section 3) |
| At least one attention check, not unreasonably strict | An instruction check before the trials (two tries) and an attention-check headline inside the trials (recorded, not terminating) |
| Interface with the AI assistance | `/assisted`: suggested label, calibrated confidence, "Confident" badge, word-level reasons (`components/AiPanel.tsx`) |
| Bonus: synchronous AI, outputs and interactions logged | The model runs on the server for every trial (`lib/ai.ts`, `POST /api/sessions/[id]/ai`); the exact output shown is stored with the trial, along with the answer before and after it |
| Bonus: own interface | Built from scratch on my Assignment 1 app |
| Data files with descriptions | Admin export `trials.csv` and `sessions.csv`; data dictionary in section 6 |
| Analysis code that replicates the results | *(to come: `analysis/`)* |

## 2. How a session works

1. **Instructions and consent.** The participant chooses a code, for example `otter-42`. They use the same code on both links, so their two sessions can be paired without storing their name.
2. **Instruction check.** "What makes a headline Satire?" A wrong answer explains the rule and allows one more try. A second wrong answer ends the attempt, and the participant may start over.
3. **21 headlines, one per screen.** That is 5 of each of the four A2 types (obvious satire, subtle satire, real but absurd, plain real), shuffled, with the attention check at a random position from 6 to 15. A code never sees the same headline in both conditions.
4. **Baseline:** Satire or Real, plus confidence 1 to 5.
   **Assisted:**
   1. The participant gives their own answer and confidence.
   2. The server computes the AI's output now, logs it and shows it.
   3. The participant gives a final answer (pre-filled with their own) and a new confidence.

   The first answer cannot be changed once the AI has been seen. The server enforces this, not just the page.
5. **Optional comment, then the score.** Only the total score is shown, so the participant learns no answers that could help in the other condition.

A refresh resumes at the same step, and an AI output that was already shown comes back exactly as logged.

## 3. Decisions

| Decision | Chosen | Rejected | Cost |
|---|---|---|---|
| Assistance workflow | Answer first, then the AI, then a final answer | AI shown with the headline; AI on request | Slower trials, but every assisted trial records whether the AI moved a person toward or away from the truth, which the A2 pilot suggested might be rare |
| AI delivery | Synchronous: the A2 model ported to TypeScript and run on the server per trial | Static outputs from A2 | A port to keep in sync; a parity test checks it matches Python to 1e-9 on all 240 headlines and 14 edge cases |
| What the AI shows | Label, calibrated "% sure", a "Confident" badge at the A2 threshold (0.70), and the words it relied on | Label only; numeric accuracy claims | Participants are not told the AI's measured accuracy, only that it "can be wrong", so the study measures reliance on the output itself |
| Trials | 20 per condition (5 per type) + 1 attention check | 12 or 30 | About 5 minutes per link, under the 10-minute limit for both together |
| Pairing | A self-chosen code, normalised to lower case | Names; no pairing | Two people could pick the same code; the second is refused for a part already finished |
| Final-answer pre-fill | The answer is pre-filled with the person's own answer; confidence must be given again | Nothing pre-filled | Keeping one's answer takes one click less than changing it, as it would in real use |
| Feedback | Only the total score at the end | Per-item answers | No learning between conditions |
| Attention checks | Instruction check (two tries) + one attention-check headline (recorded) | Terminating on a missed headline | The brief asks for tolerance; exclusion rules are pre-registered |
| Storage | Supabase Postgres in production, SQLite for local work and tests | Survey platform (-10 points) | Two back ends, kept honest by a shared contract test |

## 4. Run it locally

Requirements: Node 22.13+ (developed on Node 24).

```sh
npm install
npm run dev
```

Open http://localhost:3000/baseline and http://localhost:3000/assisted. Without Supabase settings the app uses a local SQLite file (`.data/dev.sqlite`) and loads the 241 items automatically. The researcher page is http://localhost:3000/admin (password `ADMIN_PASSWORD` from `.env.local`).

| Command | What it does |
|---|---|
| `npm run check` | Types, lint and unit tests |
| `npm test` | Unit tests (Vitest) |
| `npm run test:e2e` | Browser tests (Playwright); also regenerates `docs/screenshots/` |
| `npm run test:contract` | The storage contract test, also against Supabase when `.env.local` has its settings |
| `npm run seed` | Loads the items into the active database |

## 5. Deploy (Supabase + Vercel)

1. Create a new Supabase project. In the **SQL Editor**, run all of `supabase/schema.sql`.
2. Create `.env.local` from `.env.example` with the project URL, the `service_role` key, an admin password and a session secret (`openssl rand -hex 32`).
3. Load the items: `npm run seed`. Expect "Seeded 241 items into Supabase".
4. Check the real database: `npm run test:contract`. It must report the Supabase tests as passed. Then run `supabase/reset.sql` in the SQL Editor to remove the test rows.
5. Import the GitHub repo in Vercel and set the same four variables. Deploy.
6. Do a dry run on the live site, check `/admin`, then run `supabase/reset.sql` again before real participants.

## 6. Data dictionary

`trials.csv` has one row per trial (21 per session):

| Column | Meaning |
|---|---|
| `session_id`, `code`, `condition` | Who and which link |
| `session_order` | 1 if this was the code's first condition, 2 if second (stopped attempts are not counted) |
| `position`, `item_id`, `is_catch`, `item_type`, `headline`, `label` | The trial and its ground truth |
| `initial_answer`, `initial_correct`, `initial_confidence`, `initial_time_ms`, `initial_at` | The participant's own answer (the only answer in the baseline) |
| `ai_label`, `ai_prob_satire`, `ai_confidence`, `ai_confident`, `ai_correct`, `ai_words`, `ai_shown_at` | Exactly what the AI showed (assisted only); `ai_words` is `word:push` pairs, positive toward Satire |
| `final_answer`, `final_correct`, `final_confidence`, `final_time_ms`, `final_at` | The answer after seeing the AI |
| `switched` | The final answer differs from the own answer |
| `scored_answer`, `scored_correct` | The answer that counts: final for assisted study trials, otherwise the only answer |

`sessions.csv` has one row per session: code, condition, order, consent time, instruction-check failures, check passed, stopped, completed, `catch_passed`, study trials answered and correct, accuracy and the comment.

Times are visible-tab milliseconds, so switching tabs does not inflate them.

## 7. Privacy and security

- No names, emails or accounts are collected. The code is self-chosen and participants are asked not to use their name.
- The browser never receives ground truth: the API's trial objects have no label field, which the unit tests and the browser tests check.
- Row Level Security is on with no policies, so only the server's service-role key can read or write. That key never reaches the browser.
- All input is validated with zod. Answers are write-once, in order, and the own answer is locked once the AI has been seen.
- CSV exports defuse spreadsheet formulas in free text.
- The admin page uses a password and a signed HttpOnly cookie.

## 8. Testing

Unit tests (Vitest, 95) cover:
- the model port (parity with Python on all 240 headlines and 14 edge cases);
- the item pool, sampling and the attention-check placement;
- every service rule and every input schema;
- the exports;
- the storage contract.

I also removed each safeguard in turn (22 of them, from "answers are write-once" to the database's one-open-session index) and confirmed that a test fails each time.

Browser tests (Playwright, 21) cover:
- both conditions end to end, with reloads;
- no repeated headlines across a code's two sessions;
- the instruction check's retry and stop;
- a phone run;
- the admin login and exports;
- no horizontal scrolling at five widths in light and dark.
