# Task ilr-11: Reschedule slot follow-up handler

> **Links:** batch [`../plan-p3-instagram-bot-polish-batch.md`](../plan-p3-instagram-bot-polish-batch.md) · exec [`./EXECUTION-ORDER-p3-instagram-bot-polish.md`](./EXECUTION-ORDER-p3-instagram-bot-polish.md)

---

## 📋 Task Overview

After sending a reschedule link (`step: 'awaiting_reschedule_slot'`), subsequent patient messages must get reschedule-aware nudges — not fall through to `ai_open_response`. Mirror the existing `awaiting_slot_selection` follow-up pattern in booking-funnel.

**Evidence:** `cancel-reschedule-status.ts` sets `awaiting_reschedule_slot`; predicate excludes it (`cancel-reschedule-status-predicate.ts` ~202–207).

**Status:** ⏳ PENDING · ~2h · Sonnet/Opus  
**Change Type:** Update existing

---

## ✅ Task Breakdown

- [ ] 1.1 Extend predicate / stage so `awaiting_reschedule_slot` is claimed.
- [ ] 1.2 Follow-ups for "done", "thanks", "link broken", "book again" → helpful nudges / re-send link.
- [ ] 2.1 Tests for step retention + follow-up branches.
- [ ] 3.1 Verify green.

---

## 📁 Files

```
UPDATE: backend/src/workers/dm/.../cancel-reschedule-status*.ts
UPDATE: booking-funnel follow-up patterns (read for mirror)
CREATE/UPDATE: tests
```

---

## ✅ Acceptance Criteria

- [ ] Messages while awaiting reschedule slot do not dump into generic AI open response.
- [ ] Tests green.

---

**Created:** 2026-07-25.
