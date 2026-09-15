# Task clp-08: Drop Instagram from `complete` when Not yet

## 📋 Task Overview

`getOnboardingStatus.complete` currently ANDs Instagram for every doctor. When the stored answer is Not yet, complete means practice + pricing + availability only.

**Program / Phase:** clinic-path · Phase 2 (go-live)  
**Batch:** [`plan-p2-clinic-path-go-live-batch.md`](../plan-p2-clinic-path-go-live-batch.md)  
**Execution order:** [`EXECUTION-ORDER-p2-clinic-path-go-live.md`](./EXECUTION-ORDER-p2-clinic-path-go-live.md)  
**Estimated Time:** 1.5 hours  
**Status:** ✅ **COMPLETED**  
**Completed:** 2026-09-12

**Change Type:**
- [x] **Update existing** — onboarding status composition

**Current State:**
- ⚠️ `backend/src/services/dashboard-onboarding-service.ts` — `complete = instagramConnected && practiceInfoSet && pricingSet && availabilitySet`
- ✅ `instagramConnected` is still a returned boolean (keep it)
- ✅ Frontend `isGoLiveComplete` uses `onboarding.complete && verificationStatus === "verified"`
- ⚠️ Confirm callers of `complete` / `isGoLiveComplete` before changing the AND

**Scope Guard:**
- Expected files: the onboarding service + its tests + any contract text that documents the four signals
- Do not hide the Instagram step here (`clp-09`)
- Do not skip license verification or recording attestation

---

## ✅ Task Breakdown

### 1. Compose
- [ ] 1.1 When answer is Yes (or missing / backfilled), `complete` is unchanged
- [ ] 1.2 When answer is Not yet, Instagram is not required for `complete`
- [ ] 1.3 Still return `instagramConnected` so the checklist can show the optional step

### 2. Callers
- [ ] 2.1 Audit every reader of `OnboardingStatus.complete` / `isGoLiveComplete`
- [ ] 2.2 Update focused tests for both answers

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- Service owns the rule; controller stays orchestration
- Typed `AppError` only
- No PHI in logs
- Do not invent a new response envelope — extend the existing onboarding status if a field must be surfaced

---

## 🌍 Global Safety Gate

- [x] **Data touched?** Y — reads settings + existing IG / availability signals
  - [ ] **RLS verified?** existing doctor-scoped reads
- [x] **Any PHI in logs?** MUST be No
- [x] **External API or AI call?** N
- [x] **Retention / deletion impact?** N

---

## ✅ Acceptance & Verification Criteria

- [ ] Not yet + practice + pricing + availability + verified → go-live complete without Instagram
- [ ] Yes + those three but no Instagram → still incomplete
- [ ] Existing backfilled Yes accounts match today's behaviour

---

## 🔗 Related Tasks

- [`task-clp-09-optional-checklist-step.md`](./task-clp-09-optional-checklist-step.md)

**Last Updated:** 2026-09-12  
**Reference:** `process/TASK_MANAGEMENT_GUIDE.md`
