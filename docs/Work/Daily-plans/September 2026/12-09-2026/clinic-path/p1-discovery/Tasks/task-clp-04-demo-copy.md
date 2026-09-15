# Task clp-04: Neutralize `/demo`

## 📋 Task Overview

`/demo` currently says Halo Aid turns Instagram DMs into a practice. A clinic doctor who books a demo from a card or from `/clinics` must not be told they are in the wrong place.

**Program / Phase:** clinic-path · Phase 1 (discovery)  
**Batch:** [`plan-p1-clinic-path-discovery-batch.md`](../plan-p1-clinic-path-discovery-batch.md)  
**Execution order:** [`EXECUTION-ORDER-p1-clinic-path-discovery.md`](./EXECUTION-ORDER-p1-clinic-path-discovery.md)  
**Estimated Time:** 0.5 hours  
**Status:** ✅ **COMPLETED**  
**Completed:** 2026-09-12

**Change Type:**
- [x] **Update existing** — copy only

**Current State:**
- ⚠️ `frontend/app/demo/page.tsx` — EXISTS; title/description/H1/first bullet are Instagram-first
- ✅ Scheduler embed stays

**Scope Guard:**
- Expected files touched: 1
- Do not add a second Cal.com event or a `/demo/clinics` route this phase

**Reference Documentation:**
- [`plan-clinic-path.md`](../../../../../../Product%20plans/plan-clinic-path.md) — CLP-DL-1 (home stays creator; demo must not contradict `/clinics`)

---

## ✅ Task Breakdown

### 1. Copy
- [ ] 1.1 Neutralize metadata, heading, sub, and bullets so they work for both a creator and a clinic
- [ ] 1.2 Instagram may appear as one capability, not the only reason to book

### 2. Verification
- [ ] 2.1 Read `/demo` as a clinic doctor would
- [ ] 2.2 Lint the page

---

## 📁 Files to Create/Update

- ⚠️ `frontend/app/demo/page.tsx`

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- Same 20-minute, no-commitment frame
- No invented proof numbers

---

## 🌍 Global Safety Gate

- [x] **Data touched?** N
- [x] **Any PHI in logs?** No
- [x] **External API or AI call?** N
- [x] **Retention / deletion impact?** N

---

## ✅ Acceptance & Verification Criteria

- [ ] A clinic doctor can read `/demo` without being told they need Instagram
- [ ] Embed still renders

---

## 🔗 Related Tasks

- [`task-clp-05-phase-1-gate.md`](./task-clp-05-phase-1-gate.md)

**Last Updated:** 2026-09-12  
**Reference:** `process/TASK_MANAGEMENT_GUIDE.md`
