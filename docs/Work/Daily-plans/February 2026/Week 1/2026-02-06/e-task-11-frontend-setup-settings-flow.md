# Task 11: Frontend Setup/Settings flow
## 2026-02-06 - Must-have 2: Doctor Setup

---

## 📋 Task Overview

Implement the single Setup or Settings flow for doctors: Profile → Availability → Appointment methods & fees → Services. Can be wizard (post-signup or first-time) or tabbed settings page; all sections editable after first run. Load and save via backend APIs from e-task-7, e-task-8, e-task-9, e-task-10. Validation and error handling per FRONTEND_STANDARDS; loading and success/error states.

**Estimated Time:** 3–4 hours  
**Status:** ⏳ **PENDING**  
**Completed:** —

**Change Type:**
- [x] **New feature**
- [ ] **Update existing**

**Current State:**
- ✅ **What exists:** Dashboard layout; appointments and patients pages; no setup or settings pages; backend APIs for profile, availability, blocked_times, appointment settings, services (after e-tasks 7–10).
- ❌ **What's missing:** Setup/settings route(s); components ProfileForm, AvailabilityForm, MethodsFeesForm, ServicesForm (or single multi-section form); API client for all four areas; navigation between sections (tabs or wizard steps).
- ⚠️ **Notes:** Follow FRONTEND_ARCHITECTURE and FRONTEND_RECIPES; use typed API client; auth guard for entire flow.

**Scope Guard:** Expected files touched: ≤ 10

**Reference Documentation:**
- [FRONTEND_ARCHITECTURE.md](../../Reference/engineering/architecture/FRONTEND_ARCHITECTURE.md) - App structure, data flow
- [FRONTEND_STANDARDS.md](../../Reference/engineering/development/FRONTEND_STANDARDS.md) - TypeScript, API, a11y
- [FRONTEND_RECIPES.md](../../Reference/engineering/development/FRONTEND_RECIPES.md) - API client, forms, loading/error
- [DEFINITION_OF_DONE_FRONTEND.md](../../Reference/engineering/development/DEFINITION_OF_DONE_FRONTEND.md) - Completion checklist

---

## ✅ Task Breakdown (Hierarchical)

### 1. Route and layout
- [ ] 1.1 Add route (e.g. `dashboard/setup/page.tsx` or `dashboard/settings/page.tsx`) with auth guard; optional: redirect to setup if profile incomplete (product decision)
- [ ] 1.2 Layout: tabs (Profile | Availability | Methods & fees | Services) or wizard steps with Next/Back; highlight current section
- [ ] 1.3 Sidebar or dashboard nav: link to “Setup” or “Settings”

### 2. Profile section
- [ ] 2.1 Component (e.g. ProfileForm): fields display_name, practice_name, phone, address, timezone (optional); load GET /api/v1/profile on mount; save PUT /api/v1/profile on submit
- [ ] 2.2 Client-side validation (non-empty name; optional phone format); show API errors; loading and success state
- [ ] 2.3 No PII in console; use API client with auth

### 3. Availability section
- [ ] 3.1 Component (e.g. AvailabilityForm): load GET /api/v1/availability; display weekly slots (e.g. table or list by day); allow add/edit/delete rows (day_of_week, start_time, end_time); save PUT /api/v1/availability with full array
- [ ] 3.2 Optional: blocked times sub-section or link to separate page; load GET /api/v1/blocked-times; add POST; delete DELETE /api/v1/blocked-times/:id
- [ ] 3.3 Time inputs and validation (start < end); timezone display from profile if available
- [ ] 3.4 Loading and error states

### 4. Appointment methods & fees section
- [ ] 4.1 Component (e.g. MethodsFeesForm): load GET /api/v1/settings/appointment; show methods (text, voice, video) with checkbox and fee input per method; currency selector; save PUT /api/v1/settings/appointment
- [ ] 4.2 Validate: at least one method; non-negative fees; currency required
- [ ] 4.3 Loading and error states

### 5. Services section
- [ ] 5.1 Component (e.g. ServicesForm): load GET /api/v1/services; list services with add/edit/delete; inline or modal for name (and optional allowed_methods); create POST, update PATCH, delete DELETE
- [ ] 5.2 Validate: name non-empty; duplicate names optional to allow
- [ ] 5.3 Loading and error states

### 6. API client and types
- [ ] 6.1 Add typed functions: getProfile, updateProfile; getAvailability, putAvailability; getBlockedTimes, createBlockedTime, deleteBlockedTime; getAppointmentSettings, updateAppointmentSettings; listServices, createService, updateService, deleteService
- [ ] 6.2 Frontend types for profile, availability, blocked_times, settings, service (align with backend contracts)
- [ ] 6.3 Handle 401 (redirect login), 4xx/5xx with user-visible message

### 7. Verification
- [ ] 7.1 Manual: complete each section; save and reload; data persists
- [ ] 7.2 Type-check and lint; a11y basics per DEFINITION_OF_DONE_FRONTEND
- [ ] 7.3 No PII in logs or network tab (sanitize if needed)

---

## 📁 Files to Create/Update

```
frontend/
├── app/
│   └── dashboard/
│       ├── setup/
│       │   └── page.tsx               (NEW - wizard or tabbed container)
│       └── settings/
│           └── page.tsx               (NEW - alternative: single settings with sections)
├── components/
│   └── setup/
│       ├── ProfileForm.tsx            (NEW)
│       ├── AvailabilityForm.tsx       (NEW)
│       ├── MethodsFeesForm.tsx        (NEW)
│       └── ServicesForm.tsx           (NEW)
├── lib/
│   └── api.ts                          (UPDATE - add profile, availability, settings, services APIs)
└── types/
    └── setup.ts                       (NEW) or extend existing types
```

**Existing Code Status:**
- ✅ Dashboard layout and auth - EXISTS
- ❌ Setup/settings page and forms - MISSING
- ❌ API client for profile, availability, settings, services - MISSING (backend added in e-tasks 7–10)

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- All data from backend APIs; no local-only state for persistence.
- Use existing auth (Supabase session) for all API calls.
- Accessible forms (labels, focus, errors); loading and error states per FRONTEND_STANDARDS.

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** (Y – read/write via API) → [ ] **RLS verified?** (Y – backend enforces)
- [ ] **Any PHI in logs?** (MUST be No; practice name/phone are administrative—avoid logging)
- [ ] **External API or AI call?** (N)
- [ ] **Retention / deletion impact?** (N)

---

## ✅ Acceptance & Verification Criteria

- [ ] Doctor can open Setup/Settings and see Profile, Availability, Methods & fees, Services.
- [ ] Each section loads from API and saves correctly; data persists after refresh.
- [ ] Validation and error handling in place; loading states; a11y basics.
- [ ] Type-check and lint pass.

---

## 🔗 Related Tasks

- [e-task-7: Doctor profile backend](./e-task-7-doctor-profile-backend.md)
- [e-task-8: Availability & blocked_times API](./e-task-8-availability-blocked-times-api.md)
- [e-task-9: Appointment methods & fees](./e-task-9-appointment-methods-and-fees.md)
- [e-task-10: Services table & CRUD API](./e-task-10-services-table-and-crud-api.md)

---

**Last Updated:** 2026-02-06  
**Reference:** [TASK_MANAGEMENT_GUIDE.md](../../task-management/TASK_MANAGEMENT_GUIDE.md)
