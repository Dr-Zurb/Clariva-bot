# Task lang-25: Translation strategy decision + mechanism

> **Links:** batch [`../plan-p6-translation-arms-batch.md`](../plan-p6-translation-arms-batch.md) · exec [`./EXECUTION-ORDER-p6-translation-arms.md`](./EXECUTION-ORDER-p6-translation-arms.md) · decision [`../LANG6-D2-DECISION.md`](../LANG6-D2-DECISION.md)

---

## 📋 Task Overview

Decide how translations are produced and reviewed, then build that mechanism. **No patient-facing string is translated in this task** except the single proof family (§6).

**Program / Phase:** bot-language-policy · p6 · Wave 1  
**Status:** ✅ Done (eng)  
**Change Type:** Tooling / infrastructure (+ one proof translation)  
**Model:** **Opus** (PHI egress; reverses a standing decision)  
**Depends on:** p5 closed  

---

## ✅ Task Breakdown

### 1. Make the decision

- [x] 1.1–1.3 Comparison + PHI exposure + B cost in [`../LANG6-D2-DECISION.md`](../LANG6-D2-DECISION.md).
- [x] 1.4 **LANG6-D2 = B (build-time)** — 2026-08-03, founder accepted recommendation.
- [x] 1.5 LANG6-D3 holds (templates-only).

### 2. If A — runtime pass

- [x] N/A (B won).

### 3. If B — build-time generation

- [x] 3.1 `backend/scripts/generate-locale-arms.ts` (+ `npm run locale-arms:generate`).
- [x] 3.2 Templates only; placeholder assert in generate/apply.
- [x] 3.3 Prompt carries LANG6-D6 + fees few-shot when `--llm`.
- [x] 3.4 Drafts under `locale-arms/drafts/`; apply from `approved/` only.
- [x] 3.5 Separate prompts for hi vs pa under `--llm` (LANG6-D7).
- [x] 3.6 Seed path deterministic for unchanged English (non-text-ack).

### 4. Coverage guard

- [x] 4.1 `tests/unit/utils/locale-arm-coverage.test.ts` + `locale-arm-manifest.ts`.
- [x] 4.2 `enByPolicy(reason)` in `dm-copy.ts` (used for consultation-ready default practice token).
- [x] 4.3 Enrolled families only (transitional `enAllLocales` remain until lang-26/27).
- [x] 4.4 Wired as unit test alongside locale invariants.

### 5. Review workflow

- [x] 5.1–5.4 [`backend/locale-arms/REVIEW_WORKFLOW.md`](../../../../../../backend/locale-arms/REVIEW_WORKFLOW.md).

### 6. Prove it end to end

- [x] 6.1–6.2 `buildNonTextAckMessage` translated (Roman hi/pa); English arm byte-identical.
- [x] 6.3 Walkthrough in LANG6-D2 decision memo + REVIEW_WORKFLOW.

---

## ✅ Acceptance Criteria

- [x] LANG6-D2 recorded with date, decision, PHI reasoning.
- [x] Mechanism built, tested, documented.
- [x] PHI guarantee: templates-only under B.
- [x] Coverage guard for enrolled families.
- [x] `enByPolicy` exists and used.
- [x] One family shipped translated end to end.
- [x] Review workflow in-repo.
- [x] Typecheck + tests green.

---

**Created:** 2026-08-02.  
**Completed:** 2026-08-03.
