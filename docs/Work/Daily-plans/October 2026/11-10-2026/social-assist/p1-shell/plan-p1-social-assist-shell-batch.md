# Plan p1 — Social: the shell

## 11 Oct 2026 — Batch `social-assist` / `p1-shell` (`soc-01..02`)

> **Status:** In progress 2026-10-11. `soc-01` is in the app. The logged-in browser gate (`soc-02`) is still open.
> **Product plan:** [`v1.md`](../../../../../Product%20plans/social-assist/v1.md) (DL-1, DL-2, DL-15)
> **Program:** [`../README.md`](../README.md) · Prefix `soc`
> **Exec order:** [`Tasks/EXECUTION-ORDER-p1-social-assist-shell.md`](./Tasks/EXECUTION-ORDER-p1-social-assist-shell.md)

---

## Why this phase

The clinic sidebar is the day: Today, OPD, Patients, Insights, Alerts. Social is one more row under Alerts, and an empty page with three tabs. Nothing is saved yet.

---

## Decision lock

DL-1…15 are locked in the product plan. This phase uses DL-1 (one row, under Alerts), DL-2 (Content, Schedule, Analytics), and DL-15 (Instagram connect stays on Integrations). The board, the clock, and the visit count wait.

---

## What already exists (inspected 2026-10-11)

- `frontend/components/layout/Sidebar.tsx` `mainNavItems`: Today `/dashboard`, OPD `/dashboard/opd-today`, Patients `/dashboard/patients-v2`, Insights `/dashboard/insights`, Alerts `/dashboard/alerts`. Getting started is a separate list above that.
- Dashboard pages live under `frontend/app/dashboard/`. Insights is `frontend/app/dashboard/insights/page.tsx` and uses `requireDashboardAuth`.
- Integrations, including Instagram connect, is `frontend/app/dashboard/settings/integrations/page.tsx`.
- `frontend/lib/nav-perf/nav-timing.ts` measures Today, OPD, and Patients. Social is not a daily-driver surface.

---

## Scope Guard — DO NOT TOUCH

- Today, OPD, Patients, Insights, Alerts, Getting started, the profile menu, Integrations.
- The DM reply and the Meta review.
- Any database, any API, any file upload.
- Nav-perf budgets. Do not add Social to `DAILY_DRIVER_SURFACES`.

---

## Tasks

| ID | Title | Size | Depends on |
|----|-------|------|------------|
| [`soc-01`](./Tasks/task-soc-01-social-shell.md) | Social row and the three empty tabs | S | — |
| [`soc-02`](./Tasks/task-soc-02-phase-1-gate.md) | Phase 1 gate | S | soc-01 |

---

## Acceptance gate

- [x] The sidebar reads Today, OPD, Patients, Insights, Alerts, Social. Social is last. Social is the selected row on `/dashboard/social`. — 2026-10-15
- [x] The page shows the tabs Content, Schedule, and Analytics. Content is first. The board now holds cards. — 2026-10-15
- [x] Today, OPD, Patients, Insights, and Alerts still open. — 2026-10-15
- [x] Instagram connect is still only under Settings → Integrations. — 2026-10-15
- [x] This walk added no API and no migration. — 2026-10-15
