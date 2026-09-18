# Task ckd-02: Hide app Header + collapse sidebar on cockpit

**Program / Phase:** cockpit-density · Phase 1  
**Status:** done — 2026-08-31  
**Change Type:** Update existing

**Current State:**
- ✅ `Header` already knows `isOnCockpit` (hides Start consult only)
- ✅ `liveFocus` collapses sidebar during `state === "live"` only
- ❌ App header (56px) always shows on appointment-detail
- ❌ Sidebar stays expanded for lobby / wrap-up / ended

**Design Constraints:**
- CKD-DL-4: hide Header + collapse sidebar on `/dashboard/appointments/:id`.
- `/dashboard/appointments` (list) and other dashboard routes unchanged.
- Cmd-K still works (listener is on `DashboardShell`).
- Do not write `clariva.sidebar.collapsed` — same as live-focus.

**Acceptance:**
- Appointment-detail: no app Header in the DOM; sidebar is icon-rail.
- Appointment list: Header + expanded/persisted sidebar unchanged.
