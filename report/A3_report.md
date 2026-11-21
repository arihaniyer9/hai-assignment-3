# Assignment 3: A Study of AI-Assisted Satire Detection

**Arihan Iyer** (uniqname: imarihan) · Human-AI Interaction, Fall 2026

Every number in this report is computed by the analysis code in `analysis/` from the collected data files and filled into the text automatically.

**Interfaces**

- Without AI: <https://hai-assignment-3.vercel.app/baseline>
- With AI: <https://hai-assignment-3.vercel.app/assisted>
- Participants' results page: <https://hai-assignment-3.vercel.app/results>

**Code and data:** <https://github.com/arihaniyer9/hai-assignment-3>

**Summary.** {{n_participants}} participants each judged 20 headlines on their own and 20 with the AI.

- They were right **{{acc_alone}}** of the time on their own and **{{acc_with}}** with the AI. The AI alone was right **{{acc_ai}}** of the time on the same headlines.
- My Assignment 2 prediction held only in part. The AI came last, but human+AI did not fall below human-only; the two were level (section 5.a).
- The reliance logs explain why. People changed their answer after seeing the AI on only {{rel_switches}} of {{n_trials_condition}} trials, but they switched selectively: on {{d_switch_when_ai_right}} of disagreements where the AI was right, against {{d_switch_when_ai_wrong}} where it was wrong. Their final answers beat every simple strategy, including always keeping their own answer.
- One caveat weakens this finding. The final answer was pre-selected to the person's own answer, and two of the four participants who never switched said the second step was confusing (section 4.2).

## 1. The task, the AI assistance and my design decisions

### 1.1 Task

Each trial shows one real news headline. The participant decides whether it was published by a **satire website** or a **real news outlet**.

The headlines are my Assignment 2 study set: 240 headlines, 120 satire and 120 real, in four types (obvious satire, subtle satire, real but absurd, plain real). The outlet name is removed and every headline is shown in the same Title Case, so only the wording gives the answer away.

### 1.2 The two interfaces

A participant does both parts, in either order, under a self-chosen code (no names are collected).

- **Without AI (`/baseline`).** The participant chooses Satire or Real and gives a confidence from 1 to 5 (Figure 2).
- **With AI (`/assisted`).** Each headline has three steps:
    1. The participant gives their own answer and confidence.
    2. The AI's suggestion appears (Figure 1): its label, how sure it is, a "Confident" badge at the 70% threshold fixed in Assignment 2, and every word that pushed it toward Satire (solid underline, +) or Real (dashed underline, −).
    3. The participant gives a final answer, keeping or changing their own, and a new confidence.

This answer-first workflow follows Yin et al. [1]. I chose it because it records, on every trial, whether the AI changed the person's mind and whether that change was for better or worse. A design that shows the AI straight away cannot separate "agreed anyway" from "was persuaded".

<figure>
<img src="docs/screenshots/assisted-ai.png" alt="The AI step of the assisted interface">
<figcaption><b>Figure 1.</b> Step 2 of an AI-part trial. The participant's own answer is recapped and locked at the top. Below it are the AI's suggestion and calibrated confidence, and the headline with each word's push toward Satire (blue, solid, +) or Real (orange, dashed, −). The final-answer controls come last. Direction is shown by line style and sign as well as colour.</figcaption>
</figure>

<figure>
<img src="docs/screenshots/baseline-trial.png" alt="A trial in the part without AI">
<figcaption><b>Figure 2.</b> A trial in the part without AI. It is the same layout, without the AI step, so the two conditions differ only in the assistance.</figcaption>
</figure>

### 1.3 The AI

The AI is the TF-IDF logistic-regression model I trained in Assignment 2. It runs **live on the server for each trial** (synchronous AI), and the server logs exactly what was shown, along with both answers, both confidences and both response times. As a check, the AI output logged in this study matches the Assignment 2 model on {{ai_matches_a2}} AI-part trials.

### 1.4 Design decisions

Table 1 lists the main choices and the reason for each.

<p class="caption"><b>Table 1.</b> Design decisions.</p>

| Decision | What I chose | Why |
|---|---|---|
| Trials per part | 20 headlines (5 per type) plus 1 attention-check headline. Each participant gets a random draw, and no headline repeats across a person's two parts | Designed for about 5 minutes per part (actual medians in section 2); balanced types; no carry-over between parts |
| Assistance workflow | Own answer, then the AI, then a final answer | Measures reliance directly, which Assignment 2 suggested would be rare |
| What the AI shows | Label, calibrated confidence, Confident badge, word-level reasons | The reasons let people see when the AI rests on a superficial word |
| Attention checks | An instruction check before the trials (two tries, then restart) and one attention-check headline per part | Easy for anyone paying attention, tolerant of one slip, as the brief asks |
| Feedback | The total score after each part. Every headline with the correct answer and the AI's answer only after both parts (Figure 3) | Participants asked for it; locking it until both parts are done prevents learning between conditions |
| Go-back window | 10 seconds to change a baseline answer or a final answer, never the own answer before the AI; each change is counted | A participant asked for it during the study |
| Storage | Next.js API routes and Supabase Postgres, one row per trial | An own backend; the database itself enforces one open session per code |

