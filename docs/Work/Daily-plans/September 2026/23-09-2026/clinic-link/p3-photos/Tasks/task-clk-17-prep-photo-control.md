# Task clk-17: Prep photo control

## 📋 Task Overview

The prep page can take a photo or pick a file, downscale an image, and remove it before check-in. Age, sex, and the chart stay off this screen.

**Program / Phase:** clinic-link · Phase 3 (photos)
**Batch:** [`plan-p3-clinic-link-photos-batch.md`](../plan-p3-clinic-link-photos-batch.md)
**Execution order:** [`EXECUTION-ORDER-p3-clinic-link-photos.md`](./EXECUTION-ORDER-p3-clinic-link-photos.md)
**Estimated Time:** 4 hours
**Status:** ✅ **DONE** (2026-09-27)

**Change Type:**
- [x] **New feature** — upload control on the prep page

**Current State:**
- ✅ **What exists:** `frontend/app/book/prep/page.tsx` posts history with the history-form token. The collection notice on that page is `⟨fill — counsel⟩`.
- ❌ **What's missing:** a camera or file control bound to clk-15 and clk-16, and client-side downscale.
- ⚠️ **Notes:** Waits on clk-16. Photos are optional. Skipping them does not cancel the visit.

**Scope Guard:**
- Expected files touched: ≤ 4 (the prep page, a small client helper for downscale, the API functions, one test)
- Do not add a face, Aadhaar, or insurance control
- Do not change the history lists or the chips
- Do not put the filename in a log
- Collection-notice sentence stays `⟨fill — counsel⟩`

**Reference Documentation:**
- [FRONTEND_STANDARDS.md](../../../../../../../Reference/engineering/development/FRONTEND_STANDARDS.md)
- [COMPLIANCE.md](../../../../../../../Reference/engineering/compliance/COMPLIANCE.md)

---

## 🌍 Global Safety Gate

- [x] **Data touched?** Y — the screen calls the Phase 3 upload and delete.
- [x] **RLS verified?** Y — the page uses the history-form token. No new policy.
- [x] **Any PHI in logs?** No
- [x] **External API or AI call?** N
- [x] **Retention / deletion impact?** N — delete behavior is clk-16

---

## ✅ Task Breakdown

### 1. Add a file
- [x] 1.1 Camera (`capture="environment"`) or a file picker. One file per request.
- [x] 1.2 An image is downscaled in the browser before upload so a phone photo can fit under 10 MB. A PDF is sent as chosen; the server still rejects an oversize body.
- [x] 1.3 The type control uses the six existing types. The default for a medicine strip is `other`.

### 2. See and remove
- [x] 2.1 The page lists only the files clk-16 returns. A desk scan is not shown.
- [x] 2.2 Remove calls the patient delete. After check-in the control shows the file and does not offer remove.

### 3. Verification
- [x] 3.1 Unit test: an image is scaled down before the upload call; the posted type for a strip is `other`; age and sex are absent
- [x] 3.2 Browser: add one dummy image on the prep page and see it listed
- [x] 3.3 Typecheck and lint the touched files

---

## 📁 Files to Create/Update

- ⚠️ `frontend/app/book/prep/page.tsx` — EXISTS
- ❌ Downscale helper — MISSING
- ⚠️ Public history API helpers — EXISTS from Phase 2, extend them

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- The file input posts only with the history-form token.
- Downscale is client-side. The server cap stays 10 MB.
- No new counsel sentence.

---

## ✅ Acceptance & Verification Criteria

- [x] A dummy image can be added from the prep page
- [x] The page does not render a desk document
- [x] Remove is available only before check-in

---

## 📝 Notes

CLK-DL-11, DVP-Q4. The doctor’s group is `clk-18`, which can land in parallel with `clk-16`.

---

## 🔗 Related Tasks

- [`task-clk-16-patient-photo-read-delete.md`](./task-clk-16-patient-photo-read-delete.md)
- [`task-clk-19-phase-3-gate.md`](./task-clk-19-phase-3-gate.md)

**Last Updated:** 2026-09-27
