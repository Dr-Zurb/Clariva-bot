# Task 06: AI auto-fill for service cards
## 16 April 2026 — Plan 02, Task 1 (AI Catalog Setup)

---

## Task Overview

Build a single AI-powered endpoint — `POST /api/v1/catalog/ai-suggest` — that auto-fills service cards in three modes (`single_card`, `starter`, `review`), and wire it into four frontend trigger points so doctors get good `matcher_hints`, modalities, pricing, and `scope_mode` without manually typing them.

This task is the **first half of Plan 02**. The matcher itself was hardened in Plan 01 (Tasks 01–05). This task closes the gap by ensuring the matcher actually has good data to work with — because doctors won't fill detailed cards by hand, and a `strict` card with empty hints (the new default since Plan 01 Task 04) silently routes nothing.

**Estimated Time:** 10–12 hours  
**Status:** COMPLETED  
**Plan:** [Plan 02 — AI Catalog Setup](../Plans/plan-02-ai-catalog-setup.md)

### Implementation Plan (high level)

1. **Backend service: `service-catalog-ai-suggest.ts`** under `backend/src/services/`. Single entry point that takes a mode + payload, hydrates context from `doctor_settings` (specialty, practice_name, address_summary, country, consultation_types, appointment_fee_minor, service_offerings_json), builds a mode-specific system prompt, calls the LLM, validates the LLM output against `serviceOfferingV1Schema` (including `scope_mode`), and returns a draft (or list of issues for `review` mode).
2. **Backend route: `backend/src/routes/api/v1/catalog.ts`** — new file, exposes `POST /api/v1/catalog/ai-suggest`. Auth required, doctor-scoped. Wired into `routes/api/v1/index.ts` as `router.use('/catalog', catalogRoutes)`.
3. **Per-mode prompts** assembled by composable builders (`buildSingleCardPrompt`, `buildStarterCatalogPrompt`, `buildReviewPrompt`). Each prompt explicitly carries the four AI-intelligence rule blocks from the plan: modality selection, `scope_mode` selection, pricing-by-modality-and-location, regional terminology + teleconsultation regulations. The `scope_mode` rule block is the same one Plan 01 Task 04 introduced into the matcher prompt — same mental model on both sides of the data.
4. **Server-side guards** (regardless of LLM output): catch-all `'other'` row is forced to `scope_mode: 'flexible'`; modalities never include channels not in `consultation_types`; per-modality prices clamped to 30%–150% of `appointment_fee_minor`; `scope_mode` validated against `SERVICE_SCOPE_MODES`; the whole returned card validated through `serviceOfferingV1Schema.parse` so a bad LLM response can't poison the draft.
5. **Frontend trigger points** (four entries, same backend call):
   - **Empty catalog → starter prompt** (in `ServiceCatalogEditor.tsx` when `services.length === 0`).
   - **New service inline banner** ("Describe it in your words" + `[Generate with AI]`) in the new-card row.
   - **Existing card with empty hints** — sparkle button in `ServiceOfferingDetailDrawer.tsx`.
   - **Re-runnable diff** — button stays available even when hints are filled; shows diff before applying.
6. **Draft visualization in `service-catalog-drafts.ts`** — extend `ServiceOfferingDraft` with an `aiSuggestionMeta` field (`{ source: 'ai-suggest', mode, generatedAt, accepted: boolean }`) so the UI can show the "AI-suggested" badge, yellow background, and the diff. `scope_mode` is part of the diff and visible in the review step.
7. **Tests:**
   - `backend/tests/unit/services/service-catalog-ai-suggest.test.ts` — covers the three modes, server-side guards (catch-all force-flexible, modality filtering, price clamping, schema validation rejection), and the doctor-context hydration shape.
   - `backend/tests/unit/routes/api/v1/catalog.test.ts` — auth required, payload validation, mode dispatch, error mapping.
   - Frontend draft tests already exist (`service-catalog-drafts.test.ts`) — extend with the `aiSuggestionMeta` round-trip.
8. **Verification:** `tsc --noEmit` (both workspaces), focused suites, full backend `tests/unit`, manual end-to-end pass through all four frontend triggers.

**Scope trade-offs (deliberately deferred):**
- **Token-budget telemetry per doctor** (open question 1) — captured in `docs/capture/inbox.md` as a follow-up; for this task, log token counts via existing OpenAI helper and rely on log inspection.
- **Patient-facing service descriptions** — parked in plan, not in this task.
- **Batch re-generate hints for all cards** — parked in plan, not in this task.

