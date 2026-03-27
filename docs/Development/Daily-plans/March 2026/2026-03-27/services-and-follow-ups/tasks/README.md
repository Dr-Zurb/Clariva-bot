# Tasks — Services, modalities & follow-ups (SFU)

**Master plan:** [../PLAN-services-modalities-and-follow-ups.md](../PLAN-services-modalities-and-follow-ups.md)  
**Task management:** [docs/task-management/README.md](../../../../../../task-management/README.md)

Execute in **order** below; later tasks assume earlier contracts (types, DB, quote shape).

| Order | Task | Dependency | Est. |
|-------|------|------------|------|
| 1 | [e-task-sfu-01](./e-task-sfu-01-service-catalog-json-zod-and-settings-api.md) | — | 1–2 d |
| 2 | [e-task-sfu-02](./e-task-sfu-02-care-episodes-migration-and-appointment-linkage.md) | sfu-01 (stable `service_key`) | 1–2 d |
| 3 | [e-task-sfu-03](./e-task-sfu-03-quote-engine-core-and-tests.md) | sfu-01, sfu-02 | 1–2 d |
| 4 | [e-task-sfu-04](./e-task-sfu-04-episode-lifecycle-appointment-completed.md) | sfu-02, sfu-03 (quote kinds) | 1 d |
| 5 | [e-task-sfu-05](./e-task-sfu-05-slot-selection-and-payment-amount-from-quote.md) | sfu-03 | 1–2 d |
| 6 | [e-task-sfu-06](./e-task-sfu-06-dashboard-practice-setup-service-matrix-ui.md) | sfu-01 API | 2–4 d |
| 7 | [e-task-sfu-07](./e-task-sfu-07-public-book-flow-service-modality.md) | sfu-01, sfu-05 | 1–2 d |
| 8 | [e-task-sfu-08](./e-task-sfu-08-dm-bot-and-ai-context-catalog-fees.md) | sfu-01, sfu-03 | 1–2 d |
| — | [e-task-sfu-09](./e-task-sfu-09-p2-tiered-discounts-episode-admin-analytics.md) | P1 shipped | backlog |
| 10 | [e-task-sfu-10](./e-task-sfu-10-remove-practice-consultation-types-ui.md) | sfu-06 | 0.5–1 d |

**Code anchors (audit 2026-03-28):**

- Fees + DM: `backend/src/utils/consultation-fees.ts`, `dm-reply-composer.ts`, `doctor-settings.ts` (`consultation_types` text, `appointment_fee_minor`).
- Payment amount today: `backend/src/services/slot-selection-service.ts` (~L301) uses **`appointment_fee_minor` only** (not per service/modality).
- Booking: `bookAppointment` accepts `consultationType` → `appointments.consultation_type` (migration `013`).
- Settings API: `backend/src/services/doctor-settings-service.ts`, `controllers/settings-controller.ts`, `utils/validation.ts` (practice fields).
- Appointment status: `completed`, `cancelled`, `no_show`, etc. in `appointment-service.ts`.

---

**Last updated:** 2026-03-28 (SFU-10 task added)
