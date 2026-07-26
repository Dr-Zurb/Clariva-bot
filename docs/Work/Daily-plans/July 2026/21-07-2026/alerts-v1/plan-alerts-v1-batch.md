# Alerts v1 — batch plan (21 Jul 2026)

> **Hand-off doc.** Written for an executing agent. Self-contained: cites real files, locked decisions, phased tasks, scope guard, verification gate.
>
> **One-line intent:** Turn the staked-but-empty `Alerts` tab into a working **doctor notification center** over the `doctor_dashboard_events` feed Clariva already stores — the destination the header bell already links to. **Phase 1 is frontend-only** (no backend, no migration): wire the existing feed into the page, theme-token it, light the sidebar badge. **Phase 2** (new alert kinds) is *designed* here but deferred to its own Opus/migration batch.
>
> **Fills the placeholder.** The `Alerts` slot was staked by the sidebar restructure (`plan-sidebar-restructure.md` DL-6 — rename `Notifications` → `Alerts`, anchor at a dedicated route). The header bell was pointed at `/dashboard/alerts` but the page still reads "Coming soon." This batch clears that dead end.
>
> **Direction locked (2026-07-21, in chat):** keep the Alerts sidebar tab **and** commit to Phase 2 (broaden beyond recording-replay). Do not drop the tab; do not merge into a shared Inbox for v1.
>
> **Exec order:** [`Tasks/EXECUTION-ORDER-alerts-v1.md`](./Tasks/EXECUTION-ORDER-alerts-v1.md).

---

## Why this batch

The header bell (`DashboardEventsBell.tsx`) polls the doctor's unread `doctor_dashboard_events` every 60s and **already links to `/dashboard/alerts`** — but that route renders a "Coming soon." stub. So the single most visible affordance in the chrome leads to an empty room.

Meanwhile the hard part is already built:

- A full backend feed: `doctor_dashboard_events` table (migrations 066/073/074) + `dashboard-events-service.ts` (list / acknowledge, cursor pagination, idempotency, doctor-scoped RLS) + `dashboard-events-controller.ts` under `/api/v1/dashboard/events`.
- A full feed **component**: `DoctorDashboardEventFeed.tsx` (first-page fetch, unread-only toggle, per-row "Mark as read" with optimistic UI, relative-time formatting).
- Unread-count plumbing: `useDashboardCounts` already exposes `dashboardEventsUnread`; `useDashboardEventsUnreadCount` backs it.

Phase 1 is therefore mostly **wiring + a theme-token refactor**, mirroring exactly what `insights-v1` did to *its* "Coming soon." stub.

---

## Current state (grounded)

- **Placeholder:** [`frontend/app/dashboard/alerts/page.tsx`](../../../../../frontend/app/dashboard/alerts/page.tsx) — `<h1>Alerts</h1>` + "Coming soon." No auth shell, no feed. Loading: [`frontend/app/dashboard/alerts/loading.tsx`](../../../../../frontend/app/dashboard/alerts/loading.tsx) (`PlaceholderPageSkeleton`).
- **Feed component to mount:** [`frontend/components/dashboard/DoctorDashboardEventFeed.tsx`](../../../../../frontend/components/dashboard/DoctorDashboardEventFeed.tsx) — takes a `token`, renders the feed. **Two gaps:** (a) hardcoded light colors (`bg-white`, `text-gray-900`, `border-gray-200`, `bg-blue-50/40`) — breaks dark mode; (b) `describeEvent()` only handles `patient_replayed_recording`; the other two shipped kinds fall through to a generic "New activity on a recent consult."
- **Bell:** [`frontend/components/dashboard/DashboardEventsBell.tsx`](../../../../../frontend/components/dashboard/DashboardEventsBell.tsx) — links to `/dashboard/alerts`, polls 60s, visibility-aware. **Works today; do not touch its polling.**
- **Sidebar:** [`frontend/components/layout/Sidebar.tsx`](../../../../../frontend/components/layout/Sidebar.tsx) — `Alerts` entry (`Bell` icon) at `/dashboard/alerts` with **no `badgeKey`** (the count exists in `DashboardCounts.dashboardEventsUnread` but is never displayed).
- **Auth shell to mirror:** [`frontend/app/dashboard/insights/page.tsx`](../../../../../frontend/app/dashboard/insights/page.tsx) — `const { token } = await requireDashboardAuth();` then mount a client component.
- **API client (frontend):** `frontend/lib/api.ts` — `getDashboardEvents(token, {unreadOnly, limit, cursor})` → `{ events, nextCursor? }`; `acknowledgeDashboardEvent(token, eventId)` → 204. **Type drift:** `DashboardEventKind` is typed as only `"patient_replayed_recording"` and `PatientReplayedRecordingPayload.artifact_type` omits `"video"` — narrower than the backend (3 kinds; migration 074 added `video`).
- **Backend event kinds (source of truth):** `dashboard-events-service.ts` `DashboardEventKind` = `patient_replayed_recording` | `patient_revoked_video_mid_session` | `patient_replayed_video`.
- **No bulk endpoint:** acknowledge is per-event (`POST /:eventId/acknowledge`). There is no "mark all read".
- **Missing:** the page never mounts the feed; badge unwired; feed not theme-safe; feed copy incomplete for 2 of 3 kinds.

