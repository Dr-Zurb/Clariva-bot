# Task soc-05: Words by format, and the file on Ready

## 📋 Task Overview

Opening a card asks for the words that match its format. Ready is the column where the file is attached. The file lives in a doctor-scoped store that is not the visit-document bucket.

**Program / Phase:** social-assist · Phase 2 (content)
**Batch:** [`plan-p2-social-assist-content-batch.md`](../plan-p2-social-assist-content-batch.md)
**Execution order:** [`EXECUTION-ORDER-p2-social-assist-content.md`](./EXECUTION-ORDER-p2-social-assist-content.md)
**Estimated Time:** 6 hours
**Status:** 🚧 **IN PROGRESS** — words and the file store landed 2026-10-11. A signed-in walk on 2026-10-15 put a dummy image on Ready and then deleted it. Still open: refresh that same file, and confirm it never appears on a patient visit.

**Change Type:**
- [x] **New feature** — words and a file on the card from `soc-03`
- [x] **Update existing** — the board from `soc-04`

**Current State:**
- ✅ **What exists:** signed uploads for letterhead (`letterhead-service`) and for visit documents (`visit-documents-service`). Those buckets are the wrong store for a marketing file.
- ❌ **What's missing:** format-specific words, a topic, and a file that means the card is Ready.
- ⚠️ **Notes:** A reel file might show a face. v1 does not scan it. Do not send the file to an external AI. Do not log the bytes.

**Scope Guard:**
- Expected files touched: ≤ 8
- Do not put the file in visit-document storage or the clinic branding bucket
- Do not mint the page-link code (`soc-10`). The first-comment field can exist as words the doctor types. The durable code is Phase 4.
- No time and no Instagram URL

**Reference Documentation:**
- [COMPLIANCE.md](../../../../../../../Reference/engineering/compliance/COMPLIANCE.md)
- [MIGRATIONS_AND_CHANGE.md](../../../../../../../Reference/engineering/development/MIGRATIONS_AND_CHANGE.md)

---

## 🌍 Global Safety Gate

- [x] **Data touched?** Y — words on the card, and a file the doctor uploads.
- [x] **RLS verified?** Y — the file store is readable only by that doctor, same owner rule as the card.
- [x] **Any PHI in logs?** No. Do not log file names if they could contain a patient name. Log ids.
- [x] **External API or AI call?** N
- [x] **Retention / deletion impact?** Y — deleting a card removes its file. Deleting the doctor removes their files.

---

## ✅ Task Breakdown

### 1. Words
- [x] ✅ 1.1 Chosen asks for a format (Post, Reel, or Story) and a topic - **Completed: 2026-10-11**
- [x] ✅ 1.2 Post asks for a caption and the first-comment words - **Completed: 2026-10-11**
- [x] ✅ 1.3 Reel asks for a hook, a short script, a cover line, a three-shot list, a caption, and the first-comment words - **Completed: 2026-10-11**
- [x] ✅ 1.4 Story asks for one line and the first-comment words - **Completed: 2026-10-11**
- [x] ✅ 1.5 Thoughts and ideas still saves with only a title - **Completed: 2026-10-11**

### 2. File
- [x] ✅ 2.1 Read the storage migrations that created the visit-document and branding buckets, then add a separate doctor-scoped store - **Completed: 2026-10-11**
- [x] ✅ 2.2 The doctor attaches a file. Ready means that file is on the card. Making means it is not. - **Completed: 2026-10-11**
- [x] ✅ 2.3 A card can be created already in Ready when the file is attached at create - **Completed: 2026-10-11**
- [x] ✅ 2.4 Removing the file moves the card out of Ready - **Completed: 2026-10-11**

### 3. Verification
- [x] ✅ 3.1 Tests: a Post card does not require a shot list; a Ready card without a file is rejected; a second doctor cannot fetch the file - **Completed: 2026-10-11**
- [ ] 3.2 Browser: a dummy image reaches Ready, refresh keeps it, and it never appears on a patient visit
- [x] ✅ 3.3 Typecheck and lint the touched files - **Completed: 2026-10-11**

---

## 📁 Files to Create/Update

- ⚠️ Card API from `soc-03` — words and a file reference
- ❌ A doctor-scoped media store, not the visit-document bucket — MISSING
- ⚠️ Content board from `soc-04` — open a card

**When creating a migration:**
- [ ] Read previous migrations in numeric order, including the bucket migrations, before adding the next one

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- The columns do not change with the format.
- No AI button on the words.
- No external model receives the file.
- The first comment is text the doctor can edit. Phase 4 fills the durable page link into it.

---

## 📝 Notes

Schedule still does not exist. Attaching a file does not set a time.

---

**Last Updated:** 2026-10-11
**Reference:** `process/TASK_MANAGEMENT_GUIDE.md`
