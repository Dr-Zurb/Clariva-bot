# 15 May 2026 — Daily plans

One batch landed (or is landing) on this day, filed in a self-contained subfolder with its own plan + `Tasks/` tree.

| Folder | Batch | Status | What it covers |
|---|---|---|---|
| [`opd-slot-hub/`](./opd-slot-hub/) | **OPD Slot Hub** (sl-01 … sl-06) | Drafted 2026-05-15 (active) | Brings the slot-mode branch of `/dashboard/opd-today` to parity with the queue-mode branch shipped in [08-05-2026/](../08-05-2026/) (oq-04..oq-13). Adds a server-derived slot session snapshot (no DB migration), a slot-mode session toolbar (broadcast delay + offer early join + freshness + add-slot), URL-backed status filter chips + search, a chronological dense-row list with a "now" divider + status-aware overflow actions + inline expand, polling + hotkeys + telemetry, and an end-of-session overflow / extra-slot dialog. **Zero DB migrations.** ~14h wall-clock, 6 tasks, 3 waves. |

## Why this batch follows yesterday

The [14-05-2026 sidebar-restructure](../14-05-2026/) batch renamed `OPD queue` → `OPD` because the route already serves both modes from one shell ([`OpdTodayClient.tsx`](../../../../frontend/components/opd/OpdTodayClient.tsx)). That rename is functionally a lie until the slot-mode branch has parity — today a slot-mode doctor clicks `OPD` and lands on a one-card placeholder pointing them at `/dashboard/appointments`. This batch closes that gap.

It also unblocks the broader OPD product story locked at [`Daily-plans/March 2026/2026-03-24/OPD modes/opd-systems-plan.md`](../../March%202026/2026-03-24/OPD%20modes/opd-systems-plan.md) §6.4 / §8.4 — the spec lays out the doctor-side surfaces for both modes in detail; queue mode shipped in May; slot mode is the missing half.

The opportunity surfaced after operating on the existing `/dashboard/opd-today` shell:

1. **Queue mode is operationally complete** — toolbar, status chips, dense rows, inline expand, polling, hotkeys.
2. **Slot mode is structurally absent** — only a date picker + "Slot" pill + a "go to appointments" card.
3. **Every slot-mode primitive already exists** — `appointments.opd_session_delay_minutes` (mig 030), `opd_early_invite_*` (mig 029), `opd_event_type` (mig 031), `slot_join_grace_minutes` policy (mig 028), and per-appointment APIs (`POST /opd/appointments/:id/{offer-early-join,session-delay,mark-no-show}`). The work is mounting + status-derivation, not new architecture.

Locked-in chat 2026-05-15, source product plan: [`Product plans/plan-opd-slot-hub.md`](../../Product%20plans/plan-opd-slot-hub.md).

## How to start

If you're picking up `opd-slot-hub`:

1. Read the [source product plan](../../Product%20plans/plan-opd-slot-hub.md) once for context — DL-1..DL-12 explain the *why* behind each surface and the deferred items.
2. Read the upstream OPD modes spec [§5.1a, §5.1b, §6.2, §6.4](../../March%202026/2026-03-24/OPD%20modes/opd-systems-plan.md) — the slot-mode UX rules (grace, paper time, overflow, missed slot) all live there. The product plan distils them but the upstream is the canonical reference.
3. Read [`opd-slot-hub/plan-opd-slot-hub-batch.md`](./opd-slot-hub/plan-opd-slot-hub-batch.md) for the per-task breakdown and the cross-cutting acceptance gate.
4. Open [`opd-slot-hub/Tasks/EXECUTION-ORDER-opd-slot-hub.md`](./opd-slot-hub/Tasks/EXECUTION-ORDER-opd-slot-hub.md) for the wave / lane matrix and model picks.
5. Per [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md) TL;DR rule #1 ("Plan with Opus, **execute with Auto**, polish with Composer"): start a fresh chat per task and **default to Auto** for sl-01..sl-05 (well-spec'd execution work — Auto draws from the cheaper Auto+Composer pool and matches Sonnet 4.6 on bounded tasks). **Composer 2 Fast** is right for sl-06 (form-and-API plumbing). **Zero Opus tasks** — none of the 6 tasks hit the hard-rules list (no `auth.uid()` change, no RLS, no PHI columns, no migration, no audit-log path). The optional batch close-gate review (one fresh Opus chat after sl-05 ships) is the only Opus turn budgeted. Per-message escalation to Opus 4.7 Extra High remains the safety net if Auto stalls on a single message.
6. **Pre-load the queue-mode predecessors aggressively.** Most of the slot-mode UI is "do what queue did, but for slot semantics". The queue toolbar (`OpdQueueSessionToolbar.tsx`), status filter (`OpdQueueStatusFilter.tsx`), table (`OpdQueueTable.tsx`), dense row (`OpdQueueDenseRow.tsx`), row actions (`OpdQueueRowActions.tsx`), grouping helpers, and hotkey hook are listed in every task's pre-load section.

## Cross-day predecessors

- [Daily-plans/March 2026/2026-03-24/OPD modes/opd-systems-plan.md](../../March%202026/2026-03-24/OPD%20modes/opd-systems-plan.md) — source product spec for both OPD modes (§5.1a slot policy, §5.1b paper-time, §6.2 patient slot UI, §6.4 doctor dashboard).
- [Daily-plans/March 2026/2026-03-24/OPD modes/e-task-opd-06-frontend-doctor-dashboard-opd-controls.md](../../March%202026/2026-03-24/OPD%20modes/e-task-opd-06-frontend-doctor-dashboard-opd-controls.md) — the original per-appointment slot controls (`<DoctorOpdSlotActions>` on appointment detail). Preserved unchanged by this batch.
- [Daily-plans/May 2026/08-05-2026/](../08-05-2026/) — queue-mode hub batch (oq-04..oq-13). Every UI pattern this batch reuses comes from there.
- [Daily-plans/May 2026/14-05-2026/sidebar-restructure/](../14-05-2026/sidebar-restructure/) — sidebar rename to `OPD`; created the parity gap that this batch closes.
- [Product plans/plan-opd-slot-hub.md](../../Product%20plans/plan-opd-slot-hub.md) — source product plan with decision locks DL-1..DL-12.

## Concurrent batches

- [13-05-2026/patient-profile-shell-rebuild/](../13-05-2026/patient-profile-shell-rebuild/) — Strangler Fig cockpit rebuild. **No file overlap with this batch.** Different tree (`frontend/components/consultation/**`); safe to run in parallel chats / branches.
- [14-05-2026/sidebar-restructure/](../14-05-2026/sidebar-restructure/) — already-shipped (or in flight). **No file overlap with this batch.** That batch renamed the sidebar entry that points at `/dashboard/opd-today`; this batch fills out what doctors see when they click it.
