# Task 3: Dashboard Layout & Navigation
## February 3, 2026 – Week 4: Doctor Dashboard Frontend Day 2–3

---

## 📋 Task Overview

Build the dashboard layout and navigation: a consistent shell (header, sidebar or nav, main content area) used by all dashboard pages. This is the **doctor dashboard shell** per BUSINESS_PLAN (doctor-first; appointments and patients as primary sections). Layout shows doctor context (e.g. user email or name from Supabase session) and provides links to Appointments and Patients (or placeholder). Mobile-responsive.

**Estimated Time:** 1.5–2 hours  
**Status:** ✅ **DONE**  
**Completed:** 2026-02-03

**Change Type:**
- [x] **New feature** — Add layout and nav components only
- [ ] **Update existing** — N/A

**Current State:** (MANDATORY - Check existing code first!)
- ✅ **What exists:** Dashboard shell: **`app/dashboard/layout.tsx`** (auth check + DashboardShell with user email); **`components/layout/Header.tsx`** (user display, LogoutButton, mobile menu toggle); **`components/layout/Sidebar.tsx`** (nav with Dashboard, Appointments, Patients; aria-current; responsive overlay on mobile); **`components/layout/DashboardShell.tsx`** (client wrapper with mobile menu state); **`app/dashboard/appointments/page.tsx`** and **`app/dashboard/patients/page.tsx`** (placeholders). Dashboard page no longer has inline LogoutButton.
- ❌ **What's missing:** Nothing for this task.
- ⚠️ **Notes:** Appointments/patients content are Task 4/5.

**Scope Guard:**
- Expected files touched: layout, nav/sidebar components, dashboard route structure
- Any expansion requires explicit approval

**Reference Documentation:**
- [FRONTEND_ARCHITECTURE.md](../../Reference/FRONTEND_ARCHITECTURE.md) - Layout structure; `components/layout/` for Header, Sidebar
- [FRONTEND_STANDARDS.md](../../Reference/FRONTEND_STANDARDS.md) - Tailwind, `cn()`, semantic HTML, accessibility
- [FRONTEND_RECIPES.md](../../Reference/FRONTEND_RECIPES.md) - F3 auth guard (existing); F5 `cn()` for classes
- [FRONTEND_COMPLIANCE.md](../../Reference/FRONTEND_COMPLIANCE.md) - No PII/PHI in DOM or logs; auth
- [DEFINITION_OF_DONE_FRONTEND.md](../../Reference/DEFINITION_OF_DONE_FRONTEND.md) - §1 Code/Structure, §3 Accessibility (focus, aria-current), §5 Security/Privacy
- [STANDARDS.md](../../Reference/STANDARDS.md) - TypeScript; structure
- [ARCHITECTURE.md](../../Reference/ARCHITECTURE.md) - Project structure
- [Monthly Plan Week 4](../../Monthly-plans/2025-01-09_1month_dev_plan.md) - Dashboard layout (Week 4: Dashboard & Launch Prep)

---

## ✅ Task Breakdown (Hierarchical)

### 1. Dashboard Layout
- [x] 1.1 **Update** dashboard layout (`app/dashboard/layout.tsx`): keep existing auth check; wrap `children` with header + nav + main area (shell).
- [x] 1.2 Layout uses **session from server Supabase client** (e.g. `getSession()`/`getUser()`); no React auth context required; user display can be server-rendered in layout or passed to Header to show current user (e.g. email from Supabase session); do not expose PHI beyond what’s needed for display (e.g. email is acceptable for "Logged in as …")
- [x] 1.3 Main content area renders `children`; responsive (stack on small screens, sidebar on larger)

### 2. Navigation
- [x] 2.1 Nav links: **Dashboard** (home → `/dashboard`), **Appointments** (`/dashboard/appointments`), **Patients** (`/dashboard/patients`). Create placeholder pages for appointments and patients if not present.
- [x] 2.2 **Active route styling** and **aria-current="page"** (or equivalent) so current page is clear and announced (FRONTEND_STANDARDS, DEFINITION_OF_DONE_FRONTEND §3).
- [x] 2.3 **Logout:** Reuse or relocate existing **LogoutButton** (Task 2) into header or nav; calls signOut and redirect to `/login` per Task 2.
- [x] 2.4 **Semantic HTML and accessibility:** Use **`<nav>`**, **`<header>`**, **`<main>`**; nav region has **aria-label** (e.g. "Main navigation"); sufficient focus visibility for interactive elements (FRONTEND_STANDARDS).

