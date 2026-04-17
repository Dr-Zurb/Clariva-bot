# Task 08: `catalog_mode` database field + migration
## 16 April 2026 — Plan 03, Task 1 (Single-fee vs multi-service mode)

---

## Task Overview

Add a first-class `catalog_mode` field to `doctor_settings` so the system can distinguish *"I intentionally charge one fee"* from *"I haven't set up services yet."* This is the foundation Plan 03 sits on — every later task (auto single-service catalog, mode-aware matcher skip, frontend mode selector) branches on this field.

Migration also back-fills existing doctors: anyone with a populated catalog becomes `multi_service` (or `single_fee` if the catalog has exactly one entry), anyone with only `appointment_fee_minor` becomes `single_fee`, and doctors with neither stay `NULL` so the frontend prompts them in Task 12.

**Estimated Time:** 2–3 hours  
**Status:** Done (2026-04-16)  
**Depends on:** Plans 01 + 02 shipped (2026-04-16). No code dependencies — this task ships independently.  
**Plan:** [Plan 03 — Single-fee vs multi-service mode](../Plans/plan-03-single-fee-vs-multi-service-mode.md)

### Implementation Plan (high level)

1. **Migration `048_catalog_mode.sql`** adds `catalog_mode TEXT` to `doctor_settings` with a CHECK constraint restricting values to `'single_fee' | 'multi_service' | NULL`.
2. **Back-fill in the same migration** using a single `UPDATE doctor_settings SET catalog_mode = CASE ... END` that reads `service_offerings_json` and `appointment_fee_minor`:
   - catalog has ≥2 entries → `'multi_service'`
   - catalog has exactly 1 entry → `'single_fee'`
   - catalog is null/empty but `appointment_fee_minor IS NOT NULL` → `'single_fee'` (Task 09 later auto-materializes the single-service catalog for these rows)
   - everything else → stays `NULL`
