# Service catalog matching — Stage A and Stage B

**Audience:** Engineers working on routing, practice setup, or the Instagram DM booking flow.

**Related plans:**

- [Service catalog matcher routing v2](../Daily-plans/April%202026/19-04-2026/Plans/plan-service-catalog-matcher-routing-v2.md) — doctor-facing **example phrases** + `resolveMatcherRouting` (when implemented).

---

## What gets matched

When a patient’s **reason for visit** (and recent messages, redacted) needs to map to a row in `doctor_settings.service_offerings_json`, the backend runs **`matchServiceCatalogOffering`** in `backend/src/services/service-catalog-matcher.ts`.

The catalog must include a catch-all row (`service_key` **`other`**) for “nothing else fits.”

---

## Order of execution (critical)

1. **Early exits** (same file): empty catalog → `null`. **`catalog_mode === 'single_fee'`** → single synthetic row, no Stage A/B.
2. **Stage A — deterministic** — `runDeterministicServiceCatalogMatchStageA` in `backend/src/utils/service-catalog-deterministic-match.ts` on **redacted** text.
3. **If Stage A returns a match** → the function **returns immediately** with `source: 'deterministic'`. **The LLM is not called.**
4. **If Stage A returns `null`** and LLM is allowed → **Stage B** runs: structured LLM output choosing a `service_key` from the **allowlist** (labels, descriptions, matcher hints, scope).
5. If LLM is skipped or fails → **fallback** to catch-all / staff review path (`source: 'fallback'`, low confidence).

So: **Stage B only runs when Stage A does not produce a result.**

---

## Why the LLM might not run

- **Stage A matched:** label-only hit, description substring hit, keyword / matcher-hint score winner, single non–catch-all service shortcut, etc. In those cases routing is fully deterministic for that request.
- **`skipLlm` option** set (tests or feature flag).
- **No OpenAI client** configured → fallback path without Stage B.

This is intentional: **lower latency and cost** when simple rules suffice; **broader language** when Stage A is uncertain.

---

## Stage A (deterministic) — behavior summary

Implementation: `runDeterministicServiceCatalogMatchStageA`.

- All routing-hint reads flow through **`resolveMatcherRouting`** (Plan 19-04, Task 04). Stage A scores each row using `resolved.examplePhrases` (`+4` per substring hit), gates on `resolved.legacyIncludeWhen` (legacy rows only — loose-overlap penalty), and red-flags via `resolved.excludeWhen`. **No direct `matcher_hints.keywords` / `include_when` reads remain in this file.**
- Also uses **label** and **service_key** substrings + **description** substring hits as fast-path matches before falling through to scoring.
- Enforces **`strict` vs `flexible` `scope_mode`** (see schema): strict rows require a positive `examplePhrases` hit (an `include_when` overlap alone is not sufficient) and won't auto-finalize on label-only without hint corroboration.
- **Does not** perform natural-language “understanding”; it is **not** a substitute for Stage B for paraphrases that never hit tokens.

---

## Strict / flexible × resolved hints — Stage A behavior matrix (Phase 2 / Task 08)

After Plan 19-04 Task 04, **strict** services require **example-phrase corroboration** using
**resolved** data (`resolveMatcherRouting → ResolvedRoutingHints.examplePhrases`), not the raw
legacy `keywords` field. The table below is the product-intent matrix Stage A must hold; cell
IDs match the `Phase 2 matrix` describe block in
`backend/tests/unit/utils/service-catalog-deterministic-match.test.ts` so a regression on any
row points the reviewer to a single failing test.

