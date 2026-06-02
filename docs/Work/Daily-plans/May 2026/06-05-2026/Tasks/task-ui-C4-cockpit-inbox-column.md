# Task ui-C4: Cockpit Inbox column (match-reviews + dashboard events + post-call follow-ups)

## 06 May 2026 — Batch [UI system redesign](../plan-ui-system-redesign-batch.md) — Sub-batch C (Today cockpit) — **M item, ~5h**

---

## Task overview

The cockpit splits work along a fundamental axis: **things that need the doctor's response** vs **things that need the doctor's time**. The Inbox column is the response side.

It merges three sources into one stacked, scannable column on the right (`lg:col-span-4`):

1. **Match reviews** — DM-lead bookings awaiting confirmation. From the existing match-reviews list endpoint. Top 3 + a "View all" link.
2. **Notifications** — replays this is the existing [`<DoctorDashboardEventFeed>`](../../../../../frontend/components/dashboard/DoctorDashboardEventFeed.tsx). Move it from C1's anchor placeholder into this column. Preserve the `id="notifications"` anchor.
3. **Post-call follow-ups** — sessions ended in the last 24h missing Rx or notes. Derived client-side from today's appointments.

C4 also unifies the visual register so all three groups feel like the same column, not three different mini-cards stacked.

**Estimated time:** ~5h.

**Status:** Drafted.

**Hard deps:** C1 (cockpit scaffold; placeholder with `id="notifications"` anchor exists). A2 close (`Card`, `Badge`, `ScrollArea`, `Separator`, `Skeleton`).

**Soft deps:** B3 (`useDashboardCounts` exposes `matchReviewsUnconfirmed` for the section header count; if not, fetch directly). C2 (shares `useTodaysAppointments` for the post-call-follow-ups derivation).