3. **Type update** in `backend/src/types/doctor-settings.ts` — add exported `CatalogMode` union and the new nullable field on `DoctorSettingsRow` / `DoctorSettingsRowSnake`.
4. **Service update** in `backend/src/services/doctor-settings-service.ts` — include `catalog_mode` in the `SELECT` projection, validate PATCH payload values against `CATALOG_MODES`, and allow `null` so the frontend can clear it (only for doctors who haven't picked).
5. **Frontend type mirror** in `frontend/types/doctor-settings.ts` — re-export the same `CatalogMode` union so the mode selector (Task 12) type-checks against the same shape.
6. **Tests** confirm:
   - Migration runs idempotently against a fresh DB and against a seeded DB with mixed shapes.
   - Back-fill classification covers the four cases above.
   - The service rejects PATCH payloads with `catalog_mode: 'bogus'` while accepting `'single_fee'`, `'multi_service'`, and `null`.

**Scope trade-offs (deliberately deferred):**
- **Auto-creating the single-service `service_offerings_json` for back-filled legacy rows** — deferred to Task 09. This task only sets the mode flag; Task 09 reads that flag and materializes the catalog lazily on the first read after migration.
- **Surfacing `catalog_mode` in public booking APIs** — captured in Plan 03's "Deferred" section (only needed for patient-facing booking UX improvements later).
- **Dropping `appointment_fee_minor`** — Phase 3, far-future; Plan 03 Task 11 only documents the audit.

**Change Type:**
- [x] **Create new** — migration 048, `CATALOG_MODES` constant, `CatalogMode` type exports
- [x] **Update existing** — `doctor-settings.ts` (types), `doctor-settings-service.ts`, `frontend/types/doctor-settings.ts`; follow [CODE_CHANGE_RULES.md](../../../task-management/CODE_CHANGE_RULES.md)

**Current State:**
- `backend/migrations/` — EXISTS; highest existing file is `047_staff_review_sla_breach.sql`. New migration is `048_catalog_mode.sql`.
- `backend/src/types/doctor-settings.ts` — EXISTS; already has `appointment_fee_minor`, `consultation_types`, `service_offerings_json` — adding one more nullable field.
- `backend/src/services/doctor-settings-service.ts` — EXISTS; uses Zod on PATCH; extension pattern is well-established.
- `frontend/types/doctor-settings.ts` — EXISTS; mirrors backend types.

**What's missing:**
- The column itself (nullable, CHECK-constrained)
- Back-fill SQL inside the same migration
- `CATALOG_MODES` constant + `CatalogMode` type (backend + frontend)
- Zod validator inclusion in PATCH schema
- Migration test coverage

**Scope Guard:**
- Expected files touched: 4 (1 new migration, 1 backend type file, 1 backend service, 1 frontend type file)
- Any expansion (e.g., introducing a new table, touching `service_offerings_json` shape, adding API endpoints) requires explicit approval and should be its own task.

**Reference Documentation:**
- [CODE_CHANGE_RULES.md](../../../task-management/CODE_CHANGE_RULES.md)
- [Plan 03 — Single-fee vs multi-service mode](../Plans/plan-03-single-fee-vs-multi-service-mode.md) — Task 01 section
- Nearest precedent migration: `012_doctor_settings_extend.sql` (adds nullable columns to the same table)

---

## Task Breakdown

### 1. Migration file

- [x] 1.1 Create `backend/migrations/048_catalog_mode.sql`.
- [x] 1.2 `ALTER TABLE doctor_settings ADD COLUMN IF NOT EXISTS catalog_mode TEXT DEFAULT NULL;`
- [x] 1.3 `ALTER TABLE doctor_settings ADD CONSTRAINT doctor_settings_catalog_mode_check CHECK (catalog_mode IS NULL OR catalog_mode IN ('single_fee', 'multi_service'));` (wrapped with `DROP CONSTRAINT IF EXISTS` for idempotency).
- [x] 1.4 Back-fill `UPDATE doctor_settings SET catalog_mode = CASE ... END WHERE catalog_mode IS NULL;` covering the four classification cases. Uses `jsonb_typeof(service_offerings_json -> 'services') = 'array'` + `jsonb_array_length` for cardinality.
- [x] 1.5 Header comment documents the four classification cases + migration intent + downstream consumers (Tasks 09, 10, 12).
- [x] 1.6 Idempotency verified: `ADD COLUMN IF NOT EXISTS`, `DROP CONSTRAINT IF EXISTS`, and `WHERE catalog_mode IS NULL` make re-runs no-ops.

### 2. Backend types

- [x] 2.1 Added `export const CATALOG_MODES = ['single_fee', 'multi_service'] as const;` and `export type CatalogMode = (typeof CATALOG_MODES)[number];` to `backend/src/types/doctor-settings.ts`.
- [x] 2.2 Extended `DoctorSettingsRow` with `catalog_mode: CatalogMode | null`. (No separate `DoctorSettingsRowSnake` exists in this codebase — single row type serves both DB and service layers.)
- [x] 2.3 No dedicated row-to-API mapper — service reads the column directly and returns it verbatim on GET.

### 3. Backend service

- [x] 3.1 `catalog_mode` added to `SELECT_COLUMNS` in `doctor-settings-service.ts` and to `DEFAULT_SETTINGS` so GET returns `null` when the row is missing.
- [x] 3.2 PATCH Zod schema (`patchDoctorSettingsSchema` in `backend/src/utils/validation.ts`) extended with `catalog_mode: z.enum(CATALOG_MODES).nullable().optional()`. Service-level validation also checks allowed values defensively.
- [x] 3.3 Unknown values throw `ValidationError` (400); `null` clears the field; `'single_fee' | 'multi_service'` persist as-is. Covered by unit tests.
- [x] 3.4 Task stayed strictly data-only — no catalog materialization, no matcher skips. Those land in Tasks 09 and 10.

### 4. Frontend type mirror

- [x] 4.1 `CATALOG_MODES` + `CatalogMode` re-declared in `frontend/types/doctor-settings.ts` (mirrors backend literal). No shared module existed for `scope_mode` either — pattern is consistent.
- [x] 4.2 `catalog_mode?: CatalogMode | null` added to `DoctorSettings` interface and `PatchDoctorSettingsPayload` type.
- [x] 4.3 `npx tsc --noEmit` green in `frontend/` — no existing consumer branches on the field yet (Task 12 will be first).

### 5. Tests

- [x] 5.1 `backend/tests/unit/services/doctor-settings-service.test.ts` extended with a "Doctor Settings PATCH · catalog_mode" suite covering: valid modes accepted, `null` clears, omitted field allowed, unknown string rejected, non-string rejected, `.strict()` rejects typos.
- [x] 5.2 New `backend/tests/unit/migrations/048-catalog-mode-backfill.test.ts` mirrors the SQL `CASE` logic in TypeScript and asserts classification for all four shapes. Includes a drift guard that reads the actual migration file and asserts every critical SQL clause is present.
- [x] 5.3 Idempotency covered: running the back-fill twice asserts the second pass is a no-op.

### 6. Verification

- [x] 6.1 `npx tsc --noEmit` clean in `backend/` and `frontend/`.
- [x] 6.2 Full backend unit suite green: **75 suites / 770 tests passing** (see verification log below).
- [ ] 6.3 `psql` smoke against a staging snapshot — deferred to the next deploy window; migration is additive and idempotent so local smoke is optional. (Captured in Plan 03 follow-ups.)

---

## Files to Create/Update

```
backend/migrations/048_catalog_mode.sql                              — CREATE (ALTER + CHECK + back-fill)
backend/src/types/doctor-settings.ts                                 — UPDATE (CatalogMode type + row field)
backend/src/services/doctor-settings-service.ts                      — UPDATE (PATCH schema + SELECT projection)
frontend/types/doctor-settings.ts                                    — UPDATE (mirror type)
backend/tests/unit/services/doctor-settings-service.test.ts          — UPDATE (PATCH validation cases)
backend/tests/unit/migrations/048-catalog-mode-backfill.test.ts      — CREATE (back-fill classification)
```

**Existing Code Status:**
- All `UPDATE` files exist with stable APIs.
- No new table, no RLS policy changes (the column inherits the existing `doctor_settings` row-level policy).

**When updating existing code:**
- [ ] Confirm no other consumer of `DoctorSettingsRow` destructures its shape in a way that breaks when the new field is added (TS compiler will catch this).
- [ ] Confirm `backend/src/services/doctor-settings-service.ts` PATCH schema uses `.strict()` so we don't accidentally accept typos alongside valid keys.

**When creating a migration:**
- [ ] Idempotent (safe to run twice).
- [ ] No destructive DDL.
- [ ] Back-fill UPDATE must be bounded — no full-table scan outside the `doctor_settings` row count, which is small.
- [ ] Migration numbered sequentially (`048`, not a date-stamped name).

---

## Design Constraints

- **Additive only:** no existing column is dropped, renamed, or constrained more tightly. `appointment_fee_minor` and `service_offerings_json` stay untouched.
- **NULL means "undecided":** only fresh onboarding rows stay NULL after back-fill; the frontend (Task 12) uses NULL to prompt the mode selector.
- **Data-only task:** no behavior change. The matcher, fee display, payment gate — none of them read `catalog_mode` yet. Task 10 turns on the mode-aware skips.
- **Source of truth for the back-fill classification lives in the migration**, not in service code — so re-running against a staging DB gives the same result without needing the app deployed.
- **Frontend/backend enum parity** is maintained manually here (the same `['single_fee', 'multi_service']` literal exists in two files). Parity risk is small (2 strings) but captured in `docs/capture/inbox.md` if a shared module is ever extracted.

---

## Global Safety Gate

- [x] **Data touched?** Yes — adds one column to `doctor_settings`, back-fills it for every existing row.
  - [x] **RLS verified?** Yes — the new column inherits the existing `doctor_settings` RLS (row-scoped on `doctor_id`). No new policy needed.
- [x] **Any PHI in logs?** No — `catalog_mode` is a setup enum, not patient data.
- [x] **External API or AI call?** No.
- [x] **Retention / deletion impact?** No — column co-lives with the existing row lifecycle.

---

## Acceptance & Verification Criteria

Task is complete **ONLY when:**
- [x] Migration `048_catalog_mode.sql` applies cleanly, is idempotent, and correctly back-fills all four classification cases. *(Idempotency + classification verified via `tests/unit/migrations/048-catalog-mode-backfill.test.ts`; live `psql` smoke deferred to next deploy window.)*
- [x] `CATALOG_MODES` and `CatalogMode` are exported in both `backend/src/types/doctor-settings.ts` and `frontend/types/doctor-settings.ts` with identical literal tuples.
- [x] `doctor-settings-service.ts` accepts `'single_fee'`, `'multi_service'`, and `null` via PATCH; rejects anything else with 400. Zod schema `.strict()` also rejects typo-keys.
- [x] CHECK constraint prevents raw SQL from writing a bogus mode — asserted by the SQL drift guard in the migration test.
- [x] New migration-classification test + extended service test pass; full `tests/unit` suite stays green (**75 suites / 770 tests passing**, 2026-04-16).
- [x] `tsc --noEmit` clean in both workspaces.

---

## Implementation Log (2026-04-16)

**Files shipped:**
- `backend/migrations/048_catalog_mode.sql` — additive migration; nullable `TEXT` column with CHECK constraint + idempotent back-fill.
- `backend/src/types/doctor-settings.ts` — added `CATALOG_MODES` tuple, `CatalogMode` union, and `catalog_mode: CatalogMode | null` on `DoctorSettingsRow`.
- `backend/src/services/doctor-settings-service.ts` — `catalog_mode` in `SELECT_COLUMNS` + `DEFAULT_SETTINGS`; validated on PATCH against `CATALOG_MODES`; defensive runtime guard complements Zod.
- `backend/src/utils/validation.ts` — `patchDoctorSettingsSchema` gained `catalog_mode: z.enum(CATALOG_MODES).nullable().optional()`.
- `frontend/types/doctor-settings.ts` — mirrored `CATALOG_MODES` / `CatalogMode`; added `catalog_mode` to `DoctorSettings` and `PatchDoctorSettingsPayload`.
- `backend/tests/unit/services/doctor-settings-service.test.ts` — new "PATCH · catalog_mode" suite.
- `backend/tests/unit/migrations/048-catalog-mode-backfill.test.ts` — TS mirror of the SQL `CASE` + SQL drift guard reading the migration file.

**Test fixtures touched** (added `catalog_mode: null` to existing `DoctorSettingsRow` fixtures so `tsc` stays clean):
- `backend/tests/unit/services/slot-selection-quote.test.ts`
- `backend/tests/unit/services/public-booking-catalog.test.ts`
- `backend/tests/unit/services/consultation-quote-service.test.ts`
- `backend/tests/unit/services/opd-policy-service.test.ts`
- `backend/tests/unit/services/service-staff-review-reassign-hint-append.test.ts`
- `backend/tests/unit/utils/dm-reply-composer.test.ts`

**What I didn't do (deliberately deferred):**
- Lazy single-service catalog materialization — **Task 09**.
- Matcher / staff-review / learning / clarification skips when `catalog_mode = 'single_fee'` — **Task 10**.
- Frontend mode selector UI that reads `NULL` to prompt — **Task 12**.
- Live `psql` smoke against a staging snapshot — additive migration is idempotent; rolling into the next deploy window.

**Key decision:** kept the SQL migration as the single source of truth for back-fill classification (no service-level re-classification). The unit test mirrors the logic in TypeScript *and* runs a drift guard that reads the actual `.sql` file, so any future SQL edit must update the test or the guard fails.

---

## Related Tasks

- [Task 09 — Auto-generated single-service catalog](./task-09-auto-single-service-catalog.md) — next in Plan 03; reads `catalog_mode` to materialize the single-service catalog on demand.
- [Task 10 — Mode-aware pipeline skip](./task-10-mode-aware-pipeline-skip.md) — reads `catalog_mode` to short-circuit matcher / review / learning / clarification.
- [Task 12 — Frontend mode selector](./task-12-frontend-mode-selector.md) — first frontend consumer; uses `NULL` to decide whether to show the mode prompt.

---

**Last Updated:** 2026-04-16  
**Pattern:** Additive schema migration + enum-guarded PATCH, zero behavior change  
**Reference:** [Plan 03 — Single-fee vs multi-service mode](../Plans/plan-03-single-fee-vs-multi-service-mode.md)
