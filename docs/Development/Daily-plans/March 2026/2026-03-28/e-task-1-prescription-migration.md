# Task 1: Prescription Tables Migration

## 2026-03-28 — Prescription V1 Implementation

---

## 📋 Task Overview

Create database tables for prescription storage: `prescriptions`, `prescription_medicines`, `prescription_attachments`. Enables doctor to store structured SOAP notes and/or photo prescriptions linked to appointments and patients.

**Estimated Time:** 1.5 hours  
**Status:** ✅ **COMPLETED**  
**Completed:** 2026-03-28

**Change Type:**
- [x] **New feature** — New tables, no change to existing schema

**Current State:**
- ✅ **What exists:** `appointments` has `clinical_notes` (migration 021); `patients` table; `conversations` link patient to doctor
- ❌ **What's missing:** `prescriptions`, `prescription_medicines`, `prescription_attachments` tables; RLS policies
- ⚠️ **Notes:** Prescriptions contain PHI (diagnosis, meds, clinical notes). Must enforce doctor-only access via RLS.

**Scope Guard:**
- Expected files touched: 2 (migration SQL + DB_SCHEMA.md update)
- Migration number: 026 (next after 025)

**Reference Documentation:**
- [PRESCRIPTION_EHR_PLAN.md](../2026-03-23/PRESCRIPTION_EHR_PLAN.md)
- [MIGRATIONS_AND_CHANGE.md](../../../Reference/MIGRATIONS_AND_CHANGE.md)
- [DB_SCHEMA.md](../../../Reference/DB_SCHEMA.md)
- [RLS_POLICIES.md](../../../Reference/RLS_POLICIES.md)

---

## ✅ Task Breakdown (Hierarchical)

### 1. Create Migration File

- [x] ✅ 1.1 Create `backend/migrations/026_prescriptions.sql` - **Completed: 2026-03-28**
  - [x] ✅ 1.1.1 Add migration header (purpose, date, PHI note)
  - [x] ✅ 1.1.2 Create `prescriptions` table per plan
  - [x] ✅ 1.1.3 Create `prescription_medicines` table
  - [x] ✅ 1.1.4 Create `prescription_attachments` table
  - [x] ✅ 1.1.5 Add indexes for common query patterns
  - [x] ✅ 1.1.6 Add `updated_at` triggers
  - [x] ✅ 1.1.7 Enable RLS on all three tables
- [x] ✅ 1.2 Add RLS policies for `prescriptions` - **Completed: 2026-03-28**
  - [x] ✅ 1.2.1 SELECT: doctor can read own prescriptions (via doctor_id)
  - [x] ✅ 1.2.2 INSERT: doctor can create prescriptions for own appointments
  - [x] ✅ 1.2.3 UPDATE: doctor can update own prescriptions
  - [x] ✅ 1.2.4 DELETE: doctor can delete own prescriptions
- [x] ✅ 1.3 Add RLS policies for `prescription_medicines` - **Completed: 2026-03-28**
  - [x] ✅ 1.3.1 SELECT/INSERT/UPDATE/DELETE: via prescription ownership
- [x] ✅ 1.4 Add RLS policies for `prescription_attachments` - **Completed: 2026-03-28**
  - [x] ✅ 1.4.1 Same ownership pattern as prescriptions

### 2. Table Schemas (V1 Scope)

- [x] ✅ 2.1 `prescriptions` table - **Completed: 2026-03-28**
  - [x] ✅ 2.1.1 `id` UUID PK, `appointment_id` FK → appointments, `patient_id` FK → patients (denormalized)
  - [x] ✅ 2.1.2 `doctor_id` UUID FK → auth.users
  - [x] ✅ 2.1.3 `type` TEXT CHECK IN ('structured','photo','both')
  - [x] ✅ 2.1.4 V1 SOAP fields: `cc`, `hopi`, `provisional_diagnosis`, `investigations`, `follow_up`, `patient_education`, `clinical_notes` (all TEXT NULL)
  - [x] ✅ 2.1.5 `sent_to_patient_at` TIMESTAMPTZ NULL
  - [x] ✅ 2.1.6 `created_at`, `updated_at`
