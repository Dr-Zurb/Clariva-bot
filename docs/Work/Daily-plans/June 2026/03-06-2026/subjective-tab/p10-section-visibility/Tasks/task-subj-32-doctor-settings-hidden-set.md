# Task subj-32: Per-doctor subjective section hidden set (settings column + API)

> **Filename:** `task-subj-32-doctor-settings-hidden-set.md` in `subjective-tab/p10-section-visibility/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/`/`backend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7). Same depth as the Phase-7/8/9 `Tasks/` folders.

---

## 📋 Task Overview

Persist the doctor's hidden top-level Subjective sections. Add a `subjective_section_hidden` JSONB **array** on
`doctor_settings` — a delta set of static `SubjectiveSectionId` strings that the doctor has hidden — validate it
against the known section-id set, expose get/set on the doctor-settings API, and mirror the field on the frontend
with an api client. This is the **storage + transport** slice — no resolver and no UI (subj-33/34/35). It is a
near-verbatim clone of subj-24's `subjective_section_order` path (both are arrays); the only new logic is tolerant
id validation.

**Program / Phase:** subjective-tab · Phase 10 (section visibility)  
**Batch:** [`plan-p10-subjective-section-visibility-batch.md`](../plan-p10-subjective-section-visibility-batch.md)  
**Execution order:** [`EXECUTION-ORDER-p10-subjective-section-visibility.md`](./EXECUTION-ORDER-p10-subjective-section-visibility.md)  
**Estimated Time:** ~2–3 hours  
**Status:** ✅ **DONE** — Completed: 2026-06-18

**Change Type:**
- [x] **New feature** — additive `doctor_settings` column + API. Follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md).

**Current State:**
- ✅ **What exists:** per-doctor JSONB config precedents `doctor_settings.subjective_section_order` (Phase 8, [migration `146`](../../../../../../../../backend/migrations/146_doctor_settings_subjective_section_order.sql)) + `subjective_section_collapsed` (Phase 9, [migration `147`](../../../../../../../../backend/migrations/147_doctor_settings_subjective_section_collapsed.sql)) + `subjective_custom_subsections` (`145`); [`doctor-settings-service.ts`](../../../../../../../../backend/src/services/doctor-settings-service.ts) (SELECT list, `normalizeSubjectiveSectionOrderInRow` / `normalizeSubjectiveSectionCollapsedInRow`, `allowedKeys`, accessors); [`doctor-settings.ts`](../../../../../../../../backend/src/types/doctor-settings.ts); the settings controller/route; [`validation.ts`](../../../../../../../../backend/src/utils/validation.ts) (`subjectiveSectionOrderSchema`, `subjectiveSectionCollapsedSchema`); the `SubjectiveSectionId` set in [`subjective-section-order.ts`](../../../../../../../../frontend/lib/cockpit/subjective-section-order.ts).
- ❌ **What's missing:** any stored hidden set or its API.

**Scope Guard:**
- Expected files touched: ≤ 8 (migration; BE settings type; BE validation; BE service; settings controller; FE settings type; FE api client; BE test).
- **No** resolver/filter (subj-33), **no** UI/menu (subj-34), **no** prescription change, **no** `cc`/`hopi`/PDF change.

**Reference Documentation:**
- [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) · [MIGRATIONS_AND_CHANGE.md](../../../../../../../Reference/engineering/development/MIGRATIONS_AND_CHANGE.md) · [STANDARDS.md](../../../../../../../Reference/engineering/development/STANDARDS.md) · [CONTRACTS.md](../../../../../../../Reference/engineering/architecture/CONTRACTS.md).

---

## ✅ Task Breakdown (Hierarchical)

### 1. Migration
- [x] ✅ 1.1 `148_doctor_settings_subjective_section_hidden.sql`: add `subjective_section_hidden JSONB NOT NULL DEFAULT '[]'::jsonb` with a `jsonb_typeof(subjective_section_hidden) = 'array'` CHECK; idempotent (`ADD COLUMN IF NOT EXISTS`, drop+add constraint); column comment (config, not PHI; view-only — does not affect cc/hopi/PDF); rollback line. - **Completed: 2026-06-18**
  - [x] ✅ 1.1.1 Read prior `doctor_settings` migrations (`145`/`146`/`147`) for shape/RLS/naming first — MIGRATIONS_AND_CHANGE.md. Highest existing migration is `147` → new file is `148_…`. - **Completed: 2026-06-18**

### 2. Backend type + validation + service + API
- [x] ✅ 2.1 Add `subjective_section_hidden: string[]` to the doctor-settings type + defaults (`backend/src/types/doctor-settings.ts`); default `[]`. - **Completed: 2026-06-18**
- [x] ✅ 2.2 `validation.ts`: `subjectiveSectionHiddenSchema` = `z.array(z.string())` capped to the registry size, transformed via `sanitizeSubjectiveSectionHidden` — **drops unknown / non-static ids** (custom_block too) and **dedupes** rather than rejecting. Mirrors `subjectiveSectionOrderSchema`'s tolerance. - **Completed: 2026-06-18**
- [x] ✅ 2.3 `doctor-settings-service.ts`: added to the SELECT column list + `DEFAULT_SETTINGS`; added `normalizeSubjectiveSectionHiddenInRow` (coerce non-array → `[]`, drop non-string / unknown ids) into `normalizeDoctorSettingsApiRow`; added to `allowedKeys` + PATCH validation block + payload type. - **Completed: 2026-06-18**
- [x] ✅ 2.4 Settings PATCH/GET via the existing `patchDoctorSettingsSchema` route — no new endpoint. - **Completed: 2026-06-18**

### 3. Frontend wiring
- [x] ✅ 3.1 Mirrored `subjective_section_hidden?: StaticSubjectiveSectionId[]` on the frontend doctor-settings type + PATCH payload (`frontend/types/doctor-settings.ts`). - **Completed: 2026-06-18**
- [x] ✅ 3.2 Api client get/set reuses the existing `getDoctorSettings`/`patchDoctorSettings` (typed passthrough; no UI yet). - **Completed: 2026-06-18**

### 4. Verification & Testing
- [x] ✅ 4.1 Migration mirrors `146`/`147` (idempotent ADD COLUMN IF NOT EXISTS + drop/add CHECK; default `[]`; RLS unchanged via migration 009). - **Completed: 2026-06-18**
- [x] ✅ 4.2 Test `doctor-settings-subjective-section-hidden.test.ts`: Zod drops unknown + custom_block ids, dedupes, preserves valid ids, caps length, rejects unknown PATCH keys. - **Completed: 2026-06-18**
- [x] ✅ 4.3 `backend` tests + `tsc --noEmit` green; backend lint + frontend `tsc` clean for touched files (pre-existing repo-wide errors untouched). - **Completed: 2026-06-18**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
CREATE: backend/migrations/148_doctor_settings_subjective_section_hidden.sql
UPDATE: backend/src/types/doctor-settings.ts (subjectiveSectionHidden field + default)
UPDATE: backend/src/utils/validation.ts (array of ids; drop unknown; dedupe; cap)
UPDATE: backend/src/services/doctor-settings-service.ts (SELECT + normalize + allowedKeys + accessor)
UPDATE: backend/src/controllers/settings-controller.ts (GET/PATCH via existing route)
UPDATE: frontend/types/doctor-settings.ts (mirror + PATCH payload)
UPDATE: frontend/lib/api/... doctor-settings client (get/set passthrough)
CREATE: backend/tests/unit/utils/doctor-settings-subjective-section-hidden.test.ts
DO NOT TOUCH: prescriptions storage; PDF; cc/hopi; resolver (subj-33); UI/menu (subj-34)
```

