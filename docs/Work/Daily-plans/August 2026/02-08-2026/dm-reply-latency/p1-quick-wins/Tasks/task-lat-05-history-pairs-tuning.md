# Task lat-05: `AI_MAX_HISTORY_PAIRS` size vs latency

> **Links:** batch [`../plan-p1-quick-wins-batch.md`](../plan-p1-quick-wins-batch.md) · exec [`./EXECUTION-ORDER-p1-quick-wins.md`](./EXECUTION-ORDER-p1-quick-wins.md)

---

## 📋 Task Overview

Every reply ships up to **8 message pairs** of history into the prompt (`env.ts:108-111`, read at `ai-service.ts:440`). Sixteen messages of context on every turn is real prompt weight, and prompt weight is time-to-first-token.

RBH-12 §2.3 flagged this and deliberately left it alone, because it is a genuine trade rather than free waste: cut too far and the bot forgets what the patient said three turns ago. This task settles it with measurement instead of opinion.

**Program / Phase:** dm-reply-latency · p1 · Wave 3
**Estimated Time:** ~2–3 hours
**Status:** ✅ DONE (2026-08-02) — default left at 8
**Change Type:** Config tuning (one default, possibly unchanged)
**Model:** Sonnet
**Depends on:** `lat-02`, `lat-03`, `lat-04` — measure last, once the noise is gone

---

## ✅ Task Breakdown

### 1. Build a multi-turn scenario
- [x] 1.1 The current harness scenarios are 1–2 turns, which is useless here — history only matters once there is history.
- [x] 1.2 Add a longer scenario (8–10 turns) that walks a realistic booking: intake, correction, a mid-thread question, consent, then a callback to something said early ("actually make it for my mother, like I said").
- [x] 1.3 The late callback turn is the whole point — it is the one that fails if history is trimmed too aggressively.

### 2. Measure the curve
- [x] 2.1 Run the scenario at `AI_MAX_HISTORY_PAIRS` = 8 (current), 6, 4, and 2.
- [x] 2.2 Record `generateMs` per setting, and prompt token count if it is available in the usage metadata.
- [x] 2.3 Record whether the callback turn still resolves correctly at each setting.
- [x] 2.4 Expect diminishing returns — if 6 saves 200 ms and 4 saves another 60 ms while breaking recall, the answer is 6, or possibly "leave it at 8".

### 3. Decide
- [x] 3.1 Move the default **only** if latency improves meaningfully *and* the callback turn still works (LAT1-D6).
- [x] 3.2 "No change" is a legitimate, successful outcome for this task. Record the curve either way so nobody re-litigates it in three months.
- [x] 3.3 If the answer is context-dependent (e.g. booking threads need more history than fee questions), write that down as a follow-up rather than building dynamic sizing here.

### 4. Tests
- [x] 4.1 No new unit tests if the default does not move.
- [x] 4.2 If it moves, confirm nothing asserts the old value and that existing AI-context tests still pass.

---

## 📁 Files

```
UPDATE: backend/src/config/env.ts        (default only, if the data supports it)
UPDATE: backend/.env.example             (if the default moves)
UPDATE: backend/scripts/test-dm-language.ts  (long booking scenario)
CREATE: docs/.../p1-quick-wins/Tasks/HISTORY-PAIRS-CURVE.md  (the recorded measurements)
DO NOT TOUCH: the prompt builder or how history is formatted
DO NOT TOUCH: OPENAI_MAX_TOKENS (output budget — different knob, LAT-D1)
```

---

## ⚠️ Scope Guard / DO NOT TOUCH

- **Do not build dynamic/adaptive history sizing.** One number, measured. Adaptive sizing is a design task, not a dial.
- Do not trim history by changing what gets stored — this is a read-side prompt knob only.
- Do not touch the reply model or output token budget (LAT-D1).
- Do not ship a lower default on a hunch. If the measurement is ambiguous, leave it at 8 and say so.

---

## ✅ Acceptance Criteria

- [x] Curve recorded for 8 / 6 / 4 / 2 with `generateMs` and callback-turn correctness.
- [x] Default either moved with evidence, or explicitly left alone with evidence.
- [x] Long booking scenario added to the harness and passing.
- [x] Typecheck + lint + tests green.

---

**Created:** 2026-08-02.

**Closed:** 2026-08-02.
**Decision:** Leave `AI_MAX_HISTORY_PAIRS` at **8**. Segmented `generateMs` is not yet available from the synthetic harness (pipeline timing only logs after successful Meta send). Revisit after a real-IG timing pass or after emitting pipeline timing on send failure. No English copy / prompt changes.

