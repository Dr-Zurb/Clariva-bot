# Task ilr-06: Throttle skip — don't persist unsent reply

> **Links:** batch [`../plan-p2-instagram-bot-reliability-batch.md`](../plan-p2-instagram-bot-reliability-batch.md) · exec [`./EXECUTION-ORDER-p2-instagram-bot-reliability.md`](./EXECUTION-ORDER-p2-instagram-bot-reliability.md)

---

## 🛑 Opus — conversation state integrity

Persisting a reply the patient never received desyncs the funnel. Run on **Opus**.

---

## 📋 Task Overview

Align DB history with send reality: if Meta send is throttle-skipped, do **not** leave a `system`/bot message that looks delivered. Prefer write-after-successful-send, or mark/retry unsent.

**Evidence:** `run-conversation-turn.ts` ~547–555 persists before send; `webhook-dm-send.ts` ~105–140 throttle-skips without delivering that reply; `instagram-dm-webhook-handler.ts` ~392–403 may send only a short ack.

**Status:** ⏳ PENDING · **Model: Opus** · ~2–3h  
**Change Type:** Update existing

**Scope Guard:**
- Fix ordering / persistence semantics only.
- Keep throttle ack behavior unless it conflicts.
- No PHI in logs.

---

## ✅ Task Breakdown

- [ ] 1.1 Trace persist → send → throttle path end-to-end.
- [ ] 1.2 Implement ILR2-D1 (persist after send success, or unsent marker + no funnel advance on skip).
- [ ] 1.3 Ensure next turn doesn't assume patient saw intake/consent/slot copy.
- [ ] 2.1 Tests: throttle skip → no delivered bot row / no step advance that depends on that copy.
- [ ] 3.1 type-check + lint + tests green.

---

## 📁 Files

```
UPDATE: backend/src/workers/dm/run-conversation-turn.ts
UPDATE: backend/src/workers/webhook-dm-send.ts
UPDATE: backend/src/workers/instagram-dm-webhook-handler.ts
UPDATE/CREATE: tests covering throttle + persist order
```

---

## ✅ Acceptance Criteria

- [ ] Throttle skip cannot create a "ghost" delivered bot message.
- [ ] Funnel state stays consistent with what the patient actually received.

---

**Created:** 2026-07-25.