<figure>
<img src="docs/screenshots/results-top.png" alt="The results page">
<figcaption><b>Figure 3.</b> The results page (shown for a scripted test participant, not real data), unlocked once a participant has finished both parts and opened only from their own browser session. It shows each headline's correct answer next to the participant's answer and the AI's, plus both scores. It was added during the study in response to participant feedback (section 2).</figcaption>
</figure>

## 2. Data collection

- **Who and when.**
    - {{n_class}} classmates took both parts during the in-class session on 2026-11-12, following the class protocol (each person did both conditions, in either order).
    - Before that, {{n_preclass}} friends took both parts on 2026-11-08 and 2026-11-10.
    - My own test run on the live site (2026-11-05) is excluded.
    - That gives {{n_participants}} participants (P1–P{{n_participants}}, numbered by when they started) and {{n_trials}} study trials, {{n_trials_condition}} per condition.
- **Order.** {{n_first_baseline}} participants did the part without AI first and {{n_first_assisted}} did the AI part first, so order is balanced.
- **Actual time taken** (consent to completion, median and range):
    - without AI: {{dur_base}} minutes ({{dur_base_range}});
    - with AI: {{dur_ai}} minutes ({{dur_ai_range}});
    - both parts: {{dur_both}} minutes ({{dur_both_range}}).

    My design target was about 5 minutes per part. The part without AI came in under it, and the AI part took longer, because of the second step. The slowest participant took over 17 minutes for the AI part alone.

- **Validity.** Every participant finished both parts and passed the attention-check headline in both. Of the {{sessions_total}} sessions in the database, {{sessions_stopped}} were stopped at the instruction check, both of them my own test attempts.
- **The interface changed once.** After the two pre-class participants (P1, P2), I added the 10-second go-back window and the results page, both of which they asked for. All in-class sessions used this version 2, and the data mark each session's version. Section 4.5 repeats the analysis on version 2 alone.
- **Prior exposure.** P2 had also rated some of the headlines in my Assignment 2 pilot. Section 4.5 repeats the analysis without the headlines she had seen.
- **Qualitative data.** I have the optional in-app comments and the comparison comments {{n_feedback}} classmates wrote in the class spreadsheet. {{n_feedback_linked}} of those spreadsheet comments can be linked to a session; names are removed (section 5.c).

The files are `data/collected/trials.csv` (one row per trial), `data/collected/sessions.csv` (one row per session) and `data/collected/class_feedback.csv`. The README's data dictionary describes every column.

**Privacy.** Participants chose their own codes, and some used their uniqname.

- In every shared file, codes are replaced by P1–P{{n_participants}} (R1 for my test run) and session ids by labels such as `P3-assisted`. The key stays in a private folder that is never committed.
- The results page now opens only from a participant's own session id, which only their browser holds, never from a code, and it never returns the code.
- The admin page needs a password exchanged for a signed, HttpOnly, Secure cookie, and every failed attempt is delayed by one second.

## 3. Measurements and why

Table 2 defines each measure. Accuracy answers the assignment's question. The others explain *why* accuracy came out as it did.

<p class="caption"><b>Table 2.</b> Measures and their purpose.</p>

| Measure | Definition | Why it matters |
|---|---|---|
| **Accuracy** (primary) | Share of the 20 study headlines answered correctly: the only answer without AI, the final answer with AI | The Assignment 2 metric, and what the ranking prediction is about |
| **AI-only accuracy** | The AI's accuracy on the headlines participants saw in the AI part | Compares all three conditions on the same items |
| **Confidence** | 1 to 5 on every answer | Whether the AI makes people more or less sure, and whether confidence tracks correctness |
| **Time per headline** | Visible-tab seconds per headline (both steps in the AI part) | The cost of assistance |
| **Reliance** | Agreement and switch fractions (Yin et al. [1]); appropriate reliance as RAIR and RSR (Schemmer et al. [2]) | Distinguishes "the AI did not help" from "people did not use it" |

**Statistics.** The participant is the unit of analysis. Each person did both conditions, so conditions are compared within person:

