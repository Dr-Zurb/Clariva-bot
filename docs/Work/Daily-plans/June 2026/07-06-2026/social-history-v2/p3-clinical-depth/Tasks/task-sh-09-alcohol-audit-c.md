# Task sh-09: AUDIT-C alcohol screen — model + score index + UI block + backend zod

> **Filename:** `task-sh-09-alcohol-audit-c.md` in `social-history-v2/p3-clinical-depth/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/`/`backend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).

---

## 📋 Task Overview

Add a validated **AUDIT-C** alcohol screen alongside the shipped CAGE block. Three questions —
frequency of drinking, typical quantity per occasion, and frequency of ≥6-drink (binge) sessions —
each scored 0–4, total **0–12**, with a **screen-positive** flag at a configurable default
threshold (≥4). Store under `alcohol.auditC` in `SocialHistoryStructured`, compute the score in a
pure index function (mirroring `cageScore`), render an optional CAGE-style block in the UI, serialize
the total into the derived TEXT, and mirror the shape in backend types + zod. **AUDIT-C does not
replace CAGE** — both are independent optional screens (SHv3-D2).

**Program / Phase:** social-history-v2 · Phase 3 (clinical depth + surfacing)  
**Batch:** [`plan-p3-social-history-v2-clinical-depth-batch.md`](../plan-p3-social-history-v2-clinical-depth-batch.md)  
**Execution order:** [`EXECUTION-ORDER-p3-social-history-v2-clinical-depth.md`](./EXECUTION-ORDER-p3-social-history-v2-clinical-depth.md)  
**Estimated Time:** ~2–3 hours  
**Status:** ✅ `Done`

**Change Type:**
- [x] **New feature** — additive scored questionnaire (no schema migration).

**Current State:**
- ✅ **What exists:** CAGE block (`CAGE_QUESTIONS`, `cageScore`, `CAGE_SCREEN_HELPER`) in [`social-history-indices.ts`](../../../../../../../frontend/lib/cockpit/social-history-indices.ts); alcohol section + drink rows in [`social-history-alcohol-drinks.ts`](../../../../../../../frontend/lib/cockpit/social-history-alcohol-drinks.ts); UI in [`SocialHistoryField.tsx`](../../../../../../../frontend/components/cockpit/rx/subjective/SocialHistoryField.tsx); `socialHistoryAlcoholSectionSchema` in [`validation.ts`](../../../../../../../backend/src/utils/validation.ts); `AlcoholUseSection` in [`prescription.ts`](../../../../../../../backend/src/types/prescription.ts).
- ✅ **What's missing (was):** the `alcohol.auditC` shape, its score index, the UI block, derived-TEXT serialize/parse, and the backend zod/type section — **now shipped in sh-09**.

**Scope Guard:**
- Expected files touched: ≤ 6 (`social-history-indices.ts`; `social-history-alcohol-drinks.ts` and/or `social-history.ts` for serialize/parse; `SocialHistoryField.tsx`; `prescription.ts`; `validation.ts`; + their tests). **No** migration, **no** PDF (sh-12), **no** binge field beyond AUDIT-C Q3 (sh-10 owns the standalone `maxPerSession`).

**Reference Documentation:**
- Batch plan **SHv3-D2** (AUDIT-C additive, not a CAGE replacement) · [STANDARDS.md](../../../../../../../Reference/engineering/development/STANDARDS.md) · [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md).

---

## ✅ Task Breakdown (Hierarchical)

### 1. Model + index
- [x] ✅ 1.1 Add `auditC` to the alcohol section: three 0–4 answers (`frequency`, `typicalQuantity`, `bingeFrequency`), an optional `enabled`/present marker, derived `total`, and `screenPositive`. Extend `normalize`/`EMPTY_*`/`has…Content`. - **Completed: 2026-06-08**
- [x] ✅ 1.2 Add `AUDIT_C_QUESTIONS` (id, prompt, ordered 0–4 answer labels) + `auditCScore(answers)` + `AUDIT_C_SCREEN_HELPER` + `AUDIT_C_POSITIVE_THRESHOLD` (default 4, overridable per SHv3-D4) to `social-history-indices.ts`, mirroring the CAGE exports. - **Completed: 2026-06-08**

### 2. Serializer + parser
- [x] ✅ 2.1 Serialize `AUDIT-C N/12` (and screen-positive note) into the derived alcohol TEXT when present; keep CAGE output unchanged. - **Completed: 2026-06-08**
- [x] ✅ 2.2 Parse the `AUDIT-C …` segment back into `alcohol.auditC` on round-trip. - **Completed: 2026-06-08**

### 3. UI
- [x] ✅ 3.1 Render an optional AUDIT-C block beside CAGE: full question text, 0–4 option selectors, a live `N/12` badge, screen-positive hint, and the helper text. Neither screen gates the other. - **Completed: 2026-06-08**

### 4. Backend validation
- [x] ✅ 4.1 Add an `auditC` zod object to `socialHistoryAlcoholSectionSchema` (each answer `0..4` int, optional; bounded total) and mirror the type on `AlcoholUseSection`. - **Completed: 2026-06-08**

### 5. Verification & Testing
- [x] ✅ 5.1 Indices unit tests: `auditCScore` for representative answer sets; threshold positivity at the boundary; empty/partial handled. - **Completed: 2026-06-08**
- [x] ✅ 5.2 Serialize/parse round-trip incl. AUDIT-C present + absent; CAGE coexists unchanged. - **Completed: 2026-06-08**
- [x] ✅ 5.3 Component test: block renders, badge updates, screen-positive hint toggles; backend accept/reject; `cd frontend; npx tsc --noEmit` + lint + suites green. - **Completed: 2026-06-08**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
UPDATE: frontend/lib/cockpit/social-history-indices.ts (AUDIT_C_QUESTIONS + auditCScore + helper + threshold)
UPDATE: frontend/lib/cockpit/social-history-alcohol-drinks.ts and/or social-history.ts (auditC model + serialize/parse)
UPDATE: frontend/components/cockpit/rx/subjective/SocialHistoryField.tsx (AUDIT-C block)
UPDATE: backend/src/types/prescription.ts (AlcoholUseSection.auditC)
UPDATE: backend/src/utils/validation.ts (socialHistoryAlcoholSectionSchema.auditC)
UPDATE: relevant *.test.ts(x) (indices, serialize/parse, component, backend validation)
DO NOT TOUCH: migrations (none); PDF (sh-12); standalone maxPerSession (sh-10)
```

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **AUDIT-C ≠ CAGE replacement** (SHv3-D2) — both independent, both optional.
- **Configurable threshold** — default ≥4 positive, exposed as a named constant (sex-specific tuning deferred to sh-11's config seam).
- **No diagnosis text** — passive "screen positive — consider brief intervention" style hint only.
- **No migration** — rides the alcohol JSONB.
- Reuse the CAGE block's interaction + a11y pattern for consistency.

**DO NOT include** code, SQL, or signatures in this file.

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** **Yes (shape only)** — extends `social_history_structured` JSONB (PHI); no new column.
  - [x] **RLS verified?** **Yes** — covered by 026; unchanged.
- [x] **Any PHI in logs?** **No.**
- [x] **External API or AI call?** **No.**
- [x] **Retention / deletion impact?** **No** (inherits prescription retention).

---

## ✅ Acceptance & Verification Criteria

- [x] AUDIT-C captures 3 questions → 0–12 total + screen-positive flag; serializes/round-trips; renders beside CAGE without either gating the other; backend zod accepts/rejects; suites + `tsc`/lint green; no migration.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 📝 Notes

AUDIT-C Q3 (≥6 drinks in one session frequency) overlaps conceptually with sh-10's `maxPerSession`; keep them separate (Q3 is a frequency band, `maxPerSession` is a count) but cross-reference in the UI copy.

Serialized format embeds answers for lossless round-trip: `AUDIT-C 8/12 positive (2,3,3)`.

---

## 🔗 Related Tasks

- [`task-sh-10-binge-and-frequency.md`](./task-sh-10-binge-and-frequency.md) — standalone binge field + finer frequency.
- [`task-sh-11-abv-and-thresholds.md`](./task-sh-11-abv-and-thresholds.md) — owns the configurable-threshold seam AUDIT-C positivity can reuse.

---

**Last Updated:** 2026-06-08  
**Pattern:** additive scored questionnaire cloning the shipped CAGE block.  
**Reference:** `process/CODE_CHANGE_RULES.md` · batch plan SHv3-D2.
