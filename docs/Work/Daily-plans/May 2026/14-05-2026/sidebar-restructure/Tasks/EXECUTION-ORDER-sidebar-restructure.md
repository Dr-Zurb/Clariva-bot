# Sidebar restructure — execution order

> Sibling document of [`plan-sidebar-restructure-batch.md`](../plan-sidebar-restructure-batch.md). The plan covers *what* and *why*; this doc covers *who-runs-what-when* and *which model*.

**Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md)
**Execution playbook:** [EXECUTION-ORDER-GUIDELINES.md §13.5 — Operating playbook](../../../../../EXECUTION-ORDER-GUIDELINES.md#135-operating-playbook-how-to-execute-a-batch-from-these-docs)
**Planning rules used:** [EXECUTION-ORDER-GUIDELINES.md §0 (lane rule) + §0.5 (wave cuts)](../../../../../EXECUTION-ORDER-GUIDELINES.md)

---

## Wave plan (2 waves, all single-lane sequential)

> **Why all single-lane?** Per the lane rule (§0), a lane is a strictly sequential chain; multiple lanes exist only when their tasks are fully independent for the entire wave AND each lane's wall-clock is ≥ 1 hour (§7). Wave 1's two tasks (sr-01, sr-02) ARE truly independent — sr-01 creates `app/dashboard/insights/`, sr-02 moves `app/dashboard/service-reviews/` and edits `next.config.mjs`, zero file overlap — but each is ≤ 30 min, well under the 1-hour parallelism threshold. Wave 2's tasks chain: sr-03 consumes both Wave 1 outputs (the new routes' `href`s); sr-04 verifies sr-03. Single-lane sequential everywhere.
>
> **Why 2 waves?** Cut 1 (Dependency cliff, §0.5): sr-03 needs both Wave 1 routes to exist before it can wire them into the sidebar without a 404-flash window. Cut 2 (Artifact change): Wave 1's gate is "the two new URLs respond"; Wave 2's gate is "the user-visible sidebar shows the new structure and badges still update". Different reviewer mindsets.

```
Wave 1 (Stake the destinations — ~1h, single lane sequential):
  Lane α  ──── sr-01 (XS, Sonnet 4.6) ──> sr-02 (XS, Sonnet 4.6)

Wave 2 (Wire the sidebar + verify — ~2.5h, single lane sequential):
  Lane α  ──── sr-03 (S, Sonnet 4.6) ──> sr-04 (XS, Composer 2 Fast)
```

**Total wall-clock:** ~3.5h.
**Total agent-time (sequential equivalent):** ~3.5h. No parallelism credit (lanes are intentionally sequential per §7).

The bottleneck is **Wave 2 / sr-03** — the only S-sized task; rewrites `navSections`, repositions the collapse toggle, renames the badge key in two consumer files. Single chat, ~75 minutes including verification.

---

## Lane-by-lane details

### Wave 1 — Stake the destinations (single lane sequential)

