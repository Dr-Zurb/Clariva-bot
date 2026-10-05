# Task mca-10: Booking link-first (umbrella)

## 📋 Task Overview

Make a new booking collect identity, reason-for-visit, and consent on the owned Halo Aid page — not in the Instagram thread. Chat keeps FAQs, the booking-link handoff, and emergency copy.

**Status:** ✅ **COMPLETED** — sittings `mca-13`…`mca-15` + `mca-11`.  
**Completed:** 2026-09-16  
**Program / Phase:** meta-channel-align · Phase 3 (intake-off-channel)  
**Batch:** [`plan-p3-meta-channel-align-intake-off-channel-batch.md`](../plan-p3-meta-channel-align-intake-off-channel-batch.md)  
**Execution order:** [`EXECUTION-ORDER-p3-meta-channel-align-intake-off-channel.md`](./EXECUTION-ORDER-p3-meta-channel-align-intake-off-channel.md)

**Current State (inspected 2026-09-16):**
- ✅ Slot-selection already lives on `/book?token=`
- ✅ Conversation already has a patient row (placeholder from the Instagram sender)
- ✅ Consent grant already writes the existing patients columns via consent-service
- ❌ `/book` has no name / phone / reason / consent fields
- ❌ Checkout throws if the patient row has no name/phone (“complete the booking flow in chat first”)
- ❌ Intake + consent still run in the DM funnel before the link
- ✅ Emergency / non-interpretation rules already exist — keep them

**Scope Guard:**
- No new migration, no new consent table
- Reuse the existing patient row and existing consent write path
- Do not strip the emergency gate
- Reuse `/book`; do not invent a second booking product
- One sitting at a time; expected code files per sitting ≤ 4

---

## 🌍 Global Safety Gate

- [x] **Data touched?** Y — existing `patients` row + conversation booking reason (no new columns)
- [x] **Any PHI in logs?** No
- [x] **External API or AI call?** Y — sitting 3 changes receptionist copy on an existing send
- [x] **Retention / deletion impact?** N — same patient/consent columns, new method label only

---

## Sittings

| Sitting | Task | Acceptance |
|---|---|---|
| 1 | [`mca-13`](./task-mca-13-checkout-create-patient.md) | Checkout can finish for a token whose patient row has no name/phone, when the request includes those details + consent |
| 2 | [`mca-14`](./task-mca-14-book-page-intake.md) | `/book` shows the form and will not checkout without consent |
| 3 | [`mca-15`](./task-mca-15-dm-link-first.md) | New booking DM does not collect name / phone / reason / consent |
| 4 | [`mca-11`](./task-mca-11-phase-3-gate.md) | Dummy-patient walk matches the Phase 3 gate |

**Last Updated:** 2026-09-16
