# Task ui-B3: Sidebar badge counts (live polling) + desktop collapse-to-icons

## 06 May 2026 — Batch [UI system redesign](../plan-ui-system-redesign-batch.md) — Sub-batch B (Shell) — **M item, ~5h**

---

## Task overview

Once B2's regrouped sidebar lands, two upgrades make it pull weight all day:

1. **Badge counts** next to items where freshness matters: unread match-reviews count, live OPD queue size, unread dashboard-events count. Same reason browsers show unread tab badges — pulls eyes to where work waits.
2. **Desktop collapse-to-icons** — a toggle that compresses the desktop sidebar from 224px (`w-56`) to a 56px icon-only rail. Reclaims real-estate for appointment-detail and patient-detail pages on smaller laptops.

Mobile drawer behavior is **untouched**. The collapse toggle is desktop-only.

**Estimated time:** ~5h. Roughly 2.5h for counts (hook + UI), 2.5h for collapse (DashboardShell state, Sidebar adapt, Tooltip on icon-only items).

**Status:** Drafted.

**Hard deps:** B2 (regrouped sidebar provides the section structure to attach badges to). A2 (`Tooltip` for icon-only state).

**Soft deps:** Backend optional `GET /api/v1/dashboard/counts` aggregator endpoint — see Notes #1.

