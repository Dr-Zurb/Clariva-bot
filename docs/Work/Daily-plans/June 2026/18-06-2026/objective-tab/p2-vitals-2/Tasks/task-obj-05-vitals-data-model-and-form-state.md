# Task obj-05: Vitals 2.0 data model (migration 151) + backend type/Zod/service + form state

> **Filename:** `task-obj-05-vitals-data-model-and-form-state.md` in `objective-tab/p2-vitals-2/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/`/`backend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7). Same depth as the Phase-1 `Tasks/` folder.

---

## 📋 Task Overview

Introduce the Vitals 2.0 keystone: additive typed extended-vitals columns on `prescriptions`
(RR, pain score, glucose, GCS total, BP posture/limb, peds HC/MUAC, waist), their backend
type + Zod range validation + service mapping, and the matching numeric/text form state on
`RxFormFields` with `buildRxPayload` mapping. This is the **schema + shared-state** slice —
no grid UI (obj-07), no registry/calculators (obj-06). It clones migration 103's nullable-
numeric + CHECK-range + PHI-comment vitals pattern; everything is **canonical units** (P2-D2)
and **additive only** (P2-D6).

**Program / Phase:** objective-tab · Phase 2 (Vitals 2.0)  
**Batch:** [`plan-p2-objective-tab-vitals-2-batch.md`](../plan-p2-objective-tab-vitals-2-batch.md)  
**Execution order:** [`EXECUTION-ORDER-p2-objective-tab-vitals-2.md`](./EXECUTION-ORDER-p2-objective-tab-vitals-2.md)  
**Estimated Time:** ~3–4 hours  
**Status:** ✅ **COMPLETE** — 2026-06-19

**Change Type:**
- [ ] **Update existing** — additive migration + additive form-state/mapping. Follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md).

**Current State:** (check existing code first!)
- ✅ **What exists:** 7 `vitals_*` columns + CHECK ranges (migration 103); `VitalsGrid` reads `vitalsBpSystolic`/`vitalsBpDiastolic`/`vitalsHr`/`vitalsTempC`/`vitalsSpo2`/`vitalsWtKg`/`vitalsHtCm` off `RxFormFields` via `setField`; `buildRxPayload` maps those to `vitals_*`; the prescription BE type, vitals Zod, and service mappers.
- ❌ **What's missing:** any extended-vitals column, type, validation, form state, or mapping.

**Scope Guard:**
- Expected files touched: ≤ 8 (migration; BE prescription type; BE Zod/validation; BE service mapping; FE `RxFormContext` fields+defaults+hydration+`buildRxPayload`; FE prescription type mirror; BE test; FE test).
- **No** grid UI (obj-07), **no** `vitals-schema.ts`/`vitals-derive.ts` (obj-06), **no** exam-card change, **no** removal of the existing 7 vitals / BMI / `vitalsText`.

**Reference Documentation:**
- [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) · [MIGRATIONS_AND_CHANGE.md](../../../../../../../Reference/engineering/development/MIGRATIONS_AND_CHANGE.md) · [STANDARDS.md](../../../../../../../Reference/engineering/development/STANDARDS.md) · [CONTRACTS.md](../../../../../../../Reference/engineering/architecture/CONTRACTS.md) · [COMPLIANCE.md](../../../../../../../Reference/engineering/compliance/COMPLIANCE.md).

---

## ✅ Task Breakdown (Hierarchical)

### 1. Migration
- [x] ✅ 1.1 `151_prescriptions_vitals_2.sql`: `ADD COLUMN IF NOT EXISTS` for `vitals_rr INTEGER`, `vitals_pain_score INTEGER`, `vitals_glucose_mg_dl NUMERIC(5,1)`, `vitals_gcs_total INTEGER`, `vitals_bp_posture TEXT`, `vitals_bp_limb TEXT`, `vitals_head_circumference_cm NUMERIC(4,1)`, `vitals_muac_cm NUMERIC(4,1)`, `vitals_waist_cm NUMERIC(5,1)` — all `NULL` (= not recorded). - **Completed: 2026-06-19**
  - [x] ✅ 1.1.1 CHECK ranges (drop/add, migration-103 pattern): RR 0–120; pain 0–10; glucose 10–1500 mg/dL; GCS 3–15; HC 10–80 cm; MUAC 5–60 cm; waist 20–300 cm. Posture/limb constrained to a small allowed set (`sitting`/`standing`/`supine`; `left_arm`/`right_arm`/`left_leg`/`right_leg`). - **Completed: 2026-06-19**
  - [x] ✅ 1.1.2 PHI column comments (each is PHI; clinic-canonical units noted); idempotent; rollback line (documented, not shipped). RLS unchanged (migration 026 `auth.uid() = doctor_id` covers new columns). - **Completed: 2026-06-19**

### 2. Backend type + validation + service
- [x] ✅ 2.1 Add the new fields to the prescription type + the structured create/update input (canonical units; nullable). - **Completed: 2026-06-19**
- [x] ✅ 2.2 Zod range validation mirroring the existing vitals fields: numeric bounds per 1.1.1; posture/limb as `z.enum(...)`; out-of-range → ValidationError (matches existing vitals precedent — reject out of range). - **Completed: 2026-06-19**
- [x] ✅ 2.3 Service insert + update mapping for each new column (get uses `select('*')`). - **Completed: 2026-06-19**

### 3. Frontend shared state
- [x] ✅ 3.1 New `RxFormFields` keys (`vitalsRr`, `vitalsPainScore`, `vitalsGlucoseMgDl`, `vitalsGcsTotal`, `vitalsBpPosture`, `vitalsBpLimb`, `vitalsHeadCircumferenceCm`, `vitalsMuacCm`, `vitalsWaistCm`); defaults `null`; hydrate from the loaded prescription. - **Completed: 2026-06-19**
- [x] ✅ 3.2 `buildRxPayload` maps each new field to its `vitals_*` column (canonical value; `null` when unset). No derivation — vitals are stored directly (units convert at the display edge in obj-07). - **Completed: 2026-06-19**
- [x] ✅ 3.3 FE prescription type mirror updated. - **Completed: 2026-06-19**

### 4. Verification & Testing
- [x] ✅ 4.1 Migration content-sanity test (idempotent ADD/CHECK, allowed-value sets, PHI comments, RLS unchanged, rollback) — mirrors the migration-150 test. - **Completed: 2026-06-19**
- [x] ✅ 4.2 Zod tests: in-range accepted, out-of-range rejected, posture/limb enum, null passthrough. - **Completed: 2026-06-19**
- [x] ✅ 4.3 `buildRxPayload`/hydration tests for the new fields (round-trip; existing 7 vitals unchanged). - **Completed: 2026-06-19**
- [x] ✅ 4.4 Backend `tsc` + targeted jest green (61 pass); frontend vitals + sibling vitest green (20 pass); eslint clean on touched regions. (Pre-existing repo-wide debt left untouched.) - **Completed: 2026-06-19**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
CREATE: backend/migrations/151_prescriptions_vitals_2.sql
UPDATE: backend/src/types/prescription.ts (extended vitals fields + input type)
UPDATE: backend/src/utils/validation.ts (extended vitals Zod ranges + posture/limb enums)
UPDATE: backend/src/services/prescription-service.ts (select + insert/update mapping)
UPDATE: frontend/components/cockpit/rx/RxFormContext.tsx (new vitals fields, defaults, hydration, buildRxPayload mapping)
UPDATE: frontend/types/prescription.ts (mirror extended vitals on the FE prescription type)
CREATE/UPDATE: backend + frontend unit tests
```

