# Task sh-01: structured social-history model + pack-years / CAGE indices + serializer

> **Filename:** `task-sh-01-data-model-and-indices.md` in `social-history-v2/p1-core-indices/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/`/`backend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).

---

## 📋 Task Overview

Land the **pure foundation** of Social-history v2: the `SocialHistoryStructured` type (Phase-1
keys: smoking / smokeless / alcohol / notes), a rewrite of [`social-history.ts`](../../../../../../../frontend/lib/cockpit/social-history.ts)
to parse/serialize/update the structured object (with a **lossless legacy-TEXT fallback**),
and a new pure `social-history-indices.ts` computing **pack-years** and **CAGE**. No UI, no
backend — just well-tested logic everything else imports.

**Program / Phase:** social-history-v2 · Phase 1 (core + indices)  
**Batch:** [`plan-p1-social-history-v2-core-indices-batch.md`](../plan-p1-social-history-v2-core-indices-batch.md)  
**Execution order:** [`EXECUTION-ORDER-p1-social-history-v2-core-indices.md`](./EXECUTION-ORDER-p1-social-history-v2-core-indices.md)  
**Estimated Time:** ~2–3 hours  
**Status:** ✅ `Done`

**Change Type:**
- [x] **New feature** — structured model + derived indices (pure TS).

**Current State:**
- ✅ **What exists:** v1 flat-chip model in [`social-history.ts`](../../../../../../../frontend/lib/cockpit/social-history.ts) (`SOCIAL_HISTORY_DIMENSIONS`, `parse/serializeSocialHistory`, dimension setters); v1 tests in `__tests__/social-history.test.ts`.
- ✅ **What's missing (was):** the structured `SocialHistoryStructured` shape, quantity fields, the derived indices, and a serializer that emits indices — **now shipped in sh-01**.

**Scope Guard:**
- Expected files touched: ≤ 4 (rewrite `social-history.ts`; new `social-history-indices.ts`; their two test files). **No** UI/backend changes here.

**Reference Documentation:**
- Source plan §P1-02 / §P1-03 / §P1-04: [`plan-social-history-v2.md`](../../../../../../Product%20plans/ehr/subjective-tab/plan-social-history-v2.md) · [STANDARDS.md](../../../../../../../Reference/engineering/development/STANDARDS.md) · [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md).

---

## ✅ Task Breakdown (Hierarchical)

### 1. Structured model
- [x] ✅ 1.1 Define `SocialHistoryStructured` (smoking / smokeless / alcohol / notes) + `SmokingStatus`, per the v2 plan §P1-02. - **Completed: 2026-06-07**
- [x] ✅ 1.2 Rewrite `social-history.ts`: `parseSocialHistory` accepts the JSONB object (preferred) and best-effort hydrates legacy v1 TEXT (unmatched → `notes`). - **Completed: 2026-06-07**
- [x] ✅ 1.3 `serializeSocialHistory(structured)` → deterministic, PDF-ready TEXT (omits empty dimensions; `never` compact; indices inline when computable). - **Completed: 2026-06-07**
- [x] ✅ 1.4 Immutable updaters: `setSmoking` / `setSmokeless` / `setAlcohol` / `setSocialHistoryNotes` (replace-within-dimension); `formatSocialHistoryPreview`. - **Completed: 2026-06-07**

### 2. Indices
- [x] ✅ 2.1 New `social-history-indices.ts`: `packYears(perDay, years)` → 1-dp number or `null` when either missing. - **Completed: 2026-06-07**
- [x] ✅ 2.2 `cageScore(cage)` → `{ score, positive }`, `positive = score >= 2`. - **Completed: 2026-06-07**

### 3. Verification & Testing
- [x] ✅ 3.1 `social-history-indices.test.ts` — pack-years (rounding, missing inputs → null), CAGE score + threshold. - **Completed: 2026-06-07**
- [x] ✅ 3.2 `social-history.test.ts` — structured serialize round-trip; legacy TEXT → structured (lossless); replace-within-dimension; clear. - **Completed: 2026-06-07**
- [x] ✅ 3.3 `cd frontend; npx tsc --noEmit` + lint clean. - **Completed: 2026-06-07**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
UPDATE: frontend/lib/cockpit/social-history.ts (rewrite to structured model)
CREATE: frontend/lib/cockpit/social-history-indices.ts
UPDATE: frontend/lib/cockpit/__tests__/social-history.test.ts
CREATE: frontend/lib/cockpit/__tests__/social-history-indices.test.ts
DO NOT TOUCH: backend, RxFormContext, SocialHistoryField (later tasks)
```

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **JSONB object is the input** (SHv2-D1); TEXT parse is a legacy fallback only.
- **Indices derived, never stored** (SHv2-D3); pure functions, no side effects.
- **Legacy hydration lossless** (SHv2-D4) — unmatched legacy tokens go to `notes`.
- Keep export names stable where consumers already import them; update call sites in later tasks.

**DO NOT include** code, SQL, or signatures in this file.

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** **No** — pure client logic; no schema/storage change in this task.
- [x] **Any PHI in logs?** **No.**
- [x] **External API or AI call?** **No.**
- [x] **Retention / deletion impact?** **No.**

---

## ✅ Acceptance & Verification Criteria

- [x] Structured serialize/parse round-trips; legacy v1 TEXT hydrates without data loss; pack-years + CAGE math correct incl. edge cases; `tsc`/lint green.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 📝 Notes

The pure substrate — sh-02 (backend) and sh-03 (UI) both import this. Freeze the JSONB shape here.

---

## 🔗 Related Tasks

- [`task-sh-02-migration-and-backend.md`](./task-sh-02-migration-and-backend.md) — persists this shape.
- [`task-sh-03-form-plumbing-and-ui.md`](./task-sh-03-form-plumbing-and-ui.md) — renders it.

---

**Last Updated:** 2026-06-07  
**Pattern:** mirrors the `complaints` structured-model + derived-string approach.  
**Reference:** `process/CODE_CHANGE_RULES.md` · source plan §P1-02..P1-04.