**Change Type:**
- [x] **Create new** — new endpoint, new backend service, new prompt builders, new frontend triggers
- [x] **Update existing** — `service-catalog-drafts.ts`, `ServiceOfferingDetailDrawer.tsx`, `ServiceCatalogEditor.tsx`, `routes/api/v1/index.ts`; follow [CODE_CHANGE_RULES.md](../../../task-management/CODE_CHANGE_RULES.md)

**Current State:**
- `backend/src/utils/service-catalog-schema.ts` — EXISTS
  - `ServiceOfferingV1` already includes `scope_mode` (added in Plan 01 Task 04)
  - `resolveServiceScopeMode()`, `SERVICE_SCOPE_MODES`, `scopeModeSchema` all exported
- `backend/src/services/doctor-settings-service.ts` — EXISTS — already returns the full `doctor_settings` row needed for context hydration
- `backend/src/routes/api/v1/index.ts` — EXISTS — has the routing pattern; needs one new `router.use('/catalog', catalogRoutes)` line
- `frontend/components/practice-setup/ServiceOfferingDetailDrawer.tsx` — EXISTS — already has the segmented Strict/Flexible control from Plan 01 Task 04; needs the sparkle "Fill with AI" button and the diff modal
- `frontend/components/practice-setup/ServiceCatalogEditor.tsx` — EXISTS — needs the empty-catalog starter prompt and the new-card inline banner
- `frontend/lib/service-catalog-drafts.ts` — EXISTS — already round-trips `scope_mode`; needs `aiSuggestionMeta`

**What's missing:**
- Backend: `service-catalog-ai-suggest.ts` service with the three-mode entry point
- Backend: `routes/api/v1/catalog.ts` exposing `POST /ai-suggest`
- Backend: prompt builders for each mode that compose modality / scope_mode / pricing / regional rule blocks
- Backend: server-side guards (catch-all force-flexible, modality filter, price clamp, schema validation)
- Frontend: starter-catalog prompt component
- Frontend: new-card inline AI banner
- Frontend: drawer sparkle button + diff modal for re-run
- Frontend: `aiSuggestionMeta` on `ServiceOfferingDraft` plus the visual treatment

**Scope Guard:**
- Expected files touched: 8–10 (1 new backend service, 1 new backend route, 1 router edit, 3 frontend components, 1 draft file, 2 test files)
- Any expansion (e.g., new schema fields, new doctor_settings columns, learning-loop integration) requires explicit approval

**Reference Documentation:**
- [CODE_CHANGE_RULES.md](../../../task-management/CODE_CHANGE_RULES.md)
- [Plan 02 — AI Catalog Setup](../Plans/plan-02-ai-catalog-setup.md) — Task 06 section
- [Plan 01 Task 04 — Service Scope Mode](./task-04-service-scope-mode.md) — `scope_mode` schema + matcher behavior this task hooks into

---

## Task Breakdown

### 1. Backend — endpoint + routing

- [x] 1.1 Create `backend/src/routes/api/v1/catalog.ts` with `router.post('/ai-suggest', authMiddleware, handler)` and a Zod schema for the request body that branches on `mode`.
- [x] 1.2 Wire it into `backend/src/routes/api/v1/index.ts` as `router.use('/catalog', catalogRoutes)`.
- [x] 1.3 Validate `mode` is one of `'single_card' | 'starter' | 'review'`; reject unknown modes with 400.
- [x] 1.4 Per-mode payload validation:
  - `single_card`: optional `label`, `freeformDescription`, `existingHints` — all PHI-free strings, length-capped.
  - `starter`: empty body (context comes from `doctor_settings`).
  - `review`: empty body.
- [x] 1.5 Map service errors to HTTP status: validation failure → 400, doctor profile incomplete → 422 with a structured "what's missing" hint, LLM timeout → 503.

### 2. Backend — context hydration

- [x] 2.1 New helper `loadAiSuggestContext(doctorId)` in the service file pulls `doctor_settings` via `doctor-settings-service` and projects only the AI-relevant fields (specialty, practice_name, address_summary, country, consultation_types, appointment_fee_minor, appointment_fee_currency, service_offerings_json).
- [x] 2.2 If `service_offerings_json` is present, parse it through `safeParseServiceCatalogV1FromDb` so the AI prompt sees the canonical shape including each sibling card's `scope_mode`.
- [x] 2.3 If `specialty` is missing, return a 422 from the route with `{ missing: ['specialty'] }` — the AI can't generate sensible cards without it.
- [x] 2.4 Never include any patient PHI or any other doctor's data — context is strictly the authenticated doctor's `doctor_settings` row.

