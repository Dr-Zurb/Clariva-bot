# Task clp-03: "For clinics" nav + clinic-aware anchors

## 📋 Task Overview

Add a visible exit to `/clinics`. A doctor already on `/clinics` must not be thrown onto the creator homepage by "How it works" or "What converts".

**Program / Phase:** clinic-path · Phase 1 (discovery)  
**Batch:** [`plan-p1-clinic-path-discovery-batch.md`](../plan-p1-clinic-path-discovery-batch.md)  
**Execution order:** [`EXECUTION-ORDER-p1-clinic-path-discovery.md`](./EXECUTION-ORDER-p1-clinic-path-discovery.md)  
**Estimated Time:** 1 hour  
**Status:** ✅ **COMPLETED**  
**Completed:** 2026-09-12

**Change Type:**
- [x] **Update existing** — shared nav

**Current State:**
- ✅ `NAV_LINKS` in `frontend/components/marketing/constants.ts` — How it works / Features / What converts / Pricing; all section links are `/#…`
- ✅ `MarketingNav` maps `NAV_LINKS` on desktop and mobile
- ❌ No "For clinics" link
- ❌ No clinic-aware link set

**Scope Guard:**
- Expected files touched: ≤ 3
- Do not add a homepage chooser

**Reference Documentation:**
- [`plan-clinic-path.md`](../../../../../../Product%20plans/plan-clinic-path.md) — CLP-DL-3

---

## ✅ Task Breakdown

### 1. Exit
- [ ] 1.1 Add "For clinics" → `/clinics` to the shared marketing nav

### 2. Stay on the clinic pitch
- [ ] 2.1 On `/clinics`, section links that only exist on `/` must not dump the visitor onto the creator homepage
- [ ] 2.2 Pricing, demo, signup, sign-in stay reachable from both pages

### 3. Verification
- [ ] 3.1 From `/`, "For clinics" opens `/clinics`
- [ ] 3.2 From `/clinics`, no nav item lands on `/#how-it-works` or `/#what-converts`
- [ ] 3.3 Mobile disclosure includes the same links

---

## 📁 Files to Create/Update

- ⚠️ `frontend/components/marketing/constants.ts`
- ⚠️ `frontend/components/marketing/MarketingNav.tsx`

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- Nav stays a Server Component if it already is (JS-free `<details>` on mobile)
- One product — "For clinics" is an exit, not a second brand

---

## 🌍 Global Safety Gate

- [x] **Data touched?** N
- [x] **Any PHI in logs?** No
- [x] **External API or AI call?** N
- [x] **Retention / deletion impact?** N

---

## ✅ Acceptance & Verification Criteria

- [ ] "For clinics" visible on `/`, `/pricing`, `/demo`, `/clinics`
- [ ] Clinic visitor is not bounced to the creator homepage by a section link

---

## 🔗 Related Tasks

- [`task-clp-02-clinics-landing.md`](./task-clp-02-clinics-landing.md)
- [`task-clp-04-demo-copy.md`](./task-clp-04-demo-copy.md)

**Last Updated:** 2026-09-12  
**Reference:** `process/TASK_MANAGEMENT_GUIDE.md`
