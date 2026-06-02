# Plan 03 — Single-fee vs multi-service mode

## Proper first-class paths for "one fee for everything" and "per-service pricing"

**Goal:** Replace the implicit, tangled "legacy flat fee vs structured catalog" distinction with an explicit `catalog_mode` choice that doctors make during practice setup. Single-fee mode is **not** a fallback — it's a proper path with its own UI, its own data shape, and zero service-matching complexity.

**Companion plans:**
- [plan-01-service-matching-accuracy.md](./plan-01-service-matching-accuracy.md) — Matcher fixes, learning loop, scope mode **(SHIPPED 2026-04-16, Tasks 01–05)**
- [plan-02-ai-catalog-setup.md](./plan-02-ai-catalog-setup.md) — AI auto-fill, quality checks **(SHIPPED 2026-04-16, Tasks 06–07)**

**Status:** Plan 03 SHIPPED 2026-04-16 — all 6 tasks (global 08–13) done. `catalog_mode` column + trigger-protected backfill are live, the single-entry catalog synthesizer is wired into matcher / booking / DM flows, matcher / staff review / all 5 learning services / mixed-complaint clarification short-circuit for `catalog_mode === 'single_fee'`, legacy `appointment_fee_minor` usage is audited + annotated with Phase 1 deprecation warnings, the services-catalog page branches on mode (selector / single-fee editor / untouched multi-service form), mode switches flow through confirmation modals with snapshot / restore-from-backup / start-fresh options, and the Practice Setup landing page now shows a mode-aware Services card with a deterministic catalog-health badge for multi-service doctors. Plan 02 surfaces remain gated to `multi_service` only; Plan 01's five accuracy tasks remain gated to `multi_service` only.

**Relationship to other plans:** This plan is a **prerequisite** for Plans 01 and 02's full value. When a doctor uses single-fee mode, the matcher, staff review, learning pipeline, and mixed-complaint clarification are irrelevant — there's only one service. Plan 01's five tasks therefore apply only to `multi_service` doctors. Plan 02's AI catalog features (starter generator, per-card auto-fill, catalog review panel, health badges, scope-aware nudges) also apply only to `multi_service` — in `single_fee` mode these UI surfaces are hidden entirely because there are no cards, no hints, and no routing for AI to help with.

---

## The problem today

The system currently distinguishes between two paths **implicitly**, based on whether `service_offerings_json` is null/empty or populated:

| State | What happens |
|-------|-------------|
| `service_offerings_json` is **null** | Legacy path: `appointment_fee_minor` used as flat fee. No service matching. No staff review. `consultation_types` plain-text field shown in DMs. |
| `service_offerings_json` is **populated** | Catalog path: per-service × per-modality pricing. Full matcher pipeline. Staff review for ambiguous matches. Structured catalog shown in DMs. |

**Problems with this:**

1. **No explicit choice.** A doctor with `service_offerings_json = null` isn't deliberately choosing "single fee" — they just haven't set up a catalog yet. The system can't tell the difference between "I want one fee for everything" and "I haven't gotten around to setting up services."

2. **The frontend auto-creates a catch-all service.** When `service_offerings_json` is null, `services-catalog/page.tsx` creates a `catchAllServiceDraft()` — a blank "Other" card. This is confusing: is the doctor setting up a catalog or not?

3. **Legacy `appointment_fee_minor` is a completely separate code path.** Fee display, booking, payment, slot selection — all have branches that check "is catalog present?" and take different paths. Any bug fix or feature has to be applied twice.

4. **Migration is unclear.** Doctors currently on the legacy flat fee have no guided path to either stay on single-fee intentionally or upgrade to multi-service.

5. **The code is scattered.** At least 15 backend files check `getActiveServiceCatalog`, `isTeleconsultCatalogAuthoritative`, or `service_offerings_json == null` to decide behavior. Each has its own branching logic.

---

## The solution: `catalog_mode` as a first-class field

### Core idea

Add a `catalog_mode` field to `doctor_settings`:

```typescript
type CatalogMode = 'single_fee' | 'multi_service';
```

