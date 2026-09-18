# Alerts v2 — execution order

> Sibling of [`../plan-alerts-v2-batch.md`](../plan-alerts-v2-batch.md). Plan = what + why + decision lock; this = who-runs-what-when + model.
>
> **Decision lock:** see batch plan (`ALR2-D1`…`D10`).
>
> **Cost-aware model strategy:** `docs/Work/process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md`

> **🛑 GATE — do not start until confirmed.** This batch contains a **migration** (`alr2-01`) + **new emitters** on appointment / booking-review surfaces (PHI/RLS-adjacent). Per `.cursor/rules/00-agent-contract.mdc` + `.cursor/rules/migrations.mdc`, every backend task here runs on **Opus**, and **execution may not begin until (a) the `ALR2-D*` decision lock is human-confirmed and (b) OQ-1/2/3 are answered.** Scaffolding these task files is *not* a green light to code.

> **Shape.** Eight tasks. `alr2-01` lands the additive migration (widen `event_kind` CHECK + `dedupe_key`). `alr2-02` generalizes the insert dedupe + service types (the spine every emitter reuses). `alr2-03`/`04` are the two emitters (no-show worker flip; SLA-breach scan). `alr2-05` adds the retention sweep (prerequisite per ALR2-D8). `alr2-06` is the frontend copy/severity/deep-link layer. `alr2-07` (optional) swaps the Phase-1 client loop for a bulk endpoint. `alr2-08` closes the gate.

---

## Pre-flight checklist (must be ✅ before Wave 1)

- [x] `ALR2-D1`…`D10` reviewed + confirmed by a human (executed under the lock through close gate).
- [x] **OQ-1** answered — do manual (doctor-initiated) no-shows emit? **No** (locked in `alr2-03`; follow-up parked in `capture/inbox.md`).
- [x] **OQ-2** answered — SLA scan as in-process interval vs `routes/cron.ts` job? **Cron route** (`POST /cron/booking-review-sla-alerts`, locked in `alr2-04`).
- [x] **OQ-3** answered — retention window N = **90 days** (`DASHBOARD_EVENTS_RETENTION_DAYS`, locked in `alr2-05`).
- [x] Opus turn completed for backend tasks (`alr2-01`…`05`); `alr2-07` skipped.

---

## Wave plan

```
🛑 GATE (pre-flight checklist above) ───────────────────
Wave 1 (~1h):
  alr2-01  migration: widen event_kind CHECK + dedupe_key col/index   [Opus]
        │
        ▼
Wave 2 (~1.5–2h):
  alr2-02  generalize insertDashboardEvent dedupe (key-based) + types  [Opus]
        │
        ├───────────────┐   (emitters — serial; both Opus, ≤1 concurrent)
        ▼               ▼
Wave 3 (~1h)       Wave 4 (~2–3h):
  alr2-03            alr2-04
  no-show emitter    SLA-breach scan emitter
  [Opus]             [Opus]
        └───────────────┘
                │
                ▼
Wave 5 (~1h):
  alr2-05  retention sweep worker (ALR2-D8)                            [Opus]
                │
                ▼
Wave 6 (~2–3h):
  alr2-06  frontend: read-model types + describeEvent copy +
           severity styling/sort + deep-links                          [Sonnet]
  alr2-07  (optional) POST /dashboard/events/acknowledge-all           [Sonnet/Opus]
                │
                ▼
Wave 7 (~1h):
  alr2-08  close gate: acceptance + PHI sweep + light/dark + verify    [Sonnet/Composer]
```

---

