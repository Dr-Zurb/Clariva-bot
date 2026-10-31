# Task soc-35: Phase 12 gate

## 📋 Task Overview

A signed-in walk of the doctor’s review. Dummy title only. Nothing is sent to an editor or to Instagram.

**Program / Phase:** social-assist · Phase 12 (review)
**Batch:** [`plan-p12-social-assist-review-batch.md`](../plan-p12-social-assist-review-batch.md)
**Execution order:** [`EXECUTION-ORDER-p12-social-assist-review.md`](./EXECUTION-ORDER-p12-social-assist-review.md)
**Estimated Time:** 1 hour
**Status:** ⏳ **PENDING**

**Change Type:**
- [x] **Update existing** — confirm `soc-31` through `soc-34`

**Current State:**
- ✅ **What exists:** The handoff, the message, Review, and the Making badge, once those tasks have landed.
- ❌ **What's missing:** One walk, in the browser, by the doctor.
- ⚠️ **Notes:** Do not mark this done from unit tests alone.

**Scope Guard:**
- Expected files touched: ≤ 2 (the batch plan’s gate checkboxes, and this file)
- Do not call Instagram
- Do not log a title, a note, a name, or a message

**Reference Documentation:**
- [FRONTEND_STANDARDS.md](../../../../../../../Reference/engineering/development/FRONTEND_STANDARDS.md)

---

## 🌍 Global Safety Gate

- [ ] **Data touched?** N — a dummy card in the doctor’s own session
- [ ] **RLS verified?** Y — no new policy
- [ ] **Any PHI in logs?** No
- [ ] **External API or AI call?** N
- [ ] **Retention / deletion impact?** N

---

## ✅ Task Breakdown

### 1. Walk
- [ ] 1.1 Hand a Making card to a name. Confirm the note is still only on Draft
- [ ] 1.2 On Review, play the file, set a start and an end, point at one Resource, and send “shorten this”
- [ ] 1.3 Confirm the file that posts did not change
- [ ] 1.4 Mark ready. The Making badge is gone
- [ ] 1.5 Nothing left the doctor’s session

### 2. Record
- [ ] 2.1 Tick the acceptance gate in the batch plan with the date
- [ ] 2.2 Say what was not walked

---

## 📁 Files to Create/Update

- ⚠️ [`plan-p12-social-assist-review-batch.md`](../plan-p12-social-assist-review-batch.md) — gate checkboxes only

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- Dummy words only. No patient name in the message used for the walk.

---

**Last Updated:** 2026-10-31
**Status:** ⏳ PENDING
