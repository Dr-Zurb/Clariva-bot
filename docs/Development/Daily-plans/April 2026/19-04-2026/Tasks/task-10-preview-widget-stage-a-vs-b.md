# Task 10: Preview widget — “try as patient” + Stage A vs Stage B indicator

## 19 April 2026 — Plan [Service catalog matcher routing v2](../Plans/plan-service-catalog-matcher-routing-v2.md) — Phase 4

---

## Task overview

Give doctors **confidence** in their routing configuration:

- **Preview** input: doctor pastes a sample patient message (plain text).
- **Output:** matched `service_key` (or `other`), **confidence**, and **which path ran**: **Stage A (instant)** vs **Stage B (assistant)** — surfaced from the matcher's existing `result.source` field via a new dev-flag-gated endpoint (no matcher logic duplicated in the frontend).

**First slice:** **dev-only** / feature-flag behind `NODE_ENV` / config — accepted by the plan.

**Telemetry** (misroute → suggested example phrases) — **out of scope** for this task; explicit follow-up.

**Estimated time:** 12–24 hours (full production slice with auth hardening + UI polish + telemetry)
**Actual time:** ~2 hours (dev-only first slice, hybrid path)

**Status:** Done (hybrid)

**Depends on:** Tasks 04–06 minimum (resolver + Stage A wiring + frontend examples UI)

**Plan:** [plan-service-catalog-matcher-routing-v2.md](../Plans/plan-service-catalog-matcher-routing-v2.md)

---

## Acceptance criteria

- [x] Doctor can run at least one sample string and see **service + path** without sending a real Instagram DM.
  - Mounted in the multi-service services-catalog page below the `ServiceCatalogEditor`. Renders matched label + service_key + a colored Stage A / Stage B / fallback / single-fee badge + confidence + suggested modality.
- [x] No PHI logged beyond existing matcher logging policy.
  - The matcher already calls `redactPhiForAI` on `reasonForVisitText` before any LLM hop and never logs the raw input. The new route just hands the body to `matchServiceCatalogOffering` — it adds no new logging surface.
- [x] Plan Phase 4: preview **or** explicit defer — update plan status.
  - Plan Phase 4 marked done (hybrid landing). Telemetry deferred with rationale.

---

## Out of scope

- Production patient traffic (route is gated off in production by default).
- Embeddings or non-LLM classifier replacement.
- **Deferred to follow-up (Phase 4 hybrid):**
  - **Misroute → suggested example phrases telemetry.** No production signal yet to seed suggestions; defer until Phase 3 sibling overlap rule has 2+ weeks of shadow data.
  - **In-DM-style transcript preview.** This first slice surfaces only the matcher result. The DM copy layer is downstream and tested separately (Plan 04 — Patient DM copy polish).
  - **Doctor-facing RBAC + audit log + rate-limiter hardening** for production exposure. The route is `authenticateToken`-gated and env-flag-gated; we deliberately did not pretend to ship a production-quality preview.

---

## References

- `matchServiceCatalogOffering` — uses `result.source` to distinguish `'deterministic'` (Stage A or single_fee) / `'llm'` (Stage B) / `'fallback'`. Single call is enough; no need for two `skipLlm` toggles.
- Task 01 doc — Stage A vs B explanation reused for UI badge copy.
- `runServerReview` in `services-catalog/page.tsx` — same `draftsToCatalogOrNull` + `safeParseServiceCatalogV1` pipeline reused so the preview runs against unsaved edits.

---

## Decision log — why "hybrid first slice" instead of the full 12–24 h Phase 4

The plan invites a dev-only / feature-flag preview as an acceptable Phase 4 first slice. We took that explicitly because:

1. **The smallest useful loop is enough today.** Doctors (and us in dev) need a "configure → try → see result" loop to gain confidence in the new examples-driven routing we just shipped (Tasks 02–09). That loop only needs **input → matcher result → Stage A vs B badge** — nothing more.
2. **Production-grade exposure adds risk for unmeasured value.** The 12–24 h estimate covered RBAC hardening, in-DM transcript rendering, and a misroute telemetry pipeline. None of these have a measured signal demanding them right now: the AI suggest panel + sibling tie-breaker (Task 09) already surface most of the cognitive load doctors had, and pushing a half-built telemetry pipeline live would create a feedback loop we can't yet trust.
3. **Hybrid matches Task 09's pattern.** Task 09 shipped the prompt-only half of sibling boundaries and deferred the schema half with a documented un-defer trigger. Same logic here: ship the high-leverage half (preview), document the deferred half (telemetry) with a clear un-defer trigger.

### Un-defer the deferred half if any of the below becomes true

- **Doctor request:** doctors organically ask for "show me how it would respond" or "tell me when patients I would have routed differently came in" — graduate the preview to in-DM-style and start collecting misroute samples.
- **Phase 3 telemetry signal:** ≥ 2 weeks of shadow data shows a recurring misroute pattern that the sibling tie-breaker rule (Task 09) doesn't fix. Telemetry → suggested example phrases becomes the obvious next step.
- **Sales / demo need:** preview becomes a primary demo surface and dev-only is no longer enough.

---

## Shipped