**Source:** [U2.8](../../../../Product%20plans/plan-ui-system-redesign.md#u28--sidebar-badge-counts) + [U2.9](../../../../Product%20plans/plan-ui-system-redesign.md#u29--sidebar-desktop-collapse-to-icons).

---

## Model & execution guidance

**Recommended model:** **Sonnet 4.6 Medium** for both halves.

**Why this tier:** Bounded; small new hook; UI state lift to `DashboardShell`; clear pattern. No PHI surface, no auth/RLS new code.

**Escalate to Opus if:** you decide to ship the optional `/v1/dashboard/counts` aggregator endpoint — that's a backend route + service + auth path. The route itself isn't security-sensitive (returns counts, not data), but new routes touching `auth.uid()` deserve one Opus turn for the design before Sonnet types it.

**New chat?** Yes — fresh chat. **Consider splitting into two chats:** one for counts (data + UI), one for collapse (DashboardShell state). They share files but the topics are independent — splitting keeps each chat tight.

**Pre-load (paste at start) — counts chat:**

- This task file (full).
- B2's resolved [`Sidebar.tsx`](../../../../../frontend/components/layout/Sidebar.tsx).
- Current existing endpoints: paste `rg "router.get" backend/src/routes/api/v1/service-staff-reviews.ts backend/src/routes/api/v1/opd.ts backend/src/routes/api/v1/dashboard-events.ts -A 2` (so the agent sees the existing per-domain endpoints to choose between aggregating client-side vs server-side).

**Pre-load — collapse chat:**

- This task file (full).
- B2's resolved `Sidebar.tsx`.
- Current [`DashboardShell.tsx`](../../../../../frontend/components/layout/DashboardShell.tsx).

**Estimated turns:** 2 per chat.

**Composer-OK sub-steps:** the localStorage persistence write for collapsed state (one effect) is Composer-safe if you're already in a Composer session. Otherwise let Sonnet handle it.

---

## Acceptance criteria

### Counts hook

- [ ] **`frontend/hooks/useDashboardCounts.ts`** — **new** (~120 LOC). Contract:
  ```ts
  export interface DashboardCounts {
    matchReviewsUnconfirmed: number;
    opdLive: number;
    dashboardEventsUnread: number;
  }
  export function useDashboardCounts(token: string): {
    counts: DashboardCounts | null;
    isLoading: boolean;
    error: Error | null;
  };
  ```
- [ ] **Polling cadence:** every 30 seconds. Pauses when `document.visibilityState === "hidden"`. Resumes + immediate refetch on visibilitychange to "visible".
- [ ] **Initial fetch on mount.** Skips if `!token`.
- [ ] **Stale-while-revalidate:** keeps last value during refetch; only sets `isLoading: true` on first mount and after explicit error reset.
- [ ] **Error handling:** logs to console (no PHI in logs — counts are non-PHI), keeps last good value, retries on next interval.
- [ ] **Cleanup on unmount + on `token` change.**

### Counts data source — pick ONE strategy

- [ ] **Strategy A (recommended for V1, no new backend):** parallel client-side fetches over three existing endpoints, aggregated in the hook:
  - `GET /api/v1/service-reviews?status=pending&limit=1` → `total_count` from response (or count items).
  - `GET /api/v1/opd/session/snapshot` (if doctor JWT path exists) → length of `queue` array.
  - `GET /api/v1/dashboard/events?unread=true&limit=1` → `total_count`.
  Wrap in `Promise.all`; if any fails, count for that field is `null` and the badge hides for that one only.
- [ ] **Strategy B (cleaner long-term, requires new backend route):** single aggregator endpoint `GET /api/v1/dashboard/counts` returning `{ matchReviewsUnconfirmed, opdLive, dashboardEventsUnread }`. Backend service composes the three reads with `auth.uid() = doctor_id`.
- [ ] **Decision logged in implementation log:** which strategy shipped and why.

### Sidebar badges

- [ ] [`Sidebar.tsx`](../../../../../frontend/components/layout/Sidebar.tsx) accepts an optional `counts: DashboardCounts | null` prop (passed down from `DashboardShell` which calls `useDashboardCounts(token)`).
- [ ] Each item in `navSections` (from B2) gains an optional `badgeKey?: keyof DashboardCounts` field. Mapping:
  - "OPD queue" → `opdLive`.
  - "Match reviews" → `matchReviewsUnconfirmed`.
  - "Notifications" → `dashboardEventsUnread`.
- [ ] **Badge render:** small numeric pill on the right edge of the item:
  ```tsx
  {count > 0 && (
    <span className="ml-auto rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-medium leading-none text-primary-foreground">
      {count > 99 ? "99+" : count}
    </span>
  )}
  ```
- [ ] **Hidden when count is `0` or `null`.** Don't render `0`-pills.
- [ ] **In collapsed state (icon-only), the badge becomes a small dot** in the top-right corner of the icon — `absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-primary` — with the actual number in the `Tooltip`.

### Desktop collapse toggle

- [ ] **`DashboardShell.tsx` lifts `sidebarCollapsed` state.** Persisted via `localStorage` key `clariva.sidebar.collapsed` (boolean, default `false`).
- [ ] **Toggle button** sits at the bottom of the sidebar (or just below the SETUP section) on `md+`. Hidden on mobile. lucide `PanelLeftClose` (open state) / `PanelLeftOpen` (collapsed state) icons.
- [ ] **Collapsed state widths:**
  - `w-56` → `w-14` (sidebar).
  - `<aside>` retains the existing fixed/relative behavior; only the width changes.
- [ ] **In collapsed state:**
  - Section headings hidden.
  - Item label hidden; only icon visible, centered.
  - Click on icon still navigates.
  - Each icon wrapped in a `Tooltip` showing the full label + count (if any).
- [ ] **Smooth transition** via `transition-[width] duration-200 ease-in-out` (not transform — width changes affect layout flow which is what we want for the main content area to expand).
- [ ] **Mobile drawer unchanged** — collapsed state ignored on `<md`; the drawer is always full-width when open.

### Persistence

- [ ] **localStorage** read on mount, write on toggle. SSR-safe (no `localStorage` access during render — read in a `useEffect`).
- [ ] **Hydration mismatch avoided:** start in `false` (expanded) on the server, and accept the one-frame mismatch when hydrating; OR use `suppressHydrationWarning` on the affected node. Pick whichever is least surprising.

### Accessibility

- [ ] Toggle button has `aria-label="Collapse sidebar"` / `"Expand sidebar"` matching state.
- [ ] Tooltips on collapsed items use shadcn `Tooltip` which already handles ARIA.
- [ ] Keyboard: focus order through nav items unaffected by collapse.

### General

- [ ] Type-check + lint clean.
- [ ] No console errors.
- [ ] Visibility-pause polling verified manually (devtools → Performance → background tab → confirm no fetches).
- [ ] Mobile breakpoints unaffected.

---

## Out of scope

- **Per-doctor configurable counts** (which badges to show). All three are fixed in V1.
- **Push-based count updates** (websockets / Supabase realtime). Polling is fine for V1; revisit if doctors complain about staleness.
- **Server-side rendered counts.** SSR-rendering the badges is overkill; they update fast and the brief gap on first paint is fine.
- **Animation** on badge value changes. Out of scope; spec says simple visibility toggle.

---

## Files expected to touch

**Frontend:**
- `frontend/hooks/useDashboardCounts.ts` — **new** (~120 LOC).
- `frontend/components/layout/Sidebar.tsx` — **edit** (~80 LOC: accept `counts` prop, badge render, collapsed-state branches).
- `frontend/components/layout/DashboardShell.tsx` — **edit** (~40 LOC: collapsed state, persistence, pass `counts` down).
- `frontend/lib/api.ts` (or domain-specific clients) — **possible new helpers** for the three reads (Strategy A) OR for the new aggregator (Strategy B).

**Backend (Strategy B only):**
- `backend/src/routes/api/v1/dashboard-counts.ts` — **new** route (~30 LOC).
- `backend/src/services/dashboard-counts-service.ts` — **new** (~80 LOC).
- `backend/src/routes/api/v1/index.ts` — **edit** to mount the route.

**Tests:**
- `frontend/hooks/useDashboardCounts.test.ts` — **new** if hooks-test infra exists; otherwise smoke-test in dev.

---

## Notes / open decisions

1. **Strategy A vs B (single most important call).** A ships in this batch with no backend work; B is cleaner and faster (one DB round-trip, one auth check). **Default: ship A.** If three parallel fetches add visible latency, promote to B in a follow-up. Don't block this task on B.
2. **Polling cadence.** 30s is the default. If doctors find it stale, drop to 15s. If it spikes server load (Strategy B), bump to 60s with a manual "Refresh" affordance.
3. **Visibility pause.** Critical for cost — don't poll while the tab is backgrounded. `document.visibilityState` + `visibilitychange` event handles this cheaply.
4. **`opdLive` definition.** Number of patients currently in queue (not yet seen + not no-show). Confirm with the OPD service shape.
5. **`dashboardEventsUnread` vs the bell badge.** The bell already shows unread state; a sidebar count for "Notifications" is redundant. Acceptable redundancy: the sidebar entry is the ambient awareness; the bell is the focused interaction. If user finds it noisy, hide the sidebar badge for `dashboardEventsUnread`.
6. **Why localStorage for collapsed state.** Per-device per-doctor preference. Cookies would also work; localStorage is simpler. No PHI concern.

---

## References

- **Batch plan:** [plan-ui-system-redesign-batch.md § Sub-batch B](../plan-ui-system-redesign-batch.md#sub-batch-b--shell-4-items-15-days)
- **Source items:** [U2.8](../../../../Product%20plans/plan-ui-system-redesign.md#u28--sidebar-badge-counts), [U2.9](../../../../Product%20plans/plan-ui-system-redesign.md#u29--sidebar-desktop-collapse-to-icons)
- **Hard deps:** [task-ui-B2-sidebar-regrouping.md](./task-ui-B2-sidebar-regrouping.md), [task-ui-A2-shadcn-bootstrap.md](./task-ui-A2-shadcn-bootstrap.md)
- **Sibling tasks:** B1 (header), B4 (Cmd-K)
- **Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md) — hard rule #3 ("new migration / RLS / auth route → Opus") applies to Strategy B's new backend route.

---

**Owner:** TBD  
**Created:** 2026-05-06  
**Status:** Drafted; blocked on B2 close.
