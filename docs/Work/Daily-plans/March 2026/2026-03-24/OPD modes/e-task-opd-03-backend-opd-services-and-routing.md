# Task OPD-03: Backend OPD services & routing (slot vs queue)

## 2026-03-24 — OPD initiative

---

## 📋 Task Overview

Implement **service-layer branching** so booking, availability, and appointment lifecycle **respect `doctor_settings.opd_mode`**: **`slot`** keeps current slot pipeline; **`queue`** issues **tokens** / queue rows, computes **ETA** inputs (rolling average from telemetry), and prepares data for **session snapshot** (consumed by opd-04).

**Estimated Time:** 12–24 hours  
**Status:** ✅ **DONE** (implementation)

**Change Type:**
- [x] **Update existing** — `appointment-service.ts`, `availability-service.ts`, `booking-controller.ts` / `appointment-controller.ts`, possibly `bookings.ts` public routes

**Current State:**
- ✅ Slot generation: `availability-service.ts`, `getAvailableSlots` patterns in `appointments` routes.
- ✅ `createAppointment` / conflict checks assume **time-based** uniqueness.
- ❌ No token issuance; no “session day queue” orchestration.
- ⚠️ **Breaking risk:** public book flow must **not** break when `opd_mode=slot` (default).

**Scope Guard:** Introduce **`OpdModeResolver`** or small `opd/` subfolder with **pure** functions where possible; avoid duplicating entire appointment-service — refactor incrementally.

**Reference Documentation:**
- [ARCHITECTURE.md](../../../../../Reference/engineering/architecture/ARCHITECTURE.md) · [RECIPES.md](../../../../../Reference/engineering/development/RECIPES.md)
- [opd-systems-plan.md](./opd-systems-plan.md) §3, §5.2, §8.1–8.2

---

## ✅ Task Breakdown (Hierarchical)

### 1. Mode resolution

- [x] 1.1 Central helper: `getDoctorOpdMode(doctorId)` → `'slot' | 'queue'` with default **`slot`**.
- [x] 1.2 Log **mode** at booking entry (non-PHI: doctor_id + mode enum only).

### 2. Slot mode (regression)

- [x] 2.1 Verify all existing tests/paths for **`slot`** unchanged.
- [x] 2.2 Add integration test: default doctor → slot booking OK.

### 3. Queue mode — booking path

- [x] 3.1 **Availability UX difference:** queue may expose **session window** + “join queue” instead of discrete slots — define MVP:
  - [x] 3.1.1 Option A: still pick a **day** + get **next token** for that doctor’s session template.
  - [ ] 3.1.2 Option B: single “today’s queue” endpoint — product decision recorded in Notes.
- [x] 3.2 **Insert `opd_queue_entries`** (or equivalent from opd-01) tied to `appointment_id`.
- [x] 3.3 **Conflict rules:** max patients per day if set; return 409 with stable error code per [ERROR_CATALOG.md](../../../../../Reference/engineering/development/ERROR_CATALOG.md) if applicable.

### 4. ETA computation (queue)

- [x] 4.1 Rolling average: read last N completed consult durations for doctor (from opd-01 telemetry).
- [x] 4.2 `etaMinutes = aheadCount * avgDuration` + optional variance range for UI.
- [x] 4.3 Cold-start: use `doctor_settings` default typical minutes or specialty constant (config table or env).

### 5. Consultation end hooks

- [ ] 5.1 On consult **complete** / room end: update queue “serving” pointer, persist duration sample for rolling average.
- [x] 5.2 Wire to existing completion path (`appointment-service` status `completed`, Twilio webhooks if any).

### 6. Verification

- [x] 6.1 Unit tests: ETA math, mode resolution.
- [ ] 6.2 Integration: queue booking creates token row + appointment.

---

## 📁 Files to Create/Update

```
backend/src/services/appointment-service.ts
backend/src/services/availability-service.ts
backend/src/services/doctor-settings-service.ts
backend/src/controllers/booking-controller.ts
backend/src/controllers/appointment-controller.ts
backend/src/routes/api/v1/bookings.ts
backend/src/routes/api/v1/appointments.ts
backend/src/services/opd/ (new — optional package)
```

---

## 🧠 Design Constraints

- **Controllers stay thin** — business rules in services ([ARCHITECTURE.md](../../../../../Reference/engineering/architecture/ARCHITECTURE.md)).
- **No PHI** in info logs for ETA.

---

## 🌍 Global Safety Gate

- [ ] **RLS:** any new queries respect patient/doctor boundaries
- [ ] **Queue naming:** log context = `opd_queue` not BullMQ `queue`

---

## 🔗 Related Tasks

- After: [e-task-opd-01](./e-task-opd-01-domain-model-and-database-migrations.md)
- Feeds: [e-task-opd-04](./e-task-opd-04-patient-session-apis.md)

---

## Notes (implementation summary)

- **Code:** `backend/src/services/opd/` — `opd-mode-service.ts` (`resolveOpdModeFromSettings`, `getDoctorOpdMode`), `opd-eta.ts` (pure ETA), `opd-queue-service.ts` (daily count in doctor TZ, token issuance, rolling average from `consultation_duration_seconds`, queue row CRUD, sync on lifecycle).
- **Booking:** `bookAppointment` logs `{ doctorId, opd_mode, context: 'opd_queue' }`; **queue** skips `checkSlotConflict`, enforces `max_appointments_per_day`, inserts `opd_queue_entries` (rollback appointment if queue insert fails). **Slot** path unchanged.
- **Reschedule:** `updateAppointmentDateForPatient` — queue mode removes slot overlap check; deletes queue row, updates date, re-issues token for new session day.
- **Completion / cancel:** `syncOpdQueueEntryOnAppointmentStatus` from `updateAppointment`, `updateAppointmentStatus`, `cancelAppointmentForPatient`, and `tryMarkVerified` (Twilio verification).
- **API:** `GET /api/v1/bookings/day-slots` and `GET /api/v1/bookings/slot-page-info` include **`opdMode`** (`slot` | `queue`).
- **Env:** `OPD_QUEUE_DEFAULT_CONSULT_MINUTES` (default `10`) for cold-start ETA.
- **Deferred:** §5.1 “serving pointer” / §3.1.2 Option B endpoint; §6.2 DB integration test (optional follow-up).

---

**Last Updated:** 2026-03-24