| Cell | scope    | resolved hints                                | patient text                  | Stage A result                          | Path |
|------|----------|-----------------------------------------------|-------------------------------|------------------------------------------|------|
| A1   | strict   | `examples=['htn check']`                      | contains "htn check"          | match `medium`, `autoFinalize=false`     | `KEYWORD_HINT_MATCH` |
| A2   | strict   | `examples=['htn check']`                      | NO overlap                    | `null` → Stage B                         | no signal |
| A3   | strict   | `examples=['htn']`, `exclude_when='pregnancy'`| "htn during pregnancy"        | `null` (excluded)                        | `exclude_when` red flag |
| B1   | flexible | `examples=['htn check']`                      | contains "htn check"          | match `medium`, `autoFinalize=false`     | `KEYWORD_HINT_MATCH` |
| B2   | flexible | `examples=['htn check']`                      | NO overlap                    | `null` → Stage B                         | no signal |
| B3   | flexible | (no hints), label `'General physician'`       | contains "general physician"  | match `high`, `autoFinalize=true`        | label fast path |
| C1   | strict   | (no hints), label `'General physician'`       | contains "general physician"  | match `medium`, `autoFinalize=false`     | label fast path + strict downgrade |
| C2   | strict   | legacy `include_when='diabetes htn'` only     | "htn please"                  | `null` → Stage B                         | strict requires example-phrase corroboration |
| C3   | flexible | legacy `include_when='diabetes htn'` only     | "htn please"                  | `null` → Stage B                         | `legacy_merge` with empty `examplePhrases` → score 0 |

**Reading the matrix:**

- "Stage A result" assumes the *only* matching mechanic is the one named in "Path"; cells
  don't multi-fire (the function returns at the first conclusive path).
- A `null` result means **the LLM (Stage B) gets a chance to route**. That's the point — Stage A
  is intentionally conservative under strict so paraphrased complaints aren't auto-locked to
  the wrong row.
- Cells **A1**, **A2**, **B1**, **B2** are the v2 happy/sad paths the editor's **Example phrases**
  field directly drives — every doctor input on that field maps to one of these four cells.
- Cells **B3** and **C1** show the strict downgrade for label-only matches: same offering is
  picked but `confidence` drops to `medium` and `autoFinalize=false`, which the orchestration
  layer surfaces in the staff-review queue.
- Cells **C2** and **C3** pin the asymmetry between `examples` (positive scoring signal) and
  `legacy include_when` (gate only — never a positive signal on its own under either scope).
  This is why the resolver returns `legacyIncludeWhen?` separately from `examplePhrases`.

**Out of scope (deferred):** a per-doctor "Prefer assistant matching" flag would force Stage A
to return `null` for the deterministic-only cells (A1, B1) so the LLM always gets the call.
Not landing in Phase 2 — out of scope for this plan unless product asks. When/if added, this
matrix becomes the **flag-off** default; cells A1/B1 sprout a flag-on column that returns `null`.

---

## Stage B (LLM) — behavior summary

Implementation: `buildServiceCatalogLlmSystemPrompt` + user content in `service-catalog-matcher.ts`.

