# Task subj-28: Per-doctor subjective section collapse map (settings column + API)

> **Filename:** `task-subj-28-doctor-settings-collapse-map.md` in `subjective-tab/p9-collapse-persistence/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/`/`backend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7). Same depth as the Phase-7/8 `Tasks/` folders.

---

## 📋 Task Overview

Persist the doctor's open/closed choice for each top-level Subjective section. Add a
`subjective_section_collapsed` JSONB **object** on `doctor_settings` — a map `{ [sectionId]: boolean }`
where `true` = open — validate it against the known section-id set, expose get/set on the
doctor-settings API, and mirror the field on the frontend with an api client. This is the
**storage + transport** slice — no resolver and no UI (subj-29/30/31). It is a near-verbatim clone of
subj-24's `subjective_section_order` path, except the value is a JSONB **object (map)**, not an array.

**Program / Phase:** subjective-tab · Phase 9 (collapse persistence)  
**Batch:** [`plan-p9-subjective-collapse-persistence-batch.md`](../plan-p9-subjective-collapse-persistence-batch.md)  
**Execution order:** [`EXECUTION-ORDER-p9-subjective-collapse-persistence.md`](./EXECUTION-ORDER-p9-subjective-collapse-persistence.md)  
**Estimated Time:** ~2–3 hours  
**Status:** ✅ **DONE** — Completed: 2026-06-18

**Change Type:**
- [ ] **New feature** — additive `doctor_settings` column + API. Follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md).

**Current State:**
- ✅ **What exists:** per-doctor JSONB config precedents `doctor_settings.subjective_section_order` (Phase 8, [migration `146`](../../../../../../../../backend/migrations/146_doctor_settings_subjective_section_order.sql)) + `subjective_custom_subsections` (`145`) + `cockpit_layout_presets`; [`doctor-settings-service.ts`](../../../../../../../../backend/src/services/doctor-settings-service.ts) (SELECT list, `normalizeSubjectiveSectionOrderInRow`, `allowedKeys`, accessors); [`doctor-settings.ts`](../../../../../../../../backend/src/types/doctor-settings.ts); the settings controller/route; [`validation.ts`](../../../../../../../../backend/src/utils/validation.ts) (`subjectiveSectionOrderSchema`); the `SubjectiveSectionId` set in [`subjective-section-order.ts`](../../../../../../../../frontend/lib/cockpit/subjective-section-order.ts).
- ❌ **What's missing:** any stored collapse map or its API.

**Scope Guard:**
- Expected files touched: ≤ 8 (migration; BE settings type; BE validation; BE service; settings controller; FE settings type; FE api client; BE test).
- **No** resolver/merge (subj-29), **no** UI wiring (subj-30), **no** prescription change, **no** `cc`/`hopi`/PDF change.

**Reference Documentation:**
- [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) · [MIGRATIONS_AND_CHANGE.md](../../../../../../../Reference/engineering/development/MIGRATIONS_AND_CHANGE.md) · [STANDARDS.md](../../../../../../../Reference/engineering/development/STANDARDS.md) · [CONTRACTS.md](../../../../../../../Reference/engineering/architecture/CONTRACTS.md).

---

## ✅ Task Breakdown (Hierarchical)

### 1. Migration
- [ ] 1.1 `147_doctor_settings_subjective_section_collapsed.sql`: add `subjective_section_collapsed JSONB NOT NULL DEFAULT '{}'::jsonb` with a `jsonb_typeof(subjective_section_collapsed) = 'object'` CHECK; idempotent (`ADD COLUMN IF NOT EXISTS`, drop+add constraint); column comment (config, not PHI); rollback line.
  - [ ] 1.1.1 Read prior `doctor_settings` migrations (`099`/`112`/`145`/`146`) for shape/RLS/naming first — MIGRATIONS_AND_CHANGE.md.

### 2. Backend type + validation + service + API
- [ ] 2.1 Add `subjectiveSectionCollapsed: Record<string, boolean>` to the doctor-settings type + defaults (`backend/src/types/doctor-settings.ts`); default `{}`.
- [ ] 2.2 `validation.ts`: Zod = `z.record(z.string(), z.boolean())` constrained to the known section-id set — **drop unknown keys** and **skip non-boolean values** rather than reject (a renamed/removed id or a stray value must never brick a save); cap entry count to the registry size.
- [ ] 2.3 `doctor-settings-service.ts`: add to the SELECT column list; add a `normalizeSubjectiveSectionCollapsedInRow` (mirror `normalizeSubjectiveSectionOrderInRow` — coerce non-object → `{}`); add to `allowedKeys` for PATCH; read + upsert accessor.
- [ ] 2.4 Settings controller/route: GET (return in the settings payload) + PATCH (set/replace the map) — via the existing route, no new endpoint.

### 3. Frontend wiring
- [ ] 3.1 Mirror `subjectiveSectionCollapsed` on the frontend doctor-settings type + PATCH payload (`frontend/types/doctor-settings.ts`).
- [ ] 3.2 Api client get/set (no UI yet) — reuse the existing `getDoctorSettings`/`patchDoctorSettings`.

### 4. Verification & Testing
- [ ] 4.1 Test: migration idempotent; default reads back `{}`; RLS doctor-scoped.
- [ ] 4.2 Test: Zod drops unknown keys, skips non-boolean values, preserves valid `id→bool` entries; PATCH round-trips.
- [ ] 4.3 `cd backend && npm test` + `cd frontend && npx tsc --noEmit && npm run lint` clean.

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
CREATE: backend/migrations/147_doctor_settings_subjective_section_collapsed.sql
UPDATE: backend/src/types/doctor-settings.ts (subjectiveSectionCollapsed field + default)
UPDATE: backend/src/utils/validation.ts (record id→bool; drop unknown; skip non-boolean)
UPDATE: backend/src/services/doctor-settings-service.ts (SELECT + normalize + allowedKeys + accessor)
UPDATE: backend/src/controllers/settings-controller.ts (GET/PATCH via existing route)
UPDATE: frontend/types/doctor-settings.ts (mirror + PATCH payload)
UPDATE: frontend/lib/api/... doctor-settings client (get/set passthrough)
CREATE: backend/tests/unit/utils/doctor-settings-subjective-section-collapsed.test.ts
DO NOT TOUCH: prescriptions storage; PDF; cc/hopi; resolver (subj-29); UI (subj-30)
```

