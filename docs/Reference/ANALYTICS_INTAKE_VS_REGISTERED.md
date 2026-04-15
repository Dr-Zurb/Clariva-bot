# Analytics backlog — intake vs registered (funnel)

**Status:** Discovery / design reference. **Not** wired to dashboards until product prioritizes analytics and confirms definitions with ops.

**Audience:** Product, data, engineering. **Privacy:** No PHI in metrics or log labels — see [COMPLIANCE.md](./COMPLIANCE.md) and [OBSERVABILITY.md](./OBSERVABILITY.md) “Metrics Baseline.”

**Related product model:** [PATIENT_REGISTRATION_AND_ROSTER.md](./PATIENT_REGISTRATION_AND_ROSTER.md).

---

## 1. Definitions (for reporting)

| Term | Suggested meaning | Operational signal (today) |
|------|-------------------|------------------------------|
| **Registered** | Patient has completed registration for the practice roster | `patients.medical_record_number` IS NOT NULL (and not blank) |
| **Intake in progress** | Conversation / booking flow started; may or may not have a `patients` row | Linked via `conversations` to doctor; optional filters on `conversation_state` |
| **Intake complete (unpaid)** | *Product-defined* — e.g. consent granted + minimum fields persisted, **before** MRN | Candidate: `consent_status = 'granted'` AND `medical_record_number` IS NULL for patients linked to the doctor via conversation or appointment |

**Note:** “Intake complete” is **not** a single canonical flag in code today; the table above is a **proposal** for SQL/BI. Refine with product (e.g. whether “intake complete” requires a slot held, quote shown, or only consent).

---

## 2. Existing observability (audit summary)

### 2.1 Structured metrics (log-derived counters)

Documented in [OBSERVABILITY.md](./OBSERVABILITY.md):

| Area | `metric` / pattern | What it measures | Funnel link |
|------|-------------------|------------------|-------------|
| OPD | `opd_booking_total` (`mode`: slot \| queue) | Successful `bookAppointment` | Booking volume, not registration |
| OPD | `opd_eta_computed_total`, `opd_queue_reinsert_total` | Queue UX | Indirect |
| Webhooks | `webhook_payment_job_completed_total` | Payment worker branch finished (`parsed`, `appointmentNotified`) | **Paid path** toward registration (MRN follows in worker) |
| Webhooks | `webhook_*` (jobs, DM delivery, routing, etc.) | Pipeline health | DM/booking **routing**, not MRN |

### 2.2 Routing / flow (Instagram)

- **`instagram_dm_routing`** (INFO): `branch`, `state_step_before` / `after`, `conversationId`, `doctorId`, etc. — useful for **conversation funnel** mix; **no** registration outcome.

### 2.3 Ad hoc logger messages (not dashboard metrics)

- `booking_opd_mode` — doctor OPD mode at book time  
- `slot_booking_quote_blocked`, `slot_booking_catalog_*`, `booking_payment_gate_denied` — friction before pay  
- **No** dedicated metric today for `assignMrnAfterPayment` / `ensurePatientMrnIfEligible` success (audit trails exist via `logDataModification`, not aggregated as a counter).

---

## 3. Gap

- **Registered** volume over time: derivable from **database** (`medical_record_number` populated timestamps if you add or use `updated_at` on first MRN set — confirm RPC/migration behavior) or from **periodic snapshots**.
- **Intake complete without registration**: needs a **clear product rule**, then SQL across `patients` + `conversations` (+ optional `appointments`) scoped by `doctor_id`.
- **Funnel conversion** (intake → registered): compare the two cohorts above **in BI**; no single event stream encodes both today.

---

## 4. Recommendations

### 4.1 Short term (no new code): BI / SQL

1. Scope patients to a doctor via existing links (appointments ∪ conversations — same idea as `listPatientsForDoctor`, but **include** pre-MRN for “intake” cohorts).
2. Segment:
   - **A:** `medical_record_number` IS NULL  
   - **B:** `medical_record_number` IS NOT NULL  
3. Optional time dimension: first `consent_granted_at` vs first appointment vs first MRN assignment time (if available in DB).

**Pros:** No new PII in logs; uses source of truth. **Cons:** Requires warehouse/Supabase SQL access and agreed definitions.

### 4.2 Optional incremental instrumentation (when approved)

Add **one** structured INFO metric (pattern: `context: 'patient_metric'`) — for example:

- `patient_registration_completed_total`  
- **Labels:** `path`: `payment_webhook` \| `zero_fee_slot` \| `free_of_cost_book` (no `patient_id`, no phone)

Emit from the three code paths that complete registration (webhook after payment success; slot-selection zero amount; `bookAppointment` free-of-cost). Idempotent RPC means duplicate logs possible on retry — document as “at-least-once” or increment only on RPC return indicating new assign.

**Verify:** [OBSERVABILITY.md](./OBSERVABILITY.md) forbidden labels; no message text.

---

## 5. Task tracking

- Daily plan: [15-04-2026 README](../Development/Daily-plans/April%202026/15-04-2026/README.md) (open questions).  
- Implementation task: [task-05](../Development/Daily-plans/April%202026/15-04-2026/task-05-optional-analytics-intake-vs-registered.md).

---

**Last updated:** 2026-04-15
