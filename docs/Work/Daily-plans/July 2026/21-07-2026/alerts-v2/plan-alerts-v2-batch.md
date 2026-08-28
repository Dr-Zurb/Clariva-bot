# Alerts v2 — batch spec

> **Status:** ✅ Complete (2026-07-21). `alr2-01`…`06` + `alr2-08` shipped; **`alr2-07` skipped** (optional / dogfood-gated).
> **Produced by:** [`../alerts-v1/Tasks/task-alr-04-phase2-expansion-design.md`](../alerts-v1/Tasks/task-alr-04-phase2-expansion-design.md) (Opus, 2026-07-21).
> **Parent program:** alerts-v1 → Phase 2. See [`../alerts-v1/plan-alerts-v1-batch.md`](../alerts-v1/plan-alerts-v1-batch.md).
>
> **One-line intent:** Broaden the doctor `Alerts` feed from a "recording-replay log" into a "things needing my attention" surface, using signals Clariva **already computes** — without inventing a new store.
>
> **Deploy note:** Apply migration `182_alerts_v2_event_kind_widen_and_dedupe.sql` on Supabase before emitters can insert the new kinds in a live DB. Schedule `POST /cron/booking-review-sla-alerts` (~15m) and `POST /cron/dashboard-events-retention` (daily).

---

## Why this batch

Alerts v1 (Phase 1, shipped 2026-07-21) mounted the existing `doctor_dashboard_events` feed, theme-tokened it, lit the sidebar badge, and rendered all 3 shipped **replay** kinds. But every shipped kind is a *passive log* ("your patient replayed the audio"). None is an **action item**. The slot is now real but under-earning: a doctor opening `Alerts` sees replay notifications, not "the two booking requests about to breach SLA."

Phase 2 turns Alerts into an attention surface using signals the backend **already derives**:

- **Booking-review SLA breach** — `getBookingFunnel` already computes `review.breachedSla` from `service_staff_review_requests` (`status`, `created_at`, `resolved_at`, `sla_deadline_at`). See `backend/src/services/dashboard-insights-service.ts` (~L640–700).
- **No-shows** — `auto-no-show-worker` already flips `appointments.status → 'no_show'` and audits `appointment.auto_no_show` (`backend/src/workers/auto-no-show-worker.ts#flipToNoShow`, ~L465).
- **Payment/refund stuck** — `modality-refund-retry-worker` already writes `admin_payment_alerts (alert_kind='refund_stuck_24h')` after 7 failed attempts (`backend/migrations/077_…`, `backend/src/workers/modality-refund-retry-worker.ts`).

The infrastructure to *surface* these already exists too: `insertDashboardEvent`, cursor pagination, unread-first index, per-row acknowledge, RLS (`doctor_id = auth.uid()`), and the Phase-1 UI (badge, Load more, Mark all read). Phase 2 is mostly **one additive migration + a few emitter call-sites + read-model type/UI copy** — mirroring exactly how Plan 08 (Tasks 42/44) widened the same feed.

---

## Grounded current state

| Piece | Location | Note |
|---|---|---|
| Feed table | `backend/migrations/066_doctor_dashboard_events.sql` | `event_kind TEXT + CHECK`; `payload JSONB`; `acknowledged_at`; `session_id ON DELETE SET NULL`; `doctor_id → auth.users ON DELETE CASCADE`. |
| CHECK-widen precedent | migrations `073`, `074` | Additive `DROP CONSTRAINT` + `ADD CONSTRAINT` with the **full enumerated list**. Idempotent. Reverse documented in-file. |
| Current legal kinds | `dashboard-events-service.ts#DashboardEventKind` | `patient_replayed_recording`, `patient_revoked_video_mid_session`, `patient_replayed_video`. |
| Insert path | `insertDashboardEvent()` | Service-role insert. **Idempotency is hardcoded to `payload->>'recording_access_audit_id'`** (see ⚠️ ALR2-D5). |
| RLS | migration 066 | `select_self` + `update_self` on `doctor_id = auth.uid()`. INSERT service-role-only. **No DELETE policy.** |
| Retention | migration 066 header | "swept by a future retention worker (out-of-scope for v1)". **Never shipped.** |
| SLA signal | `getBookingFunnel` (read-time) | Derived at read; **no event is emitted** when a breach happens — breach is a *time-passing* condition, so a scan/cron is required (ALR2-D3). |
| No-show signal | `auto-no-show-worker#flipToNoShow` | Emitter point exists; the flip already knows `doctorId` + `appointmentId`. |
| Refund-stuck signal | `admin_payment_alerts` | **Admin/ops table**, `CRON_SECRET`-gated. Not doctor-scoped. |
| Phase-1 UI | `DoctorDashboardEventFeed.tsx` | `describeEvent()` switch, Load more, Mark all read (client loop). Read-model types in `frontend/lib/api.ts`. |

