# Task 11: Legacy `appointment_fee_minor`-only path deprecation (Phase 1 audit)
## 16 April 2026 — Plan 03, Task 4 (Single-fee vs multi-service mode)

---

## Task Overview

After Tasks 08–10 ship, **every** doctor has a populated `service_offerings_json` (single-fee doctors get an auto-generated one-entry catalog; multi-service doctors already have theirs). That means the legacy branches that read `appointment_fee_minor` directly — to render a fee, decide whether to show a catalog, gate payments, etc. — are now redundant.

This task is **Phase 1 of a three-phase deprecation**. It catalogs every remaining consumer, adds `@deprecated` JSDoc + runtime warnings (`console.warn` guarded by an env flag so staging is noisy but production stays quiet), and ships a document listing every call site that needs migration in Phase 2.

We do **not** remove or change behavior in this task. The risk of a silent regression in booking / payment flows is too high without a structured migration.

**Estimated Time:** 3–4 hours  
**Status:** Done  
**Depends on:** [Task 08](./task-08-catalog-mode-database-field.md), [Task 09](./task-09-auto-single-service-catalog.md), [Task 10](./task-10-mode-aware-pipeline-skip.md)  
**Plan:** [Plan 03 — Single-fee vs multi-service mode](../Plans/plan-03-single-fee-vs-multi-service-mode.md)

### Implementation Plan (high level)

1. **Audit.** Use `rg` to list every backend + frontend reference to `appointment_fee_minor` (excluding tests and migrations). Classify each call site into four buckets:
   - **Source of truth** — reads `appointment_fee_minor` from `doctor_settings`; these stay in Phase 1 because Task 09 uses this field to build the catalog.
   - **Fee rendering** — reads `appointment_fee_minor` to display a price; should migrate to reading the catalog entry in Phase 2.
   - **Fee comparison / validation** — reads `appointment_fee_minor` in guards (e.g., "is this fee configured?"); migrates to `catalog_mode != null` + catalog presence check.
   - **Payment gate** — reads `appointment_fee_minor` to gate booking; migrates to catalog-driven modality pricing.
2. **Deprecation document.** Ship `docs/Development/Architecture/legacy-appointment-fee-minor-deprecation.md` capturing the audit, the proposed migration mapping per site, and the three-phase plan. This is the deliverable Phase 2 will work from.
3. **JSDoc + warning on the field.** In `backend/src/types/doctor-settings.ts` mark the `appointment_fee_minor` field with `@deprecated Use service_offerings_json instead (see Plan 03, Task 11). Planned removal: Phase 3.` Same in `frontend/types/doctor-settings.ts`.
4. **Gated runtime warning.** Behind a `DEPRECATION_WARNINGS_ENABLED` env flag (default `false` in production, `true` in dev/staging), emit a single `console.warn` per-process-lifetime when a classified "Fee rendering" / "Fee comparison" / "Payment gate" call site runs. Single-emit dedup to avoid log spam.
5. **Tests.** No behavior tests (we changed no behavior). One test asserts the warning fires in dev-mode exactly once per site; a second asserts it stays silent when the flag is off.

**Scope trade-offs (deliberately deferred — this is PHASE 1 only):**
- **Actually migrating call sites.** Phase 2. Each migration will need its own regression test and a careful rollout.
- **Dropping the database column.** Phase 3, far-future, after Phase 2 migrations ship and bake.
- **Frontend-side deep migration.** Frontend references are audited here but only gently annotated; frontend-side migration lives in Phase 2 as well.

**Change Type:**
- [x] **Create new** — deprecation document, `DEPRECATION_WARNINGS_ENABLED` env config, warning helper
- [x] **Update existing** — JSDoc on `appointment_fee_minor` in both type files; follow [CODE_CHANGE_RULES.md](../../../task-management/CODE_CHANGE_RULES.md)

**Current State:**
- `backend/src/types/doctor-settings.ts` — EXISTS; `appointment_fee_minor` is a plain `number | null`.
- `frontend/types/doctor-settings.ts` — EXISTS; mirrors backend.
- After Task 09 ships, the canonical fee source for `catalog_mode === 'single_fee'` doctors is still `appointment_fee_minor` (the catalog is rebuilt from it); so the field is NOT dead yet — it's the seed for the catalog.
- `backend/src/config/env.ts` (or equivalent) — EXISTS; adding one more flag follows the established pattern.

**What's missing:**
- The audit itself
- The deprecation document with per-site migration mapping
- JSDoc annotations
- `DEPRECATION_WARNINGS_ENABLED` env flag + one-shot warning helper
- Tests for the warning emission

**Scope Guard:**
- Expected files touched: 3–5 (two type files, env config, new doc, optional warning helper).
- Audit findings themselves are in the new `.md` file, not in code — no sprawling edits across many services.
- **Must not change any fee-related runtime behavior.** If during the audit we find a genuine bug, park it in `docs/capture/inbox.md` — don't fix it in this task.

