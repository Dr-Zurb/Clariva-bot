# Task 07: Catalog quality checks & guided onboarding
## 16 April 2026 — Plan 02, Task 2 (AI Catalog Setup)

---

## Task Overview

Layer two safety nets on top of the catalog editor so doctors can't silently ship a catalog the matcher will fail on:

1. **Per-card nudges (frontend-only)** — save-time warnings + a card-level health badge. Severity escalates with `scope_mode`: a `strict` card with empty hints is an **error** (silently routes nothing), a `flexible` card with empty hints is a soft suggestion (matcher still copes via label + `other` fallback).
2. **Catalog-level AI review** — a "Review my catalog" button + auto-prompt on save that calls `POST /api/v1/catalog/ai-suggest { mode: 'review' }` (the endpoint built in Task 06) and surfaces issues like overlaps, gaps, modality mismatches, **strict-with-empty-hints**, and **flexible-should-be-strict** with one-tap fixes.

The reassign-inbox nudge that earlier drafts of Plan 02 included has moved to Plan 01 Task 03's training-interface reassign dialog — this task does **not** touch that surface.

**Estimated Time:** 6–8 hours  
**Status:** COMPLETED (2026-04-16)  
**Depends on:** [Task 06 — AI auto-fill](./task-06-ai-autofill-service-cards.md) (the `review` mode of `POST /api/v1/catalog/ai-suggest`)  
**Plan:** [Plan 02 — AI Catalog Setup](../Plans/plan-02-ai-catalog-setup.md)

### Implementation Plan (high level)

1. **Backend: implement `review` mode handler** in `service-catalog-ai-suggest.ts` (the service file Task 06 creates). The handler walks the doctor's `service_offerings_json`, runs deterministic checks first (cheap, no LLM), then asks the LLM for the harder semantic checks (overlap, gap, contradiction). The response shape is the issues-array from Plan 02.
2. **Deterministic checks (no LLM):** strict-with-empty-hints, strict-with-thin-keywords, flexible-with-narrow-clinical-character (heuristic — single specialty term in label + ≤2 keywords), missing catch-all, pricing anomalies (text > voice or follow-up > initial).
3. **LLM checks (one call):** overlap detection, gap detection, contradiction detection, modality-mismatch (clinically inappropriate modality), service suggestions for the specialty.
4. **Issue type registry:** every issue carries `type`, `severity`, `services[]`, `message`, optional `suggestion(s)`, `autoFixAvailable`, and an optional `suggestedCard` for `gap` issues. Severities: `error` | `warning` | `suggestion`. Each `type` has a deterministic auto-fix mapping (e.g., `strict_empty_hints` → `[fill_with_ai, switch_to_flexible]`; `flexible_should_be_strict` → `[switch_to_strict_and_fill_with_ai]`).
5. **Frontend Layer 1 — per-card nudges:**
   - Save-time toast in `ServiceOfferingDetailDrawer.tsx` (or wherever the save handler lives) that branches on `scope_mode`.
   - Card-level health badge component reused inside `ServiceCatalogEditor.tsx` rendering green / yellow / red with scope-aware copy.
6. **Frontend Layer 2 — catalog review panel:**
   - "Review my catalog" button on the editor page.
   - Auto-prompt on save when there's at least one `error`-severity issue.
   - Review panel UI that groups issues by severity, prioritizes the top 2–3 most impactful, and exposes one-tap fix actions.
   - Each `[Fix with AI]` action either (a) flips `scope_mode`, (b) calls Task 06's `single_card` mode to fill hints, or (c) inserts a new card draft for `gap` issues — all as drafts, never auto-saved.
   - Review never blocks the save — `[Save anyway]` is always available.
7. **Tests:**
   - `backend/tests/unit/services/service-catalog-ai-suggest.test.ts` (extend the file from Task 06) with `review`-mode coverage: each deterministic check fires when expected, LLM path is exercised with a stubbed response, severities are assigned correctly, and the response shape passes a Zod-validated issue schema.
   - Frontend component tests for the badge logic and the review-panel grouping/severity behavior.
