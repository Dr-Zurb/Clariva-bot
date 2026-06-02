# Task 12: Booking & payment use doctor settings
## 2026-02-06 - Must-have 2: Doctor Setup

---

## 📋 Task Overview

Ensure the booking flow and payment flow use the doctor’s setup: available slots from doctor’s availability (and blocked_times); fee and currency from doctor’s appointment settings (and fee per method if applicable); optional: show or select from doctor’s services list when booking. This is primarily an integration and verification task—worker and payment already use availability-service and getDoctorSettings; confirm they use the right doctor_id (from resolution) and that fee/slots come from DB, not env fallbacks only.

**Estimated Time:** 1.5–2 hours  
**Status:** ⏳ **PENDING**  
**Completed:** —

**Change Type:**
- [ ] **New feature**
- [x] **Update existing** — Verify and optionally adjust worker and payment to use doctor settings consistently; follow [CODE_CHANGE_RULES.md](../../task-management/CODE_CHANGE_RULES.md) if changing

**Current State:**
- ✅ **What exists:** Webhook worker: getAvailableSlots(doctorId, date), getDoctorSettings(doctorId) for payment link; appointment booking uses doctorId; payment-service uses appointment.doctor_id to load settings. availability and doctor_settings tables populated via new APIs (e-tasks 7–10).
- ❌ **What's missing:** Explicit verification that slots are from doctor’s availability (not hardcoded); fee/currency from getDoctorSettings (not only env); optional service selection in conversation/booking; any env fallback behavior documented or removed for production.
- ⚠️ **Notes:** e-task-2 ensures doctorId comes from page_id resolution; e-task-9 extends doctor_settings with methods/fees. Worker and payment-service may already be correct; this task is audit + small fixes + tests.

**Scope Guard:** Expected files touched: ≤ 5

**Reference Documentation:**
- [CODE_CHANGE_RULES.md](../../task-management/CODE_CHANGE_RULES.md) - Audit and impact
- [COMPLIANCE.md](../../Reference/engineering/compliance/COMPLIANCE.md) - No PHI in logs
- [CONTRACTS.md](../../Reference/engineering/architecture/CONTRACTS.md) - API contracts for booking/payment

---

## ✅ Task Breakdown (Hierarchical)

### 1. Audit booking flow
- [ ] 1.1 Trace webhook worker: when user asks to book, worker calls getAvailableSlots(doctorId, date) and getDoctorSettings(doctorId). Confirm doctorId is from page_id resolution (e-task-2), not env.
- [ ] 1.2 Confirm getAvailableSlots uses availability and blocked_times for that doctorId (no global override).
- [ ] 1.3 If booking collects “service” or “reason”, optional: pass service_id or service name from doctor’s services list (e-task-10); worker can list services for that doctor for reply text. If out of scope for MVP, document as follow-up.

### 2. Audit payment flow
- [ ] 2.1 Trace createPaymentLink or equivalent: confirm it uses getDoctorSettings(doctorId) for fee and currency (and fee_per_method if implemented in e-task-9); doctorId from appointment.doctor_id.
- [ ] 2.2 If doctor has no settings row or null fee, document fallback (env or reject with “please set up fees in Settings”). Per MVP completion plan, booking and payment must use doctor settings—prefer “reject” or “use default from env only in dev” over silent env in production.
- [ ] 2.3 Confirm payment webhook updates appointment and uses same doctor_id for notifications.

### 3. Env fallbacks
- [ ] 3.1 List any remaining env vars used for fee/currency/country when doctor_settings is null; add comment or config (e.g. “dev only”) and document in .env.example or setup docs.
- [ ] 3.2 Ensure production path prefers DB over env for per-doctor settings.

### 4. Optional: service in booking
- [ ] 4.1 If product wants “choose service” in chat: worker can call listServices(doctorId) and include in reply or slot confirmation; store selected service_id on appointment if schema extended. If not in MVP scope, add note to MVP completion plan or e-task-10 as future.

### 5. Verification
- [ ] 5.1 Runbook or test: doctor has availability and settings; patient books via Instagram; slots shown are from doctor’s availability; payment link uses doctor’s fee/currency.
- [ ] 5.2 Unit tests: getDoctorSettings used in payment path; getAvailableSlots used with resolved doctorId.
- [ ] 5.3 Type-check and lint

---

## 📁 Files to Create/Update

```
backend/src/
├── workers/
│   └── webhook-worker.ts              (REVIEW - confirm doctorId from resolution; slots/settings from DB)
├── services/
│   └── payment-service.ts             (REVIEW - confirm getDoctorSettings(doctorId) for fee/currency)
└── (optional) docs or runbook          (UPDATE - document that booking/payment use doctor setup)
```

**Existing Code Status:**
- ✅ webhook-worker - EXISTS (uses getAvailableSlots, getDoctorSettings; doctorId from e-task-2)
- ✅ payment-service - EXISTS (getDoctorSettings for payment link)
- ⚠️ REVIEW - Ensure no env-only path in production; optional service in booking

**When updating existing code:**
- [ ] Audit worker and payment-service; map data flow for slots and fee
- [ ] Change only if current behavior uses env when DB has value; otherwise document and add tests
- [ ] Remove or restrict env fallbacks per CODE_CHANGE_RULES

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- Slots must come from doctor’s availability (and blocked_times); fee/currency from doctor_settings.
- doctorId must come from page_id → doctor_id resolution in worker.
- No PHI in logs.

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** (Y – read settings, availability) → [ ] **RLS verified?** (Y – service role with doctor_id filter)
- [ ] **Any PHI in logs?** (MUST be No)
- [ ] **External API or AI call?** (N)
- [ ] **Retention / deletion impact?** (N)

---

## ✅ Acceptance & Verification Criteria

- [ ] Booking flow uses doctor’s availability for slots (resolved doctorId).
- [ ] Payment link uses doctor’s fee and currency from getDoctorSettings(doctorId).
- [ ] Env fallbacks for fee/currency documented and restricted to dev or removed for production.
- [ ] Optional: service list or selection in booking (if in scope); otherwise documented as future.
- [ ] Type-check and lint pass.

---

## 🔗 Related Tasks

- [e-task-2: Webhook resolution page_id → doctor_id](./e-task-2-webhook-resolution-page-id-to-doctor-id.md)
- [e-task-9: Appointment methods & fees](./e-task-9-appointment-methods-and-fees.md)
- [e-task-10: Services table & CRUD API](./e-task-10-services-table-and-crud-api.md)

---

**Last Updated:** 2026-02-06  
**Reference:** [TASK_MANAGEMENT_GUIDE.md](../../task-management/TASK_MANAGEMENT_GUIDE.md)
