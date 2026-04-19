# Plan — Service catalog matcher routing v2 (doctor-friendly routing model)

## 19 April 2026

---

## Goal

Replace the overlapping **Keywords** vs **Book this service when** mental model with a **single doctor-facing concept** — **example phrases** patients actually type — backed by a **clean data model** and a **single resolution layer** that feeds **Stage A** (deterministic) and **Stage B** (LLM allowlist). The outcome is **clearer UI**, **predictable behavior**, and **no permanent layering of hacks** on top of legacy `keywords` / `include_when` strings.

This plan explicitly chooses **Option B** for Phase 1: **new structured fields** in the persisted catalog (additive JSON) plus a **pure resolver module** that produces `ResolvedRoutingHints` for all matcher consumers. We do **not** “fix” the old system by stuffing more semantics into `keywords` or by auto-syncing two free-text boxes.

---

## Problem statement (current system)

1. **Overlapping fields:** `keywords` and `include_when` both describe “what belongs here”; doctors must maintain two parallel lists. The **engine** uses them **asymmetrically** (Stage A scores keyword tokens; `include_when` mainly gates / anchors the LLM), which is invisible in the UI.

2. **Stage A short-circuits Stage B:** If deterministic matching returns a result, the LLM is **never** called (`service-catalog-matcher.ts`). That is correct for cost/latency but must be **documented** and **aligned** with what doctors configure (example phrases should drive Stage A consistently).

3. **Technical debt risk:** Patching only the UI while leaving two string fields and scattered `if (keywords) … else include_when` logic across `service-catalog-deterministic-match.ts`, `service-catalog-matcher.ts`, AI suggest prompts, and the frontend drafts layer guarantees **long-term entanglement**.

---

## Principles (non-negotiable)

1. **One source of truth for routing content** after migration: **`examples[]`** (name TBD in schema; see below) holds patient-style phrases. **`exclude_when`** remains for red flags only.

2. **Legacy read path is explicit and temporary:** A single function **`resolveMatcherRouting(offering)`** (exact name TBD) returns **`ResolvedRoutingHints`** used by Stage A, LLM prompt builder, and any AI-suggest/review copy. If `examples` is absent or empty, the resolver **derives** routing text from legacy `keywords` + `include_when` **only** inside this module — **no** new feature branches scattered across call sites.

3. **No silent dual-write:** The editor either writes **v2 fields** (examples) or, during transition, writes legacy fields **only** until migration completes — avoid maintaining three parallel representations forever.

4. **Schema is additive first:** Prefer extending `matcher_hints` with optional new fields under the same `service_offerings_json` version **1** catalog unless a breaking change is unavoidable. If we introduce **`matcher_routing_version`** or bump **`version`** at catalog root, document migration rules in one place.

5. **Tests pin behavior:** Unit tests for the resolver (legacy → resolved), Stage A scoring on resolved examples, and LLM prompt snapshots / golden strings for `buildAllowlistPromptLines` (or equivalent).

---

## Architecture target

```
┌─────────────────────────────────────────────────────────────┐
│  service_offerings_json.services[].matcher_hints            │
│  (persisted)                                                 │
│    • examples: string[]     ← primary (NEW, Option B)        │
│    • exclude_when: string   ← red flags (retain)              │
│    • keywords / include_when ← LEGACY; read-only via       │
│      resolver after cutover; optional deprecation            │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  resolveMatcherRouting(offering) → ResolvedRoutingHints      │
│  (single module; pure where possible)                        │
│    • If examples.length > 0 → use for tokens + LLM snippet    │
│    • Else → deterministic merge from legacy fields           │
│      (documented algorithm; one implementation)              │
└───────────────────────────┬─────────────────────────────────┘
                            │
            ┌───────────────┴───────────────┐
            ▼                               ▼
┌───────────────────────┐     ┌───────────────────────────────┐
│ Stage A (deterministic)│     │ Stage B (LLM allowlist prompt)  │
│ uses resolved tokens    │     │ uses resolved snippet + label   │
│ + exclude_when          │     │ + description + scope           │
└───────────────────────┘     └───────────────────────────────────┘
```

**Naming note:** Final field name may be `examples`, `patient_phrases`, or `routing_examples` — pick one and use consistently in Zod + frontend types. This plan uses **`examples`** in prose.

---

## Phase 0 — Documentation and internal alignment

**Deliverables**

- Short **developer doc** (e.g. `docs/Development/...` or inline `README` under matcher): **Stage A** = fast substring/rule pass; if it returns, **Stage B is skipped**. **Stage B** = LLM chooses `service_key` from allowlist when Stage A returns null.
- **In-product copy** (practice setup): one paragraph + tooltips explaining **example phrases** vs **not this service when** (once UI exists); until UI ships, doc-only is acceptable.