---

## Decision lock (LOCKED 2026-07-21)

| ID | Decision | Implication |
|----|----------|-------------|
| **ALR-D1** | **Alerts = the `doctor_dashboard_events` notification feed.** Keep the sidebar tab (chat-locked). | Not a broad "action queue" in v1. Reuse the existing feed; don't invent a new store. |
| **ALR-D2** | **Phase 1 is frontend-only.** Reuse `/api/v1/dashboard/events` + `DoctorDashboardEventFeed`. | No backend files, no migration, no route/controller/service edits in Phase 1. |
| **ALR-D3** | **Theme tokens only.** The feed moves off hardcoded gray/blue onto `bg-card`/`text-foreground`/`border-border` (+ `Card` primitives). | Light + dark both correct — the batch's one real refactor. |
| **ALR-D4** | **Bell + sidebar both point at `/dashboard/alerts`.** Keep the bell as-is. | Two affordances, one destination (standard pattern). Bell polling untouched. |
| **ALR-D5** | **"Mark all as read" in Phase 1 = client-side loop** over unread events (N × existing acknowledge). | Keeps Phase 1 backend-free. A bulk `acknowledge-all` endpoint is a Phase 2 nicety, not a v1 blocker. |
| **ALR-D6** | **Phase 2 (new alert kinds) needs a migration** (widen `doctor_dashboard_events.event_kind` CHECK) + new emitters → **Opus + its own decision-lock batch.** | Per `00-agent-contract.mdc` / `migrations.mdc`. alr-04 designs it; it does **not** write SQL. |
| **ALR-D7** | **No new PHI.** The feed shows only what it already does — `patient_display_name` + a consult date label (existing Decision-4 contract from migration 066). | No new patient identifiers rendered. |
| **ALR-D8** | **Sync the stale frontend event-kind types** to the 3 shipped kinds so the feed renders correct copy for each. | `lib/api.ts` `DashboardEventKind` / payload union widened to match `dashboard-events-service.ts`. Read-model only — no wire change. |

---

## ⚠️ Scope guard

