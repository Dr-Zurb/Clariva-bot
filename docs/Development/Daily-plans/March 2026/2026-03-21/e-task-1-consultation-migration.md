# Task 1: Consultation Migration
## 2026-03-21 — Teleconsultation Initiative

---

## 📋 Task Overview

Add database columns to `appointments` for Twilio Video room metadata and consultation verification. Enables storing room SID, join/end times, and verified_at for payout eligibility.

**Estimated Time:** 1–2 hours  
**Status:** ✅ **COMPLETED**  
**Completed:** 2026-03-21

**Change Type:**
- [x] **New feature** — Add columns only; no change to existing behavior

**Current State:**
- ✅ **What exists:** `appointments` table (001); `consultation_type` (013); `reason_for_visit`, `notes` (016); RLS policies (002)
- ❌ **What's missing:** Columns for room_sid, join/end times, verified_at, clinical_notes
- ⚠️ **Notes:** Follow migration naming (021); use ADD COLUMN IF NOT EXISTS; no RLS changes needed (policies cover all columns)

**Scope Guard:**
- Expected files touched: 2 (migration + types)

**Reference Documentation:**
- [CODE_CHANGE_RULES.md](../../../task-management/CODE_CHANGE_RULES.md)
- [MIGRATIONS_AND_CHANGE.md](../../../Reference/MIGRATIONS_AND_CHANGE.md)
- [TASK_TEMPLATE.md](../../../task-management/TASK_TEMPLATE.md)

---

## ✅ Task Breakdown (Hierarchical)

### 1. Migration File
- [x] ✅ 1.1 Create `backend/migrations/021_appointments_consultation_room.sql` - **Completed: 2026-03-21**
  - [x] ✅ 1.1.1 Add `consultation_room_sid` TEXT NULL (Twilio room SID)
  - [x] ✅ 1.1.2 Add `consultation_started_at` TIMESTAMPTZ NULL
  - [x] ✅ 1.1.3 Add `doctor_joined_at` TIMESTAMPTZ NULL
  - [x] ✅ 1.1.4 Add `patient_joined_at` TIMESTAMPTZ NULL
  - [x] ✅ 1.1.5 Add `consultation_ended_at` TIMESTAMPTZ NULL
  - [x] ✅ 1.1.6 Add `consultation_duration_seconds` INTEGER NULL
  - [x] ✅ 1.1.7 Add `verified_at` TIMESTAMPTZ NULL
  - [x] ✅ 1.1.8 Add `clinical_notes` TEXT NULL (doctor notes; in-clinic or post-call)
- [x] ✅ 1.2 Verify no breaking changes to existing queries
- [ ] 1.3 Run migration against dev DB (manual: apply 021 via Supabase)

### 2. Types Update
- [x] ✅ 2.1 Update `backend/src/types/database.ts` Appointment interface - **Completed: 2026-03-21**
  - [x] ✅ 2.1.1 Add optional fields matching new columns
- [x] ✅ 2.2 Defer frontend types to e-task-6 when API returns these fields

### 3. Verification & Testing
- [x] ✅ 3.1 Run type-check
- [ ] 3.2 Verify migration applies cleanly (run against dev DB)
- [x] ✅ 3.3 Confirm RLS policies still apply (no policy changes needed)

---

## 📁 Files to Create/Update

```
backend/
├── migrations/
│   └── 021_appointments_consultation_room.sql   (NEW)
└── src/types/
    └── database.ts                              (UPDATE - Appointment interface)
```

**Existing Code Status:**
- ✅ `backend/migrations/001_initial_schema.sql` - EXISTS
- ✅ `backend/migrations/013_appointments_consultation_type.sql` - EXISTS
- ✅ `backend/src/types/database.ts` - EXISTS (Appointment interface)
- ❌ `backend/migrations/021_*.sql` - MISSING

**When creating a migration:** (MANDATORY)
- [ ] Read all previous migrations (001–020) in numeric order
- [ ] Follow snake_case, existing triggers (update_updated_at)
- [ ] No new RLS policies (existing "Users can update own appointments" covers new columns)

---

## 🧠 Design Constraints

- Backward compatible: all new columns nullable
- No PHI in new columns (room_sid, timestamps, notes are administrative/clinical)
- clinical_notes: doctor-entered; COMPLIANCE applies for storage/access

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** (Y — appointments)
  - [ ] **RLS verified?** (Y — existing policies cover)
- [ ] **Any PHI in logs?** (No)
- [ ] **External API or AI call?** (N)
- [ ] **Retention / deletion impact?** (N — same as appointments)

---

## ✅ Acceptance & Verification Criteria

- [ ] Migration 021 applies without error
- [ ] All new columns nullable; existing rows unaffected
- [ ] TypeScript Appointment type includes new fields
- [ ] No RLS policy changes required

---

## 🔗 Related Tasks

- [e-task-2-twilio-video-service](./e-task-2-twilio-video-service.md)
- [TELECONSULTATION_PLAN.md](./TELECONSULTATION_PLAN.md)

---

**Last Updated:** 2026-03-21
