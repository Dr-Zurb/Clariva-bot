# Add Appointment from Dashboard — Feature Plan

**Status:** 📝 **PLANNING**  
**Created:** 2026-03-28  
**Location:** Doctor dashboard → Appointments tab

---

## 🎯 Goal

Doctors can add appointments directly from the appointments tab, including an option to mark them as **free of cost** (no payment expected).

### User Story

> As a doctor, I want to add an appointment from my dashboard so that I can book walk-in patients or existing patients without going through the patient-facing booking flow. I want the option to mark some appointments as free of cost.

---

## Scope

### In Scope

- "Add appointment" button on Appointments tab
- Modal: patient selector (search existing patients or walk-in name/phone), date/time picker (from available slots), reason for visit, notes, **free of cost** checkbox
- Doctor-only API: derive `doctorId` from authenticated user; no `doctorId` in request body
- When **free of cost**: no payment created; appointment status `confirmed`
- Slot conflict check; reuse `getAvailableSlots` and `checkSlotConflict`

### Out of Scope

- No DB schema changes
- No changes to patient-facing `/book` flow
- No payment for doctor-created appointments (free or paid — Phase 0: all doctor-created are no-payment)

---

## Technical Notes

| Area | Detail |
|------|--------|
| **Backend** | `POST /api/v1/appointments` (doctor-only, auth required); or extend `POST /book` with auth + `freeOfCost` |
| **Validation** | `patientId?` OR (`patientName` + `patientPhone`); `appointmentDate`; `reasonForVisit` (required); `notes?`; `freeOfCost?` |
| **Fee** | When `freeOfCost` true: no payment row; status `confirmed` |
| **Frontend** | `getPatients()` for patient list; `getAvailableSlots(doctorId, date)` for slots; `getDoctorSettings()` for `doctor_id` |

---

## Reference

- [appointment-service.ts](../../../backend/src/services/appointment-service.ts) — `bookAppointment`, `checkSlotConflict`
- [availability-service.ts](../../../backend/src/services/availability-service.ts) — `getAvailableSlots`
- [AppointmentsListWithFilters.tsx](../../../frontend/components/appointments/AppointmentsListWithFilters.tsx)
- [api.ts](../../../frontend/lib/api.ts) — `getAppointments`, `getPatients`, `getAvailableSlots`, `getDoctorSettings`

---

**Last Updated:** 2026-03-28
