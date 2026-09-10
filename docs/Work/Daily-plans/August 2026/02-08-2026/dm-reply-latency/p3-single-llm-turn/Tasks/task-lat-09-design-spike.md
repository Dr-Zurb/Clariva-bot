# Task lat-09: Design spike — merged call vs speculative parallel

> **Links:** batch [`../plan-p3-single-llm-turn-batch.md`](../plan-p3-single-llm-turn-batch.md) · exec [`./EXECUTION-ORDER-p3-single-llm-turn.md`](./EXECUTION-ORDER-p3-single-llm-turn.md)

---

## 📋 Task Overview

Decide **whether** and **how** to remove one of the two sequential LLM round trips, and write the decision down with numbers attached.

This task produces a document and a recommendation. It produces **no shipped behavior change**. Its most valuable possible output may be "don't do this" (LAT3-D1 / LAT3-D6).

**Program / Phase:** dm-reply-latency · p3 · Wave 1
**Estimated Time:** ~1 day
**Status:** 🔒 Blocked on `lat-06`
**Change Type:** Spike (document + throwaway prototype)
**Model:** **Opus**
**Depends on:** `lat-06`

---

## ✅ Task Breakdown

### 1. Establish what classification actually feeds
- [ ] 1.1 Enumerate every consumer of `IntentDetectionResult`: stage router branches, control gates, fee logic, safety paths, `is_fee_question`, `topics`, `pricing_signal_kind`, and anything persisted to conversation state.
- [ ] 1.2 Separate **routing-critical** fields (change which code path runs) from **advisory** fields (colour the reply).
- [ ] 1.3 This list is the real constraint. A merged call must reproduce all of column one, exactly.

### 2. Option A — merged call
- [ ] 2.1 One request returning both the classification and the reply (structured output: `{ intent, …, reply }`).
- [ ] 2.2 Prototype it on the scenario corpus. Measure latency and branch agreement.
- [ ] 2.3 Confront the hard part honestly: today the router can *change the reply* based on intent — deterministic copy, fee blocks, booking-funnel stages. A merged call composes the reply **before** that routing exists. Establish which branches could still be served, and which would have to fall back to a second call anyway.
- [ ] 2.4 Estimate the fallback rate. If most real turns need the second call regardless, Option A saves nothing on the turns that matter.

### 3. Option B — speculative parallel
- [ ] 3.1 Start `generateResponse` for the most likely branch at the same time as `classifyIntent`; keep it if the branch matches, discard silently if not (LAT3-D3).
- [ ] 3.2 Measure the hit rate on the corpus — how often is the guessed branch right?
- [ ] 3.3 Quantify the cost: a miss means paying for a generation that is thrown away. State the expected spend increase per turn plainly.
- [ ] 3.4 Design the discard path so a wrong draft is **structurally** unable to be sent or persisted, not merely unlikely to be.

### 4. Option C — do nothing
- [ ] 4.1 Cost this honestly against A and B: zero risk, zero spend, zero saving.
- [ ] 4.2 Apply LAT3-D6 — if the projected saving is under ~1 s, recommend C.

### 5. Safety and language
- [ ] 5.1 For each option, show how emergency / medical_query / paused keep a deterministic decision path (LAT3-D2).
- [ ] 5.2 Show how the explicit `LANGUAGE:` directive survives intact (LAT3-D5). A merged prompt is the most likely place to accidentally hand language back to the model — flag it explicitly.
- [ ] 5.3 Consider what a malformed merged response does. Today a bad intent JSON degrades to `unknown` and the reply is unaffected; in a merged world one bad response could cost both.

### 6. Recommend
- [ ] 6.1 Write `SPIKE-lat-09.md` next to this task: the consumer map, both prototypes' numbers, projected saving, cost delta, risk list, and a single clear recommendation.
- [ ] 6.2 State a go / no-go. If go, define what `lat-10` builds precisely enough that it needs no further design.
- [ ] 6.3 If no-go, update the program README to mark p3 cancelled with the reason, and stop.

---

## 📁 Files

```
CREATE: docs/.../p3-single-llm-turn/Tasks/SPIKE-lat-09.md
CREATE: backend/scripts/spike-*.ts   (throwaway prototype — delete or clearly mark)
DO NOT TOUCH: any src/ runtime path — this task ships no behavior
DO NOT TOUCH: the reply prompt (measure against a copy, do not edit the real one)
```

---

## ⚠️ Scope Guard / DO NOT TOUCH

- **No shipped changes.** If you edit a runtime path, you are doing `lat-10` without permission.
- Do not start implementing the winner because it "looks obvious" — the acceptance step exists so the decision is reviewed by someone who is not mid-prototype.
- Do not prototype against production traffic or real patient threads.
- Do not skip Option C. A spike that cannot recommend "no" is not a spike.

---

## ✅ Acceptance Criteria

- [ ] Consumer map of `IntentDetectionResult` complete, split routing-critical vs advisory.
- [ ] Both options prototyped with measured latency and branch agreement on the corpus.
- [ ] Cost delta stated in plain terms for each option.
- [ ] Safety-branch and language-directive handling shown per option.
- [ ] One clear recommendation with a go / no-go, and enough detail that `lat-10` needs no further design.
- [ ] No runtime code changed.

---

**Created:** 2026-08-02.
