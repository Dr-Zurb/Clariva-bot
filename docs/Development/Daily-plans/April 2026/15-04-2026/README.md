# Daily plan — 15 April 2026

## Patient roster vs early intake — doctor UI visibility & registration

**Goal:** Align product behavior with: **(1)** keep collecting and storing patient-related data early for conversion (reminders, contact per consent — “cart” model); **(2)** show a patient in the **doctor dashboard Patients list** only when they are **registered** in a defined sense; **(3)** handle **₹0 / waived** paths so registration does not depend on a payment webhook alone.

---

## Deferred (explicit)

| Item | Location |
|------|----------|
| **Doctor UI — add patient manually** | [deferred-doctor-ui-add-patient-2026-04.md](../../../deferred/deferred-doctor-ui-add-patient-2026-04.md) |

Resume manual add-patient when roster rules and MRN semantics for non-bot paths are clear.

---

## Task files (implementation order)

| # | Task | Phase | Effort | Notes |
|---|------|-------|--------|--------|
| 01 | [task-01-patients-list-mrn-filter.md](./task-01-patients-list-mrn-filter.md) | A | Medium | MRN gate on `listPatientsForDoctor`; blocks pre-pay clutter |
| 02 | [task-02-mrn-zero-fee-booking-complete.md](./task-02-mrn-zero-fee-booking-complete.md) | B | Medium–Large | ₹0 / no-payment completion → MRN; pair with 01 |
| 03 | [task-03-reference-docs-registered-patient.md](./task-03-reference-docs-registered-patient.md) | C | Small | Reference doc; can run parallel after 01 draft |
| 04 | [task-04-frontend-patients-empty-state.md](./task-04-frontend-patients-empty-state.md) | D | Small | After 01 API behavior is clear |
| 05 (opt) | [task-05-optional-analytics-intake-vs-registered.md](./task-05-optional-analytics-intake-vs-registered.md) | — | TBD | Discovery: [ANALYTICS_INTAKE_VS_REGISTERED.md](../../../../Reference/ANALYTICS_INTAKE_VS_REGISTERED.md); code metrics deferred |

**Template:** [TASK_TEMPLATE.md](../../../../task-management/TASK_TEMPLATE.md) · **Rules:** [CODE_CHANGE_RULES.md](../../../../task-management/CODE_CHANGE_RULES.md)

**Suggested order:** 01 → 02 → 04 (03 anytime, ideally before 04 copy).

---

## Problem statement (current behavior)

- `listPatientsForDoctor` unions patient IDs from **appointments** and **conversations** for the doctor (`patient-service.ts`).
- Bot flow creates/updates a **`patients`** row after consent (`createPatientForBooking` / `persistPatientAfterConsent`) **before** payment.
- **MRN** is assigned after first successful payment (`assignMrnAfterPayment`, migration 046) — good for DM copy, but **does not** currently gate dashboard listing.
- Result: patients can appear in the doctor UI **before** payment or “booking complete,” which is confusing for “who is registered.”

---

## Principles (agreed)

1. **Early data is valuable** — Continue collecting and persisting data needed for booking flow, **abandoned-booking reminders**, and (where consented) **call/SMS** nurture — analogous to a saved cart; this is independent of “show in doctor roster.”
2. **Doctor Patients list = registered panel** — Use a clear signal; **`medical_record_number` present** is a strong candidate for “first-class registration” for **paid** bot journeys.
3. **Doctor-created patients** — Deferred until [manual add patient](../../../deferred/deferred-doctor-ui-add-patient-2026-04.md); when built, assign MRN or explicit visibility on create so they appear without bot payment.
4. **Zero-fee / waived services** — Payment success may never fire; **MRN must still be assignable** when booking is finalized without capture (see below).

---

## Design: registration triggers (target state)

| Path | When to assign MRN / mark “visible in Patients” |
|------|---------------------------------------------------|
| **Online paid booking** | Keep: `assignMrnAfterPayment` after successful payment webhook (existing). |
| **₹0, comp, or no payment step** | On **booking completion** (e.g. appointment confirmed, `free_of_cost` / service flag): call same RPC / `assignMrnAfterPayment` **or** a renamed `ensurePatientRegistered` that no-ops if MRN exists — **must not** rely only on `processPaymentSuccess`. |
| **Abandoned / pre-pay** | Data may exist on patient row + conversation; **do not** show in Patients until a registration trigger fires (typically MRN). |
| **Manual add (future)** | Explicit create path + MRN or policy decided in deferred doc. |

---

## Implementation plan (phased)

### Phase A — Dashboard list filter (backend)

- Change **`listPatientsForDoctor`** (and any duplicate consumer of the same logic) so **default list** includes only patients who meet **at least one** of:
  - `medical_record_number IS NOT NULL`, **or**
  - (optional interim) has **appointment** with `payment_status` / business rule TBD — **only if** you need visibility before MRN in edge cases.
- **Exclude** (or filter) conversation-only links for patients **without** MRN **unless** explicitly out of scope for v1.
- **Tests:** Unit tests for list composition; regression for merged patients.

### Phase B — Zero-fee / no-payment completion

- Trace booking finalize path(s) for **queue / payment mode** when amount is 0 or payment is skipped.
- After **appointment** reaches a “confirmed / booked” state without gateway capture, invoke **MRN assignment** once per patient (idempotent).
- Align with `bookAppointment` / worker / public booking handlers — single helper preferred.

### Phase C — Product copy & docs

- **Canonical reference:** [PATIENT_REGISTRATION_AND_ROSTER.md](../../../../Reference/PATIENT_REGISTRATION_AND_ROSTER.md) — intake vs registered (MRN), paid vs zero-fee pointers, deferred manual add, internal runbook.
- Short note in `docs/Reference` (e.g. APPOINTMENT or PATIENT): **registered** = MRN for bot; staff path TBD.
- Internal runbook: what doctors see vs what ops can still use (conversations, reminders).

### Phase D — Frontend

- If API returns filtered list only, **Patients** page may need empty state / tooltip (“Patients appear after first completed registration or payment”).
- No change required if API is source of truth.

---

## Open questions

1. **Placeholder patients** (`findOrCreatePlaceholderPatient`) — still linked by conversation; confirm they never get MRN until a registration trigger; list filter should hide them if name/phone are placeholder patterns (existing merge filters partial).
2. **Returning patients** — Already have MRN; may show on new conversation before new payment — **acceptable** if “registered” means “ever registered.”
3. **Analytics** — Whether to track “intake complete, unpaid” separately from “registered” for funnel metrics. **Discovery doc:** [ANALYTICS_INTAKE_VS_REGISTERED.md](../../../../Reference/ANALYTICS_INTAKE_VS_REGISTERED.md) (SQL/BI first; optional metrics later).

---

## References

- `listPatientsForDoctor` — `backend/src/services/patient-service.ts`
- `assignMrnAfterPayment` — `backend/src/services/patient-service.ts`; webhook — `backend/src/workers/webhook-worker.ts`
- Migration 046 — `backend/migrations/046_patient_mrn_after_payment.sql`
- Deferred manual patient — [deferred-doctor-ui-add-patient-2026-04.md](../../../deferred/deferred-doctor-ui-add-patient-2026-04.md)

---

**Index:** [14 Apr 2026 (prior daily)](../14-04-2026/README.md) · [Deferred tasks](../../../deferred/README.md)

**Last updated:** 2026-04-15
