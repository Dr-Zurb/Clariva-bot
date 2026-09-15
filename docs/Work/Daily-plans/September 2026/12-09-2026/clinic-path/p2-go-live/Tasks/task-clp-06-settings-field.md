# Task clp-06: Persist the Yes / Not yet answer

## 📋 Task Overview

Store whether patients message this doctor on Instagram or Facebook. Existing accounts must keep today's "Instagram required" behaviour.

**Program / Phase:** clinic-path · Phase 2 (go-live)  
**Batch:** [`plan-p2-clinic-path-go-live-batch.md`](../plan-p2-clinic-path-go-live-batch.md)  
**Execution order:** [`EXECUTION-ORDER-p2-clinic-path-go-live.md`](./EXECUTION-ORDER-p2-clinic-path-go-live.md)  
**Estimated Time:** 2 hours  
**Status:** ✅ **COMPLETED**  
**Completed:** 2026-09-12

**Change Type:**
- [x] **Update existing** — settings persistence

**Current State:**
- ✅ `doctor_settings` already holds `practice_name` and `specialty`
- ✅ `patchDoctorSettings` already writes those from complete-profile
- ❌ No field for "patients message me on Instagram / Facebook"
- ⚠️ Latest settings migration in tree as of plan date: `221_doctor_settings_text_size.sql` — read all later migrations before numbering

**Scope Guard:**
- Expected files: migration + the existing settings types / write path only
- Do not invent a new table
- Do not change `complete` in this task (`clp-08`)

**When creating a migration:**
- [ ] Read previous migrations in numeric order (`MIGRATIONS_AND_CHANGE.md`)
- [ ] Inherit existing `doctor_settings` RLS — do not add a new policy unless the current ones would leave the field unprotected
- [ ] Backfill so every existing row behaves as **Yes**

---

## ✅ Task Breakdown

### 1. Persist
- [ ] 1.1 Add the setting on the existing `doctor_settings` row
- [ ] 1.2 Two answers only: Yes / Not yet (CLP-DL-6)
- [ ] 1.3 Existing rows backfill as Yes so no live checklist changes
- [ ] 1.4 Validate on write the same way other settings are validated (Zod in the controller)

### 2. Verification
- [ ] 2.1 Migration is additive and reversible as the project requires
- [ ] 2.2 Type-check / tests for the settings write path this task touches

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- No PHI in logs — this is a practice preference, not a patient
- Never read `process.env` outside `config/env.ts`
- Do not specify column names or types in this file — pick them from existing `doctor_settings` conventions at implementation time
- Controllers orchestrate only; no DB in controllers

---

## 🌍 Global Safety Gate

- [x] **Data touched?** Y — doctor settings row
  - [ ] **RLS verified?** inherit existing `doctor_settings` policies
- [x] **Any PHI in logs?** MUST be No
- [x] **External API or AI call?** N
- [x] **Retention / deletion impact?** Y — deleted with the doctor's settings, same as `practice_name`

---

## ✅ Acceptance & Verification Criteria

- [ ] New accounts can store Yes or Not yet
- [ ] Existing accounts read as Yes without a manual edit
- [ ] No change to `getOnboardingStatus.complete` yet

---

## 🔗 Related Tasks

- [`task-clp-07-complete-profile-question.md`](./task-clp-07-complete-profile-question.md)

**Last Updated:** 2026-09-12  
**Reference:** `process/TASK_MANAGEMENT_GUIDE.md`
