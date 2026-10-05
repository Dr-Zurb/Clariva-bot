# Plan p2 — Patient messaging opt-out

> **Product plan:** [`plan-meta-channel-align.md`](../../../../../Product%20plans/plan-meta-channel-align.md)
> **Status:** **Implemented** 2026-09-16. Founder unlocked Auto.
> **Prefix:** `mca` · Tasks `mca-06`…`mca-09`
> **Model:** Auto (founder override). Additive column. Read `MIGRATIONS_AND_CHANGE.md` and `COMPLIANCE.md` first.

Dev Policies §5 requires an ongoing, immediately respected opt-out of messaging. Today `revoke_consent` anonymizes the patient record. That is not “stop DMing me.”

**Not this phase:** intake-off-channel, Rx/email changes (P1), L10 wording.

## Task table

| ID | Title | Size | Model | Status |
|---|---|---|---|---|
| [`mca-06`](./Tasks/task-mca-06-opt-out-column.md) | Persist automated-messaging opt-out | M | Auto | ✅ Implemented 2026-09-16 |
| [`mca-07`](./Tasks/task-mca-07-stop-intent-gate.md) | Detect stop + confirm in-thread | M | Auto | ✅ Implemented 2026-09-16 |
| [`mca-08`](./Tasks/task-mca-08-skip-automated-sends.md) | Automated fan-out honors the flag | M | Auto | ✅ Implemented 2026-09-16 |
| [`mca-09`](./Tasks/task-mca-09-phase-2-gate.md) | Phase 2 gate | S | Auto | ✅ Implemented 2026-09-16 |

## Gate (one sentence)

A patient who asks to stop automated messages is not pinged again; the doctor can still reply from the dashboard; re-opt-in is explicit.

## Locks inherited

MCA-DL-3, MCA-DL-6.

**Founder unlock (16 Sep 2026):** additive nullable timestamp on `conversations`. Existing RLS covers the row. No new policy.

**Created:** 2026-09-15. **Implemented:** 2026-09-16.
