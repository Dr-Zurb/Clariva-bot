# Task sr-03: Sidebar restructure (items + collapse toggle + badge-key rename)

## 14 May 2026 — Batch [Sidebar restructure](../plan-sidebar-restructure-batch.md) — Wave 2, Lane α step 0 — **S, ~75min**

---

## Task overview

The visible cut-over. **Three files modified atomically in a single PR**:

1. **`frontend/components/layout/Sidebar.tsx`** — rewrite `navSections` (drop `Appointments`, drop entire `SETUP` section, add `Insights`, rename `OPD queue` → `OPD`, rename `Match reviews` → `Booking review` with `href` updated to the new route, rename `Notifications` → `Alerts`). Move the collapse toggle from the bottom of `<aside>` to a new top strip (`h-14`, icon-only, right-aligned in expanded mode, centered in collapsed mode, `hidden md:flex`).
2. **`frontend/hooks/useDashboardCounts.ts`** — rename interface field, local variable, and JSDoc comment: `matchReviewsUnconfirmed` → `bookingReviewsUnconfirmed`. Endpoint URL preserved (no backend touch per DL-10).
3. **`frontend/components/dashboard/cockpit/KpiStrip.tsx`** — line 171 reads `counts.matchReviewsUnconfirmed`; update to `counts.bookingReviewsUnconfirmed`. (This is the "Pending DMs" KPI tile on the cockpit — second consumer site of the renamed field.)

These three changes ship as one PR because they are **a single coherent contract change**: the badge-key field name, its consumer in the sidebar, and its consumer in the KPI strip must all flip together or `tsc` errors out. Splitting the rename across PRs creates a half-broken tree.

**Estimated time:** ~75 min (10 min `navSections` rewrite, 30 min collapse-toggle move + visual verification, 15 min badge-key rename across two consumers, 15 min smoke + tsc + lint, 5 min commit message).

**Status:** Pending.

**Hard deps:** sr-01 (Insights route exists) AND sr-02 (booking-review route exists). Both must be merged or at least green on the same branch before sr-03 can ship without `<Link>` 404s on the sidebar entries.