**Reference Documentation:**
- [CODE_CHANGE_RULES.md](../../../task-management/CODE_CHANGE_RULES.md)
- [Plan 03 — Single-fee vs multi-service mode](../Plans/plan-03-single-fee-vs-multi-service-mode.md) — Task 04 section

---

## Task Breakdown

### 1. Audit: enumerate every call site

- [x] 1.1 `rg "appointment_fee_minor" backend/src` (excluding `tests/` and `migrations/`) — 24 backend hits catalogued.
- [x] 1.2 `rg "appointment_fee_minor" frontend` (excluding `__tests__`) — 6 frontend hits catalogued (all type-def / payload / JSDoc, no render sites today).
- [x] 1.3 Each match read + classified using a superset of the four buckets: **source / seed / render / gate / quote / comment** (the finer split fell out of the audit naturally because `single-fee-catalog.ts` is a genuine `seed` site distinct from ordinary readers, and several hits are doc-only `comment` sites).
- [x] 1.4 File + line + classification + Phase 2 target recorded in the call-site tables of `legacy-appointment-fee-minor-deprecation.md`.

### 2. Deprecation document

- [x] 2.1 Created `docs/Development/Architecture/legacy-appointment-fee-minor-deprecation.md`.
- [x] 2.2 Document covers Context, Phase 1 deliverables, Phase 2 per-site migration plan (ordered by blast radius: quote → render → gate → seed), Phase 3 drop preconditions, and full backend + frontend call-site tables with exemplar Phase-1 wire site called out.
- [x] 2.3 Cross-linked from every JSDoc `@deprecated` block (backend + frontend type files + `UpdateDoctorSettingsPayload`) and from the Plan 03 summary table entry below.

### 3. Type-level `@deprecated` JSDoc

- [x] 3.1 `backend/src/types/doctor-settings.ts` — `DoctorSettingsRow.appointment_fee_minor` annotated with a block that (a) points at `service_offerings_json`, (b) flags Phase 3 removal, (c) preserves the important nuance that the field is still the **seed** for `single_fee` catalogs and is NOT dead yet.
- [x] 3.2 `frontend/types/doctor-settings.ts` — both `DoctorSettings.appointment_fee_minor` and `PatchDoctorSettingsPayload.appointment_fee_minor` annotated. Also annotated `UpdateDoctorSettingsPayload.appointment_fee_minor` in `backend/src/services/doctor-settings-service.ts` so the patch contract is documented on both sides.
- [x] 3.3 Confirmed no existing `@deprecated` tags in these files before edit; no name clash.

### 4. `DEPRECATION_WARNINGS_ENABLED` env flag

- [x] 4.1 Added to `backend/src/config/env.ts` as an optional string transformed to boolean (`'true' | '1'` → true); default behavior when the var is absent is `false`, matching the "production quiet" requirement.
- [x] 4.2 `.env.example` updated with a commented-out `DEPRECATION_WARNINGS_ENABLED=true` example and a pointer to the deprecation doc so dev/staging setup is self-documenting.
- [x] 4.3 Production configs untouched — absent var ⇒ flag off.

### 5. One-shot warning helper

- [x] 5.1 Created `backend/src/utils/deprecation-warning.ts` exporting `warnDeprecation(siteId: string, message: string): void` (and a test-only `__resetDeprecationWarningsForTests()` for dedup-set clearing between cases).
- [x] 5.2 Gated by `env.DEPRECATION_WARNINGS_ENABLED`; dedup via module-local `Set<string>` of already-warned site IDs. Uses structured `logger.warn({ siteId, deprecation: true }, …)` rather than raw `console.warn` to match the rest of the backend's pino logging convention (semantically equivalent; richer for log aggregation).
- [x] 5.3 siteId convention documented in the helper's JSDoc: `appointment_fee_minor.<classification>.<site>` (e.g. `appointment_fee_minor.render.ai_context`).
- [x] 5.4 Exemplar wired: `formatAppointmentFeeForAiContext` in `backend/src/utils/consultation-fees.ts` now calls `warnDeprecation('appointment_fee_minor.render.ai_context', …)` — one of the highest-traffic render sites, called on nearly every inbound DM turn for doctors with a legacy fee on file. Call-site behavior is unchanged; the warning is a pure observability side-effect emitted *after* the null/zero gate so it only fires when the legacy path actually fed the AI context.

### 6. Tests