**Source:** [U3.4 in plan-ui-system-redesign.md](../../../../Product%20plans/plan-ui-system-redesign.md#u34--inbox-column).

---

## Model & execution guidance

**Recommended model:** **Sonnet 4.6 Medium**.

**Why this tier:** Composition-heavy; reuses existing components and data sources; clear contract per group.

**New chat?** Yes — fresh chat. Largest single C task.

**Pre-load (paste at start):**

- This task file (full).
- C1's resolved scaffold + `InboxColumn.tsx` placeholder (must preserve `id="notifications"`).
- The current [`DoctorDashboardEventFeed.tsx`](../../../../../frontend/components/dashboard/DoctorDashboardEventFeed.tsx) (full file — important to preserve all behaviors when re-mounting it).
- The match-reviews list endpoint shape — paste relevant `rg "service-staff-reviews|service-reviews"` results.

**Estimated turns:** 2–3.

**Escalate to Opus if:** the post-call-follow-ups derivation rule has ambiguity ("missing Rx" — does cancelled count? what if Rx is `draft` not `sent`?). One Opus turn locks the rule.

**Composer-OK sub-steps:** none.

---

## Acceptance criteria

### Column structure

- [ ] **`frontend/components/dashboard/cockpit/InboxColumn.tsx`** — replaces the C1 placeholder. Wrap in `<aside id="notifications" className="space-y-4">` so the bell's `#notifications` anchor still resolves.
- [ ] **Three groups stacked vertically**, each in its own `<Card>`:
  1. Match reviews (top)
  2. Notifications (middle, mounts existing `DoctorDashboardEventFeed`)
  3. Post-call follow-ups (bottom)
- [ ] **Group header** for each: small uppercase muted label + numeric badge if count > 0 + a "View all →" link where applicable.
- [ ] **`<ScrollArea>`** wraps each group's body so the column never grows unbounded — max-height per group ~280px, content scrolls inside.

### Group 1 — Match reviews

- [ ] Header: "MATCH REVIEWS" + count badge (matches B3's `matchReviewsUnconfirmed`).
- [ ] Body: top 3 unconfirmed match-reviews. Each row:
  ```
  Patient name (or DM handle)
  Service · slot date/time · "Tap to confirm"
  ```
- [ ] Click row → `/dashboard/service-reviews` (or its detail route if exists). Don't reimplement confirm-in-place; it's owned by the match-reviews page.
- [ ] "View all →" → `/dashboard/service-reviews`.
- [ ] **Empty:** "No DM leads awaiting review."

### Group 2 — Notifications

- [ ] Header: "NOTIFICATIONS" + unread count badge.
- [ ] Body: mount `<DoctorDashboardEventFeed token={token} />` directly inside.
- [ ] **No re-implementation.** The feed already handles unread/read state, ack actions, etc.
- [ ] Show acknowledged toggle stays inside the feed component (already there per [`app/dashboard/page.tsx`](../../../../../frontend/app/dashboard/page.tsx) current state).

### Group 3 — Post-call follow-ups

- [ ] **Derivation rule (LOCK in implementation log):**
  - From today's appointments (reuse `useTodaysAppointments` from C2/C5).
  - Filter to: `consultation_session.status === "ended"` AND `consultation_session.ended_at >= now - 24h` AND **no prescription created against the appointment** (use whatever existing field reflects this — `appointment.has_rx`, `prescription_id IS NULL`, etc.).
  - Sort by `ended_at DESC`.
  - Top 5.
- [ ] Header: "POST-CALL FOLLOW-UPS" + count badge.
- [ ] Body row:
  ```
  Patient name        ended 14m ago
  "No prescription written" or "No notes added"
  ```
- [ ] Click row → `/dashboard/appointments/<id>` (the existing appointment detail page).
- [ ] **Empty:** "All caught up — every recent consult has its follow-up."

### Visibility, polling, errors

- [ ] All three groups respect visibility-pause (no fetches while tab hidden).
- [ ] Each group fetches independently — one error doesn't kill the column. Failed group shows muted "Couldn't load. Tap to retry."
- [ ] First-paint: `Skeleton` rows in each group while loading.

### General

- [ ] Type-check + lint clean.
- [ ] No console errors.
- [ ] No PHI in any new telemetry fired from this column.
- [ ] The bell's `#notifications` anchor still scrolls to the column on click — verify post-implementation.
- [ ] Mobile breakpoints: column moves below the main 8-col on `<lg`. Each group's `ScrollArea` shrinks gracefully.

---

## Out of scope

- **Confirming a match-review in-place from the cockpit.** Rows route to the dedicated page. Saves complexity.
- **Acknowledging notifications in-place.** The existing feed handles its own actions.
- **Writing the missing Rx in-place.** Click → appointment detail; doctor writes there.
- **Configurable group order.** Fixed order in V1.
- **More than 3 groups.** If a fourth source emerges, propose a separate batch.

---

## Files expected to touch

**Frontend:**
- `frontend/components/dashboard/cockpit/InboxColumn.tsx` — **edit** (~250 LOC, replaces C1 placeholder).
- `frontend/components/dashboard/cockpit/inbox/MatchReviewsGroup.tsx` — **new** (~100 LOC) (optional split for readability).
- `frontend/components/dashboard/cockpit/inbox/PostCallFollowupsGroup.tsx` — **new** (~100 LOC).
- `frontend/components/dashboard/cockpit/inbox/NotificationsGroup.tsx` — **new** (~50 LOC; thin wrapper around `DoctorDashboardEventFeed` so the visual chrome matches).
- `frontend/lib/api.ts` (or domain client) — **possibly extend** to expose a typed match-reviews list helper if not already there.

**Backend / migrations / tests:** none.

---

## Notes / open decisions

1. **Post-call follow-up "missing Rx" rule.** Lock the exact field check before coding. Most likely: `appointment.prescription_id IS NULL` OR `consultation_session.has_rx === false` — whichever the existing appointment shape exposes. Don't add backend work to expose a new field; use what's there.
2. **Why not also "missing notes" alongside "missing Rx".** Add it: same row can render both labels in a comma-separated muted line. Notes-presence is determined by the appointment having ANY field in `cc / hopi / clinical_notes` populated post-session.
3. **Mounting `DoctorDashboardEventFeed` in a wrapper.** A thin wrapper standardizes the surrounding chrome (card + group header + count badge) without forking the feed itself. Don't fork the feed.
4. **Anchor preservation.** `id="notifications"` MUST stay on the column root. The header bell already scrolls users here on click — break that and the bell becomes a no-op.
5. **Scroll containment.** Each group's `ScrollArea` has its own scroll; the page itself doesn't scroll past the column. This keeps the cockpit composable on smaller laptop screens.

---

## References

- **Batch plan:** [plan-ui-system-redesign-batch.md § Sub-batch C](../plan-ui-system-redesign-batch.md#sub-batch-c--today-cockpit-5-items-152-days)
- **Source item:** [U3.4 in plan-ui-system-redesign.md](../../../../Product%20plans/plan-ui-system-redesign.md#u34--inbox-column)
- **Hard deps:** [task-ui-C1-cockpit-scaffold.md](./task-ui-C1-cockpit-scaffold.md), [task-ui-A2-shadcn-bootstrap.md](./task-ui-A2-shadcn-bootstrap.md)
- **Sibling tasks:** C2, C3, C5
- **Reuses:** [`DoctorDashboardEventFeed`](../../../../../frontend/components/dashboard/DoctorDashboardEventFeed.tsx), match-reviews list endpoint, `useTodaysAppointments` (extracted in C2)
- **Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md)

---

**Owner:** TBD  
**Created:** 2026-05-06  
**Status:** Drafted; blocked on C1 close.
