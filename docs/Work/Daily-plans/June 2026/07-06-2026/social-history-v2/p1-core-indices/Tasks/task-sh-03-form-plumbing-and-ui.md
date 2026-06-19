# Task sh-03: RxForm plumbing + `SocialHistoryField` rewrite (structured UI + live indices)

> **Filename:** `task-sh-03-form-plumbing-and-ui.md` in `social-history-v2/p1-core-indices/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/`/`backend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).

---

## 📋 Task Overview

Wire the structured model into the form and rebuild the UI: add `socialHistoryStructured` to
`RxFormFields` (reducer + hydrate, **prefer JSONB / fall back to TEXT**), make `buildRxPayload`
send the **JSONB + derived TEXT**, and rewrite [`SocialHistoryField.tsx`](../../../../../../../frontend/components/cockpit/rx/subjective/SocialHistoryField.tsx)
with structured Smoking / Smokeless / Alcohol sections — conditional reveal, CAGE 4-toggle,
and **live pack-years + CAGE badges**.

**Program / Phase:** social-history-v2 · Phase 1 (core + indices)  
**Batch:** [`plan-p1-social-history-v2-core-indices-batch.md`](../plan-p1-social-history-v2-core-indices-batch.md)  
**Execution order:** [`EXECUTION-ORDER-p1-social-history-v2-core-indices.md`](./EXECUTION-ORDER-p1-social-history-v2-core-indices.md)  
**Estimated Time:** ~3–4 hours  
**Status:** ✅ `Done`

**Change Type:**
- [x] **New feature** — form state + component rewrite.

**Current State:**
- ✅ **What exists:** v1 [`SocialHistoryField.tsx`](../../../../../../../frontend/components/cockpit/rx/subjective/SocialHistoryField.tsx) (chip rows + notes + favourites in a `CollapsibleContainer`); `socialHistory` TEXT on `RxFormFields` with hydrate + `buildRxPayload`; [`HistoryFields.tsx`](../../../../../../../frontend/components/cockpit/rx/subjective/HistoryFields.tsx) mounts it.
- ✅ **What's missing (was):** the structured field on `RxFormFields`, dual JSONB+TEXT payload, and the structured/indices UI — **now shipped in sh-03**.

**Scope Guard:**
- Expected files touched: ≤ 5 (`RxFormContext.tsx`; `SocialHistoryField.tsx`; maybe `HistoryFields.tsx` mount; component test; minor types). Reuse `NoteFavoritesChipStrip` + `useNoteFavorites` for notes.

**Reference Documentation:**
- Source plan §P1-05 / §P1-07: [`plan-social-history-v2.md`](../../../../../../Product%20plans/ehr/subjective-tab/plan-social-history-v2.md) · [STANDARDS.md](../../../../../../../Reference/engineering/development/STANDARDS.md) · [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md).

---

## ✅ Task Breakdown (Hierarchical)

### 1. Form plumbing
- [x] ✅ 1.1 Add `socialHistoryStructured: SocialHistoryStructured` to `RxFormFields` + `SET_SOCIAL_HISTORY_STRUCTURED` reducer action. - **Completed: 2026-06-07**
- [x] ✅ 1.2 Hydrate from API: prefer `social_history_structured`; else parse legacy `social_history` TEXT (sh-01 fallback). - **Completed: 2026-06-07**
- [x] ✅ 1.3 `buildRxPayload`: send `socialHistoryStructured` (JSONB) **and** `socialHistory = serialize(structured)` (derived TEXT). - **Completed: 2026-06-07**

### 2. UI rewrite
- [x] ✅ 2.1 Smoking section — status chips; on current/ex reveal type chips (multi) + /day + years (+ quit yrs if ex) + live **pack-years** badge. - **Completed: 2026-06-07**
- [x] ✅ 2.2 Smokeless tobacco — same pattern (gutka/khaini/paan/zarda/mishri), no index. - **Completed: 2026-06-07**
- [x] ✅ 2.3 Alcohol — status chips → type chips + units/week + pattern chips + **CAGE** 4-toggle (`Cut down? · Annoyed? · Guilty? · Eye-opener?`) → live **score /4 + "screen positive"** at ≥2. - **Completed: 2026-06-07**
- [x] ✅ 2.4 Notes — `NoteFavoritesChipStrip` + textarea → `notes`; `never` status collapses compactly; preserve `CollapsibleContainer` preview. - **Completed: 2026-06-07**

### 3. Verification & Testing
- [x] ✅ 3.1 `SocialHistoryField.test.tsx` — conditional reveal on status; index badges update; CAGE toggles; notes/favourites; round-trips through `buildRxPayload`. - **Completed: 2026-06-07**
- [x] ✅ 3.2 `cd frontend; npx tsc --noEmit` + lint clean; frontend suite green. - **Completed: 2026-06-07**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
UPDATE: frontend/components/cockpit/rx/RxFormContext.tsx (field + reducer + hydrate + buildRxPayload)
UPDATE: frontend/components/cockpit/rx/subjective/SocialHistoryField.tsx (structured rewrite)
UPDATE (if needed): frontend/components/cockpit/rx/subjective/HistoryFields.tsx (mount)
UPDATE/CREATE: SocialHistoryField test
DO NOT TOUCH: backend (sh-02); Phase-2 dimensions
```

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Dual write** — always send JSONB + derived TEXT so legacy/PDF readers keep working (SHv2-D1).
- **Indices live + derived** — compute from `social-history-indices.ts`; never persist (SHv2-D3).
- **Reuse, don't reinvent** — `CollapsibleContainer`, chip styles, `RX_FIELD_INPUT_CLASS`, `NoteFavoritesChipStrip`, `useNoteFavorites` (field key `socialHistory`).
- **No card-collapse regressions** — no `onBlur`/`onMouseDown preventDefault` heuristics (per the prior permanent fix).
- Autosave continues to fire on change.

**DO NOT include** code, SQL, or signatures in this file.

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** **Yes (write path only)** — form sends structured PHI to the sh-02 column.
  - [x] **RLS verified?** **Yes** — server-side via 026 (no new client trust).
- [x] **Any PHI in logs?** **No.**
- [x] **External API or AI call?** **No.**
- [x] **Retention / deletion impact?** **No** (inherits prescription retention).

---

## ✅ Acceptance & Verification Criteria

- [x] Structured Smoking/Smokeless/Alcohol capture + live pack-years + CAGE; saves JSONB + derived TEXT; reopens from JSONB; legacy rows hydrate from TEXT; `tsc`/lint + suite green; no collapse regression.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 📝 Notes

Depends on sh-01 (model/indices) and sh-02 (payload contract). Phase-2 dimensions slot into the same component later. Legacy preset/carry-forward TEXT paths still sync structured state via `SET_FIELD` hydration until sh-04.

---

## 🔗 Related Tasks

- [`task-sh-01-data-model-and-indices.md`](./task-sh-01-data-model-and-indices.md) · [`task-sh-02-migration-and-backend.md`](./task-sh-02-migration-and-backend.md).
- [`task-sh-04-integration-a11y-and-gate.md`](./task-sh-04-integration-a11y-and-gate.md) — carry-forward/presets + gate.

---

**Last Updated:** 2026-06-07  
**Pattern:** structured field on `RxFormFields` + derived TEXT (like `complaints` → `cc`/`hopi`).  
**Reference:** `process/CODE_CHANGE_RULES.md` · source plan §P1-05 / §P1-07.