### 3. Responsive Behavior
- [x] 3.1 Mobile: collapsible menu or bottom nav if needed; main content full width
- [x] 3.2 Desktop: sidebar visible; main content sized appropriately

### 4. Verification
- [x] 4.1 Type-check and lint; no `any` for layout/nav types.
- [x] 4.2 Navigate between dashboard home, Appointments, Patients; verify layout, active state, and logout.
- [x] 4.3 **Accessibility:** Keyboard navigation and visible focus for nav links; active route indicated (e.g. aria-current). See DEFINITION_OF_DONE_FRONTEND §3.

---

## 📁 Files to Create/Update

```
frontend/
├── app/
│   └── dashboard/
│       ├── layout.tsx       (UPDATE - keep auth check; add shell: header + nav + main)
│       ├── page.tsx         (existing - dashboard home; remove inline LogoutButton when moved to Header)
│       ├── appointments/
│       │   └── page.tsx     (NEW - placeholder; "Appointments" link target; content in Task 4)
│       └── patients/
│           └── page.tsx     (NEW - placeholder; "Patients" link target; content in Task 5)
├── components/
│   ├── layout/              (per FRONTEND_ARCHITECTURE - Header, Sidebar, Footer)
│   │   ├── Header.tsx       (NEW - user display, logout; reuse/relocate LogoutButton)
│   │   └── Sidebar.tsx       (NEW - nav links with active state)
│   └── LogoutButton.tsx     (existing - relocate into Header or keep and use from Header)
```

**Existing Code Status:**
- ✅ Dashboard route(s) and auth protection (Task 2)
- ✅ Dashboard layout and nav — IMPLEMENTED (Header, Sidebar, DashboardShell; placeholder appointments/patients pages)

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Tailwind:** Use Tailwind for layout and responsiveness; use `cn()` for conditional classes (FRONTEND_STANDARDS, FRONTEND_RECIPES F5).
- **Semantic HTML:** Use `<main>`, `<nav>`, `<header>`; nav has aria-label; active link uses aria-current (FRONTEND_STANDARDS, DEFINITION_OF_DONE_FRONTEND §3).
- **Accessibility:** Sufficient contrast; visible focus states for nav and logout (FRONTEND_STANDARDS, FRONTEND_COMPLIANCE).
- **Privacy:** No PHI in page titles or client logs beyond minimal "Logged in as …" (email) if required (COMPLIANCE, FRONTEND_COMPLIANCE).
- **Scope:** Layout must not fetch business data (appointments/patients); that is Task 4/5.

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** (N – layout only; session for user display only)
- [x] **Any PHI in logs?** (MUST be No)
- [x] **External API or AI call?** (N)
- [x] **Retention / deletion impact?** (N)

---

## ✅ Acceptance & Verification Criteria

Task is complete **ONLY when:**
- [x] All dashboard pages share the same layout (header, nav, main)
- [x] Nav links to Dashboard, Appointments, Patients work; **active state visible and announced** (e.g. aria-current)
- [x] Logout works from layout (header or nav); layout is responsive
- [x] Semantic HTML and accessibility requirements met (nav, header, main; focus visible; aria-label)

**See also:** [DEFINITION_OF_DONE_FRONTEND.md](../../Reference/DEFINITION_OF_DONE_FRONTEND.md) (full checklist before marking done).

---

## 🔗 Related Tasks

- [Task 2: Supabase Auth & Login/Signup](./e-task-2-supabase-auth-and-login.md) – Prerequisite
- [Task 4: Appointments List & Detail](./e-task-4-appointments-list-and-detail.md) – Fills appointments route
- [Task 5: Patient Detail & API Connection](./e-task-5-patient-detail-and-api-connection.md) – Fills patients route

---

**Last Updated:** 2026-02-03  
**Related Learning:** `docs/Learning/2026-02-03/l-task-3-dashboard-layout-and-navigation.md` (create when implementing)  
**Reference:** [TASK_MANAGEMENT_GUIDE.md](../../task-management/TASK_MANAGEMENT_GUIDE.md)
