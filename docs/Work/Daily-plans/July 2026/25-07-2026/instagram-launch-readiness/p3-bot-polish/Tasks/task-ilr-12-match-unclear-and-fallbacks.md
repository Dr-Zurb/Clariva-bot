# Task ilr-12: Match-unclear re-prompt + fallbacks + no_doctor_token

> **Links:** batch [`../plan-p3-instagram-bot-polish-batch.md`](../plan-p3-instagram-bot-polish-batch.md) · exec [`./EXECUTION-ORDER-p3-instagram-bot-polish.md`](./EXECUTION-ORDER-p3-instagram-bot-polish.md)

---

## 📋 Task Overview

Three reliability/copy fixes:

1. Match confirmation `unclear` → **re-prompt** (ILR3-D2), not `createNew`.
2. Replace dead-end `"Thanks… We'll get back to you soon."` with an actionable menu (ILR3-D3).
3. `no_doctor_token` path: patient gets a reply and/or doctor gets reconnect signal (today: silent).

**Evidence:** `service-match.ts` ~443–446; `run-conversation-turn.ts` FALLBACK_REPLY; `instagram-dm-webhook-handler.ts` ~166–181.

**Status:** ⏳ PENDING · ~3h · Sonnet/Opus  
**Change Type:** Update existing

---

## ✅ Task Breakdown

- [ ] 1.1 Match unclear → re-prompt copy; only explicit "no" creates new.
- [ ] 1.2 Centralize actionable fallback in `dm-copy.ts`; replace FALLBACK_REPLY usages carefully (conflict recovery included).
- [ ] 1.3 `no_doctor_token`: short patient apology + alert doctor (token health / dashboard) if possible.
- [ ] 2.1 Tests for unclear match, fallback string presence of book/fees/status cues, token-missing path.
- [ ] 3.1 Verify green.

---

## 📁 Files

```
UPDATE: service-match.ts; run-conversation-turn.ts; dm-copy.ts
UPDATE: instagram-dm-webhook-handler.ts
UPDATE/CREATE: tests
```

---

## ✅ Acceptance Criteria

- [ ] Unclear never auto-creates a new patient.
- [ ] Dead-end fallback gone from patient-facing paths.
- [ ] Token-missing is not total silence.

---

**Created:** 2026-07-25.
