# Task OPD-08: Edge cases — missed, reschedule, overflow, payment transfer



## 2026-03-24 — OPD initiative



---



## 📋 Task Overview



Implement **policy-driven** flows from [opd-systems-plan.md](./opd-systems-plan.md) **§5.1a–5.1b**, **§5.2** (missed turn, post-consult return), **§7**: **slot** — grace, no-show, reschedule to next available, overflow slot; **queue** — reinsert, end of queue; **payment** — transfer vs new charge per clinic config ([UNIFIED_SLOT_PAYMENT_FLOW.md](../../../../../Reference/UNIFIED_SLOT_PAYMENT_FLOW.md) if applicable).



**Estimated Time:** 12–22 hours  

**Status:** ✅ **DONE** (MVP 2026-03-24) — overflow slot automation & paid-reschedule enforcement deferred.



**Change Type:**

- [x] **Update existing** — appointment status transitions, payment service hooks, admin/doctor actions



**Current State:**

- ✅ **`no_show`** on `appointments.status` (migration `031`); queue row syncs to `missed` via existing hook.

- ✅ **Slot join grace** — `opd_policies.slot_join_grace_minutes` + `assertSlotJoinAllowedForPatient` on patient video token (queue mode skips fixed-clock grace).

- ✅ **Doctor actions** — `POST /api/v1/opd/appointments/:id/mark-no-show`, `POST /api/v1/opd/queue-entries/:entryId/requeue` (`strategy`: `end_of_queue` | `after_current`).

- ✅ **Policy keys** on `doctor_settings.opd_policies`: `slot_join_grace_minutes`, `reschedule_payment_policy`, `queue_reinsert_default` (see [DB_SCHEMA.md](../../../../../Reference/DB_SCHEMA.md)).

- ✅ **Post-consult return** — `appointments.related_appointment_id`, `opd_event_type` (`standard` | `return_after_completed`), `transferred_payment_from_appointment_id` (audit for future fee transfer); **no dedicated “create return visit” API yet**.

- ⚠️ **Reschedule / overflow** — existing Instagram + `updateAppointmentDateForPatient` reschedule path unchanged; **overflow slot** & **auto forfeit** not automated.

- ⚠️ Refund rules — **business** config; helpers return policy only; UI copy non-prescriptive.



**Scope Guard:** Extended **`appointments.status`** with **`no_show`** (additive CHECK migration).



**Reference Documentation:**

- [COMPLIANCE.md](../../../../../Reference/COMPLIANCE.md) (payment messaging)

- [opd-systems-plan.md](./opd-systems-plan.md) §5.1a, §5.2 post-consult table



---



## ✅ Task Breakdown (Hierarchical)



### 1. Status model



- [x] 1.1 Extend **`status`** with **`no_show`**; document in [DB_SCHEMA.md](../../../../../Reference/DB_SCHEMA.md) (no separate `substatus` column).

- [x] 1.2 **`no_show`** maps to queue **`missed`** in `syncOpdQueueEntryOnAppointmentStatus`. **`return_after_completed`** stored as `opd_event_type` + optional **`related_appointment_id`** (schema ready).



### 2. Slot — missed & late



- [x] 2.1 **Grace window** — server-side check before patient Twilio token (`assertSlotJoinAllowedForPatient`); early-join **accepted** still bypasses grace in policy helper.

- [x] 2.2 **Mark missed** — doctor **`mark-no-show`** API; slot “release” for early invite remains manual / existing availability rules.

- [ ] 2.3 **Reschedule** — unchanged from prior booking DM + date update; **overflow / extra slot** not built.



### 3. Slot — payment



- [x] 3.1 Config keys **`forfeit`** vs **`transfer_entitlement`** in `opd_policies` (+ **`transferred_payment_from_appointment_id`** for future row-level audit).

- [x] 3.2 Non-prescriptive defaults documented in DB_SCHEMA; no automated refund UI in this task.



### 4. Queue — reinsert



- [x] 4.1 **Requeue API** (doctor auth) — end of queue & after current patient; position/token renumbering in `opd-queue-service`. **opd-09** notifications not wired.



### 5. Post-consult return



- [x] 5.1 Schema: **`opd_event_type`**, **`related_appointment_id`**; dedicated booking API for “return after completed” **deferred**.



### 6. Verification



- [x] 6.1 Unit tests: **`opd-policy-service`** (grace minutes, payment policy, reinsert default). Full grace **integration** test deferred.



---



## 📁 Files to Create/Update



```

backend/migrations/031_appointments_opd_edge_cases.sql

backend/src/services/opd/opd-policy-service.ts

backend/src/services/opd/opd-queue-service.ts (requeue helpers)

backend/src/services/opd-doctor-service.ts (mark no-show, requeue)

backend/src/services/appointment-service.ts (join grace assert)

backend/src/controllers/opd-doctor-controller.ts

backend/src/routes/api/v1/opd.ts

backend/src/utils/validation.ts (PATCH appointment no_show; requeue body)

backend/tests/unit/services/opd-policy-service.test.ts

docs/Reference/DB_SCHEMA.md

frontend/components/opd/PrimaryCta.tsx

frontend/types/appointment.ts, types/opd-session.ts

frontend/lib/api.ts (PatchAppointmentPayload)

```



---



## 🌍 Global Safety Gate



- [x] **Payment changes** — policy keys + audit column only; no new refund automation.

- [x] **RLS** — doctor-only OPD routes unchanged; patient reschedule still via existing patient-scoped APIs.



---



## 🔗 Related Tasks



- Depends on: [e-task-opd-01](./e-task-opd-01-domain-model-and-database-migrations.md), [e-task-opd-03](./e-task-opd-03-backend-opd-services-and-routing.md)

- Pairs with: [e-task-opd-09](./e-task-opd-09-notifications-observability-testing-docs.md)



---



**Last Updated:** 2026-03-24