---

## Decision lock (DRAFT — confirm before any code)

| ID | Decision | Rationale / implication |
|----|----------|-------------------------|
| **ALR2-D1** | **Reuse `doctor_dashboard_events`.** No new table for doctor-facing kinds. | The table was designed to widen additively (066 header names Plans 08/09). RLS + pagination + acknowledge already fit. |
| **ALR2-D2** | **Ship exactly two new doctor kinds in v2:** `booking_review_sla_breach` (action-needed) and `appointment_no_show` (informational). | Both are the doctor's own work/patients, both derive from signals already computed, both are legitimately doctor-scoped. |
| **ALR2-D3** | **`payment_refund_stuck` does NOT enter the doctor feed.** It stays in `admin_payment_alerts` (ops surface). | A treating doctor cannot action a stuck Razorpay refund; surfacing it in their Alerts is noise + arguably leaks payment-ops state. If a *doctor-facing* payment alert is ever wanted, it needs its own decision lock. **Ranked out of v2.** |
| **ALR2-D4** | **SLA-breach is emitted by a scan (cron), not a lifecycle hook.** | A breach is "deadline passed while still pending" — no user action fires at the breach instant. Mirror the `auto-no-show-worker` in-process interval pattern (or mount on `routes/cron.ts`). Dedupe on the review-request id. |
| **ALR2-D5** | **Generalize `insertDashboardEvent` idempotency** from the hardcoded `recording_access_audit_id` to a caller-supplied **dedupe key** (`payload->>'<field>'` or an explicit column). | Today the pre-check only keys on `recording_access_audit_id`; new kinds dedupe on `review_request_id` / `appointment_id`. **Required service change — not optional.** Prefer a dedicated nullable `dedupe_key TEXT` column + partial unique index over per-kind JSONB path checks (cleaner, race-safe). |
| **ALR2-D6** | **Severity is a first-class, additive payload field** (`severity: 'info' \| 'action_needed'`), not a new column. | UI sorts/styles action-needed above info without a schema change; forward-compatible with future kinds. |
| **ALR2-D7** | **PHI stays at the Decision-4 bar:** `patient_display_name` + a date label only. No new identifiers. SLA-breach may carry a **review-request id** (opaque UUID, not PHI) for deep-linking. | Matches ALR-D7 from v1. Every new payload field is PHI-classified in §Payloads. |
| **ALR2-D8** | **Retention worker becomes a v2 prerequisite** (promote the parked 066 item). | No-show + SLA breach are higher-volume than replay. Ship a sweep (delete acknowledged rows older than N days) with this batch, or the table grows unbounded. |
| **ALR2-D9** | **Deep-links, not inline actions.** An alert row links to the owning surface (SLA → `/dashboard/booking-review`; no-show → the appointment/patient). No triage actions inside the feed in v2. | Keeps the feed a notifier, not a second action console; avoids duplicating booking-review triage. |
| **ALR2-D10** | **Bulk `acknowledge-all` endpoint** now earns its keep (replaces the Phase-1 client loop) once action-needed volume is real. | Optional within v2; gate on dogfood. If added, it's a doctor-scoped `POST /api/v1/dashboard/events/acknowledge-all` (RLS-guarded UPDATE). |

---

## Candidate kinds — ranked

### 1. `booking_review_sla_breach` — **action-needed** (ship)
- **Signal:** `service_staff_review_requests` row with `status='pending'` and `sla_deadline_at < now()` (the exact predicate `getBookingFunnel` already evaluates for `breachedSla`).
- **Emitter:** new scan (cron / in-process interval, ALR2-D4). Per tick: select breached-and-still-pending requests without an existing event; insert one event each; dedupe on `review_request_id`.
- **Severity:** `action_needed`. **Dedupe key:** `review_request_id`. **Deep-link:** `/dashboard/booking-review`.
- **Doctor vs admin:** doctor-scoped (`service_staff_review_requests.doctor_id`). ✅ belongs in this feed.
- **Volume:** low–moderate (bounded by pending review backlog per doctor).

