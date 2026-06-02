# Sidebar restructure — 14 May 2026 batch plan

> **Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md). Fresh chat per task, smallest model that can solve the problem, deterministic verifications. **No Opus tasks** in this batch — every task is XS / S Sonnet 4.6 (or Composer 2 for the smoke test).
>
> **Source plan:** [`Product plans/plan-sidebar-restructure.md`](../../../Product%20plans/plan-sidebar-restructure.md). Decision locks `DL-1..DL-11` and items `S0..S4` originate there.
>
> **Exec order + lane matrix:** [`Tasks/EXECUTION-ORDER-sidebar-restructure.md`](./Tasks/EXECUTION-ORDER-sidebar-restructure.md).

---

## Why this batch

After a week of operating on the sidebar shipped by [`plan-ui-system-redesign.md`](../../../Product%20plans/plan-ui-system-redesign.md) (U2.6–U2.9), five gaps surfaced:

1. **`OPD queue`** is wrong half the time — [`OpdTodayClient.tsx`](../../../../../frontend/components/opd/OpdTodayClient.tsx) already serves both `queue` and `slot` modes from one shell.
2. **`Appointments`** is a calendar-rewind redundancy of OPD-today (which already shows the patient list for whatever date is selected). Bulk patient-name search lives in Cmd-K. The sidebar slot pays rent it doesn't earn.
3. **`Match reviews`** is jargon — the page is the AI receptionist queueing tentative bookings for the doctor to confirm/reassign/cancel.
4. **`SETUP`** competes with the profile-dropdown's existing `Settings` link. Settings is a once-a-week destination; it doesn't deserve permanent sidebar real estate. Linear / Notion / Cursor all keep settings in the profile menu only.
5. **Collapse toggle at the bottom** drops off-screen on shorter sidebars and on smaller laptop screens. Cursor/Notion put it at the top.

This batch closes all five in one half-day:

- **Sidebar items renamed:** `OPD queue` → `OPD`, `Match reviews` → `Booking review`, `Notifications` → `Alerts`.
- **Sidebar items dropped:** `Appointments`, `Settings`, `Integrations` (page routes preserved; entries removed).
- **New sidebar item:** `Insights` — empty placeholder route (`/dashboard/insights`).
- **Collapse toggle:** moved from bottom to top, icon-only, `h-14` to baseline-align with the header bar.
- **Route rename:** `/dashboard/service-reviews` → `/dashboard/booking-review` with a 308 permanent redirect.

**4 tasks across 2 waves**, ~3.5h wall-clock, single-lane sequential per wave.

---

## Decision lock (copied from source plan, frozen for batch duration)

These match `DL-1..DL-11` in [`plan-sidebar-restructure.md`](../../../Product%20plans/plan-sidebar-restructure.md). Re-opening any of them belongs in a new batch.

- **DL-1: Rename `OPD queue` → `OPD`** at the existing route `/dashboard/opd-today`. Mode-agnostic; the `opdLive` badge already conveys "live count".
- **DL-2: Drop `Appointments` from the sidebar.** Page at `/dashboard/appointments` stays — 9+ "back to list" links across the cockpit, NowNextCard, TodaysSchedule, OpdTodayClient, v2 cockpit, and the e2e test land there. Reachable via Cmd-K and back-arrow flow. Future S4.2 may reroute back-arrows to `/dashboard/opd-today`.
- **DL-3: Add `Insights` as an empty placeholder route.** New file `frontend/app/dashboard/insights/page.tsx`. Renders `<h1>Insights</h1>` + "Coming soon" subtitle. **No widgets. No KPIs. No backend.** Stakes the URL and the sidebar slot.
- **DL-4: Rename `Match reviews` → `Booking review`** (label only — see DL-5 for route). Hook badge key in [`useDashboardCounts.ts`](../../../../../frontend/hooks/useDashboardCounts.ts) renames `matchReviewsUnconfirmed` → `bookingReviewsUnconfirmed`. Backend endpoint `/api/v1/service-staff-reviews` unchanged (DL-10).
- **DL-5: Rename route `/dashboard/service-reviews` → `/dashboard/booking-review`** with a 308 permanent redirect that survives at least one release window. Folder rename only; page logic unchanged.
- **DL-6: Rename `Notifications` → `Alerts`** (label only). Link still anchors to `/dashboard#notifications`.
- **DL-7: Drop the entire `SETUP` section** from the sidebar. Settings reachable via profile dropdown ([`HeaderProfileMenu.tsx`](../../../../../frontend/components/layout/HeaderProfileMenu.tsx) already wired). Integrations reachable via Settings landing → "Integrations" card ([`frontend/app/dashboard/settings/page.tsx`](../../../../../frontend/app/dashboard/settings/page.tsx) already lists it).
- **DL-8: Move the collapse toggle to the top of the sidebar.** Icon-only (no "Collapse" text). `h-14` to baseline-align with the top header bar. Right-align in expanded mode, center in collapsed mode (Cursor pattern). Tooltip + `aria-label` preserved.
- **DL-9: Mobile drawer is unchanged.** Full labels, no collapse-to-icon, no top toggle. Existing `collapsed` prop already ignored on mobile per [`Sidebar.tsx`](../../../../../frontend/components/layout/Sidebar.tsx); add `hidden md:flex` to the new top toggle so it doesn't appear in the drawer.
- **DL-10: No backend changes.** No DB migration, no API rename, no email-template touch beyond the redirect that DL-5 mints automatically.
- **DL-11: Calendar view stays parked.** Not in scope.

