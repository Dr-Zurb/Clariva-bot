# Patient registration vs early intake (doctor roster)

**Audience:** Engineers, product, and support. **Scope:** What “registered” means for the **doctor dashboard Patients list**, versus ongoing bot **intake** (data collection, reminders, consent). This note does **not** replace the full booking narrative — see [APPOINTMENT_BOOKING_FLOW.md](./APPOINTMENT_BOOKING_FLOW.md).

---

## Two ideas (do not conflate)

| Concept | Meaning |
|--------|---------|
| **Early intake** | Conversation state, fields collected, consent where applicable, reminders, and persistence needed to convert visits — analogous to a saved cart. A row may exist on `patients` and be linked to a conversation **before** the doctor should treat them as “on the panel.” |
| **Registered (roster / Patients list)** | For the **default doctor Patients API**, a patient appears only when they are linked to that doctor (appointments and/or conversations) **and** they have a **non-null `medical_record_number` (MRN)**. MRN is assigned via the same idempotent path used after first payment or after no-payment booking completion (migration 046 RPC `assign_patient_mrn`). |

**Important:** Not everyone who chats with the bot appears in **Patients**. Merged placeholder rows stay excluded by existing name/phone rules.

---

## How MRN gets assigned (summary)

| Path | Trigger |
|------|---------|
| **Paid online booking** | Payment success webhook → `assignMrnAfterPayment` (existing). |
| **₹0, waived, or no payment step** | Booking finalized without gateway capture → `ensurePatientMrnIfEligible` (delegates to the same RPC; no-op if MRN already set). |

Paid and zero-fee paths both converge on the same idempotent assignment — retries do not create duplicate MRNs.

---

## Daily plan & task links

- **Context & principles:** [15-04-2026 daily README](../Development/Daily-plans/April%202026/15-04-2026/README.md)
- **List filter (MRN gate):** [task-01](../Development/Daily-plans/April%202026/15-04-2026/task-01-patients-list-mrn-filter.md)
- **Zero-fee / no-payment MRN:** [task-02](../Development/Daily-plans/April%202026/15-04-2026/task-02-mrn-zero-fee-booking-complete.md)

---

## Deferred: doctor-created patients

Manual “add patient” from the doctor UI is **out of scope** until roster rules are finalized. See [deferred-doctor-ui-add-patient-2026-04.md](../Development/deferred/deferred-doctor-ui-add-patient-2026-04.md).

---

## Internal runbook (dashboard vs operations)

- **Doctor dashboard — Patients** — Shows **registered** patients (MRN present), subject to merge filters. Use this list when the doctor asks “who is on my panel from the bot.”
- **Operations / nurture** — Conversations, reminders, and stored intake data may still be relevant for follow-up **even when** the patient is not yet on the Patients list. Low visibility in the dashboard does not mean “no record.”

---

## Implementation pointers (code)

- `listPatientsForDoctor` — `backend/src/services/patient-service.ts`
- `assignMrnAfterPayment` / `ensurePatientMrnIfEligible` — `backend/src/services/patient-service.ts`
- Payment webhook MRN — `backend/src/workers/webhook-worker.ts`
- Zero-amount slot completion — `backend/src/services/slot-selection-service.ts`
- Free-of-cost booking — `backend/src/services/appointment-service.ts` (`bookAppointment`)

### See also

- [ANALYTICS_INTAKE_VS_REGISTERED.md](./ANALYTICS_INTAKE_VS_REGISTERED.md) — optional funnel analytics (intake vs registered)

---

**Last updated:** 2026-04-15
