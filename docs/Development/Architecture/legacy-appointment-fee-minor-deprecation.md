# Deprecation: `doctor_settings.appointment_fee_minor`

**Status:** Phase 1 (audit + annotation) — shipped 2026-04-16 as [Plan 03, Task 11](../Daily-plans/April%202026/16-04-2026/Tasks/task-11-legacy-fee-path-deprecation.md).
**Phase 2 (migration):** tracked in `docs/capture/inbox.md` as a Plan 03 follow-up.
**Phase 3 (column drop):** deferred until Phase 2 ships and bakes.

---

## 1. Context

The `doctor_settings.appointment_fee_minor` column pre-dates the Plan 03 catalog model. Historically it was the single source of truth for a doctor's consultation fee:

```
doctor_settings
  ├─ appointment_fee_minor      ← legacy flat fee (paise / cents)
  ├─ appointment_fee_currency   ← ISO 4217 code
  └─ consultation_types         ← free-text price list
```

Plan 03 introduces structured per-modality pricing via `service_offerings_json` (`ServiceCatalogV1`). After Tasks 08–10:

- **Every** doctor now has a populated catalog. Single-fee doctors get a one-entry catalog auto-materialized from `appointment_fee_minor` (Task 09); multi-service doctors already maintain theirs explicitly.
- The matcher / staff review / learning pipelines short-circuit for `catalog_mode === 'single_fee'` (Task 10), so those paths don't re-read the legacy field.
- The catalog is therefore the canonical fee source for **rendering**, **quoting**, **payment gating**, and **modality-aware booking**. The legacy field is redundant for those consumers but **is still the seed** Task 09 uses to build the single-fee catalog.

Because the legacy field remains the seed, Phase 3 (drop the column) is **not** safe today. We need to migrate every reader (rendering, comparison, payment gate) off the legacy field first, then cut over Task 09's seed to a different persistence shape, and only then drop the column.

This document is the Phase 1 deliverable: a comprehensive audit + per-site migration mapping so Phase 2 can proceed call-site by call-site without hunting.

---

## 2. Three-phase deprecation plan

### Phase 1 (this doc, Task 11 — shipped)

- Catalog every reader of `appointment_fee_minor` in `backend/src` and `frontend/`.
- JSDoc `@deprecated` annotations on both `DoctorSettingsRow.appointment_fee_minor` (backend) and `DoctorSettings.appointment_fee_minor` (frontend).
- `DEPRECATION_WARNINGS_ENABLED` env flag + `warnDeprecation(siteId, message)` helper that is flag-gated and deduplicates per process lifetime.
- One exemplar call site wired to `warnDeprecation` to prove the pattern. **No runtime behavior changes.**

### Phase 2 (future task — per-site migration)

Migrate each reader in priority order. Every migration owns its own regression test and a staged rollout.

Priority: `payment_gate` → `comparison` → `rendering`. The seed site (Task 09 single-fee builder) stays on the legacy field until Phase 3.

For each site:

1. Confirm the target catalog-driven replacement exists and is tested.
2. Replace the legacy read with the catalog lookup.
3. Remove the `warnDeprecation` call if one was wired.
4. Re-run the site's regression suite.

### Phase 3 (future task — column drop)

Preconditions:

- Every `backend/src` reader classified as `payment_gate`, `comparison`, or `rendering` below has been migrated (table → all rows green).
- Task 09's single-fee catalog builder no longer reads `appointment_fee_minor` (it reads from the catalog directly, or a replacement seed column).
- A migration window is scheduled with Ops to drop the DB column and clean up the zod payload schema.

Deliverables:

- SQL migration dropping `appointment_fee_minor` + `appointment_fee_currency` (currency is tightly coupled; reassess at cutover time).
- Remove the field from `DoctorSettingsRow`, `UpdateDoctorSettingsPayload`, `DoctorSettings`, `PatchDoctorSettingsPayload`.
- Remove `LegacyAppointmentFeeNotConfiguredError` and any residual legacy-fee code paths.
- Remove the `warnDeprecation` helper (or keep and repurpose for other deprecations).

---

## 3. Classification buckets

- **source** — persists or validates the raw value. Stays on `appointment_fee_minor` through Phase 2; migrated in Phase 3.
- **seed** — reads the value to build the single-fee catalog (Task 09 output). Stays through Phase 2; migrated in Phase 3 when the single-fee builder switches seed shapes.
- **render** — formats the value for display (DM copy, AI context, DM composer). Migrate to reading the catalog offering's modality price in Phase 2.
- **gate** — reads the value to decide whether downstream flows (booking, payment) can proceed. Migrate to catalog presence + modality check in Phase 2.
- **quote** — reads the value to produce an actual quote amount. Migrate to catalog modality price lookup in Phase 2.
- **comment** — docstring / string literal only; no runtime read. Update wording during the relevant Phase 2 migration; no standalone work.

---

## 4. Backend call-site table (`backend/src`)

