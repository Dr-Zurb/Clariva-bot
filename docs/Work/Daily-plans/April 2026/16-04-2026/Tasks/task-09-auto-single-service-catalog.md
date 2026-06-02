# Task 09: Auto-generated single-service catalog
## 16 April 2026 — Plan 03, Task 2 (Single-fee vs multi-service mode)

---

## Task Overview

When `catalog_mode = 'single_fee'`, the system maintains a one-entry `ServiceCatalogV1` automatically — derived from `appointment_fee_minor`, `consultation_types`, and `practice_name`. This lets every downstream consumer (fee display, booking flow, payment gate, slot selection) go through the **same** catalog-driven code path regardless of mode. Single-fee doctors get "one fee" UX; the matcher / review / learning never run because Task 10 short-circuits on the mode flag.

No new schema is introduced — we reuse `service_offerings_json`. The single-service entry has the reserved `service_key = "consultation"` and an empty matcher-hints object so `serviceOfferingV1Schema` stays happy. `scope_mode` is left undefined (resolves to `'flexible'`) because the matcher is bypassed upstream.

**Estimated Time:** 4–6 hours  
**Status:** Done (2026-04-16)  
**Depends on:** [Task 08 — `catalog_mode` database field](./task-08-catalog-mode-database-field.md)  
**Plan:** [Plan 03 — Single-fee vs multi-service mode](../Plans/plan-03-single-fee-vs-multi-service-mode.md)

### Implementation Plan (high level)

