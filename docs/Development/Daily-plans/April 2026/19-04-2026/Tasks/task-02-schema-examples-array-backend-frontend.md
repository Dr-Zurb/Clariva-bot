# Task 02: Schema — `examples[]` on matcher hints (backend + frontend types)

## 19 April 2026 — Plan [Service catalog matcher routing v2](../Plans/plan-service-catalog-matcher-routing-v2.md) — Phase 1.1

---

## Task overview

Add an **optional additive** field to **`ServiceMatcherHintsV1`**: **`examples`** — `string[]` of patient-style phrases (final max length per string and max array length per plan; tune in implementation, e.g. 120 chars × 24 items as illustrative caps).

- **`keywords`** and **`include_when`** remain in the schema for **backward compatibility**; mark in code comments as **legacy for routing** once the resolver (Task 03) owns reads.
- **`exclude_when`** unchanged.
- **Frontend** `frontend/lib/service-catalog-schema.ts` (or equivalent): mirror Zod/types so drafts and API payloads stay aligned.

No consumer wiring beyond types in this task unless trivial re-exports are needed for compilation — **resolver and matcher wiring** are Tasks 03–04.

**Estimated time:** 2–4 hours

**Status:** Done (2026-04-19)

**Depends on:** — (can parallelize with Task 01)

**Plan:** [plan-service-catalog-matcher-routing-v2.md](../Plans/plan-service-catalog-matcher-routing-v2.md)

---

## Implementation notes

1. Extend `serviceMatcherHintsV1Schema` in `backend/src/utils/service-catalog-schema.ts` with `examples: z.array(z.string().min(1).max(N)).max(M).optional()` — **strict** object still works; new optional key is allowed.
2. Update `ServiceMatcherHintsV1` inferred type; export constants for max string length / max count if other modules need them.
3. Frontend: duplicate or share schema validation for `service_offerings_json` parsing (`safeParseServiceCatalogV1` path).
4. **Persistence:** existing rows without `examples` must still parse — no DB migration required.

---

## Acceptance criteria

- [x] Backend Zod accepts catalogs with and without `examples`; invalid `examples` rejected at parse/save boundary per project rules.
- [x] Frontend types and parse path accept `examples`.
- [x] Unit test(s): `service-catalog-schema.test.ts` — catalog with `examples`, legacy without, max count / max length / empty string rejections, `appendMatcherHintFields` preserves `examples`.
- [x] Comments document legacy fields vs new `examples` per plan principles (`service-catalog-schema.ts` ARM-02 block).

---

## Shipped (2026-04-19)

| Area | Details |
|------|---------|
| Constants | `MATCHER_HINT_EXAMPLE_MAX_CHARS` (120), `MATCHER_HINT_EXAMPLES_MAX_COUNT` (24) — backend + frontend |
| Backend schema | `serviceMatcherHintsV1Schema.examples` optional array; legacy `keywords` / `include_when` documented |
| `appendMatcherHintFields` | Copies `existing.examples` into output so staff-learning merges do not drop v2 phrases |
| Frontend schema | Mirror in `frontend/lib/service-catalog-schema.ts` |
| Docs | `docs/Development/service-catalog-matching-stages.md` code map note |

---

## Out of scope

- `resolveMatcherRouting` (Task 03).
- ServiceCatalogEditor UI (Task 06).

---

## References

- `backend/src/utils/service-catalog-schema.ts` — `serviceMatcherHintsV1Schema`
- `frontend/lib/service-catalog-schema.ts`
