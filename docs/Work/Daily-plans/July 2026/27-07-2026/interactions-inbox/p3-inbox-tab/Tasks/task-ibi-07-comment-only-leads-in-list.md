# Task ibi-07: Comment-only leads in list (IB4)

> **Links:** batch [`../plan-p3-interactions-inbox-tab-batch.md`](../plan-p3-interactions-inbox-tab-batch.md) · exec [`./EXECUTION-ORDER-p3-interactions-inbox-tab.md`](./EXECUTION-ORDER-p3-interactions-inbox-tab.md)

---

## 📋 Task Overview

Include `comment_leads` rows with `conversation_id IS NULL` in the unified Inbox list (IBI-D2): separate query, merge/sort in service into the same DTO shape.

**Program / Phase:** interactions-inbox · p3 · Wave 2  
**Status:** ✅ DONE (2026-07-27)  
**Model:** Sonnet  
**Depends on:** `ibi-06`

---

## ✅ Task Breakdown

### 1. Query + merge
- [x] 1.1 Fetch unlinked leads for `doctor_id` (platform-aware).
- [x] 1.2 Map to list DTO with `kind: 'comment_lead'`, status `new_lead`, channel from `platform`.
- [x] 1.3 Merge with conversation rows; sort by activity time; respect cursor/limit contract from `ibi-06` (document any cursor limitations for mixed kinds).

### 2. Detail
- [x] 2.1 Detail for comment-only id returns lead summary (no messages yet) — FE shows empty-thread copy; messages API NotFound for lead ids is fine.

### 3. Tests
- [x] 3.1 Unlinked lead appears in signal list. *(merge path in `listInteractionsForDoctor`; timeline unit for comment-only)*
- [x] 3.2 Linked lead does **not** duplicate as a second comment-only row (only `conversation_id IS NULL` fetched).

---

**Created:** 2026-07-27.  
**Closed:** 2026-07-27 — never echoes `comment_text` (PHI); snippet is generic "Commented on a post".
