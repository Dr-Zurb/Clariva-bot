# Task 7: Practice Setup UI Refinement (Cards, Nested Sidebar, Breadcrumb)
## 2026-03-09

---

## 📋 Task Overview

Refine the Practice Setup UI based on user feedback: (1) collapsible Settings and expandable Practice Setup in the sidebar, (2) remove Practice Setup | Integrations tabs from the main screen, (3) Practice Setup landing with 4 icon+label cards and short descriptions, (4) separate pages for each section with breadcrumb and back button, (5) Availability page contains both Weekly Slots and Blocked Times in two sections (single scroll).

**Rationale:** Improves navigation hierarchy, reduces clutter, and makes each section discoverable via cards. Blocked times lives under Availability (no separate sidebar item).

**Estimated Time:** 6–8 hours  
**Status:** ✅ **COMPLETED**  
**Completed:** 2026-03-09

**Change Type:**
- [ ] **New feature** — Add code only (no change to existing behavior)
- [x] **Update existing** — Change or remove existing code; follow [CODE_CHANGE_RULES.md](../../../task-management/CODE_CHANGE_RULES.md)

**Current State:**
- ✅ **What exists:** Collapsible Settings and expandable Practice Setup in sidebar. Settings layout: no tabs; Breadcrumb. Practice Setup landing: 4 icon+label cards. Section pages: Practice Info, Booking Rules, Bot Messages, Availability (with Weekly Slots + Blocked Times). Back button on section pages.
- ✅ **Completed:** All e-task-7 items implemented.
- ⚠️ **Notes:** APIs unchanged. Only frontend structure and components changed.

**Scope Guard:**
- Expected files touched: frontend Sidebar, settings layout, practice-setup routes, new section pages
- No backend changes

**Reference Documentation:**
- [PRACTICE_SETUP_UI.md](../../../Reference/PRACTICE_SETUP_UI.md)
- [FRONTEND_ARCHITECTURE.md](../../../Reference/FRONTEND_ARCHITECTURE.md)
- [FRONTEND_STANDARDS.md](../../../Reference/FRONTEND_STANDARDS.md)

---

## ✅ Task Breakdown (Hierarchical)

### 1. Sidebar: Collapsible Settings and Expandable Practice Setup
- [x] 1.1 Make Settings collapsible — click toggles expand/collapse; shows Practice Setup and Integrations when expanded
- [x] 1.2 Make Practice Setup expandable — when expanded, shows Practice Info, Booking Rules, Bot Messages, Availability
- [x] 1.3 Auto-expand when active — Settings expanded when pathname starts with /dashboard/settings; Practice Setup expanded when on any practice-setup route
- [x] 1.4 Nested structure:
  ```
  Settings (collapsible)
  ├── Practice Setup (expandable) → /dashboard/settings/practice-setup
  │   ├── Practice Info → /dashboard/settings/practice-setup/practice-info
  │   ├── Booking Rules → /dashboard/settings/practice-setup/booking-rules
  │   ├── Bot Messages → /dashboard/settings/practice-setup/bot-messages
  │   └── Availability → /dashboard/settings/practice-setup/availability
  └── Integrations → /dashboard/settings/integrations
  ```
- [x] 1.5 Indent sub-items for visual hierarchy

### 2. Remove Main-Screen Tabs
- [x] 2.1 Remove Practice Setup | Integrations tab bar from `frontend/app/dashboard/settings/layout.tsx`
- [x] 2.2 Settings layout renders only children (no tabs); navigation via sidebar only

### 3. Practice Setup Landing Page (4 Cards)
- [x] 3.1 Replace current Practice Setup page with landing page showing 4 cards
- [x] 3.2 Each card: icon + label + short description; links to respective section page
- [x] 3.3 Cards:
  - **Practice Info** — "Practice name, location, specialty, and consultation types"
  - **Booking Rules** — "Slot length, advance booking limits, cancellation policy"
  - **Bot Messages** — "Welcome message and default appointment notes"
  - **Availability** — "Weekly schedule and blocked times when you're unavailable"
- [x] 3.4 Use icon+label style (e.g. Lucide React or similar icons)

### 4. Section Pages (Practice Info, Booking Rules, Bot Messages)
- [x] 4.1 Create `/dashboard/settings/practice-setup/practice-info/page.tsx` — fields: practice_name, timezone, specialty, address_summary, consultation_types; PATCH settings
- [x] 4.2 Create `/dashboard/settings/practice-setup/booking-rules/page.tsx` — fields: slot_interval_minutes, max_advance_booking_days, min_advance_hours, business_hours_summary, cancellation_policy_hours, max_appointments_per_day, booking_buffer_minutes; PATCH settings
- [x] 4.3 Create `/dashboard/settings/practice-setup/bot-messages/page.tsx` — fields: welcome_message, default_notes; PATCH settings
- [x] 4.4 Extract form logic from current `practice-setup/page.tsx` into these pages