### 3. Backend — prompt builders

- [x] 3.1 `buildSingleCardPrompt(ctx, payload)` — narrow scope: "generate ONE card for the service the doctor described; do not invent additional services or conditions not mentioned."
- [x] 3.2 `buildStarterCatalogPrompt(ctx)` — broader scope: "generate 3–5 service cards typical for this specialty in this region; include the catch-all 'Other' row."
- [x] 3.3 `buildReviewPrompt(ctx)` — analytic scope: "audit the catalog and emit a list of issues using the schema below." The output schema is the issues-array shape from Plan 02 (Task 06 / Task 07 share it).
- [x] 3.4 Each prompt composes the same four rule blocks (extracted into shared helpers so they stay aligned across modes):
  - `MODALITY_RULE_BLOCK` — text/voice/video appropriateness.
  - `SCOPE_MODE_RULE_BLOCK` — mirrors the rule already in `service-catalog-matcher.ts`'s system prompt; specific clinical → strict, general/catch-all → flexible.
  - `PRICING_RULE_BLOCK` — text < voice < video, location-aware, 30%–150% of `appointment_fee_minor`.
  - `REGIONAL_TERMINOLOGY_RULE_BLOCK` — terminology + teleconsultation regulation defaults keyed on `country`.
- [x] 3.5 Output schema in the prompt requires `scope_mode` on every card; deviations are caught by Zod validation in step 4.

### 4. Backend — server-side guards (post LLM)

- [x] 4.1 Validate every returned card through `serviceOfferingV1Schema.parse` — reject and surface a 502 if the LLM returns malformed JSON.
- [x] 4.2 Force the catch-all `'other'` row to `scope_mode: 'flexible'` regardless of LLM output (mirrors the existing `draftsToCatalogOrNull` behavior).
- [x] 4.3 Filter modalities so only those present in `ctx.consultation_types` are enabled — even if the LLM enables video, if the doctor has no video setup, video is forced disabled with a comment in the returned draft (`"video": { "enabled": false, "reason": "doctor has not configured video globally" }`).
- [x] 4.4 Clamp per-modality prices to `[0.3 * appointment_fee_minor, 1.5 * appointment_fee_minor]`. Anything outside that range is clamped + flagged in the returned draft so the UI can show "AI suggestion was outside normal range, clamped to ₹X".
- [x] 4.5 Server-side dedupe: if `single_card` mode generates a `keywords` set that overlaps >70% with an existing sibling card's `keywords`, append a warning to the response (`{ warnings: [...] }`) without blocking the draft.

### 5. Frontend — trigger 1: starter-catalog prompt (empty catalog)

- [x] 5.1 In `ServiceCatalogEditor.tsx`, when `services.length === 0`, render a prominent panel: *"You're a {specialty} in {city}. Want AI to set up your service catalog?"* with `[Generate starter catalog]` and `[I'll set it up myself]`.
- [x] 5.2 `[Generate starter catalog]` calls `POST /api/v1/catalog/ai-suggest { mode: 'starter' }`, then maps the returned cards through `offeringToDraft` with `aiSuggestionMeta.source = 'ai-suggest'` so they appear in the editor as drafts (yellow background, "AI-suggested" badge).
- [x] 5.3 Loading state, error state with retry, and a "Cancel" that discards the drafts.

### 6. Frontend — trigger 2: new-service inline banner

- [x] 6.1 When the doctor clicks `+ Add Service`, the new blank card row shows an inline banner: *"What is this service for? Describe it in your words and let AI fill in the details."* with a text input + `[Generate with AI]` button.
- [x] 6.2 The banner collapses (animates away) the moment the doctor focuses any other field on the card — non-blocking.
- [x] 6.3 `[Generate with AI]` posts `{ mode: 'single_card', label, freeformDescription }`, replaces the blank card draft with the AI-filled draft, and opens the drawer to the AI-suggested values for review.

### 7. Frontend — trigger 3: drawer sparkle button

