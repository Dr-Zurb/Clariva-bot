# OPD support runbook

**Purpose:** First-line checks when a patient or clinic reports a problem with **queue / slot** OPD flows.

**Related:** [opd-systems-plan.md](../Development/Daily-plans/March%202026/2026-03-24/OPD%20modes/opd-systems-plan.md), [OBSERVABILITY.md](./OBSERVABILITY.md), [COMPLIANCE.md](./COMPLIANCE.md).

---

## Patient: “ETA looks wrong”

1. **Confirm mode** — `doctor_settings.opd_mode`: queue uses **token order + rolling average** ETA, not a fixed clock promise.
2. **Cold start** — Early in a session, ETA range may be wide; copy should say **approximate** (see patient UI).
3. **Logs** — Search structured logs for `opd_metric` + `opd_eta_computed_total` with `correlationId` from the request (no PHI in metric lines).
4. **Doctor delay banner** — If doctor set **session delay** minutes on an appointment, patient snapshot prefers that over computed delay.

---

## Patient: “I was skipped / lost my place”

1. **Queue** — Check `opd_queue_entries.status` for the appointment; doctor may have used **requeue** (`end_of_queue` / `after_current`). Metrics: `opd_queue_reinsert_total`.
2. **Slot** — If **join window** passed, patient may see validation on video join; see `opd_policies.slot_join_grace_minutes` and [e-task-opd-08](../Development/Daily-plans/March%202026/2026-03-24/OPD%20modes/e-task-opd-08-edge-cases-policies-reschedule-payment.md).

---

## Patient: “Snapshot doesn’t update”

1. **Polling** — `/api/v1/bookings/session/snapshot` uses `suggestedPollSeconds` (and `Cache-Control`); client should poll, not rely on push (MVP).
2. **Token** — Consultation token must be valid; expired token may still read snapshot per API contract.

---

## Metrics (log-derived)

See [OBSERVABILITY.md](./OBSERVABILITY.md) — OPD metrics: `opd_booking_total`, `opd_eta_computed_total`, `opd_queue_reinsert_total`.

---

**Last updated:** 2026-03-24
