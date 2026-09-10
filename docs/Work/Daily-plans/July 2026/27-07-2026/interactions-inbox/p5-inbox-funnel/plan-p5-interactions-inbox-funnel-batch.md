# Plan p5 — Inbox funnel rail (batch)

> **Status:** ✅ Done (2026-07-27).  
> **Program:** [`../README.md`](../README.md) · Prefix `ibi` · Tasks `ibi-15`…`ibi-17`  
> **One-line intent:** Replace chip-row filters with a **left lifecycle funnel rail** (Needs review pinned) + slim toolbar (channel, date presets+custom, hide quiet). Drop WA + no-show from Inbox. Reschedule = Path event.

---

## Decisions (founder 2026-07-27)

| ID | Decision |
|----|----------|
| **IBI5-D1** | Layout = left funnel rail + list/detail. Needs review at top of rail (not floating card). |
| **IBI5-D2** | Drop **no-show** from Inbox filters (post-appointment → OPD). |
| **IBI5-D3** | Keep **Booked** vs **Paid** separate. |
| **IBI5-D4** | **Rescheduled** = Path timeline step, not a list filter. |
| **IBI5-D5** | Date = presets 7d/30d/90d/All + custom range. |
| **IBI5-D6** | Hide WhatsApp channel chip (channel not shipped). |
| **IBI5-D7** | Label `cancelled` as **Cancelled booking** (patient cancel). Review cancel stays in Needs review. |

---

## Task list

| Task | Title |
|------|-------|
| `ibi-15` | Backend: stage counts + rescheduled timeline step |
| `ibi-16` | FE: funnel rail + toolbar + date custom range |
| `ibi-17` | Close gate p5 |

---

## Acceptance gate

- [x] Funnel rail with Needs review + lifecycle stages + counts.
- [x] No WA chip; no no-show filter chip.
- [x] Date presets include 90d + custom range.
- [x] Path can show Rescheduled when `related_appointment_id` (or multi-appt) present.
- [x] Tests green.

---

**Created:** 2026-07-27.
