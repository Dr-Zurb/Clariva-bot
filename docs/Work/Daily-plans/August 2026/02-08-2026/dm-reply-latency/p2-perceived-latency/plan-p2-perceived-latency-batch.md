# Plan p2 — Perceived latency (batch)

> **Status:** 🔒 Blocked on `lat-06`. Do not start until p1 numbers exist.
> **Program:** [`../README.md`](../README.md) · Prefix `lat` · Tasks `lat-07`…`lat-08`
> **One-line intent:** Make the thread look alive within about a second, so whatever wait remains reads as thinking rather than broken.

---

## Why this phase

p1 removes waste. It cannot remove the irreducible cost of an LLM writing a good reply. Whatever that lands at — three seconds, four — the patient currently stares at nothing the whole time, and silence is indistinguishable from failure.

A typing indicator changes the interpretation of the same wait. It is the cheapest product win available here, and unlike the alternative it does not create a second message.

**Why not a "please wait" bubble:** that was assessed in April and deferred on its merits — two bubbles interact badly with dedupe, the send throttle, and the conversation lock, and it burns a Graph round trip to say nothing. See [`deferred-instagram-dm-interim-please-wait-2026-04.md`](../../../../../capture/features/messaging-bot/deferred-instagram-dm-interim-please-wait-2026-04.md). LAT-D2 makes that a program-level lock; this phase does not revisit it.

**Not in this phase:** touching the actual reply time (p1, p3), streaming or partial replies, read receipts as a product feature beyond what the indicator needs.

---

## Decision lock

Inherit program **LAT-D1…D8**. Phase-specific:

| ID | Decision | Implication |
|----|----------|-------------|
| **LAT2-D1** | The indicator is **`sender_action`**, not a message. | It cannot be duplicated into the transcript, cannot be dedupe-relevant, and cannot be mistaken for bot copy. This is the entire reason p2 is allowed where the "please wait" bubble was not. |
| **LAT2-D2** | It is **fire-and-forget**. A failed indicator never fails, delays, or retries the turn. | It is decoration. Decoration must not be able to break delivery. |
| **LAT2-D3** | It fires **after** the webhook is accepted and the doctor/token is resolved, and **before** the LLM work — not from the HTTP handler. | The HTTP handler must stay fast enough to ack Meta; the worker is where we know who to send to. |
| **LAT2-D4** | Suppress it on paths that will reply near-instantly (cache hit, throttle skip, non-actionable event). | A typing bubble that flickers for 200 ms looks worse than none. |
| **LAT2-D5** | No new user-visible copy ships in this phase. | Copy is a language-policy surface (`dm-copy`, LANG3-*). An indicator sidesteps that entirely; a message would not. |

---

## Scope guard

- **DO NOT** send any message, ack, or placeholder text (LAT-D2 / LAT2-D1).
- **DO NOT** let the indicator share the send lock, reply throttle, or idempotency machinery used by the real reply (LAT-D3).
- **DO NOT** retry the indicator. One attempt, swallowed on failure.
- **DO NOT** add it to comment paths, notification paths, or out-of-band senders — inbound DM turns only.
- **DO NOT** start before `lat-06` records the p1 numbers; the phase may be cancelled on that evidence.

---

## Task list

| Task | Title | Size | Model |
|------|-------|------|-------|
| `lat-07` | Typing indicator (`sender_action`) | M | Sonnet |
| `lat-08` | Close gate p2 | S | Composer / Founder |

---

## Acceptance gate

- [ ] Typing indicator visible in a real Instagram thread within **≤ 1.5 s** of the patient sending.
- [ ] Indicator failure (forced) leaves the real reply completely unaffected.
- [ ] No extra message appears in the transcript, ever.
- [ ] No change to `handlerPreSendMs` or job total beyond noise — the indicator must not be on the critical path.
- [ ] Not fired on throttle-skip, echo, or non-actionable events.
- [ ] Typecheck + lint + tests green.

---

**Created:** 2026-08-02.