Open-question defaults locked in chat 2026-05-14:

- **S-Q1: Section headings — KEEP** TODAY / CARE / INBOX (3 sections × 2 items each). Flat list deferred until/unless density complaints surface.
- **S-Q2: Insights icon — `BarChart3`** from `lucide-react`. Settings landing's duplicate use of `BarChart3` for Practice Setup is captured as a follow-up in `docs/Work/capture/inbox.md` (icon swap to `Settings2`/`Cog`).
- **S-Q3: Sidebar bottom — leave empty.** No doctor-name pill, no help link.
- **S-Q4: "Back to list" link reroute — defer to S4.2.** Two refactors at once smear the diff.
- **S-Q5: Internal `ServiceReviewsInbox` rename — defer.** Internal class names don't ship to doctors.

Decisions explicitly **not** in scope for this batch (deferred):

- **Insights content** (charts, KPIs, source mix) — separate plan once a doctor asks (source plan S4.1).
- **Reroute "back to list" links** from `/dashboard/appointments` → `/dashboard/opd-today` (source plan S4.2).
- **Backend rename** of `service_staff_review_requests` table or `/api/v1/service-staff-reviews` endpoint (source plan S4.3; DL-10 forbids).
- **Sidebar bottom doctor-name pill** (source plan S4.4).
- **Calendar view** (source plan S4.5; DL-11).
- **Insights hotkey** like `Cmd+Shift+5` (source plan S4.6; defer until content lands).

---

## Phases

### Wave 1 — Stake the destinations (2 tasks, ~1h, sequential single lane)

Both tasks land new URL surfaces that Wave 2's sidebar wiring will reference. They touch disjoint files (one creates `app/dashboard/insights/`, one moves `app/dashboard/service-reviews/` and edits `next.config.mjs`) but per [EXECUTION-ORDER-GUIDELINES § 7](../../../../process/EXECUTION-ORDER-GUIDELINES.md), each is well under 1h wall-clock — too small to justify lane parallelism. Single-lane sequential.

- [`task-sr-01-insights-placeholder-page.md`](./Tasks/task-sr-01-insights-placeholder-page.md) — XS — Create `frontend/app/dashboard/insights/page.tsx`. Server component, mirrors auth pattern from `patients/page.tsx`. Renders `<h1>Insights</h1>` + "Coming soon" subtitle. ~20 LOC. Zero backend.
- [`task-sr-02-booking-review-folder-and-redirect.md`](./Tasks/task-sr-02-booking-review-folder-and-redirect.md) — XS — `git mv frontend/app/dashboard/service-reviews → frontend/app/dashboard/booking-review`. Add a 308 permanent redirect in `frontend/next.config.mjs` from the old path to the new. Page logic untouched.

### Wave 2 — Wire the sidebar + verify (2 tasks, ~2.5h, sequential single lane)

- [`task-sr-03-sidebar-restructure-and-collapse-toggle.md`](./Tasks/task-sr-03-sidebar-restructure-and-collapse-toggle.md) — S — The visible cut-over. Rewrites `navSections` in `Sidebar.tsx` (rename `OPD queue` → `OPD`; drop `Appointments`; rename `Match reviews` → `Booking review` with `href` → `/dashboard/booking-review`; rename `Notifications` → `Alerts`; drop entire `SETUP` section; add `Insights` with `BarChart3` icon → `/dashboard/insights`). Moves the collapse toggle from bottom-of-sidebar to a new top strip (`h-14`, icon-only, right-aligned expanded, centered collapsed, `hidden md:flex`). Renames the badge key `matchReviewsUnconfirmed` → `bookingReviewsUnconfirmed` in `useDashboardCounts.ts` AND updates the consumer in `KpiStrip.tsx:171` ("Pending DMs" KPI). Single PR.
- [`task-sr-04-final-smoke-test.md`](./Tasks/task-sr-04-final-smoke-test.md) — XS — Manual smoke checklist. Walk every sidebar entry, confirm badges, collapse / expand, mobile drawer, old service-reviews URL redirects, KPI strip "Pending DMs" tile still shows the booking-review count. No code; if any cell fails, drop back into sr-01/sr-02/sr-03 to fix.

