# Task 6: Practice Setup UI Consolidation
## 2026-03-09

---

## 📋 Task Overview

Consolidate doctor/bot configuration into a single **Practice Setup** page. Remove separate Schedule and Blocked Times nav items and pages. All doctor-to-bot configuration (practice info, availability, blocked times, booking rules, bot messages) lives in one place under one nav item.

**Rationale:** The doctor configures how the bot communicates with patients. This is a single conceptual flow—"how my practice works"—not separate concerns. Consolidation improves discoverability and reduces navigation clutter.

**Estimated Time:** 4–6 hours  
**Status:** ✅ **COMPLETED**  
**Completed:** 2026-03-09

**Change Type:**
- [ ] **New feature** — Add code only (no change to existing behavior)
- [x] **Update existing** — Change or remove existing code; follow [CODE_CHANGE_RULES.md](../../../task-management/CODE_CHANGE_RULES.md)

**Current State:**
- ✅ **What exists:** e-task-5 frontend: `/dashboard/settings` (DoctorSettingsForm + Instagram), `/dashboard/schedule` (availability), `/dashboard/blocked-times` (blocked times). Sidebar: Dashboard, Appointments, Patients, Schedule, Blocked Times, Settings.
- ❌ **What's missing:** Single consolidated Practice Setup page; removal of Schedule and Blocked Times as separate routes.
- ⚠️ **Notes:** APIs unchanged (GET/PATCH settings, GET/PUT availability, GET/POST/DELETE blocked-times). Only frontend structure changes.

**Scope Guard:**
- Expected files touched: frontend routes, components, Sidebar; docs
- No backend changes

**Reference Documentation:**
- [DOCTOR_SETTINGS_PHASES.md](../../../Reference/DOCTOR_SETTINGS_PHASES.md)
- [PRACTICE_SETUP_UI.md](../../../Reference/PRACTICE_SETUP_UI.md) (created by this task)
- [FRONTEND_ARCHITECTURE.md](../../../Reference/FRONTEND_ARCHITECTURE.md)
- [FRONTEND_STANDARDS.md](../../../Reference/FRONTEND_STANDARDS.md)

---

## ✅ Task Breakdown (Hierarchical)

### 1. Create Practice Setup Page
- [x] 1.1 Create route `/dashboard/practice-setup` (or `/dashboard/personalize`—choose one; recommend `practice-setup`)
- [x] 1.2 Single page with long scroll and clear section headings
- [ ] 1.3 Section order: Practice Info → Availability → Blocked Times → Booking Rules → Bot Messages
  - [x] 1.3.1 **Practice Info:** practice_name, specialty, address_summary, consultation_types, timezone
  - [x] 1.3.2 **Availability:** weekly slots (reuse logic from current schedule page)
  - [x] 1.3.3 **Blocked Times:** add/list/remove (reuse logic from current blocked-times page)
  - [x] 1.3.4 **Booking Rules:** slot_interval_minutes, max_advance_booking_days, min_advance_hours, business_hours_summary, cancellation_policy_hours, max_appointments_per_day, booking_buffer_minutes
  - [x] 1.3.5 **Bot Messages:** welcome_message, default_notes
- [x] 1.4 Fetch all data on load (GET settings, GET availability, GET blocked-times)
- [x] 1.5 Save behavior: per-section save (Practice Info+Rules+Bot; Availability; Blocked add/delete)

### 2. Update Navigation
- [x] 2.1 Add nav link "Practice Setup" to Sidebar
- [x] 2.2 Remove nav links: Schedule, Blocked Times
- [x] 2.3 Keep Settings for Instagram (Option A)
- [x] 2.4 **Decision:** Instagram placement — Option A (keep Settings with only Instagram)

### 3. Remove Obsolete Routes
- [x] 3.1 Remove `/dashboard/schedule` route and page
- [x] 3.2 Remove `/dashboard/blocked-times` route and page
- [x] 3.3 Logic inlined into Practice Setup page