### 2. `appointment_no_show` — **informational** (ship)
- **Signal:** `appointments.status` flipped to `no_show`.
- **Emitter:** `auto-no-show-worker#flipToNoShow` — after the successful atomic flip (right where `appointment.auto_no_show` is audited), call `insertDashboardEvent({ doctorId, eventKind: 'appointment_no_show', sessionId: null, payload, dedupeKey: appointmentId })`. **Open question OQ-1:** should *manual* no-shows (doctor flips it themselves in the UI) also emit? Default: **no** — the doctor already knows; only the worker (silent, automated) flip is newsworthy.
- **Severity:** `info`. **Dedupe key:** `appointment_id`. **Deep-link:** appointment/patient view.
- **Doctor vs admin:** doctor-scoped. ✅ belongs in this feed.
- **Volume:** moderate (one per auto-flipped appointment).

### 3. `payment_refund_stuck` — **route to admin, NOT doctor feed** (do NOT ship into `doctor_dashboard_events`)
- **Signal:** `admin_payment_alerts (alert_kind='refund_stuck_24h')`, already written by the refund worker.
- **Decision (ALR2-D3):** stays on the **admin ops surface**. A treating doctor cannot resolve a Razorpay refund; adding it to their Alerts is noise and leaks payment-ops internals. If a doctor-facing "your patient's refund is delayed" message is ever desired, that is a *different* kind with its own PHI/consent review — out of scope here.

---

## Data-model decisions (specify, do not build)

### Migration shape (additive CHECK widen — mirror 073/074)

```sql
-- Part 1 — widen event_kind CHECK (full enumerated list, idempotent)
ALTER TABLE doctor_dashboard_events
    DROP CONSTRAINT IF EXISTS doctor_dashboard_events_event_kind_check;
ALTER TABLE doctor_dashboard_events
    ADD CONSTRAINT doctor_dashboard_events_event_kind_check CHECK (
      event_kind IN (
        'patient_replayed_recording',
        'patient_revoked_video_mid_session',
        'patient_replayed_video',
        'booking_review_sla_breach',      -- alerts-v2
        'appointment_no_show'             -- alerts-v2
      )
    );

-- Part 2 — generalized dedupe key (ALR2-D5)
ALTER TABLE doctor_dashboard_events
    ADD COLUMN IF NOT EXISTS dedupe_key TEXT;
-- One event per (doctor, dedupe_key) when a key is supplied. Partial
-- unique index so legacy rows (NULL dedupe_key) are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS uq_doctor_dashboard_events_dedupe
    ON doctor_dashboard_events(doctor_id, dedupe_key)
    WHERE dedupe_key IS NOT NULL;
```

- **Additive + reversible.** Reverse = narrow the CHECK back to the 3 shipped kinds + drop the index/column (documented in-file, per `MIGRATIONS_AND_CHANGE.md`). **Do not revert once v2 rows exist.**
- **No backfill.** Legacy rows keep `dedupe_key = NULL`; existing `recording_access_audit_id` dedupe path can migrate onto `dedupe_key` in a later cleanup (not required for v2 correctness — the two paths coexist).

### Payload shapes (mirror the `dashboard-events-service.ts` doc style)

```ts
/** event_kind === 'booking_review_sla_breach' */
interface BookingReviewSlaBreachPayload {
  severity: 'action_needed';           // PHI: none
  review_request_id: string;           // PHI: none (opaque UUID) — deep-link target
  patient_display_name: string;        // PHI: name only (Decision-4 bar); '' → "A patient"
  requested_at: string;                // PHI: none (ISO)
  sla_deadline_at: string;             // PHI: none (ISO)
}

/** event_kind === 'appointment_no_show' */
interface AppointmentNoShowPayload {
  severity: 'info';                    // PHI: none
  appointment_id: string;              // PHI: none (opaque UUID) — deep-link target
  patient_display_name: string;        // PHI: name only; '' → "A patient"
  appointment_date: string;            // PHI: none (ISO)
}
```