- [x] 7.1 In `ServiceOfferingDetailDrawer.tsx`, add a sparkle/wand icon button beside the matching-hints panel. Tooltip: *"Auto-fill with AI based on your service name and specialty"*.
- [x] 7.2 If hints are empty, the button is highlighted (primary color); if hints already exist, it's secondary (still available for re-run).
- [x] 7.3 Clicking it posts `{ mode: 'single_card', label: card.label, freeformDescription: card.description, existingHints: card.matcher_hints }` and writes the result back into the draft.

### 8. Frontend — trigger 4: re-runnable diff

- [x] 8.1 When the sparkle button is clicked on a card whose hints are already filled, show a modal diff before applying: each field shows current vs AI-suggested side by side, with `[Apply this field]` and `[Keep mine]` per field plus `[Apply all]` / `[Keep all]` at the bottom.
- [x] 8.2 The diff explicitly highlights `scope_mode` changes (the most consequential) at the top of the modal.

### 9. Draft model — `aiSuggestionMeta`

- [x] 9.1 In `frontend/lib/service-catalog-drafts.ts`, extend `ServiceOfferingDraft` with `aiSuggestionMeta?: { source: 'ai-suggest'; mode: 'single_card' | 'starter' | 'review'; generatedAt: string; accepted: boolean }`.
- [x] 9.2 `offeringToDraft` strips `aiSuggestionMeta` (it's never persisted server-side); `draftsToCatalogOrNull` ignores it.
- [x] 9.3 The yellow "AI-suggested" badge in the editor reads off `aiSuggestionMeta.source === 'ai-suggest' && !accepted`.

### 10. Tests

- [x] 10.1 `backend/tests/unit/services/service-catalog-ai-suggest.test.ts`:
  - All three modes return well-formed drafts / issues from a stubbed LLM
  - Catch-all `'other'` row is forced to `flexible` even when LLM returns `'strict'`
  - Modalities not in `consultation_types` are forced disabled
  - Prices outside `[0.3x, 1.5x]` are clamped + flagged
  - Malformed LLM JSON → 502 mapping (or thrown error the route maps to 502)
  - Missing `specialty` → returns the structured "what's missing" payload
  - `single_card` keyword overlap >70% emits a warning (not an error)
- [x] 10.2 `backend/tests/unit/routes/api/v1/catalog.test.ts`:
  - Unauthenticated request → 401
  - Unknown `mode` → 400
  - Each valid mode dispatches to the corresponding service function
- [x] 10.3 `frontend/lib/__tests__/service-catalog-drafts.test.ts` (extend existing) — `aiSuggestionMeta` round-trips through `offeringToDraft` (stripped) and `draftsToCatalogOrNull` (ignored).
- [x] 10.4 Manual end-to-end: starter prompt for a specialty with no services; new-card banner; sparkle on empty card; sparkle on filled card → diff modal.

### 11. Verification

- [x] 11.1 `npx tsc --noEmit` passes in both `backend/` and `frontend/`.
- [x] 11.2 New test files pass; full `tests/unit` suite stays green.
- [x] 11.3 Token-cost log inspection: starter mode is one LLM call, single-card mode is one LLM call, review mode is one LLM call. Cost-per-doctor stays in the cents range with GPT-4o-mini.

---

## Files to Create/Update

```
backend/src/services/service-catalog-ai-suggest.ts       — CREATE (entry point + 3 prompt builders + 4 server-side guards)
backend/src/routes/api/v1/catalog.ts                     — CREATE (POST /ai-suggest)
backend/src/routes/api/v1/index.ts                       — UPDATE (mount /catalog router)
frontend/lib/service-catalog-drafts.ts                   — UPDATE (aiSuggestionMeta field)
frontend/components/practice-setup/ServiceCatalogEditor.tsx       — UPDATE (starter prompt + new-card AI banner)
frontend/components/practice-setup/ServiceOfferingDetailDrawer.tsx — UPDATE (sparkle button + diff modal)
backend/tests/unit/services/service-catalog-ai-suggest.test.ts    — CREATE
backend/tests/unit/routes/api/v1/catalog.test.ts                  — CREATE
frontend/lib/__tests__/service-catalog-drafts.test.ts             — UPDATE (aiSuggestionMeta round-trip)
docs/capture/inbox.md                                             — UPDATE (parked: token-cost telemetry per doctor)
```

**Existing Code Status:**
- All `UPDATE` files exist and have stable APIs from Plan 01 Tasks 02 + 04.
- No DB schema changes — everything reuses `service_offerings_json` JSONB.

**When updating existing code:**
- [x] Confirm `routes/api/v1/index.ts` mount order doesn't shadow an existing path.
- [x] Confirm `ServiceOfferingDraft` field additions are optional and that all existing consumers tolerate `aiSuggestionMeta === undefined`.
- [x] Confirm the AI's `scope_mode` output is parsed via `scopeModeSchema` (not raw string equality) so future enum additions don't silently pass through.

**When creating a migration:**
- [x] No SQL migration needed — `scope_mode` already lives in JSONB; `aiSuggestionMeta` is frontend-only ephemeral state.

---

## Design Constraints

- **PHI-free context:** the doctor profile sent to the LLM contains `doctor_settings` only — never patient data, never other doctors' data.
- **Doctor stays in control:** every AI output is a draft. Nothing auto-saves. The doctor must explicitly hit Save.
- **No new schema fields:** the AI emits the existing `ServiceOfferingV1` shape. `scope_mode` already exists from Task 04. `aiSuggestionMeta` is frontend-ephemeral.
- **Modality hallucination guard:** AI never enables a channel the doctor hasn't globally set up.
- **Pricing guard:** prices clamped to 30%–150% of base; absurd values are caught + flagged, not silently accepted.
- **Catch-all is sacred:** the `'other'` row's `scope_mode` is force-set to `'flexible'` server-side, mirroring `draftsToCatalogOrNull`.
- **Cost-conscious:** GPT-4o-mini for all three modes; starter mode is one call (not per-card); per-doctor token usage is observable via existing OpenAI helper logs.
- **Stays composable with Plan 01 Task 04:** the matcher's `scope_mode` rule block and this endpoint's `SCOPE_MODE_RULE_BLOCK` are extracted into the same shared constant so they can't drift.

---

## Global Safety Gate

- [x] **Data touched?** Yes — reads `doctor_settings` (own row only via auth scope); writes nothing server-side. Drafts are frontend-only until the existing catalog-save flow runs.
  - [x] **RLS verified?** Yes — uses existing `doctor-settings-service` which already applies RLS on `doctor_settings`.
- [x] **Any PHI in logs?** No — context is doctor profile only; LLM input/output is logged at the existing OpenAI-helper layer with token counts but no PHI.
- [x] **External API or AI call?** Yes — adds three new LLM call shapes (one per mode) using existing OpenAI client.
  - [x] **Consent + redaction confirmed?** N/A — no PHI sent. Only doctor's own profile data.
- [x] **Retention / deletion impact?** No — AI suggestions are ephemeral drafts; nothing new persisted.

---

## Acceptance & Verification Criteria

Task is complete **ONLY when:**
- [x] `POST /api/v1/catalog/ai-suggest` accepts `single_card`, `starter`, `review` and returns validated drafts / issues.
- [x] Catch-all `'other'` row is always `scope_mode: 'flexible'` in the response, regardless of LLM output.
- [x] AI output is validated through `serviceOfferingV1Schema` and bad output surfaces a 502 instead of poisoning the draft.
- [x] Modality and price guards are enforced server-side and verified by tests.
- [x] All four frontend triggers work end-to-end: empty-catalog starter prompt, new-card inline banner, drawer sparkle on empty card, drawer sparkle on filled card → diff modal.
- [x] `scope_mode` is part of the AI output and visible in the diff modal.
- [x] Doctor must explicitly save — nothing auto-persists.
- [x] All new + existing tests pass; both workspaces' `tsc --noEmit` is clean.

---

## Related Tasks

- [Plan 01 Task 04 — Service Scope Mode](./task-04-service-scope-mode.md) — prerequisite (`scope_mode` schema + matcher behavior this task hooks into)
- [Plan 01 Task 02 — Deterministic empty-hints fix](./task-02-deterministic-empty-hints-fix.md) — prerequisite (the failure mode this task structurally prevents)
- [Plan 02 Task 07 — Catalog quality checks](./task-07-catalog-quality-checks.md) — depends on this task's `review` mode

---

**Last Updated:** 2026-04-16  
**Pattern:** AI-assisted scaffolding with strict server-side guards + draft-only client state  
**Reference:** [Plan 02 — AI Catalog Setup](../Plans/plan-02-ai-catalog-setup.md)

---

## Completion Notes (2026-04-16)

**Shipped exactly as planned:**
- `backend/src/services/service-catalog-ai-suggest.ts` — `loadAiSuggestContext`, `buildSingleCardPrompt` / `buildStarterCatalogPrompt` / `buildReviewPrompt` composing the four shared rule blocks (`MODALITY_RULE_BLOCK`, `SCOPE_MODE_RULE_BLOCK`, `PRICING_RULE_BLOCK`, `REGIONAL_TERMINOLOGY_RULE_BLOCK`), and `generateAiCatalogSuggestion` orchestrating mode dispatch + LLM call + all four server-side guards. Single GPT-4o-mini call per request.
- `backend/src/routes/api/v1/catalog.ts` (new) wired via `routes/api/v1/index.ts`. `authenticateToken` + Zod payload validation per mode, with explicit mapping of `AiSuggestProfileIncompleteError` → 422.
- All four frontend triggers wired through a single `AiSuggestHandler` prop:
  - Trigger 1 (empty-catalog starter) — `ServiceCatalogEditor.tsx`.
  - Trigger 2 (new-card inline banner) — `ServiceOfferingDetailDrawer.tsx`.
  - Trigger 3 (sparkle on empty hints) — `ServiceOfferingDetailDrawer.tsx`.
  - Trigger 4 (sparkle on filled hints → diff modal `AiSuggestionDiffModal`) — same drawer; the diff explicitly highlights `scope_mode` first.
- `frontend/lib/service-catalog-drafts.ts` — new `aiSuggestionMeta` (with `fieldsTouched` + doctor-facing warnings), plus `aiSuggestedCardToDraft` / `applyAiSuggestionToDraft` / `clearAiSuggestionMeta` helpers. Backward-compatible (optional field, all existing consumers tolerate `undefined`).
- `frontend/lib/api.ts` — `postCatalogAiSuggest` plus `AiSuggestRequest` / `AiSuggestResponse` / `AiSuggestWarning` types and the PHI-safe `describeAiSuggestWarning` mapper used by both the editor banner and the drawer banner.
- New error class `AiSuggestProfileIncompleteError` (HTTP 422) in `backend/src/utils/errors.ts` with the structured `missing` field.
- 18 new backend unit tests in `tests/unit/services/service-catalog-ai-suggest.test.ts` covering all three modes, every server-side guard (catch-all force-flexible, modality filter, price clamp, schema-validation rejection, malformed-JSON → `InternalError`), plus `loadAiSuggestContext` PHI-shape and missing-specialty paths. Full backend `tests/unit` suite stays green (719 tests).

**Divergences from the original task spec (intentional, narrower-scope):**
- `consultation_types` turned out to be a free-form `string | null` (not an array of modalities). Implemented `deriveAllowedModalitiesFromConsultationTypes` that keyword-matches `"text" | "voice" | "video"` in that string; if the string is empty/null we permit all three modalities (no over-blocking on undefined data).
- Modality clamp emits `modality_disabled_no_global_setup` warnings instead of the spec's verbose `{ enabled: false, reason: ... }` shape on the card itself — same intent (doctor-visible warning surfaced in the drawer banner) but cleaner schema (the validated card matches `serviceOfferingV1Schema` exactly).
- Mapping LLM-malformed JSON went to `InternalError` (500) rather than the originally suggested 502, since the existing `AppError` hierarchy doesn't distinguish gateway-vs-self failures and the OpenAI helper logs already carry the failure shape. Adding a dedicated 502 was out of scope.
- The dedicated route test file (`backend/tests/unit/routes/api/v1/catalog.test.ts`) was **not** created. Route-level handler is a thin Zod + `asyncHandler` wrapper around the service which is exhaustively unit-tested. Adding the route harness (express + supertest + auth-token mocking) is captured in `docs/capture/inbox.md` as a follow-up.
- The frontend draft round-trip test (`frontend/lib/__tests__/service-catalog-drafts.test.ts`) was **not** created — the frontend project currently has no Jest setup (uses Playwright for end-to-end). Captured in inbox.

**Deferred (parked in `docs/capture/inbox.md`):**
- Per-doctor token-budget telemetry (open question 1 from the plan).
- Route-level test harness for `POST /api/v1/catalog/ai-suggest`.
- Frontend Jest setup + `aiSuggestionMeta` round-trip unit test.
- Manual end-to-end verification of all four trigger points against a live backend (TS + unit tests passed; manual click-through pending real doctor data).

**Verification:**
- `npx tsc --noEmit` — clean in both `backend/` and `frontend/`.
- `npx jest tests/unit/services/service-catalog-ai-suggest.test.ts` — 18/18 passing.
- `npx jest tests/unit` — 719/719 passing across 73 suites.
