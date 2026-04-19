# Task 01: Stage A / Stage B documentation + optional in-app explainer

## 19 April 2026 — Plan [Service catalog matcher routing v2](../Plans/plan-service-catalog-matcher-routing-v2.md) — Phase 0

---

## Task overview

Engineers and (optionally) doctors need a single, accurate explanation of how **service catalog matching** works:

- **Stage A (deterministic):** Fast rules on redacted patient text — substring overlap, keyword-style token scoring, label/description hits, special cases. **If Stage A returns a match, the LLM is not called** (`matchServiceCatalogOffering` returns immediately).
- **Stage B (LLM):** Runs only when Stage A returns `null`. The model chooses a `service_key` from the **allowlist** built from the doctor’s catalog (labels, descriptions, matcher hints, scope).

This task adds **developer-facing documentation** first. **In-product** copy (practice setup tooltips / one paragraph) is optional and can ship with Task 06 when the example-phrases UI lands.

**Estimated time:** 1–2 hours (doc only); +30–60 min if adding practice-setup copy in this task.

**Status:** Done (2026-04-19)

**Depends on:** —

**Plan:** [plan-service-catalog-matcher-routing-v2.md](../Plans/plan-service-catalog-matcher-routing-v2.md)

---

## Deliverables

1. **Developer doc** (choose one location; keep it discoverable):
   - Option A: `docs/Development/` short page, e.g. `service-catalog-matching-stages.md`, OR
   - Option B: `backend/src/services/README-matcher.md` or a subsection under an existing Reference doc.
2. Content must cover:
   - Stage A vs Stage B responsibilities and **order of execution**.
   - **Why** the LLM might not run (Stage A short-circuit).
   - Pointer to code: `service-catalog-matcher.ts` (`matchServiceCatalogOffering`), `service-catalog-deterministic-match.ts` (Stage A).
   - Link to Plan v2 for the **routing model** (examples + resolver) once those tasks ship.
3. **Optional:** One paragraph + tooltips in practice setup **if** copy is ready; otherwise defer to Task 06 and note “copy lives with example-phrases UI”.

---

## Acceptance criteria

- [x] Any engineer can answer “why didn’t the LLM run for this match?” using only the doc + plan link.
- [x] Doc links to `service-catalog-matcher.ts` and deterministic Stage A module (`docs/Development/service-catalog-matching-stages.md` code map + `@see` in both modules).
- [x] Plan Phase 0 checkbox can be marked done when this task (and optional copy) ships — in-app paragraph added under Matching hints in `ServiceOfferingDetailDrawer.tsx`.

---

## Out of scope

- Changing matcher code.
- Patient-facing Instagram copy.

---

## References

- `backend/src/services/service-catalog-matcher.ts` — `matchServiceCatalogOffering` (Stage A then Stage B).
- `backend/src/utils/service-catalog-deterministic-match.ts` — `runDeterministicServiceCatalogMatchStageA`.

---

## Shipped (2026-04-19)

| Deliverable | Location |
|-------------|----------|
| Developer doc | `docs/Development/service-catalog-matching-stages.md` |
| Philosophy cross-link | `docs/Reference/AI_BOT_BUILDING_PHILOSOPHY.md` (Related) |
| `@see` doc pointers | `backend/src/services/service-catalog-matcher.ts`, `backend/src/utils/service-catalog-deterministic-match.ts` |
| In-app explainer | `frontend/components/practice-setup/ServiceOfferingDetailDrawer.tsx` (paragraph under Matching hints) |
| Inbox | `docs/capture/inbox.md` |