- Every field PHI-classified above. **No new identifier classes** beyond the existing `patient_display_name` (ALR2-D7).
- Frontend read-model (`frontend/lib/api.ts`): extend the discriminated `DashboardEvent` union with these two kinds (read-model only, mirrors the v1 ALR-D8 sync).

### RLS (state explicitly — expected: NO change)

- The two new kinds are **inserted via service-role** (worker/cron using the admin client), exactly like every current kind. The existing `doctor_dashboard_events_select_self` / `_update_self` policies (`doctor_id = auth.uid()`) already cover doctor reads + acknowledges of the new rows.
- **No new policy required.** The migration adds a CHECK value + a dedupe column/index — neither needs a policy. This must be **explicitly re-confirmed** in the migration task (per migrations rule), not assumed.

### Retention (ALR2-D8 — now a prerequisite)

- Promote the parked 066 retention worker: an in-process sweep (or `routes/cron.ts` job) that deletes `acknowledged_at IS NOT NULL AND acknowledged_at < now() - interval 'N days'` (propose **N = 90**), capped per tick. Service-role delete (no DELETE policy needed; admin client bypasses RLS).
- Rationale: no-show + SLA breach out-volume replay events; without a sweep the hot unread-first index degrades over time.

---

## Emitter decisions

| Kind | Insertion point | Dedupe key | Severity → UI | Retry-safe? |
|---|---|---|---|---|
| `booking_review_sla_breach` | New scan (cron / interval, ALR2-D4) selecting breached-pending review requests without an existing event | `review_request_id` | `action_needed` → sorted/styled above info; deep-link → `/dashboard/booking-review` | Yes — `(doctor_id, dedupe_key)` unique index makes re-scans no-op |
| `appointment_no_show` | `auto-no-show-worker#flipToNoShow`, after the audited flip | `appointment_id` | `info` → default style; deep-link → appointment/patient | Yes — same unique index; worker already idempotent on the flip |

- **Severity → UI treatment (ALR2-D6):** action-needed rows get a distinct accent (e.g. a `bg-destructive/5` row tint + a small "Action needed" tag) and sort to the top of the unread bucket; info rows keep the current neutral style. Exact tokens decided at UI-task time.
- Both emitters call the **generalized** `insertDashboardEvent` with a `dedupeKey` (ALR2-D5); no double-fire on worker restarts / overlapping ticks.

---

## UI / API deltas for alerts-v2

1. **Copy** — extend `describeEvent()` with the two kinds (non-alarming, Decision-4 tone):
   - `booking_review_sla_breach` → e.g. "A booking request for {name} is past its review deadline." + "Action needed" tag.
   - `appointment_no_show` → e.g. "{name} didn't show for their appointment on {date}."
2. **Severity styling + sort** (ALR2-D6): action-needed above info within the unread bucket; distinct accent.
3. **Deep-links** (ALR2-D9): row → owning surface (SLA → `/dashboard/booking-review`; no-show → appointment/patient).
4. **Filter/group** (optional): a severity filter ("Action needed only") once both kinds ship and volume warrants it.
5. **Bulk acknowledge-all endpoint** (ALR2-D10, optional): `POST /api/v1/dashboard/events/acknowledge-all` (doctor-scoped RLS UPDATE) replacing the Phase-1 client loop if action-needed volume makes N round-trips slow.
6. **Read-model type sync** (`frontend/lib/api.ts`): add the two payload shapes to the discriminated union (mirrors v1 ALR-D8).

---

## ⚠️ Scope guard (for the eventual execution batch)