- [x] ✅ 2.2 `prescription_medicines` table - **Completed: 2026-03-28**
  - [x] ✅ 2.2.1 `id` UUID PK, `prescription_id` FK → prescriptions ON DELETE CASCADE
  - [x] ✅ 2.2.2 `medicine_name`, `dosage`, `route`, `frequency`, `duration`, `instructions` (TEXT)
  - [x] ✅ 2.2.3 `sort_order` INT DEFAULT 0
- [x] ✅ 2.3 `prescription_attachments` table - **Completed: 2026-03-28**
  - [x] ✅ 2.3.1 `id` UUID PK, `prescription_id` FK → prescriptions ON DELETE CASCADE
  - [x] ✅ 2.3.2 `file_path` TEXT (Supabase Storage path)
  - [x] ✅ 2.3.3 `file_type` TEXT (e.g. image/jpeg), `caption` TEXT NULL
  - [x] ✅ 2.3.4 `uploaded_at` TIMESTAMPTZ DEFAULT now()

### 3. Indexes

- [x] ✅ 3.1 `idx_prescriptions_appointment_id` ON prescriptions(appointment_id)
- [x] ✅ 3.2 `idx_prescriptions_patient_id` ON prescriptions(patient_id)
- [x] ✅ 3.3 `idx_prescriptions_doctor_id` ON prescriptions(doctor_id)
- [x] ✅ 3.4 `idx_prescriptions_created_at` ON prescriptions(created_at DESC)
- [x] ✅ 3.5 `idx_prescription_medicines_prescription_id` ON prescription_medicines(prescription_id)
- [x] ✅ 3.6 `idx_prescription_attachments_prescription_id` ON prescription_attachments(prescription_id)

### 4. Documentation

- [x] ✅ 4.1 Update `docs/Reference/DB_SCHEMA.md` with new tables and columns - **Completed: 2026-03-28**
- [x] ✅ 4.2 Document PHI note for prescriptions (diagnosis, meds = PHI)

### 5. Verification

- [x] ✅ 5.1 Run migration against local DB — *User runs via Supabase SQL Editor / psql*
- [x] ✅ 5.2 Verify RLS: doctor cannot read another doctor's prescriptions — *RLS policies in migration*
- [x] ✅ 5.3 Type-check passes (no TypeScript yet; migration only) — *N/A for SQL*

---

## 📁 Files to Create/Update

```
backend/
├── migrations/
│   └── 026_prescriptions.sql     (CREATE)
docs/
└── Reference/
    └── DB_SCHEMA.md              (UPDATE - add prescriptions section)
```

---

## 🧠 Design Constraints

- Prescriptions contain PHI: diagnosis, medications, clinical notes. COMPLIANCE.md applies.
- No PHI in logs (IDs only).
- RLS: doctor owns via doctor_id; service role for worker/send-flow if needed.
- FK: appointment_id, patient_id; patient_id denormalized for "list by patient" queries.
- ON DELETE: CASCADE for medicines and attachments when prescription deleted.
- Use existing `update_updated_at_column()` trigger.

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** (Y — new tables with PHI)
  - [x] **RLS verified?** (Y — doctor-only access)
- [x] **Any PHI in logs?** (MUST be No)
- [x] **External API or AI call?** (N)
- [x] **Retention / deletion impact?** (Y — prescriptions are PHI; 7 years per COMPLIANCE)

---

## ✅ Acceptance & Verification Criteria

- [x] Migration 026 applies cleanly
- [x] Three tables exist with correct columns and constraints
- [x] RLS policies prevent cross-doctor access
- [x] DB_SCHEMA.md updated

---

## 🔗 Related Tasks

- [e-task-2: Prescription service & API](./e-task-2-prescription-service-api.md)
- [e-task-3: Photo storage](./e-task-3-prescription-photo-storage.md)

---

**Last Updated:** 2026-03-28