- **`single_fee`:** The doctor charges one price for all consultations. The system internally creates and maintains a **single-service catalog** (a "Consultation" service with the doctor's fee and all their enabled modalities). No service matching. No staff review. Patients see a simple fee quote.

- **`multi_service`:** The doctor has multiple service types with different pricing. Full catalog, full matcher, full staff review. This is the current "structured catalog" path, enhanced by Plans 01 and 02.

**Key architectural decision:** In `single_fee` mode, we still use the catalog data structure internally — a single-entry `ServiceCatalogV1`. This means booking, payment, slot selection, and fee display all go through the **same code path** as multi-service. The only difference is: matcher is skipped (only one service to "match"), and staff review is skipped (no ambiguity possible).

This eliminates the legacy `appointment_fee_minor`-only path. All doctors have a catalog; single-fee doctors just have a one-entry catalog that the system manages for them.

---

## Design principles

1. **Single-fee is not a fallback, it's a choice.** The doctor explicitly selects it. The UI reflects it. The data model represents it.

2. **One data path, two UX modes.** Both modes use `ServiceCatalogV1` internally. Code that reads the catalog doesn't need to care about the mode — it always gets a valid catalog. The mode only affects: (a) UI complexity, (b) whether the matcher runs, (c) whether staff review triggers.

3. **Zero cognitive load for single-fee.** Doctor sees: "What's your consultation fee?" → enters one number → done. No service cards, no modalities matrix, no keywords. The system creates the catalog entry behind the scenes.

4. **Smooth upgrade path.** A doctor on single-fee who starts wanting per-service pricing can switch to multi-service. Their existing single-service entry becomes the first card in the catalog, and they can add more.

5. **Smooth downgrade path.** A doctor who realizes multi-service is overkill can switch to single-fee. They pick which fee to keep (or enter a new one), and the catalog is collapsed to one entry.

---

## What changes

### Task 01: Database — add `catalog_mode` field

**Migration:**
- Add column `catalog_mode TEXT DEFAULT NULL` to `doctor_settings`.
- Valid values: `'single_fee'`, `'multi_service'`, or `NULL` (legacy, treated as needing migration).

**Migration strategy for existing doctors:**
- `service_offerings_json IS NOT NULL` and has ≥2 services → `catalog_mode = 'multi_service'`
- `service_offerings_json IS NOT NULL` and has exactly 1 service → `catalog_mode = 'single_fee'` (they effectively have one service anyway)
- `service_offerings_json IS NULL` and `appointment_fee_minor IS NOT NULL` → `catalog_mode = 'single_fee'` + auto-create a single-service catalog from `appointment_fee_minor`
- `service_offerings_json IS NULL` and `appointment_fee_minor IS NULL` → `catalog_mode = NULL` (incomplete setup, prompt in frontend)

**Type update in `doctor-settings.ts`:**
```typescript
export type CatalogMode = 'single_fee' | 'multi_service';

export interface DoctorSettingsRow {
  // ... existing fields ...
  catalog_mode: CatalogMode | null;
}
```

**Files touched:**
- New migration SQL file
- `backend/src/types/doctor-settings.ts` — add `CatalogMode` type and field
- `backend/src/services/doctor-settings-service.ts` — include in PATCH, add validation
- `frontend/types/doctor-settings.ts` — mirror type

---

### Task 02: Backend — auto-generated single-service catalog

When `catalog_mode = 'single_fee'`, the system must maintain a single-entry `ServiceCatalogV1` automatically.

**New utility: `buildSingleFeeCatalog(settings: DoctorSettingsRow): ServiceCatalogV1`**

This function creates a catalog with one service:
- **label:** "Consultation" (or `practice_name + " Consultation"` if practice name is set)
- **service_key:** `"consultation"` (reserved, not `CATALOG_CATCH_ALL_SERVICE_KEY`)
- **modalities:** All modalities enabled in `consultation_types`, each priced at `appointment_fee_minor`
- **matcher_hints:** Not needed (single service, matcher won't run). Emit an empty hints object so schema validation (`serviceOfferingV1Schema`) stays happy — do **not** run Plan 01 Task 02's deterministic empty-hints check against this entry because the matcher is bypassed upstream.
- **scope_mode:** Leave `undefined` (which `resolveServiceScopeMode` treats as `'flexible'`). The field must stay schema-valid because Plan 01 Task 04 made `scope_mode` a first-class field on every offering, but its value is irrelevant in `single_fee` mode since the matcher skip in Task 03 short-circuits before scope mode is read.
- **service_id:** deterministic UUID derived from `doctor_id` (so it's stable across rebuilds)

**When to build/rebuild:**
- On `catalog_mode` set to `single_fee` (initial selection or switch from multi-service)
- On `appointment_fee_minor` update while in `single_fee` mode (price synced to the catalog entry)
- On `consultation_types` update while in `single_fee` mode (modality changes synced)

**Where to store:** Same `service_offerings_json` column. The catalog is a real catalog; it just has one entry.

**Files touched:**
- `backend/src/utils/` — new `single-fee-catalog.ts` utility
- `backend/src/services/doctor-settings-service.ts` — PATCH handler auto-rebuilds catalog when in single-fee mode
- `backend/src/utils/service-catalog-helpers.ts` — `getActiveServiceCatalog` continues to work unchanged (it returns the catalog regardless of mode)

---

### Task 03: Backend — mode-aware matcher / review / learning / clarification skip

When `catalog_mode = 'single_fee'`, every pipeline Plan 01 hardened becomes a no-op because there's only one service to route to:

**Service matching:**
- `enrichStateWithServiceCatalogMatch` in `instagram-dm-webhook-handler.ts` should check `catalog_mode`.
- If `single_fee`: skip the matcher entirely, auto-assign the single service with `confidence: 'high'` and `autoFinalize: true`.
- The single service key is always `"consultation"` (from Task 02). `resolveServiceScopeMode` is not consulted because the matcher never runs.

**Staff review:**
- Skip staff review queue insertion for `single_fee` mode — there's no ambiguity.
- `service-staff-review-service.ts` guard: if `catalog_mode === 'single_fee'`, return early from `createStaffReviewIfNeeded` (or equivalent).

**Learning pipeline (Plan 01 Task 03 shipped three services that all need the guard):**
- `service-match-learning-ingest.ts` — skip example ingestion on reassign (nothing to learn).
- `service-match-learning-assist.ts` — skip prefix/pattern assist during matching (matcher is off anyway; belt-and-braces).
- `service-match-learning-autobook.ts` — skip autobook-candidate evaluation.
- Shadow evaluator (`service-match-learning-shadow.ts`) and policy service (`service-match-learning-policy-service.ts`) should also short-circuit so the telemetry stays clean.

**Mixed-complaint clarification (Plan 01 Task 05 shipped `complaint-clarification.ts`):**
- Skip the clarification prompt in `single_fee` mode — there's only one service, so "which of these services does your complaint match?" has no meaning.
- `complaint-clarification.ts` guard: if `catalog_mode === 'single_fee'`, return `{ shouldAsk: false }` (or whatever the current early-return shape is) before LLM invocation.

**Fee display:**
- `consultation-fees.ts` — `formatConsultationFeesForDm*` already handles single-service catalogs correctly (shows one row). No change needed here because the catalog is a real catalog.
- `formatAppointmentFeeForAiContext` — the "legacy flat fee" qualifier should not appear when the doctor is in `single_fee` mode with a proper catalog.
- `isTeleconsultCatalogAuthoritative` — double-check it still returns `true` for a one-entry `single_fee` catalog; it should (the authority check is on presence of a valid catalog, not on cardinality).

**Files touched:**
- `backend/src/workers/instagram-dm-webhook-handler.ts` — mode check before matcher
- `backend/src/services/service-staff-review-service.ts` — mode guard
- `backend/src/services/service-match-learning-ingest.ts` — mode guard
- `backend/src/services/service-match-learning-assist.ts` — mode guard
- `backend/src/services/service-match-learning-autobook.ts` — mode guard
- `backend/src/services/service-match-learning-shadow.ts` — mode guard (telemetry)
- `backend/src/services/service-match-learning-policy-service.ts` — mode guard
- `backend/src/utils/complaint-clarification.ts` — mode guard
- `backend/src/utils/consultation-fees.ts` — adjust legacy fee qualifier wording
- `backend/src/services/slot-selection-service.ts` — verify single-service handling works (likely already does via `resolveCatalogServiceKeyForSlotBooking`)

---

### Task 04: Backend — deprecate `appointment_fee_minor`-only path

Once `catalog_mode` and the auto-generated catalog are in place, the legacy path where `service_offerings_json` is null but `appointment_fee_minor` is set should be **migrated away**.

**Deprecation strategy (phased):**

Phase 1 (this plan): The migration in Task 01 auto-creates catalogs for legacy doctors. After migration, all doctors with a fee have a catalog. The old `if (!catalog) { use appointment_fee_minor }` branches still work but should not be hit for any migrated doctor.

Phase 2 (future, after migration is validated): Add warnings in code for the legacy path — log when it's hit, so we can verify no one is still on it.

Phase 3 (future, after Phase 2 data confirms): Remove the legacy branches. `appointment_fee_minor` becomes a "last known flat fee" for reference only, not used for pricing.

**Not changing in this plan:**
- `appointment_fee_minor` column is NOT dropped — it stays as the source of truth for the fee amount in single-fee mode, synced to the catalog entry.
- `consultation_types` plain-text field stays for now (some doctors use it for non-pricing info).

**Files that currently have legacy branches (audit for future cleanup):**
- `backend/src/utils/consultation-fees.ts` — `formatConsultationFeesForDmWithMeta` checks `service_offerings_json != null` before catalog path
- `backend/src/utils/consultation-fees.ts` — `formatAppointmentFeeForAiContext` has "legacy flat fee" wording
- `backend/src/workers/instagram-dm-webhook-handler.ts` — multiple `!catalog` / `!catalog.services.length` checks
- `backend/src/services/consultation-quote-service.ts` — quote generation with/without catalog
- `backend/src/utils/public-booking-payment-gate.ts` — payment amount resolution
- `backend/src/services/care-episode-service.ts` — episode creation
- `backend/src/utils/dm-reply-composer.ts` — reply formatting

---

### Task 05: Frontend — mode selector in practice setup

**New UI in services catalog page (`services-catalog/page.tsx`):**

When a doctor first visits the services catalog page (or has `catalog_mode = null`):

> **How do you charge for consultations?**
> 
> [Single fee] — One price for all consultations (₹X for text, voice, and video)
> 
> [Multiple services] — Different services at different prices (e.g., "NCD Follow-up" at ₹500, "Skin Consultation" at ₹800)

**Single-fee mode UI (after selection):**

Simplified view, no service cards editor:

> **Your consultation fee**
> 
> [₹______] per consultation
> 
> **Available modalities:**
> [x] Text  [x] Voice  [x] Video
> _(based on your global consultation types setting)_
> 
> [Save]
> 
> ---
> _Need different prices for different services?_ [Switch to multiple services →]

**Multi-service mode UI (after selection):**

The current `ServiceCatalogEditor` experience, enhanced by the Plan 02 features that shipped on 2026-04-16:
- AI sparkle / starter catalog (`POST /api/v1/catalog/ai-suggest { mode: 'single_card' | 'starter' }`)
- "Review my catalog" button and auto-prompt on save (`mode: 'review'`)
- Per-card health badges (`CatalogCardHealthBadge`)
- Scope-aware empty-hints nudge in the drawer (`ServiceOfferingDetailDrawer`)

> _Only need one fee for everything?_ [Switch to single fee →]

**Plan 02 UI gating (important):** All of the surfaces above are **hidden** in `single_fee` mode:
- No "Review my catalog" button (there's one card, nothing to review).
- No `CatalogReviewPanel` mount (pass `null`/skip).
- No `CatalogCardHealthBadge` column (the one auto-generated entry is always healthy by construction).
- No scope-aware empty-hints nudge in the drawer (there is no drawer — single-fee uses the simplified inline editor).
- No "Fill with AI" / starter catalog prompts — they only appear when the doctor is choosing / is in `multi_service`.

The `services-catalog/page.tsx` conditional rendering should be a single top-level branch on `catalogMode`.

**Switching between modes:**
- **Single → Multi:** Current fee becomes the first service card ("Consultation"). Doctor is prompted: "Your ₹X consultation is now a service card. You can rename it and add more services." Follow that with an explicit opt-in to the Plan 02 starter catalog (`POST /api/v1/catalog/ai-suggest { mode: 'starter' }`) so they can auto-populate the rest of the catalog. Do **not** auto-fire the starter — the first card is already populated, so wait for the doctor to click. The starter response is rendered in the existing Plan 02 diff/draft-review flow.
- **Multi → Single:** Doctor is warned: "This will merge all your services into one consultation fee. Which fee should we use?" Shows a radio list of their current fees, plus "Enter a new fee." Existing cards are not deleted — they're kept in `service_offerings_json` as a backup with a `_backup_pre_single_fee` flag so they can be restored if the doctor switches back. Any unsaved Plan 02 review-panel state (pending fix suggestions, `serverReviewIssues`) should be cleared on the switch so the switch-back doesn't resurface stale issues.

**Files touched:**
- `frontend/app/dashboard/settings/practice-setup/services-catalog/page.tsx` — mode selector, simplified single-fee editor, switch controls, gate Plan 02 review panel + badges + AI prompts on `catalogMode === 'multi_service'`
- `frontend/lib/service-catalog-drafts.ts` — utility for mode switching (merge/split)
- `frontend/components/practice-setup/ServiceCatalogEditor.tsx` — minor: show "switch to single fee" link at bottom
- `frontend/components/practice-setup/ServiceOfferingDetailDrawer.tsx` — no-op if catalog mode is single-fee (drawer shouldn't open), but guard the scope-aware nudge banner just in case
- `frontend/components/practice-setup/CatalogReviewPanel.tsx` / `CatalogCardHealthBadge.tsx` — don't mount in single-fee mode (gating happens in the page, not inside these components)
- `frontend/types/doctor-settings.ts` — `CatalogMode` type

---

### Task 06: Frontend — practice setup landing page update

The practice setup landing page (`practice-setup/page.tsx`) currently shows a "Services catalog" card. Update it to reflect the mode:

- **Single-fee mode:** Card shows "Consultation fee: ₹X" with a small "Change" link. No health summary (single-fee is always healthy by construction).
- **Multi-service mode:** Card shows "X services configured" with a "Manage" link. Optionally, surface a tiny health summary derived from `runLocalCatalogChecks` (Plan 02 Task 07 deterministic checks, client-side only) — e.g., "⚠️ 2 services need review" linking into the catalog editor with the review panel auto-opened.
- **No mode set:** Card shows "Set up your consultation fees" with a "Get started" link.

**Files touched:**
- `frontend/app/dashboard/settings/practice-setup/page.tsx` — conditional card content
- `frontend/lib/catalog-quality-local.ts` — reused read-only to compute the multi-service summary badge (no server call)

---

## Task files summary

Local IDs are used in this plan for readability; task files under `../Tasks/` continue the global sequence from `task-08-` onward (Plan 01 used `task-01` through `task-05`, Plan 02 used `task-06` and `task-07`).

| Local # | Global # | Task file | Effort | Risk |
|---|---|------|--------|------|
| 01 | 08 | [task-08 — `catalog_mode` database field](../Tasks/task-08-catalog-mode-database-field.md) ✅ Done 2026-04-16 | Small | Low — additive column |
| 02 | 09 | [task-09 — Auto-generated single-service catalog](../Tasks/task-09-auto-single-service-catalog.md) ✅ Done 2026-04-16 | Medium | Low — new utility, existing catalog format |
| 03 | 10 | [task-10 — Mode-aware pipeline skip](../Tasks/task-10-mode-aware-pipeline-skip.md) ✅ Done 2026-04-16 | Medium | Medium — touches matcher, review, all 5 learning services, clarification |
| 04 | 11 | [task-11 — Legacy fee path deprecation (Phase 1)](../Tasks/task-11-legacy-fee-path-deprecation.md) ✅ Done 2026-04-16 — audit + [`legacy-appointment-fee-minor-deprecation.md`](../../../Architecture/legacy-appointment-fee-minor-deprecation.md) + `@deprecated` JSDoc + `DEPRECATION_WARNINGS_ENABLED` flag + `warnDeprecation` helper wired at `formatAppointmentFeeForAiContext` | Small (Phase 1 only) | Low — audit + annotation, no behavior change |
| 05 | 12 | [task-12 — Frontend mode selector](../Tasks/task-12-frontend-mode-selector.md) ✅ Done 2026-04-16 — `CatalogModeSelector` + `SingleFeeCatalogEditor` + `ModeSwitchConfirmDialog` + client-side `consultation_types` parser mirror; mode-branching shell at `services-catalog/page.tsx` with multi-service subtree untouched; Plan 02 surfaces gated by conditional render; post-save `runServerReview` gated on `catalog_mode !== 'single_fee'`; Playwright smoke `services-catalog-mode.spec.ts` | Medium–Large | Low — new UI, isolated changes; gates Plan 02 surfaces |
| 06 | 13 | [task-13 — Practice setup landing card](../Tasks/task-13-practice-setup-landing-card.md) ✅ Done 2026-04-16 — `describeServicesCardState` pure helper at `frontend/lib/practice-setup-card.ts` + new client `ServicesLandingCard` replacing the static Services row; three-mode copy (`Choose how you charge…` / `Single fee: ₹500 · Text + Video` / `N services configured · M need attention`) with deterministic amber health badge driven by `runLocalCatalogChecks`; mode-specific icon swap (dollar / help-circle / stacked sheet); Playwright smoke `practice-setup-landing.spec.ts` | Small | Low — display-only |

**Suggested order:** 01 → 02 → 03 (backend foundation) → 04 (cleanup) → 05 → 06 (frontend).

**Rationale:** The database migration and auto-catalog builder must be in place before the backend can skip matcher / review / learning / clarification for single-fee. Frontend builds on the backend mode field and conditionally hides the Plan 02 review + badge UI.

---

## Integration with Plan 01 and Plan 02

| When `catalog_mode` is... | Plan 01 (matching accuracy) | Plan 02 (AI catalog setup) |
|---------------------------|---------------------------|---------------------------|
| `single_fee` | **Skipped entirely.** No matcher, no staff review, no learning ingest/assist/autobook/shadow, no mixed-complaint clarification. All Plan 01 Task 01–05 code paths short-circuit on the mode check added in Plan 03 Task 03. | **Skipped entirely.** No AI auto-fill (sparkle / starter), no `CatalogReviewPanel`, no `CatalogCardHealthBadge`, no scope-aware drawer nudge. (No cards to fill, no routing to audit.) |
| `multi_service` | **Fully active.** All 5 Plan 01 tasks apply. | **Fully active.** All Plan 02 features apply: `single_card` / `starter` / `review` AI modes, quality checks, per-card badges, drawer nudges. |
| `null` (un-migrated) | Current behavior (broken, motivates Plan 01). | AI starter catalog available the moment the doctor picks "Multiple services" in the mode selector. |

The frontend mode selector (Task 05) should show the Plan 02 AI starter catalog prompt **inline** when the doctor chooses "Multiple services":
> **Multiple services** — Different services at different prices.
> _AI can generate a starter catalog based on your specialty._ [Generate starter catalog]

The "Generate starter catalog" button calls the already-shipped `POST /api/v1/catalog/ai-suggest { mode: 'starter' }`. This connects Plan 03 and Plan 02 naturally.

---

## Open questions

1. **Should `consultation_types` plain-text field be removed?** Not yet. Some doctors use it for notes beyond fee info. Keep it, but deprioritize it in the UI when a catalog (single or multi) exists.

2. **Price sync direction in single-fee mode:** If the doctor changes `appointment_fee_minor` via the booking rules page, should it auto-update the catalog entry? **Recommendation:** Yes — in single-fee mode, `appointment_fee_minor` is the source of truth and the catalog is derived. But show a toast: "Your consultation fee has been updated to ₹X."

3. **What about the existing `catchAllServiceDraft()` logic?** After this plan, the catch-all draft is no longer needed as the "default empty state." It may still be useful as the fallback service in multi-service mode (the "Other" card). Plan 01 Task 04 made catch-all rows default to `scope_mode: 'flexible'` (strict catch-alls are the `flexible_should_be_strict` deterministic warning from Plan 02 Task 07). Refactor: only use `catchAllServiceDraft()` when `catalog_mode === 'multi_service'` and there's no explicit "Other" service, preserving the `flexible` default.

4. **Per-modality pricing in single-fee mode:** Should single-fee allow different prices for text/voice/video? **Recommendation:** Start with a single price across all modalities (the simplest possible UX). Plan 02's `single_card` AI mode already generates per-modality pricing for multi-service; if doctors ask for it in single-fee, add an "Advanced: per-modality pricing" expander that flips `single_fee` into a degenerate 1-card `multi_service` rather than growing the single-fee schema. This keeps single-fee mode genuinely simple.

5. **What about doctors who only do in-person?** They don't need a teleconsult catalog at all. **Recommendation:** `catalog_mode` applies to teleconsult only. In-person/OPD pricing is a separate system (`opd_mode` etc.). Make this clear in the UI: "This sets your **online/teleconsult** consultation fees."

---

## Deferred (explicit)

| Item | Reason |
|------|--------|
| **Full removal of legacy `appointment_fee_minor`-only branches** | Phase 3 — needs data validation that migration is complete |
| **Per-modality pricing in single-fee mode** | Keep single-fee simple initially; add if doctors request it |
| **Catalog mode in API responses** | Include `catalog_mode` in public-facing APIs only when needed for patient-facing booking page |

---

## References

**Plan 03 touches / owns:**
- **Doctor settings type:** `backend/src/types/doctor-settings.ts`
- **Doctor settings service:** `backend/src/services/doctor-settings-service.ts`
- **Catalog helpers:** `backend/src/utils/service-catalog-helpers.ts` (`getActiveServiceCatalog`)
- **Catalog schema / scope mode:** `backend/src/utils/service-catalog-schema.ts` (`SERVICE_SCOPE_MODES`, `resolveServiceScopeMode`)
- **Fee formatting:** `backend/src/utils/consultation-fees.ts` (`isTeleconsultCatalogAuthoritative`, `formatConsultationFeesForDm*`)
- **Webhook handler:** `backend/src/workers/instagram-dm-webhook-handler.ts`
- **Frontend catalog page:** `frontend/app/dashboard/settings/practice-setup/services-catalog/page.tsx`
- **Frontend practice setup:** `frontend/app/dashboard/settings/practice-setup/page.tsx`
- **Slot selection:** `backend/src/services/slot-selection-service.ts`
- **Payment gate:** `backend/src/utils/public-booking-payment-gate.ts`

**Plan 01 artifacts Plan 03 must gate in `single_fee` mode:**
- `backend/src/services/service-staff-review-service.ts` (Task 01 prompt + Task 04 scope-aware review)
- `backend/src/services/service-match-learning-ingest.ts` (Task 03 ingest on reassign)
- `backend/src/services/service-match-learning-assist.ts` (Task 03 prefix/pattern assist)
- `backend/src/services/service-match-learning-autobook.ts` (Task 03 autobook eligibility)
- `backend/src/services/service-match-learning-shadow.ts`, `service-match-learning-policy-service.ts` (Task 03 telemetry)
- `backend/src/utils/complaint-clarification.ts` (Task 05 mixed-complaint clarification)
- `backend/src/utils/service-catalog-deterministic-match.ts` (Task 02 empty-hints fix — effectively dead code in single-fee)

**Plan 02 artifacts Plan 03 must hide in `single_fee` mode:**
- `backend/src/services/service-catalog-ai-suggest.ts` (Task 06 — `single_card` / `starter` / `review` endpoint; still callable but frontend should not trigger it)
- `backend/src/types/catalog-quality-issues.ts` + `frontend/lib/catalog-quality-issues.ts` + `frontend/lib/catalog-quality-local.ts` (Task 07 schemas — no invocation in single-fee)
- `frontend/components/practice-setup/CatalogReviewPanel.tsx` (Task 07 — don't mount)
- `frontend/components/practice-setup/CatalogCardHealthBadge.tsx` (Task 07 — don't mount)
- `frontend/components/practice-setup/ServiceCatalogEditor.tsx` (Task 06/07 — replaced by simplified single-fee editor)
- `frontend/components/practice-setup/ServiceOfferingDetailDrawer.tsx` (Task 07 scope-aware nudge — drawer is not used in single-fee)

---

**Last updated:** 2026-04-16 (revised post-Plan-01/02 shipping)
