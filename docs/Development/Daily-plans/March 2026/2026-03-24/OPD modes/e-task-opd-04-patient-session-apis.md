# Task OPD-04: Patient session APIs (snapshot, early join, delay)

## 2026-03-24 — OPD initiative

---

## 📋 Task Overview

Add **HTTP APIs** (and optional **realtime** contract) so the **patient** app / booking PWA can render [opd-systems-plan.md](./opd-systems-plan.md) **§6.4** states: **mode-aware** snapshot (`opdMode`, status, slot window or token+ETA, delay offset, early-invite eligibility), **accept early join**, and **subscribe** to updates (polling interval documented; SSE/WebSocket later).

**Estimated Time:** 10–18 hours  
**Status:** ✅ **DONE** (implementation)

**Change Type:**
- [x] **New feature** — new routes + handlers (may touch existing `consultation-token` validation patterns)

**Current State:**
- ✅ `consultation-token.ts` — signed join for video.
- ✅ `appointments` list/detail for **doctor** dashboard.
- ✅ **Patient** session snapshot + early join accept/decline (token auth; e-task-opd-04).
- ⚠️ Public `book/*` may need **tokenized** read-only snapshot (same security model as booking link).

**Scope Guard:** Prefer **GET** snapshot under `/api/v1/bookings/:id/session` or `/bookings/session/:token` — align with [API_DESIGN.md](../../../../../Reference/API_DESIGN.md) and [CONTRACTS.md](../../../../../Reference/CONTRACTS.md).

**Reference Documentation:**
- [SECURITY.md](../../../../../Reference/SECURITY.md) · [CONTRACTS.md](../../../../../Reference/CONTRACTS.md)
- [opd-systems-plan.md](./opd-systems-plan.md) §5.1b, §6

---

## ✅ Task Breakdown (Hierarchical)

### 1. Contract design

- [x] 1.1 Define JSON schema **PatientOpdSnapshot**:
  - [x] 1.1.1 Common: `appointmentId`, `status`, `delayMinutes?`, `doctorBusyWith?: 'other_patient' | 'you'`
  - [x] 1.1.2 Slot: `slotStart`, `slotEnd`, `earlyInviteAvailable?`, `earlyInviteExpiresAt?`
  - [x] 1.1.3 Queue: `tokenNumber`, `aheadCount`, `etaMinutes` / `etaRange`
- [x] 1.2 Document in **CONTRACTS.md** or OpenAPI if project uses it.

### 2. Authentication

- [ ] 2.1 **Path A:** Patient JWT / session (if exists for patient portal).
- [x] 2.2 **Path B:** Signed query token (like booking) — **must not** leak other appointments.
- [x] 2.3 Rate-limit per [RATE_LIMITING.md](../../../../../Reference/RATE_LIMITING.md).

### 3. Endpoints

- [x] 3.1 `GET .../snapshot` — returns current computed state (calls opd-03 services).
- [x] 3.2 `POST .../early-join/accept` — patient B accepts early join (slot mode); idempotent.
- [x] 3.3 `POST .../early-join/decline` — optional.

### 4. Realtime (MVP)

- [x] 4.1 Document **polling** interval (e.g. 15–30s) in response `Cache-Control` or JSON `suggestedPollSeconds`.
- [x] 4.2 Defer WebSocket to later initiative unless trivial.

### 5. Verification

- [x] 5.1 Tests: snapshot shape for slot vs queue; 403/404 for wrong token.

---

## 📁 Files to Create/Update

```
backend/src/routes/api/v1/appointments.ts (or new opd-session.ts)
backend/src/controllers/* 
backend/src/services/opd-snapshot-service.ts (new)
docs/Reference/CONTRACTS.md (if schema documented here)
```

**Implemented:**
- `backend/migrations/029_opd_early_invite.sql` — `opd_early_invite_*` on `appointments`
- `backend/src/types/opd-session.ts` — `PatientOpdSnapshot`
- `backend/src/services/opd-snapshot-service.ts`
- `backend/src/controllers/opd-session-controller.ts`
- `backend/src/routes/api/v1/bookings.ts` — `/session/*` routes
- `backend/src/middleware/rate-limiters.ts` — `publicSessionLimiter`
- `backend/src/utils/consultation-token.ts` — `verifyConsultationTokenAllowExpired`
- `backend/src/utils/validation.ts` — `validateSessionTokenQuery`
- `docs/Reference/CONTRACTS.md` — Patient OPD session section

---

## 🌍 Global Safety Gate

- [x] **No PHI** in snapshot beyond name already approved for booking context
- [x] **RLS / auth** — patient cannot read other patients’ appointments

---

## 🔗 Related Tasks

- Depends on: [e-task-opd-03](./e-task-opd-03-backend-opd-services-and-routing.md)
- Next: [e-task-opd-05](./e-task-opd-05-frontend-patient-appointment-ui.md)

---

**Last Updated:** 2026-03-24
