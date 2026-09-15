# Task clp-07: Ask the question on complete-profile

## 📋 Task Overview

Ask "Do patients message you on Instagram or Facebook?" on the existing complete-profile step, next to practice name and specialty. Yes / Not yet. Not a plan chooser.

**Program / Phase:** clinic-path · Phase 2 (go-live)  
**Batch:** [`plan-p2-clinic-path-go-live-batch.md`](../plan-p2-clinic-path-go-live-batch.md)  
**Execution order:** [`EXECUTION-ORDER-p2-clinic-path-go-live.md`](./EXECUTION-ORDER-p2-clinic-path-go-live.md)  
**Estimated Time:** 1.5 hours  
**Status:** ✅ **COMPLETED**  
**Completed:** 2026-09-12

**Change Type:**
- [x] **Update existing** — `complete-profile` + settings write

**Current State:**
- ✅ `frontend/app/complete-profile/page.tsx` — practice name + specialty via `patchDoctorSettings`
- ❌ No third question
- ❌ Existing doctors who already completed profile will not see this screen again — they stay Yes via `clp-06` backfill (acceptable)

**Scope Guard:**
- Expected files touched: ≤ 4
- Do not add the question to `/` or signup passwordless picker
- Do not change go-live AND in this task

---

## ✅ Task Breakdown

### 1. Ask
- [ ] 1.1 Add the locked question and two answers on complete-profile
- [ ] 1.2 Persist with the same settings write already used for practice name
- [ ] 1.3 Copy must not look like a plan or SKU choice

### 2. Verification
- [ ] 2.1 New signup can choose Yes or Not yet
- [ ] 2.2 Lint / focused tests on the form

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- Public / doctor-facing copy: behaviour, not "creator" / "clinic" labels (`BRAND.md`)
- Validate with Zod before the service
- No PHI in logs

---

## 🌍 Global Safety Gate

- [x] **Data touched?** Y — same settings row as `clp-06`
  - [ ] **RLS verified?** same as `clp-06`
- [x] **Any PHI in logs?** MUST be No
- [x] **External API or AI call?** N
- [x] **Retention / deletion impact?** same as `clp-06`

---

## ✅ Acceptance & Verification Criteria

- [ ] Question wording matches CLP-DL-6
- [ ] Answer is stored
- [ ] Instagram connect is not hidden after "Not yet" (that is `clp-09`)

---

## 🔗 Related Tasks

- [`task-clp-06-settings-field.md`](./task-clp-06-settings-field.md)
- [`task-clp-08-optional-instagram-complete.md`](./task-clp-08-optional-instagram-complete.md)

**Last Updated:** 2026-09-12  
**Reference:** `process/TASK_MANAGEMENT_GUIDE.md`
