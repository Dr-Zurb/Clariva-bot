# Task clk-20: Three arrival lines

## 📋 Task Overview

The prep page and the visit hub show one fixed sentence for how to show up. The sentence follows the visit’s modality. Text and an unknown type show nothing.

**Program / Phase:** clinic-link · Phase 4 (show up ready)
**Batch:** [`plan-p4-clinic-link-show-up-batch.md`](../plan-p4-clinic-link-show-up-batch.md)
**Execution order:** [`EXECUTION-ORDER-p4-clinic-link-show-up.md`](./EXECUTION-ORDER-p4-clinic-link-show-up.md)
**Estimated Time:** 4 hours
**Status:** ✅ **DONE** (2026-09-27)

**Change Type:**
- [x] **New feature** — arrival copy on two existing pages

**Current State:**
- ✅ **What exists:** `frontend/app/book/prep/page.tsx` loads with a history-form token. `frontend/app/my-visit/page.tsx` loads `PatientVisitSession` with a consultation token. `appointments.consultation_type` is already `text`, `voice`, `video`, or `in_clinic`.
- ❌ **What's missing:** the public history read does not return the modality. The patient snapshot does not either. Neither page shows an arrival sentence.
- ⚠️ **Notes:** The video waiting room is `clk-22`. This task owns the prep page and `/my-visit` only.

**Scope Guard:**
- Expected files touched: ≤ 6 (one copy module, the history read, the snapshot, two pages, tests)
- Do not add a fourth sentence, a fasting line, or a language question
- Do not change reminder copy
- Do not put the sentence behind a new route
- Collection-notice wording stays `⟨fill — counsel⟩`

**Reference Documentation:**
- [FRONTEND_STANDARDS.md](../../../../../../../Reference/engineering/development/FRONTEND_STANDARDS.md)
- [CONTRACTS.md](../../../../../../../Reference/engineering/architecture/CONTRACTS.md)

---

## 🌍 Global Safety Gate

- [x] **Data touched?** N — a modality string the appointment already stores
- [x] **RLS verified?** Y — the history-form token and the consultation token already scope these reads. No new policy.
- [x] **Any PHI in logs?** No
- [x] **External API or AI call?** N
- [x] **Retention / deletion impact?** N

---

## ✅ Task Breakdown

### 1. One sentence
- [ ] 1.1 A single module owns the three sentences in the batch decision lock. `video`, `voice`, and `in_clinic` each map to one. `text`, null, and any other value map to no sentence.
- [ ] 1.2 The public history read includes `consultationType` from `appointments.consultation_type`. It does not include reason, name, phone, age, or chart rows.
- [ ] 1.3 The patient snapshot includes the same `consultationType`. It does not include a prep token.

### 2. Two pages
- [ ] 2.1 The prep page shows the sentence for that type, or no sentence.
- [ ] 2.2 `/my-visit` shows the same sentence for that type, or no sentence.
- [ ] 2.3 Age, sex, and the history fields stay as Phase 2 left them.

### 3. Verification
- [ ] 3.1 Unit test: video, voice, and in-clinic each render only their sentence; text renders none
- [ ] 3.2 The history payload and the snapshot payload contain the type and no prep token
- [ ] 3.3 Typecheck and lint the touched files

---

## 📁 Files to Create/Update

- ❌ Arrival-line module — MISSING
- ⚠️ `frontend/app/book/prep/page.tsx` — EXISTS
- ⚠️ `PatientVisitSession` — EXISTS
- ⚠️ Public history read — EXISTS
- ⚠️ `buildPatientOpdSnapshot` — EXISTS
- ⚠️ `CONTRACTS.md` — EXISTS

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- Zod already validates the history-form token and the consultation token. This task only adds a modality field to those responses.
- The sentence is fixed copy. Do not interpolate the reason, the medicine list, or a test name.
- No PHI in logs.

---

## ✅ Acceptance & Verification Criteria

- [ ] A video prep page and a video `/my-visit` show the quiet-room sentence
- [ ] A text visit shows no arrival sentence
- [ ] The snapshot response has no `/book/prep?t=`

---

## 📝 Notes

CLK-DL-12. The waiting-room placement of the video sentence is `clk-22`.

---

## 🔗 Related Tasks

- [`task-clk-22-video-line-on-waiting-room.md`](./task-clk-22-video-line-on-waiting-room.md)
- [`task-clk-24-phase-4-gate.md`](./task-clk-24-phase-4-gate.md)

**Last Updated:** 2026-09-27