1. **New utility `backend/src/utils/single-fee-catalog.ts`** exporting `buildSingleFeeCatalog(settings) → ServiceCatalogV1`. Deterministic `service_id` derived from `doctor_id` (UUID v5 against a fixed namespace) so it's stable across rebuilds — no churn in dependent records.
2. **Derivation from `consultation_types`.** The field is a free-form `string | null`, so reuse Task 06's `deriveAllowedModalitiesFromConsultationTypes` (or its successor) to resolve which modalities are enabled. If the string is empty/null, permit all three modalities to avoid over-blocking single-fee doctors.
3. **Per-modality pricing** is flat: every enabled modality gets `appointment_fee_minor` (no ladder). Plan 03 explicitly calls this out — per-modality pricing in single-fee mode is deferred; if the doctor wants variance, they switch to multi-service.
4. **Sync points in `doctor-settings-service.ts` PATCH**:
   - Flipping `catalog_mode` → `'single_fee'`: build the single catalog, write it to `service_offerings_json`, preserve existing catalog as `_backup_pre_single_fee` in the same JSONB for round-trip-ability (used by Task 12's multi→single switch).
   - Updating `appointment_fee_minor` while in `single_fee` mode: rebuild the catalog so the single entry's prices stay in sync.
   - Updating `consultation_types` while in `single_fee` mode: rebuild to add/remove modality entries.
   - Flipping `catalog_mode` → `'multi_service'`: **do not** auto-rebuild; the frontend (Task 12) handles the single→multi seed with an explicit doctor confirmation.
5. **Lazy migration for back-filled rows.** Task 08 set `catalog_mode = 'single_fee'` for legacy flat-fee doctors but left `service_offerings_json` untouched (null). On the next read in `doctor-settings-service.ts` (`getDoctorSettings` / similar), if `catalog_mode === 'single_fee'` and `service_offerings_json` is null, call `buildSingleFeeCatalog` and persist it back in the same transaction. Keep this behind a helper (`ensureSingleFeeCatalogMaterialized`) so it's easy to test and to disable if something goes sideways in production.
6. **Tests:**
   - `backend/tests/unit/utils/single-fee-catalog.test.ts` covers all modality strings (`"video only"`, `"text, voice"`, `"all three"`, empty, null), deterministic `service_id`, correct labels (with/without `practice_name`), and `scope_mode` left undefined.
   - `backend/tests/unit/services/doctor-settings-service.test.ts` (extend) covers the three PATCH sync points and the lazy materialization on read.

**Scope trade-offs (deliberately deferred):**
- **Optimistic concurrency around the lazy materialization** — if two requests hit `getDoctorSettings` simultaneously for a just-migrated doctor, both may try to materialize. Accept a last-writer-wins semantic; the catalog is deterministic so both writes produce identical JSON. Capture an inbox item if this shows up as flaky in staging.
- **Per-modality pricing expander** in single-fee — deferred per Plan 03 Open Question 4.
- **Restoring `_backup_pre_single_fee`** — Task 12's concern, not this task's. This task only writes the backup; restoring it is a frontend flow.

**Change Type:**
- [x] **Create new** — `single-fee-catalog.ts` utility, `ensureSingleFeeCatalogMaterialized` helper
- [x] **Update existing** — `doctor-settings-service.ts` PATCH + GET paths; follow [CODE_CHANGE_RULES.md](../../../task-management/CODE_CHANGE_RULES.md)

**Current State:**
- `backend/src/utils/service-catalog-schema.ts` — EXISTS — exposes `ServiceCatalogV1`, `serviceOfferingV1Schema`, `safeParseServiceCatalogV1FromDb`.
- `backend/src/services/service-catalog-ai-suggest.ts` — EXISTS (shipped in Task 06) — already has `deriveAllowedModalitiesFromConsultationTypes`; extract it (or a sibling) into a shared utility so both the AI path and single-fee builder share one source of truth.
- `backend/src/services/doctor-settings-service.ts` — EXISTS — PATCH handler pattern is well-established (Task 08 just added `catalog_mode` to the schema).
- `backend/src/utils/service-catalog-helpers.ts` — EXISTS — `getActiveServiceCatalog` continues to work unchanged because a single-entry catalog is just a normal catalog.

**What's missing:**
- `buildSingleFeeCatalog` pure utility
- Shared modality resolver (extract from `service-catalog-ai-suggest.ts`)
- PATCH-side auto-rebuild branches (three triggers)
- GET-side lazy materialization for back-filled rows
- Tests for both pure utility and service sync points

**Scope Guard:**
- Expected files touched: 5–6 (1 new utility, 1 shared modality resolver, 1 service update, 2 test files, possibly 1 types file tweak)
- Must NOT introduce behavior changes for doctors in `multi_service` mode — guard every new branch by `settings.catalog_mode === 'single_fee'`.

**Reference Documentation:**
- [CODE_CHANGE_RULES.md](../../../task-management/CODE_CHANGE_RULES.md)
- [Plan 03 — Single-fee vs multi-service mode](../Plans/plan-03-single-fee-vs-multi-service-mode.md) — Task 02 section
- [Task 06 — AI auto-fill for service cards](./task-06-ai-autofill-service-cards.md) — precedent for modality derivation

---

## Task Breakdown

### 1. Shared modality resolver (extract)

- [ ] 1.1 Move `deriveAllowedModalitiesFromConsultationTypes` from `service-catalog-ai-suggest.ts` into `backend/src/utils/consultation-types.ts` (new file or existing if present).
- [ ] 1.2 Update the AI service import to use the shared util; confirm Task 06's tests still pass unchanged.
- [ ] 1.3 Export both the resolver and the `ALL_MODALITIES` constant so both callers are aligned.

### 2. `buildSingleFeeCatalog` utility

- [ ] 2.1 Create `backend/src/utils/single-fee-catalog.ts` with `buildSingleFeeCatalog(settings: DoctorSettingsRow): ServiceCatalogV1`.
- [ ] 2.2 Label = `practice_name ? \`${practice_name} Consultation\` : 'Consultation'`.
- [ ] 2.3 `service_key = 'consultation'` — **not** `CATALOG_CATCH_ALL_SERVICE_KEY`, since the catch-all rules are multi-service-specific.
- [ ] 2.4 `service_id` = deterministic UUID v5 from `doctor_id` + fixed namespace constant exported from the same file.
- [ ] 2.5 `modalities` object populated only for modalities returned by the shared resolver, each priced at `appointment_fee_minor` in `appointment_fee_currency` (default if the currency is null).
- [ ] 2.6 `matcher_hints` is an empty object (`{}`) — schema-valid, matcher won't consume it.
- [ ] 2.7 `scope_mode` left undefined — the serialized JSON should omit the key, not write `null`.
- [ ] 2.8 `followup_policy` left as whatever the doctor has configured globally (default to `null` if nothing present).
- [ ] 2.9 Parse the final object through `serviceOfferingV1Schema.parse` before returning — if the pure utility builds something invalid, fail loud in tests, not silently in production.

### 3. Service sync points (PATCH)

- [ ] 3.1 In `doctor-settings-service.ts`, after applying PATCH updates but before writing, inspect the *effective* `catalog_mode`, `appointment_fee_minor`, `consultation_types`, and `service_offerings_json`.
- [ ] 3.2 **Trigger A** — mode transitioning to `'single_fee'`: snapshot the existing `service_offerings_json` into a `_backup_pre_single_fee` sibling field (inside the same JSONB root — structure: `{ services: [...], _backup_pre_single_fee: <previous_catalog> }`). Then call `buildSingleFeeCatalog` and replace `services` with the one-entry array.
- [ ] 3.3 **Trigger B** — `appointment_fee_minor` changes while `catalog_mode === 'single_fee'`: rebuild the single-service entry and overwrite `services` (preserve `_backup_pre_single_fee` if present).
- [ ] 3.4 **Trigger C** — `consultation_types` changes while `catalog_mode === 'single_fee'`: rebuild and overwrite (modality list may add/remove entries).
- [ ] 3.5 **No trigger** when mode transitions to `'multi_service'` — Task 12 owns that promotion.
- [ ] 3.6 Every rebuild path writes deterministic JSON so the `UPDATE` is a no-op if nothing relevant changed (reduces noisy audit rows).

### 4. Lazy materialization on read

- [ ] 4.1 Add `ensureSingleFeeCatalogMaterialized(settings, supabase)` helper in `doctor-settings-service.ts`.
- [ ] 4.2 Called in `getDoctorSettings` (or wherever the row is first read per-request). Condition: `catalog_mode === 'single_fee' && !service_offerings_json`. Builds + persists + returns the enriched row.
- [ ] 4.3 On materialization, log `catalog_mode.single_fee.materialized` with `doctorId` for observability (so we can see the back-fill tail off in staging).
- [ ] 4.4 Wrap the UPDATE in the same transaction as the SELECT so two concurrent requests don't both try to write (rely on row-level locking or Supabase's single-statement UPDATE semantics — whatever the existing service uses).