- **Primary test:** a Wilcoxon signed-rank test [3] on each person's accuracy, appropriate for paired data with a small n and no normality assumption. The effect size is the rank-biserial r.
    - Accuracies are counts out of 20, so many differences tie. Wherever ties occur, the p-value comes from the normal approximation with tie correction, and each result below states which method was used.
- **Check on the primary test:** an exact sign-flip permutation test, which needs no approximation.
- **Intervals:** for each condition I report the mean of the per-person accuracies with a 95% interval from resampling participants (10,000 bootstrap samples). Pooling all trials would treat the 20 answers from one person as independent and give intervals that are too narrow.
- **Discrimination:** a Fisher exact test on whether people switched more often when the AI was right than when it was wrong.
- **Before vs after the AI:** an exact McNemar test [4] on the trials where the answer changed.
- **Trial-level model:** a logistic GEE [5] clustered by participant, which also tests the order of the two parts.

With {{n_participants}} participants these tests have little power, so I report effect sizes and intervals as well as p-values, and I read non-significant results as "no evidence of a difference", not "no difference".

## 4. Results

### 4.1 Task performance and the ranking

Table 3 gives accuracy in each condition, and Figure 4 shows how each participant moved between the two parts.

<p class="caption"><b>Table 3.</b> Accuracy by condition (primary sample, {{n_participants}} participants, 20 headlines each per condition). The interval resamples participants, not trials.</p>

| Condition | Accuracy | 95% CI (participant bootstrap) | Correct (all trials) |
|---|---|---|---|
| Human with AI (final answer) | **{{acc_with}}** | {{acc_with_pci}} | {{acc_with_k}} |
| Human alone (no AI) | **{{acc_alone}}** | {{acc_alone_pci}} | {{acc_alone_k}} |
| Human before seeing the AI (AI part, step 1) | {{acc_before}} | {{acc_before_pci}} | {{acc_before_k}} |
| AI alone (same headlines) | **{{acc_ai}}** | {{acc_ai_pci}} | {{acc_ai_k}} |

<figure>
<img src="analysis/results/figures/paired_accuracy.png" alt="Each participant's accuracy with and without AI">
<figcaption><b>Figure 4.</b> Each participant's accuracy without AI (orange) and with AI (blue, final answer), joined by a grey line. Each person is shifted slightly sideways so that people with the same score stay visible. The dashed line is the AI's own accuracy on the AI-part headlines. Lines go both ways, and every participant stays above the AI.</figcaption>
</figure>

- **Human with AI vs human alone.** The mean per-person difference was {{t_main_d}} ({{t_main_a}} vs {{t_main_b}}; 95% participant-bootstrap interval {{diff_ci}}).
    - Wilcoxon W = {{t_main_w}}, p = {{t_main_p}} ({{t_main_method}}), r = {{t_main_r}}; exact permutation p = {{t_main_perm}}.
    - This is not significant, and Figure 4 shows why: some participants improved with the AI and some got worse.
- **Human with AI vs AI alone.** Every participant with a difference beat the AI: {{t_ai_d}}, W = {{t_ai_w}}, p = {{t_ai_p}} ({{t_ai_method}}), r = {{t_ai_r}}; exact permutation p = {{t_ai_perm}}.
- **Trial-level model.** The odds ratio for seeing the AI is {{gee_or}} (95% CI {{gee_ci}}, p = {{gee_p}}). Doing a part second has an odds ratio of {{gee_order_or}} (p = {{gee_order_p}}), so there is no detectable order effect.

The observed ranking is therefore **human+AI ({{acc_with}}) ≈ human-only ({{acc_alone}}) > AI-only ({{acc_ai}})**. For comparison, the AI scored {{a2_ai}} on all 240 headlines in Assignment 2.

Table 4 gives the per-participant numbers behind Figure 4.

<p class="caption"><b>Table 4.</b> Per-participant results. "Before" is the own answer in step 1 of the AI part. "Switches" counts answers changed after seeing the AI.</p>

{{table_participants}}

### 4.2 Reliance on the AI

Accuracy cannot tell whether the AI was ignored or followed, so Table 5 measures that directly.

<p class="caption"><b>Table 5.</b> Reliance on the AI in the AI part ({{n_trials_condition}} trials).</p>

| Measure | Value |
|---|---|
| Own answer already agreed with the AI (before seeing it) | {{rel_initial_agree}} |
| Final answer agrees with the AI (agreement fraction [1]) | {{rel_agree}} |
| Switched to the AI when the first answer disagreed (switch fraction [1]) | {{rel_switch}} of {{rel_disagree}} disagreements |
| Answers changed after seeing the AI | {{rel_switches}} ({{rel_to_right}} to the right answer, {{rel_to_wrong}} to a wrong one) |
| RAIR: took the AI's correct answer when one's own was wrong [2] | {{rel_rair}} of {{rel_rair_n}} chances |
| RSR: kept one's correct answer when the AI was wrong [2] | {{rel_rsr}} of {{rel_rsr_n}} chances |

