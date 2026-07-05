# Task vit-04: Frontend form-state + `buildRxPayload` wiring for json-backed vitals

> **Filename:** `task-vit-04-form-state-payload-wiring.md` in `vitals-section/Tasks/`.
> **Relative-link note:** `process/` = five `../`; `Reference/` = six; `frontend/`/`backend/` = seven.

---

## 📋 Task Overview

Thread the json-backed vitals through the cockpit form-state so they load, edit, and save exactly like the
shipped column vitals — without disturbing byte-parity. Extend `RxFormFields` + `buildRxPayload` +
the load/serialize path (`rxFormFieldsFromPrescription`) so a `storage: "json"` vital reads/writes through
`vitals_json`, while keeping the **canonical-unit discipline** (P2-D2: form-state stores canonical, display
converts at the edge). Round-trip stable; existing column vitals untouched.

**Program / Phase:** vitals-section · VP1 (catalog + storage foundation)  
**Batch:** [`../plan-vitals-section-batch.md`](../plan-vitals-section-batch.md)  
**Execution order:** [`EXECUTION-ORDER-vitals-section.md`](./EXECUTION-ORDER-vitals-section.md)  
**Estimated Time:** ~2–4 hours  
**Status:** ✅ **Done** (2026-06-20).

**Change Type:**
- [x] **Update existing** — `RxFormContext` form-state + payload + load/serialize. Follow [`../../../../process/CODE_CHANGE_RULES.md`](../../../../process/CODE_CHANGE_RULES.md).

**Current State:** (check existing code first!)
- ✅ **What exists:** `RxFormFields` with the 14 column vital keys; `buildRxPayload`; `rxFormFieldsFromPrescription`; the vit-03 `vitals_json` contract + types.
- ✅ **What's missing:** ~~form-state keys + load/serialize for json-backed vitals; payload byte-parity proof under the new fields.~~ **Shipped (see artifacts below).**

**Scope Guard:**
- Expected files touched: ≤ 3 (`RxFormContext.tsx` form-state/payload/load + a parity-ish test). **No** grid UI (vit-05/06), **no** visibility (VP3), **no** trends (VP4), **no** backend (vit-03).
- Keep the existing column vital keys + their payload mapping **byte-stable**.

**Reference Documentation:**
- [`../../../../process/CODE_CHANGE_RULES.md`](../../../../process/CODE_CHANGE_RULES.md) · [`../../../../../Reference/engineering/development/STANDARDS.md`](../../../../../Reference/engineering/development/STANDARDS.md).

---

## ✅ Task Breakdown (Hierarchical)

### 1. Form-state keys
- [x] ✅ 1.1 Add the json-backed vitals to `RxFormFields` (canonical units, nullable), keyed consistently with the registry; existing column keys unchanged. - **Completed: 2026-06-20**
- [x] ✅ 1.2 `createEmptyRxFormFields` seeds them null; `setField` works uniformly (no special path per storage). - **Completed: 2026-06-20**

### 2. Load + serialize
- [x] ✅ 2.1 `rxFormFieldsFromPrescription` hydrates json-backed vitals from `vitals_json` (and column vitals from columns) per the registry `storage` flag. - **Completed: 2026-06-20**
- [x] ✅ 2.2 `buildRxPayload` writes json-backed vitals back into the `vitals_json` shape and column vitals into their columns — never both; round-trip (load→save) stable. - **Completed: 2026-06-20**

### 3. Byte-parity guard
- [x] ✅ 3.1 For a fixture using **only** column vitals, `buildRxPayload` is **byte-identical** to today (json vitals absent ⇒ `vitalsJson` omitted, no new keys leak). - **Completed: 2026-06-20**
- [x] ✅ 3.2 A fixture with json vitals round-trips: load→save→reload→save fixed point. - **Completed: 2026-06-20**

### 4. Verification & Testing
- [x] ✅ 4.1 Unit test the parity guard + round-trip; canonical-unit storage (no display unit leaks into payload). - **Completed: 2026-06-20**
- [x] ✅ 4.2 `frontend tsc` + lint clean; targeted vitest green (41 vitals slice tests). - **Completed: 2026-06-20**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
UPDATE: frontend/components/cockpit/rx/RxFormContext.tsx (RxFormFields + buildRxPayload + load/serialize)
CREATE/UPDATE: a payload parity + round-trip test
DO NOT TOUCH: grid UI (vit-05/06); visibility (VP3); trends (VP4); backend (vit-03)
```

**When updating existing code:**
- [x] Column-vital payload mapping stays byte-stable; json vitals are additive.
- [x] Canonical units only in form-state/payload (P2-D2) — display conversion stays in the field components.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Byte-parity for column-only rows** — no new payload keys when no json vital is set.
- **One home per value** (registry `storage`) — column vitals never duplicate into `vitals_json`.
- **Canonical units** in form-state (P2-D2).

**DO NOT include** code or signatures.

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** **No schema** — form-state/payload wiring over the vit-02/03 contract.
  - [x] **RLS verified?** **N/A** (frontend form-state).
- [x] **Any PHI in logs?** **No** — never log vital values.
- [x] **External API or AI call?** **No.**
- [x] **Retention / deletion impact?** **No.**

> **No STOP/Opus gate** — frontend wiring over a frozen contract; byte-parity asserted.

---

## ✅ Acceptance & Verification Criteria

- [x] Json-backed vitals load/edit/save through form-state like column vitals; one home per value.
- [x] Column-only fixture byte-identical payload; json fixture round-trips stably.
- [x] `tsc`/lint/tests green for the slice.

**See also:** [`../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md`](../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 📝 Notes

Closes VP1: after this the form-state speaks the full catalog, so VP2 just renders it, VP3 just hides/shows it, and VP4 just trends it — none of them touch storage again.

**Shipped artifacts:**
- `RxFormContext.tsx` — 20 flat json vital keys on `RxFormFields`; `createEmptyRxFormFields` / `rxFormFieldsFromPrescription` / `buildRxPayload` wired (omit `vitalsJson` when empty for byte-parity).
- `vitals-json.ts` — `createEmptyJsonVitalFields`, `hydrateJsonVitalFields`, `serializeVitalsJsonFromFields`, `pickJsonVitalFields`, `hasVitalsJsonContent`.
- `types/prescription.ts` — `vitalsJson?` on `StructuredSoapPayload`.
- `rxFormContext.vitalsJson.test.ts` — parity guard + round-trip tests.

---

## 🔗 Related Tasks

- [`task-vit-03-vitals-json-contract-and-derived-text.md`](./task-vit-03-vitals-json-contract-and-derived-text.md) — the backend contract this mirrors in form-state.
- [`task-vit-05-grouped-vitals-grid.md`](./task-vit-05-grouped-vitals-grid.md) — first consumer of the new form-state keys.

---

**Last Updated:** 2026-06-20  
**Pattern:** additive form-state/payload wiring with byte-parity guard; canonical-unit discipline (P2-D2).  
**Reference:** `process/CODE_CHANGE_RULES.md`
