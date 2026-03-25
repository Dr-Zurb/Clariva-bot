# Task OPD-06: Frontend — doctor dashboard OPD controls

## 2026-03-24 — OPD initiative

---

## 📋 Task Overview

Extend **doctor dashboard** with **OPD operational UI**: for **queue** mode — live **token list**, **call next**, **mark complete/skip**, **reinsert** actions (per policy); for **slot** mode — **invite next early**, **mark delay**, **overflow/grace** hooks (APIs from opd-03/08); align with [opd-systems-plan.md](./opd-systems-plan.md) §5–6 and §8.4.

**Estimated Time:** 14–24 hours  
**Status:** ✅ **DONE** (MVP + doctor APIs)

**Change Type:**
- [x] **Update existing** — `frontend/app/dashboard/appointments/*`, new components — [CODE_CHANGE_RULES.md](../../../../../task-management/CODE_CHANGE_RULES.md)

**Current State:**
- ✅ `AppointmentsListWithFilters.tsx`, `AddAppointmentModal.tsx`, appointment detail page.
- ✅ **`/dashboard/opd-today`** — queue board (token, initials, Call/Skip) or slot-mode panel; links to Practice setup → OPD.
- ✅ **Appointment detail** — slot-mode **Invite early join**, **Set/Clear delay** (broadcast minutes to patient snapshot).
- ⚠️ **Requeue at end / overflow** — not implemented (backend hooks deferred).
- ⚠️ Real-time: **polling** on queue board (~15s).

**Scope Guard:** Single hub route **`/dashboard/opd-today`** (no duplicate list).

**Reference Documentation:**
- [PRACTICE_SETUP_UI.md](../../../../../Reference/PRACTICE_SETUP_UI.md)
- [opd-systems-plan.md](./opd-systems-plan.md) §8.4

---

## ✅ Task Breakdown (Hierarchical)

### 1. Discovery

- [x] 1.1 Doctor APIs: `GET /api/v1/opd/queue-session?date=`, `POST .../offer-early-join`, `POST .../session-delay`, `PATCH .../queue-entries/:entryId`. Patient labels: **initials only** on queue rows.

### 2. Queue mode UI

- [x] 2.1 Table: token, patient label, queue + visit status.
- [x] 2.2 Actions: **Call** (`called`), **Skip** (`skipped`) — wired.
- [ ] 2.3 **Requeue** — deferred.

### 3. Slot mode UI

- [x] 3.1 **Invite early join** on appointment detail (expires 15 min).
- [x] 3.2 **Running late** — `opd_session_delay_minutes` (migration 030); patient snapshot prefers doctor delay.

### 4. Settings entry

- [x] 4.1 Links to **Practice setup → OPD** from OPD today + sidebar.

### 5. Verification

- [x] 5.1 Doctor-only via **Bearer** auth (same as other dashboard APIs).

---

## 📁 Files to Create/Update

**Backend**
- `backend/migrations/030_opd_session_delay.sql`
- `backend/src/services/opd-doctor-service.ts`
- `backend/src/controllers/opd-doctor-controller.ts`
- `backend/src/routes/api/v1/opd.ts`
- `backend/src/routes/api/v1/index.ts`
- `backend/src/utils/validation.ts` (OPD doctor schemas)
- `backend/src/services/opd-snapshot-service.ts` (merge doctor delay)
- `backend/src/types/database.ts` (`opd_session_delay_minutes`)

**Frontend**
- `frontend/app/dashboard/opd-today/page.tsx`
- `frontend/components/opd/OpdTodayClient.tsx`, `DoctorQueueBoard.tsx`, `DoctorOpdSlotActions.tsx`
- `frontend/components/layout/Sidebar.tsx`
- `frontend/components/appointments/AppointmentsListWithFilters.tsx`
- `frontend/app/dashboard/appointments/[id]/page.tsx`
- `frontend/lib/api.ts`, `frontend/types/opd-doctor.ts`

---

## 🌍 Global Safety Gate

- [x] **PHI minimization** on queue board (initials via `patientLabel`)

---

## 🔗 Related Tasks

- Depends on: [e-task-opd-03](./e-task-opd-03-backend-opd-services-and-routing.md), [e-task-opd-04](./e-task-opd-04-patient-session-apis.md)

---

**Last Updated:** 2026-03-24
