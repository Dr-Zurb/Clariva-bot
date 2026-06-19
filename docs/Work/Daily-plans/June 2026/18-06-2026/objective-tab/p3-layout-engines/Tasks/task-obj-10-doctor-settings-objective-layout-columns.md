# Task obj-10: `doctor_settings` objective layout config columns (migration 152) + API

> **Filename:** `task-obj-10-doctor-settings-objective-layout-columns.md` in `objective-tab/p3-layout-engines/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/`/`backend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).

---

## 📋 Task Overview

Land the persistence + transport for the objective layout engines: four additive **config**
columns on `doctor_settings` (`objective_section_order`, `objective_section_collapsed`,
`objective_section_hidden`, `objective_custom_sections`) in one migration, plus the backend
type / Zod / service GET-PATCH / route and the frontend settings client + cockpit hydration
point. Near-verbatim clone of the shipped subjective `doctor_settings` layout columns
(migrations 145–148). **Config, not PHI.**

**Program / Phase:** objective-tab · Phase 3 (layout engines)  
**Batch:** [`plan-p3-objective-tab-layout-engines-batch.md`](../plan-p3-objective-tab-layout-engines-batch.md)  
**Execution order:** [`EXECUTION-ORDER-p3-objective-tab-layout-engines.md`](./EXECUTION-ORDER-p3-objective-tab-layout-engines.md)  
**Estimated Time:** ~2–3 hours  
**Status:** ✅ **DONE** — **Opus** (hard rule: new migration)

**Change Type:**
- [x] **New feature (additive schema + API)** — four config columns + transport; no existing column/behaviour changed.

**Current State:** (check existing code first!)
- ✅ **What exists:** subjective layout columns on `doctor_settings` — `subjective_section_order` (146), `subjective_section_collapsed` (147), `subjective_section_hidden` (148), `subjective_custom_subsections` (145) — with `jsonb_typeof` CHECKs, doctor-scoped RLS, id-tolerant Zod, and GET/PATCH in `doctor-settings-service.ts`. Latest migration is 151 (Vitals 2.0).
- ❌ **What's missing:** any `objective_*` layout column, type, Zod, service field, route field, or FE client field.

**Scope Guard:**
- Expected files touched: ≤ 7 (migration + BE type + Zod + service + route + FE client/types + migration content-test).
- **No** rendering/engine wiring (obj-11..14), **no** seed logic (obj-14). Storage + transport only. Confirm `152` is the next free migration number at execution time.

**Reference Documentation:**
- [STANDARDS.md](../../../../../../../Reference/engineering/development/STANDARDS.md) · [DATABASE.md](../../../../../../../Reference/engineering/development/DATABASE.md) · [00-agent-contract.mdc] (no `process.env`; Zod-validate all input; typed `AppError`; no DB in controllers).

---

## ✅ Task Breakdown (Hierarchical)

### 1. Migration `152_doctor_settings_objective_layout.sql`
- [x] ✅ 1.1 `ADD COLUMN IF NOT EXISTS` (idempotent) for `objective_section_order JSONB NOT NULL DEFAULT '[]'`, `objective_section_collapsed JSONB NOT NULL DEFAULT '{}'`, `objective_section_hidden JSONB NOT NULL DEFAULT '[]'`, `objective_custom_sections JSONB NOT NULL DEFAULT '[]'`. - **Completed: 2026-06-19**
- [x] ✅ 1.2 `jsonb_typeof` CHECK per column (array/array/array vs object for collapsed), each `DROP/ADD CONSTRAINT IF EXISTS` for idempotency — clone migrations 146/147. - **Completed: 2026-06-19**
- [x] ✅ 1.3 `COMMENT ON COLUMN` marking each **config (not PHI)** — doctor layout preference, no patient data. - **Completed: 2026-06-19**
- [x] ✅ 1.4 RLS unchanged (doctor-scoped policy already covers new columns); documented rollback. - **Completed: 2026-06-19**

### 2. Backend type + Zod + service + route
- [x] ✅ 2.1 Extend the `DoctorSettingsRow` type with the four fields (clone the subjective field types). - **Completed: 2026-06-19**
- [x] ✅ 2.2 Zod: id-tolerant array/map validators (drop unknown `ObjectiveSectionId`s, dedupe, cap size); collapse map keyed by section id → bool. New `backend/src/types/objective-section-order.ts` holds the id set + sanitizers (mirror of subjective). - **Completed: 2026-06-19**
- [x] ✅ 2.3 Service GET returns the four fields (defaulted + read-normalized); PATCH persists each independently (clone `doctor-settings-service.ts` subjective path). No DB access in controllers. - **Completed: 2026-06-19**
- [x] ✅ 2.4 Route exposes the four fields on the existing doctor-settings GET/PATCH surface — the generic `settings-controller` passes the full row + `validatePatchDoctorSettings`, so the SELECT columns + Zod schema + type carry the new fields (no route/controller edit needed). - **Completed: 2026-06-19**

### 3. Frontend transport
- [x] ✅ 3.1 FE `doctor-settings` types (`DoctorSettings` + `PatchDoctorSettingsPayload`) mirror the subjective layout fields; the `getDoctorSettings`/`patchDoctorSettings` client is typed pass-through (no api.ts edit needed). - **Completed: 2026-06-19**
- [x] ✅ 3.2 Cockpit hydration point (`useRxFormProviderSetup.ts`) loads + exposes the four objective settings via `objectiveDefaults` alongside the subjective ones; auto-surfaced through `usePrescriptionFormShell()`. No consumer yet — obj-11/12 consume. - **Completed: 2026-06-19**

### 4. Verification & Testing
- [x] ✅ 4.1 Migration content-sanity test (idempotent adds, CHECKs, config comments, RLS unchanged, rollback documented) — clone the 146/148 migration tests. - **Completed: 2026-06-19**
- [x] ✅ 4.2 Zod round-trip tests (valid arrays/map accepted; unknown ids dropped; oversize capped). - **Completed: 2026-06-19**
- [x] ✅ 4.3 Backend targeted suite green (20 obj-10 + 21 subjective regression); BE `tsc` clean; FE `tsc` clean on touched files. - **Completed: 2026-06-19**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
CREATE: backend/migrations/152_doctor_settings_objective_layout.sql
UPDATE: backend/src/types/doctor-settings.ts
UPDATE: backend/src/utils/validation.ts
UPDATE: backend/src/services/doctor-settings-service.ts
UPDATE: backend/src/api/routes/... (doctor-settings route)
UPDATE: frontend/lib/... (doctor-settings client + types)
CREATE: backend/tests/unit/migrations/152-doctor-settings-objective-layout-migration.test.ts
```

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Config, not PHI** — these are section-id strings + booleans, never patient data. Doctor-scoped, never logged.
- **Clone the subjective columns** — same defaults, CHECK shape, Zod tolerance, service path. Do not invent a new persistence mechanism.
- One migration for all four columns (config clone) keeps the slice atomic; confirm the migration number is free before writing.
- Output untouched (P3-D3) — these columns never reach `buildRxPayload`.

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** **Y** — new `doctor_settings` config columns (non-PHI). Additive, default-backfilled, RLS inherited.
- [x] **Any PHI in logs?** **No** (config strings only).
- [x] **External API or AI call?** **N**.
- [x] **Retention / deletion impact?** **N** (rides existing `doctor_settings` lifecycle).
- [x] **New migration on a doctor-scoped table** → executed on Opus, per the agent contract.

---

## ✅ Acceptance & Verification Criteria

- [x] Migration idempotent; four columns default + `jsonb_typeof` CHECK; RLS unchanged; config-commented.
- [x] Zod tolerant (drop unknown, dedupe, cap); GET/PATCH round-trip each field.
- [x] FE client + hydration expose the four settings; no consumer regression.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 🔗 Related Tasks

- [`task-obj-09-objective-section-registry-and-renderer.md`](./task-obj-09-objective-section-registry-and-renderer.md) — freezes the `ObjectiveSectionId` set these columns store.
- [`task-obj-11-reorder-and-collapse-engines.md`](./task-obj-11-reorder-and-collapse-engines.md) · [`task-obj-12-visibility-and-manage-sections-menu.md`](./task-obj-12-visibility-and-manage-sections-menu.md) — consume the API.

---

**Last Updated:** 2026-06-18  
**Pattern:** subjective `doctor_settings` layout columns (migrations 145–148) + `doctor-settings-service.ts`.  
**Reference:** `process/TASK_MANAGEMENT_GUIDE.md` · `process/PHASED-PLANS-GUIDE.md` §7.
