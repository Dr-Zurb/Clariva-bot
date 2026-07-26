# Task ilr-13: Brand / localization / slot-link copy

> **Links:** batch [`../plan-p3-instagram-bot-polish-batch.md`](../plan-p3-instagram-bot-polish-batch.md) · exec [`./EXECUTION-ORDER-p3-instagram-bot-polish.md`](./EXECUTION-ORDER-p3-instagram-bot-polish.md)

---

## 📋 Task Overview

1. Stop defaulting LLM system prompt practice name to **"Halo Aid"** when unset — use `"the clinic"` or require practice_name.
2. Localize key funnel strings (OQ-2): consent, slot nudge, staff-pending, fallbacks — extend `localizeReply` usage.
3. Slot follow-up: don't rely only on "the link above" — re-include or clearly re-offer the link.

**Evidence:** `ai-service.ts` ~1908; sparse `localizeReply`; `booking-link-copy.ts` ~55–62.

**Status:** ⏳ PENDING · ~3h · Sonnet  
**Change Type:** Update existing

**Scope Guard:**
- No full Devanagari rewrite of the entire bot.
- Prefer `dm-copy.ts` / existing localize helpers.

---

## ✅ Task Breakdown

- [ ] 1.1 Practice name fallback fix in `buildResponseSystemPrompt`.
- [ ] 1.2 Localize key strings per OQ-2.
- [ ] 1.3 Slot awaiting follow-up re-offers link / clearer CTA.
- [ ] 2.1 Snapshot/unit tests for copy helpers.
- [ ] 3.1 Verify green.

---

## 📁 Files

```
UPDATE: backend/src/services/ai-service.ts
UPDATE: backend/src/workers/dm/dm-copy.ts / booking-link-copy.ts / localize helpers
UPDATE/CREATE: tests
```

---

## ✅ Acceptance Criteria

- [ ] No patient-facing "Halo Aid" when practice_name missing.
- [ ] Key funnel strings localize; slot nudge re-offers link.

---

**Created:** 2026-07-25.
