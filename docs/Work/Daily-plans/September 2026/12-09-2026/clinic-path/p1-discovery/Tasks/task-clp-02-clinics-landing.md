# Task clp-02: Build `/clinics`

## 📋 Task Overview

A clinic landing page that sells OPD + records + Rx. Instagram is available, not required. Same ₹999 sheet as `/pricing`.

**Program / Phase:** clinic-path · Phase 1 (discovery)  
**Batch:** [`plan-p1-clinic-path-discovery-batch.md`](../plan-p1-clinic-path-discovery-batch.md)  
**Execution order:** [`EXECUTION-ORDER-p1-clinic-path-discovery.md`](./EXECUTION-ORDER-p1-clinic-path-discovery.md)  
**Estimated Time:** 2 hours  
**Status:** ✅ **COMPLETED**  
**Completed:** 2026-09-12

**Change Type:**
- [x] **New feature** — new public route; reuse marketing chrome

**Current State:**
- ✅ Marketing chrome — `MarketingNav`, `MarketingFooter`, `FinalCtaBand`, `haloPrimaryButton`
- ✅ Clinic pitch already written in `PRICING_MODEL_DECISIONS.md` ("The pitch, in order" · Clinic)
- ✅ `/pricing` already has the locked numbers
- ❌ `frontend/app/clinics/page.tsx` — MISSING

**Scope Guard:**
- Expected files touched: ≤ 4
- Do not rewrite `/`
- Do not invent prices

**Reference Documentation:**
- [`plan-clinic-path.md`](../../../../../../Product%20plans/plan-clinic-path.md) — CLP-DL-2, CLP-DL-5
- [`PRICING_MODEL_DECISIONS.md`](../../../../../../../Reference/business/PRICING_MODEL_DECISIONS.md)
- [`FRONTEND_STANDARDS.md`](../../../../../../../Reference/engineering/development/FRONTEND_STANDARDS.md)

---

## ✅ Task Breakdown

### 1. Page
- [ ] 1.1 New `/clinics` route under shared marketing chrome
- [ ] 1.2 Clinic opener: receptionist arithmetic, OPD / records / Rx
- [ ] 1.3 Teleconsult presented as available, not required
- [ ] 1.4 Same locked price sentence as `/pricing`
- [ ] 1.5 CTAs: Book a demo + Get started
- [ ] 1.6 Page metadata must not say Instagram-only

### 2. Verification
- [ ] 2.1 Render `/clinics` in the running app
- [ ] 2.2 Lint the new page

---

## 📁 Files to Create/Update

- ❌ `frontend/app/clinics/page.tsx` — create
- Optional small presentational pieces under `frontend/components/marketing/` if the page would otherwise dump everything inline

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- Write as if the doctor's own patient will read it
- Prefer *patients, practice, visits* over *leads, funnel, influencer*
- Reuse existing marketing tokens / `Button` / lucide — no new icon library
- Nav on this page will still point at `/#…` until `clp-03` — acceptable residual, record it

---

## 🌍 Global Safety Gate

- [x] **Data touched?** N
- [x] **Any PHI in logs?** No
- [x] **External API or AI call?** N
- [x] **Retention / deletion impact?** N

---

## ✅ Acceptance & Verification Criteria

- [ ] `/clinics` loads with clinic-first copy
- [ ] Price matches the locked sheet
- [ ] Instagram is not a requirement in the copy
- [ ] `/` is unchanged

---

## 🔗 Related Tasks

- [`task-clp-03-nav-for-clinics.md`](./task-clp-03-nav-for-clinics.md)

**Last Updated:** 2026-09-12  
**Reference:** `process/TASK_MANAGEMENT_GUIDE.md`
