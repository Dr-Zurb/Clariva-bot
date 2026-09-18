# Task ilr-07: Non-text mid-funnel — always ack

> **Links:** batch [`../plan-p2-instagram-bot-reliability-batch.md`](../plan-p2-instagram-bot-reliability-batch.md) · exec [`./EXECUTION-ORDER-p2-instagram-bot-reliability.md`](./EXECUTION-ORDER-p2-instagram-bot-reliability.md)

---

## 📋 Task Overview

When a patient sends image/voice/sticker/reaction **during an active funnel step** (`step !== 'responded'`), do **not** silently mark the webhook processed. Always send a short "please type…" ack (reuse `buildNonTextAckMessage` / `dm-copy.ts`).

**Evidence:** `instagram-dm-webhook-handler.ts` ~245–252 suppresses ack mid-funnel as "phantom attachment".

**Status:** ⏳ PENDING · **Model:** Sonnet (Opus if state coupling is tricky) · ~1–2h  
**Change Type:** Update existing

**Scope Guard:**
- No full media OCR/transcription in this task.
- Idle phantom-suppress may remain if you can prove it's needed — but mid-funnel silence is forbidden (ILR2-D2).

---

## ✅ Task Breakdown

- [ ] 1.1 Distinguish idle phantom vs mid-funnel non-text.
- [ ] 1.2 Mid-funnel → always send typed-ack; mark processed after send attempt.
- [ ] 1.3 Optional: slightly clearer copy when in consent/collection ("Please type your answer…").
- [ ] 2.1 Tests for mid-funnel non-text → ack sent; idle path regression.
- [ ] 3.1 Verify green.

---

## 📁 Files

```
UPDATE: backend/src/workers/instagram-dm-webhook-handler.ts
UPDATE: backend/src/workers/dm/dm-copy.ts (optional copy tweak)
CREATE/UPDATE: unit tests
```

---

## ✅ Acceptance Criteria

- [ ] Mid-funnel non-text never yields silence.
- [ ] Idle behavior remains sane; tests green.

---

**Created:** 2026-07-25.