---

## Cross-cutting acceptance gate (whole batch)

Before declaring this batch shipped, all of the following must be true:

- [ ] **Sidebar renders 6 items in 3 sections** — `TODAY (Today, OPD)`, `CARE (Patients, Insights)`, `INBOX (Booking review, Alerts)`. No `Appointments`, no `Settings`, no `Integrations` entry.
- [ ] **Collapse toggle is at the top** of `<aside>`, icon-only (no "Collapse" text), `h-14`, right-aligned in expanded mode, centered in collapsed mode. Tooltip says "Collapse sidebar" / "Expand sidebar". `hidden md:flex` (no toggle in mobile drawer).
- [ ] **All sidebar `href`s resolve.** `/dashboard`, `/dashboard/opd-today`, `/dashboard/patients`, `/dashboard/insights`, `/dashboard/booking-review`, `/dashboard#notifications` — every one renders 200 (not 404).
- [ ] **Old route 308-redirects.** `curl -I http://localhost:3000/dashboard/service-reviews` returns `308 Permanent Redirect` with `Location: /dashboard/booking-review`.
- [ ] **Insights page renders the placeholder.** `<h1>Insights</h1>` + "Coming soon" subtitle. Auth required. No console errors.
- [ ] **Badge counts still update on the active route.** `bookingReviewsUnconfirmed` polls every 30s; pill renders next to `Booking review` when > 0; `KpiStrip.tsx` "Pending DMs" tile still reads the same count via the renamed field.
- [ ] **`opdLive` badge still works** next to `OPD` (renamed item, same source).
- [ ] **`dashboardEventsUnread` badge still works** next to `Alerts` (renamed item, same source).
- [ ] **`pnpm --filter frontend tsc --noEmit` clean** — no type errors from the badge-key rename or other touches.
- [ ] **`pnpm --filter frontend lint` clean.**
- [ ] **`rg "matchReviewsUnconfirmed" frontend/` returns zero results** — the rename is complete.
- [ ] **`rg "Match reviews" frontend/` returns zero results** outside docs / test snapshots.
- [ ] **`rg "/dashboard/service-reviews" frontend/` returns zero results** outside the redirect entry in `next.config.mjs` and docs.
- [ ] **Mobile drawer (`<md` viewport) unchanged** — opens via menu button, full labels, no top collapse toggle, slide-in from left. Identical visual to before this batch.
- [ ] **Profile dropdown still has `Settings`** linking to `/dashboard/settings` (untouched). Settings landing still shows Practice Setup + Integrations cards (untouched).
- [ ] **No regression on existing tests** — all `*.test.tsx` and `e2e/` specs that touch `Sidebar`, `Header`, `KpiStrip`, `ServiceReviewsInbox`, or appointments routes still pass. (The e2e test `frontend/e2e/dashboard.spec.ts` navigates to `/dashboard/appointments` directly — that route still works post-batch since DL-2 keeps the page; just confirm no test asserts on a sidebar `Appointments` entry.)

---

## Risk register