- **DO NOT** add a migration or widen `event_kind` in Phase 1 (that's Phase 2 → Opus).
- **DO NOT** touch `dashboard-events-service.ts`, `dashboard-events-controller.ts`, or the events route in Phase 1 — frontend-only.
- **DO NOT** change the header bell's polling/visibility logic (it works — ALR-D4).
- **DO NOT** render new PHI beyond the existing `patient_display_name` + consult-date (ALR-D7).
- **DO NOT** build Phase 2 emitters / new kinds in this batch — alr-04 is **design + decision-lock only**.
- If a Phase 1 task balloons past ~5 frontend files, **STOP and split** rather than expanding.

---

## Cross-cutting acceptance gate (Phase 1)

Alerts v1 (Phase 1) is green only when **all** hold:

- [x] `/dashboard/alerts` renders the real feed behind the standard auth guard (`requireDashboardAuth`); no "Coming soon." remains.
- [x] The header bell → `/dashboard/alerts` lands on the working feed (no dead end); clicking a bell with unread count shows those unread items.
- [x] The feed uses theme tokens — **light + dark both correct** (no hardcoded `bg-white`/gray/blue).
- [x] The sidebar `Alerts` entry shows the unread badge (`dashboardEventsUnread`), collapsed + expanded.
- [x] All **3 shipped event kinds** render correct, non-alarming copy (not the generic fallback): audio/transcript replay, video replay, mid-session video revoke.
- [x] "Load more" fetches the next page when `nextCursor` is present; "Mark all as read" clears unread (client loop).
- [x] Frontend event-kind types match the backend's 3 kinds (ALR-D8).
- [x] No backend / migration touched; bell polling untouched; no new PHI.
- [x] Alerts slice type-check / lint / tests green (repo-wide `tsc`/lint may still have pre-existing non-alerts noise).

---

## Tasks

### Phase 1 — make Alerts real (frontend-only)

| Task | Title | Phase | Size | Model |
|---|---|---|---|---|
| `alr-01` | Alerts page shell + mount feed + theme-token the feed | 1 | S–M | Sonnet |
| `alr-02` | Sidebar badge + Load-more + Mark-all-read + event-kind copy + type sync | 1 | M | Sonnet |
| `alr-03` | Close gate — Phase 1 acceptance, smoke matrix, verification, follow-ups | 1 | S | Sonnet / Composer |

### Phase 2 — make it worth the slot (design here, build later)

| Task | Title | Phase | Size | Model |
|---|---|---|---|---|
| `alr-04` | **Design-only** — broaden alert kinds (SLA breach / no-show / payment-stuck): decision lock + `alerts-v2` batch spec. **No code, no SQL.** | 2 | S | **Opus** (migration + emitter design) |

---

## Phase 2 outline (deferred — see alr-04)

Broaden Alerts from "recording-replay feed" to "things needing my attention" using signals Clariva already computes:

- **Booking-review SLA breach** — `getBookingFunnel` already derives `breachedSla` / `pending`.
- **No-shows** — `getPracticeHealth` already has `byStatus.no_show` / `noShowRate`.
- **Payment / refund stuck** — parked `admin_payment_alerts` idea in `docs/Work/capture/inbox.md`.

Each new kind is a **new `event_kind`** (migration to widen the CHECK per the 073/074 additive pattern) **plus a new emitter** (worker or service hook that inserts the row). That is a hard-rules migration + PHI/RLS-sensitive surface → **Opus, decision-lock first**. alr-04 produces that spec; a separate `alerts-v2` batch implements it.

---

## Sequencing notes

- **alr-01 first** — clears the bell dead end (the highest-value single change) and lands the auth shell + theme-safe feed.
- **alr-02 next** — polish on top of the mounted feed (badge, pagination, bulk read, copy fidelity, type sync).
- **alr-03** — proves the Phase 1 gate; captures dogfood + Phase 2 follow-ups.
- **alr-04** — can run any time (independent design task); best after alr-03 so the Phase 2 spec reflects the shipped Phase 1 surface. Runs on Opus.

---

## Open questions (resolved)

1. **Keep the Alerts tab?** ✅ Yes — keep + invest (chat-locked 2026-07-21). ALR-D1.
2. **Mark-all-read: client loop or new endpoint?** ✅ Client loop for v1 (ALR-D5); bulk endpoint deferred to Phase 2.
3. **Restyle vs rewrite the feed?** ✅ Restyle in place onto theme tokens (ALR-D3) — behavior is already correct; no rewrite.
4. **Where do new alert kinds live?** ✅ Same `doctor_dashboard_events` table, widened `event_kind` — Phase 2 / alr-04, not v1.

---

## References

- Sidebar restructure (staked the slot): [`../../../Product plans/plan-sidebar-restructure.md`](../../../Product%20plans/plan-sidebar-restructure.md) (DL-6)
- Sibling precedent (same pattern, same date): [`../insights-v1/plan-insights-v1-batch.md`](../insights-v1/plan-insights-v1-batch.md)
- DoD: [`../../../../Reference/engineering/development/DEFINITION_OF_DONE.md`](../../../../Reference/engineering/development/DEFINITION_OF_DONE.md)
- Standards / Recipes: `docs/Reference/engineering/development/STANDARDS.md` · `docs/Reference/engineering/development/RECIPES.md`
- Feed origin: `docs/Work/Daily-plans/April 2026/19-04-2026/Tasks/task-30-mutual-replay-notifications.md`
- Migrations: `backend/migrations/066_doctor_dashboard_events.sql` · `073_…` · `074_…`
- Agent contract / migrations rule: `.cursor/rules/00-agent-contract.mdc` · `.cursor/rules/migrations.mdc`

---

**Created:** 2026-07-21. **Status:** ✅ Phase 1 complete (2026-07-21) — `alr-01`…`alr-03` shipped. Phase 2 (`alr-04`) design-only, gated on Opus + migration decision lock.
