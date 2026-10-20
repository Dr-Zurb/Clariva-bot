# Task soc-01: Social row and the three empty tabs

## 📋 Task Overview

Add **Social** as the last clinic sidebar row. The page has three tabs and nothing saved.

**Program / Phase:** social-assist · Phase 1 (shell)
**Batch:** [`plan-p1-social-assist-shell-batch.md`](../plan-p1-social-assist-shell-batch.md)
**Execution order:** [`EXECUTION-ORDER-p1-social-assist-shell.md`](./EXECUTION-ORDER-p1-social-assist-shell.md)
**Estimated Time:** 2 hours
**Status:** ✅ **COMPLETED** — **Completed: 2026-10-15**

**Change Type:**
- [x] **New feature** — the route does not exist
- [x] **Update existing** — one new item in `mainNavItems`

**Current State:**
- ✅ **What exists:** `frontend/components/layout/Sidebar.tsx` nav Today, OPD, Patients, Insights, Alerts. Dashboard pages use `requireDashboardAuth`. Insights page is the nearest pattern.
- ✅ **What's missing:** Nothing for this task. The signed-in pass is `soc-02`, recorded 2026-10-15.
- ⚠️ **Notes:** Do not add Social to `DAILY_DRIVER_SURFACES` in `frontend/lib/nav-perf/nav-timing.ts`.

**Scope Guard:**
- Expected files touched: ≤ 4
- Do not change the five existing nav destinations, Integrations, or the DM reply

**Reference Documentation:**
- [FRONTEND_STANDARDS.md](../../../../../../../Reference/engineering/development/FRONTEND_STANDARDS.md)
- [v1.md](../../../../../../Product%20plans/social-assist/v1.md) DL-1, DL-2, DL-15

---

## 🌍 Global Safety Gate

- [x] **Data touched?** N
- [x] **Any PHI in logs?** No
- [x] **External API or AI call?** N
- [x] **Retention / deletion impact?** N

---

## ✅ Task Breakdown

### 1. Sidebar
- [x] ✅ 1.1 Add Social after Alerts, linking to `/dashboard/social` - **Completed: 2026-10-11**
- [x] ✅ 1.2 Leave Today, OPD, Patients, Insights, Alerts, and Getting started as they are - **Completed: 2026-10-11**

### 2. Page
- [x] ✅ 2.1 Authenticated page at `/dashboard/social` with the title Social - **Completed: 2026-10-11**
- [x] ✅ 2.2 Tabs Content, Schedule, and Analytics, each with an empty state and no cards - **Completed: 2026-10-11**
- [x] ✅ 2.3 Content is the tab that opens first - **Completed: 2026-10-11**

### 3. Verification
- [x] ✅ 3.1 Typecheck and lint the touched files - **Completed: 2026-10-11** (eslint clean; vitest `SocialClient.test.tsx` plus the existing sidebar suites; `tsc` reports no errors in these files. The repo typecheck still has existing errors elsewhere.)
- [x] ✅ 3.2 In the browser: Social is last, the three tabs switch, and Today still opens - **Completed: 2026-10-15**

---

## 📁 Files to Create/Update

- ⚠️ `frontend/components/layout/Sidebar.tsx` — add one nav item
- ❌ `frontend/app/dashboard/social/page.tsx` — MISSING

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- Same shell as the other dashboard pages. No second sidebar and no Practice / Social switch.
- No fetch, no database, no Instagram call.
- Empty states name the tab. They do not mention AI, reach, or campaigns.

---

## 📝 Notes

Instagram connect stays at `/dashboard/settings/integrations`. This page does not link there yet.

---

**Last Updated:** 2026-10-15
**Completed:** 2026-10-15
**Pattern:** existing dashboard page + `mainNavItems`
**Reference:** `process/TASK_MANAGEMENT_GUIDE.md`
