# OPD Support Runbook

Operational reference for support engineers handling OPD-related tickets in the clariva-bot EHR. Covers per-day mode lifecycle, conversion semantics, overrun handling, policy resolution, and patient-facing queue/slot issues.

> **Source plan:** [plan-opd-per-day-mode.md](../Work/Daily-plans/May%202026/17-05-2026/opd-per-day-mode/plan-opd-per-day-mode-batch.md) (DL-1..DL-16).  
> **API contracts:** [CONTRACTS.md § Doctor OPD session snapshot](../architecture/CONTRACTS.md#-doctor-opd-session-snapshot-pdm-02--pdm-12), [§ Patient OPD session snapshot](../architecture/CONTRACTS.md#-patient-opd-session-snapshot-e-task-opd-04).

---

## 1. Mode lifecycle

A doctor's OPD operates in one of two modes **per calendar day**: **slot** (fixed-time appointments) or **queue** (token-numbered walk-ins). Mode is a **per-day fact**, not a global doctor toggle.

### Where to look

**Today's mode for Dr. X on `2026-05-17`:**

```sql
SELECT mode, source, change_count, changed_at
FROM doctor_opd_session_modes
WHERE doctor_id = '<uuid>' AND session_date = '2026-05-17';
```

**If no row exists:** mode is **resolved on the fly** via DL-9 — walk `opd_policies.mode_schedule`:

1. `date_overrides` (later array entry wins)  
2. `date_range_overrides` (later wins)  
3. `weekly_overrides[weekday]`  
4. `default_mode`  
5. `doctor_settings.opd_mode` (legacy)  
6. `'slot'`

**Audit history of flips for a doctor/date:**

```sql
SELECT from_mode, to_mode, affected_apt_count, overflow_count,
       notification_dispatched, triggered_by, notes, created_at
FROM doctor_opd_session_mode_changes
WHERE doctor_id = '<uuid>' AND session_date = '2026-05-17'
ORDER BY created_at DESC;
```

---

## 2. Conversion semantics

When a doctor flips a day's mode with existing bookings, the system **automatically reassigns** non-terminal appointments (`pending` / `confirmed`). No patient action is required.

### Slot → Queue (lossless)

1. Sort by `appointment_date ASC`, tiebreaker `created_at ASC`.
2. Mint `opd_queue_entries` with `token_number = 1..N`.
3. Keep original `appointment_date` (reverse-flip safety).
4. Clear slot fields: `opd_session_delay_minutes`, `opd_early_invite_expires_at`, `opd_early_invite_response`.

**Patient impact:** slot→queue notification (DL-6 template 1) — *"Dr. {name} has changed {date} to queue mode. Your slot at {time} is now token #{n}…"*

### Queue → Slot (may overflow)

1. Sort by `token_number ASC`.
2. Build slot grid from `slot_interval_minutes` + working hours.
3. Assign first `min(N, slot_capacity)` rows to grid positions in token order.
4. Surplus rows → `opd_event_type = 'return_after_completed'` overflow slots at `session_end + (index + 1) * interval`.
5. Delete original `opd_queue_entries`.

**Patient impact:** regular-grid patients get queue→slot notification (template 2); overflow patients get overflow notification (template 3).

### Net-zero flips (debounce)

Slot→queue→slot within **5 minutes** → **no** patient notifications; pending batch cancelled before dispatch.

---

## 3. Overrun handling

### Flagging

`pending` / `confirmed` appointments past `session_end + 30 min` get `session_overrun_at = now()` from the flagging worker (`runOpdOverrunFlaggingCron`, every **5 min** when enabled).

### Doctor action (DL-7)

OPD-tab tray surfaces flagged rows. Bulk actions:

| Action | Effect |
|--------|--------|
| `reschedule_all` (default) | Next-available slot, same modality + service; patients notified |
| `reschedule_per_patient` | Same, doctor picks slot per row |
| `mark_completed` | `completed`, flag cleared |
| `cancel_refund` | Refund + `cancelled`; patients notified |
| `mark_no_show` | `no_show`, flag cleared |

Per-row overrides supported.

### Auto-reschedule fallback (DL-8)

If the doctor does not action within **24h**, the fallback worker (`runOpdOverrunFallbackCron`, hourly) auto-reschedules with `triggered_by = 'system_overrun_fallback'`.

### Diagnostics

**Why is this row still `pending` past session?**

```sql
SELECT id, status, appointment_date, session_overrun_at,
       cancelled_at, cancellation_reason
FROM appointments
WHERE id = '<uuid>';
```

- `session_overrun_at IS NOT NULL` → flagged; waiting on doctor or fallback.
- `session_overrun_at IS NULL` and `appointment_date < now() - interval '30 min'` → flagging cron not run yet; check worker health / `OPD_OVERRUN_WORKER_ENABLED`.

**Manually run workers (dev/staging):** import `startOpdOverrunWorker` from `backend/src/workers/opd-overrun-cron.ts` and call `runFlaggingOnce()` / `runFallbackOnce()` on the returned handle (started from app bootstrap when env enables it).

---

## 4. Policy resolution priority (DL-9)

Example `mode_schedule`:

```jsonc
{
  "default_mode": "slot",
  "weekly_overrides": { "tue": "queue" },
  "date_range_overrides": [
    { "from": "2026-06-01", "to": "2026-06-15", "mode": "queue" }
  ],
  "date_overrides": [
    { "date": "2026-06-09", "mode": "slot" }
  ]
}
```

| Date | Weekday | Resolved mode | Source |
|------|---------|---------------|--------|
| 2026-05-19 | Tuesday | `queue` | `weekly_overrides.tue` |
| 2026-05-21 | Thursday | `slot` | `default_mode` |
| 2026-06-05 | Friday | `queue` | `date_range_overrides[0]` |
| 2026-06-09 | Tuesday | `slot` | `date_overrides[0]` (beats range + weekly) |

Public booking: `GET /api/v1/public/doctors/:id/mode-schedule?from=&to=` returns the same resolver map for the date picker (DL-16).

---

## 5. Notification debounce

Conversion notifications use a **5 min** debounce (DL-5). Each flip schedules `now + 5 min`; another flip within the window slides to `latest_flip + 5 min`. **Hard ceiling:** dispatch no later than `first_flip + 30 min`.

**Pending batches:**

```sql
SELECT doctor_id, session_date, first_flip_at, latest_flip_at,
       scheduled_for, latest_flip_mode
FROM doctor_opd_pending_mode_notifications
ORDER BY scheduled_for ASC;
```

---

## 6. Backwards-compatibility surfaces

- `GET /api/v1/opd/slot-session` and `GET /api/v1/opd/queue-session` are **deprecated** (Sunset: **2026-08-01**). Use `GET /api/v1/opd/session?date=YYYY-MM-DD`.
- `doctor_settings.opd_mode` remains a **tertiary fallback** in the resolver; prefer `opd_policies.mode_schedule`.

---

## Patient-facing troubleshooting (legacy)

### Patient: “ETA looks wrong”

1. **Confirm mode** — queue uses token order + rolling average ETA, not a fixed clock.
2. **Cold start** — early session ETAs may be wide; copy should say approximate.
3. **Logs** — `opd_metric` + `opd_eta_computed_total` with `correlationId` (no PHI in metric lines).
4. **Doctor delay** — patient snapshot prefers `opd_session_delay_minutes` over computed delay when set.

### Patient: “I was skipped / lost my place”

1. **Queue** — `opd_queue_entries.status`; doctor may have **requeue** (`end_of_queue` / `after_current`). Metric: `opd_queue_reinsert_total`.
2. **Slot** — join window / `opd_policies.slot_join_grace_minutes`; see e-task-opd-08.

### Patient: “Snapshot doesn’t update”

1. **Polling** — `/api/v1/bookings/session/snapshot` + `suggestedPollSeconds` / `Cache-Control`.
2. **Token** — consultation token validity per [CONTRACTS](../architecture/CONTRACTS.md#-patient-opd-session-snapshot-e-task-opd-04).

### Metrics (log-derived)

See [OBSERVABILITY.md](./OBSERVABILITY.md) — `opd_booking_total`, `opd_eta_computed_total`, `opd_queue_reinsert_total`.

---

## References

- [plan-opd-per-day-mode-batch.md](../Work/Daily-plans/May%202026/17-05-2026/opd-per-day-mode/plan-opd-per-day-mode-batch.md)
- [CONTRACTS.md](../architecture/CONTRACTS.md)
- [OBSERVABILITY.md](./OBSERVABILITY.md), [COMPLIANCE.md](../compliance/COMPLIANCE.md)

**Last updated:** 2026-05-17
