# Task soc-28: Move a line or a file into the post

## 📋 Task Overview

The doctor can place part of the thought into a field, and can drag a reference onto the media slot. The reference stays on the thought. The slot holds the file that posts.

**Program / Phase:** social-assist · Phase 8 (studio)
**Batch:** [`plan-p8-social-assist-studio-batch.md`](../plan-p8-social-assist-studio-batch.md)
**Execution order:** [`EXECUTION-ORDER-p8-social-assist-studio.md`](./EXECUTION-ORDER-p8-social-assist-studio.md)
**Estimated Time:** 4 hours
**Status:** ✅ **COMPLETED** — **Completed: 2026-10-15**

**Change Type:**
- [x] **Update existing** — the resources bar and the card file already exist

**Current State:**
- ✅ **What exists:** A resources bar on a thought. A single file on the card that Ready can post. Dragging a card onto Ready already checks the file.
- ❌ **What's missing:** No way to send a line or a selection into caption, hook, script, cover line, or the story line. No drag from the resources bar onto the media slot.
- ⚠️ **Notes:** Placing text copies it into the field. It does not remove it from the note. A document or a voice note cannot become the file that posts.

**Scope Guard:**
- Expected files touched: ≤ 5
- Do not delete the reference when it is used as the post file
- Do not add a second file on Ready

**Reference Documentation:**
- [FRONTEND_STANDARDS.md](../../../../../../../Reference/engineering/development/FRONTEND_STANDARDS.md)

---

## 🌍 Global Safety Gate

- [x] **Data touched?** Y — words and the card file, already stored for this doctor
- [x] **RLS verified?** Y — the existing doctor scope stays
- [x] **Any PHI in logs?** No
- [x] **External API or AI call?** N
- [x] **Retention / deletion impact?** N — the reference is kept

---

## ✅ Task Breakdown

### 1. Words
- [x] ✅ 1.1 Selecting text in the thought offers the fields of the current format - **Completed: 2026-10-15**
- [x] ✅ 1.2 Choosing one places that text into the field - **Completed: 2026-10-15**
- [x] ✅ 1.3 Dragging a line from the thought into a field does the same - **Completed: 2026-10-15**
- [x] ✅ 1.4 The note still contains that line - **Completed: 2026-10-15**

### 2. File
- [x] ✅ 2.1 Dragging a photo or a video from the resources bar onto the media slot sets it as the file that posts - **Completed: 2026-10-15**
- [x] ✅ 2.2 The reference remains on the thought - **Completed: 2026-10-15**
- [x] ✅ 2.3 A document or a voice note is refused, with the same reason Ready already uses for a file that cannot post - **Completed: 2026-10-15**

### 3. Verification
- [x] ✅ 3.1 A test places a selected line into the caption and the note is unchanged - **Completed: 2026-10-15**
- [x] ✅ 3.2 A test sets the card file from a reference and the reference is still listed - **Completed: 2026-10-15**

---

## 📁 Files to Create/Update

- ⚠️ `frontend/components/dashboard/social/SocialCardPanel.tsx`
- ⚠️ `frontend/components/dashboard/social/__tests__/SocialClient.test.tsx`

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- The left pane stays read-only except for this drag and this selection.
- One file on the card. Replacing it is how a reference becomes the piece.
- Do not log the line or the file path.

---

**Last Updated:** 2026-10-15
**Completed:** 2026-10-15
**Reference:** `process/TASK_MANAGEMENT_GUIDE.md`
