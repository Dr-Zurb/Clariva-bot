# Task RBH-16: UTF-8 / deterministic copy — fix mojibake (e.g. `Sureâ€"`)

## 2026-03-28 — Receptionist bot product quality

---

## 📋 Task Overview

**Problem:** Some bot messages show **mojibake** (e.g. `Sureâ€"` instead of “Sure —”) in Instagram/UI. Often caused by **UTF-8** smart quotes / em dashes in source or DB being misinterpreted, or by **non‑UTF-8** intermediaries.

**Goal:** All **deterministic** user-visible strings are **valid UTF-8** and render correctly; prefer **ASCII-safe** punctuation in high-risk templates (hyphen or ` - `) unless product requires smart punctuation.

**Estimated Time:** 0.5–1 day  
**Status:** ✅ **DONE** (2026-03-28)  
**Completed:** Replaced mojibake + Unicode dash/quote issues in DM/booking paths; docs + regression test.

**Change Type:**
- [x] **Update existing** — TS string cleanup; STANDARDS / receptionist rules

**Current State:**
- ✅ **Audit:** Removed `\u00e2\u20ac\u201d`-style artifacts and normalized `\u2013`/`\u2014` in DM, booking copy, consent reply, slot payment description, availability display, comment DM block, and **ai-service** prompt text (ASCII `-` / ` - `).
- ✅ **Test:** `utf8-deterministic-copy.test.ts` guards pause message, safety EN lines, queue booking string.
- ✅ **Docs:** [STANDARDS.md](../../../../../../Reference/STANDARDS.md), [RECEPTIONIST_BOT_CONVERSATION_RULES.md](../../../../../../Reference/RECEPTIONIST_BOT_CONVERSATION_RULES.md).

**Scope Guard:**
- No behaviour change beyond fixing **display** of intended characters; run regression on a few flows.

---

## ✅ Task Breakdown (Hierarchical)

### 1. Audit
- [x] 1.1 Grep for `â€`, `\u201`, em dash in `backend/src/workers/` and `backend/src/services/` strings.
- [x] 1.2 Verify DB/API charset (Postgres client UTF-8; Meta IG payload UTF-8). *(No code change; existing stack UTF-8.)*

### 2. Fix
- [x] 2.1 Replace smart quotes / em dashes in **production strings** with ASCII `-` or ` - ` as style guide dictates.
- [x] 2.2 Fix any **source file** saved with wrong encoding (ensure `.ts` UTF-8).

### 3. Prevent
- [x] 3.1 Optional: ESLint / CI grep ban on known mojibake substrings. *(Documented in STANDARDS + unit test; full CI grep optional.)*
- [x] 3.2 Document in [STANDARDS.md](../../../../../../Reference/STANDARDS.md) and [RECEPTIONIST_BOT_CONVERSATION_RULES.md](../../../../../../Reference/RECEPTIONIST_BOT_CONVERSATION_RULES.md): “DM copy: UTF-8, prefer ASCII punctuation in templates.”

### 4. Verification
- [ ] 4.1 Send test DMs; screenshot — no `â€"` in booking opener and common replies.
- [x] 4.2 Unit test: `utf8-deterministic-copy.test.ts`

---

## 📁 Files to Create/Update (expected)

```
backend/src/workers/instagram-dm-webhook-handler.ts
backend/src/workers/instagram-comment-webhook-handler.ts
backend/src/workers/webhook-worker.ts (comments)
backend/src/utils/booking-link-copy.ts
backend/src/utils/consultation-fees.ts
backend/src/services/consent-service.ts
backend/src/services/slot-selection-service.ts
backend/src/services/availability-service.ts
backend/src/services/ai-service.ts
backend/tests/unit/utils/utf8-deterministic-copy.test.ts
docs/Reference/STANDARDS.md
docs/Reference/RECEPTIONIST_BOT_CONVERSATION_RULES.md
```

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** N
- [x] **Any PHI in logs?** N
- [x] **External API?** N

---

## 🔗 Related Tasks

- **RBH-13** — fee/booking deterministic strings overlap.

---

**Last Updated:** 2026-03-28  
**Reference:** [TASK_MANAGEMENT_GUIDE.md](../../TASK_MANAGEMENT_GUIDE.md)
