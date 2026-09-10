# Task lat-08: Close gate p2

> **Links:** batch [`../plan-p2-perceived-latency-batch.md`](../plan-p2-perceived-latency-batch.md) · exec [`./EXECUTION-ORDER-p2-perceived-latency.md`](./EXECUTION-ORDER-p2-perceived-latency.md)

---

## 📋 Task Overview

Verify the indicator helps and costs nothing. This gate is mostly founder-owned, because "does the wait feel acceptable now" is a judgement a test cannot make.

**Program / Phase:** dm-reply-latency · p2 · Wave 2
**Status:** 🔒 Blocked on `lat-07`
**Model:** Composer / Founder

---

## ✅ Checklist

### Behavior
- [ ] Typing indicator appears within **≤ 1.5 s** on a real Instagram thread.
- [ ] It disappears when the real reply lands (no stuck indicator).
- [ ] It never appears as a message in the transcript.
- [ ] Nothing fires on echoes, comment webhooks, or out-of-band notifications.

### Cost
- [ ] Job total and `handlerPreSendMs` unchanged vs the `lat-06` numbers, beyond noise.
- [ ] Forced failure of the indicator (break the token or the host) leaves the reply completely unaffected.
- [ ] No new lock, throttle, idempotency, or audit interaction in the diff (LAT-D3).

### Judgement
- [ ] Send yourself three DMs — English, Hinglish, and an emergency phrase — and answer honestly: does the wait now read as thinking rather than broken?
- [ ] If the answer is "the reply is already fast enough that the indicator is noise", **say so and revert it.** Shipping decoration that adds a Graph call per turn for no perceived gain is a net loss.

### Close-out
- [ ] Mark p2 in the program README table.
- [ ] Record the observed indicator latency next to the p1 numbers.
- [ ] Re-confirm the p3 decision with everything now in place — if perceived latency is solved, collapsing the LLM calls may not be worth its blast radius.
- [ ] Close [`RBH-12`](../../../../../March%202026/2026-03-25/Receptionist%20Bot%20improvements/Tasks/e-task-rbh-12-dm-latency-faster-replies.md) §3.1, and note that it shipped as an indicator rather than an ack message, with the reason.

---

**Created:** 2026-08-02.