**When creating a migration:** (MANDATORY)
- [ ] Read all previous migrations (numeric order) for schema/naming/RLS/triggers — [MIGRATIONS_AND_CHANGE.md](../../../../../../../Reference/engineering/development/MIGRATIONS_AND_CHANGE.md) + [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) §4. Confirm 151 is the next free number.

**When updating existing code:** (MANDATORY)
- [ ] Audit `buildRxPayload` callers (autosave + send) and the vitals read path before adding mappings.
- [ ] Map the change concretely; remove no existing behaviour (P2-D6 additive-only).

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- Never read `process.env` directly — `config/env.ts`. Validate all external input with Zod before the service (agent contract).
- Every new `vitals_*` column is **PHI** — doctor-scoped RLS, never logged (COMPLIANCE.md).
- **Canonical storage only** (P2-D2): columns hold °C / kg / cm / mg/dL; unit conversion is a display concern handled in obj-07, never here.
- Additive only (P2-D6): the 7 shipped vitals, the BMI badge, and `vitalsText` stay.
- GCS = total only in P2 (3–15); no E/V/M sub-fields. Glucose stored as **mg/dL**.

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** **Y** → [ ] **RLS verified?** (new columns on `prescriptions`, covered by migration 026 doctor-scoped policy — confirm)
- [ ] **Any PHI in logs?** MUST be **No** (vitals are PHI).
- [ ] **External API or AI call?** **N**.
- [ ] **Retention / deletion impact?** **N** (additive columns on an existing row; soft-delete inherited).

---

## ✅ Acceptance & Verification Criteria

- [ ] All extended `vitals_*` columns exist, idempotent, CHECK-ranged, PHI-commented, RLS doctor-scoped; `NULL` default.
- [ ] New vitals round-trip through BE type + Zod + service.
- [ ] New form-state keys exist, default `null`, hydrate from a loaded prescription, and map in `buildRxPayload`.
- [ ] Existing 7 vitals + BMI badge behaviour unchanged.
- [ ] Response contracts respected ([CONTRACTS.md](../../../../../../../Reference/engineering/architecture/CONTRACTS.md)); tests added ([TESTING.md](../../../../../../../Reference/engineering/development/TESTING.md)); no PHI in logs.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 🔗 Related Tasks

- [`task-obj-06-vitals-schema-and-derived-calculators.md`](./task-obj-06-vitals-schema-and-derived-calculators.md) — the registry/calculators that read this field set.
- [`task-obj-07-vitals-grid-2-ui.md`](./task-obj-07-vitals-grid-2-ui.md) — consumes the new form state.
- [`task-obj-08-vitals-close-gate.md`](./task-obj-08-vitals-close-gate.md) — proves unit round-trip + no regression to the shipped vitals.

---

**Last Updated:** 2026-06-18  
**Pattern:** Migration 103 structured-vitals (`vitals_*` + CHECK) extended; P1 `obj-01` form-state shape.  
**Reference:** `process/TASK_MANAGEMENT_GUIDE.md` · `process/PHASED-PLANS-GUIDE.md` §7.
