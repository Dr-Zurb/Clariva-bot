# Task soc-26: The composer

## 📋 Task Overview

Making and Ready open one composer. The thought is on the left, read-only. The post for the current format is in the middle. A preview is on the right.

**Program / Phase:** social-assist · Phase 8 (studio)
**Batch:** [`plan-p8-social-assist-studio-batch.md`](../plan-p8-social-assist-studio-batch.md)
**Execution order:** [`EXECUTION-ORDER-p8-social-assist-studio.md`](./EXECUTION-ORDER-p8-social-assist-studio.md)
**Estimated Time:** 5 hours
**Status:** ✅ **COMPLETED** — **Completed: 2026-10-15**

**Change Type:**
- [x] **Update existing** — Making and Ready already edit format fields in the older editor

**Current State:**
- ✅ **What exists:** Format fields for Post, Reel, and Story. The note and the references stay on the card. Ready already requires one file that can post.
- ❌ **What's missing:** The three panes. A card with no format does not stop at the three choices. The thought is not shown beside the post.
- ⚠️ **Notes:** The composer is wider than the notebook. The notebook’s size does not change. The preview is a look at the file and the words. It is not an assistant.

**Scope Guard:**
- Expected files touched: ≤ 5
- Do not add stickers, music, product tags, collaborators, or an AI switch
- Do not add carousel slides
- Do not move text or files between panes in this task. That is `soc-28`

**Reference Documentation:**
- [FRONTEND_STANDARDS.md](../../../../../../../Reference/engineering/development/FRONTEND_STANDARDS.md)
- [CONTRACTS.md](../../../../../../../Reference/engineering/architecture/CONTRACTS.md)

---

## 🌍 Global Safety Gate

- [x] **Data touched?** Y — words and format already stored for this doctor
- [x] **RLS verified?** Y — the existing doctor scope stays
- [x] **Any PHI in logs?** No
- [x] **External API or AI call?** N
- [x] **Retention / deletion impact?** N

---

## ✅ Task Breakdown

### 1. Entry
- [x] ✅ 1.1 Making and Ready open the composer. Thoughts and Chosen still open the notebook - **Completed: 2026-10-15**
- [x] ✅ 1.2 A card in Making with no format shows Post, Reel, and Story before the fields - **Completed: 2026-10-15**
- [x] ✅ 1.3 Choosing one saves the format and reveals that format’s fields - **Completed: 2026-10-15**

### 2. Panes
- [x] ✅ 2.1 The left pane shows the note and the resources, and they cannot be edited there - **Completed: 2026-10-15**
- [x] ✅ 2.2 The middle shows the fields for the current format, and one media slot - **Completed: 2026-10-15**
- [x] ✅ 2.3 The right pane previews the file and the words for that format - **Completed: 2026-10-15**
- [x] ✅ 2.4 The composer is wider than the notebook. The notebook stays the size it is - **Completed: 2026-10-15**

### 3. Verification
- [x] ✅ 3.1 A test opens a Making card on the composer and a Chosen card on the notebook - **Completed: 2026-10-15**
- [x] ✅ 3.2 A Making card with no format does not show caption fields until a format is chosen - **Completed: 2026-10-15**

---

## 📁 Files to Create/Update

- ⚠️ `frontend/components/dashboard/social/SocialCardPanel.tsx`
- ⚠️ `frontend/components/dashboard/social/__tests__/SocialClient.test.tsx`
- ⚠️ [`v1.md`](../../../../../../Product%20plans/social-assist/v1.md) only if the panes drift from DL-21

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- Post: one file, caption, first comment.
- Reel: hook, script, cover line, three shots, caption, first comment, one video.
- Story: one line and one file.
- The first comment may show the page link once the card has one. Do not create that link in Making.
- The right pane has room for a later assistant tab. Do not build the tab.

---

**Last Updated:** 2026-10-15
**Completed:** 2026-10-15
**Reference:** `process/TASK_MANAGEMENT_GUIDE.md`
