# Task alr2-08: Close gate (alerts-v2)

> **Filename:** `task-alr2-08-close-gate.md`
> **Links:** batch [`../plan-alerts-v2-batch.md`](../plan-alerts-v2-batch.md) · exec [`./EXECUTION-ORDER-alerts-v2.md`](./EXECUTION-ORDER-alerts-v2.md)

---

## 📋 Task Overview

Prove the alerts-v2 acceptance gate, run the PHI + smoke matrix, and capture follow-ups. No new features.

**Program / Batch:** alerts-v2 · Wave 7
**Estimated Time:** ~1 hour
**Status:** ✅ Complete (2026-07-21). **Model: Sonnet / Composer.**
**Change Type:** ✅ QA + verification + small fixes only.
**Depends on:** `alr2-01`…`alr2-06` (`alr2-07` **skipped** — optional / dogfood-gated).

**Scope Guard:**
- QA + tiny fixes only. **No new kinds, no scope additions.**
- Real defects route back to the owning task.

---

## ✅ Task Breakdown

### 1. Cross-cutting acceptance (batch gate)
- [x] 1.1 Additive migration applied; CHECK lists all 5 kinds; `dedupe_key` unique index live; **RLS confirmed unchanged**; reverse documented. (`182_alerts_v2_…sql` header + unit test.)
- [x] 1.2 `insertDashboardEvent` dedupes on a caller key; retries/overlapping ticks never double-insert (legacy replay dedupe still works). (`dashboard-events-service.test.ts`.)
- [x] 1.3 Both new kinds emit from their real signal points (no-show worker flip; SLA scan); dedup verified.
- [x] 1.4 Feed renders correct, non-alarming copy for both kinds; action-needed sorts/styles above info; deep-links land on the owning surface.
- [x] 1.5 Retention sweep deletes only acknowledged rows older than N; unread always survives.

### 2. PHI + security sweep
- [x] 2.1 Inspect each new payload + response: no PHI beyond `patient_display_name` + date labels + opaque UUIDs (ALR2-D7).
- [x] 2.2 `payment_refund_stuck` is **NOT** in the doctor feed (ALR2-D3) — absent from `DashboardEventKind` (backend + frontend) and CHECK list.
- [x] 2.3 Cross-doctor isolation: emitters scope by `doctor_id`; reads/acks via RLS `doctor_id = auth.uid()` + service-role insert path (migration 182 header re-confirms policies unchanged).

### 3. Smoke matrix
- [x] 3.1 Light + dark desktop; new rows + severity accents use theme tokens (`bg-destructive/5`, `bg-primary/5`, no hardcoded gray/blue/red/white). Manual dogfood parked in inbox.
- [x] 3.2 Empty / high-volume feed both render (unit coverage); retention caps deletes per tick (200).
- [x] 3.3 Cron routes CRON_SECRET-gated (401 on bad secret; 200 totals on success) — SLA + retention route tests.

### 4. Verification gate (`DEFINITION_OF_DONE.md`)
- [x] 4.1 `cd backend && npm run type-check` clean; alerts-v2 slice tests **56/56** green.
- [x] 4.2 Frontend: eslint clean for feed slice; feed + badge tests **9/9** green. Repo-wide `tsc` still noisy from unrelated duplicate `* 2.*` cockpit files.

### 5. Follow-ups
- [x] 5.1 Captured to `docs/Work/capture/inbox.md`: dogfood smoke; optional `acknowledge-all` still parked; severity filter UI; emitter observability; doctor-facing payment alert (if ever) stays separate PHI review.
- [x] 5.2 Batch plan + exec-order Status flipped to ✅ Complete (2026-07-21). `alr2-07` marked skipped / dogfood-gated.

---

## Gate evidence (fill on completion)

| Check | Evidence |
|---|---|
| Additive migration + RLS unchanged | `backend/migrations/182_alerts_v2_event_kind_widen_and_dedupe.sql` header (RLS re-confirmed; 5 kinds; reverse at foot); migration unit test **9/9** |
| Key-based dedupe | `dashboard-events-service.test.ts` (dedupe key + 23505 race + legacy audit id) |
| No-show emitter | `auto-no-show-worker.test.ts` — flip → insert; insert failure non-fatal |
| SLA emitter | `booking-review-sla-alert-service.test.ts` + cron route — breached → 1; re-run deduped |
| Retention | `dashboard-events-retention-cron.test.ts` — acked+old deleted; empty scan kept; cap 200; unread predicate pinned |
| Severity UI | `DoctorDashboardEventFeed.test.tsx` — action-needed above info; deep-links + tag |
| PHI-safe | Payloads = name + dates + UUIDs; `payment_refund_stuck` absent from kinds CHECK + TS unions |
| Tests | Backend alerts-v2 slice **56**; frontend feed **8** + sidebar badge **1** |

---

## ✅ Acceptance Criteria

- [x] The batch's [acceptance gate](../plan-alerts-v2-batch.md#acceptance-gate-for-the-eventual-batch) is fully ticked.
- [x] PHI + cross-doctor sweeps clean; refund-stuck excluded from the doctor feed.
- [x] Both verification gates green for the alerts-v2 slice; follow-ups captured; batch marked complete.

---

**Created:** 2026-07-21. **Closed:** 2026-07-21.