**Source:** [plan-sidebar-restructure-batch.md § Wave 2](../plan-sidebar-restructure-batch.md#wave-2--wire-the-sidebar--verify-2-tasks-25h-sequential-single-lane) + `S1.1`, `S1.2`, `S1.3`, `S1.6`, `S2.3`, `S3.2` in [Product plans/plan-sidebar-restructure.md](../../../../Product%20plans/plan-sidebar-restructure.md). Decision locks DL-1, DL-4, DL-6, DL-7, DL-8, DL-9.

---

## Model & execution guidance

**Recommended model:** **Sonnet 4.6 Medium**.

**New chat?** **Yes** — fresh chat. Do NOT carry sr-01 or sr-02's chat into this one; they're independent topics and the context tax isn't worth it.

Pre-load:

- This task file.
- `frontend/components/layout/Sidebar.tsx` (~250 LOC — the entire file).
- `frontend/hooks/useDashboardCounts.ts` (~165 LOC — the entire file).
- `frontend/components/dashboard/cockpit/KpiStrip.tsx` lines 160–195 (the area around the consumer site at line 171; full file optional).
- `frontend/components/layout/Header.tsx` lines 68–115 (to confirm header `h-14` and the `sticky top-0` pattern that the new top-of-sidebar collapse strip baseline-aligns with).
- Source plan §DL-1, §DL-4, §DL-6, §DL-7, §DL-8.

**Estimated turns:** 3–5 turns (the sidebar rewrite is atomic; the collapse-toggle move is one structural shift; the badge-key rename is mechanical).

---

## Acceptance criteria

### Step 1 — Rewrite `navSections` in `Sidebar.tsx`

- [ ] In `frontend/components/layout/Sidebar.tsx`, replace the entire `navSections` constant. Final shape:

  ```tsx
  const navSections: NavSection[] = [
    {
      heading: "TODAY",
      items: [
        { href: "/dashboard", label: "Today", icon: LayoutDashboard, exact: true },
        {
          href: "/dashboard/opd-today",
          label: "OPD",
          icon: Users,
          badgeKey: "opdLive",
        },
      ],
    },
    {
      heading: "CARE",
      items: [
        { href: "/dashboard/patients", label: "Patients", icon: User },
        {
          href: "/dashboard/insights",
          label: "Insights",
          icon: BarChart3,
        },
      ],
    },
    {
      heading: "INBOX",
      items: [
        {
          href: "/dashboard/booking-review",
          label: "Booking review",
          icon: Inbox,
          badgeKey: "bookingReviewsUnconfirmed",
        },
        {
          href: "/dashboard#notifications",
          label: "Alerts",
          icon: Bell,
          badgeKey: "dashboardEventsUnread",
        },
      ],
    },
  ];
  ```

- [ ] **Drop these lucide imports** (no longer used): `CalendarDays` (was used by `Appointments`), `Settings as SettingsIcon` (was `Settings`), `Plug` (was `Integrations`).
- [ ] **Add this lucide import**: `BarChart3`. Add it alphabetically to the existing import block:

  ```tsx
  import {
    BarChart3,
    Bell,
    Inbox,
    LayoutDashboard,
    PanelLeftClose,
    PanelLeftOpen,
    User,
    Users,
  } from "lucide-react";
  ```

- [ ] Update the JSDoc on the `Sidebar` component to reflect the new structure:

  ```tsx
  /**
   * Dashboard sidebar — 3-section grouped nav with lucide icons.
   * Sections: TODAY (Today, OPD) / CARE (Patients, Insights) / INBOX (Booking review, Alerts).
   *
   * Settings + Integrations live in the profile dropdown (not in the sidebar) per DL-7.
   * Appointments list is reachable via Cmd-K and via cockpit "back to list" arrows
   * but does not have a primary nav entry per DL-2.
   *
   * Desktop features (md+):
   *   - Live badge counts next to relevant items (polling via useDashboardCounts).
   *   - Collapse-to-icons rail (w-14) toggled via the top-of-sidebar button.
   *   - Smooth width transition via CSS transition-[width].
   *
   * Mobile: always full-width drawer; collapsed state ignored; no top toggle button.
   *
   * @see docs/Work/Daily-plans/May 2026/14-05-2026/sidebar-restructure
   */
  ```

### Step 2 — Move the collapse toggle from bottom to top

- [ ] **Delete** the existing bottom block (currently the last `<div className="hidden md:flex border-t border-border p-2">` containing the `<button onClick={onToggleCollapse}>`):

  ```tsx
  // DELETE THIS BLOCK:
  <div className="hidden md:flex border-t border-border p-2">
    <button
      type="button"
      onClick={onToggleCollapse}
      aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      className={cn(
        "flex items-center rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground",
        collapsed ? "w-full justify-center" : "w-full gap-2"
      )}
    >
      {collapsed ? (
        <PanelLeftOpen className="h-4 w-4" />
      ) : (
        <>
          <PanelLeftClose className="h-4 w-4" />
          <span className="text-xs">Collapse</span>
        </>
      )}
    </button>
  </div>
  ```

- [ ] **Insert** a new top strip *inside* the `<aside>`, *immediately above* the `<nav>` element:

  ```tsx
  {/* Top strip — collapse toggle, icon-only.
      h-14 to baseline-align with the top header bar (Header.tsx).
      Right-aligned expanded; centered collapsed (Cursor pattern).
      hidden md:flex — drawer mode (mobile) does not show this. */}
  <div
    className={cn(
      "hidden md:flex h-14 shrink-0 items-center border-b border-border px-2",
      collapsed ? "justify-center" : "justify-end"
    )}
  >
    <button
      type="button"
      onClick={onToggleCollapse}
      aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      {collapsed ? (
        <PanelLeftOpen className="h-4 w-4" />
      ) : (
        <PanelLeftClose className="h-4 w-4" />
      )}
    </button>
  </div>
  ```

  Wrap with the existing `Tooltip` to preserve hover-discoverability:

  ```tsx
  {/* Top strip — collapse toggle */}
  <div
    className={cn(
      "hidden md:flex h-14 shrink-0 items-center border-b border-border px-2",
      collapsed ? "justify-center" : "justify-end"
    )}
  >
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {collapsed ? (
            <PanelLeftOpen className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">
        {collapsed ? "Expand sidebar" : "Collapse sidebar"}
      </TooltipContent>
    </Tooltip>
  </div>
  ```

- [ ] **Drop the "Collapse" text label entirely** (S1.3). Both expanded and collapsed states render icon-only — the tooltip carries the accessible affordance.
- [ ] **Verify the placement.** The aside structure should now be:

  ```tsx
  <aside className={...}>
    {/* NEW: top collapse strip (h-14, hidden md:flex) */}
    <div ...>...</div>

    {/* EXISTING: nav */}
    <nav className="flex flex-1 flex-col p-3" aria-label="Main navigation">
      ...
    </nav>

    {/* DELETED: bottom border-t collapse block */}
  </aside>
  ```

- [ ] **Why h-14?** The top header bar is `h-14` (`frontend/components/layout/Header.tsx` L70: `"sticky top-0 z-40 flex h-14 ..."`). Matching heights makes the top of the sidebar's collapse strip baseline-align with the top of the header bar — visually they read as one continuous chrome bar.

### Step 3 — Rename badge key in `useDashboardCounts.ts`

- [ ] In `frontend/hooks/useDashboardCounts.ts`:
  - Rename interface field at L26: `matchReviewsUnconfirmed: number;` → `bookingReviewsUnconfirmed: number;`.
  - Rename local variable declared at L69: `let matchReviewsUnconfirmed: number | null = null;` → `let bookingReviewsUnconfirmed: number | null = null;`.
  - Update assignment at L74: `matchReviewsUnconfirmed = reviewsRes.value.data.reviews.length;` → `bookingReviewsUnconfirmed = ...`.
  - Update the `setCounts` block at L97-98:
    ```ts
    bookingReviewsUnconfirmed:
      bookingReviewsUnconfirmed ?? prev?.bookingReviewsUnconfirmed ?? 0,
    ```
  - Update JSDoc at L10: `*   - matchReviewsUnconfirmed: GET /api/v1/service-staff-reviews?status=pending` → `*   - bookingReviewsUnconfirmed: GET /api/v1/service-staff-reviews?status=pending`. **Endpoint URL is unchanged** — DL-10 forbids backend touches.
- [ ] **Why keep the same endpoint URL?** Per DL-10 the backend is untouched. The endpoint `/api/v1/service-staff-reviews` keeps its name; the data semantics (pending AI booking proposals) didn't change. Only the doctor-facing label and the frontend field name changed.

### Step 4 — Update consumer in `KpiStrip.tsx`

- [ ] In `frontend/components/dashboard/cockpit/KpiStrip.tsx`, line 171:

  ```tsx
  // BEFORE:
  const pendingDmsValue =
    counts !== null ? counts.matchReviewsUnconfirmed : null;

  // AFTER:
  const pendingDmsValue =
    counts !== null ? counts.bookingReviewsUnconfirmed : null;
  ```

- [ ] **Do NOT rename the local variable `pendingDmsValue`** — that's the KPI tile's display name ("Pending DMs"), which is a separate naming question and out of scope here. The tile's user-facing label stays "Pending DMs"; only the source field flips.

### Step 5 — Verification

- [ ] `pnpm --filter frontend tsc --noEmit` clean. (This is the cheap mechanical gate: any missed `matchReviewsUnconfirmed` callsite errors out immediately.)
- [ ] `pnpm --filter frontend lint` clean.
- [ ] `rg "matchReviewsUnconfirmed" frontend/` returns **zero** results.
- [ ] `rg "Match reviews" frontend/` returns zero results outside `__tests__/`, `__snapshots__/`, and `docs/` paths. (Snapshot tests may need regeneration — see Notes #3.)
- [ ] Restart the dev server (the `next.config.mjs` change from sr-02 already required a restart; if you're stacking on Wave 1's branch this restart is the same one).
- [ ] **Visual smoke (the same things sr-04 will re-walk; checking now catches issues before opening that task):**
  - Sidebar shows 3 sections, 6 items, in the order: TODAY (Today, OPD) / CARE (Patients, Insights) / INBOX (Booking review, Alerts).
  - No `Appointments`, no `Settings`, no `Integrations` entries.
  - Insights item has the `BarChart3` icon and links to `/dashboard/insights`.
  - Booking review item links to `/dashboard/booking-review` (no longer `/service-reviews`); badge updates if there are pending reviews.
  - Alerts item links to `/dashboard#notifications`; badge updates from `dashboardEventsUnread`.
  - Top of sidebar shows the collapse toggle as an icon (no "Collapse" text). On a 1440×900 viewport, the icon's vertical center aligns visually with the brand mark in the header bar.
  - Click the toggle → sidebar collapses to `w-14`. Toggle re-renders centered. Click again → expands to `w-56`. Tooltip on hover.
  - On a `<md` viewport (DevTools responsive mode at 600px wide): open the mobile menu via the header's hamburger. Drawer slides in. **No top collapse toggle visible.** Labels are full-width. Behaviour unchanged from before this batch.
  - Open `/dashboard` (the cockpit). The KPI strip's "Pending DMs" tile shows the same number as the `Booking review` sidebar badge (both read `bookingReviewsUnconfirmed` now).

---

## Out of scope

- **Final smoke test walkthrough across all browsers / viewports** — that's sr-04 (Wave 2 step 1).
- **Renaming `frontend/components/service-reviews/` folder** — captured in S4 / S-Q5 (deferred). The sidebar `href` and the route slug both already say `booking-review`; the internal component folder name is invisible to doctors.
- **Renaming `pendingDmsValue` / "Pending DMs" tile label** — separate naming concern. The "Pending DMs" label was chosen for the KPI strip independently; if we want to align with "Booking review" terminology that's a distinct edit (and might confuse doctors who recognised "Pending DMs"). Park.
- **Adding an Insights hotkey** (e.g. `Cmd/Ctrl+5`) — captured as S4.6 in source plan; defer until content lands.
- **Doctor-name pill at sidebar bottom** — captured as S4.4 / S-Q3 (locked: leave empty).
- **Reroute "back to list" links from `/dashboard/appointments` → `/dashboard/opd-today`** — captured as S4.2 / S-Q4 (locked: defer).

---

## Files expected to touch

**Modified:**

- `frontend/components/layout/Sidebar.tsx` (~80 LOC delta — `navSections` rewrite, lucide imports update, top collapse strip insertion, bottom collapse block deletion, JSDoc refresh).
- `frontend/hooks/useDashboardCounts.ts` (~5 LOC delta — field rename in 4 occurrences + 1 JSDoc line).
- `frontend/components/dashboard/cockpit/KpiStrip.tsx` (~1 LOC delta — line 171 field reference).

**New / Renamed:** none (sr-01 and sr-02 already created the destinations).

**Tests:** snapshot tests for `Sidebar.tsx` (if any exist under `frontend/components/layout/__tests__/` or `__snapshots__/`) likely need regeneration — the rendered DOM changes (item count, labels, collapse-toggle position). Run `pnpm --filter frontend test -- --updateSnapshot` if applicable, then visually diff the snapshot to confirm only the expected changes (no accidental class-name regressions).

---

## Notes / open decisions

1. **Why one PR for three files?** The badge-key rename is a cross-file contract change. Splitting it (e.g., "rename in hook, then update consumers in a follow-up") leaves `tsc` red between the two commits — anyone else picking up the branch sees a broken build. One PR makes the rename atomic and reviewable.
2. **Why does `KpiStrip.tsx` consume `counts.matchReviewsUnconfirmed`?** It's the "Pending DMs" KPI tile on the cockpit — the same number as the sidebar badge but rendered as a top-of-cockpit tile. Both are surfacing the same underlying fact: "N AI-proposed bookings need your review." The rename keeps both surfaces in sync.
3. **Snapshot tests catching Sidebar changes.** The 06-05-2026 sidebar batch (B2 / B3) likely shipped snapshot tests that pin the rendered structure. Regenerating them is expected (the structure intentionally changed). What's NOT expected is class-name churn — verify the diff only shows item count + labels + collapse-button position changes, not unrelated styling drift.
4. **Why right-align the collapse toggle in expanded mode?** The Cursor / Notion convention. A right-aligned icon at the top-right of the sidebar reads as "the boundary between sidebar and main content" — visually intuitive.
5. **Why no migration of the localStorage key for collapse state?** The `clariva.sidebar.collapsed` key in `DashboardShell.tsx` (`SIDEBAR_COLLAPSED_KEY`) is unchanged — the toggle's *position* moved but the underlying *state* (collapsed boolean) is the same. Doctors who had the sidebar collapsed before will still find it collapsed; the toggle button just moved.
6. **Why is `border-b` (bottom border on the new top strip) the right border choice vs `border-t` on the nav?** Either works visually. `border-b` on the strip groups it with the strip itself (the strip is a self-contained chrome element). `border-t` on the nav would attach the divider to the nav. Pick the strip-owned variant (`border-b`) — the strip is the new structural element; the nav is unchanged.
7. **What if an existing test asserts the sidebar has the `Appointments` entry?** Update the test to assert the new 6-item structure. The plan deliberately drops `Appointments` per DL-2; tests that asserted its presence reflect the old IA and need to evolve.
8. **What if linter complains about the unused lucide imports?** It will (the `no-unused-vars` rule catches them). Remove `CalendarDays`, `Settings as SettingsIcon`, `Plug` from the import block as part of this task — listed in Step 1.

---

## References

- **Affected files:**
  - `frontend/components/layout/Sidebar.tsx`
  - `frontend/hooks/useDashboardCounts.ts`
  - `frontend/components/dashboard/cockpit/KpiStrip.tsx`
- **Read but do not modify:**
  - `frontend/components/layout/Header.tsx` (header `h-14` reference for the collapse-strip alignment)
  - `frontend/components/layout/HeaderProfileMenu.tsx` (already wires Settings → `/dashboard/settings`; confirms DL-7)
  - `frontend/app/dashboard/settings/page.tsx` (Practice Setup + Integrations cards — confirms DL-7)
- **Source decisions:** [Product plans/plan-sidebar-restructure.md § DL-1, DL-4, DL-6, DL-7, DL-8, DL-9, S1.1, S1.2, S1.3, S1.6, S2.3, S3.2](../../../../Product%20plans/plan-sidebar-restructure.md).
- **Wave gate:** [`EXECUTION-ORDER-sidebar-restructure.md` § Wave 2 gate](./EXECUTION-ORDER-sidebar-restructure.md#wave-2-gate-after-sr-04) — sr-04 walks every box.
- **Previous tasks:** [`task-sr-01-insights-placeholder-page.md`](./task-sr-01-insights-placeholder-page.md), [`task-sr-02-booking-review-folder-and-redirect.md`](./task-sr-02-booking-review-folder-and-redirect.md) — both must be done.
- **Next task:** [`task-sr-04-final-smoke-test.md`](./task-sr-04-final-smoke-test.md) — manual smoke; no code unless a cell fails.

---

**Owner:** TBD
**Created:** 2026-05-14
**Status:** Pending