- **Additive-only migration** — widen the CHECK + add the dedupe column/index; never narrow or drop existing kinds. Reverse documented in-file.
- **Do NOT** put `payment_refund_stuck` into the doctor feed (ALR2-D3).
- **Do NOT** add new PHI beyond `patient_display_name` + date labels (ALR2-D7).
- **Do NOT** build inline triage actions in the feed (ALR2-D9) — deep-link only.
- **Confirm RLS is unchanged explicitly** in the migration task (don't assume).
- Every migration + emitter task runs on **Opus** with the decision lock confirmed first.

---

## Proposed task list (for promotion to a dated batch)

| Task | Title | Size | Model | Notes |
|---|---|---|---|---|
| `alr2-01` | Migration: widen `event_kind` CHECK + `dedupe_key` column/index (additive, reversible) | S | **Opus** | Hard-rules migration. Confirm RLS unchanged. |
| `alr2-02` | Generalize `insertDashboardEvent` dedupe (key-based, ALR2-D5) + service types for 2 new kinds | S–M | **Opus** | Service change; backend tests for dedupe. |
| `alr2-03` | Emitter: `appointment_no_show` in `auto-no-show-worker` (+ OQ-1 decision on manual flips) | S | **Opus** | Touches worker + PHI payload. |
| `alr2-04` | Emitter: `booking_review_sla_breach` scan (cron/interval) + dedupe | M | **Opus** | New scan; PHI payload; idempotency. |
| `alr2-05` | Retention sweep worker (ALR2-D8) | S | **Opus** | Prevents unbounded growth. |
| `alr2-06` | Frontend: read-model types + `describeEvent` copy + severity styling/sort + deep-links | M | Sonnet | Read-model + UI; no backend. |
| `alr2-07` | (Optional) `acknowledge-all` endpoint (ALR2-D10) | S | Sonnet/Opus | Gate on dogfood. |
| `alr2-08` | Close gate: acceptance, PHI sweep, light/dark smoke, verification | S | Sonnet/Composer | |

---

## Acceptance gate (for the eventual batch)

- [x] Additive migration applied; CHECK lists all 5 kinds; `dedupe_key` unique index live; **RLS confirmed unchanged**; reverse documented.
- [x] `insertDashboardEvent` dedupes on a caller-supplied key; re-runs/retries never double-insert.
- [x] Both new kinds emit from their real signal points; no-show from the worker flip, SLA breach from the scan; dedup verified.
- [x] Feed renders correct, non-alarming copy for both kinds; action-needed sorts/styles above info; deep-links land on the owning surface.
- [x] No new PHI beyond `patient_display_name` + date labels; `payment_refund_stuck` NOT in the doctor feed.
- [x] Retention sweep in place; verification gate (tsc/lint/tests) green for the slice.

---

## Open questions

- **OQ-1:** ~~Do manual (doctor-initiated) no-shows emit?~~ → **LOCKED: no** (worker-only; follow-up in inbox).
- **OQ-2:** ~~SLA scan interval vs cron?~~ → **LOCKED: cron route** (`POST /cron/booking-review-sla-alerts`).
- **OQ-3:** ~~Retention window N (draft 90 days)~~ → **LOCKED: 90 days** (`DASHBOARD_EVENTS_RETENTION_DAYS`, floor 1). Unread rows never swept. Acknowledged-only predicate preserves the 066 "doctor was notified" audit intent longer than the original ~30-day parking note.

---

## References

- Parent: [`../alerts-v1/plan-alerts-v1-batch.md`](../alerts-v1/plan-alerts-v1-batch.md) · design task [`../alerts-v1/Tasks/task-alr-04-phase2-expansion-design.md`](../alerts-v1/Tasks/task-alr-04-phase2-expansion-design.md)
- Feed origin: `backend/migrations/066_doctor_dashboard_events.sql` · widens `073` / `074`
- Service: `backend/src/services/dashboard-events-service.ts`
- Signals: `backend/src/services/dashboard-insights-service.ts#getBookingFunnel` · `backend/src/workers/auto-no-show-worker.ts` · `backend/src/workers/modality-refund-retry-worker.ts` · `backend/migrations/077_modality_refund_retry_and_admin_alerts.sql`
- Rules: `.cursor/rules/00-agent-contract.mdc` · `.cursor/rules/migrations.mdc` · `docs/Reference/engineering/development/MIGRATIONS_AND_CHANGE.md`
- Promoted inbox item: `admin_payment_alerts` (parked) — resolved here as **admin-only** (ALR2-D3).

---

**Created:** 2026-07-21 (Opus, alr-04). **Status:** 📋 Task files scaffolded (2026-07-21) — exec order + `alr2-01`…`alr2-08` written under [`./Tasks/`](./Tasks/EXECUTION-ORDER-alerts-v2.md). **Execution still GATED:** do not start Wave 1 until (a) `ALR2-D1`…`D10` are human-confirmed and (b) OQ-1/2/3 are answered. The migration + emitter tasks run on **Opus**.
