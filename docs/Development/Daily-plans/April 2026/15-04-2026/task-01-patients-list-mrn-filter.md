# Task 01: Patients list — show only registered patients (MRN gate)
## 2026-04-15 — Phase A

---

## Task Overview

Change **`listPatientsForDoctor`** so the doctor dashboard **Patients** API returns only patients who count as **registered** for v1: primarily **`medical_record_number IS NOT NULL`**, so intake-only / pre-payment bot patients no longer appear. Preserve existing filters for merged patients; add unit coverage and verify **Add Appointment** patient picker behavior if it shares the same API.

**Estimated Time:** 3–4 hours  
**Status:** PENDING  
**Completed:** (when done)

**Change Type:**
- [x] **Update existing** — Change or remove existing code; follow [CODE_CHANGE_RULES.md](../../../../task-management/CODE_CHANGE_RULES.md)

**Current State:**
- **What exists:** `listPatientsForDoctor` in `backend/src/services/patient-service.ts` unions `patient_id` from **appointments** and **conversations** for the doctor, then loads patient rows; filters `[Merged]` / `merged-` phone.
- **What's missing:** Filter so conversation-linked patients **without** MRN do not appear unless business rules add an exception (v1: **MRN required** for inclusion).
- **Notes:** `GET /api/v1/patients` uses `listPatientsForDoctor` via `patient-controller.ts`. Returning patients with existing MRN continue to show. Placeholder-style rows should remain excluded or filtered by existing merge logic + MRN rule.

**Scope Guard:**
- Expected files touched: 2–4 (`patient-service.ts`, tests, possibly controller if query params added later)
- Any expansion (e.g. optional `?include_intake=1`) requires explicit product approval

**Reference Documentation:**
- [15-04-2026 README](./README.md) — daily plan
- [CODE_CHANGE_RULES.md](../../../../task-management/CODE_CHANGE_RULES.md)
- [COMPLIANCE.md](../../../../Reference/COMPLIANCE.md)

---

## Task Breakdown

### 1. Audit callers and data flow
- [ ] 1.1 Confirm all callers of `listPatientsForDoctor` (API list; grep for duplicates)
- [ ] 1.2 Document whether **Add Appointment** modal (`frontend/.../AddAppointmentModal.tsx`) depends on full list — acceptable if unpaid intake disappears from picker until registered

### 2. Implement MRN gate
- [ ] 2.1 After building `patientIds` set, filter to patients where `medical_record_number` is not null **OR** (optional) document why appointment-only path without MRN is excluded for v1
- [ ] 2.2 Alternatively: fetch patient rows with `medical_record_number` in query `.not('medical_record_number', 'is', null)` when resolving IDs — prefer single coherent filter path
- [ ] 2.3 Keep merged-patient exclusion logic unchanged

### 3. Verification
- [ ] 3.1 Unit tests: patient linked only via conversation, no MRN → not in list
- [ ] 3.2 Unit tests: patient with MRN → in list (with or without appointment per current rules)
- [ ] 3.3 Unit tests: merged patients still excluded
- [ ] 3.4 `tsc --noEmit` and relevant Jest suites pass

---

## Files to Create/Update

- `backend/src/services/patient-service.ts` — MODIFY (`listPatientsForDoctor`)
- `backend/tests/unit/services/patient-service.test.ts` — CREATE (no existing `patient-service` unit test file; add focused tests for `listPatientsForDoctor`) or extend nearest integration test if project pattern prefers

**Existing Code Status:**
- `patient-service.ts` — EXISTS (list implementation ~184+)
- `patient-controller.ts` — EXISTS (thin wrapper)

**When updating existing code:**
- [ ] Audit per CODE_CHANGE_RULES
- [ ] Update/remove obsolete assumptions in comments
- [ ] Tests for new behavior

---

## Design Constraints

- No PHI in logs; doctor-scoped data only via existing auth
- List is a **registration** view for v1, not a full CRM of all touched leads
- Behavior must align with [task-02](./task-02-mrn-zero-fee-booking-complete.md) so zero-fee completed bookings eventually get MRN and appear

---

## Global Safety Gate

- [x] **Data touched?** Yes — read paths on patients/appointments/conversations
  - [x] **RLS verified?** Uses existing admin/service patterns as today
- [x] **Any PHI in logs?** Must remain No
- [x] **External API or AI call?** No
- [x] **Retention / deletion impact?** No — display filter only

---

## Acceptance Criteria

- [ ] Pre-payment bot intake (patient row exists, no MRN) does **not** appear in `GET /api/v1/patients`
- [ ] After first successful payment (MRN assigned), patient **does** appear
- [ ] Merged placeholder rows remain handled
- [ ] Tests document the contract

---

## Related Tasks

- [Task 02 — Zero-fee MRN](./task-02-mrn-zero-fee-booking-complete.md) (depends on: Task 01 can ship first; Task 02 ensures free paths get MRN)
- [Task 04 — Frontend empty state](./task-04-frontend-patients-empty-state.md)

---

**Last Updated:** 2026-04-15  
**Reference:** [TASK_TEMPLATE.md](../../../../task-management/TASK_TEMPLATE.md)
