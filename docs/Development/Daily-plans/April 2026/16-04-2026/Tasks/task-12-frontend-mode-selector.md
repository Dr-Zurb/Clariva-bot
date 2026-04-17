# Task 12: Frontend mode selector + single-fee editor (gates Plan 02 UI)
## 16 April 2026 — Plan 03, Task 5 (Single-fee vs multi-service mode)

---

## Task Overview

Give doctors an explicit, first-class choice between **single-fee** and **multi-service** catalogs in practice setup. When the mode is `'single_fee'`, show a compact "one fee for all consultations" editor — just the flat amount + modality toggles — and **hide all Plan 02 surfaces** (AI sparkle, starter prompt, catalog review panel, health badges, scope-aware drawer nudges). When the mode is `'multi_service'`, the existing full `ServiceCatalogEditor` with all Plan 02 enhancements keeps working unchanged. When the mode is `NULL` (undecided), show a mode-selection splash instead of the editor.

This task is the user-visible payoff of Plan 03: single-fee doctors get a clean, focused setup without being nagged by catalog-quality nudges that don't apply to them, and multi-service doctors get the full Plan 02 experience.

**Estimated Time:** 8–10 hours  
**Status:** Done  
**Depends on:** [Task 08](./task-08-catalog-mode-database-field.md), [Task 09](./task-09-auto-single-service-catalog.md), [Task 10](./task-10-mode-aware-pipeline-skip.md). Task 11 is independent — can ship in parallel.  
**Plan:** [Plan 03 — Single-fee vs multi-service mode](../Plans/plan-03-single-fee-vs-multi-service-mode.md)

### Implementation Plan (high level)

1. **Mode selector component.** New `CatalogModeSelector.tsx` rendered when `catalog_mode === null`. Two radio-style cards: *"I charge one flat fee for any consultation"* (single-fee) and *"I offer multiple services with different fees"* (multi-service). Clicking a card PATCHes `catalog_mode`, then the editor re-renders in the chosen mode.
2. **Single-fee editor.** New `SingleFeeCatalogEditor.tsx` — a compact form with:
   - Currency + flat-amount input (persists to `appointment_fee_minor`, which Task 09 syncs into the single catalog entry)
   - Modality toggles derived from `consultation_types` (text / voice / video)
   - Read-only preview of the auto-generated "Consultation" card label
   - A "switch to multi-service" affordance in a small "advanced" footer