| Risk | Severity | Mitigation |
|---|---|---|
| Renaming `matchReviewsUnconfirmed` breaks the `KpiStrip.tsx` "Pending DMs" tile | M | sr-03 spec lists BOTH consumer sites (`Sidebar.tsx:68` and `KpiStrip.tsx:171`); the smoke task (sr-04) explicitly verifies the tile after the rename. `pnpm tsc --noEmit` is the cheap mechanical gate — any missed callsite errors immediately. |
| Folder rename breaks the active dev server (Next.js HMR) | L | `git mv` + restart of `pnpm --filter frontend dev`. Only affects the active dev session, never prod. The redirect handles bookmarks. |
| Some external link (notification email, support ticket, doctor's bookmark) hits `/dashboard/service-reviews` post-rename | L | The 308 redirect handles it indefinitely (DL-5). A `// TODO: remove after 2026-06-15 if no traffic` comment is added so we can sunset later if usage is zero. |
| Removing `SETUP` section orphans Integrations from primary nav | L | Verified: Integrations is already a card on the Settings landing (`frontend/app/dashboard/settings/page.tsx`). Profile dropdown → Settings → Integrations card = 2 clicks vs the previous 1. Acceptable trade-off per DL-7. |
| Top-positioned collapse button visually clashes with the header bar | L | `h-14` matches the header height so it baseline-aligns. Visual smoke (sr-04) explicitly verifies "the top of the sidebar reads as one continuous bar with the header" on a 1440×900 viewport. |
| Cmd-K palette has no entry for the bare `/dashboard/appointments` list | L | Out of scope. The list is reachable via the cockpit's "back to list" arrow flow (DL-2) and via direct URL. If a doctor asks "where's the all-appointments view?" we add a Cmd-K entry in a follow-up; not blocking this batch. |
| `BarChart3` icon used twice (Settings landing's Practice Setup card AND new Insights sidebar entry) | L | Captured as a follow-up in `docs/Work/capture/inbox.md` (swap Practice Setup card to `Settings2` or `Cog`). Cosmetic; doesn't block. |
| Removing the bottom `border-t` block accidentally drops a styling token used elsewhere | L | The block is self-contained (one button inside one `<div>`). `pnpm tsc --noEmit` + `lint` catch any orphaned imports. |

---

## Cost estimate

Expected model-mix per [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md):

| Wave | Tasks | Sonnet 4.6 Medium | Composer 2 Fast | Opus 4.7 Thinking-XHigh | Tokens (rough) |
|---|---|---|---|---|---|
| Wave 1 | sr-01 → sr-02 | 2/2 | 0/2 | 0/2 | ~15k in / ~15k out |
| Wave 2 | sr-03 → sr-04 | 1/2 (sr-03) | 1/2 (sr-04 — smoke test, no code) | 0/2 | ~30k in / ~30k out |
| **Total** | **4** | **3** | **1** | **0** | **~45k in / ~45k out** |

**Zero Opus tasks.** The visible diff is small, the spec is tight, and every task has a deterministic verification (TypeScript / lint / `rg` / curl). Per the Opus cap (≤ 1 per wave, ≤ 2 per batch), this batch deliberately ships at the bottom of the cost band.

This is a polish batch. The cost should match.

---

## Release plan

```
Wave 1 (sr-01 → sr-02)
  │   └─ feature/sidebar-restructure-routes
  ▼
Wave 2 (sr-03 → sr-04)
  │   └─ feature/sidebar-restructure-wiring (stacks on Wave 1, or branches off main if Wave 1 already merged)
  ▼
Single PR landing
  │
  ▼
Visual smoke in prod within hours of merge
```

If anything goes sideways post-merge:

- **Bad sidebar wiring** — `git revert` of the wiring commit restores the previous sidebar (the 4-section TODAY/CARE/INBOX/SETUP layout). Routes (`/insights`, `/booking-review`) survive harmlessly; redirect from `/service-reviews` survives harmlessly.
- **Bad redirect** — `git revert` of the `next.config.mjs` change restores direct `/service-reviews` resolution; a follow-up adds a fresh redirect.

No release-window pause needed. The diff is too small to warrant one.

---

## References

- [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md) — model-tier rules.
- [EXECUTION-ORDER-GUIDELINES.md](../../../../process/EXECUTION-ORDER-GUIDELINES.md) — wave / lane / shape rules used for the exec-order doc.
- [Product plans/plan-sidebar-restructure.md](../../../Product%20plans/plan-sidebar-restructure.md) — source product plan, decision locks DL-1..DL-11, open-question lock S-Q1..Q5.
- Style precedent: [Daily-plans/May 2026/13-05-2026/patient-profile-shell-rebuild/plan-patient-profile-shell-rebuild-batch.md](../../13-05-2026/patient-profile-shell-rebuild/plan-patient-profile-shell-rebuild-batch.md) — same shape, same convention. (Concurrent batch — no file overlap.)
- [Product plans/plan-ui-system-redesign.md § U2.6–U2.9](../../../Product%20plans/plan-ui-system-redesign.md) — the IA decisions this batch evolves.
- [Daily-plans/May 2026/06-05-2026/Tasks/task-ui-B2-sidebar-regrouping.md](../../06-05-2026/Tasks/task-ui-B2-sidebar-regrouping.md) — original 4-section sidebar this batch tightens.
- [Daily-plans/May 2026/06-05-2026/Tasks/task-ui-B3-sidebar-counts-and-collapse.md](../../06-05-2026/Tasks/task-ui-B3-sidebar-counts-and-collapse.md) — original badge + collapse machinery; preserved unchanged.

---

**Status:** `Drafted` 2026-05-14. **Owner:** TBD.
