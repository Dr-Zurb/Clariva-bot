# Task hl-03: Public form + submit

> **Model: Opus (max thinking). Auto must not run this task.** Unauthenticated write of PHI.

---

## 📋 Task Overview

Patient opens `/h/:appointmentId?t=…`, fills four fields, POSTs once. The chart is not touched.

**Program / Phase:** history-link · Phase 1
**Batch:** [`plan-p1-history-link-form-to-chart-batch.md`](../plan-p1-history-link-form-to-chart-batch.md)
**Estimated Time:** ~5 hours
**Status:** ⏳ **PENDING**
**Completed:** —

**Change Type:**
- [x] **New feature**

**Current State:**
- ✅ Public pattern: `/r/[id]?t=` + `public-prescription-controller.ts` (401 / 410 / no auth middleware). `/c/*` is already unauthenticated.
- ✅ `/c/history/[sessionId]` is **chat replay**. Do not reuse that path.
- ❌ No `/h/` route. No public history POST.

**Scope Guard:** ≤ 8 files. **Zero writes** to `patient_allergies`, `patient_chronic_conditions`, `patient_medications`, `prescriptions`. No `MediaRecorder`. No AI.

**Reference:** HL-DL-2, 6, 8, 9, 10 · COMPLIANCE.md

---

## ✅ Task Breakdown

### 1. Pre-flight
- [ ] 1.1 `hl-01` and `hl-02` green.
- [ ] 1.2 Confirm `/h/` is free in `frontend/app` and middleware still only gates `/dashboard/*`.

### 2. Routes
- [ ] 2.1 `GET /api/v1/public/history/:appointmentId?t=` — token + appointment still bookable; returns **no chart PHI** (clinic display name + appointment time only).
- [ ] 2.2 `POST` same path — Zod: why-today required; each list is `{ none: true }` or `{ none: false, items: [...] }` with name required per item.
- [ ] 2.3 Controller: `asyncHandler`, no try/catch. Service writes the sidecar only. Second POST → 409. Expired → 410. Wrong kind / bad token → 401. Cancelled → 404 or 410 (pick one, test it).
- [ ] 2.4 Notice version snapshotted from the constants module (placeholder string until counsel — must not be `v1.0` or `DRAFT-*` in production; a `PLACEHOLDER-UNAPPROVED` is acceptable on staging and must fail a production-ship check).

### 3. Page
- [ ] 3.1 `frontend/app/h/[appointmentId]/page.tsx` — four fields, "none" toggles, submit, already-submitted state, expired state.
- [ ] 3.2 Strip `?t=` from the address bar after first successful GET (same as `/c/history`).
- [ ] 3.3 Collection-notice slot rendered; wording is the constants string, not invented in JSX.

### 4. Tests
- [ ] 4.1 POST does not call any chart insert service (mock assertion).
- [ ] 4.2 Second POST 409. GET never returns allergen/med/condition rows from the chart.
- [ ] 4.3 No PII/PHI in logs.

---

## 📁 Files

```
CREATE: backend/src/services/history-form-service.ts
CREATE: backend/src/controllers/public-history-form-controller.ts
CREATE: backend/src/routes/api/v1/public-history-form.ts (mount)
CREATE: frontend/app/h/[appointmentId]/page.tsx + form component
CREATE: backend/src/constants/history-form-notice.ts
CREATE: tests for route + page states
```

## 🧠 Design Constraints (NO IMPLEMENTATION)

- The GET payload is a leak surface. If you are tempted to return "we already have penicillin on file", you have broken HL-DL-8.
- Multipart / file upload is out of scope.

## 🌍 Global Safety Gate

- [ ] Data touched? **Yes** — patient-authored PHI via public POST.
- [ ] RLS? Service-role write only.
- [ ] PHI in logs? No.
- [ ] External API / AI? No.

---

**Last Updated:** 2026-08-31
**Completed:** —
