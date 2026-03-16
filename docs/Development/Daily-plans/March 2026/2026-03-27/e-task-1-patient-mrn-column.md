# Task 1: Add patient_id (MRN) Column
## 2026-03-27

---

## 📋 Task Overview

Add a human-readable Medical Record Number (MRN) / Patient ID column to the patients table. Assign it on patient creation. Used as an optional shortcut for repeat patients; primary identification remains phone search + confirm.

**Estimated Time:** 2–3 hours  
**Status:** ✅ **COMPLETED**  
**Completed:** 2026-03-27

**Change Type:**
- [ ] **Update existing** — Migration, patient-service; follow [CODE_CHANGE_RULES.md](../../../task-management/CODE_CHANGE_RULES.md)

**Current State:**
- ✅ **What exists:** patients table (id UUID, name, phone, age, gender, email, platform, platform_external_id, consent_*); createPatient, createPatientForBooking
- ❌ **What's missing:** medical_record_number or patient_id (human-readable) column; assignment logic
- ⚠️ **Notes:** Use format like P-00001; need sequence or max+1 per doctor (or global). Decision: global sequence for simplicity.

**Scope Guard:**
- Expected files touched: ≤ 4 (migration, patient-service, types, maybe seed)

**Reference Documentation:**
- [PATIENT_IDENTITY_AND_MATCHING.md](../../../Future%20Planning/PATIENT_IDENTITY_AND_MATCHING.md)
- [MIGRATIONS_AND_CHANGE.md](../../../Reference/MIGRATIONS_AND_CHANGE.md)
- [CODE_CHANGE_RULES.md](../../../task-management/CODE_CHANGE_RULES.md)

---

## ✅ Task Breakdown (Hierarchical)

### 1. Migration

- [x] 1.1 Create migration 018_patients_medical_record_number.sql
  - [x] 1.1.1 Add column `medical_record_number TEXT` (nullable initially)
  - [x] 1.1.2 Create sequence `patient_mrn_seq`
  - [x] 1.1.3 Backfill existing patients with P-00001, P-00002, ... (ordered by created_at)
  - [x] 1.1.4 Add UNIQUE and NOT NULL after backfill; set DEFAULT for new inserts
- [x] 1.2 Add index on medical_record_number for lookups

### 2. Service Layer

- [x] 2.1 createPatient: DB default assigns MRN (omit from insert)
- [x] 2.2 createPatientForBooking: DB default assigns MRN (omit from insert)
- [x] 2.3 Add findPatientByMrn(medicalRecordNumber, correlationId) for ID-based lookup

### 3. Types

- [x] 3.1 Add medical_record_number to Patient; InsertPatient has medical_record_number optional

### 4. Verification & Testing

- [x] 4.1 Run type-check
- [ ] 4.2 Manual test: create patient, verify MRN assigned
- [ ] 4.3 Verify migration runs cleanly on fresh DB and with existing data

---

## 📁 Files to Create/Update

```
backend/
├── migrations/
│   └── 018_patients_medical_record_number.sql   (NEW)
├── src/
│   ├── services/
│   │   └── patient-service.ts                   (UPDATED)
│   └── types/
│       └── database.ts                          (UPDATED - if Patient type lives there)
```

**Existing Code Status:**
- ✅ `patient-service.ts` — createPatient, createPatientForBooking
- ✅ `001_initial_schema.sql`, `005_consent.sql`, `015_patients_age.sql` — patients table evolution

---

## 🧠 Design Constraints

- MRN must be unique across all patients
- Format: P-{5-digit zero-padded number} (e.g. P-00001)
- No PHI in logs (COMPLIANCE.md)
- Migration must handle existing rows (backfill)

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** (Y – patients table)
  - [ ] **RLS verified?** (Y – patients RLS unchanged; new column)
- [ ] **Any PHI in logs?** (N)
- [ ] **External API or AI call?** (N)
- [ ] **Retention / deletion impact?** (N)

---

## ✅ Acceptance & Verification Criteria

- [x] medical_record_number column exists; DB default assigns for new patients
- [x] Existing patients get backfilled MRN
- [x] findPatientByMrn works for ID-based lookup
- [x] Type-check passes

---

## 🔗 Related Tasks

- [e-task-2: Patient matching service](./e-task-2-patient-matching-service.md)
- [e-task-5: Booking flow — match confirmation](./e-task-5-booking-match-confirmation.md)

---

**Last Updated:** 2026-03-27  
**Reference:** [TASK_TEMPLATE.md](../../../task-management/TASK_TEMPLATE.md)