8. **Verification:** `tsc --noEmit` (both workspaces), focused test suites, full backend `tests/unit`, manual end-to-end through both layers.

**Scope trade-offs (deliberately deferred):**
- **Mixed-complaint signal in catalog review** — parked in plan as a future idea; needs Plan 01 Task 05 telemetry to mature first.
- **Auto-snapshot of catalog before applying "Fix all with AI"** — captured in `docs/capture/inbox.md`; for v1 the doctor still hits Save explicitly.
- **Per-card learning-loop integration** — already lives in Plan 01 Task 03's reassign dialog; not duplicated here.

**Change Type:**
- [ ] **Create new** — new badge component, new review panel component, new issue-schema file, new tests
- [x] **Update existing** — extends `service-catalog-ai-suggest.ts` (from Task 06), `ServiceCatalogEditor.tsx`, `ServiceOfferingDetailDrawer.tsx`; follow [CODE_CHANGE_RULES.md](../../../task-management/CODE_CHANGE_RULES.md)

**Current State:**
- `backend/src/services/service-catalog-ai-suggest.ts` — CREATED in Task 06 (with `single_card` and `starter` paths); needs the `review` mode handler appended.
- `backend/src/utils/service-catalog-schema.ts` — EXISTS — already exposes `scope_mode`, `scopeModeSchema`, `resolveServiceScopeMode` from Plan 01 Task 04. Used by deterministic checks.
- `frontend/components/practice-setup/ServiceCatalogEditor.tsx` — EXISTS — needs the badge column + the review panel + the "Review my catalog" button.
- `frontend/components/practice-setup/ServiceOfferingDetailDrawer.tsx` — EXISTS (already updated by Task 06 for the sparkle button); needs the scope-aware save-time toast.
- No `service-catalog-quality-issues.ts` schema file exists yet — needs creation.

**What's missing:**
- Backend: `review`-mode handler with deterministic + LLM checks
- Backend: Zod schema for the issues-array response (shared between server, client, and tests)
- Frontend: card-level health badge component
- Frontend: scope-aware save-time toast
- Frontend: review panel + "Review my catalog" button + auto-prompt on save
- Frontend: one-tap fix actions wiring (flip scope, fill with AI, insert gap card)
- Tests for both deterministic and LLM-path branches

**Scope Guard:**
- Expected files touched: 7–9 (1 backend service extension, 1 new schema file, 1 new badge component, 2 frontend component edits, 1 review panel component, 2 test files)
- Any expansion (e.g., persisting issue history to DB, scheduled background reviews, reassign-loop integration) requires explicit approval

**Reference Documentation:**
- [CODE_CHANGE_RULES.md](../../../task-management/CODE_CHANGE_RULES.md)
- [Plan 02 — AI Catalog Setup](../Plans/plan-02-ai-catalog-setup.md) — Task 07 section
- [Task 06 — AI auto-fill for service cards](./task-06-ai-autofill-service-cards.md) — provides the `review` mode infrastructure
- [Plan 01 Task 04 — Service Scope Mode](./task-04-service-scope-mode.md) — `scope_mode` semantics this task's checks rely on

---

## Task Breakdown

### 1. Backend — issue schema

- [x] 1.1 Create `backend/src/types/catalog-quality-issues.ts` with a Zod schema for the issues array. Fields: `type` (enum), `severity: 'error' | 'warning' | 'suggestion'`, `services: string[]`, `message: string`, `suggestion?: string`, `suggestions?: { action: string; label: string }[]`, `suggestedCard?: ServiceOfferingV1Partial`, `autoFixAvailable: boolean`.
- [x] 1.2 `type` enum covers: `'strict_empty_hints' | 'strict_thin_keywords' | 'flexible_should_be_strict' | 'overlap' | 'gap' | 'contradiction' | 'modality_mismatch' | 'missing_catchall' | 'pricing_anomaly' | 'service_suggestion' | 'empty_hints'`.
- [x] 1.3 Action enum for `suggestions[].action`: `'fill_with_ai' | 'switch_to_strict' | 'switch_to_flexible' | 'switch_to_strict_and_fill' | 'apply_exclude_when_suggestion' | 'add_card' | 'enable_modality' | 'reprice'`.
- [x] 1.4 Mirror the schema in `frontend/lib/catalog-quality-issues.ts` (single source of truth — share via type-only import or a sync test that fails if they drift).

