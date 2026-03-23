# Task 1: Migration — doctor_left_at, patient_left_at
## 2026-03-23 — Consultation Verification v2

---

## 📋 Task Overview

Add `doctor_left_at` and `patient_left_at` to appointments. Populated by Twilio `participant-disconnected` webhook. Used by tryMarkVerified for "who left first" logic.

**Estimated Time:** 0.5 hour  
**Status:** ✅ **COMPLETED**  
**Completed:** 2026-03-23

**Change Type:**
- [x] **New feature** — Add columns to appointments

**Current State:**
- ✅ **What exists:** appointments has doctor_joined_at, patient_joined_at, consultation_ended_at (migration 021)
- ❌ **What's missing:** doctor_left_at, patient_left_at

**Scope Guard:**
- Expected files touched: 2 (migration + database types)

**Reference Documentation:**
- [CONSULTATION_VERIFICATION_STRATEGY.md](../../../task-management/CONSULTATION_VERIFICATION_STRATEGY.md)
- [021_appointments_consultation_room.sql](../../../../backend/migrations/021_appointments_consultation_room.sql)

---

## ✅ Task Breakdown (Hierarchical)

### 1. Migration
- [x] 1.1 Create `backend/migrations/023_appointments_doctor_patient_left_at.sql` — **Completed: 2026-03-23**
  - [x] 1.1.1 Add `doctor_left_at` TIMESTAMPTZ NULL
  - [x] 1.1.2 Add `patient_left_at` TIMESTAMPTZ NULL
  - [x] 1.1.3 Comment: When each participant disconnected; for "who left first" payout verification

### 2. Types
- [x] 2.1 Update `backend/src/types/database.ts` — **Completed: 2026-03-23**
  - [x] 2.1.1 Add doctor_left_at?: Date | string | null
  - [x] 2.1.2 Add patient_left_at?: Date | string | null

### 3. Verification
- [x] 3.1 Run migration — User confirmed migrated
- [x] 3.2 Type-check passes

---

## 📁 Files to Create/Update

```
backend/
├── migrations/
│   └── 023_appointments_doctor_patient_left_at.sql  (CREATE)
└── src/types/
    └── database.ts  (UPDATE - Appointment interface)
```

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** (Y — ALTER TABLE appointments)
- [x] **Any PHI in logs?** (No)
- [x] **External API or AI call?** (N)
- [x] **Retention / deletion impact?** (N)

---

## ✅ Acceptance & Verification Criteria

- [x] Migration applies cleanly
- [x] appointments has doctor_left_at, patient_left_at

---

## 🔗 Related Tasks

- [e-task-3: participant-disconnected](./e-task-3-participant-disconnected.md)
- [e-task-4: tryMarkVerified logic](./e-task-4-try-mark-verified-who-left-first.md)

---

**Last Updated:** 2026-03-23  
**Completed:** 2026-03-23
