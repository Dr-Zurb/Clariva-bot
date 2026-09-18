# Task lang-06: Deterministic emitters read `turnLanguage`

> **Links:** batch [`../plan-p2-retire-second-detector-batch.md`](../plan-p2-retire-second-detector-batch.md) · exec [`./EXECUTION-ORDER-p2-retire-second-detector.md`](./EXECUTION-ORDER-p2-retire-second-detector.md)

---

## 📋 Task Overview

Convert all 15 `detectSafetyMessageLocale` call sites to take the already-resolved language as a parameter, then delete the detector.

Mechanical but wide. The rule for the whole task: **an emitter must never look at raw patient text to decide a language.**

**Program / Phase:** bot-language-policy · p2 · Wave 1
**Estimated Time:** ~5–7 hours
**Status:** ✅ DONE (2026-08-02)
**Change Type:** Refactor (patient-facing copy plumbing)
**Model:** Sonnet (executed on founder override of Opus gate)
**Depends on:** p1 closed

---

## ✅ Task Breakdown

### 1. Mapper
- [x] 1.1–1.3 `toStaticLocale` + script helpers in `conversation-language.ts` with unit tests.

### 2. `safety-messages.ts`
- [x] 2.1–2.4 `resolveSafetyMessage(kind, language)`; detector deleted; `control-gates` uses `ctx.turnLanguage`.

### 3. `reason-first-triage.ts` (7 sites)
- [x] 3.1–3.3 Formatters take `language`; callers in idle-fee-triage / booking-entry updated. Mixed `hi` string at askMoreHi left for p3.

### 4. `consultation-fees.ts` (3 sites)
- [x] 4.1–4.3 Language threaded; `feeComposerOpts.language` from turn; ₹/digits/names untouched.

### 5. `complaint-clarification.ts` + `dm-reply-composer.ts`
- [x] 5.1–5.2 Updated; booking-funnel passes `ctx.turnLanguage` (service-match has no emitter).

### 6. Sweep
- [x] 6.1 Zero `detectSafetyMessageLocale` in `backend/`.
- [x] 6.2 Locale-only `userText` removed from emitters; content-matching `userText` retained.

### 7. Tests
- [x] 7.1 Locale tests updated.
- [x] 7.2 Golden DM snap fixtures: **empty diff** (57 snapshots pass).
- [x] 7.3 Stored-language-wins: `hi-Latn` + English userText still Roman-Hindi CTA.

---

## 📁 Files

```
UPDATE: backend/src/utils/conversation-language.ts
UPDATE: backend/src/utils/safety-messages.ts
UPDATE: backend/src/utils/reason-first-triage.ts
UPDATE: backend/src/utils/consultation-fees.ts
UPDATE: backend/src/utils/complaint-clarification.ts
UPDATE: backend/src/utils/dm-reply-composer.ts
UPDATE: backend/src/workers/dm/control-gates.ts
UPDATE: backend/src/workers/dm/run-conversation-turn.ts
UPDATE: backend/src/workers/dm/stage-router.ts
UPDATE: backend/src/workers/dm/stages/idle-fee-triage.ts
UPDATE: backend/src/workers/dm/stages/booking-entry.ts
UPDATE: backend/src/workers/dm/stages/booking-funnel.ts
UPDATE: backend/tests/unit/** (fixtures + emitter tests)
DO NOT TOUCH: backend/src/utils/dm-copy.ts                (p3)
DO NOT TOUCH: backend/src/utils/localize-reply.ts         (lang-07)
```

---

## ✅ Acceptance Criteria

- [x] Zero references to `detectSafetyMessageLocale` anywhere in the repo.
- [x] All sites take an explicit language parameter.
- [x] `toStaticLocale` is the only place the 6-code set collapses to 3.
- [x] Golden snapshot diff is empty.
- [x] Stored-language-wins test passes.
- [x] Typecheck + targeted suite green.

---

**Created:** 2026-08-02.
**Closed:** 2026-08-02.