**Exit criteria:** Any engineer can answer “why did my LLM prompt not run?” without reading source.

**Estimated tasks:** 1 doc task + optional 1 UI copy task.

---

## Phase 1 — Option B: schema + resolver + wire-up (core)

### 1.1 Schema (backend + shared contract)

- Extend **`ServiceMatcherHintsV1`** (`service-catalog-schema.ts`) with optional **`examples`**: e.g. `z.array(z.string().min(1).max(120)).max(24)` (limits are illustrative — tune to payload size and Stage A needs).
- Keep **`exclude_when`** as today.
- **`keywords` and `include_when`**: remain in schema for **backward compatibility**; mark in code comments as **legacy** for routing (post–Phase 1 resolver, new code must not read them outside the resolver).
- **Frontend** `service-catalog-schema.ts` / drafts: mirror types; **ServiceCatalogEditor** gains UI for **example phrases** (list input, newline or chip UX — design in task).

### 1.2 Resolver module (clean boundary)

- New file e.g. **`matcher-routing-resolve.ts`** (backend `utils/` or `services/` — pick one folder and stay consistent):
  - **`ResolvedRoutingHints`** type: `{ examplePhrases: string[]; excludeWhen?: string; legacySource: 'examples' | 'legacy_merge' }` (shape TBD).
  - **`resolveMatcherRouting(offering: ServiceOfferingV1): ResolvedRoutingHints`**
    - If `matcher_hints?.examples?.length` → normalize (trim, dedupe case-insensitive, cap count).
    - Else → **legacy merge**: split `keywords` on commas / newlines; append tokens from `include_when` only if we define a safe rule (e.g. first N chars as blob for LLM only, **not** for Stage A token spam) — **specify in implementation task** to avoid inventing fragile NLP here. Minimum viable legacy path: **keywords-only** for Stage A token list + pass **include_when** string to LLM snippet only (matches today’s asymmetry but **centralized**).
  - **Single export** used by matcher + prompts.

### 1.3 Wire consumers (delete scattered logic)

- **`service-catalog-deterministic-match.ts`**: `matcherHintScore` (or successor) uses **`ResolvedRoutingHints.examplePhrases`** for token scoring; **`exclude_when`** from resolver.
- **`service-catalog-matcher.ts`**: `matcherHintsSnippetForLlm` builds from **`ResolvedRoutingHints`** only.
- **`appendMatcherHintsOnDoctorCatalogOffering`** (if still used): define whether learning-append targets **examples** or legacy — prefer **examples** push for new pipeline.
- **AI suggest / review** (`service-catalog-ai-suggest.ts` summarize catalog): use resolver output for LLM context, not raw `keywords`/`include_when` duplication.

### 1.4 Frontend

- Replace overlapping **Keywords** + **Book when** with:
  - **Example phrases** (primary).
  - **Not this service when** (optional).
- **Persistence:** `draftsToCatalogOrNull` / `offeringToDraft` round-trip **`examples`** array; migration banner for rows that only have legacy fields (read-only display of legacy until doctor saves).

### 1.5 Migration

- **On read:** Resolver handles legacy-only rows — no forced one-time DB migration required for launch.
- **Optional script or admin task:** bulk “split keywords CSV into examples array” for doctors who want cleanup — **post** v2 stable.

**Exit criteria**

- All matcher + prompt paths consume **`resolveMatcherRouting`** only.
- Legacy-only catalogs behave as today within documented tolerance.
- Full unit suite green; new tests for resolver + Stage A + prompt building.

**Estimated tasks:** 4–6 implementation tasks (schema, resolver, deterministic + LLM wiring, frontend editor, drafts, migration notes).

---

## Phase 2 — Stage A behavior matches the product story

**Goal:** Example phrases drive **deterministic** matching consistently; **strict** / **flexible** rules stay coherent with resolver output.

**Deliverables**

- Revisit **`strict`** requirement for keyword hit: apply to **resolved example tokens**, not legacy `keywords` field alone.
- Optional product flag (later): **“Prefer assistant matching”** (more Stage B) — **out of scope** unless product asks; document as future.

**Exit criteria:** Documented matrix: strict + examples + patient text → expected Stage A vs Stage B.

---

## Phase 3 — Sibling boundaries (“don’t confuse A with B”)

**Goal:** Reduce misroutes between two similar services.

**Deliverables**

- Optional fields: e.g. **`confused_with_service_keys: string[]`** + **`prefer_other_when?: string`** on offering or separate small map — **schema design task** (avoid duplicating exclude_when across two cards manually forever).
- Inject pairwise lines into LLM system prompt; optional deterministic tie-breaker.

