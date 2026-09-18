# Task lang-24: Close gate p5

> **Links:** batch [`../plan-p5-copy-coverage-batch.md`](../plan-p5-copy-coverage-batch.md) · exec [`./EXECUTION-ORDER-p5-copy-coverage.md`](./EXECUTION-ORDER-p5-copy-coverage.md)

---

## 📋 Task Overview

Prove that every patient-facing string now flows through a locale-dispatched builder, and that **nothing a patient sees changed**.

An unusual gate: success means the bot behaves identically to before. The deliverable is structural. The visible payoff arrives in p6.

**Program / Phase:** bot-language-policy · p5 · Wave 5
**Status:** 🟡 Eng close-out ✅ · founder IG smoke open
**Model:** Composer / Founder

---

## ✅ Checklist

### The sweep — the actual gate
- [x] Repo-wide search for patient-facing English string literals outside locale copy modules.
- [x] p5-migrated snippets either live in allowed modules or on `DM_COPY_ENGLISH_ONLY_EXCEPTIONS`. Deferred non-DM clusters logged in capture inbox.
- [x] Automated sweep: `backend/tests/unit/utils/dm-copy-lang-24-sweep.test.ts`.
- [x] Reconcile: audit ~55 → migrated across lang-20…23 (~55 DM funnel) + lang-24 LLM empty fallback. ~18–25 remaining are **out of p5 audit** (Rx / OPD / consult UI / booking-page errors).

### No visible change (LANG5-D1)
- [x] `dm-copy` snapshot suite green (intentional new lang-22/23 snaps only).
- [x] Documented intentional English changes:
  - lang-20 §3.4 queue-mode reschedule choice link
  - lang-20 §1.2 duplicate cancel/status reconciliation (shared builders)
  - lang-23 §4.1 consult-link consolidation onto `buildConsultationReadyDm` (one-liner → multi-line)
  - No lang-22 nudge harmonisation needed (wording preserved)
- [ ] `npm run test:dm-conversation` — founder/CI; last known 14/15 (`safety-emergency-en` parked).
- [ ] Founder: English booking E2E on real Instagram.

### Language plumbing reaches everywhere
- [x] New builders take `language` (LANG3-D1).
- [x] In-turn → `ctx.turnLanguage`; OOB → `getConversationLanguage` (LANG3-D3).
- [x] Pause / revoke / throttle / FALLBACK resolve language.
- [x] Comment DMs from linked conversation only (LANG5-D6).
- [x] Custom doctor pause verbatim (LANG5-D4).

### PHI registry
- [x] `DM_COPY_PHI_REGISTRY` merges lang-20…23 + LLM fallback.
- [x] Spot-check: welcome-back + patient-match `true`; system acks `false`.
- [x] Machine-readable for lang-25.

### Structure
- [x] Stayed single-file `dm-copy.ts` (+ sibling locale modules).
- [x] Per-locale snaps for new builders.
- [x] Typecheck + targeted tests green.

### Confirm the state p6 inherits
- [x] Hinglish still gets English booking mechanics — recorded in [`../P6-TRANSLATION-INPUT.md`](../P6-TRANSLATION-INPUT.md).
- [x] Family list + ~90 count written for p6.
- [x] Exception list linked from program README.

### Close-out
- [x] Program README / EXECUTION-ORDER / MANUAL_QA §2+§14 updated.
- [x] Capture-inbox: deferred clusters + founder smoke.
- [x] MANUAL_QA notes structural coverage; translation pending p6.

---

**Created:** 2026-08-02.
**Eng completed:** 2026-08-03.
