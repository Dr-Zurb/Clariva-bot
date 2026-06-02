# Task 03: `resolveMatcherRouting` module + unit tests

## 19 April 2026 — Plan [Service catalog matcher routing v2](../Plans/plan-service-catalog-matcher-routing-v2.md) — Phase 1.2

---

## Task overview

Introduce the **single resolution layer** for all routing consumers:

- New module (name finalized in PR), e.g. **`backend/src/utils/matcher-routing-resolve.ts`** (or `services/` if the team prefers — **one folder only**).
- **`ResolvedRoutingHints`** (shape TBD, illustrative):
  - `examplePhrases: string[]` — normalized tokens/phrases for Stage A + LLM snippet.
  - `excludeWhen?: string` — from `matcher_hints.exclude_when`.
  - `legacySource: 'examples' | 'legacy_merge'` — telemetry / debugging.
  - Optional: separate **`llmRoutingBlob`** if legacy `include_when` must feed LLM only (per plan: minimum viable legacy = keywords-derived list for Stage A + include_when string for LLM snippet only — **specify in implementation**).

**`resolveMatcherRouting(offering: ServiceOfferingV1): ResolvedRoutingHints`**

- If `matcher_hints?.examples?.length` → trim, dedupe (case-insensitive), cap count/length per Task 02 constants.
- Else → **legacy merge** inside this module only: document algorithm in JSDoc (e.g. split `keywords` on commas/newlines; `include_when` handling for LLM vs Stage A per plan).

**No other file** may read `keywords` / `include_when` for routing after Tasks 04–05 wire-up (enforce in review).

**Estimated time:** 4–8 hours (including tests)

**Status:** Done (2026-04-19)

**Depends on:** Task 02 (schema for `examples`)

**Plan:** [plan-service-catalog-matcher-routing-v2.md](../Plans/plan-service-catalog-matcher-routing-v2.md)

---

## Tests (required)

- `examples` populated → `legacySource === 'examples'`, normalized phrases match expectations.
- Legacy-only row (keywords + include_when, no examples) → deterministic merge matches frozen fixtures (golden outputs).
- Edge cases: empty hints, only exclude_when, catch-all row behavior if relevant.

---

## Acceptance criteria

- [x] Exported `resolveMatcherRouting` + `ResolvedRoutingHints` used by no callers yet is OK — Task 04 wires them.
- [x] Unit tests cover legacy → resolved for at least 3 fixture offerings.
- [x] JSDoc describes legacy merge algorithm so Stage A/LLM changes don’t fork logic.

---

## Out of scope

- Modifying `service-catalog-deterministic-match.ts` (Task 04).
- Frontend (Task 06).

---

## References

- Plan architecture diagram — `plan-service-catalog-matcher-routing-v2.md`

---

## Shipped (2026-04-19)

| Area | Change |
|------|--------|
| Module | `backend/src/utils/matcher-routing-resolve.ts` exports `resolveMatcherRouting`, `ResolvedRoutingHints`, `ResolvedRoutingLegacySource`, `normalizeMatcherExamplePhrases`, `legacyKeywordsToPhraseParts` |
| Contract | `ResolvedRoutingHints = { examplePhrases: string[]; excludeWhen?: string; legacySource: 'examples' \| 'legacy_merge'; llmIncludeWhen?: string }` — `llmIncludeWhen` only set on legacy rows so Stage A never sees `include_when` prose as tokens |
| Legacy merge algorithm | Documented in module JSDoc: split `keywords` on `[,;\n\r]+`, trim, dedupe case-insensitively (preserve first-seen order), clip per-phrase to `MATCHER_HINT_EXAMPLE_MAX_CHARS`, cap count at `MATCHER_HINT_EXAMPLES_MAX_COUNT`. `include_when` passed only as `llmIncludeWhen` blob; `exclude_when` trimmed and surfaced unchanged. |
| `examples` path | When normalized examples are non-empty, legacy strings are ignored entirely (no dual-feed). When examples normalize to empty (all blanks) we fall through to `legacy_merge`. |
| Tests | `backend/tests/unit/utils/matcher-routing-resolve.test.ts` — 18 tests across 4 describe blocks: examples path (6), legacy_merge golden fixtures (7), edge cases (3), helpers (2). Frozen legacy outputs prevent silent drift in Tasks 04–05. |
| Verification | `npx tsc --noEmit` clean; targeted suite green; full backend suite **988/988** passing across 81 suites. |
| Callers | None yet — Task 04 wires Stage A + LLM prompt; Task 05 wires AI suggest / catalog review. |
