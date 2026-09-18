# Task alr-04: Phase 2 — broaden alert kinds (DESIGN ONLY)

> **Filename:** `task-alr-04-phase2-expansion-design.md`
> **Links:** batch [`../plan-alerts-v1-batch.md`](../plan-alerts-v1-batch.md) · exec [`./EXECUTION-ORDER-alerts-v1.md`](./EXECUTION-ORDER-alerts-v1.md)

---

## 🛑 Read first

**This task writes NO code and NO SQL.** Its only output is a decision-locked `alerts-v2` batch spec. Phase 2 broadens Alerts beyond recording-replay, which requires **a new migration** (widen `doctor_dashboard_events.event_kind` CHECK) **plus new event emitters** touching payment/appointment/review surfaces. Per `.cursor/rules/00-agent-contract.mdc` and `.cursor/rules/migrations.mdc`, that is a hard-rules, PHI/RLS-adjacent change — **run this on Opus, and do not let implementation start until the spec below is reviewed and locked.**

---

## 📋 Task Overview

Design how Alerts becomes a "things needing my attention" surface, using signals Clariva already computes, and hand off a ready-to-execute `alerts-v2` batch (migration + emitters + UI copy). No implementation here.

**Program / Batch:** alerts-v1 · Wave 4 (Phase 2 design)
**Estimated Time:** ~1 hour
**Status:** ✅ Complete (2026-07-21, Opus). Output: [`../../alerts-v2/plan-alerts-v2-batch.md`](../../alerts-v2/plan-alerts-v2-batch.md). **Model: Opus.**
**Change Type:** 📝 Design / decision-lock doc only.
**Depends on:** `alr-01`…`alr-03` (design the expansion against the shipped Phase-1 surface).

> **Output:** [`docs/Work/Daily-plans/July 2026/21-07-2026/alerts-v2/plan-alerts-v2-batch.md`](../../alerts-v2/plan-alerts-v2-batch.md) — ranked kinds, additive migration shape, PHI-classified payloads, emitters, explicit RLS statement, retention decision, UI/API deltas, decision lock (`ALR2-D1`…`D10`), task list (migration + emitters = Opus), acceptance gate. **No code / no SQL written.** Key call: `payment_refund_stuck` routed to the **admin** surface, not the doctor feed (ALR2-D3).

**Scope Guard:**
- **DO NOT** write a migration, alter any table, or edit any service/worker/route.
- **DO NOT** widen the `event_kind` CHECK — only *specify* how to.
- Output is a doc under `docs/Work/Daily-plans/…/alerts-v2/` (or an appended section here) — nothing that ships.

---

## ✅ Task Breakdown

### 1. Candidate alert kinds (rank + justify)
- [ ] 1.1 **`booking_review_sla_breach`** — a booking-review request passed `sla_deadline_at` unresolved. Signal already computed by `getBookingFunnel` (`breachedSla` / `pending`) in `dashboard-insights-service.ts`. Emitter: the review lifecycle or a small cron.
- [ ] 1.2 **`appointment_no_show`** — an appointment flipped to `no_show`. Signal in `getPracticeHealth` (`byStatus.no_show`); emitter likely the `auto-no-show-worker`.
- [ ] 1.3 **`payment_refund_stuck`** — refund permanently failed (`admin_payment_alerts` `refund_stuck_24h`, already parked in `capture/inbox.md`; migration 077). Emitter: `modality-refund-retry-worker`.
- [ ] 1.4 For each: severity (info vs action-needed), volume estimate, dedupe key, and whether it belongs in *this* doctor feed vs the admin ops feed.

### 2. Data-model decisions (specify, don't build)
- [ ] 2.1 New `event_kind` values + the additive CHECK-widening migration shape (mirror the 073/074 `DROP CONSTRAINT` + `ADD CONSTRAINT` pattern, full enumerated list).
- [ ] 2.2 Per-kind payload shapes (fields, PHI classification, dedupe/idempotency key) — mirror the `PatientReplayedRecordingPayload` / `PatientRevokedVideoMidSessionPayload` doc style.
- [ ] 2.3 RLS: confirm existing `doctor_dashboard_events` policies cover the new inserts (service-role insert; doctor self-select) — no new policy expected, but **state it explicitly**.
- [ ] 2.4 Retention: these are higher-volume than replay events — decide whether the parked "retention sweep worker" (migration 066 header) becomes a Phase-2 prerequisite.

### 3. Emitter decisions
- [ ] 3.1 For each kind, name the exact insertion point (worker/service) and confirm it can call `insertDashboardEvent` with a dedupe key so retries don't double-fire.
- [ ] 3.2 Decide severity → UI treatment (does "action-needed" get a distinct style/sort vs the informational replay events?).

### 4. UI / API deltas for alerts-v2
- [ ] 4.1 Grouping / filtering by severity or kind; whether a bulk `acknowledge-all` **endpoint** now earns its keep (vs the Phase-1 client loop).
- [ ] 4.2 Deep-links from an alert row to the owning surface (e.g. SLA breach → `/dashboard/booking-review`).

### 5. Output
- [ ] 5.1 Produce the `alerts-v2` decision lock (`ALR2-D*`), scope guard, task list (migration task = Opus), and acceptance gate — ready to promote to a dated batch.
- [ ] 5.2 Cross-link back to this batch and to `capture/inbox.md` items being promoted.

---

## 📁 Files to Create/Update

```
CREATE: docs/Work/Daily-plans/<ship-date>/alerts-v2/plan-alerts-v2-batch.md   (design output)
READ:   backend/src/services/dashboard-events-service.ts     (kinds + payload doc style)
READ:   backend/migrations/073_… , 074_…                     (additive CHECK-widen pattern)
READ:   backend/src/services/dashboard-insights-service.ts   (SLA / no-show signals)
READ:   docs/Work/capture/inbox.md                           (admin_payment_alerts parked item)
DO NOT TOUCH: any migration, table, service, worker, route, or frontend file — design only
```

---

## 🧠 Design Constraints

- **Design only** — the deliverable is a spec, not a diff (ALR-D6).
- **Additive + reversible** migration shape only (per `MIGRATIONS_AND_CHANGE.md`); confirm approach before any SQL is ever written.
- **PHI discipline** — classify every new payload field; keep the doctor feed to what the doctor legitimately needs.
- **Reuse** the existing table + RLS; don't propose a new store unless retention forces it.

---

## ✅ Acceptance Criteria

- [x] A reviewed `alerts-v2` batch spec exists: ranked kinds, migration shape, payloads, emitters, RLS statement, UI/API deltas, acceptance gate. → [`../../alerts-v2/plan-alerts-v2-batch.md`](../../alerts-v2/plan-alerts-v2-batch.md)
- [x] No migration/code/SQL was written by this task. (Spec only; SQL shown is illustrative in a doc.)
- [x] The migration + emitter work is explicitly flagged **Opus + decision-lock-first** before execution (spec header gate + per-task model column).

> **Awaiting:** human review of the `ALR2-D*` decision lock before the spec is promoted to a dated execution batch.

---

**Created:** 2026-07-21.
