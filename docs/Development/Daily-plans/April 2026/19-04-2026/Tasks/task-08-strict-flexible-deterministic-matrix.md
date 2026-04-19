# Task 08: Strict / flexible + Stage A matrix — align with resolved examples

## 19 April 2026 — Plan [Service catalog matcher routing v2](../Plans/plan-service-catalog-matcher-routing-v2.md) — Phase 2

---

## Task overview

After Task 04, **strict** services require **hint corroboration** using resolved data. This task:

1. **Verifies** `strict` + **`ResolvedRoutingHints.examplePhrases`** behavior matches product intent: Stage A scoring and “strict without corroboration” downgrade use **resolved** phrases, not legacy `keywords` field alone.
2. **Documents** a small matrix in code comments or `docs/Development/`:

   | Scope   | examples present | Patient text        | Expected path (illustrative)   |
   |---------|------------------|---------------------|--------------------------------|
   | strict  | yes              | hits a phrase       | Stage A possible / confidence  |
   | strict  | yes              | no hit              | Stage B or fallback            |
   | flexible| …                | …                   | …                              |

3. Adds or updates **unit tests** for edge cases called out in the plan (strict + empty examples should remain a **catalog quality** issue elsewhere — don’t duplicate review panel logic here unless needed).

**Optional** “Prefer assistant matching” (more Stage B) — **out of scope** unless product requests; mention in doc as future.

**Estimated time:** 4–8 hours

**Status:** Done

**Depends on:** Task 04 (and Task 03)

**Plan:** [plan-service-catalog-matcher-routing-v2.md](../Plans/plan-service-catalog-matcher-routing-v2.md)

---

## Acceptance criteria

- [x] Documented matrix checked in (doc or test file header).
- [x] Tests cover at least 2 strict + 2 flexible scenarios with resolved hints.
- [x] Plan Phase 2 acceptance checkbox satisfied.

---

## Out of scope

- Changing `scope_mode` enum or DB schema.
- Instagram DM behavior.
- "Prefer assistant matching" product flag (more Stage B even when Stage A would match).
  Not landing in Phase 2; documented as flag-off default in the matrix doc so the future
  flag-on column has a one-line landing spot.

---

## References

- `backend/src/utils/service-catalog-deterministic-match.ts` — `matcherHintScore`, `hasStrictHintCorroboration`, JSDoc matrix on `runDeterministicServiceCatalogMatchStageA`
- `backend/src/services/service-catalog-matcher.ts` — LLM strict rules
- `docs/Development/service-catalog-matching-stages.md` — narrative + matrix table

---

## Shipped

The Phase 2 deliverable is **documentation + regression tests** — no Stage A behavior
change. Task 04 already lifted the strict-corroboration check to read resolved
example phrases (`ResolvedRoutingHints.examplePhrases`) instead of the legacy
`keywords` field; this task pins that intent so it cannot quietly regress.

**Matrix (9 cells, three identical copies kept in sync):**

| Cell | scope    | resolved hints                                | patient text                  | Stage A result                          |
|------|----------|-----------------------------------------------|-------------------------------|------------------------------------------|
| A1   | strict   | `examples=['htn check']`                      | contains "htn check"          | match `medium`, `autoFinalize=false`     |
| A2   | strict   | `examples=['htn check']`                      | NO overlap                    | `null` → Stage B                         |
| A3   | strict   | `examples=['htn']`, `exclude_when='pregnancy'`| "htn during pregnancy"        | `null` (excluded)                        |
| B1   | flexible | `examples=['htn check']`                      | contains "htn check"          | match `medium`, `autoFinalize=false`     |
| B2   | flexible | `examples=['htn check']`                      | NO overlap                    | `null` → Stage B                         |
| B3   | flexible | (no hints), label `'General physician'`       | contains "general physician"  | match `high`, `autoFinalize=true`        |
| C1   | strict   | (no hints), label `'General physician'`       | contains "general physician"  | match `medium`, `autoFinalize=false`     |
| C2   | strict   | legacy `include_when='diabetes htn'` only     | "htn please"                  | `null` → Stage B                         |
| C3   | flexible | legacy `include_when='diabetes htn'` only     | "htn please"                  | `null` → Stage B                         |

**Files touched:**

1. `backend/src/utils/service-catalog-deterministic-match.ts` — added a 9-cell JSDoc table
   directly above `runDeterministicServiceCatalogMatchStageA`, plus a "Out of scope
   (deferred)" note for "Prefer assistant matching".
2. `docs/Development/service-catalog-matching-stages.md` — new "Strict / flexible × resolved
   hints — Stage A behavior matrix (Phase 2 / Task 08)" section before the Stage B summary,
   with the matrix, the "reading the matrix" key, and the deferred-flag note.
3. `backend/tests/unit/utils/service-catalog-deterministic-match.test.ts` — new
   `Phase 2 matrix (Routing v2, Plan 19-04, Task 08)` describe block with 9 named tests
   (`A1`..`C3`). Each test forces the multi-row Stage A code path (3 services on the
   `catalogNcdGpOther()` fixture) so cells exercise the same branch the production code
   takes; cell IDs match the JSDoc table and the doc table for easy grep when a regression
   trips a single cell.

**Verification:**

- `npx tsc --noEmit` (backend): clean.
- `npx jest tests/unit/utils/service-catalog-deterministic-match.test.ts`: 30/30
  pass (21 pre-existing + 9 new matrix cells).
- `npx jest` (full backend suite): 1019/1019 pass across 81 suites; 57/57 snapshots.
- `npx eslint src/utils/service-catalog-deterministic-match.ts`: clean.

**What this protects:**

- A future refactor that re-introduces "include_when alone is enough corroboration on
  strict" trips C2 (and the JSDoc table reads as a lie next to the failing test).
- A regression that drops the strict label-only downgrade trips C1 (matches B3 instead).
- A regression that lets `exclude_when` be silently ignored when `examples` is set trips A3.
- A regression that lets a strict row with v2 `examples` auto-finalize on a pure example
  hit trips A1 (the row should stay `medium` + `autoFinalize=false`; auto-finalize is
  reserved for the label fast path, and even then strict downgrades it).

**Out of scope reminder:** the "Prefer assistant matching" flag is intentionally not
implemented. When/if product asks, the matrix above becomes the **flag-off** column and a
flag-on column is added that returns `null` for cells A1 and B1 (forcing Stage B). The doc
already calls this out so the next implementer doesn't have to rediscover it.
