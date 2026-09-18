# Plan p4 — Inbox filters simplify (batch)

> **Status:** ✅ Done (2026-07-27).  
> **Program:** [`../README.md`](../README.md) · Prefix `ibi` · Tasks `ibi-12`…`ibi-14`  
> **One-line intent:** Replace Signal/All/Needs-review tabs with **pinned Needs review lane** + **one filterable feed** (channel, lifecycle status, date, hide quiet chats).

---

## Decisions (founder 2026-07-27)

| ID | Decision |
|----|----------|
| **IBI4-D1** | Needs review stays a **pinned badged lane** above the list (immediate actions). |
| **IBI4-D2** | One lifecycle vocabulary: `new_lead \| in_conversation \| booking_pending \| booked \| paid \| cancelled \| no_show`. |
| **IBI4-D3** | Default date window = **last 30 days**. |
| **IBI4-D4** | Signal/All → **"Hide quiet chats"** toggle (default on = former `scope=signal`). |

---

## Task list

| Task | Title | Model |
|------|-------|-------|
| `ibi-12` | Backend: cancelled/no_show + date + multi-status filters | Sonnet |
| `ibi-13` | FE: pinned Needs review + filter bar + toggle | Sonnet |
| `ibi-14` | Close gate p4 | Composer |

---

## Acceptance gate

- [x] No Signal/All/Needs review peer tabs.
- [x] Needs review pinned with confirm/reassign.
- [x] Channel / status / date / hide-quiet-chats work; default last 30d + quiet hidden.
- [x] Cancelled / no-show appointments fuse correctly.
- [x] Tests green.

---

**Created:** 2026-07-27.
