# E-Task: Separate reason_for_visit and notes on Appointments

**Date:** 2026-03-16  
**Status:** Planning → **Task files created**

> **Task files:** See [README.md](./README.md) for task order. Individual tasks:
> - [e-task-1: Add reason_for_visit column + wiring](./e-task-1-reason-for-visit-column.md)
> - [e-task-2: Collect patient extras (notes)](./e-task-2-collect-patient-extras.md)
>
> **Reference:** [APPOINTMENT_REASON_AND_NOTES.md](../../../Reference/APPOINTMENT_REASON_AND_NOTES.md)

## Goal

Split appointment data into two patient-provided columns:

| Column | Purpose | Required |
|--------|---------|----------|
| **reason_for_visit** | Patient's main complaint/symptom (answer to "What's your reason for visit?") | Yes |
| **notes** | Extra context patient shares during conversation (e.g. "On blood thinners", "Allergic to X") | No |

---

## Phase 1: Schema + Backfill (This PR)

### 1.1 Migration

- **File:** `backend/migrations/016_appointments_reason_for_visit.sql`
- Add `reason_for_visit TEXT` column to appointments
- Backfill: if existing `notes` starts with `"Reason: "`, extract and populate `reason_for_visit`; set `notes` to remainder or NULL
- Keep `notes` column for patient extras (currently NULL for most rows)

### 1.2 Types

- **File:** `backend/src/types/database.ts`
- Add `reason_for_visit?: string` to Appointment, InsertAppointment
- Update comment: `notes` = optional patient extras

### 1.3 Validation

- **File:** `backend/src/utils/validation.ts`
- Add `reasonForVisit` (required) and `notes` (optional) to `bookAppointmentSchema`
- `reasonForVisit`: string, max 500, required
- `notes`: string, max 1000, optional (existing)

### 1.4 Appointment Service

- **File:** `backend/src/services/appointment-service.ts`
- `bookAppointment`: insert `reason_for_visit` and `notes` separately
- `reason_for_visit`: required (default to `"Not provided"` if missing for backward compat, or throw)

### 1.5 Slot Selection Service

- **File:** `backend/src/services/slot-selection-service.ts`
- Pass `reasonForVisit: state.reasonForVisit ?? 'Not provided'` to `bookAppointment`
- Pass `notes: state.extraNotes ?? undefined` (Phase 2) or `notes: undefined` for now

### 1.6 Doctor default_notes

- **Decision:** Doctor's `default_notes` (practice-level) — where does it go?
- **Option A:** Append to `notes` when present: `notes = [patient extras] + [default_notes]`
- **Option B:** Separate `doctor_notes` column (future)
- **Recommendation:** Option A for now — if patient has extras, combine; else use default_notes as notes

---

## Phase 2: Collect Patient Extras (Follow-up)

### 2.1 Conversation State

- Add `extraNotes?: string` to ConversationState

### 2.2 Collection Flow

- After confirm_details (when user says "Yes"), optionally ask: "Anything else you'd like the doctor to know before your visit? (optional)"
- If user replies with content, store in `extraNotes`
- Or: add `extra_notes` as optional field in "all at once" — if message has trailing content beyond structured fields, capture it

### 2.3 Slot Selection

- Pass `state.extraNotes` to `notes` when booking

---

## Files to Touch (Phase 1)

| File | Change |
|------|--------|
| `migrations/016_appointments_reason_for_visit.sql` | Add column, backfill |
| `src/types/database.ts` | Add reason_for_visit to Appointment |
| `src/utils/validation.ts` | Add reasonForVisit to bookAppointmentSchema |
| `src/services/appointment-service.ts` | Insert reason_for_visit, notes |
| `src/services/slot-selection-service.ts` | Pass reasonForVisit, notes (handle default_notes) |

---

## Backfill Logic (Migration)

```sql
-- Add column
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS reason_for_visit TEXT NULL;

-- Backfill from notes where notes starts with "Reason: "
UPDATE appointments
SET
  reason_for_visit = TRIM(SUBSTRING(notes FROM 9 FOR POSITION('. ' IN SUBSTRING(notes FROM 9)) - 1)),
  notes = NULLIF(TRIM(SUBSTRING(notes FROM 9 + POSITION('. ' IN SUBSTRING(notes FROM 9)) + 1)), '')
WHERE notes IS NOT NULL AND notes LIKE 'Reason: %';

-- Simpler: if notes = "Reason: X" or "Reason: X. Y", extract X
-- Use regex or substring
```

Simpler backfill:
- If `notes` starts with `"Reason: "`, extract text before `. ` or end → `reason_for_visit`
- Remainder (after `. `) → `notes` (could be default_notes or patient extras; we can't distinguish, so put remainder in notes)
- If `notes` doesn't start with "Reason:", set `reason_for_visit = notes` and `notes = NULL` (old format)

---

## Checklist

- [ ] 1.1 Migration 016
- [ ] 1.2 Types
- [ ] 1.3 Validation
- [ ] 1.4 Appointment service
- [ ] 1.5 Slot selection service
- [ ] 1.6 default_notes handling
- [ ] Run migration
- [ ] Manual test: book flow → verify reason_for_visit populated, notes correct
