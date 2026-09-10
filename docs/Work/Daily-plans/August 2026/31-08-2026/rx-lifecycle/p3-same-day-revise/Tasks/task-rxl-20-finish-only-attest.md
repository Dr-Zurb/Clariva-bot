# Task rxl-20: Only Finish attests

**Program / Phase:** rx-lifecycle · Phase 3-A
**Status:** Implemented 2026-09-09
**Change Type:** Update existing — reverses RXL-Q1 (relocked 2026-09-09: Finish only)

Print (`GET /pdf` and `pdf-url`) and send (`notification-service` after a successful channel) currently call `attestPrescriptionIfUnset`. That locks the chart when the doctor only wanted to hand over an order slip.

Keep attest on wrap-up: `attestLatestPrescriptionForAppointment` from `wrapUpAppointment`.

**Not this task:** `printed_at` / `issued_at` columns (those are `rxl-21`). Preview CTA split ("Send & finish" → separate Send / Finish) — print-without-finish already exists on the preview pane.
