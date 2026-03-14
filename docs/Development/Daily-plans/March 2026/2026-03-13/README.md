# Daily Plan: 2026-03-13

## Appointment Booking Flow V2 — Complete Redesign

This folder contains tasks for implementing the redesigned appointment booking flow: "all at once" collection, confirm-details step, external slot picker with proactive messaging, and redirect-to-chat for compliance.

**Reference:** [APPOINTMENT_BOOKING_FLOW_V2.md](../../../Reference/APPOINTMENT_BOOKING_FLOW_V2.md)

---

## Task Index

| Task | Description | Status | Depends On |
|------|-------------|--------|------------|
| [e-task-1](./e-task-1-migrations-slot-selections-patients-email.md) | Migrations: slot_selections table, patients.email | ✅ Complete | — |
| [e-task-2](./e-task-2-collection-flow-redesign.md) | Collection: "all at once", age, email, confirm_details, remove consultation_type | ⏳ Pending | e-task-1 |
| [e-task-3](./e-task-3-slot-selection-api.md) | API: POST select-slot, token, save draft, proactive send, redirect URL | ⏳ Pending | e-task-1 |
| [e-task-4](./e-task-4-external-slot-picker-page.md) | Frontend: Public /book page, calendar, slots, redirect | ⏳ Pending | e-task-3 |
| [e-task-5](./e-task-5-webhook-flow-integration.md) | Webhook: New steps, reason_for_visit to notes, flow wiring | ⏳ Pending | e-task-2, e-task-3 |

---

## Summary

### Desired Flow (High Level)

1. **Collect** — Ask all details at once; accept partial; validate; allow corrections.
2. **Confirm details** — Read back summary; user confirms or corrects.
3. **Consent** — Combined consent; ready to pick time.
4. **Slot link** — Send link to external page.
5. **External page** — User picks slot, saves → backend saves draft, sends proactive message, returns redirect URL.
6. **Redirect** — User redirected to Instagram.
7. **Final confirm** — User sees message, replies Yes → book.

### Key Changes from Current

| Current | New |
|---------|-----|
| Sequential (name → phone → …) | "All at once" + partial |
| No confirm_details | Confirm before slots |
| Chat slot list (1, 2, 3) | External calendar + grid |
| User sends message to trigger | Bot sends proactively after save |
| No redirect | Redirect to chat after save |
| consultation_type collected | Skipped |
| No age, no email | Age required, email optional |
| reason_for_visit optional | Required; wire to notes |

---

**Last Updated:** 2026-03-13
