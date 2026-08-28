# Task ilr-05: Close gate — p1 launch-critical

> **Links:** batch [`../plan-p1-instagram-launch-critical-batch.md`](../plan-p1-instagram-launch-critical-batch.md) · exec [`./EXECUTION-ORDER-p1-instagram-launch-critical.md`](./EXECUTION-ORDER-p1-instagram-launch-critical.md)

---

## 📋 Task Overview

Verify p1 acceptance gate; PHI/log sweep; park follow-ups; mark batch complete.

**Status:** ⏳ PENDING · **Model:** Sonnet / Composer  
**Depends on:** ilr-01…04 done (ilr-01 may still be "in progress" with Meta)

---

## ✅ Task Breakdown

- [ ] 1. Walk batch acceptance gate checkboxes.
- [ ] 2. Confirm no PHI in new logs; no `process.env` direct in touched files.
- [ ] 3. `cd backend && npm run type-check` + lint + relevant tests green.
- [ ] 4. Update program README phase status; note Meta App Review status from ilr-01.
- [ ] 5. Capture residual items to `docs/Work/capture/inbox.md` if any.

---

## ✅ Acceptance Criteria

- [ ] Batch acceptance gate satisfied (or residual risks explicitly parked).
- [ ] Ready to start p2.

---

**Created:** 2026-07-25.
