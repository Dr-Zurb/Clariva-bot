# 14 May 2026 — Daily plans

One batch landed (or is landing) on this day, filed in a self-contained subfolder with its own plan + `Tasks/` tree.

| Folder | Batch | Status | What it covers |
|---|---|---|---|
| [`sidebar-restructure/`](./sidebar-restructure/) | **Sidebar restructure** (sr-01 … sr-04) | Drafted 2026-05-14 (active) | Tightens primary navigation: `OPD queue` → `OPD`, drops `Appointments` from sidebar (page kept reachable for back-arrows), `Match reviews` → `Booking review` (label + route + redirect), `Notifications` → `Alerts`, drops the entire `SETUP` section (Settings stays in profile dropdown; Integrations stays in Settings landing). Adds an empty `Insights` placeholder route. Moves the collapse toggle from sidebar bottom (icon + "Collapse" text) to the top of the sidebar (icon-only, `h-14` to baseline-align with the header bar). Mobile drawer unchanged. **Zero backend changes.** ~3.5h wall-clock, 4 tasks, 2 waves. |

## Why this batch follows yesterday

The [13-05-2026 patient-profile-shell-rebuild](../13-05-2026/) batch is mid-flight (Strangler Fig migration from `ConsultationCockpit` → `<PatientProfileShell>`). That batch is large and sequential — the cockpit is hot. Doing a parallel cockpit-touch sidebar batch would smear the diffs and conflict on `<CockpitHeader>`.

This batch deliberately stays out of the cockpit. The only file overlap with the ppr batch is none — sidebar / settings / insights are all outside `frontend/components/consultation/**`. Easy to ship in parallel; easy to review.

The opportunity surfaced after a week of operating on the sidebar shipped by [`plan-ui-system-redesign.md`](../../Product%20plans/plan-ui-system-redesign.md):

1. **`OPD queue`** is wrong half the time — the OPD page already serves `queue` and `slot` modes from one shell.
2. **`Appointments`** is a calendar-rewind redundancy of OPD-today and Cmd-K search.
3. **`Match reviews`** is jargon — the page is the AI receptionist asking the doctor about tentative bookings.
4. **`SETUP`** competes with the profile dropdown's existing `Settings` link.
5. **Collapse toggle at the bottom** drops off-screen on shorter sidebars.

Locked-in chat 2026-05-14, source plan: [`Product plans/plan-sidebar-restructure.md`](../../Product%20plans/plan-sidebar-restructure.md).

## How to start

If you're picking up `sidebar-restructure`:

1. Read the [source product plan](../../Product%20plans/plan-sidebar-restructure.md) once for context — DL-1..DL-11 explain the *why* behind each label and the kept routes.
2. Read [`sidebar-restructure/plan-sidebar-restructure-batch.md`](./sidebar-restructure/plan-sidebar-restructure-batch.md) for the per-task breakdown and the cross-cutting acceptance gate.
3. Open [`sidebar-restructure/Tasks/EXECUTION-ORDER-sidebar-restructure.md`](./sidebar-restructure/Tasks/EXECUTION-ORDER-sidebar-restructure.md) for the wave / lane matrix and model picks.
4. Per [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md): start a fresh chat per task. **No Opus this batch** — every task is XS / S Sonnet 4.6 (or Composer for the smoke test). The user-facing diff is small; the spec is tight; Opus would be overkill.

## Cross-day predecessors

- [Daily-plans/May 2026/06-05-2026/Tasks/task-ui-B2-sidebar-regrouping.md](../06-05-2026/Tasks/task-ui-B2-sidebar-regrouping.md) — the original 4-section sidebar (TODAY / CARE / INBOX / SETUP) this batch tightens.
- [Daily-plans/May 2026/06-05-2026/Tasks/task-ui-B3-sidebar-counts-and-collapse.md](../06-05-2026/Tasks/task-ui-B3-sidebar-counts-and-collapse.md) — the badge + collapse-to-icons machinery; this batch keeps it intact and only repositions the toggle.
- [Product plans/plan-ui-system-redesign.md § U2.6–U2.9](../../Product%20plans/plan-ui-system-redesign.md) — the IA decisions this batch evolves.
- [Product plans/plan-sidebar-restructure.md](../../Product%20plans/plan-sidebar-restructure.md) — the source product plan with decision locks DL-1..DL-11.

## Concurrent batches

- [13-05-2026/patient-profile-shell-rebuild/](../13-05-2026/patient-profile-shell-rebuild/) — Strangler Fig cockpit rebuild. **No file overlap with this batch.** Safe to run in parallel chats / branches.
