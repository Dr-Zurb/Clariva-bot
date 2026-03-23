# 2026-03-23 — Consultation Verification v2 + Add Appointment from Dashboard

**Date:** 2026-03-23  
**Themes:** (1) "Who left first" + 1-minute rule for payout eligibility; (2) Add appointment from dashboard with free-of-cost option

---

## Overview

### Consultation Verification v2

Update video consultation verification so doctors are paid only when they fulfil their role. Track when doctor and patient leave; reject payout if doctor left first before 1 minute. Patient no-show or patient-left-first → pay doctor.

**Goals:** Add `doctor_left_at`, `patient_left_at`; handle Twilio `participant-disconnected` webhook; update `tryMarkVerified`; reduce MIN_VERIFIED to 60 seconds.

### Add Appointment from Dashboard

Doctors can add appointments directly from the appointments tab, with an option to mark them as free of cost.

**Goals:** Add appointment button; modal with patient selector (existing or walk-in), date/time from available slots, reason for visit, notes, free-of-cost checkbox.

---

## Plan & Task Order

### Consultation Verification v2

| Order | Task | Dependency | Est. |
|-------|------|-------------|------|
| 1 | [e-task-1: Migration](./e-task-1-consultation-left-at-migration.md) | — | 0.5 h |
| 2 | [e-task-2: Env MIN_VERIFIED 60](./e-task-2-min-verified-60.md) | — | 0.25 h |
| 3 | [e-task-3: participant-disconnected](./e-task-3-participant-disconnected.md) | e-task-1 | 1.5 h |
| 4 | [e-task-4: tryMarkVerified logic](./e-task-4-try-mark-verified-who-left-first.md) | e-task-1, 3 | 2 h |

### Add Appointment from Dashboard

| Order | Task | Dependency | Est. |
|-------|------|-------------|------|
| 5 | [e-task-5: Backend API](./e-task-5-backend-doctor-create-appointment.md) | — | 1.5 h |
| 6 | [e-task-6: Frontend Modal](./e-task-6-frontend-add-appointment-modal.md) | e-task-5 | 2.5 h |
| 7 | [e-task-7: Integration & README](./e-task-7-add-appointment-integration-readme.md) | e-task-5, 6 | 0.5 h |

---

## Related / Future

- [PRESCRIPTION_EHR_PLAN.md](./PRESCRIPTION_EHR_PLAN.md) — Prescription & EHR-lite (post-consultation) — planning doc
- [ADD_APPOINTMENT_FROM_DASHBOARD.md](./Plans/ADD_APPOINTMENT_FROM_DASHBOARD.md) — Add appointment feature plan

---

## Reference

### Consultation Verification

- [CONSULTATION_VERIFICATION_STRATEGY.md](../../../task-management/CONSULTATION_VERIFICATION_STRATEGY.md)
- [CONSULTATION_VERIFICATION_V2.md](../../../task-management/CONSULTATION_VERIFICATION_V2.md)
- [consultation-verification-service.ts](../../../../backend/src/services/consultation-verification-service.ts)

### Add Appointment

- [appointment-service.ts](../../../../backend/src/services/appointment-service.ts)
- [availability-service.ts](../../../../backend/src/services/availability-service.ts)
- [AppointmentsListWithFilters.tsx](../../../../frontend/components/appointments/AppointmentsListWithFilters.tsx)

---

**Last Updated:** 2026-03-28