| # | File:line | Classification | Phase 2 migration target |
|---|-----------|----------------|--------------------------|
| B1 | `backend/src/types/doctor-settings.ts:38` (`DoctorSettingsRow.appointment_fee_minor: number | null`) | source (type) | Phase 3 — remove field from row type after all readers migrated |
| B2 | `backend/src/services/doctor-settings-service.ts:45` (SELECT_COLUMNS includes `appointment_fee_minor`) | source (persistence) | Phase 3 — drop from SELECT once column removed |
| B3 | `backend/src/services/doctor-settings-service.ts:58` (DEFAULT_SETTINGS) | source (defaults) | Phase 3 |
| B4 | `backend/src/services/doctor-settings-service.ts:415` (`UpdateDoctorSettingsPayload.appointment_fee_minor`) | source (PATCH payload) | Phase 3 — remove from payload once DB migration lands |
| B5 | `backend/src/services/doctor-settings-service.ts:464–468` (payload value validation) | source (input validation) | Phase 3 |
| B6 | `backend/src/services/doctor-settings-service.ts:538` (`allowedKeys` for update) | source (write path) | Phase 3 |
| B7 | `backend/src/services/doctor-settings-service.ts:561` (SELECT_COLUMNS for pre-fetch) | source (internal pre-fetch) | Phase 3 |
| B8 | `backend/src/services/doctor-settings-service.ts:691` (`SingleFeeSyncExistingRow` pick) | seed (Task 09 sync trigger) | Phase 3 |
| B9 | `backend/src/services/doctor-settings-service.ts:741–753` (fee-changed detection + effectiveFee) | seed (Task 09 sync logic) | Phase 3 — replace with catalog-internal seed when builder migrates |
| B10 | `backend/src/services/doctor-settings-service.ts:780` (`appointment_fee_minor: effectiveFee` in builder input) | seed (Task 09 builder call) | Phase 3 |
| B11 | `backend/src/services/doctor-settings-service.ts:815` (`appointment_fee_minor: row.appointment_fee_minor` in lazy materialization) | seed (Task 09 lazy builder call) | Phase 3 |
| B12 | `backend/src/utils/single-fee-catalog.ts:55` (`DEFAULT_PRICE_MINOR` doc comment) | comment | Update wording when B9/B10/B11 migrate |
| B13 | `backend/src/utils/single-fee-catalog.ts:65` (`SingleFeeCatalogInput` pick includes `appointment_fee_minor`) | seed (Task 09 input type) | Phase 3 |
| B14 | `backend/src/utils/single-fee-catalog.ts:95` (`input.appointment_fee_minor ?? DEFAULT_PRICE_MINOR`) | seed (Task 09 price input) | Phase 3 |
| B15 | `backend/src/utils/validation.ts:747` (zod schema `appointment_fee_minor: z.number().int().min(0).nullable().optional()`) | source (API payload validation) | Phase 3 |
| B16 | `backend/src/utils/errors.ts:121` (`LegacyAppointmentFeeNotConfiguredError` docstring) | comment | Remove in Phase 3 alongside error class |
| B17 | `backend/src/services/consultation-quote-service.ts:401–408` (`const minor = settings?.appointment_fee_minor; ... return { amount_minor: minor, currency };`) | quote (legacy fallback when no catalog) | Phase 2 — replace with catalog lookup; if no catalog, throw `LegacyAppointmentFeeNotConfiguredError` unchanged (gate unchanged) |
| B18 | `backend/src/utils/dm-reply-composer.ts:64` (`appointment_fee_minor: settings?.appointment_fee_minor ?? null` in `feeQuoteSettingsFromDoctorRow`) | render (feeds `ConsultationFeesDmSettings`) | Phase 2 — stop forwarding once all DM composers read catalog |
| B19 | `backend/src/services/slot-selection-service.ts:400` (`const legacyAmount = doctorSettings?.appointment_fee_minor ?? env.APPOINTMENT_FEE_MINOR ?? 0;`) | gate+quote (in-clinic booking amount) | Phase 2 — migrate in-clinic amount to catalog-driven lookup (requires Plan 03 in-clinic catalog decision; see Plan 03 Open Question 3) |
| B20 | `backend/src/utils/consultation-fees.ts:76` (`ConsultationFeesDmSettings.appointment_fee_minor` param type) | render (DM settings adapter) | Phase 2 |
| B21 | `backend/src/utils/consultation-fees.ts:81` (`const minor = settings.appointment_fee_minor` in `formatAppointmentFeeForAiContext`) | render (AI system prompt) | Phase 2 — use catalog modality prices instead |
| B22 | `backend/src/utils/consultation-fees.ts:191` (`ConsultationFeesDmSettings.appointment_fee_minor` param type, dup) | render | Phase 2 — same site as B20 (type re-export) |
| B23 | `backend/src/utils/consultation-fees.ts:1231` (doc comment) | comment | Update wording during B25 migration |
| B24 | `backend/src/utils/consultation-fees.ts:1287` (`const minor = settings.appointment_fee_minor` in `formatConsultationFeesForDmWithMeta`) | render (DM fee block fallback when no catalog) | Phase 2 — catalog-first already lands above; drop fallback once every doctor has catalog (post-Task 09 backfill verified) |
| B25 | `backend/src/services/service-catalog-ai-suggest.ts:18` (docstring "base `appointment_fee_minor`") | comment | Phase 2 |
| B26 | `backend/src/services/service-catalog-ai-suggest.ts:194` (LLM prompt text mentions `appointment_fee_minor`) | render (LLM anchor context) | Phase 2 — switch prompt anchor to catalog base price |
| B27 | `backend/src/services/service-catalog-ai-suggest.ts:324` (`appointmentFeeMinor: settings.appointment_fee_minor`) | render (LLM context builder) | Phase 2 |
| B28 | `backend/src/workers/instagram-dm-webhook-handler.ts:1036–1037` (`settings.appointment_fee_minor != null && settings.appointment_fee_minor > 0`) | gate (AI context "has a fee on file?" branch) | Phase 2 — replace with `catalog has any enabled modality with price_minor > 0` |
| B29 | `backend/src/workers/instagram-dm-webhook-handler.ts:1063` (`appointment_fee_minor: settings.appointment_fee_minor` passed into `formatAppointmentFeeForAiContext`) | render (AI context) | Phase 2 — aligns with B21/B28 migration |