Both tasks add a destination URL that Wave 2's sidebar wiring will reference. Order matters only weakly (sr-01 vs sr-02 could swap), but sequential is required because each lane needs ≥ 1h of work to justify going parallel (it doesn't).

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | [sr-01](./task-sr-01-insights-placeholder-page.md) | XS | Sonnet 4.6 Medium | `frontend/app/dashboard/patients/page.tsx` (mirror its server-component auth pattern), the source product plan §DL-3 | Create `frontend/app/dashboard/insights/page.tsx`. Server component: auth check → redirect-on-401 → render `<h1>Insights</h1>` + "Coming soon" `<p>`. ~20 LOC. Zero backend, zero hooks, zero widgets. |
| 1 | [sr-02](./task-sr-02-booking-review-folder-and-redirect.md) | XS | Sonnet 4.6 Medium | `frontend/app/dashboard/service-reviews/page.tsx` (the page being moved — verify it doesn't have hard-coded references to the old slug), `frontend/next.config.mjs` (the file the redirect lands in) | Two atomic ops: (1) `git mv frontend/app/dashboard/service-reviews → frontend/app/dashboard/booking-review`; (2) add a 308 permanent redirect in `next.config.mjs` from `/dashboard/service-reviews` → `/dashboard/booking-review`. Page logic untouched. |

**Branch suggestion:** `feature/sidebar-restructure-routes`. Single PR for sr-01 + sr-02 (both add/move routes, no user-visible behaviour yet).

**Pre-merge gate after sr-02:**

- [ ] `pnpm --filter frontend tsc --noEmit` clean.
- [ ] `pnpm --filter frontend lint` clean.
- [ ] `curl -I http://localhost:3000/dashboard/insights` returns `200`.
- [ ] `curl -I http://localhost:3000/dashboard/booking-review` returns `200`.
- [ ] `curl -I http://localhost:3000/dashboard/service-reviews` returns `308 Permanent Redirect` with `Location: /dashboard/booking-review`.
- [ ] Visit `/dashboard/booking-review` in the browser logged in as a doctor: the existing `<ServiceReviewsInbox>` component renders identically to before the move.
- [ ] Visit `/dashboard/insights`: renders the placeholder. No console errors.

---

### Wave 2 — Wire the sidebar + verify (single lane sequential)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | [sr-03](./task-sr-03-sidebar-restructure-and-collapse-toggle.md) | S | Sonnet 4.6 Medium | `frontend/components/layout/Sidebar.tsx` (the file being rewritten — entire ~250 LOC), `frontend/hooks/useDashboardCounts.ts` (badge-key rename source), `frontend/components/dashboard/cockpit/KpiStrip.tsx` (the second consumer site at line 171 — "Pending DMs" tile), the source product plan §DL-1, §DL-4, §DL-6, §DL-7, §DL-8 | The visible cut-over. Three files modified atomically: (1) `Sidebar.tsx` — rewrite `navSections` to the 6-item shape, drop `Appointments`, drop `SETUP` section, add `Insights` with `BarChart3`, rename `OPD queue` → `OPD`, rename `Match reviews` → `Booking review` with `href` → `/dashboard/booking-review`, rename `Notifications` → `Alerts`, move collapse toggle from bottom to top (`h-14`, icon-only, right-aligned expanded, centered collapsed, `hidden md:flex`). (2) `useDashboardCounts.ts` — rename interface field, local var, JSDoc; endpoint URL preserved. (3) `KpiStrip.tsx` — update line 171 reader to use renamed field. **Single PR; same chat.** |
| 1 | [sr-04](./task-sr-04-final-smoke-test.md) | XS | Composer 2 Fast | None — manual smoke checklist | Walk the cross-cutting acceptance gate from the batch plan. No code unless a cell fails. If a cell fails, drop back into the appropriate task (sr-01/02/03) for the fix; this task does not own fixes. |

**Branch suggestion:** `feature/sidebar-restructure-wiring`. Stacks on `feature/sidebar-restructure-routes` if Wave 1 hasn't merged yet, otherwise branches off `main`.

**Pre-merge gate after sr-04:** the cross-cutting acceptance gate in [`plan-sidebar-restructure-batch.md` § Cross-cutting acceptance gate](../plan-sidebar-restructure-batch.md#cross-cutting-acceptance-gate-whole-batch) — every box ticked. Specifically:

- [ ] All Wave 1 gates still green.
- [ ] Sidebar renders 6 items in 3 sections (TODAY / CARE / INBOX).
- [ ] Collapse toggle at top, icon-only, right-aligned expanded, centered collapsed; `hidden md:flex` (no toggle in mobile drawer).
- [ ] All three badges (`opdLive`, `bookingReviewsUnconfirmed`, `dashboardEventsUnread`) render and update on a 30s poll.
- [ ] `KpiStrip.tsx` "Pending DMs" tile shows the booking-review count (renamed field reaches it).
- [ ] `rg "matchReviewsUnconfirmed" frontend/` returns zero results.
- [ ] `rg "Match reviews" frontend/` returns zero results outside docs / test snapshots.
- [ ] `rg "/dashboard/service-reviews" frontend/` returns zero results outside `next.config.mjs` and docs.
- [ ] Mobile drawer (`<md`) — no top collapse toggle, full labels, slide-in unchanged.
- [ ] Profile dropdown still has `Settings` linking to `/dashboard/settings` (untouched).
- [ ] Settings landing still shows Practice Setup + Integrations cards (untouched).
- [ ] `pnpm --filter frontend tsc --noEmit` + `pnpm --filter frontend lint` clean.
- [ ] No regression in any test suite.

---

## Per-task model picks

Per [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md):

| Task | Size | Recommended model | Why |
|---|---|---|---|
| sr-01 | XS | Sonnet 4.6 Medium | New page mirroring an existing pattern (`patients/page.tsx`). ~20 LOC. Composer would do it but Sonnet picks the right auth shape from one read of the precedent file. |
| sr-02 | XS | Sonnet 4.6 Medium | Folder rename + `next.config.mjs` `redirects()` block. Composer can do the move; Sonnet is safer for the redirect entry (308 vs 307, `permanent: true`, comment annotation). |
| **sr-03** | **S** | **Sonnet 4.6 Medium** | **The only non-trivial task. Three files touched, ~120 LOC delta. Tight spec from DL-1 / DL-4 / DL-6 / DL-7 / DL-8 + the badge-key consumer list. No novel architecture; no security / PHI / migration. Sonnet's sweet spot.** |
| sr-04 | XS | Composer 2 Fast | Manual smoke walkthrough. The "code" is just running `curl`, opening URLs, watching the badge poll. Composer is the right tier — no judgment required. |

**Cap check:** zero Opus tasks (cap is ≤ 1 per wave, ≤ 2 per batch). This batch deliberately ships at the bottom of the cost band.

---

## Acceptance gates per wave

### Wave 1 gate (after sr-02)

- [ ] `pnpm --filter frontend tsc --noEmit` clean.
- [ ] `pnpm --filter frontend lint` clean.
- [ ] `/dashboard/insights` returns 200; renders `<h1>Insights</h1>` + "Coming soon" subtitle; auth required (logged-out user redirected to `/login`).
- [ ] `/dashboard/booking-review` returns 200; renders the existing `<ServiceReviewsInbox>` component identically to the pre-move page.
- [ ] `/dashboard/service-reviews` returns 308 with `Location: /dashboard/booking-review`. Following the redirect in a browser lands on the booking-review page with the inbox visible.
- [ ] No regression on existing `service-reviews` tests (the file paths inside `frontend/components/service-reviews/` are unchanged; only the route folder moved).

### Wave 2 gate (after sr-04)

- [ ] All Wave 1 gates still green.
- [ ] Sidebar visual matches the spec — 6 items in 3 sections, no `Appointments`, no `SETUP`, `Insights` between `Patients` and `Booking review`.
- [ ] Collapse toggle at top of `<aside>`, icon-only, `h-14`, right-aligned in expanded mode (`md:w-56`), centered in collapsed mode (`md:w-14`). Click → sidebar collapses; click again → expands. Tooltip says "Collapse sidebar" / "Expand sidebar".
- [ ] In mobile drawer (`<md`): no top collapse button; labels full-width; behaviour identical to pre-batch.
- [ ] Badge counts render correctly:
  - `opdLive` next to `OPD` when active queue entries exist.
  - `bookingReviewsUnconfirmed` next to `Booking review` when pending reviews exist.
  - `dashboardEventsUnread` next to `Alerts` when unread events exist.
- [ ] `KpiStrip.tsx` "Pending DMs" tile reads `counts.bookingReviewsUnconfirmed` (the renamed field) and shows the same number it showed before the rename.
- [ ] `rg "matchReviewsUnconfirmed" frontend/` returns zero results.
- [ ] `rg "Match reviews" frontend/` outside docs / test snapshots returns zero results.
- [ ] `rg "/dashboard/service-reviews" frontend/` outside `next.config.mjs` returns zero results.
- [ ] Profile dropdown menu still shows `Settings` linking to `/dashboard/settings`.
- [ ] Settings landing (`/dashboard/settings`) still shows two cards: Practice Setup and Integrations (untouched by this batch).
- [ ] All previously-passing test suites remain green: `pnpm --filter frontend test` / `pnpm --filter frontend e2e` (or whichever runner the repo uses).

---

## Cost estimate

| Wave | Tasks | Sonnet 4.6 chats | Composer 2 chats | Opus 4.7 chats | Wall-clock |
|---|---|---|---|---|---|
| Wave 1 | sr-01, sr-02 | 2 | 0 | 0 | ~1h (sequential) |
| Wave 2 | sr-03, sr-04 | 1 (sr-03) | 1 (sr-04 — no code, manual smoke) | 0 | ~2.5h (sequential) |
| **Total** | **4** | **3** | **1** | **0** | **~3.5h** |

This is a polish batch — the model mix should reflect that. Comparable cost profile to a single sub-batch in the EHR plan; an order of magnitude cheaper than the patient-profile-shell-rebuild (~6 dev-days, 1 Opus, 18 Sonnet).

### Efficiency notes

- **Single PR per wave.** Wave 1 stacks sr-01 + sr-02 on `feature/sidebar-restructure-routes`. Wave 2 stacks sr-03 + sr-04 on `feature/sidebar-restructure-wiring` (which can rebase onto `main` after Wave 1 lands).
- **Each task is a fresh chat.** Smaller context window. Don't carry sr-01's chat into sr-02 — they touch disjoint files and the spec is in the task file.
- **Pre-load list on every task is exhaustive.** No grepping needed at runtime — the agent gets every relevant file path up front.
- **Zero Opus tasks.** The visible diff is small, the spec is tight, every verification is mechanical (`tsc` / `lint` / `rg` / `curl`).
- **No new dependencies.** `BarChart3` is already in `lucide-react` (sidebar imports `Users`, `CalendarDays`, `User`, `Inbox`, `Bell`, etc. — same family).
- **No backend touch.** Per DL-10, this batch does not modify any `backend/` file. Backend agent owners can ignore this batch entirely.
- **Acceptance is grep-able.** Every cross-cutting gate item is verifiable by `rg "<token>" frontend/` or `curl -I <url>` — no "feels right" gate items.

---

## References

- [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md) — model-tier rules and chat heuristics.
- [EXECUTION-ORDER-GUIDELINES.md](../../../../../EXECUTION-ORDER-GUIDELINES.md) — wave / lane / shape definitions used in this doc.
- [Product plans/plan-sidebar-restructure.md](../../../../Product%20plans/plan-sidebar-restructure.md) — source product plan, decision locks DL-1..DL-11.
- Style precedent: [`patient-profile-shell-rebuild/Tasks/EXECUTION-ORDER-patient-profile-shell-rebuild.md`](../../../13-05-2026/patient-profile-shell-rebuild/Tasks/EXECUTION-ORDER-patient-profile-shell-rebuild.md) — the previous day's exec-order doc; same shape, same convention. (Concurrent batch — no file overlap with this one.)
- Cross-day:
  - [Daily-plans/May 2026/06-05-2026/Tasks/task-ui-B2-sidebar-regrouping.md](../../../06-05-2026/Tasks/task-ui-B2-sidebar-regrouping.md) — original 4-section sidebar this batch evolves.
  - [Daily-plans/May 2026/06-05-2026/Tasks/task-ui-B3-sidebar-counts-and-collapse.md](../../../06-05-2026/Tasks/task-ui-B3-sidebar-counts-and-collapse.md) — original badge + collapse machinery, preserved unchanged.