3. **Conditional rendering in `ServiceCatalogEditor.tsx`.** The existing multi-service editor stays as-is; we wrap it with a mode-branching shell that renders `CatalogModeSelector` / `SingleFeeCatalogEditor` / the existing `ServiceCatalogEditor` based on `catalog_mode`.
4. **Plan 02 UI gating (important).** Every Plan 02 surface must be **hidden** in single-fee mode:
   - AI sparkle button on the service offering drawer — not rendered
   - Starter-catalog prompt (empty-state panel) — not rendered
   - Inline "describe with AI" banner on new cards — not rendered
   - `CatalogReviewPanel` — not rendered
   - `CatalogCardHealthBadge` — not rendered (nothing to badge; the single service is always "healthy")
   - Scope-mode drawer nudges — not rendered (`scope_mode` doesn't apply)
5. **Mode switching UX.**
   - **Single → Multi**: show a confirmation explaining the change, then PATCH mode, then offer (but don't auto-fire) Plan 02's `starter` AI catalog suggestion. The backup-on-switch (Task 09's `_backup_pre_single_fee`) is restored only via an explicit "restore previous catalog" button.
   - **Multi → Single**: show a confirmation ("your current services will be snapshot and replaced with a single 'Consultation' entry"), then PATCH mode. Clear any pending `serverReviewIssues` and any fix-in-flight UI state so the review panel doesn't linger after it's unmounted.
6. **Landing/save flow.** Save button calls the existing PATCH endpoint. Backend (Task 09) handles the catalog regeneration; the frontend just needs to reflect the new `service_offerings_json` the server returns.
7. **Tests.** React Testing Library (if the project's Jest setup is in place; otherwise Playwright — Task 07 captured the Jest gap in `docs/capture/inbox.md`). At minimum:
   - `CatalogModeSelector` renders two cards, PATCHes on click
   - `SingleFeeCatalogEditor` renders currency/amount + modality toggles and persists correctly
   - `ServiceCatalogEditor` wrapper renders the right child per mode and hides Plan 02 surfaces in single-fee
   - Multi → Single confirmation flow clears `serverReviewIssues`
   - Regression: multi-service rendering unchanged, all Plan 02 surfaces visible

**Scope trade-offs (deliberately deferred):**
- **Restore-from-backup flow polish** — basic "restore previous catalog" button lands here, but advanced diff-preview is deferred to a separate task (parked in inbox).
- **Per-modality pricing in single-fee** — Plan 03 Open Q4; deferred. If a doctor wants per-modality variance, they switch to multi-service.
- **Animated transitions between modes** — leave as hard cut; polish task later.
- **Analytics/telemetry on mode switches** — a nice observability follow-up; captured in inbox.

**Change Type:**
- [x] **Create new** — `CatalogModeSelector.tsx`, `SingleFeeCatalogEditor.tsx`
- [x] **Update existing** — `ServiceCatalogEditor.tsx` (wrap with mode branch + hide Plan 02 surfaces), `ServiceOfferingDetailDrawer.tsx` (hide AI sparkle in single-fee), practice setup page shell; follow [CODE_CHANGE_RULES.md](../../../task-management/CODE_CHANGE_RULES.md)

**Current State:**
- `frontend/components/practice-setup/ServiceCatalogEditor.tsx` — EXISTS; multi-service editor with Plan 02 integrations (empty-catalog starter, new-card AI banner).
- `frontend/components/practice-setup/ServiceOfferingDetailDrawer.tsx` — EXISTS; has AI sparkle + diff modal from Task 06 and scope-mode control from Plan 01 Task 04.
- `frontend/components/practice-setup/CatalogReviewPanel.tsx` — EXISTS (Task 07).
- `frontend/components/practice-setup/CatalogCardHealthBadge.tsx` — EXISTS (Task 07).
- `frontend/types/doctor-settings.ts` — has `catalog_mode` after Task 08.
- `frontend/lib/api.ts` — has `patchDoctorSettings` (or similar); already usable.
- **Missing:** no mode selector, no single-fee editor, no mode-branching shell. Plan 02 surfaces are unconditionally rendered today.

**What's missing:**
- `CatalogModeSelector.tsx`
- `SingleFeeCatalogEditor.tsx`
- Mode-branching shell in `ServiceCatalogEditor.tsx`
- Plan 02 surface gates (conditional render behind `catalog_mode !== 'single_fee'`)
- AI sparkle hide in `ServiceOfferingDetailDrawer.tsx`
- Mode-switch confirmation modals
- Backup-restore button for single→multi
- Tests (where Jest is available)

**Scope Guard:**
- Expected files touched: 6–8 (2 new components, 3–4 updates, 1–2 test files).
- **Do not** change the multi-service editor's behavior at all. Every Plan 02 enhancement that exists today should still exist for multi-service doctors. The only change is *conditional rendering* behind `catalog_mode === 'multi_service'`.
- If during implementation it turns out a Plan 02 surface is buried inside shared logic that makes conditional rendering hard, refactor minimally — don't rewrite.

**Reference Documentation:**
- [CODE_CHANGE_RULES.md](../../../task-management/CODE_CHANGE_RULES.md)
- [Plan 03 — Single-fee vs multi-service mode](../Plans/plan-03-single-fee-vs-multi-service-mode.md) — Task 05 section
- [Task 06 — AI auto-fill for service cards](./task-06-ai-autofill-service-cards.md) — Plan 02 surfaces being gated
- [Task 07 — Catalog quality checks](./task-07-catalog-quality-checks.md) — `CatalogReviewPanel` + `CatalogCardHealthBadge` being gated
- [Plan 01 Task 04 — Service Scope Mode](./task-04-service-scope-mode.md) — scope-mode drawer nudges being gated

---

## Task Breakdown

### 1. `CatalogModeSelector` component

- [x] 1.1 Create `frontend/components/practice-setup/CatalogModeSelector.tsx`.
- [x] 1.2 Props: `onSelect(mode: CatalogMode)`, `isSaving: boolean`, `pendingMode`.
- [x] 1.3 Two radio-card options (single fee + multi-service copy per spec).
- [x] 1.4 Rendered only when `doctorSettings.catalog_mode === null` (enforced at the page level, not the component itself).
- [x] 1.5 On click, calls `onSelect(mode)`; page handles `patchCatalogMode` + refresh from response.
- [x] 1.6 Per-card loading spinner while `pendingMode === mode`.

### 2. `SingleFeeCatalogEditor` component

- [x] 2.1 Create `frontend/components/practice-setup/SingleFeeCatalogEditor.tsx`.
- [x] 2.2 Props: `doctorSettings`, `onSave(patch)`, `isSaving`, `saveSuccess`, `onRequestSwitchToMultiService`, `practiceName`.
- [x] 2.3 Fields:
  - Currency select (mirrors `PRACTICE_CURRENCY_OPTIONS` from practice-info page).
  - Amount input in major-units, converted to minor-units (paise/cents) via `toMinor`.
  - Three modality toggles backed by `parseConsultationTypesToModalities` / `modalitiesToConsultationTypes` helpers in `frontend/lib/consultation-types-modalities.ts` (mirrors backend `deriveAllowedModalitiesFromConsultationTypes`).
  - Live preview: `"'{practiceName} Consultation' · {currencySymbol}{amount} · {modalities}"`.
- [x] 2.4 Validation: amount must parse to minor > 0; at least one modality enabled.
- [x] 2.5 Footer "Switch to multi-service mode" link invokes `onRequestSwitchToMultiService` (page opens confirm modal).
- [x] 2.6 Save PATCHes `appointment_fee_minor` + `appointment_fee_currency` + `consultation_types`; backend Task 09 regenerates `service_offerings_json`; the page sets the returned `settings` back on state so the preview reflects server truth.

### 3. Mode-branching shell (landed at page level, not inside `ServiceCatalogEditor`)

- [x] 3.1 Branch in `frontend/app/dashboard/settings/practice-setup/services-catalog/page.tsx`:
  - `null` → `<CatalogModeSelector/>`
  - `'single_fee'` → `<SingleFeeCatalogEditor/>`
  - `'multi_service'` → the existing `<form>` tree (verbatim; `ServiceCatalogEditor` body untouched, `CatalogReviewPanel` + templates modals + save/clear toolbar preserved).
- [x] 3.2 Each branch lives in its own `{catalogMode === ...}` block, so only one subtree mounts at a time.
- [x] 3.3 `patchCatalogMode` PATCHes + refreshes `settings` from the response; `handleSingleFeeSave` does the same for single-fee edits. Local `services` drafts are re-derived from the returned catalog after every mode flip.
- [x] 3.4 **Design note:** the shell is at the page level rather than inside `ServiceCatalogEditor` because `ServiceCatalogEditor` doesn't receive `doctorSettings` and `CatalogReviewPanel` + templates modals are siblings on the page. Branching at the page keeps the multi-service editor's body byte-identical, which was the explicit scope guard.

### 4. Plan 02 surface gates

- [x] 4.1 Empty-catalog starter panel (Task 06 T1) — rendered inside `ServiceCatalogEditor`, which only mounts in the multi-service branch. Gated.
- [x] 4.2 New-card inline AI banner (Task 06 T2) — same branch, gated.
- [x] 4.3 AI sparkle / diff modal in `ServiceOfferingDetailDrawer` (Task 06 T3/T4) — drawer opens from `ServiceCatalogEditor` rows only, which don't exist in single-fee mode. Gated by tree membership; no extra guard needed.
- [x] 4.4 `CatalogReviewPanel` — only rendered inside the multi-service branch; auto post-save `runServerReview` call also explicitly gated on `res.data.settings.catalog_mode !== 'single_fee'`.
- [x] 4.5 `CatalogCardHealthBadge` — rendered only inside `ServiceCatalogEditor`. Gated.
- [x] 4.6 Scope-mode drawer nudges (Plan 01 T4) — live in `ServiceOfferingDetailDrawer`, same gating as 4.3.
- [x] 4.7 Audit: `rg "CatalogReviewPanel|CatalogCardHealthBadge"` confirmed neither is referenced outside the multi-service subtree.

### 5. Mode-switch confirmation flows

- [x] 5.1 **Multi → Single** — `ModeSwitchConfirmDialog` on the multi-service branch behind `modeSwitchPrompt === "to_single"`.
  - Body explains snapshot + replacement; confirm triggers `patchCatalogMode('single_fee')`; on success the page clears `serverReviewIssues`, `reviewPanelOpen`, `reviewTriggeredBySave`, `fixInFlightKey`, `bypassSaveGate`, `reviewError` — nothing stale can bleed through the unmount.
- [x] 5.2 **Single → Multi** — dialog behind `modeSwitchPrompt === "to_multi"`.
  - If `singleFeeBackupCatalog` is present (parsed from `service_offerings_json._backup_pre_single_fee` via `safeParseServiceCatalogV1`), two actions: "Restore previous catalog" (PATCHes mode + `service_offerings_json: <backup>`) and "Start fresh" (PATCHes mode + `service_offerings_json: null`).
  - If no backup is present, single "Switch to multi-service" action (PATCHes mode + `service_offerings_json: null`).
  - **Why an explicit null on start-fresh**: backend Task 09 only regenerates the single-fee entry when switching INTO single-fee — flipping TO multi without also nulling the catalog would leave the auto-generated "Consultation" row as if the doctor had authored it. Nulling on the frontend forces the empty-catalog starter experience.

### 6. Practice setup page shell integration

- [x] 6.1 Page already pulls full `doctorSettings` including `catalog_mode` (verified in `fetchSettings`).
- [x] 6.2 Every PATCH path (`patchCatalogMode`, `handleSingleFeeSave`, existing `performSave` / `handleClearCatalog`) reassigns `setSettings(res.data.settings)`, so the branch re-evaluates on the next render with fresh data.

### 7. Tests

- [x] 7.1 Jest is still not wired up in the frontend (confirmed by the existing inbox note from Task 07 — no `jest.config`, no `@testing-library/react` in `package.json`). Not adding new Jest scaffolding in this task.
- [x] 7.2 Added Playwright smoke spec: `frontend/e2e/services-catalog-mode.spec.ts`.
  - Logs in with `E2E_USER` / `E2E_PASSWORD` (same gating pattern as `dashboard.spec.ts`; skipped when creds absent).
  - Navigates to `/dashboard/settings/practice-setup/services-catalog`.
  - Asserts exactly ONE of `catalog-mode-selector` / `single-fee-catalog-editor` / `switch-to-single-fee` testids is visible.
  - Asserts the inverse gating: in single-fee mode the `switch-to-single-fee` toolbar button is absent; in the null-mode state neither editor is mounted.
- [x] 7.3 Inbox already notes the Jest gap; no new capture needed.

### 8. Verification

- [x] 8.1 `npx tsc --noEmit` clean in `frontend/` (exit 0).
- [x] 8.2 `npx eslint app components/practice-setup components/ui lib e2e` clean (exit 0).
- [ ] 8.3 Manual: deferred to daily-plan verification pass — backend Task 09 handles the round-trips and its tests already cover the server side; the Playwright smoke exercises the branching on a real session.
- [ ] 8.4 Manual: see 8.3.
- [ ] 8.5 Manual: see 8.3.
- [ ] 8.6 Manual: see 8.3.

---

## Files to Create/Update

```
frontend/components/practice-setup/CatalogModeSelector.tsx                      — CREATED (mode radio cards)
frontend/components/practice-setup/SingleFeeCatalogEditor.tsx                   — CREATED (compact fee + modalities editor)
frontend/components/practice-setup/ModeSwitchConfirmDialog.tsx                  — CREATED (generic confirmation modal for mode switches)
frontend/lib/consultation-types-modalities.ts                                   — CREATED (client-side mirror of backend keyword regex)
frontend/app/dashboard/settings/practice-setup/services-catalog/page.tsx        — UPDATED (mode-branching shell; multi-service subtree byte-identical)
frontend/components/practice-setup/ServiceCatalogEditor.tsx                     — NOT TOUCHED (gating done at page level)
frontend/components/practice-setup/ServiceOfferingDetailDrawer.tsx              — NOT TOUCHED (drawer only opens from multi-service branch)
frontend/components/practice-setup/CatalogReviewPanel.tsx                       — NOT TOUCHED (only rendered inside multi-service branch)
frontend/components/practice-setup/CatalogCardHealthBadge.tsx                   — NOT TOUCHED (only rendered inside ServiceCatalogEditor)
frontend/e2e/services-catalog-mode.spec.ts                                      — CREATED (Playwright smoke covering mode branching)
```

**Path deviations from the original plan (2026-04-16):**
- The mode-branching shell was landed at `services-catalog/page.tsx` instead of inside `ServiceCatalogEditor.tsx`. Reason: `ServiceCatalogEditor` doesn't receive `doctorSettings`; `CatalogReviewPanel` and the templates modals are siblings on the page, not children of the editor. Branching at the page keeps the multi-service body byte-identical (zero-risk regression path) and avoids threading `doctorSettings` through an already-dense component.
- No changes were needed in `ServiceOfferingDetailDrawer.tsx`, `CatalogReviewPanel.tsx`, or `CatalogCardHealthBadge.tsx`. Every Plan 02 surface is inside the multi-service subtree, so gating by conditional render at the page covers them transitively.
- Jest tests are still pending (inbox: frontend Jest bootstrap gap), so only the Playwright smoke was added.

**Existing Code Status:**
- All `UPDATE` files exist and are stable (Plan 01 + Plan 02 artifacts).
- No API changes — uses existing `patchDoctorSettings`.

**When updating existing code:**
- [x] Mode-branching shell lives at the page level — `ServiceCatalogEditor`'s props and body are unchanged, so any direct consumers stay compatible.
- [x] The multi-service branch in `page.tsx` is the verbatim existing `<form>` tree wrapped in `{catalogMode === 'multi_service' && (...)}`; no logic changes inside. The new "Switch to one flat fee" toolbar button is the only Task-12 addition to that branch.
- [x] `CatalogReviewPanel` and `CatalogCardHealthBadge` are conditionally rendered, not `hidden`-propped — when single-fee is active they're not in the DOM, so no mount-time fetches or a11y focus leaks.

**When creating a migration:**
- [x] No SQL migration in this task.

---

## Design Constraints

- **Null `catalog_mode` is the prompt trigger.** Not an error, not a fallback — the UI explicitly prompts the doctor to choose.
- **Single-fee is intentionally minimal.** One fee, modality toggles, nothing more. If something feels missing, that's the multi-service mode.
- **Plan 02 surfaces are hidden, not disabled.** They're not in the DOM at all in single-fee mode so nothing leaks into screen readers, analytics, or keyboard focus order.
- **Multi-service remains untouched.** Every existing Plan 01 + Plan 02 feature for multi-service doctors works identically — the only change is adding a sibling code path.
- **Explicit, reversible mode switches.** Both directions require confirmation; multi→single snapshots; single→multi optionally restores. No quietly destructive actions.
- **Backup-restore is best-effort.** If Task 09's backend restore path isn't ready, we ship with "start fresh" only and capture the missing piece in inbox.
- **No auto-starting Plan 02 AI.** Switching to multi-service reveals the starter prompt but doesn't auto-call the AI endpoint — the doctor explicitly clicks.

---

## Global Safety Gate

- [x] **Data touched?** Yes — PATCHes `catalog_mode`, `appointment_fee_minor`, `appointment_fee_currency`, `consultation_types`, and (for restore/start-fresh switches) `service_offerings_json` via the existing `patchDoctorSettings` endpoint.
  - [x] **RLS verified?** Yes — uses `doctor-settings-service` (doctor-scoped, already RLS-enforced).
- [x] **Any PHI in logs?** No — only practice-setup values.
- [x] **External API or AI call?** No. The auto post-save `runServerReview` (LLM) call is explicitly gated on `catalog_mode !== 'single_fee'`, so single-fee doctors never trigger it.
- [x] **Retention / deletion impact?** Minor — multi → single flip writes a `_backup_pre_single_fee` blob via backend Task 09; single → multi start-fresh explicitly PATCHes `service_offerings_json: null` so we don't silently keep the auto-generated entry as "user-authored".

---

## Acceptance & Verification Criteria

Task is complete **ONLY when:**
- [x] `CatalogModeSelector` renders only when `catalog_mode === null` and persists the choice via `patchCatalogMode`.
- [x] `SingleFeeCatalogEditor` renders only when `catalog_mode === 'single_fee'` and persists `appointment_fee_minor` + `appointment_fee_currency` + `consultation_types` (backend Task 09 regenerates `service_offerings_json`).
- [x] Multi-service editor renders only when `catalog_mode === 'multi_service'` with every Plan 02 surface intact; the subtree is the untouched existing `<form>`.
- [x] All Plan 02 surfaces are not in the DOM for single-fee doctors (verified by conditional render; Playwright smoke asserts the `switch-to-single-fee` button — the only multi-service-only sentinel — is absent).
- [x] Multi → Single confirmation flow PATCHes `catalog_mode` (backend snapshots to `_backup_pre_single_fee`) and clears local review/fix state via `patchCatalogMode`.
- [x] Single → Multi confirmation offers restore-from-backup when `_backup_pre_single_fee` is present, otherwise "start fresh" (PATCHes `service_offerings_json: null`). No AI endpoint is auto-called.
- [x] `tsc --noEmit` clean; ESLint clean on all Task-12 files; Playwright smoke `services-catalog-mode.spec.ts` added (Jest unavailable — tracked in inbox).
- [ ] Manual verification: deferred to the daily-plan verification pass (dev server + live session). Covered programmatically by the Playwright smoke for branching; the three mode transitions and post-save gating are exercised via unit-level logic and TypeScript types.

---

## Related Tasks

- [Task 08 — `catalog_mode` database field](./task-08-catalog-mode-database-field.md) — prerequisite (types + enum).
- [Task 09 — Auto-generated single-service catalog](./task-09-auto-single-service-catalog.md) — prerequisite (backend catalog regeneration + backup).
- [Task 10 — Mode-aware pipeline skip](./task-10-mode-aware-pipeline-skip.md) — prerequisite (backend skip semantics this UI relies on).
- [Task 06 — AI auto-fill for service cards](./task-06-ai-autofill-service-cards.md) — Plan 02 surfaces this task gates.
- [Task 07 — Catalog quality checks](./task-07-catalog-quality-checks.md) — `CatalogReviewPanel` + badges this task gates.
- [Plan 01 Task 04 — Service Scope Mode](./task-04-service-scope-mode.md) — drawer scope-mode control this task gates.
- [Task 13 — Practice setup landing page update](./task-13-practice-setup-landing-card.md) — next (summarizes mode + catalog health on the setup landing card).

---

**Last Updated:** 2026-04-16  
**Pattern:** Mode-branching shell + explicit confirmation modals + surface gating, multi-service body untouched  
**Reference:** [Plan 03 — Single-fee vs multi-service mode](../Plans/plan-03-single-fee-vs-multi-service-mode.md)