- **Before vs after the AI** (McNemar): {{mc_wr}} answers went from wrong to right and {{mc_rw}} from right to wrong (p = {{mc_p}}).
- **Who switched:** {{n_no_switch}} of the {{n_participants}} participants never changed an answer after seeing the AI. Two of those four, P5 and P6, are the participants who said the second step was confusing (section 5.c), and P6 was not sure switching was possible. Some of the low switching is therefore probably an interface effect, not a judgement about the AI.
- **Where the errors came from:** across all AI-part errors, {{errors_under_total}} were cases where the AI was right and the person kept their own wrong answer, against {{errors_over_total}} where the person switched to a wrong AI answer.

**Was switching rarely the right call?** A low switch rate is not under-use if most disagreements were ones where the AI was wrong. Table 6 tests whether people could tell which disagreements to accept.

<p class="caption"><b>Table 6.</b> The {{rel_disagree}} disagreements (own answer differed from the AI's), and how people resolved them.</p>

| Disagreements where | AI was right | People switched to the AI |
|---|---|---|
| All | {{d_ai_right_on_disagreements}} | {{rel_switches}} |
| The AI was right | (all) | {{d_switch_when_ai_right}} |
| The AI was wrong | (none) | {{d_switch_when_ai_wrong}} |
| The AI showed its Confident badge | {{d_ai_right_on_disagreements_confident}} | {{d_switch_when_ai_confident}} |
| The AI showed no badge | {{d_ai_right_on_disagreements_not_confident}} | {{d_switch_when_ai_not_confident}} |
| The person was unsure (confidence 1–2) | | {{d_switch_when_person_unsure}} |
| The person was sure (confidence 3–5) | | {{d_switch_when_person_sure}} |

- **The AI was usually wrong when people disagreed with it:** right on only {{d_ai_right_on_disagreements}} of disagreements. Keeping one's own answer was the better policy about 70% of the time.
- **People switched selectively:** {{d_switch_when_ai_right}} when the AI was right, against {{d_switch_when_ai_wrong}} when it was wrong (Fisher exact p = {{d_fisher_p}}). They did *not* switch at random.
- **The badge told people nothing new at the moment they needed it.**
    - Across all AI-part trials the badge did separate good suggestions from bad ones: the AI was right {{d_ai_acc_conf}} with it and {{d_ai_acc_notconf}} without it.
    - But a person only faces a decision when they disagree with the AI, and on those trials the badged AI was right {{d_ai_right_on_disagreements_confident}} of the time, roughly a coin flip.
    - Most of the badged AI's correct answers came on headlines where the person already agreed with it, so its accuracy was concentrated where it could not change a decision. People switched less often on badged disagreements than on unbadged ones, which was not a mistake.
- **The case the badge was designed for never came up.** There was no trial with a confident AI and an unsure person ({{d_confident_and_unsure_n}} trials): people were rarely unsure when they disagreed ({{d_unsure_n}} of {{rel_disagree}} disagreements).
- **What people did beat every simple strategy.** On the AI-part trials:
    - always keeping one's own answer would have scored {{pol_keep}};
    - taking the AI's answer whenever it showed the badge, {{pol_ai_conf}};
    - always taking the AI's answer, {{pol_ai}};
    - participants actually scored {{pol_actual}}.

So the low switch rate was close to appropriate, not clear under-use. The strategy comparison confirms that the badge had no decision value: taking the AI whenever it showed the badge ({{pol_ai_conf}}) would have scored slightly *worse* than always keeping one's own answer ({{pol_keep}}). A confidence signal that is accurate overall can still be useless at the point of disagreement, because the person's own judgement already captures what it knows.

- **Where the AI could have helped:** on the AI-part trials, the person's own answer and the AI were both right {{comp_both_right}} times, only the person {{comp_human_only_right}} times, only the AI {{comp_ai_only_right}} times, and neither {{comp_both_wrong}} times.

### 4.3 Additional measures: time and confidence

- **Time.**
    - A headline took {{t_time_a}} s without AI and {{t_time_b}} s with it (median per person, both steps): {{t_time_d}} s, W = {{t_time_w}}, p = {{t_time_p}}.
    - The first answer alone in the AI part took {{t_time1_b}} s, against {{t_time1_a}} s without AI (p = {{t_time1_p}}).
    - So the extra time goes on reading the AI and answering again, not on the first judgement.
- **Confidence.** Mean confidence was {{t_conf_a}} without AI and {{t_conf_b}} for final answers with it ({{t_conf_d}}, W = {{t_conf_w}}, p = {{t_conf_p}}).
- **Calibration.** Table 7 shows whether higher confidence meant more correct answers.

<p class="caption"><b>Table 7.</b> Accuracy at each confidence level, for the answer that counts in each condition (number of answers in brackets).</p>

{{table_calibration}}

Confidence rises with accuracy only loosely. At level 4 without AI, people were right less often than at level 3. Participants used the go-back window {{revisions_text}}.

### 4.4 Errors by headline type and by Assignment 2 error pattern

Figure 5 and Table 8 break accuracy down by headline type. That shows *where* people and the AI differ.

<figure>
<img src="analysis/results/figures/accuracy_by_type.png" alt="Accuracy by headline type">
<figcaption><b>Figure 5.</b> Accuracy by headline type for people without AI (orange), people with AI (blue, final answer) and the AI alone (grey). The AI is far below people on obvious satire and real-but-absurd headlines, and above them on subtle satire.</figcaption>
</figure>

<p class="caption"><b>Table 8.</b> Accuracy by headline type.</p>

{{table_types}}

Table 9 groups headlines by the error pattern I coded in Assignment 2 for the AI's mistakes. A pattern applies only to headlines the AI gets wrong; "AI right in A2" covers the rest. This is how I check whether the errors I expected people to avoid were in fact avoided.

<p class="caption"><b>Table 9.</b> Accuracy on headlines grouped by Assignment 2 error pattern.</p>

{{table_patterns}}

### 4.5 Sensitivity and outliers

Table 10 repeats the main comparison on four samples, to check that no exclusion decision drives the result.

<p class="caption"><b>Table 10.</b> The main comparison under different inclusion rules.</p>

{{table_sensitivity}}

- **Leave-one-out.** Leaving out each participant in turn moves the mean difference (with AI minus without) between {{loo_min}} and {{loo_max}} points. No single person drives the result.
- **Signs of misunderstanding.** I found none:
    - every participant passed both attention-check headlines;
    - the one instruction-check failure was followed by a pass;
    - median times were 6.5 s per headline or more, and nobody answered all one way;
    - the slowest participant (about 20 s per headline) scored close to the group average, so slowness reflects care, not confusion.

## 5. Reflection

### 5.a Does my Assignment 2 prediction hold?

My Assignment 2 report (section e) stated, word for word:

> I predict this ranking, best first:
>
> 1. Human-only, at roughly the pilot's 75.6%.
> 2. Human+AI, somewhat below human-only and clearly above the AI alone.
> 3. AI-only, at about 63.3%.
>
> […] I expect the cost of anchoring on a confident wrong suggestion (25 confident errors in the study set) to cancel most of the benefit, which matches studies finding that human-AI teams often fail to beat the stronger member alone [8].

*Correction:* reference [8] in that sentence was Bansal et al. (2021), which actually found team performance above both partners. The finding I meant is better supported by Vaccaro et al.'s meta-analysis [12] (section 6).

**It held only in part.**

- **AI-only came last, as predicted, and by a wide margin** ({{acc_ai}} vs {{acc_with}}, Table 3).
    - Figure 5 shows the AI weakest on obvious satire and real-but-absurd headlines, exactly the clickbait-style satire and odd true stories where my Assignment 2 error analysis found its word patterns pointing the wrong way.
    - People did much better than the AI on those two types. I did not collect think-aloud data, so I cannot say what strategy they used.
- **Human+AI did not fall below human-only.** It was {{t_main_d}} higher, too small to call either way (p = {{t_main_p}}).
    - The anchoring cost I expected never appeared: only {{rel_to_wrong}} of {{rel_switches}} changed answers went from right to wrong (Table 5).
    - People kept their correct answer {{rel_rsr}} of the time when the AI was wrong (RSR).

**Why human+AI ended up level with human-only.**

- **People switched rarely, and mostly when it was right to.**
    - The switch fraction was {{rel_switch}}, and {{n_no_switch}} of {{n_participants}} participants never switched.
    - On its own, the RAIR of {{rel_rair}} looks like under-use. But the AI was right on only {{d_ai_right_on_disagreements}} of the disagreements, and people switched on {{d_switch_when_ai_right}} of those where it was right against {{d_switch_when_ai_wrong}} where it was wrong (Table 6, p = {{d_fisher_p}}).
    - Their final answers ({{pol_actual}}) beat always keeping their own answer ({{pol_keep}}) and always following the AI ({{pol_ai}}).
    - This is closer to appropriate reliance on a weak AI than to under-use.
    - Ignoring the Confident badge was also reasonable. When people disagreed with the AI, the badged AI was right only {{d_ai_right_on_disagreements_confident}} of the time, and following the badge would have scored below keeping their own answers ({{pol_ai_conf}} vs {{pol_keep}}).
    - The badge was accurate overall but carried no information beyond what people already knew. In an assistant whose errors overlap with the person's blind spots, a well-calibrated confidence score is not enough to make its advice useful.
    - Participants never saw whether an answer was correct during the study, so this cannot be the observed-accuracy effect of Yin et al. [1]. What they saw was frequent disagreement: their own answer differed from the AI's on {{rel_disagree}} of {{n_trials_condition}} trials, and several said they stopped trusting it (section 5.c). Treating a source that often disagrees with you as weaker is a reasonable response when, as here, the AI is the weaker partner. Across 106 experiments, Vaccaro et al. [12] found that human-AI combinations beat humans alone mainly when the human was the stronger partner, which matches the small, non-significant gain here.
- **The AI had little room to add.** The AI was right while the person was wrong on only {{comp_ai_only_right}} of {{n_trials_condition}} AI-part trials. Even perfect use of the AI could have raised accuracy by about that much, so the ceiling for complementarity was low.
- **The interface probably dampened switching.** The final answer was pre-filled with the person's own answer (Figure 1). P5 and P6, two of the four participants who never switched, said step 2 was confusing (section 5.c). Both factors suppress switching, so the true willingness to take the AI's advice may be higher than measured. In a follow-up I would ask the final question without a pre-filled answer and with an explicit "keep or change" choice.

**Error patterns: which were eliminated, added or changed** (Tables 8 and 9, against Assignment 2's error table).

- **Eliminated by people:**
    - *Ordinary news voice* (real news the AI calls satire): people were right over 90% of the time in both conditions. That confirms my Assignment 2 judgement that these errors are avoidable.
    - *Format-template satire* (clickbait-style satire the AI calls real): people got 81% right without AI, so the AI's largest error group was mostly avoidable, as I predicted. In the AI part the figure was lower (62%, on different headlines), and seeing the AI did not change it.
- **Not eliminated:** *absurd true events*, which I marked only "maybe" avoidable, stayed the hardest real headlines for people too. Real but absurd was people's weakest real type in both conditions, so here human and AI errors overlap.
- **Changed:** on *subtle satire* the AI was strong and people improved with it. That is where the AI actually helped, and also where Assignment 2 warned it may be riding a Reductress template cue.
- **Added:** no new error pattern appeared with the AI, and the few changed answers were mostly corrections.

**Outliers and data quality.** Section 4.5 found no participant who misunderstood the task and no single participant driving the result. The comparison also comes out the same in the class-only sample, without previously seen headlines, and with my test run included (Table 10).

### 5.b The additional measures

- **Time.** Assistance cost about {{t_time_d}} s per headline without a reliable accuracy gain, almost all of it in the second step (section 4.3). In a real setting this trade-off argues against showing a weak AI by default. On-demand assistance, or showing the AI only when it is confident, would cost less (Buçinca et al. [6]).
- **Confidence.** Seeing the AI did not reliably change confidence ({{t_conf_d}}, p = {{t_conf_p}}). That matches the reliance results: people treated the AI as a second opinion they could disregard. Their own confidence also tracked their accuracy only loosely (Table 7), so confidence was a weak guide to when they should have deferred.

### 5.c What participants said

The comments explain several of the numbers above. They are the in-app comments and the class spreadsheet's comparison comments; the spreadsheet comments are attributed to P-numbers only where they can be linked to a session.

**Distrust built from perceived disagreement.**

- Several participants describe learning not to trust the AI after seeing it contradict answers they were sure of: *"After I found out that the AI is not that helpful, I found myself not trusting it's outputs much and using my own instincts"* (P4).
- No one was told during the study whether the AI was right. This distrust came from disagreement with their own judgement, which matches the low switch rate in Table 5.

**Perceived over-reliance that the logs do not show.**

- P7 scored {{p7_k_base}} without AI and {{p7_k_final}} with it, and wondered whether *"the model can lead people to overthink and over-rely"*.
- The logs show the opposite. P7 switched {{p7_switches}} times. Of their errors in the AI part, {{p7_under}} were headlines where the AI was right and P7 kept their own answer.
- The drop came from different headlines and a correct AI that was ignored. Self-reports of reliance can mislead, which is why the behavioural measures matter.

**Confidence self-reports and measured confidence diverge.**

- P4 felt the AI *"did help increase my confidence"*. Their logged confidence went from {{p4_conf_first}} before the AI to {{p4_conf_final}} after it.
- P8 expected *"lower confidence in my choices with AI"*, and their confidence fell from {{p8_conf_first}} to {{p8_conf_final}}.
- These opposite experiences are consistent with the null confidence effect in section 4.3.

**The second step was ambiguous.**

- P5 found the post-AI confidence question *"confusing on what is being asked here to rate AI's response or to rate my answer"*.
- P6 wrote that they *"may have been able to change my selection … instead of just the confidence rating, but I'm not sure if that was an option"*.
- This is a measurement-validity problem: some final confidences may rate the AI rather than the person's answer, and some participants may not have known they could switch. It supports the interface explanation in 5.a.

**The word-level reasons were judged useful by some and opaque by others.**

- P7 used them to discount the AI when it *"felt like I was able to write-off a conflicting ai output based on a disribution [sic] that didn't make sense"*.
- An unlinked participant wanted *"a reasoning excerpt"* instead, and felt the AI was *"weighing political text as satire"*. There are too few political headlines in the data to test this, so I treat it as an impression.
- Word weights expose *what* the model reacts to, but not a reason a person can evaluate. Lai and Tan [9] found that explanations and predictions shape decisions differently, and Bansal et al. [7] found that explanations raised acceptance of AI advice without improving team accuracy.

**Task difficulty.** Two comments (one in the app, one in the spreadsheet, possibly from the same person) suggested harder headlines so the AI would *"serve more of a purpose"*. That echoes the low complementarity ceiling above.

The full comments:

{{class_feedback}}

{{comments}}

## 6. Literature review

- **Answer-first designs and trust.** Yin, Wortman Vaughan and Wallach [1] use the same three-step trial (predict, see the model, revise) and show that trust follows a model's *observed* accuracy more than its stated accuracy. My participants never saw correctness during the study, only how often the AI disagreed with them. So my results cannot test Yin et al.'s observed-accuracy effect directly, though the low switch rate is consistent with trust being shaped by experience rather than by anything stated. I adopted their agreement and switch fractions.
- **Appropriate reliance.** Schemmer et al. [2] separate relying on the AI when it is right (RAIR) from relying on oneself when it is wrong (RSR). My participants were near-perfect at self-reliance and had a low AI reliance. Splitting the disagreements by whether the AI was right shows that this low AI reliance largely reflected how rarely the AI was right when they disagreed with it.
- **Complementarity.** With an AI about as accurate as people, Bansal et al. [7] did obtain team accuracy above both partners. However, explanations added nothing beyond showing the AI's confidence, and they raised acceptance of AI advice whether or not it was correct. The broader claim that human-AI combinations usually fail to beat the better partner comes from Vaccaro et al.'s meta-analysis [12]: on average the combination was worse than the best of humans or AI alone (Hedges' g = −0.23), with losses concentrated in decision tasks like mine and gains when the human outperformed the AI. Acceptance in my study stayed low even with word-level reasons on screen. I had no condition without them, so I cannot say what they changed. Participants' comments suggest the reasons often exposed cues they could see were irrelevant, in line with Lai and Tan's [9] finding that explanations and predictions shape decisions differently.
- **Confidence and cognitive forcing.** Zhang, Liao and Bellamy [8] showed that displaying model confidence helps calibrate trust but does not by itself improve joint accuracy when the person's knowledge is the bottleneck. Buçinca et al. [6] showed that cognitive forcing, such as asking for one's own answer first as I did, reduces over-reliance, which fits my low rate of harmful switches. My badge result adds a nuance to Zhang et al.: the confidence display was accurate overall, but it had no value on the disagreements where a person must decide, so ignoring it was rational.
- **Study design.** Green and Chen [10] and the survey by Lai et al. [11] discuss how sample size, task choice and incentives limit what such studies can show. They informed my within-subject design, paired tests and reliance measures.

## 7. Bonus work

The A3 brief names two bonuses. The Canvas rubric for A3 lists three more bonus rows, so I list all five with where each comes from.

**Bonuses in the A3 brief**

- **Synchronous AI output** (brief step 5b, +3; Canvas rubric row "[Bonus] Synchronous AI output").
    - The Assignment 2 model is ported to TypeScript and runs on the server for each trial.
    - A parity test checks it against the Python model to within 1e-9 on all 240 headlines, and the output logged in this study matches Assignment 2 on all 160 AI-part trials (section 1.3).
    - Every output shown is logged with the answers before and after it.
- **Statistical tests** (brief A3-2 step 4, +2; Canvas rubric row "[Bonus] Statistical Tests").
    - Wilcoxon signed-rank tests on paired per-participant measures, stating exact or tie-corrected approximation, with exact sign-flip permutation tests and rank-biserial effect sizes.
    - Participant-bootstrap intervals.
    - An exact McNemar test before vs after the AI, and a Fisher exact test for selective switching.
    - A logistic GEE clustered by participant, with an order term.
    - Sensitivity analyses on four samples.

**Further bonus rows in the Canvas rubric**

- **"[Bonus] Set up your own interface."** The brief requires a backend (a survey platform costs 10 points). Beyond that requirement, the interface is my own Next.js application with its own API and database: consent, participant codes, an instruction check, resuming by code, a go-back window, a results page and an admin export, no form builder.
- **"[Bonus] Additional Measurements."** The brief requires at least one additional measurement. I collected confidence and time on every trial, plus four published reliance measures [1, 2] and the discrimination analysis in Table 6 (section 3).
- **"[Bonus] Literature Review."** Section 6.

## 8. Limitations

- With {{n_participants}} participants, a difference of a few points cannot be detected.
- Participants were classmates and friends, and HAI students may be unusually sceptical of AI.
- The interface changed once during collection; the version-2-only analysis shows the same pattern.
- The ambiguity of the second step and the pre-selected final answer (sections 4.2 and 5.c) may have lowered switching and blurred the final confidence ratings. Two of the four participants who never switched reported this confusion.
- The test p-values use the normal approximation where differences tie, and the exact permutation p is given alongside. With 8 people, both are coarse.
- The AI is weaker than people on this task (about 60% vs about 78%). That limits how much any interface could help, and the findings may not carry over to a stronger model.

## 9. Files and how to replicate

- **Data:** `data/collected/` (trials, sessions and class feedback), exported from the live admin page; the data dictionary is in `README.md`.
- **Interface code:** `app/`, `components/`, `lib/` (Next.js); the model is in `lib/model.ts` and `lib/ai.ts`.
- **Analysis:** `analysis/` (Python 3.13). The commands below rerun it: the first two set up the environment, `a3.analyze` writes `analysis/results/results.json` and the figures, and `a3.report` builds this PDF.

```
python3 -m venv analysis/.venv
analysis/.venv/bin/pip install -r analysis/requirements-dev.txt
cd analysis
PYTHONPATH=src .venv/bin/python -m a3.analyze
PYTHONPATH=src .venv/bin/python -m a3.report
```

## References

1. M. Yin, J. Wortman Vaughan and H. Wallach. Understanding the Effect of Accuracy on Trust in Machine Learning Models. *CHI*, 2019.
2. M. Schemmer, N. Kühl, C. Benz, A. Bartos and G. Satzger. Appropriate Reliance on AI Advice: Conceptualization and the Effect of Explanations. *IUI*, 2023.
3. F. Wilcoxon. Individual Comparisons by Ranking Methods. *Biometrics Bulletin* 1(6), 1945.
4. Q. McNemar. Note on the Sampling Error of the Difference Between Correlated Proportions or Percentages. *Psychometrika* 12(2), 1947.
5. K.-Y. Liang and S. L. Zeger. Longitudinal Data Analysis Using Generalized Linear Models. *Biometrika* 73(1), 1986.
6. Z. Buçinca, M. B. Malaya and K. Z. Gajos. To Trust or to Think: Cognitive Forcing Functions Can Reduce Overreliance on AI in AI-assisted Decision-making. *Proc. ACM Hum.-Comput. Interact.* 5(CSCW1), 2021.
7. G. Bansal, T. Wu, J. Zhou, R. Fok, B. Nushi, E. Kamar, M. T. Ribeiro and D. Weld. Does the Whole Exceed its Parts? The Effect of AI Explanations on Complementary Team Performance. *CHI*, 2021.
8. Y. Zhang, Q. V. Liao and R. K. E. Bellamy. Effect of Confidence and Explanation on Accuracy and Trust Calibration in AI-Assisted Decision Making. *FAT\**, 2020.
9. V. Lai and C. Tan. On Human Predictions with Explanations and Predictions of Machine Learning Models: A Case Study on Deception Detection. *FAT\**, 2019.
10. B. Green and Y. Chen. The Principles and Limits of Algorithm-in-the-Loop Decision Making. *Proc. ACM Hum.-Comput. Interact.* 3(CSCW), 2019.
11. V. Lai, C. Chen, Q. V. Liao, A. Smith-Renner and C. Tan. Towards a Science of Human-AI Decision Making: A Survey of Empirical Studies. arXiv:2112.11471, 2021.
12. M. Vaccaro, A. Almaatouq and T. Malone. When Combinations of Humans and AI Are Useful: A Systematic Review and Meta-Analysis. *Nature Human Behaviour* 8(12), 2293–2303, 2024.