### 5. Availability Page (Two Sections, Single Scroll)
- [x] 5.1 Create `/dashboard/settings/practice-setup/availability/page.tsx`
- [x] 5.2 Section 1: Weekly Slots — add/edit/remove; PUT /api/v1/availability
- [x] 5.3 Section 2: Blocked Times — add/list/remove; GET/POST/DELETE /api/v1/blocked-times
- [x] 5.4 Single scroll; no separate Blocked Times sidebar item

### 6. Breadcrumb and Back Button
- [x] 6.1 Add Breadcrumb component — e.g. "Settings > Practice Setup" or "Settings > Practice Setup > Practice Info"
- [x] 6.2 Add Back button on each section page — navigates to Practice Setup landing (or previous page)
- [x] 6.3 Breadcrumb and Back in settings layout or per-page

### 7. Refactor and Cleanup
- [x] 7.1 Remove or refactor current `practice-setup/page.tsx` (becomes landing with cards)
- [x] 7.2 Ensure `/dashboard/settings` redirects to `/dashboard/settings/practice-setup`
- [x] 7.3 Update any internal links

### 8. Verification & Testing
- [x] 8.1 Run frontend build and lint
- [ ] 8.2 Manual test: collapsible sidebar, cards, section pages, breadcrumb, back button
- [ ] 8.3 Verify responsive behavior and accessibility

---

## 📁 Files to Create/Update

```
frontend/
├── app/dashboard/settings/
│   ├── layout.tsx                    # UPDATE: remove tab bar; add breadcrumb
│   ├── page.tsx                      # UNCHANGED: redirect to practice-setup
│   ├── practice-setup/
│   │   ├── page.tsx                  # REPLACE: landing with 4 cards
│   │   ├── practice-info/
│   │   │   └── page.tsx              # NEW
│   │   ├── booking-rules/
│   │   │   └── page.tsx              # NEW
│   │   ├── bot-messages/
│   │   │   └── page.tsx              # NEW
│   │   └── availability/
│   │       └── page.tsx              # NEW (slots + blocked times)
│   └── integrations/
│       └── page.tsx                  # UNCHANGED
├── components/
│   ├── layout/
│   │   ├── Sidebar.tsx               # UPDATE: collapsible Settings, expandable Practice Setup
│   │   └── Breadcrumb.tsx            # NEW (optional)
│   └── settings/
│       └── PracticeSetupCard.tsx     # NEW (optional, for card reuse)
docs/
└── Reference/
    └── PRACTICE_SETUP_UI.md          # UPDATE: new structure
```

**Existing Code Status:**
- ✅ `frontend/app/dashboard/settings/layout.tsx` — EXISTS (has Practice Setup | Integrations tabs)
- ✅ `frontend/app/dashboard/settings/practice-setup/page.tsx` — EXISTS (single long form)
- ✅ `frontend/app/dashboard/settings/integrations/page.tsx` — EXISTS
- ✅ `frontend/components/layout/Sidebar.tsx` — EXISTS (flat Settings sub-nav)

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- Follow FRONTEND_ARCHITECTURE.md and FRONTEND_STANDARDS.md
- No PHI in client-side logs or storage
- Collapsible/expandable sidebar: keyboard-accessible (Enter/Space to toggle), aria-expanded, aria-controls
- Cards: accessible (focusable, clear labels)
- Breadcrumb: semantic nav, aria-current for current page

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** (Y – reads/writes via existing APIs)
- [x] **Any PHI in logs?** (No)
- [x] **External API or AI call?** (N)
- [x] **Retention / deletion impact?** (N)

---

## ✅ Acceptance & Verification Criteria

- [x] Settings is collapsible in sidebar; Practice Setup is expandable with 4 sub-items
- [x] No Practice Setup | Integrations tabs in main content area
- [x] Practice Setup landing shows 4 icon+label cards with short descriptions
- [x] Practice Info, Booking Rules, Bot Messages, Availability each have dedicated pages
- [x] Availability page contains Weekly Slots and Blocked Times in two sections (single scroll)
- [x] Breadcrumb and Back button on section pages
- [ ] UI is responsive and accessible (manual verification)

---

## 🔗 Related Tasks

- [e-task-6: Practice Setup UI consolidation](./e-task-6-practice-setup-consolidation.md) — predecessor
- [e-task-5: Frontend dashboard](./e-task-5-frontend-dashboard.md)

---

**Last Updated:** 2026-03-09  
**Reference:** [TASK_MANAGEMENT_GUIDE.md](../../../task-management/TASK_MANAGEMENT_GUIDE.md)
