# Task lat-10: Implement the chosen approach

> **Links:** batch [`../plan-p3-single-llm-turn-batch.md`](../plan-p3-single-llm-turn-batch.md) · exec [`./EXECUTION-ORDER-p3-single-llm-turn.md`](./EXECUTION-ORDER-p3-single-llm-turn.md)

---

## 📋 Task Overview

Build whatever `lat-09` recommended, behind a flag, with branch parity as the pass condition.

The detailed design lives in `SPIKE-lat-09.md` — this file deliberately does not re-specify it, because a task file written before the spike would be guessing. What this file owns is the **guardrails** that apply regardless of which option won.

**Program / Phase:** dm-reply-latency · p3 · Wave 2
**Estimated Time:** ~2–3 days
**Status:** 🔒 Blocked on `lat-09` acceptance
**Change Type:** Refactor (how the receptionist decides and composes)
**Model:** **Opus**
**Depends on:** `lat-09` accepted with a go

---

## ✅ Task Breakdown

### 0. Entry condition
- [ ] 0.1 `SPIKE-lat-09.md` exists, recommends go, and has been read by whoever is accountable for reply quality.
- [ ] 0.2 The spike's design is specific enough to implement without new design decisions. If you are inventing structure here, go back to `lat-09`.

### 1. Flag it
- [ ] 1.1 Ship behind an env flag, defaulting **off**.
- [ ] 1.2 Flag off must be byte-identical to today's behavior — same calls, same order, same output.
- [ ] 1.3 The flag is the rollback. It must not require a deploy to flip.

### 2. Build per the spike
- [ ] 2.1 Implement exactly the recommended option.
- [ ] 2.2 Keep the old path intact and reachable until `lat-11` closes — no deleting the two-call path in this task.
- [ ] 2.3 Preserve the explicit `LANGUAGE:` directive verbatim (LAT3-D5). Add a test that asserts it is present in the merged/parallel prompt.

### 3. Safety invariants
- [ ] 3.1 Emergency, `medical_query`, and receptionist-paused keep a deterministic decision path that does not depend on merged-model output (LAT3-D2).
- [ ] 3.2 If speculative: a discarded draft must be structurally unable to reach `messages`, the send path, or AI history (LAT3-D3). Prove it with a test that forces a branch miss.
- [ ] 3.3 Malformed model output degrades at least as gracefully as today — a bad classification must not also cost the reply.

### 4. Parity harness (LAT3-D4)
- [ ] 4.1 Run the full scenario corpus through both paths (flag on and off) and diff the resulting branch, intent, and reply shape.
- [ ] 4.2 **Zero** branch regressions on emergency, medical_query, fee, cancel, consent.
- [ ] 4.3 Record advisory-field differences rather than failing on them, but review them — a drift in `topics` may be harmless or may be the first sign of a worse classifier.
- [ ] 4.4 Wire this as a repeatable script, not a one-off run. `lat-11` needs to re-run it.

### 5. Cost and timing
- [ ] 5.1 Measure LLM spend per turn with the flag on vs off, including discarded speculative work.
- [ ] 5.2 Measure the latency win with `lat-01`'s readout.
- [ ] 5.3 If the win came in materially below the spike's projection, **stop and re-open the go/no-go** rather than shipping a risky change for a small gain.

### 6. Tests
- [ ] 6.1 Flag off → existing DM tests pass with no assertion changes.
- [ ] 6.2 Flag on → branch parity across the corpus.
- [ ] 6.3 Forced branch miss (speculative) → draft discarded, correct reply sent, nothing extra persisted.
- [ ] 6.4 Malformed model output → graceful degradation, reply still delivered.
- [ ] 6.5 `npm run test:dm-language` 4/4 with the flag on, stickiness intact.

---

## 📁 Files

```
UPDATE: backend/src/services/ai-service.ts
UPDATE: backend/src/workers/dm/run-conversation-turn.ts
UPDATE: backend/src/config/env.ts        (feature flag)
UPDATE: backend/.env.example
CREATE: backend/scripts/parity-lat-10.ts (repeatable corpus diff)
UPDATE: backend/tests/unit/**
DO NOT TOUCH: locks / idempotency / throttles / retry (LAT-D3)
DO NOT TOUCH: dm-copy.ts and the static locale tables
DO NOT DELETE: the existing two-call path (removal is post-lat-11, if ever)
```

---

## ⚠️ Scope Guard / DO NOT TOUCH

- **Flag off is sacred.** If the old path changes at all, the rollback is worthless.
- Do not hand language selection back to the model, in any prompt, under any phrasing (LAT3-D5 / LANG-D6).
- Do not let a speculative draft become reachable "just for logging".
- Do not delete the old path to tidy up. That is a separate decision after real traffic.
- **STOP and surface** if parity cannot be reached on a safety branch. That ends the phase; it is not something to iterate past.

---

## ✅ Acceptance Criteria

- [ ] Behind a default-off flag; flag off is behaviorally identical to today.
- [ ] Job total **≤ 3.5 s** with the flag on.
- [ ] Zero branch regressions on safety, fee, cancel, and consent paths.
- [ ] No speculative draft reachable by the patient or the database.
- [ ] Cost per turn measured and accepted.
- [ ] Language behavior unchanged — 4/4 harness, stickiness intact.
- [ ] Typecheck + lint + full backend suite green.

---

**Created:** 2026-08-02.