### Backend
- **Env knob** `CATALOG_PREVIEW_MATCH_ENABLED` (`backend/src/config/env.ts`):
  - Unset / `'auto'` → enabled when `NODE_ENV !== 'production'`.
  - `'true'` / `'1'` → force-enable.
  - `'false'` / `'0'` → force-disable.
- **Pure gating helper** `resolveCatalogPreviewMatchEnabled({ flag, nodeEnv })` in `backend/src/routes/api/v1/catalog.ts` — exported so route registration and tests share one source of truth.
- **New endpoint** `POST /api/v1/catalog/preview-match` (`backend/src/routes/api/v1/catalog.ts`):
  - Registered conditionally — production with no override returns a clean 404 instead of 403.
  - Auth: `authenticateToken` (doctor scope, same as `ai-suggest`).
  - Body schema (strict): `{ catalog: ServiceCatalogV1, reasonForVisitText: string (1..2000, trimmed), recentUserMessages?: string[] (max 8 × 2000), doctorProfile?: { practiceName?, specialty? } | null }`. Uses `serviceCatalogV1BaseSchema` (no catch-all enforcement) on purpose so an in-progress draft missing the catch-all is still previewable.
  - Behavior: one call to `matchServiceCatalogOffering` → translate via `summarizePreviewMatchResult` → return `{ path, matchedServiceKey, matchedLabel, suggestedModality, confidence, autoFinalize, mixedComplaints, reasonCodes, llmAvailable }`.
- **Pure helper** `summarizePreviewMatchResult(result, label, llmAvailable)` (also exported):
  - `result.source === 'llm'` → `path: 'stage_b'`.
  - `result.source === 'fallback'` → `path: 'fallback'`.
  - `result.source === 'deterministic'` + `SINGLE_FEE_MODE` reason code → `path: 'single_fee'`.
  - Otherwise → `path: 'stage_a'`.
  - Coerces missing `suggestedModality` to `null` so the UI never sees `undefined`.

### Backend tests
- New file `backend/tests/unit/routes/catalog-preview-match.test.ts` — **16 cases**:
  - **`previewMatchRequestSchema`** (6): minimal valid payload, optional fields accepted, empty `reasonForVisitText` rejected after trim, missing `catalog` rejected, unknown top-level key rejected (strict), `recentUserMessages` cap of 8.
  - **`summarizePreviewMatchResult` source → path translation** (7): `llm → stage_b`, `fallback → fallback`, `deterministic` no-SINGLE_FEE_MODE → `stage_a`, `deterministic` + SINGLE_FEE_MODE → `single_fee`, `llmAvailable` passthrough on fallback (UI warning), missing `suggestedModality` → null, `mixedComplaints` passthrough.
  - **`resolveCatalogPreviewMatchEnabled` env gating** (3): `flag=true` always on, `flag=false` always off, `flag=undefined` (auto) on for dev/test, off for production.

### Frontend
- **API helper** `postCatalogPreviewMatch` + `PreviewMatchRequest` / `PreviewMatchResponse` / `PreviewMatchPath` types in `frontend/lib/api.ts`. 404 from the backend is translated into a clear "Preview is not enabled on this backend" error so a flag-mismatch is debuggable without opening DevTools.
- **New panel** `frontend/components/practice-setup/CatalogPreviewMatchPanel.tsx`:
  - Textarea + "Run preview" button + result card.
  - Colored badge per `path` (emerald = Stage A instant, indigo = Stage B AI assistant, amber = fallback, slate = single-fee mode).
  - Surfaces `confidence`, `suggestedModality`, `matchedLabel + service_key`, `reasonCodes`.
  - Conditional warning when `path === 'fallback'` and `!llmAvailable` ("Set OPENAI_API_KEY to enable Stage B in this env").
  - Conditional indigo line when `mixedComplaints === true` ("Production DM would ask for clarification before booking").
- **Wired** into `frontend/app/dashboard/settings/practice-setup/services-catalog/page.tsx`:
  - Mounted **only** in `multi_service` mode (single-fee mode has nothing to route).
  - Gated on `process.env.NEXT_PUBLIC_CATALOG_PREVIEW_MATCH_ENABLED === "true" || process.env.NODE_ENV === "development"` (build-time inline so production builds without the flag don't ship the panel at all).
  - Memoized `previewCatalog` derived from `services` via `draftsToCatalogOrNull` + `safeParseServiceCatalogV1` — same pipeline as `runServerReview`, so the doctor previews **their unsaved draft**.
  - Memoized `previewDoctorProfile` from `settings.practice_name` + `settings.specialty` so the LLM gets specialty context.

### Verification
- `npx tsc --noEmit` (backend + frontend): clean.
- `npx jest tests/unit/routes/catalog-preview-match.test.ts`: **16/16**.
- `npx jest` (full backend): **1045/1045 tests across 82 suites** (+16 vs Task 09 baseline of 1029/81), 57/57 snapshots intact.
- `npx eslint src/routes/api/v1/catalog.ts src/config/env.ts`: 0 errors / 0 warnings.
- `npx eslint components/practice-setup/CatalogPreviewMatchPanel.tsx app/dashboard/settings/practice-setup/services-catalog/page.tsx lib/api.ts` (frontend): 0 errors / 0 warnings.
- No matcher logic change → Stage A `dm-routing-golden` corpus baseline holds.
