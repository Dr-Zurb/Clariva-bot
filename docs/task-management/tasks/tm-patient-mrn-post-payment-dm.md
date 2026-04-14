# tm-patient-mrn-post-payment-dm — Patient ID (P-xxxxx) after payment

**Daily plan:** [docs/Development/Daily-plans/April 2026/14-04-2026/README.md](../../Development/Daily-plans/April%202026/14-04-2026/README.md)  
**Template:** [TASK_TEMPLATE.md](../TASK_TEMPLATE.md)

---

## Objective

Assign the **human-readable Patient ID** (`P-xxxxx` / MRN) **only after the first successful payment**, not on patient row creation. New patients start with `NULL` MRN; returning patients keep theirs.

---

## Implemented approach: Option B (schema + payment-time assignment)

| Layer | Change |
|-------|--------|
| **Migration 046** | `medical_record_number` → nullable, DEFAULT removed. New Postgres function `assign_patient_mrn(UUID)` for atomic nextval assignment. |
| **Types** | `Patient.medical_record_number: string \| null`. `InsertPatient`, `PatientSummary`, frontend type updated. |
| **Payment hook** | `assignMrnAfterPayment()` in `patient-service.ts` → called from `webhook-worker.ts` after `processPaymentSuccess`. |
| **Payment confirmation DM** | `sendPaymentConfirmationToPatient` now accepts optional `patientMrn` param and includes "Your patient ID: **P-xxxxx**" in the message. |
| **Pre-payment DMs** | **No change needed.** `formatPatientIdHint` already returns `''` when MRN is null — booking DMs naturally omit the ID hint for new patients. |

---

## Files changed

| File | What |
|------|------|
| `backend/migrations/046_patient_mrn_after_payment.sql` | **New.** DROP DEFAULT, DROP NOT NULL, CREATE FUNCTION `assign_patient_mrn`. |
| `backend/src/types/database.ts` | `Patient.medical_record_number: string \| null`; `InsertPatient` updated. |
| `backend/src/services/patient-service.ts` | New `assignMrnAfterPayment()`. `PatientSummary` type updated. |
| `backend/src/services/patient-matching-service.ts` | `PossiblePatientMatch.medicalRecordNumber` and `DuplicateGroupPatient.medicalRecordNumber` → `string \| null`. |
| `backend/src/workers/webhook-worker.ts` | Calls `assignMrnAfterPayment` after payment success, passes MRN to notification. |
| `backend/src/services/notification-service.ts` | `sendPaymentConfirmationToPatient` accepts `patientMrn?` and includes it in DM copy. |
| `frontend/types/patient.ts` | `medical_record_number?: string \| null`. |

---

## How it works (end to end)

1. **New patient arrives** via Instagram DM → `findOrCreatePlaceholderPatient` inserts row → `medical_record_number = NULL`.
2. **Booking DM** sent with slot link → `formatPatientIdHint(null)` returns `''` → **no ID shown**.
3. **Patient pays** → Razorpay/PayPal webhook → `processPaymentSuccess` confirms appointment.
4. **`assignMrnAfterPayment`** called → Postgres `assign_patient_mrn(UUID)` atomically assigns next `P-xxxxx` via `patient_mrn_seq`.
5. **Payment confirmation DM** includes: "Your patient ID: **P-00042**. Save this for future bookings."
6. **Returning patient** (already has MRN from prior payment) → `assign_patient_mrn` returns existing value (no-op).

---

## Safety gate

- [x] **Data touched?** Yes → patient.medical_record_number schema change
  - [x] **RLS verified?** N/A — uses admin client (webhook worker context)
- [x] **Any PHI in logs?** No — MRN is not logged; only audit metadata
- [x] **External API?** Instagram send (existing path); Razorpay/PayPal webhook (existing path)
- [x] **Retention / deletion:** No new tables; NULL MRN rows are standard patient rows

---

## Verification

- [x] `npx tsc --noEmit` — clean
- [x] notification-service tests — 19 passed
- [x] webhook-worker tests — 26 passed
- [x] No linter errors

---

## Related

- Booking flow reference: [APPOINTMENT_BOOKING_FLOW_V2.md](../../Reference/APPOINTMENT_BOOKING_FLOW_V2.md)
- Deferred (separate): interim "please wait" DM — `docs/Development/deferred/`

---

**Status:** ✅ Implemented  
**Last updated:** 2026-04-14
