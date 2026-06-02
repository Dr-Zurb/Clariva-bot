# Tasks: AI receptionist — service matching & staff review (2026-04-01 plan)

**Initiative status:** ✅ **ARM-01 — ARM-11** implementation complete in repo (2026-03-31); optional Playwright / full E2E smoke remains on-demand.

**Parent plan:** [plan-ai-receptionist-service-matching-and-booking.md](../plan-ai-receptionist-service-matching-and-booking.md)  
**Task management:** [TASK_MANAGEMENT_GUIDE.md](../../../../../task-management/TASK_MANAGEMENT_GUIDE.md), [TASK_TEMPLATE.md](../../../../../task-management/TASK_TEMPLATE.md)

**Prefix:** `e-task-arm-NN` (AI Receptionist **M**atching — service routing, staff review, payments)

---

## Dependency order (recommended)

```text
e-task-arm-01 (catalog: Other / not listed)
    └──► e-task-arm-02 (matcher hint fields) ── optional parallel to arm-01

e-task-arm-03 (conversation state for match + review)
    └──► e-task-arm-06 (DB + APIs: pending review + audit)
            └──► e-task-arm-04 (matcher engine + allowlist)
            └──► e-task-arm-05 (DM / bot branching + messaging)
            └──► e-task-arm-07 (doctor inbox UI)
            └──► e-task-arm-08 (24h SLA worker + notifications)

e-task-arm-09 (slot-page-info + /book pre-fill) — after arm-03; coordinates with arm-05/06
e-task-arm-10 (pay-after-confirm + no pre-capture on pending path) — after arm-06, arm-09
e-task-arm-11 (quote safety: narrow legacy fallback) — after arm-01; can trail arm-05
```

---

## Task index

| ID | Title | Est. |
|----|--------|------|
| [e-task-arm-01](./e-task-arm-01-mandatory-other-not-listed-catalog.md) | Mandatory **Other / not listed** catalog row + save validation + dashboard nudges | 1–2 d |
| [e-task-arm-02](./e-task-arm-02-matcher-hints-catalog-fields.md) | Optional **matcher** fields on offerings (keywords / extended hints) + editor UX | 1–2 d |
| [e-task-arm-03](./e-task-arm-03-conversation-state-match-and-review.md) | **ConversationState** (and persistence) for confidence, proposal, pending-review linkage | 0.5–1 d |
| [e-task-arm-04](./e-task-arm-04-service-matcher-engine.md) | **Matcher v1**: structured output, allowlist validation, tests | 2–3 d |
| [e-task-arm-05](./e-task-arm-05-dm-flow-high-vs-pending-staff.md) | Instagram **DM FSM**: high confidence → current path; low → pending staff, **no** slot link yet | 2–4 d |
| [e-task-arm-06](./e-task-arm-06-pending-review-persistence-and-apis.md) | **DB + APIs** for pending review requests + **mandatory audit** trail | 2–3 d |
| [e-task-arm-07](./e-task-arm-07-doctor-review-inbox-ui.md) | Dashboard **inbox**: confirm / reassign / cancel + audit | 2–3 d |
| [e-task-arm-08](./e-task-arm-08-sla-timeout-and-patient-notify.md) | **24h SLA** job: timeout → cancel pending, notify patient, idempotent | 1–2 d |
| [e-task-arm-09](./e-task-arm-09-slot-page-info-and-book-prefill.md) | **`slot-page-info`** + **`/book`**: suggested service from conversation; pre-fill policy | 1–2 d |
| [e-task-arm-10](./e-task-arm-10-pay-after-staff-confirm.md) | **Payment gating**: no capture on low-confidence path until staff confirm + single final charge | 2–4 d |
| [e-task-arm-11](./e-task-arm-11-catalog-quote-fallback-safety.md) | Tighten **multi-service catalog** quote when `catalogServiceKey` invalid (legacy fallback) | 0.5–1 d |

---

## Code anchors (existing — audit at execution time)

| Area | Location |
|------|----------|
| Conversation state | `backend/src/types/conversation.ts` — already has `catalogServiceKey`, `catalogServiceId`, `consultationModality`, `reasonForVisit` |
| Catalog Zod | `backend/src/utils/service-catalog-schema.ts` — `ServiceOfferingV1` has `label`, optional `description`, `modalities` |
| Catalog UI | `frontend/app/dashboard/settings/practice-setup/services-catalog/page.tsx`, `ServiceCatalogEditor`, `service-catalog-drafts.ts`, `frontend/lib/service-catalog-schema.ts` |
| Slot / quote | `backend/src/services/slot-selection-service.ts` — `resolveCatalogServiceKeyForSlotBooking`, `computeSlotBookingQuote`, `applyPublicBookingSelectionsToState` |
| Booking API | `backend/src/controllers/booking-controller.ts` — `getSlotPageInfoHandler`, `selectSlotAndPayHandler` |
| Public book | `frontend/app/book/page.tsx` |
| DM worker | `backend/src/workers/instagram-dm-webhook-handler.ts` |
| AI context | `backend/src/services/ai-service.ts`, `backend/src/utils/consultation-fees.ts` — `formatServiceCatalogForAiContext`, `pickCatalogServicesMatchingUserText` |

---

**Last Updated:** 2026-03-31