### 4. Update Settings Page
- [x] 4.1 Remove DoctorSettingsForm from Settings; Settings shows only Instagram

### 5. Terminology
- [x] 5.1 Use consistent label: **"Practice Setup"** across nav and page title
- [x] 5.2 Document chosen term in PRACTICE_SETUP_UI.md

### 6. Verification & Testing
- [x] 6.1 Run frontend build and lint
- [ ] 6.2 Manual test: all sections load, save correctly; no broken links
- [ ] 6.3 Verify responsive behavior per FRONTEND_STANDARDS
- [x] 6.4 Verify no orphaned routes (Schedule, Blocked Times removed)

---

## 📁 Files to Create/Update

```
frontend/
├── app/dashboard/
│   ├── practice-setup/
│   │   └── page.tsx          # NEW: consolidated page
│   ├── schedule/
│   │   └── page.tsx          # REMOVE
│   ├── blocked-times/
│   │   └── page.tsx          # REMOVE
│   └── settings/
│       └── page.tsx          # UPDATE: remove DoctorSettingsForm if Option A
├── components/
│   ├── settings/
│   │   ├── DoctorSettingsForm.tsx   # MOVE/REFACTOR into Practice Setup sections
│   │   ├── AvailabilityEditor.tsx   # EXTRACT from schedule page (optional)
│   │   └── BlockedTimesEditor.tsx   # EXTRACT from blocked-times page (optional)
│   └── layout/
│       └── Sidebar.tsx       # UPDATE: nav items
docs/
└── Reference/
    └── PRACTICE_SETUP_UI.md  # NEW: UI structure reference
```

**Existing Code Status:**
- ✅ `frontend/app/dashboard/settings/page.tsx` — EXISTS (DoctorSettingsForm + Instagram)
- ✅ `frontend/app/dashboard/schedule/page.tsx` — EXISTS (availability editor)
- ✅ `frontend/app/dashboard/blocked-times/page.tsx` — EXISTS (blocked times list/add/delete)
- ✅ `frontend/components/settings/DoctorSettingsForm.tsx` — EXISTS (14 fields)
- ✅ `frontend/components/layout/Sidebar.tsx` — EXISTS (6 nav items)

**When updating existing code:**
- [ ] Audit current implementation (routes, components, Sidebar)
- [ ] Map desired change to concrete code changes (add practice-setup, remove schedule/blocked-times, update Sidebar)
- [ ] Remove obsolete routes and dead code
- [ ] Update any internal links or redirects

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- Follow FRONTEND_ARCHITECTURE.md and FRONTEND_STANDARDS.md
- No PHI in client-side logs or storage
- Use existing auth pattern (tokens, refresh)
- Accessible forms (labels, error messages, section headings)
- Collapsible sections should be keyboard-accessible and screen-reader friendly

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** (Y – reads/writes via existing APIs; no new APIs)
- [ ] **Any PHI in logs?** (No)
- [ ] **External API or AI call?** (N – calls our backend only)
- [ ] **Retention / deletion impact?** (N)

---

## ✅ Acceptance & Verification Criteria

- [ ] Single "Practice Setup" (or "Personalize") nav item
- [ ] All doctor/bot config in one page: Practice Info, Availability, Blocked Times, Booking Rules, Bot Messages
- [ ] Schedule and Blocked Times no longer appear as separate nav items or routes
- [ ] Doctor can view and update all settings from Practice Setup
- [ ] UI is responsive and accessible
- [ ] Unauthenticated users cannot access dashboard (existing auth guard)

---

## 🔗 Related Tasks

- [e-task-5: Frontend dashboard](./e-task-5-frontend-dashboard.md) — superseded by this consolidation
- [e-task-2: Doctor settings API](./e-task-2-doctor-settings-api.md)
- [e-task-3: Availability & blocked times API](./e-task-3-availability-blocked-times-api.md)

---

**Last Updated:** 2026-03-09  
**Reference:** [TASK_MANAGEMENT_GUIDE.md](../../../task-management/TASK_MANAGEMENT_GUIDE.md)