### 5. Tests

- [ ] 5.1 `backend/tests/unit/utils/single-fee-catalog.test.ts` — new file:
  - Every modality string case (`"text"`, `"voice, video"`, empty, null)
  - Deterministic `service_id` across rebuilds
  - Label with and without `practice_name`
  - `scope_mode` omitted
  - Schema validation passes (`serviceOfferingV1Schema.parse`)
  - Pricing applied uniformly
- [ ] 5.2 `backend/tests/unit/services/doctor-settings-service.test.ts` (extend) — three PATCH triggers (A/B/C), plus the "no trigger on multi_service transition" negative case, plus the lazy materialization path on read.
- [ ] 5.3 Confirm `safeParseServiceCatalogV1FromDb` round-trips the single-entry catalog without loss.
- [ ] 5.4 Regression sanity: Task 06's existing `service-catalog-ai-suggest.test.ts` continues to pass after the modality resolver extraction (same behavior, different import).

### 6. Verification

- [ ] 6.1 `npx tsc --noEmit` clean in both workspaces.
- [ ] 6.2 Full backend `tests/unit` suite green.
- [ ] 6.3 Manual: flip a dev doctor's `catalog_mode` to `'single_fee'` via PATCH — confirm `service_offerings_json` rebuilds; change `appointment_fee_minor` — confirm catalog price updates; change `consultation_types` to remove "video" — confirm the video modality disappears from the catalog.

---

## Files to Create/Update

