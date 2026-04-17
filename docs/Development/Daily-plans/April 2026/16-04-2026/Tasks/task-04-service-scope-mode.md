# Task 04: Service Scope Mode
## 16 April 2026 — Plan 01, Phase C (Control)

---

## Task Overview

Add a `scope_mode` field (`'strict' | 'flexible'`) to `ServiceOfferingV1` so doctors can explicitly control how tightly the bot matches complaints to each service. `strict` = only listed conditions match; `flexible` = broader category matching (current behavior). New services default to `strict`; existing services default to `flexible` to preserve current behavior.

**Estimated Time:** 6–8 hours  
**Status:** COMPLETED  
**Completed:** 2026-04-16

### Implementation Plan (2026-04-16)

1. **Schema (backend + frontend mirror).** Add `scope_mode: z.enum(['strict','flexible']).optional()` to `serviceOfferingCoreSchema` in both `backend/src/utils/service-catalog-schema.ts` and `frontend/lib/service-catalog-schema.ts`. Export `ScopeMode` type. Field is optional so all existing catalogs parse unchanged; `undefined` is normalized to `flexible` at every consumer boundary (deterministic matcher, LLM prompt, draft mapping) — no one reads raw `scope_mode`.
2. **Deterministic scoring.** Introduce a small helper `resolveScopeMode(offering)` that returns `'strict' | 'flexible'` with `undefined → 'flexible'`. Wire it into:
   - `matcherHintScore` → already returns 0 when hints are blank (task-02); for `strict` offerings, short-circuit to 0 whenever neither a `keywords` hit nor a positive `include_when` hit is present. Exclude penalty still applies.
   - `labelOrKeyHits` / `descriptionSubstringHits` fast paths → when the hit is `strict` AND has no hint corroboration (score ≤ 0), downgrade the result from `high`/`autoFinalize:true` to `medium`/`autoFinalize:false`. Flexible (and undefined) preserves current behavior exactly.
   - Leave the `nonCatch.length === 1` fast path untouched — it predates this task and represents "only option" routing; staff review inbox still catches bad routes.
3. **LLM prompt.** Render each allowlist line as `- <key>: "<label>" | [scope: strict|flexible] | <doctor_note?> | <doctor_matcher_hints?> [modalities enabled: ...]`. Add a dedicated "Service scope modes" block in `buildServiceCatalogLlmSystemPrompt` — a concise stricter-of-two contract that composes cleanly with task-01's hint-aware rules (strict overrides label-only inference; flexible keeps the existing rule 3 behavior).
4. **Frontend draft round-trip.** Add `scopeMode: 'strict' | 'flexible'` to `ServiceOfferingDraft`. `emptyServiceDraft` → `strict` (new-default). `catchAllServiceDraft` → `flexible` (always, not editable). `offeringToDraft` → take `o.scope_mode` if set, else default `flexible` for legacy migration continuity. `draftsToCatalogOrNull` → always persists `scope_mode` explicitly so a save materializes the field for legacy rows (task 5.4). The catch-all row's mode is forced to `flexible` regardless of draft state.
5. **Drawer UI.** Replace/augment the drawer with a segmented two-option control (Strict / Flexible) directly under the matching-hints panel. Tooltip copy from task doc. Disabled + visually locked for the catch-all row with a short "Always matches — cannot be changed" note. A small helper paragraph under the control explains "New services default to Strict. Existing services default to Flexible until you change them." — in lieu of a dismissible app-wide banner (4.4) because that requires separate persistence infra; educational goal is preserved contextually.
6. **Tests.** Extend existing suites:
   - `service-catalog-schema.test.ts` — accepts undefined / strict / flexible; rejects garbage enum.
   - `service-catalog-deterministic-match.test.ts` — strict with hint corroboration → match medium; strict with only label hit → downgrade; flexible unchanged; strict + single-non-catch fast path unchanged.
   - `service-catalog-matcher.test.ts` — prompt contains `[scope: strict]` / `[scope: flexible]` per line; scope-mode rule block present and aligned with task-01's hint policy.
7. **Verification.** `tsc --noEmit` on both workspaces; focused suites; full backend `tests/unit`.

**Scope trade-offs / conscious omissions:**
- **4.4 dismissible migration banner** → implemented as inline helper copy in the drawer instead. Reasoning: a one-time app-wide banner needs dismissal persistence (localStorage/doctor_settings flag) + placement in the practice-setup shell, which grows this task beyond the 5–6 file scope guard. Captured as follow-up.
- **`nonCatch.length === 1` fast path** → intentionally not gated on scope (see §2).

**Change Type:**
- [x] **Update existing** — Schema addition, prompt changes, scoring changes, frontend toggle; follow [CODE_CHANGE_RULES.md](../../../task-management/CODE_CHANGE_RULES.md)

**Current State:**
- `backend/src/utils/service-catalog-schema.ts` — EXISTS
  - `ServiceOfferingV1` defined via Zod at ~line 170+
  - `serviceMatcherHintsV1Schema` at line 120
  - No `scope_mode` field exists
