# Task 7: Prescription Integration & README

## 2026-03-27 — Prescription V1 Implementation

---

## 📋 Task Overview

Final integration: wire PrescriptionForm with MarkCompletedForm flow, ensure "Save draft" and "Save & send" work correctly, fix any integration issues, and create the daily plan README. Also update task-management README to reference this initiative.

**Estimated Time:** 1 hour  
**Status:** ⏳ **PENDING**  
**Completed:** —

**Change Type:**
- [x] **New feature** — Integration and documentation

**Current State:**
- ✅ **What exists:** Individual components from e-task-4, 5, 6; MarkCompletedForm; AppointmentConsultationActions
- ❌ **What's missing:** Full integration verification; README; task-management index update
- ⚠️ **Notes:** This task is the "integration pass" — ensure all pieces work together.

**Scope Guard:**
- Expected files touched: ~4 (README, task-management, possibly AppointmentConsultationActions adjustments)
- Depends on: e-task-1 through e-task-6 complete

**Reference Documentation:**
- [TASK_MANAGEMENT_GUIDE.md](../../../task-management/TASK_MANAGEMENT_GUIDE.md)
- [PRESCRIPTION_EHR_PLAN.md](../2026-03-23/PRESCRIPTION_EHR_PLAN.md)

---

## ✅ Task Breakdown (Hierarchical)

### 1. Integration Verification

- [ ] 1.1 End-to-end flow: appointment → video → prescription form → save draft
  - [ ] 1.1.1 Create prescription (structured + photo); save draft
  - [ ] 1.1.2 Refresh page; prescription loads
  - [ ] 1.1.3 Edit and update
- [ ] 1.2 Save & send flow
  - [ ] 1.2.1 Create prescription; Save & send
  - [ ] 1.2.2 Verify patient receives DM/email
  - [ ] 1.2.3 Verify sent_to_patient_at set
- [ ] 1.3 Mark completed flow
  - [ ] 1.3.1 Doctor can Mark completed with or without prescription
  - [ ] 1.3.2 Prescription and Mark completed are independent (both available)
  - [ ] 1.3.3 No blocking: doctor can complete without prescription
- [ ] 1.4 Previous prescriptions
  - [ ] 1.4.1 Create 2+ prescriptions for same patient; verify previous list shows them
  - [ ] 1.4.2 "View all" or expand works
- [ ] 1.5 Error cases
  - [ ] 1.5.1 No patient_id: prescription still creatable (appointment-level); send may skip
  - [ ] 1.5.2 Invalid file type: rejected
  - [ ] 1.5.3 Network error: user sees error message

### 2. UI/UX Refinements

- [ ] 2.1 Section ordering on appointment page
  - [ ] 2.1.1 Video call first; then Patient join link; then Previous prescriptions; then Prescription form; then Mark completed
  - [ ] 2.1.2 Or: Previous prescriptions above Prescription form
- [ ] 2.2 PrescriptionForm visibility
  - [ ] 2.2.1 Show when: consultation started OR appointment is confirmed/pending/completed
  - [ ] 2.2.2 Rationale: Doctor can add prescription after call or for in-clinic
- [ ] 2.3 Loading states
  - [ ] 2.3.1 Form loading (fetch existing prescription)
  - [ ] 2.3.2 Save in progress
  - [ ] 2.3.3 Send in progress

### 3. Documentation

- [ ] 3.1 Create `docs/Development/Daily-plans/March 2026/2026-03-27/README.md`
  - [ ] 3.1.1 Overview: Prescription V1 Implementation
  - [ ] 3.1.2 Goals: Structured + photo prescription; storage; send to patient; previous view
  - [ ] 3.1.3 Task order table: e-task-1 through e-task-7 with dependencies
  - [ ] 3.1.4 Reference: PRESCRIPTION_EHR_PLAN.md
  - [ ] 3.1.5 Link to each task file
- [ ] 3.2 Update `docs/task-management/README.md`
  - [ ] 3.2.1 Add section "Prescription V1 (2026-03-27)"
  - [ ] 3.2.2 Brief description; link to daily plan README
  - [ ] 3.2.3 Tasks: e-task-1 through e-task-7

### 4. DB_SCHEMA.md Update

- [ ] 4.1 Ensure DB_SCHEMA.md documents prescriptions, prescription_medicines, prescription_attachments (e-task-1 may have done this)
- [ ] 4.2 Add "Never Store" notes if any

### 5. Definition of Done

- [ ] 5.1 All e-tasks 1–6 marked complete
- [ ] 5.2 Integration verification passed
- [ ] 5.3 README created and task-management updated
- [ ] 5.4 No known bugs; type-check and lint pass

---

## 📁 Files to Create/Update

```
docs/
├── Development/
│   └── Daily-plans/
│       └── March 2026/
│           └── 2026-03-27/
│               └── README.md           (CREATE)
└── task-management/
    └── README.md                       (UPDATE - add Prescription V1)
```

---

## 🧠 Design Constraints

- No new features; integration and docs only
- Follow TASK_MANAGEMENT_GUIDE for README structure

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** (N — docs only)
- [ ] **Any PHI in logs?** (N)
- [ ] **External API or AI call?** (N)
- [ ] **Retention / deletion impact?** (N)

---

## ✅ Acceptance & Verification Criteria

- [ ] Full E2E flow works
- [ ] README exists with task links
- [ ] task-management README updated
- [ ] All tasks documented with completion status

---

## 🔗 Related Tasks

- [e-task-1](./e-task-1-prescription-migration.md) through [e-task-6](./e-task-6-prescription-previous-view.md)
- [PRESCRIPTION_EHR_PLAN.md](../2026-03-23/PRESCRIPTION_EHR_PLAN.md)

---

**Last Updated:** 2026-03-27