- Model output is **JSON** (`service_key`, `match_confidence`, optional `mixed_complaints`, `concerns`, etc.), validated and mapped to a real catalog row.
- **Allowlist only** — cannot invent a new `service_key`.
- System prompt encodes **matcher hints**, **scope (strict/flexible)**, specialty, and rules for mixed complaints.
- **Snippet source (Task 04):** `matcherHintsSnippetForLlm` reads via `resolveMatcherRouting`. v2 (`examples`) rows feed `keywords=` from joined example phrases; legacy rows produce byte-identical snippets to pre-routing-v2 (`keywords=` + `include_when=` + `exclude_when=`). The LLM-facing vocabulary is unchanged so the matching-policy rules in the system prompt continue to bind without prompt drift.
- **Sibling tie-breaker — Phase 3 hybrid (Task 09):** the system prompt now carries a **rule 6 — Sibling tie-breaker** that tells the LLM how to disambiguate when two or more rows could plausibly fit (prefer the row whose hints contain the more specific phrase the patient text matched verbatim → then prefer `[scope: strict]` over `[scope: flexible]` → then `"other"` rather than guessing). When 2+ non-catch-all rows share a token (≥ 4 chars, stop-word filtered) in their resolved `examplePhrases`, an auto-derived **Disambiguation hints (rows whose example phrases share a token …)** block is injected between the JSON schema and the allowlist listing the shared tokens and the rows that contain them, capped at 5 entries with deterministic ordering. The block is omitted entirely when no overlap exists — clean catalogs stay clean. **No doctor-facing schema fields** were added under hybrid; the per-row schema half (`confused_with_service_keys`, `prefer_other_when`) is deferred with rationale (see plan Phase 3 acceptance bullet + the Task 09 doc's Decision log).

---

## PHI and logging

Patient text is **redacted** before Stage B (`redactPhiForAI`). Logs in the matcher path emphasize **correlationId**, **service keys**, **confidence**, **source** — not raw PHI. Keep it that way when extending.

---

## Code map

| Piece | Location |
|--------|----------|
| Orchestration | `backend/src/services/service-catalog-matcher.ts` — `matchServiceCatalogOffering` |
| Stage A | `backend/src/utils/service-catalog-deterministic-match.ts` — `runDeterministicServiceCatalogMatchStageA` |
| LLM system prompt | `backend/src/services/service-catalog-matcher.ts` — `buildServiceCatalogLlmSystemPrompt` |
| Sibling disambiguation (v2, Task 09) | `backend/src/services/service-catalog-matcher.ts` — `detectSiblingExampleOverlaps(catalog)` (exported pure helper) + `buildSiblingDisambiguationBlock(catalog)` (internal renderer). Reads via `resolveMatcherRouting`. Powers rule 6 + the optional `Disambiguation hints (…)` block in the system prompt. |
| Preview widget (v2, Task 10 — dev-only) | Backend: `backend/src/routes/api/v1/catalog.ts` — `POST /api/v1/catalog/preview-match` (gated by `CATALOG_PREVIEW_MATCH_ENABLED` / `resolveCatalogPreviewMatchEnabled`); pure `summarizePreviewMatchResult` translates `result.source` (+ `SINGLE_FEE_MODE` reason code) into `path: 'stage_a' | 'stage_b' | 'fallback' | 'single_fee'`. Frontend: `frontend/components/practice-setup/CatalogPreviewMatchPanel.tsx` mounted in multi-service mode (gated on `NEXT_PUBLIC_CATALOG_PREVIEW_MATCH_ENABLED` / `NODE_ENV`); runs against the unsaved draft via `draftsToCatalogOrNull` + `safeParseServiceCatalogV1`. Telemetry deferred. |
| Schema (hints, scope) | `backend/src/utils/service-catalog-schema.ts` — `serviceMatcherHintsV1Schema` (`examples[]` + legacy `keywords` / `include_when`, `exclude_when`), `scope_mode` |
| Routing resolver (v2) | `backend/src/utils/matcher-routing-resolve.ts` — `resolveMatcherRouting(offering) → ResolvedRoutingHints { examplePhrases, excludeWhen?, legacySource, legacyIncludeWhen? }` |
| Editor draft (v2) | `frontend/lib/service-catalog-drafts.ts` — `ServiceOfferingDraft.matcherExamples: string[]`; `draftsToCatalogOrNull` writes `matcher_hints.examples` (+ `exclude_when`) and **drops** legacy `keywords` / `include_when` once a row has at least one example phrase. `normalizeMatcherExamplesDraft` mirrors the resolver's normalizer. |
| Editor UI (v2) | `frontend/components/practice-setup/ServiceOfferingDetailDrawer.tsx` — `ExamplePhrasesField` (newline-separated textarea + chip preview) is the primary matcher-hints input. For un-migrated rows (Task 07) an **always-visible** amber migration callout exposes the legacy textareas + a one-tap **Convert to example phrases** button (`convertLegacyHintsToExamples` in `service-catalog-drafts.ts`). Exported `hasUnmigratedLegacyHints` is shared with the page-level catalog banner. |
| Catalog banner (v2) | `frontend/app/dashboard/settings/practice-setup/services-catalog/page.tsx` — dismissible amber banner above the multi-service editor showing the count of legacy-only rows; dismissal persists in `localStorage` (`clariva.routing-v2-migration-banner.dismissed`). Auto-hides when the count hits 0. |
| Staff-feedback learner (v2, Task 13) | `backend/src/services/doctor-settings-service.ts` — `appendMatcherHintsOnDoctorCatalogOffering` branches on `(matcher_hints?.examples?.length ?? 0) > 0`: **v2 branch** appends the patient fragment as a single `examples[]` entry via the new `appendExamplesEntry(existing, fragment, maxCount?, maxLen?)` pure helper (case-insensitive trim dedupe → returns `changed: false` and skips the DB write on dup; FIFO eviction at the 24-cap), preserves any pre-existing legacy `keywords` / `include_when` byte-identical (mixed-shape defense), routes `exclude_when` through the existing single-string semicolon merge. **Legacy fallback** (no examples) runs the original `appendMatcherHintFields` byte-for-byte for un-migrated rows. |

**Routing v2 (writer half closed by Task 13):** Stage A, the Stage B prompt builder, the doctor-context AI prompt (`consultation-fees.ts#formatMatcherHintsForAiContext`), the AI suggest / catalog review surfaces (`service-catalog-ai-suggest.ts` — catalog summary, sibling-overlap, deterministic review counters), the Practice Setup editor (Tasks 06 + 07), AND the staff-feedback learning writer (`doctor-settings-service.ts#appendMatcherHintsOnDoctorCatalogOffering`, Task 13, 2026-04-19) all consume / emit `examples` via `resolveMatcherRouting` (Tasks 04 + 05 + 06 + 07 + 13). The editor's sparkle button + page-level review actions forward existing `examples` to the AI suggest endpoint (`existingHints.examples`); `buildSingleCardPrompt` renders them as `examples: a | b | c` and suppresses legacy lines for the same card. The local catalog-quality badge (`frontend/lib/catalog-quality-local.ts`) is now resolver-aware so v2 `examples` count as routing material. **Task 07** ships the doctor-facing migration UX: the per-card callout replaces the Task 06 `<details>` disclosure with an always-visible block that includes a one-tap **Convert to example phrases** CTA (helper `convertLegacyHintsToExamples`); a catalog-level dismissible banner counts un-migrated rows and persists dismissal in `localStorage`; on save, any row that adopts examples drops legacy `keywords` / `include_when` from the persisted JSON (locked product decision — see Task 07 doc). Remaining direct readers of `matcher_hints.keywords` / `include_when` are the writer-side append helpers (`appendMatcherHintsOnDoctorCatalogOffering`, `service-match-hint-sanitize`, schema merge), request-payload validation in `routes/api/v1/catalog.ts`, and the legacy fallback branch of `draftsToCatalogOrNull` (un-migrated rows only — required for byte-for-byte legacy round-trip until the doctor migrates).

---

## FAQ

**Q: Why didn’t my LLM / “assistant” path run for this match?**  
**A:** Because Stage A returned a deterministic match first. See “Order of execution” above.

**Q: Where do I change keyword vs include_when behavior?**  
**A:** Today: Stage A + prompt rules in the two files above; upcoming v2 plan centralizes reads via **`resolveMatcherRouting`**.

---

**Last updated:** 2026-04-19 (Task 13 — service catalog matcher routing v2, Phase 1.7 — **staff-feedback learner now writes into `examples[]` on migrated rows**: `appendMatcherHintsOnDoctorCatalogOffering` in `backend/src/services/doctor-settings-service.ts` branches on `(matcher_hints?.examples?.length ?? 0) > 0`. **v2 branch** collapses the legacy-shaped patch (`inc || kw`) into a single `examples[]` entry via the new pure helper `appendExamplesEntry(existing, fragment, maxCount?, maxLen?)` — case-insensitive trim dedupe returns `{ changed: false }` so the writer short-circuits the DB write on a repeat correction; FIFO eviction at the 24-cap when adding past `MATCHER_HINT_EXAMPLES_MAX_COUNT`. Existing legacy `keywords` / `include_when` strings are preserved **byte-identical** via spread (mixed-shape defense — re-touching them would re-introduce dual-write). `exclude_when` flows through the existing single-string semicolon merge regardless of branch. **Legacy fallback** (no examples present) runs the original `appendMatcherHintFields` byte-for-byte for un-migrated rows. **Closes the writer half of Routing v2** — every code path that writes `matcher_hints` on a v2 row (Task 06 editor saves, Task 07 catalog-banner conversion, Task 11 AI suggest outputs, Task 13 staff-feedback learner) now writes to `examples[]` exclusively; legacy rows continue to round-trip unchanged through the back-compat fallbacks. **Eviction strategy decision** (locked in Task 13's Decision log): FIFO oldest because corrections from this week are more relevant than corrections from last quarter; alternative provenance-aware eviction deferred — would need a per-entry source field on `serviceMatcherHintsV1Schema.examples` plus a UI badge. 12 new tests in `tests/unit/services/doctor-settings-append-matcher-hints.test.ts` (5 helper unit + 6 v2-branch integration + 1 legacy-only regression); all 8 pre-existing tests pass without modification — total 21/21. Full backend suite **1076/1076 across 82 suites** (+12 vs Task 11's 1064). Earlier today: Task 10 — service catalog matcher routing v2, Phase 4 — **hybrid landing**: dev-flag-gated preview endpoint `POST /api/v1/catalog/preview-match` + `<CatalogPreviewMatchPanel>` mounted in the multi-service services-catalog page. Doctors paste a sample patient message and see which Stage won (A = instant rules, B = AI assistant) without sending a real Instagram DM. Runs against the unsaved draft so doctors preview their on-screen edits, not the persisted DB row. PHI inherits the matcher's existing `redactPhiForAI` contract — no new logging surface. **Telemetry (misroute → suggested example phrases) explicitly deferred** with un-defer triggers documented in the Task 10 doc's Decision log; revisit when shadow telemetry on the Phase 3 sibling rule has 2+ weeks of data. 16 new tests in `tests/unit/routes/catalog-preview-match.test.ts` pin the schema, the `summarizePreviewMatchResult` helper across every `source` × `reasonCodes` combo, and the env-gating helper. 1045/1045 backend tests across 82 suites, 57/57 snapshots; backend + frontend `tsc --noEmit` clean. Also Task 09 — Phase 3 — **hybrid landing**: sibling boundaries shipped as prompt-only via two changes in `service-catalog-matcher.ts` — (1) new **rule 6 — Sibling tie-breaker** in `buildServiceCatalogLlmSystemPrompt` (renumbers old rules 6/7 → 7/8); (2) new `detectSiblingExampleOverlaps` + `buildSiblingDisambiguationBlock` helpers that read through `resolveMatcherRouting` and inject a `Disambiguation hints (rows whose example phrases share a token …)` block between Schema and Allowlist when 2+ non-catch-all rows share a meaningful token (≥ 4 chars, stop-word filtered, capped at 5). The per-row schema half (`confused_with_service_keys`, `prefer_other_when`) is **deferred with rationale** — no new doctor-facing fields without telemetry-justified need; revisit only if (a) shadow telemetry from the Apr 12 learning system shows a recurring sibling-pair misroute the prompt rule cannot fix, or (b) doctors organically ask for explicit "send to the other row" controls. 10 new tests in the `Phase 3 sibling tie-breaker + disambiguation hints` describe block; 1029/1029 backend tests across 81 suites, 57/57 snapshots).
