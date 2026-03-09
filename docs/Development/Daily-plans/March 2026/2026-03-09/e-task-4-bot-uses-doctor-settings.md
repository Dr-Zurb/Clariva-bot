# Task 4: Bot Uses Doctor Settings
## 2026-03-09

---

## 📋 Task Overview

Integrate doctor settings into the appointment booking bot: slot date selection (not only tomorrow), per-doctor slot interval and timezone, AI context with practice name and business hours, and multi-day slot search when tomorrow has no slots.

**Estimated Time:** 4–5 hours  
**Status:** ✅ **COMPLETED**  
**Completed:** 2026-03-09

**Change Type:**
- [ ] **New feature** — New behavior (date selection, multi-day search)
- [x] **Update existing** — webhook-worker, availability-service, ai-service; follow [CODE_CHANGE_RULES.md](../../../task-management/CODE_CHANGE_RULES.md)

**Current State:**
- ✅ **What exists:** getTomorrowDate() always used; SLOT_INTERVAL_MINUTES from env (30); AI prompt says "Clariva Care"; getAvailableSlots uses env interval
- ❌ **What's missing:** Date selection beyond tomorrow; per-doctor slot_interval, timezone, min_advance_hours; practice_name and business_hours_summary in AI; multi-day slot search
- ⚠️ **Notes:** doctor-settings-service.getDoctorSettings uses admin client; webhook-worker has doctorId. Fallback to env when doctor has no row or null.

**Scope Guard:**
- Expected files touched: ≤ 6

**Reference Documentation:**
- [DOCTOR_SETTINGS_PHASES.md](../../../Reference/DOCTOR_SETTINGS_PHASES.md)
- [APPOINTMENT_BOOKING_BOT_FLOW.md](../../../Reference/APPOINTMENT_BOOKING_BOT_FLOW.md)
- [CODE_CHANGE_RULES.md](../../../task-management/CODE_CHANGE_RULES.md)

---

## ✅ Task Breakdown (Hierarchical)

### 1. Slot Date Selection (Beyond Tomorrow)
- [x] 1.1 Load doctor_settings in webhook-worker when processing slot flow — **Completed: 2026-03-09**
- [x] 1.2 Use `max_advance_booking_days` for multi-day search — **Completed: 2026-03-09**
- [ ] 1.3 (Future) Parse "tomorrow", "next Monday" from user message
- [x] 1.4 When no date specified: default to tomorrow — **Completed: 2026-03-09**
- [x] 1.5 Store `slotSelectionDate` in conversation state — **Completed: 2026-03-09**

### 2. Slot Generation (Per-Doctor Settings)
- [x] 2.1 Pass `slot_interval_minutes` to getAvailableSlots — **Completed: 2026-03-09**
- [x] 2.2 Pass `timezone` for slot display (formatSlotsForDisplay) — **Completed: 2026-03-09**
- [x] 2.3 Apply `min_advance_hours` in getAvailableSlots — **Completed: 2026-03-09**
- [x] 2.4 Update availability-service.getAvailableSlots with optional options — **Completed: 2026-03-09**
- [ ] 2.5 (Optional) booking_buffer_minutes — deferred
- [ ] 2.6 (Optional) max_appointments_per_day — deferred

### 3. Multi-Day Slot Search
- [x] 3.1 getSlotsWithMultiDaySearch: try next days when slots empty — **Completed: 2026-03-09**
- [x] 3.2 Message "No slots available in next X days" when no slots — **Completed: 2026-03-09**
- [ ] 3.3 (Future) Day choice UI when multiple days have slots

### 4. AI Context (Practice Name, Business Hours & Other Settings)
- [x] 4.1 Load doctor_settings and pass doctorContext to generateResponse — **Completed: 2026-03-09**
- [x] 4.2 Inject `practice_name` into AI prompt — **Completed: 2026-03-09**
- [x] 4.3 Inject `business_hours_summary`, `specialty`, `address_summary`, `cancellation_policy_hours` — **Completed: 2026-03-09**
- [ ] 4.4 (Optional) welcome_message — deferred
- [x] 4.5 Ensure no PHI in prompts — **Completed: 2026-03-09**

### 5. Appointment Creation (Optional)
- [x] 5.1 Use `default_notes` when creating appointment — **Completed: 2026-03-09**

### 6. Verification & Testing
- [x] 6.1 Run type-check — **Completed: 2026-03-09**
- [ ] 6.2 Manual test: doctor with custom slot_interval
- [ ] 6.3 Manual test: tomorrow has no slots → multi-day search
- [ ] 6.4 Manual test: AI reply uses practice_name

---

## 📁 Files to Create/Update

```
backend/src/
├── workers/
│   └── webhook-worker.ts           (UPDATED - load settings, date selection, multi-day)
├── services/
│   ├── availability-service.ts    (UPDATED - accept slotInterval, timezone, minAdvanceHours)
│   └── ai-service.ts              (UPDATED - practice_name, business_hours in prompt)
└── services/
    └── doctor-settings-service.ts (already has getDoctorSettings)
```

**Existing Code Status:**
- ✅ webhook-worker.ts — getTomorrowDate(), slotSelectionDate, getAvailableSlots call
- ✅ availability-service.ts — getAvailableSlots uses env.SLOT_INTERVAL_MINUTES
- ✅ ai-service.ts — RESPONSE_SYSTEM_PROMPT hardcodes "Clariva Care"

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- No PHI in logs (COMPLIANCE.md)
- Service layer must not import Express types
- Fallback chain: doctor_settings column → env → safe default
- Slot interval: 15, 20, 30, 45, 60 only
- Timezone: IANA format; validate or allow common values

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** (N – read-only doctor_settings)
- [ ] **Any PHI in logs?** (No)
- [ ] **External API or AI call?** (Y – Instagram Send API, OpenAI)
  - [ ] **Consent + redaction confirmed?** (Y)
- [ ] **Retention / deletion impact?** (N)

---

## ✅ Acceptance & Verification Criteria

- [x] Slot date can be beyond tomorrow (multi-day search within max_advance_booking_days) — **Implemented**
- [x] Slot interval comes from doctor_settings (fallback env) — **Implemented**
- [x] min_advance_hours excludes too-soon slots — **Implemented**
- [x] When tomorrow has no slots, bot searches subsequent days — **Implemented**
- [x] AI uses practice_name and business_hours_summary when set — **Implemented**

---

## 🔗 Related Tasks

- [e-task-1: Extend doctor_settings migration](./e-task-1-doctor-settings-extend-migration.md)
- [e-task-2: Doctor settings API](./e-task-2-doctor-settings-api.md)
- [e-task-1: Receptionist bot reply fix](../2026-03-08/e-task-1-receptionist-bot-reply-and-webhook-fixes.md)

---

**Last Updated:** 2026-03-09  
**Completed:** 2026-03-09  
**Reference:** [TASK_MANAGEMENT_GUIDE.md](../../../task-management/TASK_MANAGEMENT_GUIDE.md)
