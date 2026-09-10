# Plan p3 — Standalone Inbox tab + merge Booking review (batch)

> **Status:** ✅ Done (2026-07-27).  
> **Program:** [`../README.md`](../README.md) · Prefix `ibi` · Tasks `ibi-06`…`ibi-11`  
> **One-line intent:** Ship the doctor **Inbox** — list every signal-bearing interaction across channels, show path timeline + thread, fold Booking review in as a filter, retire the separate sidebar item.

---

## Why this phase

p2 proved IDOR-safe thread reads inside Booking review. p3 graduates that into the real product surface: a channel-agnostic **Inbox** that is the doctor's front-desk log (IB3–IB5). This is the doctor-facing consumption layer for Axis A channels.

**Not in this phase:** doctor reply / AI handoff (IBI-D7); consult chat; WhatsApp-specific UI.

---

## Decision lock

Inherit program **IB\*** / **IBI-D\***. Phase-specific:

| ID | Decision | Implication |
|----|----------|-------------|
| **IBI3-D1** | List `GET /api/v1/interactions?scope=signal\|all&channel=&status=&cursor=` returns unified DTOs (conversation rows + comment-only lead rows). | IBI-D1, D2, D4. |
| **IBI3-D2** | Detail `GET /api/v1/interactions/:id` returns path timeline steps + summary (messages stay on `/:id/messages` from p2). Comment-only rows use lead id with a typed id scheme documented in `ibi-06`/`ibi-07`. | Avoid stuffing full thread into list. |
| **IBI3-D3** | Fused status chip server-computed: `new_lead \| in_conversation \| needs_review \| booking_pending \| booked \| paid` (exact enum in `ibi-06`). | Answers pending vs booked. |
| **IBI3-D4** | Sidebar: **Inbox** replaces **Booking review**; old `/dashboard/booking-review` redirects to Inbox with `?filter=needs_review` (or equivalent). | IB3; no broken bookmarks. |
| **IBI3-D5** | Badge: migrate `bookingReviewsUnconfirmed` onto Inbox (pending review count and/or unread signal — prefer keep review-count semantics unless product says otherwise). | Continuity for doctors. |

---

## Scope guard

- **DO NOT** add reply/send.
- **DO NOT** include `consultation_messages` in timeline (IB2).
- **Opus** for `ibi-06` (PHI list/detail).
- Controllers: Zod + asyncHandler only; services use admin client + explicit `doctor_id`.
- Never log PII/PHI.

---

## Task list

| Task | Title | Size | Model |
|------|-------|------|-------|
| `ibi-06` | List/detail interactions API + enrichment + signal filter | L | **Opus** |
| `ibi-07` | Comment-only leads in list (IB4) | M | Sonnet |
| `ibi-08` | Path timeline payload on interaction detail | M | Sonnet |
| `ibi-09` | Inbox UI tab + merge Booking review + sidebar | L | Sonnet |
| `ibi-10` | Badge migration + polling | S | Composer / Sonnet |
| `ibi-11` | Close gate p3 | S | Composer / Founder |

---

## Acceptance gate

- [x] Sidebar shows **Inbox** (no separate Booking review).
- [x] Default list = signal-bearing; **All** shows every conversation.
- [x] Comment-only leads appear as rows.
- [x] Opening a row shows path timeline + read-only thread.
- [x] Needs-review filter shows former Booking review queue; actions still work (confirm/reassign) or are linked.
- [x] Old `/dashboard/booking-review` redirects cleanly.
- [x] Badge on Inbox reflects pending reviews (or agreed metric).
- [x] Cross-doctor IDOR tests still green for list + detail + messages.
- [x] Typecheck + tests green; founder smoke on IG (and FB if connected). *(live Meta smoke optional)*

---

**Created:** 2026-07-27.
