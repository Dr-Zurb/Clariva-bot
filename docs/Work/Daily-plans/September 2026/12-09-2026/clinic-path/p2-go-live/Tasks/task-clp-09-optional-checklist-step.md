# Task clp-09: Keep Instagram visible, mark optional

## 📋 Task Overview

The Connect socials step stays on Getting started for everyone. When the answer is Not yet, it is optional — not a blocker, not hidden.

**Program / Phase:** clinic-path · Phase 2 (go-live)  
**Batch:** [`plan-p2-clinic-path-go-live-batch.md`](../plan-p2-clinic-path-go-live-batch.md)  
**Execution order:** [`EXECUTION-ORDER-p2-clinic-path-go-live.md`](./EXECUTION-ORDER-p2-clinic-path-go-live.md)  
**Estimated Time:** 1 hour  
**Status:** ✅ **COMPLETED**  
**Completed:** 2026-09-12

**Change Type:**
- [x] **Update existing** — checklist presentation

**Current State:**
- ✅ `ONBOARDING_STEPS` always includes Instagram
- ✅ `buildGoLiveChecklist` / `remainingGoLiveSteps` / `isGoLiveComplete` in `frontend/components/dashboard/onboarding/onboarding-steps.ts`
- ⚠️ Getting started copy still says "Five steps… connect socials"

**Scope Guard:**
- Expected files touched: ≤ 4
- Do not remove the integrations page
- Do not skip the step for Yes accounts

---

## ✅ Task Breakdown

### 1. Present
- [ ] 1.1 Not yet: Instagram remains in the list, marked optional
- [ ] 1.2 Yes: Instagram remains required, copy unchanged in meaning
- [ ] 1.3 `remainingGoLiveSteps` / complete-state copy do not treat an optional undone Instagram step as blocking

### 2. Verification
- [ ] 2.1 Getting started for a Not yet dummy doctor can finish without connecting
- [ ] 2.2 Connecting later still marks the step done

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- No PHI in logs
- Do not invent a second onboarding product
- Keep deep-links to `/dashboard/settings/integrations`

---

## 🌍 Global Safety Gate

- [x] **Data touched?** N (reads status already fetched)
- [x] **Any PHI in logs?** No
- [x] **External API or AI call?** N
- [x] **Retention / deletion impact?** N

---

## ✅ Acceptance & Verification Criteria

- [ ] Instagram step never disappears
- [ ] Not yet doctor is not stuck on Connect socials
- [ ] Yes doctor still cannot complete without connecting

---

## 🔗 Related Tasks

- [`task-clp-08-optional-instagram-complete.md`](./task-clp-08-optional-instagram-complete.md)
- [`task-clp-10-phase-2-gate.md`](./task-clp-10-phase-2-gate.md)

**Last Updated:** 2026-09-12  
**Reference:** `process/TASK_MANAGEMENT_GUIDE.md`
