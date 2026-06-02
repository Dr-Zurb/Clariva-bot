# Plan — Sidebar restructure

## Make the sidebar match how doctors actually navigate, and stop competing with the profile menu for "Settings"

> **Status:** `Committed` 2026-05-14. **Promoted to:** [`Daily-plans/May 2026/14-05-2026/sidebar-restructure/plan-sidebar-restructure-batch.md`](../Daily-plans/May%202026/14-05-2026/sidebar-restructure/plan-sidebar-restructure-batch.md). **Depends on:** the sidebar shipped by [`plan-ui-system-redesign.md`](./plan-ui-system-redesign.md) (U2.6 / U2.7 / U2.8 / U2.9). **Effort:** ~0.5 dev-day frontend. **Zero backend.**
>
> **Strategy:** in-place refactor of [`frontend/components/layout/Sidebar.tsx`](../../../frontend/components/layout/Sidebar.tsx) + a small folder rename (`service-reviews` → `booking-review`) with a redirect, plus an empty `Insights` route stub. No Strangler Fig; the sidebar is one file with no behaviour worth preserving in a parallel tree.
>
> **Status legend (matches `ehr/` convention):** `Drafted` → `Selected` → `Committed` → `Shipped` / `Deferred` / `Killed`.
>
> **Selection markers per item:** `Decision: [ ] Yes / [ ] No / [ ] Modify`. Tick exactly one in each item before promotion to a daily-plans batch.

---

## Why this plan exists now

`plan-ui-system-redesign.md` shipped a 4-section sidebar (TODAY / CARE / INBOX / SETUP) seven days ago. Operating on it for a week surfaced four things that make the IA fight the workflow:

1. **`OPD queue` is wrong half the time.** [`frontend/components/opd/OpdTodayClient.tsx`](../../../frontend/components/opd/OpdTodayClient.tsx) already branches on `opdMode` (`"queue"` vs `"slot"`) — there is no queue in slot mode, just scheduled slots. The label boxes the destination into one of the two modes the doctor configured against.
2. **`Appointments` is a calendar-rewind redundancy.** OPD-today already shows the patient list for whatever date the doctor selects. The bare list at `/dashboard/appointments` exists, but it duplicates OPD-today and bulk patient-name search already lives in Cmd-K. The sidebar slot is paying rent it isn't earning.
3. **`Match reviews` is jargon.** The page reviews AI-bot proposals from Instagram DMs ("doc, this patient asked X, the bot suggests service Y, what say?"). Doctors read `Match reviews` as something technical (DB join? algorithm?) and bounce. The mental model is **AI receptionist passing tentative bookings**.
4. **`SETUP` competes with the profile menu.** [`frontend/components/layout/HeaderProfileMenu.tsx`](../../../frontend/components/layout/HeaderProfileMenu.tsx) already has `Settings → /dashboard/settings`, and the settings landing ([`frontend/app/dashboard/settings/page.tsx`](../../../frontend/app/dashboard/settings/page.tsx)) already aggregates Practice Setup + Integrations as cards. So the SETUP sidebar section is a second path to the same destination — and it inflates the sidebar with items doctors visit weekly at most. Linear / Notion / Cursor all keep settings in the profile menu only.

There's also a smaller fifth thing: the **collapse toggle sits at the bottom border** with an icon + the word "Collapse". On a 1080p laptop with the dashboard scrolled, the toggle gets pushed off-screen on shorter sidebar variants. Cursor and Notion put it at the top, icon-only.

This plan closes all five gaps in one ~half-day refactor and stakes the URL slot for a future `Insights` page (deliberately empty in v1 — see DL-3).

---

## North star

From [ehr/plan-00-ehr-roadmap.md](./ehr/plan-00-ehr-roadmap.md):

> "doctor opens it, taps two chips, sends in 30 seconds, and the patient gets a properly branded PDF in their inbox"

Generalised to navigation:

> A doctor scanning the sidebar should be able to identify their next destination in **under 200ms** without parsing labels. Every item is either a working surface or a thing-arrived-for-you queue. Nothing else lives there.

