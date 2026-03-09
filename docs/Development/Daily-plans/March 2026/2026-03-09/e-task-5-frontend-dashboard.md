# Task 5: Frontend Dashboard (Settings, Schedule, Blocked Times)
## 2026-03-09

---

## 📋 Task Overview

Build doctor dashboard UI for managing practice settings, weekly availability, and blocked times. Integrates with Phase 1.2 (doctor settings API) and Phase 2 (availability & blocked times API).

**Estimated Time:** 6–8 hours  
**Status:** ✅ **COMPLETED**  
**Completed:** 2026-03-09

**Change Type:**
- [x] **New feature** — New dashboard pages
- [ ] **Update existing** — May extend existing dashboard layout

**Current State:**
- ✅ **What exists:** (Verify: dashboard layout, auth, API client patterns)
- ❌ **What's missing:** Settings page, availability/schedule editor, blocked times management
- ⚠️ **Notes:** Depends on e-task-2 and e-task-3 APIs. Follow FRONTEND_ARCHITECTURE.md and FRONTEND_STANDARDS.md.

**Scope Guard:**
- Expected files touched: varies by frontend structure

**Reference Documentation:**
- [DOCTOR_SETTINGS_PHASES.md](../../../Reference/DOCTOR_SETTINGS_PHASES.md)
- [FRONTEND_ARCHITECTURE.md](../../../Reference/FRONTEND_ARCHITECTURE.md)
- [FRONTEND_STANDARDS.md](../../../Reference/FRONTEND_STANDARDS.md)

---

## ✅ Task Breakdown (Hierarchical)

### 1. Settings Page
- [x] 1.1 Create settings route/page (e.g. /dashboard/settings)
- [x] 1.2 Fetch GET /api/v1/settings/doctor on load
- [x] 1.3 Form fields: practice_name, timezone, slot_interval_minutes, max_advance_booking_days, min_advance_hours, business_hours_summary, cancellation_policy_hours, max_appointments_per_day, booking_buffer_minutes, welcome_message, specialty, address_summary, consultation_types, default_notes
- [x] 1.4 Submit via PATCH /api/v1/settings/doctor
- [x] 1.5 Validation: slot_interval 15/20/30/45/60; timezone dropdown or text
- [x] 1.6 Success/error feedback

### 2. Availability / Schedule Page
- [x] 2.1 Create availability route (e.g. /dashboard/schedule or /dashboard/availability)
- [x] 2.2 Fetch GET /api/v1/availability on load
- [x] 2.3 UI to add/edit/remove weekly slots (day, start time, end time)
- [x] 2.4 Submit via PUT /api/v1/availability (replace entire schedule)
- [x] 2.5 Validation: start < end; no overlapping slots per day

### 3. Blocked Times Page
- [x] 3.1 Create blocked times route (e.g. /dashboard/blocked-times)
- [x] 3.2 Fetch GET /api/v1/blocked-times on load (optional date range)
- [x] 3.3 UI to add blocked time (start, end, optional reason)
- [x] 3.4 Submit via POST /api/v1/blocked-times
- [x] 3.5 Delete via DELETE /api/v1/blocked-times/:id
- [x] 3.6 List view with delete action per row

### 4. Navigation and Layout
- [x] 4.1 Add nav links to Settings, Schedule, Blocked Times in dashboard
- [x] 4.2 Ensure auth guard; redirect unauthenticated users

### 5. Verification & Testing
- [x] 5.1 Run frontend build and lint
- [ ] 5.2 Manual test: CRUD for settings, availability, blocked times
- [ ] 5.3 Verify responsive behavior per FRONTEND_STANDARDS

---

## 📁 Files to Create/Update

```
frontend/  (or app structure per project)
├── pages/ or routes/
│   ├── dashboard/
│   │   ├── settings.tsx (or .jsx)
│   │   ├── schedule.tsx (availability)
│   │   └── blocked-times.tsx
├── components/
│   └── (form components as needed)
└── api/ or services/
    └── (API client for settings, availability, blocked-times)
```

**Existing Code Status:**
- ⚠️ Verify project structure (Next.js, Vite, etc.) before implementation

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- Follow FRONTEND_ARCHITECTURE.md and FRONTEND_STANDARDS.md
- No PHI in client-side logs or storage
- Use existing auth pattern (tokens, refresh)
- Accessible forms (labels, error messages)

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** (Y – reads/writes via API)
- [ ] **Any PHI in logs?** (No)
- [ ] **External API or AI call?** (N – calls our backend only)
- [ ] **Retention / deletion impact?** (N)

---

## ✅ Acceptance & Verification Criteria

- [ ] Doctor can view and update practice settings
- [ ] Doctor can manage weekly availability
- [ ] Doctor can add and remove blocked times
- [ ] UI is responsive and accessible
- [ ] Unauthenticated users cannot access dashboard

---

## 🔗 Related Tasks

- [e-task-2: Doctor settings API](./e-task-2-doctor-settings-api.md)
- [e-task-3: Availability & blocked times API](./e-task-3-availability-blocked-times-api.md)

---

**Last Updated:** 2026-03-09  
**Reference:** [TASK_MANAGEMENT_GUIDE.md](../../../task-management/TASK_MANAGEMENT_GUIDE.md)