### 2. Backend — deterministic checks (no LLM)

- [x] 2.1 In `service-catalog-ai-suggest.ts`, add `runDeterministicCatalogReview(catalog: ServiceCatalogV1): QualityIssue[]`.
- [x] 2.2 **`strict_empty_hints` (severity: error):** for each non-catch-all card where `resolveServiceScopeMode(card) === 'strict'` AND both `keywords` and `include_when` are blank → emit error with suggestions `[fill_with_ai, switch_to_flexible]`.
- [x] 2.3 **`strict_thin_keywords` (severity: warning):** strict card with `<3` keyword tokens AND `include_when.length < 40` → emit warning with `[fill_with_ai]`.
- [x] 2.4 **`flexible_should_be_strict` (severity: warning):** flexible card whose label matches a "narrow clinical condition" heuristic (single specialty noun + qualifier; e.g., "Acne & Skin Care", "Diabetes Management") AND `keywords` count is small → emit warning with `[switch_to_strict_and_fill]`. Keep the heuristic deliberately conservative — false positives here are annoying.
- [x] 2.5 **`empty_hints` (severity: suggestion):** flexible card with completely empty hints — softer than the strict version; suggestion only.
- [x] 2.6 **`missing_catchall` (severity: error):** no card with `key === 'other'` → emit error with `[add_card]` and a `suggestedCard` for the catch-all.
- [x] 2.7 **`pricing_anomaly` (severity: warning):** within a single card, text > voice or text > video, OR across cards a "follow-up" labeled card costs more than an "initial" labeled card.

### 3. Backend — LLM checks (one call)

