# Task clp-01: Broaden root meta; add sitemap

## 📋 Task Overview

The Google snippet for "Halo Aid" currently says Instagram DMs. Broaden the root meta description so a clinic searcher will click. Add a sitemap so `/pricing` and `/clinics` can be indexed.

**Program / Phase:** clinic-path · Phase 1 (discovery)  
**Batch:** [`plan-p1-clinic-path-discovery-batch.md`](../plan-p1-clinic-path-discovery-batch.md)  
**Execution order:** [`EXECUTION-ORDER-p1-clinic-path-discovery.md`](./EXECUTION-ORDER-p1-clinic-path-discovery.md)  
**Estimated Time:** 0.5 hours  
**Status:** ✅ **COMPLETED**  
**Completed:** 2026-09-12

**Change Type:**
- [x] **Update existing** — change root metadata; add sitemap

**Current State:**
- ✅ `frontend/app/page.tsx` — EXISTS (title + Instagram-first description)
- ✅ `frontend/app/layout.tsx` — EXISTS (default "Turn your audience into your practice.")
- ❌ `frontend/app/sitemap.ts` — MISSING
- ❌ `frontend/app/robots.ts` — MISSING (optional this task; sitemap is required)

**Scope Guard:**
- Expected files touched: ≤ 3
- Do not change the homepage `<h1>` or hero (CLP-DL-1)

**Reference Documentation:**
- [`plan-clinic-path.md`](../../../../../../Product%20plans/plan-clinic-path.md) — CLP-DL-4
- [`BRAND.md`](../../../../../../../Reference/business/BRAND.md)

---

## ✅ Task Breakdown

### 1. Root metadata
- [ ] 1.1 Broaden `DESCRIPTION` on `frontend/app/page.tsx` so the snippet names clinic / OPD as well as Instagram
- [ ] 1.2 Keep `TITLE` and on-page hero copy unchanged

### 2. Sitemap
- [ ] 2.1 Add a sitemap that lists `/`, `/pricing`, `/demo`, `/clinics`, and the legal pages already public
- [ ] 2.2 `/clinics` may 404 until `clp-02` — still list it

### 3. Verification
- [ ] 3.1 Confirm page metadata and sitemap in the running app
- [ ] 3.2 Lint the touched files

---

## 📁 Files to Create/Update

- ⚠️ `frontend/app/page.tsx` — description only
- ❌ `frontend/app/sitemap.ts` — create
- ⚠️ `frontend/app/layout.tsx` — only if default description must stay consistent (prefer leave it)

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- Public copy as if the doctor's own patient will read it (`BRAND.md`)
- Do not invent performance claims
- No `process.env` outside validated config (N/A if Next metadata only uses `NEXT_PUBLIC_APP_URL` already in `layout.tsx`)

---

## 🌍 Global Safety Gate

- [x] **Data touched?** N
- [x] **Any PHI in logs?** No
- [x] **External API or AI call?** N
- [x] **Retention / deletion impact?** N

---

## ✅ Acceptance & Verification Criteria

- [ ] Google-facing description no longer reads Instagram-only
- [ ] Homepage visible copy is unchanged
- [ ] Sitemap lists `/`, `/pricing`, `/demo`, `/clinics`

---

## 🔗 Related Tasks

- [`task-clp-02-clinics-landing.md`](./task-clp-02-clinics-landing.md)

**Last Updated:** 2026-09-12  
**Reference:** `process/TASK_MANAGEMENT_GUIDE.md`
