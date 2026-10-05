# Task mca-13: Sitting 1 — checkout can create the patient

## 📋 Task Overview

Public checkout must be able to finish when the conversation patient is still a placeholder (no name/phone from chat). The request body may include name, phone, reason for visit, and an explicit consent grant. Those values write the **existing** patient row and grant consent through the **existing** consent columns / audit path. No new table.

**Program / Phase:** meta-channel-align · Phase 3 (intake-off-channel)  
**Batch:** [`plan-p3-meta-channel-align-intake-off-channel-batch.md`](../plan-p3-meta-channel-align-intake-off-channel-batch.md)  
**Execution order:** [`EXECUTION-ORDER-p3-meta-channel-align-intake-off-channel.md`](./EXECUTION-ORDER-p3-meta-channel-align-intake-off-channel.md)  
**Umbrella:** [`mca-10`](./task-mca-10-booking-link-first.md)  
**Estimated Time:** 1 hour  
**Status:** ✅ **COMPLETED**  
**Completed:** 2026-09-16

**Change Type:**
- [x] **Update existing**

**Current State:**
- ✅ Tokenized `POST /api/v1/bookings/select-slot-and-pay` already creates the appointment
- ✅ Conversation already points at a patient row
- ✅ `updatePatient` + consent audit already exist
- ✅ Checkout accepts owned-page name / phone / reason / consent and writes the existing row
- ⏳ `/book` UI still does not collect those fields (`mca-14`)

**Scope Guard:**
- Expected files touched: ≤ 4 code files (controller, validation, slot-selection service, one unit test) plus the matching contract note
- Do not add a migration or a new patients column
- Do not create a second patient row; update the conversation’s existing row
- Do not overwrite name/phone when the row already has both
- Do not change `/book` UI (sitting 2) or DM copy (sitting 3)
- Do not log names, phones, or raw request bodies
- Reschedule path unchanged

---

## 🌍 Global Safety Gate

- [x] **Data touched?** Y — existing patient row + optional conversation reason
- [x] **Any PHI in logs?** No
- [x] **External API or AI call?** N
- [x] **Retention / deletion impact?** N

---

## ✅ Task Breakdown

### 1. Accept owned-page details on checkout
- [x] ✅ 1.1 Validate optional name, phone, reason, and consent-granted on the existing checkout body - **Completed: 2026-09-16**
- [x] ✅ 1.2 Pass those fields from the controller into slot selection (validate → service → respond) - **Completed: 2026-09-16**
- [x] ✅ 1.3 Note the optional body fields on the public booking contract - **Completed: 2026-09-16**

### 2. Write the placeholder patient when details are present
- [x] ✅ 2.1 If the conversation patient already has name and phone, keep today’s path (ignore a new identity on the body) - **Completed: 2026-09-16**
- [x] ✅ 2.2 If name or phone is missing, require name + phone + explicit consent; write the existing row and record consent the same way chat consent does - **Completed: 2026-09-16**
- [x] ✅ 2.3 If details are still missing, fail with a booking-page message — not “complete the flow in chat” - **Completed: 2026-09-16**
- [x] ✅ 2.4 Use a provided reason for the appointment when chat never collected one - **Completed: 2026-09-16**

### 3. Verification
- [x] ✅ 3.1 Unit test: placeholder patient + complete details → apply; ready patient → unchanged; missing consent → incomplete - **Completed: 2026-09-16**
- [x] ✅ 3.2 Typecheck + lint the touched files - **Completed: 2026-09-16**
- [x] ✅ 3.3 Update this task + the batch table when sitting 1 is done - **Completed: 2026-09-16**

---

## ✅ Acceptance

- [x] A checkout whose patient row has no name/phone succeeds when the body includes name, phone, reason, and consent granted
- [x] The existing patient row is updated; no second row is created
- [x] Consent is stored on the existing columns and audited (no name/phone in logs)
- [x] A ready patient (name + phone already present) still books without those body fields
- [x] Missing details no longer tell the user to finish in chat

**Last Updated:** 2026-09-16
