# e-task-phil-02 — Booking relation kin terms: data module + tests

**Initiative:** [BOT_PHILOSOPHY_ELITE_AUDIT_2026.md](../../../../../task-management/BOT_PHILOSOPHY_ELITE_AUDIT_2026.md)  
**Themes:** T1a  
**Planning source:** [rt-01-ai-service-findings-and-planned-changes.md](../planning/rt-01-ai-service-findings-and-planned-changes.md) §4.2 (G1), [findings-log](../planning/findings-log.md)  
**Maps to:** [tm-bot-audit-01-routing-context.md](../../../../../task-management/tasks/tm-bot-audit-01-routing-context.md)

---

## Objective

Move **`BOOKING_RELATION_KIN`** (and related static kin lists if any) into a **single module** (e.g. `booking-relation-terms.ts`) with **unit tests**; establish process: **prefer** `BOOKING_RELATION_LLM` / `resolveBookingTargetRelationForDm` for new phrasing; add regex term **only** if product requires zero-latency path.

---

## Preconditions

- [x] Product agrees LLM relation resolver is default for OOV terms **or** documents exceptions.

---

## Tasks

- [x] Create **`backend/src/utils/booking-relation-terms.ts`** (or agreed path) exporting kin arrays / sets used by `ai-service` and webhook.
- [x] Replace inline imports in **`ai-service.ts`** (and **`instagram-dm-webhook-handler.ts`** if duplicated) with module imports.
- [x] Add **snapshot or exhaustive unit tests** for allowed terms (guard against accidental removal).
- [x] Add short **README or file header**: how to propose new terms (issue template bullet).

---

## Acceptance criteria

- No duplicated kin string lists across handler and `ai-service`.
- Tests fail if kin list is emptied or key relations removed without intent.

---

## Out of scope

- Removing **multi-person booking** regex entirely — may remain for closed patterns per §5.
