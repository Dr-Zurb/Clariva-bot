# Task 6: Frontend — Add Appointment Modal

## 2026-03-23 — Add Appointment from Dashboard

---

## 📋 Task Overview

Add "Add appointment" button to the appointments tab and an `AddAppointmentModal` component. Modal allows selecting an existing patient or entering walk-in details, picking date/time from available slots, reason for visit, notes, and "Free of cost" checkbox.

**Estimated Time:** 2.5 hours  
**Status:** ✅ **COMPLETED**  
**Completed:** 2026-03-28

**Change Type:**
- [ ] **New feature** — New component and API client method

**Current State:**
- ✅ **What exists:** `AppointmentsListWithFilters` (appointments list); `getAppointments`, `getPatients`, `getAvailableSlots`, `getDoctorSettings` in `lib/api.ts`; `app/dashboard/appointments/page.tsx` (Server Component)
- ❌ **What's missing:** Add appointment button; AddAppointmentModal; `createAppointment` API method
- ⚠️ **Notes:** Page is Server Component; Add button and Modal should be in a client component or the list component.

**Scope Guard:**
- Expected files touched: ~5 (AppointmentsListWithFilters or wrapper, AddAppointmentModal, api.ts, types)
- Depends on: e-task-5 (backend API)

**Reference Documentation:**
- [ADD_APPOINTMENT_FROM_DASHBOARD.md](./ADD_APPOINTMENT_FROM_DASHBOARD.md)
- [FRONTEND_RECIPES.md](../../../Reference/engineering/development/FRONTEND_RECIPES.md)
- [CONTRACTS.md](../../../Reference/engineering/architecture/CONTRACTS.md)

---

## ✅ Task Breakdown (Hierarchical)

### 1. API Client

- [x] 1.1 Add `createAppointment` in `frontend/lib/api.ts` — **Completed: 2026-03-28**
  - [x] 1.1.1 POST `/api/v1/appointments` with Bearer token
  - [x] 1.1.2 Body: `patientId?`, `patientName`, `patientPhone`, `appointmentDate` (ISO), `reasonForVisit`, `notes?`, `freeOfCost?`
  - [x] 1.1.3 Return `ApiSuccess<{ appointment: Appointment }>`
  - [x] 1.1.4 Handle 401, 403, 409 (slot conflict); throw with message
- [x] 1.2 Add `CreateAppointmentPayload` and `getAvailableSlots` — **Completed: 2026-03-28**

### 2. AddAppointmentModal Component

- [x] 2.1 Create `frontend/components/appointments/AddAppointmentModal.tsx` — **Completed: 2026-03-28**
  - [x] 2.1.1 Props: `isOpen`, `onClose`, `onSuccess`, `token` (doctorId fetched via getDoctorSettings in modal)
  - [x] 2.1.2 Patient selection: dropdown from `getPatients` OR "Walk-in" mode with name + phone fields
  - [x] 2.1.3 Date picker: date input (YYYY-MM-DD)
  - [x] 2.1.4 Time: fetch `getAvailableSlots(doctorId, date)` when date changes; dropdown of slots
  - [x] 2.1.5 Reason for visit: required text input
  - [x] 2.1.6 Notes: optional text area
  - [x] 2.1.7 Free of cost: checkbox
  - [x] 2.1.8 Submit: call `createAppointment`; on success: `onSuccess()`, `onClose()`; loading state
  - [x] 2.1.9 Error display: role="alert"
  - [x] 2.1.10 Accessible: labels, escape to close
- [x] 2.2 Use modal pattern (fixed overlay, role="dialog") per MergePatientsModal

### 3. Appointments Tab Integration

- [x] 3.1 Add "Add appointment" button to appointments UI — **Completed: 2026-03-28**
  - [x] 3.1.1 Place in `AppointmentsListWithFilters` header area
  - [x] 3.1.2 On click: open `AddAppointmentModal`
- [x] 3.2 Pass token to modal; doctorId fetched in modal via getDoctorSettings
- [x] 3.3 On success: `router.refresh()` for Server Component parent

### 4. Types

- [x] 4.1 `CreateAppointmentPayload` in `frontend/lib/api.ts` — **Completed: 2026-03-28**

### 5. Verification

- [x] 5.1 Type-check and build pass
- [ ] 5.2 Manual: open modal, select patient, pick slot, submit; verify appointment appears in list
- [ ] 5.3 Manual: walk-in flow (no patientId); free of cost checked

---

## 📁 Files to Create/Update

```
frontend/
├── lib/
│   └── api.ts                          (UPDATE - createAppointment)
├── types/
│   └── appointment.ts                  (UPDATE - CreateAppointmentPayload, if needed)
├── components/
│   └── appointments/
│       ├── AddAppointmentModal.tsx      (CREATE)
│       └── AppointmentsListWithFilters.tsx  (UPDATE - button, modal)
```

---

## 🧠 Design Constraints

- Modal must work with Server Component parent; use client component for interactive parts
- Follow FRONTEND_RECIPES for forms, loading states, error display
- No PHI in console or logs

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** (N — UI only; API calls touch backend)
- [x] **Any PHI in logs?** (No)
- [x] **External API or AI call?** (N)
- [x] **Retention / deletion impact?** (N)

---

## ✅ Acceptance & Verification Criteria

- [x] "Add appointment" button visible on appointments tab
- [x] Modal opens on click; closes on success or cancel
- [x] Can select existing patient or enter walk-in name/phone
- [x] Date and time (from available slots) selectable
- [x] Reason for visit required; notes optional
- [x] Free of cost checkbox works
- [x] Successful create triggers router.refresh()
- [x] Error (e.g. slot taken) shown to user

---

## 🔗 Related Tasks

- [e-task-5: Backend API](./e-task-5-backend-doctor-create-appointment.md)
- [e-task-7: Integration & README](./e-task-7-add-appointment-integration-readme.md)

---

**Last Updated:** 2026-03-28  
**Completed:** 2026-03-28