**When updating existing code:**
- [ ] Clone the `subjective_section_order` get/upsert + validation path; do not invent a new settings mechanism. Both are arrays — the only difference is the semantics (hidden delta vs order).

**When creating a migration:**
- [ ] Read all previous `doctor_settings` migrations (numeric order) for schema/RLS/naming — MIGRATIONS_AND_CHANGE.md / CODE_CHANGE_RULES.md §4. Highest existing migration is `147` → new file is `148_…`.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Per-doctor default only (P10-D1 / T2-D2).** One value per doctor; doctor-scoped RLS; no clinic sharing.
- **Delta set of hidden ids, not a snapshot (P10-D2).** Store only hidden ids; the filter against the render plan is the client's job (subj-33). The column round-trips whatever array it's given (post-validation).
- **Static ids only (P10-D4).** Never persist `custom_block:*` — enforced client-side (subj-33); the server validation drops anything not in the static registry anyway.
- **Visibility is config, not PHI (P10-D5).** An array of section-id strings; never logged.
- **View-only (P10-D6).** This column never feeds `buildRxPayload`; it's a pure render concern.
- **Tolerant validation.** Drop unknown ids + dedupe; never reject a save because a stored id is no longer in the registry.

**DO NOT include** code or signatures.

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** **Yes** — additive `doctor_settings` column (doctor-scoped config, not PHI).
  - [ ] **RLS verified?** existing `doctor_settings` RLS (migration 009) covers all columns; no widening.
- [ ] **Any PHI in logs?** **No** — section ids only.
- [ ] **External API or AI call?** **No.**
- [ ] **Retention / deletion impact?** **No new patient surface** — config travels with the doctor account.

---

## ✅ Acceptance & Verification Criteria

- [x] ✅ Migration idempotent; per-doctor default `[]`; `jsonb_typeof='array'` CHECK; RLS unchanged.
- [x] ✅ Zod drops unknown ids + dedupes; GET/PATCH round-trip.
- [x] ✅ `tsc`/lint/tests green (touched files; pre-existing repo-wide errors out of scope).

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 📝 Notes

The shape difference vs subj-28 (collapse) is array (hidden delta) vs object (collapse map); vs subj-24 (order) it
is identical (array) but with different semantics. Keep validation tolerant (drop unknown ids), because the client
(subj-33) reconciles against the live mountable registry and only ever sends static hidden ids; the server should
never be the thing that rejects a save over a stale id.

---

## 🔗 Related Tasks

- [`task-subj-33-visibility-resolver-and-autosave.md`](./task-subj-33-visibility-resolver-and-autosave.md) — resolves + saves through this API.
- [`task-subj-34-section-manager-menu.md`](./task-subj-34-section-manager-menu.md) — first UI consumer.
- Sibling precedent: [`../../p9-collapse-persistence/Tasks/task-subj-28-doctor-settings-collapse-map.md`](../../p9-collapse-persistence/Tasks/task-subj-28-doctor-settings-collapse-map.md) · [`../../p8-section-reorder/Tasks/task-subj-24-doctor-settings-section-order.md`](../../p8-section-reorder/Tasks/task-subj-24-doctor-settings-section-order.md).

---

**Last Updated:** 2026-06-18  
**Pattern:** per-doctor JSONB config in `doctor_settings` (array clone of `subjective_section_order`).  
**Reference:** `process/CODE_CHANGE_RULES.md`