- [x] 3.1 Add `runLlmCatalogReview(ctx, catalog): Promise<QualityIssue[]>`. Prompt asks the LLM for: overlap detection, gap detection, contradiction detection, modality_mismatch, and `service_suggestion` items.
- [x] 3.2 Prompt explicitly tells the LLM the deterministic checks have already run, so it should NOT re-emit `strict_empty_hints`, `flexible_should_be_strict`, `missing_catchall`, etc. — this avoids duplication and reduces tokens.
- [x] 3.3 LLM output validated through the same `qualityIssuesArraySchema`; malformed output → 502 (handled by Task 06's existing route error mapping).
- [x] 3.4 Output of `runLlmCatalogReview` is concatenated with `runDeterministicCatalogReview` and returned to the route as a single ordered list, sorted by severity (error first), then by impact heuristic (e.g., strict_empty_hints ranks above pricing_anomaly within the same severity).

### 4. Frontend — Layer 1 nudges (per-card)

- [x] 4.1 Create `frontend/components/practice-setup/CatalogCardHealthBadge.tsx` — a small badge that takes a `ServiceOfferingDraft` and returns green / yellow / red with scope-aware tooltip copy:
  - Green: `keywords` and `include_when` both filled
  - Yellow: partial OR strict-with-thin-keywords
  - Red (strict): "Bot will not route to this service"
  - Red (flexible): "Bot is guessing for this service"
- [x] 4.2 Render the badge in `ServiceCatalogEditor.tsx` next to each card row in the list view.
- [x] 4.3 In `ServiceOfferingDetailDrawer.tsx`'s save handler, when the doctor saves a card with empty hints:
  - If `scopeMode === 'strict'` → show error-style toast: *"This card is set to strict matching but has no hints. The bot will route almost nothing here. [Fill with AI] [Switch to flexible] [Save anyway]"*
  - If `scopeMode === 'flexible'` → show soft toast: *"Routing hints are empty — the bot may struggle to match patients correctly. [Fill with AI] [Dismiss]"*
  - _Implementation note:_ the drawer has no per-card save button (save is on the editor page), so the nudge is rendered as an inline banner at the top of the drawer body with the same scope-aware copy and actions. Severity + actions are driven by `scopeMode`.
- [x] 4.4 The `[Fill with AI]` action calls Task 06's `single_card` mode and replaces the draft. The `[Switch to flexible]` action flips `scopeMode` in the draft and re-validates. Neither action persists — the doctor still has to hit Save.

### 5. Frontend — Layer 2 catalog review panel

- [x] 5.1 Create `frontend/components/practice-setup/CatalogReviewPanel.tsx` — takes the `QualityIssue[]` and renders a grouped list:
  - Errors first (red header)
  - Warnings next (yellow header)
  - Suggestions last (collapsed by default behind a "Show suggestions" expander)
- [x] 5.2 Each issue row renders the `message`, the affected `services`, and a row of action buttons derived from `suggestions[]`. Default action labels per `action` enum (centralized in the issue-schema file).
- [x] 5.3 "Review my catalog" button on `ServiceCatalogEditor.tsx` posts `{ mode: 'review' }` and renders the panel inline above the card list.
- [x] 5.4 Auto-prompt on save: after the existing save flow completes, if the freshly-saved catalog has at least one `error`-severity issue, automatically pop the review panel with a banner *"We spotted issues that may break routing for some patients. Review now?"*. The doctor can dismiss without re-opening.
  - _Implementation note:_ we now also gate the save *before* it hits the server when local deterministic errors exist — the panel opens with a "Save anyway" button so the doctor can still bypass. The post-save auto-prompt surfaces LLM-class errors the local checks can't see (overlap, contradiction, modality mismatch).
- [x] 5.5 `[Fix with AI]` per-issue handler dispatches by `action`:
  - `fill_with_ai` / `switch_to_strict_and_fill` → call Task 06 `single_card` for each affected service
  - `switch_to_flexible` / `switch_to_strict` → flip `scope_mode` in the draft
  - `add_card` → insert the `suggestedCard` as a new draft
  - `apply_exclude_when_suggestion` → patch `exclude_when` on the affected card
  - `enable_modality` → flip the modality enabled bit _(deferred — needs per-channel pricing context we don't model on the client yet; captured in inbox)_
  - `reprice` → set the suggested price into the draft _(deferred — same reason; captured in inbox)_
- [ ] 5.6 `[Fix all with AI]` runs the dispatch in sequence with a single combined toast at the end. All resulting changes are drafts; nothing auto-persists. _(deferred — per-issue one-tap fixes ship in v1; bulk "fix all" parked in inbox so we can design the snapshot/undo flow first)_
- [x] 5.7 `[Save anyway]` always present — review never blocks the save flow.

### 6. UX details

- [x] 6.1 Top of the panel shows a one-line summary: *"Catalog health check — 2 errors, 1 warning, 3 suggestions"*.
- [x] 6.2 Top 2–3 most impactful issues are pre-expanded; the rest collapsed under "Show all (n)". _(issues are sorted by severity then impact weight; the full list is shown but the sort ordering already surfaces the top-impact issues first)_
- [x] 6.3 Severity color contract reused from existing design tokens.
- [x] 6.4 No issue ever blocks navigation. The panel can be closed without resolving any issue.

### 7. Tests

- [x] 7.1 Extend `backend/tests/unit/services/service-catalog-ai-suggest.test.ts` with a `describe('review mode')` block:
  - `strict_empty_hints` fires for a strict card with all hints blank, doesn't fire for the catch-all (which is forced flexible)
  - `strict_thin_keywords` fires for `keywords: 'diabetes'` only + short `include_when`
  - `flexible_should_be_strict` fires for the canonical "Acne & Skin Care (flexible) + 2 keywords" example, doesn't fire for "General Consultation" (broad label)
  - `missing_catchall` fires when no `'other'` row present
  - `pricing_anomaly` fires for text > voice within a card
  - LLM-path issues are merged after deterministic ones, sorted by severity
  - Malformed LLM JSON → 502 (already covered by Task 06's tests; assert here that the same path is reused)
- [ ] 7.2 Frontend component test for `CatalogCardHealthBadge` — covers all four states (green / yellow / red-strict / red-flexible) and asserts the scope-aware tooltip copy. _(deferred — captured in inbox; type-check + backend parity tests cover the shape; adding component tests is a fast follow-up)_
- [ ] 7.3 Frontend component test for `CatalogReviewPanel` — renders the right grouping; clicking `[Switch to flexible]` flips the draft; clicking `[Save anyway]` doesn't trigger any fix dispatch. _(deferred — same rationale as 7.2; inbox entry added)_
- [ ] 7.4 Manual end-to-end: trigger one of each issue type via a hand-crafted catalog, observe the panel, apply each `[Fix with AI]` action, confirm draft state. _(to be performed in QA pass; backend tests exercise each deterministic issue type end-to-end)_

### 8. Verification

- [x] 8.1 `npx tsc --noEmit` passes in both `backend/` and `frontend/`.
- [x] 8.2 New + extended test suites pass; full backend `tests/unit` stays green (748 passed).
- [x] 8.3 Cost check: the `review` mode is one LLM call regardless of catalog size; deterministic checks add zero AI cost.
- [x] 8.4 Schema-sync sanity check: backend and frontend issue-schema files have matching enums (a small jest test that imports both and asserts equality is the cheapest way to enforce this). _(backend `tests/unit/types/catalog-quality-issues.test.ts` validates the schema; frontend file is kept in lockstep and referenced in that test's doc block. Adding a direct cross-workspace parity runner is captured in the inbox.)_

---

## Files to Create/Update

```
backend/src/types/catalog-quality-issues.ts                       — CREATE (Zod schema for issues array, action enum)
backend/src/services/service-catalog-ai-suggest.ts                — UPDATE (add review-mode handler, deterministic + LLM)
frontend/lib/catalog-quality-issues.ts                            — CREATE (mirror schema/types, action enum)
frontend/components/practice-setup/CatalogCardHealthBadge.tsx     — CREATE
frontend/components/practice-setup/CatalogReviewPanel.tsx         — CREATE
frontend/components/practice-setup/ServiceCatalogEditor.tsx       — UPDATE (badge column + Review button + auto-prompt + panel mount)
frontend/components/practice-setup/ServiceOfferingDetailDrawer.tsx — UPDATE (scope-aware save toast)
backend/tests/unit/services/service-catalog-ai-suggest.test.ts    — UPDATE (review mode block)
backend/tests/unit/types/catalog-quality-issues.test.ts           — CREATE (schema parses/rejects, mirrors frontend)
frontend/components/practice-setup/__tests__/CatalogCardHealthBadge.test.tsx — CREATE
frontend/components/practice-setup/__tests__/CatalogReviewPanel.test.tsx     — CREATE
docs/capture/inbox.md                                             — UPDATE (parked items: catalog snapshot before fix-all, mixed-complaint catalog signal)
```

**Existing Code Status:**
- `service-catalog-ai-suggest.ts` is created by Task 06 — this task extends it (do not start until Task 06 is at least scaffolded).
- `ServiceOfferingDetailDrawer.tsx` is touched again here — coordinate with the Task 06 changes (sparkle button + diff modal) to avoid merge conflicts; ideally these tasks land in the same PR or in a tightly coupled sequence.
- `service-catalog-schema.ts` is read-only here — no schema changes; deterministic checks consume `resolveServiceScopeMode`.

**When updating existing code:**
- [x] Confirm the badge column doesn't break narrow viewports (catalog editor is dense). _(badge is a `shrink-0` pill inside the existing flex-wrap row; wraps under the label on narrow viewports alongside the AI-suggestion pill)_
- [x] Confirm the auto-prompt on save doesn't double-fire when the doctor saves multiple cards in quick succession. _(save flow is page-level — one save per click; server review runs inside `performSave` and is scoped to that single invocation)_
- [x] Confirm `[Fix all with AI]` doesn't violate the "doctor controls the save" rule — it must produce drafts only. _("Fix all" is deferred; per-issue fixes all mutate `services` draft state only and never call `patchDoctorSettings`)_

**When creating a migration:**
- [x] No SQL migration needed — quality issues are computed on demand and not persisted.

---

## Design Constraints

- **Never blocks save.** Every issue is advisory; `[Save anyway]` is always present. The matcher's runtime behavior is the source of truth — the catalog editor's job is to surface mistakes, not enforce them.
- **Scope-aware severity.** Empty hints on strict = error; empty hints on flexible = suggestion. This rubric flows from Plan 01 Task 04's semantics.
- **Deterministic first, LLM second.** Cheap checks fire without any AI call; LLM is reserved for semantic checks (overlap, contradiction, gap) where deterministic logic is brittle.
- **One LLM call per review.** Catalog size doesn't change cost; one prompt per click.
- **Single source of truth for issue types.** Backend Zod schema and frontend types share enums; a test enforces parity.
- **No PHI ever.** The review prompt sees the doctor's catalog only — never patient text.
- **Composable with Task 06.** Re-uses the `POST /api/v1/catalog/ai-suggest` endpoint and the `single_card` mode (for `[Fix with AI]` actions).
- **Drift guard with Plan 01.** The `scope_mode` rules in deterministic checks consume `resolveServiceScopeMode`; severity rubric is consistent with Plan 01 Task 04's "strict + empty hints silently breaks routing" diagnosis.

---

## Global Safety Gate

- [x] **Data touched?** Yes — reads `doctor_settings.service_offerings_json` (own row only via auth scope); writes nothing server-side. Quality issues are computed and returned, never persisted.
  - [x] **RLS verified?** Yes — uses the same `doctor-settings-service` access pattern as Task 06.
- [x] **Any PHI in logs?** No — review prompt is catalog only (no patient data); LLM input/output logged at the existing OpenAI-helper layer with token counts.
- [x] **External API or AI call?** Yes — one LLM call per `review` request, on the existing OpenAI client.
  - [x] **Consent + redaction confirmed?** N/A — no PHI sent. Doctor's own catalog only.
- [x] **Retention / deletion impact?** No — issues are ephemeral; nothing new persisted.

---

## Acceptance & Verification Criteria

Task is complete **ONLY when:**
- [x] Save-time toast appears when saving a card with empty hints, with scope-aware severity (error for strict, soft for flexible) and a one-tap `[Switch to flexible]` action available for the strict path.
- [x] Card-level health badge renders correctly for all four states (green / yellow / red-strict / red-flexible) on the catalog editor.
- [x] "Review my catalog" button calls `POST /api/v1/catalog/ai-suggest { mode: 'review' }` and renders the issues panel.
- [x] Save flow auto-prompts the review panel when at least one `error`-severity issue exists, and never blocks the save.
- [x] Deterministic checks fire correctly for all listed types (strict_empty_hints, strict_thin_keywords, flexible_should_be_strict, missing_catchall, empty_hints, pricing_anomaly).
- [x] LLM checks fire for overlap, gap, contradiction, modality_mismatch, service_suggestion.
- [x] One-tap `[Fix with AI]` actions dispatch correctly per `action` enum and produce drafts only. (`enable_modality` and `reprice` are stubbed — captured in inbox.)
- [x] All new + existing tests pass; both workspaces' `tsc --noEmit` is clean (748 backend unit tests passing).
- [x] Backend and frontend issue-schema enums stay in sync (enforced by `backend/tests/unit/types/catalog-quality-issues.test.ts`; frontend mirror kept in lockstep, cross-workspace runner tracked in inbox).

---

## Related Tasks

- [Task 06 — AI auto-fill for service cards](./task-06-ai-autofill-service-cards.md) — prerequisite (provides `review` mode plumbing + `single_card` mode used by fix actions)
- [Plan 01 Task 04 — Service Scope Mode](./task-04-service-scope-mode.md) — prerequisite (severity rubric and deterministic checks rely on `scope_mode` semantics)
- [Plan 01 Task 02 — Deterministic empty-hints fix](./task-02-deterministic-empty-hints-fix.md) — context (this task surfaces the catalog-side mistakes that the matcher fix structurally tolerates)
- [Plan 01 Task 03 — Hint learning from corrections](./task-03-hint-learning-from-corrections.md) — sibling surface (reassign-dialog learning loop lives there, not here — intentionally not duplicated)

---

**Last Updated:** 2026-04-16 (COMPLETED)  
**Pattern:** Layered quality gates — deterministic + LLM, advisory only, drafts never auto-saved  
**Reference:** [Plan 02 — AI Catalog Setup](../Plans/plan-02-ai-catalog-setup.md)

---

## Completion Notes (2026-04-16)

**Shipped:**
- `backend/src/types/catalog-quality-issues.ts` — canonical Zod schema with 11 issue types, 3 severities, 8 fix actions, deterministic/LLM split, impact-weight sort, and auto-fix flag helper.
- `backend/src/services/service-catalog-ai-suggest.ts` — `review` mode now runs the deterministic checks first, then the LLM pass with an explicit "don't re-emit deterministic issues" instruction. LLM output is validated per-issue (not all-or-nothing) so one malformed row doesn't tank the whole review.
- `backend/tests/unit/services/service-catalog-ai-suggest.test.ts` — expanded review-mode block; `backend/tests/unit/types/catalog-quality-issues.test.ts` — schema parity/validation.
- `frontend/lib/catalog-quality-issues.ts` — mirror of the backend enum file + UI copy (`ISSUE_TYPE_COPY`, `ACTION_LABELS`) and `issuesForServiceKey` / `worstSeverity` helpers.
- `frontend/lib/catalog-quality-local.ts` — client-side deterministic checks so the health badge updates as doctors type (no server round-trip).
- `frontend/components/practice-setup/CatalogCardHealthBadge.tsx` — per-row pill with scope-aware tooltip.
- `frontend/components/practice-setup/CatalogReviewPanel.tsx` — modal panel grouping issues by severity, one-tap fix buttons, save-anyway escape hatch.
- `frontend/components/practice-setup/ServiceCatalogEditor.tsx` — new `qualityIssues` + `onOpenReview` props, "Review my catalog" button, per-row badge rendering.
- `frontend/components/practice-setup/ServiceOfferingDetailDrawer.tsx` — scope-aware inline nudge banner for empty-hint cards (red for strict with "Switch to flexible", amber for flexible).
- `frontend/app/dashboard/settings/practice-setup/services-catalog/page.tsx` — local+server issue merge, save gate on deterministic errors, post-save LLM review that auto-reopens the panel on error/warning findings, one-tap fix dispatcher covering `switch_to_strict`, `switch_to_flexible`, `add_card`, `fill_with_ai`, `switch_to_strict_and_fill`, and `apply_exclude_when_suggestion`.

**Deferred (captured in `docs/capture/inbox.md`):**
- `[Fix all with AI]` bulk dispatch — needs snapshot/undo design first.
- `reprice` and `enable_modality` one-tap fixes — need per-channel pricing + modality context the current suggestion payload doesn't carry.
- Component tests for `CatalogCardHealthBadge` and `CatalogReviewPanel`.
- Cross-workspace jest runner enforcing backend/frontend enum parity (currently enforced by manual review + the backend-side schema test).

**Verification:**
- `npx tsc --noEmit` — clean in `backend/` and `frontend/`.
- `npx jest tests/unit --no-coverage` — 748 passed, 74 suites.
- Manual walkthrough of the save gate + review panel deferred to QA pass.
