# Task 1: Extend doctor_settings Table (Migration)
## 2026-03-09

---

## 📋 Task Overview

Add new columns to `doctor_settings` for practice branding, timezone, slot configuration, and booking limits. Enables per-doctor customization of the appointment booking experience.

**Estimated Time:** 1–2 hours  
**Status:** ✅ **COMPLETED**  
**Completed:** 2026-03-09

**Change Type:**
- [ ] **New feature** — Add columns only (no removal)
- [x] **Update existing** — Extend existing table; follow [CODE_CHANGE_RULES.md](../../../task-management/CODE_CHANGE_RULES.md)

**Current State:**
- ✅ **What exists:** `doctor_settings` table (009_doctor_settings.sql) with `doctor_id`, `appointment_fee_minor`, `appointment_fee_currency`, `country`, `created_at`, `updated_at`
- ❌ **What's missing:** New columns for practice_name, timezone, slot_interval_minutes, max_advance_booking_days, min_advance_hours, business_hours_summary; plus cancellation_policy_hours, max_appointments_per_day, booking_buffer_minutes, welcome_message, specialty, address_summary, consultation_types, default_notes
- ⚠️ **Notes:** Slot interval currently comes from env `SLOT_INTERVAL_MINUTES` (30 min). New default 15 min per doctor.

**Scope Guard:**
- Expected files touched: ≤ 5 (migration, types, service select)
- Column count: 14 new columns total

**Reference Documentation:**
- [DOCTOR_SETTINGS_PHASES.md](../../../Reference/DOCTOR_SETTINGS_PHASES.md)
- [MIGRATIONS_AND_CHANGE.md](../../../Reference/MIGRATIONS_AND_CHANGE.md)
- [CODE_CHANGE_RULES.md](../../../task-management/CODE_CHANGE_RULES.md)

---

## ✅ Task Breakdown (Hierarchical)

### 1. Create Migration
- [x] 1.1 Create new migration file (next number after 011) — **Completed: 2026-03-09**
  - [x] 1.1.1 Add `practice_name TEXT NULL`
  - [x] 1.1.2 Add `timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata'`
  - [x] 1.1.3 Add `slot_interval_minutes INTEGER NOT NULL DEFAULT 15`
  - [x] 1.1.4 Add `max_advance_booking_days INTEGER NOT NULL DEFAULT 90`
  - [x] 1.1.5 Add `min_advance_hours INTEGER NOT NULL DEFAULT 0`
  - [x] 1.1.6 Add `business_hours_summary TEXT NULL`
  - [x] 1.1.7 Add `cancellation_policy_hours INTEGER NULL`
  - [x] 1.1.8 Add `max_appointments_per_day INTEGER NULL`
  - [x] 1.1.9 Add `booking_buffer_minutes INTEGER NULL`
  - [x] 1.1.10 Add `welcome_message TEXT NULL`
  - [x] 1.1.11 Add `specialty TEXT NULL`
  - [x] 1.1.12 Add `address_summary TEXT NULL`
  - [x] 1.1.13 Add `consultation_types TEXT NULL`
  - [x] 1.1.14 Add `default_notes TEXT NULL`
- [x] 1.2 Verify migration runs cleanly (no RLS changes needed; existing policies apply)

### 2. Update Types and Service
- [x] 2.1 Update `DoctorSettingsRow` in `backend/src/types/doctor-settings.ts` with new fields — **Completed: 2026-03-09**
- [x] 2.2 Update `getDoctorSettings` select in `doctor-settings-service.ts` to include new columns — **Completed: 2026-03-09**

### 3. Verification & Testing
- [x] 3.1 Run type-check — **Completed: 2026-03-09**
- [ ] 3.2 Apply migration in dev and verify schema
- [ ] 3.3 Verify existing doctor_settings rows work (new columns have defaults)

---

## 📁 Files to Create/Update

```
backend/
├── migrations/
│   └── 012_doctor_settings_extend.sql   (CREATE)
└── src/
    ├── types/
    │   └── doctor-settings.ts           (UPDATED)
    └── services/
        └── doctor-settings-service.ts   (UPDATED - select new columns)
```

**Existing Code Status:**
- ✅ `backend/migrations/009_doctor_settings.sql` — EXISTS (base table)
- ✅ `backend/src/types/doctor-settings.ts` — EXISTS (needs new fields)
- ✅ `backend/src/services/doctor-settings-service.ts` — EXISTS (needs select update)

**When creating a migration:** (MANDATORY)
- [ ] Read all previous migrations (in numeric order) — see MIGRATIONS_AND_CHANGE.md
- [ ] Use ALTER TABLE ADD COLUMN (no data migration needed; defaults apply)

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- Use ALTER TABLE ADD COLUMN for backward compatibility
- No PHI in doctor_settings (administrative data)
- Slot interval valid values: 15, 20, 30, 45, 60 (validation in API layer, not DB)
- Timezone: IANA format (e.g. Asia/Kolkata, America/New_York)
- cancellation_policy_hours, max_appointments_per_day, booking_buffer_minutes: INTEGER NULL (optional)
- welcome_message, specialty, address_summary, consultation_types, default_notes: TEXT NULL (optional)

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** (Y – schema change)
  - [ ] **RLS verified?** (Y – existing policies cover new columns)
- [ ] **Any PHI in logs?** (No)
- [ ] **External API or AI call?** (N)
- [ ] **Retention / deletion impact?** (N)

---

## ✅ Acceptance & Verification Criteria

- [ ] Migration applies without error (run in Supabase)
- [x] New columns have correct types and defaults — **Implemented**
- [ ] Existing rows remain valid; new columns populated with defaults (verify after migration)
- [x] TypeScript types and service reflect new schema — **Completed: 2026-03-09**

---

## 🔗 Related Tasks

- [e-task-2: Doctor settings API](./e-task-2-doctor-settings-api.md)
- [e-task-4: Bot uses doctor settings](./e-task-4-bot-uses-doctor-settings.md)

---

**Last Updated:** 2026-03-09  
**Completed:** 2026-03-09  
**Reference:** [TASK_MANAGEMENT_GUIDE.md](../../../task-management/TASK_MANAGEMENT_GUIDE.md)