**Exit criteria:** At least one end-to-end test with two sibling dermatology rows.

---

## Phase 4 — Trust loop: preview + telemetry

**Deliverables**

- **Preview as patient** (practice setup): paste text → show matched service + path (Stage A vs Stage B) + confidence — may be **dev-only** first.
- **Telemetry:** misroute signals feeding **suggested example phrases** (doctor approves) — can follow in a later plan.

**Exit criteria:** Product can demo “configure → try → see result” without production DMs.

---

## Tasks

| # | Phase | Title | Notes |
|---|-------|--------|--------|
| [01](../Tasks/task-01-stage-a-stage-b-documentation.md) ✅ | 0 | Stage A / B doc + optional in-app explainer | `docs/Development/service-catalog-matching-stages.md` + drawer copy |
| [02](../Tasks/task-02-schema-examples-array-backend-frontend.md) ✅ | 1 | Schema: `examples[]` + types (backend + frontend) | Additive Zod; document legacy fields |
| [03](../Tasks/task-03-resolve-matcher-routing-module.md) ✅ | 1 | `resolveMatcherRouting` + unit tests | Legacy merge rules frozen in tests |
| [04](../Tasks/task-04-wire-stage-a-llm-prompt-resolver.md) ✅ | 1 | Wire Stage A + LLM prompt to resolver | Remove direct `matcher_hints.keywords` usage outside resolver |
| [05](../Tasks/task-05-ai-suggest-catalog-review-resolver.md) ✅ | 1 | AI suggest / catalog review use resolver | Single snippet builder |
| [06](../Tasks/task-06-frontend-example-phrases-ui-drafts.md) ✅ | 1 | Frontend: example phrases UI + drafts round-trip | Deprecate dual text areas |
| [07](../Tasks/task-07-migration-ux-legacy-hints-banner.md) ✅ | 1 | Migration UX: banner / read-only legacy display | Catalog banner + per-card callout + Convert CTA |
| [08](../Tasks/task-08-strict-flexible-deterministic-matrix.md) | 2 | Strict + deterministic matrix + tests | Align with examples |
| [09](../Tasks/task-09-sibling-boundary-schema-prompt.md) | 3 | Sibling boundary schema + prompt injection | Optional |
| [10](../Tasks/task-10-preview-widget-stage-a-vs-b.md) ✅ (hybrid) | 4 | Preview widget (Stage A vs B indicator) | Dev-flag-gated; telemetry deferred |
| [11](../Tasks/task-11-ai-suggest-emits-examples-v2.md) ✅ | 1.6 | AI suggest prompts emit `examples[]` (close the autofill loop) | Single-card / starter / review schema flip + normalizer defense (shipped 2026-04-19) |
| [12](../Tasks/task-12-ai-suggest-token-budget-and-truncation.md) ✅ | 1.6 | AI suggest per-mode token budget + clear truncation error | Fixes "AI returned malformed JSON" on Review my catalog (shipped 2026-04-19) |
| [13](../Tasks/task-13-feedback-learner-writes-examples.md) ✅ | 1.7 | Staff feedback learner writes into `matcher_hints.examples` | v2 branch + mixed-shape defense + FIFO eviction at 24-cap (shipped 2026-04-19) |

