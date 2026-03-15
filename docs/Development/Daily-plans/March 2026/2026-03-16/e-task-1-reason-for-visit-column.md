# Task 1: Add reason_for_visit Column + Wiring
## 2026-03-16

---

## 📋 Task Overview

Add `reason_for_visit` column to appointments table and wire it through the booking flow. Currently `notes` holds a combined string ("Reason: X. default_notes"); we split into `reason_for_visit` (required, patient's main complaint) and `notes` (optional, patient extras + doctor default_notes).

**Estimated Time:** 2–3 hours  
**Status:** ⏳ **PENDING**  
**Completed:** —

**Change Type:**
- [x] **Update existing** — Migration, types, validation, appointment-service, slot-selection-service; follow [CODE_CHANGE_RULES.md](../../../task-management/CODE_CHANGE_RULES.md)

**Current State:**
- ✅ **What exists:** `appointments.notes` (TEXT); slot-selection-service builds `notes = "Reason: X. default_notes"` or `reasonForVisit ?? default_notes`; bookAppointment receives `notes` only
- ❌ **What's missing:** `reason_for_visit` column; separate pass-through of reason and notes
- ⚠️ **Notes:** BookAppointmentInput has `notes` only; no `reasonForVisit` in schema

**Scope Guard:**
- Expected files touched: ≤ 6 (migration, types, validation, appointment-service, slot-selection-service, DB_SCHEMA)

**Reference Documentation:**
- [APPOINTMENT_REASON_AND_NOTES.md](../../../Reference/APPOINTMENT_REASON_AND_NOTES.md) — Column semantics
- [MIGRATIONS_AND_CHANGE.md](../../../Reference/MIGRATIONS_AND_CHANGE.md) — Migration rules
- [DB_SCHEMA.md](../../../Reference/DB_SCHEMA.md) — Schema

---

## ✅ Task Breakdown (Hierarchical)

### 1. Migration

- [ ] 1.1 Create `backend/migrations/016_appointments_reason_for_visit.sql`
  - [ ] 1.1.1 Add `reason_for_visit TEXT NULL` column
  - [ ] 1.1.2 Backfill: where `notes LIKE 'Reason: %'`, extract text before `. ` into `reason_for_visit`; remainder into `notes`
  - [ ] 1.1.3 Backfill: where `notes` exists but doesn't start with "Reason:", set `reason_for_visit = notes`, `notes = NULL`
  - [ ] 1.1.4 Add COMMENT on column
- [ ] 1.2 Run migration

### 2. Types

- [ ] 2.1 Update `backend/src/types/database.ts`
  - [ ] 2.1.1 Add `reason_for_visit?: string` to Appointment
  - [ ] 2.1.2 Add `reason_for_visit` to InsertAppointment
  - [ ] 2.1.3 Update `notes` comment: optional patient extras + doctor default_notes

### 3. Validation

- [ ] 3.1 Update `backend/src/utils/validation.ts`
  - [ ] 3.1.1 Add `reasonForVisit` to `bookAppointmentSchema`: string, max 500, required
  - [ ] 3.1.2 Keep `notes` optional (max 1000)

### 4. Appointment Service

- [ ] 4.1 Update `backend/src/services/appointment-service.ts`
  - [ ] 4.1.1 In `bookAppointment`, insert `reason_for_visit: data.reasonForVisit ?? 'Not provided'`
  - [ ] 4.1.2 Insert `notes: data.notes` (optional)

### 5. Slot Selection Service

- [ ] 5.1 Update `backend/src/services/slot-selection-service.ts`
  - [ ] 5.1.1 Build `reasonForVisit = state.reasonForVisit ?? 'Not provided'`
  - [ ] 5.1.2 Build `notes`: `state.extraNotes` (Phase 2) or `doctorSettings?.default_notes` for now
  - [ ] 5.1.3 Pass both to `bookAppointment`

### 6. Documentation

- [ ] 6.1 Update `docs/Reference/DB_SCHEMA.md` — add `reason_for_visit` to appointments table

### 7. Verification & Testing

- [ ] 7.1 Run type-check
- [ ] 7.2 Manual test: book flow → verify `reason_for_visit` populated, `notes` correct
- [ ] 7.3 Verify backfill for existing rows

---

## 📁 Files to Create/Update

```
backend/
├── migrations/
│   └── 016_appointments_reason_for_visit.sql   (NEW)
├── src/
│   ├── types/
│   │   └── database.ts                         (UPDATED)
│   ├── utils/
│   │   └── validation.ts                       (UPDATED)
│   └── services/
│       ├── appointment-service.ts              (UPDATED)
│       └── slot-selection-service.ts           (UPDATED)
docs/
└── Reference/
    └── DB_SCHEMA.md                            (UPDATED)
```

**Existing Code Status:**
- ✅ `appointments.notes` — EXISTS (TEXT)
- ✅ `bookAppointment` — EXISTS (receives notes only)
- ✅ `slot-selection-service` — EXISTS (builds combined notes)
- ❌ `reason_for_visit` column — MISSING

**When creating a migration:**
- [ ] Read all previous migrations (001–015) per [MIGRATIONS_AND_CHANGE.md](../../../Reference/MIGRATIONS_AND_CHANGE.md)

---

## 🧠 Design Constraints

- No PHI in logs (COMPLIANCE.md)
- reason_for_visit required for new bookings; backfill allows NULL for legacy
- notes remains optional

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** (Y – appointments table)
  - [ ] **RLS verified?** (Y – appointments has RLS; migration runs as owner)
- [ ] **Any PHI in logs?** (N)
- [ ] **External API or AI call?** (N)
- [ ] **Retention / deletion impact?** (N)

---

## ✅ Acceptance & Verification Criteria

- [ ] `reason_for_visit` column exists and is populated for new bookings
- [ ] `notes` holds patient extras or doctor default_notes (not reason)
- [ ] Existing rows backfilled correctly
- [ ] Book flow passes reasonForVisit and notes separately

---

## 🔗 Related Tasks

- [e-task-2: Collect patient extras](./e-task-2-collect-patient-extras.md)

---

**Last Updated:** 2026-03-16  
**Reference:** [TASK_TEMPLATE.md](../../../task-management/TASK_TEMPLATE.md)
