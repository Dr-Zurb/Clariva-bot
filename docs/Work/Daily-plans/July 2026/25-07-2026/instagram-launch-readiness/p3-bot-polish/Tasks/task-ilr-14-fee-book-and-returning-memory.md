# Task ilr-14: Fee↔book intent + returning-patient memory flag

> **Links:** batch [`../plan-p3-instagram-bot-polish-batch.md`](../plan-p3-instagram-bot-polish-batch.md) · exec [`./EXECUTION-ORDER-p3-instagram-bot-polish.md`](./EXECUTION-ORDER-p3-instagram-bot-polish.md)

---

## 📋 Task Overview

1. Soften fee-thread post-policy that demotes `book_appointment` → `ask_question` so explicit book language still enters the booking funnel (`ai-service.ts` ~904–928).
2. Decide + document `RETURNING_PATIENT_MEMORY_ENABLED` for launch (OQ-1); enable in staging; wire onboarding/docs if needed.

**Status:** ⏳ PENDING · ~2h · Sonnet/Opus  
**Change Type:** Update existing + config decision

**Scope Guard:**
- Don't remove fee-triage entirely — only fix false demotion of clear book intent.
- Returning memory must respect existing privacy gates (rcp-24).

---

## ✅ Task Breakdown

- [ ] 1.1 Adjust `applyIntentPostClassificationPolicy` so explicit book phrases win.
- [ ] 1.2 Tests for fee-thread + "book" / "book appointment" / Hinglish book cues if already supported.
- [ ] 2.1 Confirm returning-memory privacy gates; set env defaults/docs for staging vs prod (OQ-1).
- [ ] 3.1 Verify green.

---

## 📁 Files

```
UPDATE: backend/src/services/ai-service.ts
UPDATE: backend/src/config/env.ts (docs/comments; default only if intentional)
READ: returning-patient.ts; rcp-24 notes
UPDATE/CREATE: tests
```

---

## ✅ Acceptance Criteria

- [ ] Clear book intent in a fee thread enters booking.
- [ ] Returning-memory launch decision recorded; staging enabled if approved.

---

**Created:** 2026-07-25.
