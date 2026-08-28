# Alerts v1 — execution order

> Sibling of [`../plan-alerts-v1-batch.md`](../plan-alerts-v1-batch.md). Plan = what + why; this = who-runs-what-when + model.
>
> **Decision lock:** see batch plan (`ALR-D1`…`D8`).
>
> **Cost-aware model strategy:** `docs/Work/process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md`

> **Shape.** Phase 1 is a 3-wave frontend-only slice that fills the staked-but-empty `Alerts` tab by wiring the existing `doctor_dashboard_events` feed into the page. `alr-01` clears the header-bell dead end (mount + theme tokens). `alr-02` polishes (badge, pagination, bulk read, copy fidelity, type sync). `alr-03` closes the Phase 1 gate. Phase 2 is a single **design-only** Opus task (`alr-04`) that specs the `alerts-v2` batch — it writes **no code and no SQL**.

---

## Wave plan

```
── Phase 1 (frontend-only) ─────────────────────────────
Wave 1 (~1–1.5h):
  alr-01  page shell (requireDashboardAuth) + mount DoctorDashboardEventFeed
          + theme-token the feed (light/dark)                     [Sonnet]
        │
        ▼
Wave 2 (~2–3h):
  alr-02  sidebar badge (dashboardEventsUnread) + "Load more" (cursor)
          + "Mark all as read" (client loop) + copy for all 3 kinds
          + sync frontend event-kind types                        [Sonnet]
        │
        ▼
Wave 3 (~1h):
  alr-03  close gate: Phase 1 acceptance + light/dark smoke +
          verification + capture follow-ups                       [Sonnet / Composer]

── Phase 2 (design-only; gated on Opus + migration) ────
Wave 4 (~1h, independent):
  alr-04  broaden-alert-kinds DESIGN + decision lock + alerts-v2
          batch spec. NO code, NO SQL.                            [Opus]
```

---

## Wave-by-wave

| Step | Task | Phase | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|---|
| W1.0 | **alr-01** | 1 | S–M | Sonnet | `insights/page.tsx` (auth-shell precedent); `alerts/page.tsx`; `DoctorDashboardEventFeed.tsx`; `DashboardEventsBell.tsx` | Mount feed behind `requireDashboardAuth`; move feed onto theme tokens. Frontend-only. |
| W2.0 | **alr-02** | 1 | M | Sonnet | alr-01 output; `Sidebar.tsx`; `useDashboardCounts.ts`; `lib/api.ts` (`getDashboardEvents`/`acknowledgeDashboardEvent`, `DashboardEventKind`); `dashboard-events-service.ts` (3 kinds — read for parity only) | Badge, cursor "Load more", client-loop "Mark all read", copy for all 3 kinds, type sync (ALR-D8). |
| W3.0 | **alr-03** | 1 | S | Sonnet / Composer | alr-01/02 output; batch acceptance gate | Manual light/dark + bell click-through + PHI check + verification commands. |
| W4.0 | **alr-04** | 2 | S | **Opus** | `dashboard-events-service.ts`; migrations 066/073/074; `getBookingFunnel`/`getPracticeHealth`; `capture/inbox.md` `admin_payment_alerts` | **Design only.** Produce `alerts-v2` decision lock + task spec (migration + emitters). Writes no SQL/code. |

---

## Per-task model picks

| Task | Size | Model | Why |
|---|---|---|---|
| alr-01 | S–M | Sonnet | Thin UI wiring + a token refactor; mirrors `insights/page.tsx`. No money/PHI/RLS. |
| alr-02 | M | Sonnet | Frontend polish over an existing endpoint; read-model type sync only. |
| alr-03 | S | Sonnet / Composer | QA + gate. |
| alr-04 | S | **Opus** | Designs a new migration (widen `event_kind` CHECK) + new PHI-adjacent emitters — agent-contract escalation trigger even for the *design*. |

**Caps check:** Phase 1 uses no Opus, no migration, no PHI-in-UI change. The only Opus touch is the **design** task (alr-04), which writes nothing.

---

## Acceptance gate

See the [batch plan's Phase 1 cross-cutting gate](../plan-alerts-v1-batch.md#cross-cutting-acceptance-gate-phase-1).

---

## Task files

- [`task-alr-01-page-and-feed-wire.md`](./task-alr-01-page-and-feed-wire.md)
- [`task-alr-02-feed-polish-and-badge.md`](./task-alr-02-feed-polish-and-badge.md)
- [`task-alr-03-close-gate.md`](./task-alr-03-close-gate.md)
- [`task-alr-04-phase2-expansion-design.md`](./task-alr-04-phase2-expansion-design.md)

---

**Created:** 2026-07-21. **Status:** ✅ Phase 1 complete + `alr-04` design done (2026-07-21). `alr-01`…`alr-03` shipped; `alr-04` produced [`../../alerts-v2/plan-alerts-v2-batch.md`](../../alerts-v2/plan-alerts-v2-batch.md) (awaiting human decision-lock review before the v2 execution batch is scheduled).