- `backend/src/services/service-catalog-matcher.ts` — EXISTS
  - `buildServiceCatalogLlmSystemPrompt()` builds the prompt — will need per-service scope annotation
  - `buildAllowlistPromptLines()` lists services — will need to include `[scope: strict]` or `[scope: flexible]`
- `backend/src/utils/service-catalog-deterministic-match.ts` — EXISTS
  - `matcherHintScore()` calculates deterministic score — `strict` mode should require keyword/include_when match
- `frontend/components/practice-setup/ServiceOfferingDetailDrawer.tsx` — EXISTS
  - Service detail editor — needs `scope_mode` toggle
- `frontend/lib/service-catalog-drafts.ts` — EXISTS
  - Draft state mapping — needs `scope_mode` field

**What's missing:**
- Schema: `scope_mode` field on `ServiceOfferingV1`
- Backend: prompt includes per-service scope mode instruction
- Backend: deterministic scoring adjusts for `strict` vs `flexible`
- Frontend: toggle in service detail drawer
- Frontend: draft field mapping
- Migration: default value for existing services

**Scope Guard:**
- Expected files touched: 5–6
- Any expansion requires explicit approval

**Reference Documentation:**
- [CODE_CHANGE_RULES.md](../../../task-management/CODE_CHANGE_RULES.md)
- [Plan 01](../Plans/plan-01-service-matching-accuracy.md) — Phase C

---

## Task Breakdown

### 1. Schema — add `scope_mode` field

- [x] 1.1 In `service-catalog-schema.ts`, add `scope_mode` to the `ServiceOfferingV1` Zod schema:
  - `scope_mode: z.enum(['strict', 'flexible']).optional()` (optional for backward compatibility; undefined = `flexible` via `resolveServiceScopeMode`)
- [x] 1.2 Export the `ScopeMode` type (also `SERVICE_SCOPE_MODES`, `scopeModeSchema`, `resolveServiceScopeMode`)
- [x] 1.3 Default handling: `undefined` → `'flexible'` via `resolveServiceScopeMode` at every matcher/draft/prompt boundary; new services created via frontend always set it explicitly on save
- [x] 1.4 Schema tests cover: parses undefined, strict, flexible; rejects garbage enum

### 2. Backend — LLM prompt integration

- [x] 2.1 `buildAllowlistPromptLines()` renders `[scope: strict]` / `[scope: flexible]` per service line (undefined normalized to flexible)
- [x] 2.2 `buildServiceCatalogLlmSystemPrompt()` rule 3 now explains both modes — strict only matches keywords/include_when, flexible allows broader category matching, exclude_when still applies
- [x] 2.3 Prompt growth is minimal — one `[scope: <mode>]` tag per service plus a single inline rule bullet

### 3. Backend — deterministic scoring adjustment

- [x] 3.1 `matcherHintScore()` short-circuits to `0` for strict offerings without a positive keyword hit, regardless of include_when overlap; exclude penalty still applies
- [x] 3.2 Flexible (and undefined) preserves prior behavior exactly — verified via dedicated characterization test
- [x] 3.3 `runDeterministicServiceCatalogMatchStageA` label-hit fast path downgrades strict services to `medium` + `autoFinalize:false` when hint corroboration is absent (`hasStrictHintCorroboration`); flexible stays `high` + auto-finalize

### 4. Frontend — scope mode toggle

- [x] 4.1 `ServiceOfferingDetailDrawer.tsx` — segmented Strict / Flexible control below the matching-hints panel, with aria-radiogroup, per-button tooltip copy, and helper paragraph explaining defaults
- [x] 4.2 `service-catalog-drafts.ts` — `scopeMode` added to `ServiceOfferingDraft`; `emptyServiceDraft` → `strict`; `catchAllServiceDraft` → `flexible`; `offeringToDraft` reads `scope_mode` (falls back to `flexible` for legacy, forces flexible for catch-all); `draftsToCatalogOrNull` always persists `scope_mode` explicitly and forces catch-all to `flexible`
- [x] 4.3 Catch-all row shows a locked Flexible pill plus "Always matches — cannot be changed" helper copy
- [x] 4.4 **Deferred** — replaced with inline helper copy in the drawer for this task; app-wide dismissible banner captured in `docs/capture/inbox.md` as a follow-up (needs separate localStorage/doctor_settings flag + practice-setup shell integration)

### 5. Migration for existing services

- [x] 5.1 No DB migration — `scope_mode` lives inside `service_offerings_json` JSONB and is optional in the schema
- [x] 5.2 `resolveServiceScopeMode(undefined) === 'flexible'` across matcher, prompt, and draft mapping
- [x] 5.3 `offeringToDraft` loads legacy rows as `flexible` so the drawer shows the actual effective mode
- [x] 5.4 `draftsToCatalogOrNull` writes `scope_mode` on every save so legacy rows materialize the field the first time a doctor edits them

### 6. Verification & Testing

