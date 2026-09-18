# Execution order — p2 perceived latency

> Batch: [`../plan-p2-perceived-latency-batch.md`](../plan-p2-perceived-latency-batch.md)

---

## Pre-flight (before any code)

- [ ] **`lat-06` closed with recorded numbers.** This phase is gated on evidence, not enthusiasm — if p1 landed the reply near ~2 s, an indicator may no longer be worth a Graph call per turn. Read the gate's re-decide section first.
- [ ] Confirm **LAT-D2** and **LAT2-D1**: `sender_action` only, never a message. If you find yourself writing copy, you are in the deferred "please wait" design, which was already rejected.
- [ ] Verify Meta actually supports `sender_action` (`typing_on` / `mark_seen`) for the Instagram messaging product and token type this app uses. **This is a real unknown** — the codebase has no `sender_action` usage anywhere today. If the API does not support it for Instagram Login tokens, stop and re-scope the phase rather than substituting a message.
- [ ] Re-read `sendInstagramDmWithLocksAndFallback` so you understand which machinery the indicator must *avoid* touching (LAT-D3).

---

## Wave plan

| Wave | Tasks | Notes |
|------|-------|-------|
| **1 — Build** | `lat-07` | Single contained change: one Graph helper, one fire-and-forget call site, suppression rules. |
| **2 — Gate** | `lat-08` | Real-thread verification. Mostly founder, since "does the wait feel acceptable now" is not a unit test. |

Short phase by design. If it grows past two tasks, something has been smuggled in that LAT-D2 was meant to keep out.

---

## Task files

| # | File |
|---|------|
| 07 | [`task-lat-07-typing-indicator.md`](./task-lat-07-typing-indicator.md) |
| 08 | [`task-lat-08-close-gate-p2.md`](./task-lat-08-close-gate-p2.md) |

---

**Created:** 2026-08-02.
