# Task soc-33: Draft and Review

## 📋 Task Overview

A handed Making card has two screens. Draft is the composer that already exists. Review is the video and the thread. The doctor watches and sends an instruction. They do not edit the video.

**Program / Phase:** social-assist · Phase 12 (review)
**Batch:** [`plan-p12-social-assist-review-batch.md`](../plan-p12-social-assist-review-batch.md)
**Execution order:** [`EXECUTION-ORDER-p12-social-assist-review.md`](./EXECUTION-ORDER-p12-social-assist-review.md)
**Estimated Time:** 6 hours
**Status:** ⏳ **PENDING**

**Change Type:**
- [x] **Update existing** — Making already opens the composer

**Current State:**
- ✅ **What exists:** The Making composer, Resources, the file that posts, and a signed URL to play it. `soc-31` and `soc-32` once they have landed.
- ❌ **What's missing:** The switch, the player beside the thread, and a way to put a moment or a stretch into the message before it is sent.
- ⚠️ **Notes:** Review is its own component. `SocialCardPanel.tsx` only gains the switch and the handoff control.

**Scope Guard:**
- Expected files touched: ≤ 6
- Do not add trim, split, reorder, drawing, or text on the video
- Do not add a row of takes under the player
- Do not build the editor’s page

**Reference Documentation:**
- [FRONTEND_STANDARDS.md](../../../../../../../Reference/engineering/development/FRONTEND_STANDARDS.md)
- [CONTRACTS.md](../../../../../../../Reference/engineering/architecture/CONTRACTS.md)

---

## 🌍 Global Safety Gate

- [ ] **Data touched?** Y — reads and writes the handoff and the messages already specified
- [ ] **RLS verified?** Y — through the doctor API from `soc-31` and `soc-32`. No new policy in this task.
- [ ] **Any PHI in logs?** No
- [ ] **External API or AI call?** N
- [ ] **Retention / deletion impact?** N — owned by `soc-31` and `soc-32`

---

## ✅ Task Breakdown

### 1. Hand over
- [ ] 1.1 Making shows **Hand to editor** beside **Mark ready** when the card has not been handed over
- [ ] 1.2 The doctor types a name and confirms. The note is not shown as something that will be sent
- [ ] 1.3 After that, the header offers **Draft** and **Review**. Opening the card lands on Review

### 2. Review
- [ ] 2.1 The left side plays the file under review. A photo fills that same place
- [ ] 2.2 The right side is the thread, full height
- [ ] 2.3 The doctor can set one moment, or a start and an end, into the unsent message. That action does not send
- [ ] 2.4 The doctor can point the unsent message at one file on Resources
- [ ] 2.5 **Send** saves the message. **Mark ready** is the same action as on Draft
- [ ] 2.6 Draft is the existing composer, unchanged apart from the switch

### 3. Verification
- [ ] 3.1 A test shows Review only after the card is handed over
- [ ] 3.2 A test sends a stretch and a Resource pointer without changing the file that posts
- [ ] 3.3 The player does not offer a list of takes

---

## 📁 Files to Create/Update

- ⚠️ A new Review component under `frontend/components/dashboard/social/`
- ⚠️ `frontend/components/dashboard/social/SocialCardPanel.tsx` — switch and handoff only
- ⚠️ `frontend/components/dashboard/social/social-cards.ts` — the client calls
- ⚠️ `frontend/components/dashboard/social/__tests__/SocialClient.test.tsx`

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- ED-2, ED-3, ED-4, ED-5, ED-8.
- “From here to here, shorten this” and “add this clip” are messages. The bytes of the video stay as they are.
- Resources are chosen from the shelf the card already has. Do not build a second shelf.

---

**Last Updated:** 2026-10-31
**Status:** ⏳ PENDING
