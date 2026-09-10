# Plan p2 — Read-only thread drawer in Booking review (batch)

> **Status:** ✅ Done (2026-07-27).  
> **Program:** [`../README.md`](../README.md) · Prefix `ibi` · Tasks `ibi-03`…`ibi-05`  
> **One-line intent:** Doctor can open a Booking review row and **read the receptionist DM thread** (no reply) — fills the existing "Conversation view coming soon" placeholder.

---

## Why this phase

Booking review already has the triage list + detail sheet. The sheet promises a conversation view. Shipping a **doctor-scoped, IDOR-safe messages read API** + wiring the drawer is the smallest honest slice of the Inbox before a full tab. Validates the security model before p3 lists every conversation.

**Not in this phase:** standalone Inbox tab, comment-only leads list, path timeline, sidebar merge (all p3).

---

## Decision lock

Inherit program **IB\*** / **IBI-D\***. Phase-specific:

| ID | Decision | Implication |
|----|----------|-------------|
| **IBI2-D1** | New route under `/api/v1/interactions/:id/messages` (IBI-D1), even if list API lands in p3. | Stable URL for p3 FE; Booking review drawer uses it now. |
| **IBI2-D2** | **Always** verify `conversation.doctor_id === req.user.id` before returning messages. Never call bare `getConversationMessages` from a doctor controller. | Closes IDOR footgun (worker helper is trust-the-caller). |
| **IBI2-D3** | Response is read-only message list (id, sender_type, content, intent, created_at) — no send. | IB1. |
| **IBI2-D4** | Drawer lives in `ReviewDetailSheet` (or successor); no new sidebar item yet. | Smallest UI surface. |

---

## Scope guard

- **DO NOT** add doctor reply / send.
- **DO NOT** remove Booking review sidebar item yet (p3).
- **DO NOT** return messages without doctor ownership check.
- **Opus** for `ibi-03` (PHI + authz).
- Never log message content / PII.

---

## Task list

| Task | Title | Size | Model |
|------|-------|------|-------|
| `ibi-03` | Doctor-scoped messages API (IDOR-safe) | M | **Opus** |
| `ibi-04` | Read-only thread drawer in Booking review | M | Sonnet |
| `ibi-05` | Close gate p2 | S | Composer |

---

## Acceptance gate

- [x] Authenticated doctor can `GET /api/v1/interactions/:conversationId/messages` for **own** conversation and see receptionist thread.
- [x] Request for another doctor's conversation → 404/403 (no leak).
- [x] Booking review detail sheet shows the thread (replaces "coming soon").
- [x] No reply UI / no send endpoint.
- [x] Typecheck + unit tests for authz + FE smoke.

---

**Created:** 2026-07-27.