Suggested implementation order: **01** (parallel) → **02** → **03** → **04** + **05** (04 first or single PR with 05) → **06** + **07** → **08** → **09** (optional) → **10** (optional) → **11** + **12** (independent; ship together) → **13** (after **11** lands so AI autofill doesn't undo learner writes).

---

## Non-goals (this plan)

- Changing **Instagram DM copy** or **patient-facing** strings outside practice-setup / matcher.
- Replacing **LLM allowlist** architecture with a wholly new model (embeddings-only classifier, etc.) — out of scope unless a separate spike approves.
- **Immediate** deletion of `keywords` / `include_when` from JSON schema — **deprecation** only after migration window and editor no longer emits them.

---

## Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Resolver legacy merge differs slightly from old scattered behavior | Golden tests + side-by-side comparison on fixture catalogs before cutover |
| Payload size (`examples[]`) | Hard cap on array length and string length; validate on save |
| Stage A still hides LLM | Document; Phase 2 tunes when deterministic fires |
| Two code paths forever | Deprecation deadline in a follow-up plan; UI hides legacy fields after migration |

---

## Acceptance for the overall program

- [x] **Phase 0:** Doc + optional copy shipped (2026-04-19 — Task 01).
- [x] **Phase 1:** `examples` persisted; resolver is the **only** reader of legacy hints for routing; matcher + prompts updated; frontend uses example phrases UI; tests cover resolver + wiring (Tasks 02–07).
- [x] **Phase 2:** Strict/flexible behavior documented and tested against **examples** (Task 08).
- [x] **Phase 3:** Sibling boundaries — **hybrid landing** (Task 09): prompt-only sibling tie-breaker rule + auto-derived disambiguation block shipped; per-row schema fields (`confused_with_service_keys`, `prefer_other_when`) explicitly **deferred** with rationale (no new doctor-facing fields without telemetry-justified need; LLM already sees every sibling row's resolved hints; revisit only if (a) shadow telemetry from the Apr 12 learning system shows a recurring sibling-pair misroute the prompt rule cannot fix, or (b) doctors organically ask for explicit "send to the other row" controls).
- [x] **Phase 4:** Preview widget — **hybrid landing** (Task 10): dev-flag-gated `POST /api/v1/catalog/preview-match` endpoint + "Try as patient" panel mounted in the multi-service services-catalog page (gated on `NEXT_PUBLIC_CATALOG_PREVIEW_MATCH_ENABLED` or `NODE_ENV === 'development'`) shipped; **misroute → suggested example phrases telemetry explicitly deferred** with rationale (no signal in production yet to feed suggestions; revisit after Phase 3 sibling overlap rule has 2+ weeks of shadow data).

---

## Related

- Current matcher: `backend/src/services/service-catalog-matcher.ts`, `backend/src/utils/service-catalog-deterministic-match.ts`
- Schema: `backend/src/utils/service-catalog-schema.ts` (`serviceMatcherHintsV1Schema`)
- Prior discussion: service matching mental model + Stage A / Stage B (2026-04-19 chat); inbox may reference this plan once filed.

---

**Owner:** TBD  
**Created:** 2026-04-19  
**Status:** Done (hybrid for Phases 3 + 4) — **Phase 0 done** (Task 01), **Phase 1.1–1.5 done** (Tasks 02–07), **Phase 2 done** (Task 08), **Phase 3 hybrid landing done** (Task 09), and **Phase 4 hybrid landing done** (Task 10) on 2026-04-19. Task 10 ships the dev-only first slice the plan invited: a new env-gated route `POST /api/v1/catalog/preview-match` (registered only when `CATALOG_PREVIEW_MATCH_ENABLED=true` — defaults on for `NODE_ENV !== 'production'`) that takes `{ catalog, reasonForVisitText, recentUserMessages?, doctorProfile? }`, runs `matchServiceCatalogOffering` end-to-end, and translates `result.source` (+ `SINGLE_FEE_MODE` reason code) into a single `path` value: `'stage_a' | 'stage_b' | 'fallback' | 'single_fee'` — surfaced via the new `<CatalogPreviewMatchPanel>` mounted under the `<ServiceCatalogEditor>` in multi-service mode (gated on `NEXT_PUBLIC_CATALOG_PREVIEW_MATCH_ENABLED === 'true'` or `NODE_ENV === 'development'`). The panel runs against the **current draft catalog** (mirrors `runServerReview`'s `draftsToCatalogOrNull` + `safeParseServiceCatalogV1` pipeline) so doctors preview unsaved edits, never the persisted DB row. PHI handling inherits the matcher's existing `redactPhiForAI` contract — no new logging surfaces. New tests: 16 cases in `backend/tests/unit/routes/catalog-preview-match.test.ts` pin the schema (accepts/rejects, `recentUserMessages` cap of 8, strict unknown-key rejection), the pure `summarizePreviewMatchResult` helper (every `source` × `reasonCodes` combo → exact `path` value, `suggestedModality` undefined→null coercion, `mixedComplaints` passthrough, `llmAvailable` propagation), and the new pure `resolveCatalogPreviewMatchEnabled` env helper across `flag` × `nodeEnv` matrix. Backend regression: **1045/1045 tests across 82 suites** (+16 vs Task 09 baseline), 57/57 snapshots, `tsc --noEmit` + `eslint` clean on touched src. Frontend: `tsc --noEmit` + `next lint` clean on touched files. **Telemetry (misroute → suggested example phrases) and in-DM-style transcript preview explicitly deferred** with rationale documented in the task's Decision log (no production signal yet to seed suggestions; defer until Phase 3 sibling overlap rule has 2+ weeks of shadow data, then revisit as a separate plan). The bigger 12–24 h slice the original task estimated (production-grade RBAC hardening, in-DM preview, telemetry pipeline) is what Phase 4 explicitly invited as optional; the slice that actually ships gives doctors and us the immediate "configure → try → see result" loop the plan acceptance asked for, behind a flag, in ~2 hours. Task 09 ships the **prompt-only** half of sibling boundaries and **explicitly defers** the per-row schema half with rationale documented in both the task doc's Decision log and the Phase 3 acceptance bullet above. Two changes in `backend/src/services/service-catalog-matcher.ts`: (a) new **rule 6 — Sibling tie-breaker** in `buildServiceCatalogLlmSystemPrompt` that tells the LLM to prefer the row whose hints contain the more specific phrase the patient text matched verbatim, then prefer `[scope: strict]` over `[scope: flexible]` on equal specificity, then fall to `"other"` rather than guessing between siblings; old rules 6/7 renumbered to 7/8 with rule 8's "rules 1–6" reference updated to "rules 1–7"; (b) new exported helper `detectSiblingExampleOverlaps(catalog)` + internal renderer `buildSiblingDisambiguationBlock(catalog)` that auto-detect tokens (≥ 4 chars, conservative stop-word filter, catch-all excluded, capped at 5 deterministic entries) appearing in 2+ rows' resolved `examplePhrases` and inject a `Disambiguation hints (rows whose example phrases share a token …)` block between the JSON schema and the allowlist — only when overlap exists, so clean catalogs stay clean. Reads through `resolveMatcherRouting` so v2 (`examples`) and legacy (`keywords` CSV) rows feed one path. **No new doctor-facing schema fields**, no Stage A behavior change, no migration. New `Phase 3 sibling tie-breaker + disambiguation hints (Routing v2, Plan 19-04, Task 09)` describe block in `service-catalog-matcher.test.ts` adds 10 named cases pinning: shared-token detection, catch-all exclusion, no-overlap returns empty, legacy `include_when`-only does not synthesize false-positive overlap, stop-word + short-token exclusion, deterministic 5-entry cap, block-injection on overlap, block-omission without overlap (anchored on the unique block-only header to disambiguate from the rule-6 mention in prose), rule renumbering, and block positioning between Schema and Allowlist. Backend regression: **1029/1029 tests across 81 suites** (+10 vs Task 08 baseline), 57/57 snapshots intact, `tsc --noEmit` + `eslint` clean on touched src (1 pre-existing warning at line 549, unrelated). Schema half (`confused_with_service_keys`, `prefer_other_when`) deferred under hybrid; un-defer triggers documented in the task's Decision log. Stage A, the Stage B LLM prompt builder, the doctor-context AI prompt (`formatMatcherHintsForAiContext`), and the AI suggest / catalog review paths (catalog summary, sibling-overlap warnings, deterministic review counters) read routing hints exclusively through `resolveMatcherRouting`. The Practice Setup editor (Task 06) now exposes **Example phrases** as the primary doctor-facing input (`ServiceOfferingDraft.matcherExamples: string[]`) and on save persists `matcher_hints.examples` while **dropping** legacy `keywords` / `include_when` for any row that adopted examples — no silent dual-write. The drawer's sparkle button + page-level review actions forward existing `examples` to the AI suggest endpoint (`existingHints.examples`), and the backend prompt builder renders `examples: a | b | c` while suppressing legacy lines. The local catalog-quality badge (`catalog-quality-local.ts`) is now resolver-aware so `examples` count as routing material. v2 (`examples`-only) rows round-trip end-to-end from the editor through Stage A, the LLM prompt, and review with byte-identical legacy behavior preserved for un-migrated rows (1010/1010 backend tests, 81 suites; +4 vs Task 05 baseline). Task 07 (Phase 1.5) ships the migration UX: the per-card `<details>` disclosure from Task 06 is replaced by an **always-visible** amber callout for legacy-only rows with a one-tap **Convert to example phrases** CTA (new helper `convertLegacyHintsToExamples` in `service-catalog-drafts.ts`); a catalog-level dismissible banner above the multi-service editor surfaces the count of un-migrated rows and persists dismissal in `localStorage` (`clariva.routing-v2-migration-banner.dismissed`). `hasUnmigratedLegacyHints` is now exported so the page banner and the per-card callout share a single precedence rule, mirroring the backend resolver. Save-time decision **locked**: when a row's `examples` becomes non-empty, `draftsToCatalogOrNull` writes `matcher_hints.examples` (+ `exclude_when`) and intentionally drops legacy `keywords` / `include_when` — no audit-only legacy retention. Frontend `tsc --noEmit` + `next lint` clean on touched files; backend untouched (1010/1010 baseline holds). Task 08+ remain. Phase 1+ uses **Option B** (new `examples` field + resolver module; no long-term reliance on patching legacy `keywords` / `include_when` in place).