```
backend/src/utils/single-fee-catalog.ts                              — CREATE (buildSingleFeeCatalog + deterministic namespace)
backend/src/utils/consultation-types.ts                              — CREATE (shared modality resolver — extracted from Task 06)
backend/src/services/service-catalog-ai-suggest.ts                   — UPDATE (import shared resolver instead of local copy)
backend/src/services/doctor-settings-service.ts                      — UPDATE (PATCH sync triggers + ensureSingleFeeCatalogMaterialized)
backend/tests/unit/utils/single-fee-catalog.test.ts                  — CREATE (all modality cases + determinism + schema)
backend/tests/unit/services/doctor-settings-service.test.ts          — UPDATE (three PATCH triggers + lazy materialization)
```

**Existing Code Status:**
- `service-catalog-ai-suggest.ts` is a Task 06 artifact with stable tests — the extraction must not change behavior.
- `doctor-settings-service.ts` PATCH path already has a "derived field" pattern; the three new triggers follow the same shape.
- No DB migration in this task — everything reuses `service_offerings_json`.

**When updating existing code:**
- [ ] Confirm no existing consumer of `service_offerings_json` breaks on the `_backup_pre_single_fee` sibling (readers use `services` directly; Zod validators should tolerate extra keys).
- [ ] Confirm lazy materialization doesn't deadlock when two concurrent requests land on the same doctor — accept last-writer-wins since output is deterministic.
- [ ] Confirm the extracted modality resolver keeps Task 06's tests green.

**When creating a migration:**
- [ ] No SQL migration needed — column already exists (Task 08); data sync happens at write time.

---

## Design Constraints

- **Deterministic output:** `buildSingleFeeCatalog(settings) === buildSingleFeeCatalog(settings)` for any identical input. This is why `service_id` uses UUID v5, not v4.
- **Schema fidelity:** the single-entry catalog must validate against `serviceOfferingV1Schema` unmodified. No special "single-fee" branch anywhere in matcher / helpers.
- **No behavior change for multi-service doctors:** every new branch is gated behind `catalog_mode === 'single_fee'`.
- **Backup, don't delete:** multi→single switch preserves the previous catalog in `_backup_pre_single_fee` so Task 12 can implement a round-trip.
- **Reuse Task 06's modality logic:** consultation_types string parsing lives in exactly one place after this task.
- **Empty hints object, not null:** schema requires the key; value is `{}` to signal "matcher won't run anyway."

---

## Global Safety Gate

- [ ] **Data touched?** Yes — writes `service_offerings_json` for doctors in `single_fee` mode (auto-generated single entry + `_backup_pre_single_fee` on multi→single).
  - [ ] **RLS verified?** Yes — reuses the same `doctor-settings-service` access pattern.
- [ ] **Any PHI in logs?** No — logs carry `doctorId` and mode flip; no patient data.
- [ ] **External API or AI call?** No.
- [ ] **Retention / deletion impact?** No new persistence surface; `_backup_pre_single_fee` stays inside the existing row lifecycle.

---

## Acceptance & Verification Criteria

Task is complete **ONLY when:**
- [x] `buildSingleFeeCatalog(settings)` returns a schema-valid one-entry `ServiceCatalogV1` with deterministic `service_id` and correct modalities.
- [x] PATCHing `catalog_mode` → `'single_fee'` auto-materializes the catalog and snapshots the previous one.
- [x] PATCHing `appointment_fee_minor` while in single-fee mode updates the catalog entry's prices.
- [x] PATCHing `consultation_types` while in single-fee mode syncs the modality list.
- [x] Lazy materialization on read back-fills `service_offerings_json` for Task 08's migrated rows.
- [x] No behavior change for `multi_service` doctors (regression tests green).
- [x] All new + existing tests pass; `tsc --noEmit` clean in both workspaces.

---

## Implementation Log (2026-04-16)

Files shipped:

- **`backend/src/utils/consultation-types.ts`** (new) — extracted `deriveAllowedModalitiesFromConsultationTypes` + `AllowedModalities` from `service-catalog-ai-suggest.ts` into a shared, dependency-free module. `service-catalog-ai-suggest.ts` now re-imports it — Task 06's behavior preserved byte-for-byte.
- **`backend/src/utils/single-fee-catalog.ts`** (new) — exports `buildSingleFeeOffering`, `buildSingleFeeCatalog`, `buildSingleFeePersistedJson`, plus `SINGLE_FEE_SERVICE_KEY = 'consultation'` and `SINGLE_FEE_BACKUP_KEY = '_backup_pre_single_fee'`. `service_id` is `deterministicServiceIdForLegacyOffering(doctor_id, 'consultation')` (UUID v5). Modalities default to "all allowed" when `consultation_types` is null/empty. Validates through `serviceCatalogV1BaseSchema` (no catch-all requirement). `scope_mode` intentionally omitted — resolver defaults to `'flexible'`, matcher is bypassed upstream by Task 10.
- **`backend/src/services/doctor-settings-service.ts`** — added `computeSingleFeeCatalogSyncUpdate` (pure, exported for test) handling triggers A/B/C:
  - A (mode flip → `single_fee`): rebuild catalog, back up prior `service_offerings_json` as `_backup_pre_single_fee`.
  - B (`appointment_fee_minor` change in `single_fee`): rebuild, preserve *existing* backup.
  - C (`consultation_types` change in `single_fee`): rebuild, preserve existing backup.
  - Caller-wins: if the PATCH explicitly sets `service_offerings_json`, no auto-rebuild.
  - Also added `ensureSingleFeeCatalogMaterialized` — called in `getDoctorSettings` + `getDoctorSettingsForUser`. If `catalog_mode === 'single_fee'` and `service_offerings_json` is null (Task 08 migrated rows), build the catalog and persist with an optimistic concurrency guard (`.is('service_offerings_json', null)`). Persist failure is logged and non-fatal — next GET retries.
  - Consolidated pre-read of `doctor_settings` into one `select(...)` returning `SingleFeeSyncExistingRow` (needed the cast-via-`unknown` workaround for Supabase's multi-column inline `select` type inference).
- **`backend/tests/unit/utils/single-fee-catalog.test.ts`** (new) — 24 tests: schema validity, `service_key='consultation'`, empty `matcher_hints`, `scope_mode` omission, deterministic `service_id` per doctor + distinct per doctor, label rules, modality derivation matrix, uniform pricing from `appointment_fee_minor`, `buildSingleFeePersistedJson` backup handling (provided / null / absent / round-trip through `safeParseServiceCatalogV1FromDb`).
- **`backend/tests/unit/services/doctor-settings-service.test.ts`** (extended) — 18 new tests covering: no-op cases (explicit catalog override, non-single-fee mode, no-change PATCH, same-value change detection); Trigger A (with + without prior catalog, with null existing row); Trigger B (preserves existing backup, does NOT auto-create backup on fee change); Trigger C (rebuilds modalities correctly — disabled modalities are omitted, not `enabled: false`); `ensureSingleFeeCatalogMaterialized` paths (skip when not single_fee / already materialized / no doctor_id; persist with optimistic guard; best-effort on persist failure; works when supabase client is null). Test mock upgraded to support both `.select().eq().maybeSingle()` and `.update().eq().is()` chains.

### Verification

- `npx tsc --noEmit` — clean in both `backend/` and `frontend/`.
- `npx jest tests/unit` — **812 tests / 76 suites all green**, including the pre-existing 10 doctor-settings-service tests (which now exercise the materialization path through the upgraded mock).

---

## Related Tasks

- [Task 08 — `catalog_mode` database field](./task-08-catalog-mode-database-field.md) — prerequisite (sets the flag this task reads).
- [Task 10 — Mode-aware pipeline skip](./task-10-mode-aware-pipeline-skip.md) — next; relies on the single-entry catalog being present so matcher/review/learning short-circuits can safely default to the single service.
- [Task 12 — Frontend mode selector](./task-12-frontend-mode-selector.md) — uses `_backup_pre_single_fee` for multi→single round-trip.
- [Task 06 — AI auto-fill for service cards](./task-06-ai-autofill-service-cards.md) — source of the modality resolver that gets extracted here.

---

**Last Updated:** 2026-04-16  
**Pattern:** Deterministic derived catalog, sync-on-write + lazy-on-read, zero schema change  
**Reference:** [Plan 03 — Single-fee vs multi-service mode](../Plans/plan-03-single-fee-vs-multi-service-mode.md)