**When updating existing code:**
- [ ] Clone the `subjective_section_order` get/upsert + validation path; do not invent a new settings mechanism. The only structural difference is **object (map)** vs array.

**When creating a migration:**
- [ ] Read all previous `doctor_settings` migrations (numeric order) for schema/RLS/naming — MIGRATIONS_AND_CHANGE.md / CODE_CHANGE_RULES.md §4. Highest existing migration is `146` → new file is `147_…`.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Per-doctor default only (P9-D1 / T2-D2).** One value per doctor; doctor-scoped RLS; no clinic sharing.
- **Map of overrides, not a snapshot (P9-D2).** Store `{ sectionId: isOpen }`; the merge against defaults is the client's job (subj-29). The column simply round-trips whatever map it's given (post-validation).
- **Collapse is config, not PHI (P9-D5).** A map of section-id strings → booleans; never logged.
- **Tolerant validation.** Drop unknown keys + skip non-boolean values; never reject a save because a stored id is no longer in the registry.

**DO NOT include** code or signatures.

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** **Yes** — additive `doctor_settings` column (doctor-scoped config, not PHI).
  - [ ] **RLS verified?** existing `doctor_settings` RLS (migration 009) covers all columns; no widening.
- [ ] **Any PHI in logs?** **No** — section ids + booleans only.
- [ ] **External API or AI call?** **No.**
- [ ] **Retention / deletion impact?** **No new patient surface** — config travels with the doctor account.

---

## ✅ Acceptance & Verification Criteria

- [ ] Migration idempotent; per-doctor default `{}`; `jsonb_typeof='object'` CHECK; RLS unchanged.
- [ ] Zod drops unknown keys + skips non-boolean; GET/PATCH round-trip.
- [ ] `tsc`/lint/tests green.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 📝 Notes

The only shape difference vs subj-24 is array → object. Keep validation tolerant (drop unknown keys), because the
client (subj-29) reconciles against the live registry and only ever sends explicit overrides; the server should
never be the thing that rejects a save over a stale id.

---

## 🔗 Related Tasks

- [`task-subj-29-collapse-resolver-and-autosave.md`](./task-subj-29-collapse-resolver-and-autosave.md) — resolves + saves through this API.
- [`task-subj-30-wire-controlled-collapse.md`](./task-subj-30-wire-controlled-collapse.md) — first UI consumer.
- Sibling precedent: [`../../p8-section-reorder/Tasks/task-subj-24-doctor-settings-section-order.md`](../../p8-section-reorder/Tasks/task-subj-24-doctor-settings-section-order.md).

---

**Last Updated:** 2026-06-18  
**Pattern:** per-doctor JSONB config in `doctor_settings` (object/map clone of `subjective_section_order`).  
**Reference:** `process/CODE_CHANGE_RULES.md`