## Wave-by-wave

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| W1.0 | **alr2-01** | S | **Opus** | migrations `066`/`073`/`074`; `MIGRATIONS_AND_CHANGE.md` | Additive CHECK widen (5 kinds) + `dedupe_key TEXT` + partial unique index. **Confirm RLS unchanged explicitly.** Reverse in-file. |
| W2.0 | **alr2-02** | S–M | **Opus** | `dashboard-events-service.ts` (`insertDashboardEvent`, `DashboardEventKind`, payload types) | Key-based dedupe (ALR2-D5) preserving the legacy `recording_access_audit_id` path; add 2 kinds + payload types + `severity`. Backend dedupe tests. |
| W3.0 | **alr2-03** | S | **Opus** | `auto-no-show-worker.ts#flipToNoShow` (L465; audits `appointment.auto_no_show` L512; has `doctorId`+`appointmentId`) | Insert `appointment_no_show` after the audited flip; dedupe on `appointment_id`. Resolve OQ-1. |
| W4.0 | **alr2-04** | M | **Opus** | `dashboard-insights-service.ts#getBookingFunnel` (breach predicate); `routes/cron.ts` (job pattern next to `staff-review-timeouts`); `service_staff_review_requests` | New scan job → insert `booking_review_sla_breach` for breached-pending requests without an existing event; dedupe on `review_request_id`. Resolve OQ-2. |
| W5.0 | **alr2-05** | S | **Opus** | migration 066 header (parked retention); `routes/cron.ts` | Service-role sweep: delete `acknowledged_at < now() - N days`, capped per tick. Resolve OQ-3. |
| W6.0 | **alr2-06** | M | Sonnet | `DoctorDashboardEventFeed.tsx#describeEvent`; `frontend/lib/api.ts` (event union); alr2-02 payloads | Read-model types + copy for 2 kinds + severity sort/style (action-needed above info) + deep-links. No backend. |
| W6.1 | **alr2-07** *(optional)* | S | Sonnet / Opus | `dashboard-events-controller.ts`/routes; `dashboard-events-service.ts` | `POST /api/v1/dashboard/events/acknowledge-all` (doctor-scoped RLS UPDATE). Gate on dogfood (ALR2-D10). Opus if it touches RLS reasoning. |
| W7.0 | **alr2-08** | S | Sonnet / Composer | alr2-01…06 output; batch acceptance gate | Acceptance, PHI sweep, light/dark, verification, capture follow-ups. |

---

## Per-task model picks

| Task | Size | Model | Why |
|---|---|---|---|
| alr2-01 | S | **Opus** | New migration (hard-rules) + CHECK/index; RLS confirmation. |
| alr2-02 | S–M | **Opus** | Core service change on a shared insert path; dedupe correctness. |
| alr2-03 | S | **Opus** | Worker edit + PHI payload; must stay idempotent with the flip. |
| alr2-04 | M | **Opus** | New scan/emitter + PHI payload + idempotency; money-adjacent surface (booking review). |
| alr2-05 | S | **Opus** | Retention delete over a doctor-owned feed table. |
| alr2-06 | M | Sonnet | Frontend read-model + copy + styling; no money/PHI-write/RLS. |
| alr2-07 | S | Sonnet / Opus | Small endpoint; Opus only if the RLS UPDATE reasoning warrants it. |
| alr2-08 | S | Sonnet / Composer | QA + gate. |

**Caps check:** never two Opus tasks concurrently (Waves 1→5 are serial). One migration only (`alr2-01`). No PHI beyond `patient_display_name` + date labels. RLS: expected unchanged — **must be explicitly re-confirmed** in `alr2-01`.

---

## Acceptance gate

See the [batch plan's acceptance gate](../plan-alerts-v2-batch.md#acceptance-gate-for-the-eventual-batch).

---

## Task files

- [`task-alr2-01-migration-event-kind-and-dedupe.md`](./task-alr2-01-migration-event-kind-and-dedupe.md)
- [`task-alr2-02-generalize-insert-dedupe-and-types.md`](./task-alr2-02-generalize-insert-dedupe-and-types.md)
- [`task-alr2-03-emitter-appointment-no-show.md`](./task-alr2-03-emitter-appointment-no-show.md)
- [`task-alr2-04-emitter-sla-breach-scan.md`](./task-alr2-04-emitter-sla-breach-scan.md)
- [`task-alr2-05-retention-sweep-worker.md`](./task-alr2-05-retention-sweep-worker.md)
- [`task-alr2-06-frontend-copy-severity-deeplinks.md`](./task-alr2-06-frontend-copy-severity-deeplinks.md)
- [`task-alr2-07-acknowledge-all-endpoint.md`](./task-alr2-07-acknowledge-all-endpoint.md)
- [`task-alr2-08-close-gate.md`](./task-alr2-08-close-gate.md)

---

**Created:** 2026-07-21. **Status:** ✅ Complete (2026-07-21) — `alr2-01`…`06` + `alr2-08`; **`alr2-07` skipped** (optional / dogfood).