- [x] 6.1 `backend/tests/unit/utils/deprecation-warning.test.ts` added (5 cases):
  - Flag OFF: single call — no log emitted.
  - Flag OFF: repeated calls — still no log.
  - Flag ON, first call: exactly one structured `logger.warn` with the expected `{ siteId, deprecation: true }` context object.
  - Flag ON, repeat siteId: deduplicated (only the first call's message reaches the logger).
  - Flag ON, distinct siteIds: each warns exactly once.
  - `__resetDeprecationWarningsForTests` re-arms the dedup set as documented.
- [x] 6.2 Regression: full `backend/tests/unit/utils/consultation-fees.test.ts` suite green (exemplar call site). No behavior changes.

### 7. Verification

- [x] 7.1 `npx tsc --noEmit` clean in `backend/`.
- [x] 7.2 Full backend `tests/unit` suite green — 79 suites / 832 tests.
- [x] 7.3 Covered equivalently by the Flag-ON unit tests: the exemplar site's warning path is exercised deterministically instead of relying on manual dev-mode trigger.
- [x] 7.4 Covered equivalently by the Flag-OFF unit tests: helper is a strict no-op when the env flag is absent or false.
- [x] 7.5 Confirmed: every backend `rg "appointment_fee_minor"` hit and every frontend hit (excluding tests/migrations) appears in one of the two call-site tables of the deprecation doc, with a classification and a Phase 2 migration target.

---

## Files to Create/Update

```
docs/Development/Architecture/legacy-appointment-fee-minor-deprecation.md   — CREATE (audit + phases + call-site table)
backend/src/types/doctor-settings.ts                                        — UPDATE (JSDoc @deprecated)
frontend/types/doctor-settings.ts                                           — UPDATE (JSDoc @deprecated)
backend/src/config/env.ts                                                   — UPDATE (DEPRECATION_WARNINGS_ENABLED)
backend/src/utils/deprecation-warning.ts                                    — CREATE (one-shot warning helper)
backend/tests/unit/utils/deprecation-warning.test.ts                        — CREATE
(plus 1–2 exemplar fee-render sites that call warnDeprecation)
```

**Existing Code Status:**
- All `UPDATE` files exist.
- No DB migration, no new table, no API changes.

**When updating existing code:**
- [x] Confirm JSDoc `@deprecated` doesn't trigger lint errors in strict configs — `tsc --noEmit` and `ReadLints` clean on all touched files.
- [x] Confirm env-flag default (off) preserves production quiet — verified by Flag-OFF unit tests + the env.ts transform (`v === 'true' || v === '1'` ⇒ otherwise false, including undefined).
- [x] Confirm exemplar call-site behavior is unchanged — `consultation-fees.test.ts` passes; warning fires only after the existing null/zero gate, so return values are identical.

**When creating a migration:**
- [x] No SQL migration in Phase 1 — Phase 3 will handle the column drop.

---

## Design Constraints

- **Zero behavior change.** Phase 1 is audit + annotation + ground-truth document only. Any call-site migration work belongs to Phase 2.
- **Production stays quiet.** Warnings are off in production to avoid log spam while Phase 2 migrations are in flight.
- **Dev/staging is noisy.** We want developers to see the annotation every time they touch a deprecated site so Phase 2 work is discoverable.
- **Audit is the deliverable.** The deprecation `.md` document is the primary output — code changes are secondary scaffolding.
- **Not a Phase 3 teaser.** The `@deprecated` tag is advisory; actual column removal needs its own task with a full data-migration plan.

---

## Global Safety Gate

- [x] **Data touched?** No — pure annotation + observability.
  - [x] **RLS verified?** N/A — no data access changes.
- [x] **Any PHI in logs?** No — warning text is a generic site tag + guidance; no variables.
- [x] **External API or AI call?** No.
- [x] **Retention / deletion impact?** None — Phase 3 addresses retention when the column is dropped.

---

## Acceptance & Verification Criteria

Task is complete **ONLY when:**
- [x] `docs/Development/Architecture/legacy-appointment-fee-minor-deprecation.md` exists with a comprehensive call-site table covering every `appointment_fee_minor` reference in `backend/src` and `frontend/`.
- [x] JSDoc `@deprecated` annotations exist in both type files with a cross-link to the deprecation doc.
- [x] `DEPRECATION_WARNINGS_ENABLED` env flag wired; defaults to `false` in production.
- [x] `warnDeprecation` helper deduplicates per process lifetime and is flag-gated.
- [x] At least one exemplar call site calls `warnDeprecation` to prove wiring (`formatAppointmentFeeForAiContext` — siteId `appointment_fee_minor.render.ai_context`).
- [x] New + existing tests pass; `tsc --noEmit` clean (79 suites / 832 tests green).
- [x] No call site's runtime behavior changed.

---

## Related Tasks

- [Task 08 — `catalog_mode` database field](./task-08-catalog-mode-database-field.md) — prerequisite (defines the mode flag Phase 2 migration will branch on).
- [Task 09 — Auto-generated single-service catalog](./task-09-auto-single-service-catalog.md) — prerequisite (ensures every doctor has a catalog to render from, so Phase 2 call-site migration is safe).
- [Task 10 — Mode-aware pipeline skip](./task-10-mode-aware-pipeline-skip.md) — prerequisite (matcher/review/learning/clarification must already be mode-aware before we start migrating fee-display sites).
- **Phase 2 tracking task** (future) — captured in `docs/capture/inbox.md` as a Plan 03 follow-up.

---

**Last Updated:** 2026-04-16  
**Pattern:** Audit + `@deprecated` annotation + flag-gated runtime warning, zero behavior change  
**Reference:** [Plan 03 — Single-fee vs multi-service mode](../Plans/plan-03-single-fee-vs-multi-service-mode.md)
