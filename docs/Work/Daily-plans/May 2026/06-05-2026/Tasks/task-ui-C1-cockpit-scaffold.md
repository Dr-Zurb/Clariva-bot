# Task ui-C1: Cockpit page scaffold + KPI strip + "no vanity charts" guardrail

## 06 May 2026 — Batch [UI system redesign](../plan-ui-system-redesign-batch.md) — Sub-batch C (Today cockpit) — **S item, ~3h**

---

## Task overview

Today's [`frontend/app/dashboard/page.tsx`](../../../../../frontend/app/dashboard/page.tsx) renders an `<h1>Dashboard</h1>`, the literal sentence "Welcome. Use the sidebar to go to Appointments or Patients.", and the `<DoctorDashboardEventFeed>`. That's it. A doctor logging in has no idea what to do next without first reading the sidebar.

This task replaces that body with the **Today cockpit scaffold**: a responsive grid that hosts (in subsequent C2–C5 tasks) the Now/Next card, OPD queue strip, Inbox column, and Today's schedule. C1 also ships the **KPI strip** at the very top (3 numbers: today's consults / pending DMs / Rx sent today) and the explicit "no vanity charts" guardrail (a code comment + a unit-test pin so future contributors don't add bar charts).

C1 is the first child to land in C; C2–C5 fill its zones. Renders gracefully even before C2–C5 ship — empty zones show a `Skeleton` placeholder with a note "Coming in C2 / C3 / C4 / C5".

**Estimated time:** ~3h.

**Status:** Drafted.

**Hard deps:** A2 close (`Card`, `Skeleton`, `Badge`, `Separator` primitives).

**Soft deps:** B1 (header Start consult CTA exists; cockpit will reference it conceptually but not depend on it for rendering).

**Source:** [U3.1](../../../../Product%20plans/plan-ui-system-redesign.md#u31--replace-dashboard-landing-body) + [U3.6](../../../../Product%20plans/plan-ui-system-redesign.md#u36--thin-kpi-strip) + [U3.7](../../../../Product%20plans/plan-ui-system-redesign.md#u37--skip-vanity-charts-in-v1).

---

## Model & execution guidance

**Recommended model:** **Sonnet 4.6 Medium**.

**Why this tier:** Bounded; pure layout composition; clear deliverable. Sonnet handles layout grids cleanly.

**New chat?** Yes — fresh chat. C1 unblocks C2/C3/C4/C5; each of those is its own chat.

**Pre-load (paste at start):**

- This task file (full).
- Current contents of [`frontend/app/dashboard/page.tsx`](../../../../../frontend/app/dashboard/page.tsx).
- A2's resolved `frontend/components/ui/card.tsx` (so the agent sees the Card API).

**Estimated turns:** 1–2.

**Escalate to Opus if:** never for this task.

**Composer-OK sub-steps:** the post-ship status sync is Composer.

---

## Acceptance criteria

### Page structure

- [ ] **`frontend/app/dashboard/page.tsx` body replaced** with:
  ```tsx
  <div className="space-y-6">
    <KpiStrip token={token} />
    <div className="grid gap-6 lg:grid-cols-12">
      <div className="space-y-6 lg:col-span-8">
        <NowNextCard token={token} />          {/* C2 — placeholder until shipped */}
        <OpdQueueStrip token={token} />        {/* C3 — placeholder until shipped */}
        <TodaysSchedule token={token} />       {/* C5 — placeholder until shipped */}
      </div>
      <aside className="lg:col-span-4">
        <InboxColumn token={token} />          {/* C4 — placeholder until shipped */}
      </aside>
    </div>
  </div>
  ```
- [ ] On `<lg`, columns stack vertically (default flex behavior of the grid).
- [ ] Page metadata: `export const metadata = { title: "Today" }` so the browser tab title resolves to "Today · Clariva" (per A5 metadata template).
- [ ] The existing `id="notifications"` anchor + `<DoctorDashboardEventFeed>` mount **moves into `InboxColumn`** (C4 owns it). For C1, render a `Skeleton` placeholder for `InboxColumn` and **explicitly preserve** the `id="notifications"` attribute on the placeholder so the bell's `#notifications` anchor scroll keeps working in the interim.

### KPI strip

- [ ] **`frontend/components/dashboard/cockpit/KpiStrip.tsx`** — **new** (~120 LOC).
- [ ] Three numeric cards in a responsive row (`grid grid-cols-3 gap-4` on `sm+`, stacked on `<sm`):
  | KPI | Value source |
  |---|---|
  | Today's consults | `<done>/<total>` from today's appointments grouped by `consultation_session.status === "ended"` count vs total appointments today |
  | Pending DMs | match-reviews unconfirmed count (same source as B3 sidebar badge) |
  | Rx sent today | count of prescriptions `created_at >= today_start` AND status sent (use existing prescription list endpoint with date filter) |
- [ ] Each KPI card: `Card` with title (`text-xs font-medium uppercase text-muted-foreground`), value (`text-2xl font-semibold tabular-nums`), optional one-line context (`text-xs text-muted-foreground` — "+2 since yesterday" stretch goal, V1 = empty).
- [ ] **Use `font-tabular`** (from A3) on the values so digits don't jitter.
- [ ] **Loading state:** `Skeleton` rectangle for the value while data is in-flight.
- [ ] **Error / empty state:** "—" in the value position; no error banner (KPIs are ambient, not blocking).

### KPI data source

- [ ] **Reuse `useDashboardCounts` from B3** if it shipped first (provides `matchReviewsUnconfirmed`).
- [ ] **For "Today's consults"**: filter `getAppointments(token)` results client-side by `appointment_date` startsWith today's ISO date (per browser locale). Count `total` and `done` separately.
- [ ] **For "Rx sent today"**: client-side count from a small new helper `getRxSentTodayCount(token)` calling the existing prescription list endpoint with a `date_from=<today>` query param IF supported, else client-side filter — same fallback pattern as B4 search. Don't add backend work here.

### "No vanity charts" guardrail

- [ ] Comment block at the top of the cockpit page:
  ```
  // Cockpit V1: workflow-first command center.
  //
  // EXPLICITLY NO vanity charts (bar charts, sparklines, "patients seen this week" graphs)
  // per U3.7 in plan-ui-system-redesign.md. Clinicians don't visit a dashboard to admire graphs.
  // If we want analytics later, that's a separate /dashboard/insights page.
  //
  // Adding a chart here? Move it. Or open a fresh batch and justify with a doctor-pilot result.
  ```
- [ ] **Optional unit-test pin:** add a tiny test under `frontend/__tests__/` (or wherever the project's tests live) that greps the cockpit folder for `recharts|chart.js|d3|nivo` imports and fails if found. Skip if no test infra exists; the comment is sufficient for V1.

### Empty / loading

- [ ] **First-paint:** KPI strip + section placeholders render immediately with `Skeleton` content.
- [ ] **Hydration:** no layout shift between SSR and CSR.

### General

- [ ] Type-check + lint clean.
- [ ] No console errors.
- [ ] Responsive at 375 / 768 / 1024 / 1440.
- [ ] Browser tab title shows "Today · Clariva".

---

## Out of scope

- **Now/Next card body.** That's [C2](./task-ui-C2-cockpit-now-next.md). C1 ships only a placeholder.
- **OPD queue strip body.** That's [C3](./task-ui-C3-cockpit-opd-strip.md).
- **Inbox column body.** That's [C4](./task-ui-C4-cockpit-inbox-column.md). C1 preserves the `#notifications` anchor for the bell to scroll to.
- **Today's schedule body.** That's [C5](./task-ui-C5-cockpit-todays-schedule.md).
- **Trend lines on KPIs.** "+2 since yesterday" copy hint is V1.1; don't ship in V1.
- **Configurable KPIs.** Fixed three in V1.

---

## Files expected to touch

**Frontend:**
- `frontend/app/dashboard/page.tsx` — **edit** (~80 LOC: replace body with cockpit composition).
- `frontend/components/dashboard/cockpit/KpiStrip.tsx` — **new** (~120 LOC).
- `frontend/components/dashboard/cockpit/NowNextCard.tsx` — **new placeholder** (~10 LOC; C2 fills).
- `frontend/components/dashboard/cockpit/OpdQueueStrip.tsx` — **new placeholder** (~10 LOC; C3 fills).
- `frontend/components/dashboard/cockpit/InboxColumn.tsx` — **new placeholder with `id="notifications"`** (~20 LOC; C4 fills).
- `frontend/components/dashboard/cockpit/TodaysSchedule.tsx` — **new placeholder** (~10 LOC; C5 fills).

**Backend / migrations / tests:** none. (Optional unit-test pin is V1.1 if no test infra; skip in V1.)

---

## Notes / open decisions

1. **12-col grid vs simple `flex` columns.** 12-col gives finer responsive control; for a 2-column layout (8/4 split on `lg+`, stacked on `<lg`) it's overkill but harmless. Stick with `lg:grid-cols-12` + col-spans for symmetry with the appointment-detail redesign in D1 (which uses 12-col).
2. **Where to mount the keyboard `Cmd+K` listener.** B4's task already places it in `DashboardShell`; C1 doesn't touch this.
3. **Where to mount Plan Mode for analytics later.** Out of V1; if the user asks "but I want a chart of this week's consults", the answer is "open a separate plan / batch", not "edit C1."
4. **`tabular-nums` on KPI values.** Critical so the values don't bounce when re-fetched. Make sure A3 utility is loaded.
5. **Anchor preservation.** The bell currently scrolls to `#notifications` — if C1 ships before C4, the placeholder's `id="notifications"` still resolves the anchor target so nothing breaks for the user.

---

## References

- **Batch plan:** [plan-ui-system-redesign-batch.md § Sub-batch C](../plan-ui-system-redesign-batch.md#sub-batch-c--today-cockpit-5-items-152-days)
- **Source items:** [U3.1](../../../../Product%20plans/plan-ui-system-redesign.md#u31--replace-dashboard-landing-body), [U3.6](../../../../Product%20plans/plan-ui-system-redesign.md#u36--thin-kpi-strip), [U3.7](../../../../Product%20plans/plan-ui-system-redesign.md#u37--skip-vanity-charts-in-v1)
- **Hard dep:** [task-ui-A2-shadcn-bootstrap.md](./task-ui-A2-shadcn-bootstrap.md)
- **Sibling tasks:** C2, C3, C4, C5 (each fills a zone of the scaffold)
- **Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md)

---

**Owner:** TBD  
**Created:** 2026-05-06  
**Status:** Drafted; blocked on A2 close.