- [x] 6.1 `npx tsc --noEmit` passes in both `backend/` and `frontend/`
- [x] 6.2 `tests/unit/utils/service-catalog-schema.test.ts` — new SFU-18 cases for parse/reject + `resolveServiceScopeMode`
- [x] 6.3 `tests/unit/services/service-catalog-matcher.test.ts` — per-line `[scope: …]` tags + scope-mode rule block
- [x] 6.4 `tests/unit/utils/service-catalog-deterministic-match.test.ts` — strict label-only downgrade, hint-corroborated stay-high, include_when-only yields null, single-non-catch fast path unchanged
- [x] 6.5 Test cases covered:
  - Strict + keywords "hypertension, diabetes" + complaint "hypertension follow-up review" → matches via keyword, medium
  - Strict + include_when only, no keyword hit → null (Stage B fall-through)
  - Flexible label-only hit → still `high` / auto-finalize (unchanged)
  - Undefined `scope_mode` → parses and behaves as `flexible`
  - LLM prompt contains correct `[scope: strict]` / `[scope: flexible]` per service
- [x] 6.6 Full `tests/unit` suite in backend — **71 suites / 682 tests passing**

---

## Files to Create/Update

```
backend/src/utils/service-catalog-schema.ts                        — UPDATED (scope_mode schema + resolveServiceScopeMode helper + exported ScopeMode type)
backend/src/utils/service-catalog-deterministic-match.ts           — UPDATED (scopeOf, hint-gated scoring, label-hit downgrade for strict)
backend/src/services/service-catalog-matcher.ts                    — UPDATED ([scope: …] per line, scope-mode rule in system prompt)
frontend/lib/service-catalog-schema.ts                             — UPDATED (mirror schema + helpers)
frontend/lib/service-catalog-drafts.ts                             — UPDATED (scopeMode field, catch-all forced flexible, legacy load → flexible, save persists explicitly)
frontend/components/practice-setup/ServiceOfferingDetailDrawer.tsx — UPDATED (segmented Strict/Flexible control + helper copy, catch-all locked)
backend/tests/unit/utils/service-catalog-schema.test.ts            — UPDATED (SFU-18 parse/reject + resolveServiceScopeMode)
backend/tests/unit/utils/service-catalog-deterministic-match.test.ts — UPDATED (SFU-18 strict/flexible behavior)
backend/tests/unit/services/service-catalog-matcher.test.ts        — UPDATED (prompt [scope: …] + rule block)
docs/capture/inbox.md                                              — UPDATED (follow-up: app-wide migration banner)
```

**Existing Code Status:**
- All files above — EXISTS, need targeted updates
- Schema changes are additive (optional field) — no breaking change

**When updating existing code:**
- [ ] Audit all consumers of `ServiceOfferingV1` that might be affected by a new field
- [ ] Verify that `parseServiceCatalogV1` and `safeParseServiceCatalogV1FromDb` handle the new optional field
- [ ] Ensure frontend draft serialization roundtrips correctly

**When creating a migration:**
- [ ] No SQL migration needed — field is inside JSONB column `service_offerings_json`

---

## Design Constraints

- `scope_mode` is optional in the Zod schema — existing catalogs without it must parse without errors
- `undefined` scope_mode → treated as `flexible` everywhere (backward compat)
- The "Other" / catch-all service is always `flexible` — the toggle should be disabled for it
- Prompt changes must not exceed token budget — `[scope: strict]` is 16 chars per service
- The scope mode affects both the deterministic stage AND the LLM stage — both must be consistent

---

## Global Safety Gate

- [x] **Data touched?** Yes — reads/writes `service_offerings_json` via existing catalog save flow
  - [x] **RLS verified?** Yes — uses existing doctor_settings RLS
- [x] **Any PHI in logs?** No
- [x] **External API or AI call?** Yes — scope mode is included in the LLM prompt (existing OpenAI call, no new call)
  - [x] **Consent + redaction confirmed?** Yes — existing flow
- [x] **Retention / deletion impact?** No

---

## Acceptance & Verification Criteria

Task is complete **ONLY when:**
- [x] `scope_mode` field is in the schema and validated
- [x] LLM prompt includes per-service scope annotations
- [x] Deterministic scoring respects strict vs flexible
- [x] Frontend shows the toggle with correct defaults (strict for new, flexible for existing)
- [x] "Other" service is always flexible and toggle is disabled
- [x] Existing catalogs without `scope_mode` still work correctly
- [x] All tests pass including new cases

---

## Related Tasks

- [Task 01: LLM prompt strictness](./task-01-llm-prompt-strictness.md) — prerequisite (prompt rewrite done first)
- [Task 02: Deterministic empty-hints fix](./task-02-deterministic-empty-hints-fix.md) — prerequisite (scoring fix done first)
- [Task 03: Hint learning from corrections](./task-03-hint-learning-from-corrections.md) — independent, can ship before or after

---

**Last Updated:** 2026-04-16  
**Pattern:** Feature flag per entity — schema extension with backward-compatible default  
**Reference:** [Plan 01](../Plans/plan-01-service-matching-accuracy.md)
