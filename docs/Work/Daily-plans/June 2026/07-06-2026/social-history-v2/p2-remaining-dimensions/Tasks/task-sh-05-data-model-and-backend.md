# Task sh-05: extend structured model + serializer/parser + backend zod (9 dimensions, legacy-notes promotion)

> **Filename:** `task-sh-05-data-model-and-backend.md` in `social-history-v2/p2-remaining-dimensions/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/`/`backend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).

---

## 📋 Task Overview

Land the **data layer** for Phase 2: extend `SocialHistoryStructured` with nine dimensions
(substances / diet / activity / occupation+exposures / living / travel / sleep / stress /
gated sexual), extend the serializer / parser / `normalize` / `hasSocialHistoryStructuredContent`,
**promote** the diet/activity/occupation that Phase 1 hydration parked in `notes` back into
structured fields (SHv2-D7), and mirror the shape in the backend types + zod schema. **No
migration** — the JSONB column is already flexible (SHv2-D6).

**Program / Phase:** social-history-v2 · Phase 2 (remaining dimensions)  
**Batch:** [`plan-p2-social-history-v2-remaining-dimensions-batch.md`](../plan-p2-social-history-v2-remaining-dimensions-batch.md)  
**Execution order:** [`EXECUTION-ORDER-p2-social-history-v2-remaining-dimensions.md`](./EXECUTION-ORDER-p2-social-history-v2-remaining-dimensions.md)  
**Estimated Time:** ~2–3 hours  
**Status:** ✅ `Done`

**Change Type:**
- [x] **New feature** — additive model + validation (no schema migration).

**Current State:**
- ✅ **What exists:** Phase-1 `SocialHistoryStructured` (smoking/smokeless/alcohol/notes) + serializer/parser in [`social-history.ts`](../../../../../../../frontend/lib/cockpit/social-history.ts); backend interface in [`prescription.ts`](../../../../../../../backend/src/types/prescription.ts) + `socialHistoryStructuredSchema` in [`validation.ts`](../../../../../../../backend/src/utils/validation.ts).
- ✅ **What's missing (was):** the nine dimension keys, their serialize/parse, the notes→structured promotion, and the backend zod/type sections — **now shipped in sh-05**.

**Scope Guard:**
- Expected files touched: ≤ 5 (`social-history.ts`; `__tests__/social-history.test.ts`; `prescription.ts` types; `validation.ts`; one backend test). **No** migration, **no** UI (sh-06/07).

**Reference Documentation:**
- Source plan **Phase 2 §** (shape + serializer + SHv2-D6..D9): [`plan-social-history-v2.md`](../../../../../../Product%20plans/ehr/subjective-tab/plan-social-history-v2.md) · [STANDARDS.md](../../../../../../../Reference/engineering/development/STANDARDS.md) · [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md).

---

## ✅ Task Breakdown (Hierarchical)

### 1. Type + model
- [x] ✅ 1.1 Append the nine dimension keys to `SocialHistoryStructured` (frontend `social-history.ts` + backend `prescription.ts`) per the source-plan shape. - **Completed: 2026-06-07**
- [x] ✅ 1.2 Extend `normalizeSocialHistoryStructured` + `hasSocialHistoryStructuredContent` + `EMPTY_*` to cover the new keys. - **Completed: 2026-06-07**

### 2. Serializer + parser
- [x] ✅ 2.1 Extend `serializeStructuredSocialHistory` with the new sections (fixed order; gated `sexual` only when enabled + filled; `iv` route hint). - **Completed: 2026-06-07**
- [x] ✅ 2.2 Extend `parseStructuredSocialHistoryText` to read the new `Label: …` segments back into structured. - **Completed: 2026-06-07**
- [x] ✅ 2.3 **Promotion (SHv2-D7):** parse diet/activity/occupation out of `notes` (and legacy `V1_PHASE2_DIMENSIONS` hydration) into their structured fields; genuine free-text remains in `notes` — lossless. - **Completed: 2026-06-07**

### 3. Backend validation
- [x] ✅ 3.1 Add zod sections for the nine dimensions to `socialHistoryStructuredSchema` (enums, bounded numbers, capped string/array lengths, `sexual.enabled` boolean) — applies to create + update (both reference the shared schema). - **Completed: 2026-06-07**

### 4. Verification & Testing
- [x] ✅ 4.1 `social-history.test.ts` — serialize/parse round-trip for each new dimension; gated sexual omitted until enabled; notes-promotion lossless; existing Phase-1 tests stay green. - **Completed: 2026-06-07**
- [x] ✅ 4.2 Backend validation accept/reject for the new sections; `cd frontend; npx tsc --noEmit` + lint + suites green (backend too). - **Completed: 2026-06-07**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
UPDATE: frontend/lib/cockpit/social-history.ts (9 keys + serialize/parse + notes promotion)
UPDATE: frontend/lib/cockpit/__tests__/social-history.test.ts
UPDATE: backend/src/types/prescription.ts (SocialHistoryStructured)
UPDATE: backend/src/utils/validation.ts (socialHistoryStructuredSchema sections)
UPDATE/CREATE: backend test for the new validation sections
DO NOT TOUCH: migrations (none needed); SocialHistoryField UI (sh-06/07); indices (none added)
```

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **No migration** (SHv2-D6) — JSONB is flexible + app-validated; do not add a column.
- **Lossless notes promotion** (SHv2-D7) — never drop free-text; only lift recognised dimension tokens.
- **Gated sexual** (SHv2-D8) — serialize only when `enabled` and a sub-field is set.
- **No new indices** (SHv2-D9).
- Keep Phase-1 export names + behaviour intact; this is additive.

**DO NOT include** code, SQL, or signatures in this file.

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** **Yes (shape only)** — extends the existing `social_history_structured` JSONB (PHI); no new column.
  - [x] **RLS verified?** **Yes** — covered by 026; unchanged.
- [x] **Any PHI in logs?** **No.**
- [x] **External API or AI call?** **No.**
- [x] **Retention / deletion impact?** **No** (inherits prescription retention).

---

## ✅ Acceptance & Verification Criteria

- [x] All nine dimensions serialize/parse round-trip; notes-promotion lossless; gated sexual omitted until enabled; backend zod accepts/rejects correctly; no migration; suites + `tsc`/lint green.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 📝 Notes

Freezes the extended shape for sh-06/07 UI. The promotion step retires the Phase-1 `V1_PHASE2_DIMENSIONS`→notes shim.

---

## 🔗 Related Tasks

- [`task-sh-06-ui-lifestyle-and-context.md`](./task-sh-06-ui-lifestyle-and-context.md) · [`task-sh-07-ui-wellbeing-and-sexual-history.md`](./task-sh-07-ui-wellbeing-and-sexual-history.md) — consume this shape.

---

**Last Updated:** 2026-06-07  
**Pattern:** additive extension of the Phase-1 structured model + zod schema.  
**Reference:** `process/CODE_CHANGE_RULES.md` · source plan Phase 2 §.