**Exemplar wired to `warnDeprecation` in Phase 1:** B21 (`formatAppointmentFeeForAiContext`) — one of the highest-trafficked render sites. SiteId: `appointment_fee_minor.render.ai_context`.

---

## 5. Frontend call-site table (`frontend/`)

| # | File:line | Classification | Phase 2 migration target |
|---|-----------|----------------|--------------------------|
| F1 | `frontend/types/doctor-settings.ts:13` (doc comment in `CATALOG_MODES` JSDoc) | comment | Update wording when F2/F3 migrate |
| F2 | `frontend/types/doctor-settings.ts:40` (`DoctorSettings.appointment_fee_minor: number | null`) | source (type) | Phase 3 — remove from API response type after backend column drop |
| F3 | `frontend/types/doctor-settings.ts:97` (`PatchDoctorSettingsPayload.appointment_fee_minor: number | null`) | source (PATCH payload type) | Phase 3 |

**No frontend UI component today reads `appointment_fee_minor` directly** — grep across `frontend/app` and `frontend/components` returns zero hits. All doctor-side fee editing flows go through the catalog editor; patient-facing surfaces are not in the frontend (they ship via the backend DM worker).

The type mirror stays until Phase 3 so the API envelope can keep returning the field during Phase 2's cross-phase coexistence window.

---

## 6. Exemplar wiring rationale

Only **one** site is wired to `warnDeprecation` in Phase 1 (B21 / `formatAppointmentFeeForAiContext`) because:

- We want to confirm the env-gated dedup helper works in dev/staging without adding noise to unrelated migrations.
- The chosen site runs on every DM worker reply that builds AI context — high traffic, easy to visually confirm in dev logs after a single patient message.
- It is a pure read site (no control-flow mutation), so the `warnDeprecation` call cannot introduce regressions.

Phase 2 will add warnings to every remaining `render`/`gate`/`quote` site as each migration starts.

---

## 7. How Phase 2 tasks should read this doc

1. Pick the next row in the table (priority: gate → quote → render).
2. Open the file:line and the row's Phase 2 migration target.
3. Replace the legacy read with the catalog-driven equivalent. Use `getActiveServiceCatalog(settings)` + `findServiceOfferingByKey(catalog, 'consultation')` for single-fee doctors (the Task 09 catalog always has this key) and the appropriate matched offering for multi-service doctors.
4. Run the file's existing unit tests; add a test that exercises both single-fee and multi-service paths.
5. Strike the row from this doc (keep the table append-only; add a ✅ column as rows migrate).
6. If the migration uncovers a latent bug, log it to `docs/capture/inbox.md`; do not fix it in the migration PR.

---

## 8. Related references

- [Plan 03 — Single-fee vs multi-service mode](../Daily-plans/April%202026/16-04-2026/Plans/plan-03-single-fee-vs-multi-service-mode.md)
- [Task 08 — `catalog_mode` database field](../Daily-plans/April%202026/16-04-2026/Tasks/task-08-catalog-mode-database-field.md)
- [Task 09 — Auto-generated single-service catalog](../Daily-plans/April%202026/16-04-2026/Tasks/task-09-auto-single-service-catalog.md)
- [Task 10 — Mode-aware pipeline skip](../Daily-plans/April%202026/16-04-2026/Tasks/task-10-mode-aware-pipeline-skip.md)
- `backend/src/utils/service-catalog-schema.ts` — `ServiceCatalogV1`, `findServiceOfferingByKey`
- `backend/src/utils/service-catalog-helpers.ts` — `getActiveServiceCatalog`
- `backend/src/utils/single-fee-catalog.ts` — Task 09 single-fee builder (the persistent `seed` consumer)