Every item below either (a) makes that statement true, or (b) preserves an existing behaviour while the IA shifts beneath it. If an item doesn't ladder to one of those, flag it in `Notes:` and probably reject.

---

## Decision lock (LOCKED 2026-05-14, in chat)

These are scoping decisions agreed in chat at plan creation. Items below MUST respect them; revisiting any of them belongs in a new `Decision:` block on the affected item with a clear `Modify` rationale.

| ID | Decision | Implication |
|----|----------|-------------|
| **DL-1** | **Rename `OPD queue` → `OPD`** at the existing route `/dashboard/opd-today`. | One-line change in `Sidebar.tsx`. No route change. The `opdLive` badge keeps its semantics (it already conveys "live count"). |
| **DL-2** | **Drop `Appointments` from the sidebar.** The bare list page at `/dashboard/appointments` keeps working — 9+ "back to list" links across the cockpit and dashboard land there. We remove the *primary nav entry only*. | The page is reachable via Cmd-K and via the existing back-arrow flow. Future task (out of scope) may reroute back-arrows to `/dashboard/opd-today` for a tighter loop, but the list stays as the canonical "back" target until then. |
| **DL-3** | **Add `Insights` as an empty placeholder route.** New file `frontend/app/dashboard/insights/page.tsx` renders an `<h1>Insights</h1>` + a one-line "Coming soon" subtitle. **No widgets. No KPIs. No backend.** Stakes the URL and the sidebar slot. | We're claiming the slot now so we don't redesign the sidebar twice. Content lands in a separate plan when we're ready to invest a week. |
| **DL-4** | **Rename `Match reviews` → `Booking review`** (label only — see DL-5 for route). | Unambiguous to a doctor: "the AI receptionist is asking about a booking — review it." The hook badge key in [`useDashboardCounts.ts`](../../../frontend/hooks/useDashboardCounts.ts) renames from `matchReviewsUnconfirmed` → `bookingReviewsUnconfirmed`. The backend endpoint `/api/v1/service-staff-reviews` is **unchanged** (DL-10 — no backend touch). |
| **DL-5** | **Rename the route too: `/dashboard/service-reviews` → `/dashboard/booking-review`.** Add a Next.js redirect from the old path → new path that survives at least one release window. | Keeps the URL coherent with the label. The redirect handles bookmarks and any external link from notification emails. Folder rename in `frontend/app/dashboard/`; the page logic itself moves untouched. |
| **DL-6** | **Rename `Notifications` → `Alerts`** (label only). The link still anchors to `/dashboard#notifications` (the bell anchor on the cockpit). | Single label flip. The `id="notifications"` anchor in `InboxColumn` stays — that's an internal anchor, not a user-visible label. |
| **DL-7** | **Drop the entire `SETUP` section from the sidebar.** Settings stays reachable via the profile dropdown (already wired); Integrations stays reachable via Settings landing → "Integrations" card (already wired). | Net loss of 2 sidebar entries. Zero loss of reachability. Pull-the-mat tested: `frontend/app/dashboard/settings/page.tsx` already renders Practice Setup + Integrations as the two landing cards. |
| **DL-8** | **Move the collapse toggle to the top of the sidebar.** Icon-only (no "Collapse" text). Match `h-14` so it baseline-aligns with the top header bar. Right-align in expanded mode, center in collapsed mode (Cursor pattern). Tooltip preserved for accessibility. | The bottom-of-sidebar `<div className="border-t...">` block in `Sidebar.tsx` moves to a top strip *inside* the `<aside>`, *above* the `<nav>`. Mobile drawer hides the toggle entirely (`hidden md:flex`). |
| **DL-9** | **Mobile drawer is unchanged.** Full labels, no collapse-to-icon mode, no top toggle (it's already a slide-in drawer). | The existing `collapsed` prop is already ignored on mobile per `Sidebar.tsx`. We add `hidden md:flex` to the new top-of-sidebar collapse button so it doesn't appear in the drawer either. |
| **DL-10** | **No backend changes.** No DB migration, no API rename, no email-template touch beyond the redirect that DL-5 mints automatically. | Effort estimate (≤0.5 day) depends on this. If anyone wants to also rename `service_staff_review_requests` table or `/api/v1/service-staff-reviews` endpoint, that becomes a separate plan. |
| **DL-11** | **Calendar view stays parked.** Not in scope. If/when a doctor asks "where's the week-grid view?", that's a future plan, not a justification for keeping `Appointments` in the sidebar. | Confirmed in chat. The first `Insights` content drop should also explicitly NOT be a calendar substitute. |

---

## What changes vs what stays

The single most calming thing about this plan: **almost no code surface is touched.**

### 🟡 Touched (one diff each)

- `frontend/components/layout/Sidebar.tsx` — `navSections` rewritten; bottom collapse block moves to top.
- `frontend/hooks/useDashboardCounts.ts` — rename field `matchReviewsUnconfirmed` → `bookingReviewsUnconfirmed`; update one fetch comment. Endpoint URL unchanged.
- `next.config.ts` (or a `redirects()` entry) — add `/dashboard/service-reviews` → `/dashboard/booking-review`.

### 🟢 Renamed / moved (no behaviour change)

- `frontend/app/dashboard/service-reviews/` → `frontend/app/dashboard/booking-review/` (folder rename; page contents identical).
- Optional follow-up: `frontend/components/service-reviews/ServiceReviewsInbox.tsx` → `frontend/components/booking-review/BookingReviewInbox.tsx`. **Out of scope for v1** — internal class/file names don't ship to doctors. We'll rename if it becomes confusing during future work, not pre-emptively.

### 🆕 Created

- `frontend/app/dashboard/insights/page.tsx` — server component, ~20 LOC, `<h1>Insights</h1>` + "Coming soon" subtitle.

### 🚫 Untouched

- `/dashboard/appointments` (the bare list page) — kept reachable, just no sidebar entry.
- `/dashboard/settings/*` — entire settings tree untouched. Only the *primary nav entries* go.
- `/api/v1/service-staff-reviews` — backend endpoint name preserved.
- `service_staff_review_requests` table — preserved.
- `HeaderProfileMenu.tsx` — `Settings` link already exists; not changing.
- All consumers of `/dashboard/appointments` ("back to list" links across cockpit, NowNextCard, TodaysSchedule, OpdTodayClient, v2 cockpit page, e2e test) — keep working as-is.

### Final sidebar surface

After this plan ships, the sidebar reads:

```
TODAY                        ← (or remove headings — see S1.4)
  Today                     /dashboard
  OPD                       /dashboard/opd-today        [opdLive badge]

CARE
  Patients                  /dashboard/patients
  Insights                  /dashboard/insights         [empty page]

INBOX
  Booking review            /dashboard/booking-review   [bookingReviewsUnconfirmed badge]
  Alerts                    /dashboard#notifications    [dashboardEventsUnread badge]
```

Six items total, down from eight. Two badges. No SETUP section.

---

## Decision matrix (single-screen overview)

Tick the column you want for each row. This table mirrors the per-item details below; it exists so the whole plan is reviewable in one screen before scrolling.

### S0 — Strategic decisions (locked above; column kept for audit)

| ID | Item | Yes | No | Modify | Notes |
|----|------|-----|-----|--------|-------|
| S0.1 | Rename `OPD queue` → `OPD` (DL-1) | [x] | [ ] | [ ] | |
| S0.2 | Drop `Appointments` from sidebar; keep page (DL-2) | [x] | [ ] | [ ] | |
| S0.3 | `Insights` placeholder, empty page (DL-3) | [x] | [ ] | [ ] | |
| S0.4 | Rename `Match reviews` → `Booking review` label (DL-4) | [x] | [ ] | [ ] | |
| S0.5 | Rename route `/service-reviews` → `/booking-review` + redirect (DL-5) | [x] | [ ] | [ ] | |
| S0.6 | Rename `Notifications` → `Alerts` (DL-6) | [x] | [ ] | [ ] | |
| S0.7 | Drop SETUP section entirely (DL-7) | [x] | [ ] | [ ] | |
| S0.8 | Move collapse toggle to top, icon-only (DL-8) | [x] | [ ] | [ ] | |
| S0.9 | Mobile drawer unchanged (DL-9) | [x] | [ ] | [ ] | |
| S0.10 | No backend changes (DL-10) | [x] | [ ] | [ ] | |
| S0.11 | Calendar parked (DL-11) | [x] | [ ] | [ ] | |

### S1 — Sidebar refactor (~2h)

| ID | Item | Yes | No | Modify | Notes |
|----|------|-----|-----|--------|-------|
| S1.1 | Rewrite `navSections` to the 6-item shape above | [x] | [ ] | [ ] | Folded into batch task `sr-03`. |
| S1.2 | Move collapse toggle from bottom to top of `<aside>` | [x] | [ ] | [ ] | Folded into batch task `sr-03`. |
| S1.3 | Drop the "Collapse" text label; keep tooltip + aria-label | [x] | [ ] | [ ] | Folded into `sr-03` (icon-only collapse button). |
| S1.4 | Section headings — keep TODAY / CARE / INBOX **or** flip to flat list | [x — keep headings] | [ ] | [ ] | See S-Q1 (locked). |
| S1.5 | Pick `Insights` icon (lucide) | [x — `BarChart3`] | [ ] | [ ] | See S-Q2 (locked). |
| S1.6 | Rename badge key `matchReviewsUnconfirmed` → `bookingReviewsUnconfirmed` in `useDashboardCounts.ts` | [x] | [ ] | [ ] | Updated **two** consumer sites — `Sidebar.tsx` AND `KpiStrip.tsx:171` (the "Pending DMs" KPI tile). Folded into `sr-03`. |

### S2 — Booking-review route rename (~1h)

| ID | Item | Yes | No | Modify | Notes |
|----|------|-----|-----|--------|-------|
| S2.1 | Move folder `app/dashboard/service-reviews/` → `app/dashboard/booking-review/` | [x] | [ ] | [ ] | Folded into batch task `sr-02`. |
| S2.2 | Add redirect `/dashboard/service-reviews` → `/dashboard/booking-review` in `next.config.mjs` | [x] | [ ] | [ ] | Folded into batch task `sr-02`. (Filename corrected — repo uses `.mjs`, not `.ts`.) |
| S2.3 | Update sidebar `href` to the new route | [x] | [ ] | [ ] | Folded into `sr-03` (sidebar restructure). |
| S2.4 | Smoke test — old URL still loads via redirect; new URL renders inbox | [x] | [ ] | [ ] | Folded into batch task `sr-04` (final smoke). |

### S3 — Insights placeholder (~30 min)

| ID | Item | Yes | No | Modify | Notes |
|----|------|-----|-----|--------|-------|
| S3.1 | New file `app/dashboard/insights/page.tsx` — server component, auth check, render `<h1>Insights</h1>` + "Coming soon" subtitle | [x] | [ ] | [ ] | Batch task `sr-01`. |
| S3.2 | Add sidebar entry pointing at `/dashboard/insights` with a `BarChart3` (or chosen) lucide icon | [x] | [ ] | [ ] | Folded into `sr-03`. |

### S4 — Out-of-scope here (parked; can be promoted later)

| ID | Item | Promote? (Y/N) | Notes |
|----|------|----------------|-------|
| S4.1 | Real `Insights` content (KPIs / mini-charts / source mix) | [ ] | A separate plan once a doctor asks. v1 is just the URL stake. |
| S4.2 | Reroute "back to list" links from `/dashboard/appointments` → `/dashboard/opd-today` | [ ] | Worth doing; out of scope here so we don't smear two refactors together. |
| S4.3 | Rename `service_staff_review_requests` table + `/api/v1/service-staff-reviews` endpoint to match the UI | [ ] | DL-10 forbids it. Pure cosmetic value; the column / endpoint name is internal. |
| S4.4 | Sidebar bottom slot — show doctor name + practice name (Notion-style) | [ ] | See S-Q3. Easy follow-up if we miss the visual breathing room. |
| S4.5 | Calendar view (week / month grid) | [ ] | DL-11 parks it. |
| S4.6 | `Insights` hotkey reservation (e.g. `Cmd+Shift+5`) | [ ] | Defer until S4.1 lands. |

---

## Per-item details (decisions live here too — the table above is just a summary)

### S1 · Sidebar refactor

> **Why this is one batch:** all five S1 items touch the same file (`Sidebar.tsx`). Splitting them across PRs creates merge churn for zero benefit. S1.6 touches one extra file (`useDashboardCounts.ts`) but is logically the same change.

#### S1.1 — Rewrite `navSections`

**Decision:** [ ] Yes  [ ] No  [ ] Modify  
**Notes:**

**What:** Replace the existing `navSections` constant in [`frontend/components/layout/Sidebar.tsx`](../../../frontend/components/layout/Sidebar.tsx) with the 6-item structure shown in "Final sidebar surface" above. Drop the `Appointments` entry. Drop the entire `SETUP` section. Add the `Insights` entry. Update labels (`OPD queue` → `OPD`, `Match reviews` → `Booking review`, `Notifications` → `Alerts`).

**Why one diff:** The `navSections` constant is data, not logic. Treating these as N micro-PRs is busywork.

**Effort:** ~30 min including the import cleanup (`Settings as SettingsIcon`, `Plug`, `CalendarDays` removals; `BarChart3` or chosen icon add).

**Depends on:** S1.5 (icon choice), S1.6 (badge-key rename).

**Reversibility:** Trivial — git revert.

---

#### S1.2 — Move collapse toggle to top

**Decision:** [ ] Yes  [ ] No  [ ] Modify  
**Notes:**

**What:** The current bottom block in `Sidebar.tsx` (lines ~225–244, the `<div className="hidden md:flex border-t border-border p-2">…</div>`) moves to a top strip *inside* the `<aside>`, *above* the `<nav>`. The new strip:

- Height: `h-14` to match the top `<header>` bar.
- Border: `border-b border-border` (replaces `border-t`).
- Layout: `flex items-center px-2`. In expanded mode, `justify-end` (right-align). In collapsed mode, `justify-center`.
- Visibility: `hidden md:flex` — never appears in the mobile drawer.

**Why h-14:** the top header bar is `sticky top-0 z-40 flex h-14` ([`Header.tsx`](../../../frontend/components/layout/Header.tsx) L70). Matching the height makes the collapse button baseline-align with the brand mark and search box across the chrome. Visually, the top of the sidebar reads as one continuous bar with the header instead of "header + sidebar with extra strip".

**Effort:** ~30 min.

**Depends on:** none.

**Reversibility:** Trivial.

---

#### S1.3 — Drop the "Collapse" text label

**Decision:** [ ] Yes  [ ] No  [ ] Modify  
**Notes:**

**What:** The expanded-mode button currently renders `<PanelLeftClose />` + `<span className="text-xs">Collapse</span>`. Drop the `<span>`. Both states (expanded / collapsed) become icon-only:

- Expanded: `<PanelLeftClose className="h-4 w-4" />`
- Collapsed: `<PanelLeftOpen className="h-4 w-4" />`

`aria-label` and a Tooltip continue to provide the accessible name (`"Collapse sidebar"` / `"Expand sidebar"`).

**Why no text:** Cursor / Notion / Linear all use icon-only collapse toggles. The text adds nothing for power users (who learn the icon in one session) and visually competes with sidebar item labels for the eye.

**Effort:** Folded into S1.2 (~5 min within the same block edit).

**Depends on:** S1.2.

**Reversibility:** Trivial.

---

#### S1.4 — Section headings: keep or drop?

**Decision:** [ ] Yes (keep TODAY / CARE / INBOX)  [ ] No (flat list)  [ ] Modify  
**Notes:** **Open question — see S-Q1.**

**Recommendation:** Default to **keeping the three section headings** for v1 because:

1. Visual scaffolding helps doctors orient on first use.
2. The badge density already pulls the eye — section headings absorb that load.
3. Flipping to a flat list later is a one-line CSS-conditional change; flipping the other way after doctors learn the layout is more disruptive.

If the user explicitly votes "flat list" in chat before promotion, swap the renderer to a single flat list with one subtle `border-t` between Insights and Booking review.

**Effort:** Flat-list flip is ~10 min if chosen.

---

#### S1.5 — Insights icon

**Decision:** [ ] Yes (`BarChart3`)  [ ] No (other)  [ ] Modify  
**Notes:** **Open question — see S-Q2.**

Candidates from `lucide-react`:

- `BarChart3` — recommended. Universal "analytics/insights" signal; differentiates clearly from other operational icons.
- `LineChart` — softer; reads as "trends".
- `Sparkles` — implies AI; might over-promise for an empty placeholder.
- `TrendingUp` — biased toward positive movement; overcommits.

Recommendation: `BarChart3`. Same icon already used on the Settings landing card for "Practice Setup", so we'd want to swap one of them eventually — but the practice-setup card is a 1-touch screen, while the sidebar is permanent. Sidebar wins the icon; Practice Setup card can take `Settings2` or `Cog` later.

**Effort:** Folded into S1.1.

---

#### S1.6 — Rename badge key

**Decision:** [ ] Yes  [ ] No  [ ] Modify  
**Notes:**

**What:** In [`frontend/hooks/useDashboardCounts.ts`](../../../frontend/hooks/useDashboardCounts.ts):

- Rename interface field `matchReviewsUnconfirmed` → `bookingReviewsUnconfirmed`.
- Rename the local variable `matchReviewsUnconfirmed` to match.
- Update the JSDoc comment ("matchReviewsUnconfirmed: GET /api/v1/service-staff-reviews?status=pending" → "bookingReviewsUnconfirmed: GET /api/v1/service-staff-reviews?status=pending"). The endpoint URL is preserved (DL-10).

The sidebar's `badgeKey` reference flips to `"bookingReviewsUnconfirmed"`.

**Why:** Keeps the data layer's semantics aligned with the user-visible label. A future contributor reading the hook shouldn't have to context-switch ("oh, `matchReviews` is what we now call `Booking review`").

**Effort:** ~15 min.

**Depends on:** S1.1 (sidebar uses the renamed key).

**Reversibility:** Trivial.

---

### S2 · Booking-review route rename

> **Why a route rename and not just a label:** The URL is part of the brand. A doctor sharing `/dashboard/service-reviews` with a teammate (or a help-desk ticket) reads as something different from what their sidebar says. One coherent name across label + URL.

#### S2.1 — Move the folder

**Decision:** [ ] Yes  [ ] No  [ ] Modify  
**Notes:**

**What:** `git mv frontend/app/dashboard/service-reviews frontend/app/dashboard/booking-review`. The `page.tsx` inside is unchanged. The component it imports (`ServiceReviewsInbox`) keeps its current import path — internal file/class names are out of scope (see S4 / "Renamed / moved").

**Effort:** ~5 min.

**Depends on:** none.

**Reversibility:** Trivial via `git mv` back.

---

#### S2.2 — Add the redirect

**Decision:** [ ] Yes  [ ] No  [ ] Modify  
**Notes:**

**What:** Add a redirect to `frontend/next.config.ts`:

```ts
async redirects() {
  return [
    {
      source: "/dashboard/service-reviews",
      destination: "/dashboard/booking-review",
      permanent: true,
    },
  ];
}
```

**Why permanent (308):** the rename is final; we want crawlers and the browser cache to update. We can revert to a temporary (307) if we anticipate flipping back, but DL-5 commits to this rename.

**Lifetime:** keep the redirect entry indefinitely. Removing it is a follow-up sweep when audit shows zero traffic on the old path (≥30 days). Add a `// TODO: remove after 2026-06-15 if no traffic` comment so we don't forget.

**Effort:** ~10 min.

**Depends on:** S2.1.

**Reversibility:** Trivial.

---

#### S2.3 — Update sidebar `href`

**Decision:** [ ] Yes  [ ] No  [ ] Modify  
**Notes:**

**What:** In `Sidebar.tsx`, the `Booking review` entry's `href` becomes `/dashboard/booking-review`. Folded into S1.1.

**Effort:** Folded into S1.1.

---

#### S2.4 — Smoke test

**Decision:** [ ] Yes  [ ] No  [ ] Modify  
**Notes:**

**What:** Manual checks before merge:

1. Navigate to `/dashboard/booking-review` directly in the browser → renders the inbox.
2. Navigate to `/dashboard/service-reviews` → 308 redirect to `/dashboard/booking-review`, inbox renders.
3. Click the sidebar entry → lands on `/dashboard/booking-review` with the active-route highlight.
4. Confirm the badge count still updates (the API endpoint is unchanged; the only path that could break is the badge-key rename).

**Effort:** ~15 min.

**Depends on:** S2.1, S2.2, S2.3, S1.6.

---

### S3 · Insights placeholder

> **Why a placeholder is enough for v1:** The sidebar is changing. We want one cutover, not two. Staking the URL now means doctors learn the layout once. The empty page is honest — "we're going to put something here" — and prevents the next sidebar plan from arguing about whether Insights deserves a slot.

#### S3.1 — New page file

**Decision:** [ ] Yes  [ ] No  [ ] Modify  
**Notes:**

**What:** New file `frontend/app/dashboard/insights/page.tsx`. Server component. Standard auth pattern (`createClient` → `getUser` → redirect to `/login` if absent — copy the shape from `frontend/app/dashboard/patients/page.tsx`).

Body:

```tsx
return (
  <div className="space-y-2">
    <h1 className="text-2xl font-semibold text-foreground">Insights</h1>
    <p className="text-muted-foreground">Coming soon.</p>
  </div>
);
```

**Lines:** ~20 LOC.

**Effort:** ~15 min.

**Depends on:** none.

**Reversibility:** Trivial.

---

#### S3.2 — Sidebar entry

**Decision:** [ ] Yes  [ ] No  [ ] Modify  
**Notes:**

**What:** Folded into S1.1. The `Insights` entry sits in the `CARE` section between `Patients` and a future expansion slot.

**Effort:** Folded into S1.1.

---

## Sequencing recommendation

Since the whole plan is ~3.5 hours of work, it ships in one batch on one day:

```
Day 1  (~3.5h total)
 │   S1.1  navSections rewrite                                    [30m]
 │   S1.2  collapse toggle move to top                            [30m]
 │   S1.3  drop "Collapse" text                                   [folded]
 │   S1.4  decide flat vs sectioned (set in S1.1 itself)          [—]
 │   S1.5  pick Insights icon (set in S1.1 itself)                [—]
 │   S1.6  badge key rename                                       [15m]
 │   ▼
 │   S3.1  insights page.tsx                                      [15m]
 │   S3.2  insights sidebar entry                                 [folded]
 │   ▼
 │   S2.1  folder rename                                          [5m]
 │   S2.2  add redirect                                           [10m]
 │   S2.3  update sidebar href                                    [folded]
 │   S2.4  smoke test                                             [15m]
 │   ▼
 │   Final QA: open every sidebar entry; confirm badges; collapse;
 │             expand; mobile drawer; old service-reviews URL.    [30m]
```

**Parallelism opportunity:** none worth coordinating — the work is small and serial dependencies are tight.

---

## Success criteria

| Metric | Today | Target after S2 + S3 |
|---|---|---|
| Sidebar items | 8 | 6 |
| Sidebar sections | 4 (TODAY / CARE / INBOX / SETUP) | 3 (TODAY / CARE / INBOX) — or 0 if S1.4 flips to flat list |
| Sidebar items whose label is jargon | 1 (`Match reviews`) | 0 |
| Sidebar items whose label lies about destination | 1 (`OPD queue` is wrong in slot mode) | 0 |
| Paths to `/dashboard/settings` | 2 (sidebar + profile menu) | 1 (profile menu only) |
| Collapse toggle visibility on a 768px-tall viewport with sidebar scrolled | Off-screen sometimes | Always visible (top-anchored) |
| Old `service-reviews` bookmark loads | Renders inbox | 308-redirects to `/booking-review`, then renders inbox |
| Backend changes | n/a | 0 (DL-10 enforced) |
| Time-to-ship | n/a | ≤0.5 dev-day |

---

## Open questions (LOCKED 2026-05-14 in chat — defaults accepted)

#### S-Q1 — Section headings or flat list?

**Question:** With the changes, every section has exactly 2 items. Three labelled sections × 2 items each starts feeling heavy. Options:

- **Keep TODAY / CARE / INBOX headings** (current default; visual scaffolding for first-time use).
- **Drop headings, single flat list** (Linear style; cleaner, more density). Order: `Today` → `OPD` → `Patients` → `Insights` → `Booking review` → `Alerts`. One thin `border-t` between `Insights` and `Booking review` to separate operational from inbox-style items.

**Recommendation:** Keep headings for v1 — easier orient, and flipping to flat is a 10-min change later if it feels over-scaffolded.

**Decision:** [x] Keep headings  [ ] Flat list  [ ] Modify

---

#### S-Q2 — Insights icon

**Question:** `BarChart3` vs `LineChart` vs other? The Settings landing card currently uses `BarChart3` for Practice Setup — if we use it for Insights too, we introduce a duplicate.

**Recommendation:** Take `BarChart3` for Insights (sidebar = permanent surface). Swap Settings landing's Practice Setup icon to `Cog` or `Settings2` in a follow-up touch (~5 min, independent change).

**Decision:** [x] BarChart3  [ ] LineChart  [ ] Other (specify)

> **Follow-up:** capture a one-line task for the Settings-landing icon swap (`BarChart3` → `Settings2`) into [`docs/Work/capture/inbox.md`](../../capture/inbox.md). Out of scope for this batch.

---

#### S-Q3 — Sidebar bottom slot

**Question:** Once the collapse toggle moves to the top, the bottom of the sidebar is empty real estate. Options:

- **Leave empty** — visual breathing room.
- **Doctor name + practice name** (Notion sidebar bottom pattern) — saves a click vs opening the profile dropdown to confirm which account is signed in.
- **Help & feedback link** — only if we have a destination to point at.

**Recommendation:** Leave empty for v1. The header pill (`PracticePill`) already shows the practice/doctor identity. Promote to S4.4 if we miss the breathing room after a week.

**Decision:** [x] Leave empty  [ ] Doctor + practice  [ ] Help link  [ ] Modify

---

#### S-Q4 — Reroute "back to list" links?

**Question:** 9+ "back to list" links across the cockpit and dashboard land at `/dashboard/appointments`. After this plan, that page is no longer in primary nav — should those back-arrows reroute to `/dashboard/opd-today` (the new "where you spend your day" surface)?

**Recommendation:** Defer to S4.2. Two refactors at once smear the diff. Keep back-arrows pointing at the list (which still works) and audit usage in a week.

**Decision:** [x] Defer to S4.2  [ ] Reroute now  [ ] Modify

---

#### S-Q5 — Internal file rename (`ServiceReviewsInbox` → `BookingReviewInbox`)?

**Question:** The component class and folder under `frontend/components/service-reviews/` keep the old name. Rename for consistency, or leave for a follow-up?

**Recommendation:** Leave for follow-up (out of scope here). Internal class names don't ship to doctors; renaming them now adds ~30 min and ~15 import-path edits for zero user-visible value. Bundle into S4.3 if/when we touch backend names.

**Decision:** [x] Leave  [ ] Rename now  [ ] Modify

---

## Plan rules (pre-ship workflow)

These apply while the plan is `Drafted` / `Selected`.

1. **Editing this file is welcome** under any `Notes:` line. Don't edit headers / IDs.
2. **Don't renumber items.** S-IDs are stable. New items take the next available number; killed items keep their ID and gain `[KILLED]` suffix.
3. **When all items in S0–S3 have a `Decision:` ticked and S-Q1..Q5 are resolved, this plan promotes to a dated batch** under `Daily-plans/May 2026/14-05-2026/sidebar-restructure/plan-sidebar-restructure-batch.md` (or whatever date it ships) and becomes `Committed`.
4. **Implementation MUST NOT start until promotion.** S-IDs are decided here; the daily-plans batch derives the per-task files from those IDs.
5. **The redirect from S2.2 must work continuously after merge.** Removing it requires a follow-up commit and a comment-driven sunset date (currently 2026-06-15 per S2.2 notes).

---

**Created:** 2026-05-14.  
**Status:** `Committed` 2026-05-14 (promoted to [batch](../Daily-plans/May%202026/14-05-2026/sidebar-restructure/plan-sidebar-restructure-batch.md)).  
**Owner:** TBD.
