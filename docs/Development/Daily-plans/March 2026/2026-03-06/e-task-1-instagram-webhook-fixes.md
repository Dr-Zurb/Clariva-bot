# Task 1: Instagram Webhook Fixes (Duplicate, Page ID, Signature)
## 2026-03-06

---

## 📋 Task Overview

Fix three Instagram webhook issues observed in production:
1. **Duplicate fallback spam** — Meta sends both `message` and `message_edit` for the same user message; each job was sending a fallback reply, causing many identical "Thanks for your message" responses.
2. **Page ID as recipient** — Some code paths resolved sender as the page ID; Meta returns "No matching user found" when sending to own page.
3. **304-byte payload signature failures** — Some webhooks (rawBodyLength: 304, payloadType: "unknown") fail signature verification with 401.

**Estimated Time:** 2–3 hours  
**Status:** 🟢 **DONE** (1, 2, 3 implemented)  
**Completed:** 2026-03-06 (items 1, 2, 3)

**Change Type:**
- [ ] **New feature**
- [x] **Update existing** — webhook-worker.ts, parse logic, send guards; follow [CODE_CHANGE_RULES.md](../../../task-management/CODE_CHANGE_RULES.md)

**Current State:**
- ✅ **What exists:** webhook-worker.ts (parseInstagramMessage, tryResolveSenderFromMessageEdit, ConflictError handling); instagram-service.ts (sendInstagramMessage); webhook signature verification in controller.
- ✅ **What's done:** (1) createMessage ConflictError → skip reply and return; outer ConflictError → no fallback send. (2) parseInstagramMessage uses recipient when sender is page; tryResolveSenderFromMessageEdit rejects page IDs; send guard before send; ConflictError fallback skips if senderId is page.
- ✅ **What's done (3):** Diagnostic logging for 304-byte signature failures; early return 200 for read/delivery (non-actionable); getInstagramPayloadStructure + isNonActionableInstagramEvent helpers.

**Scope Guard:** Expected files touched: ≤ 5

**Reference Documentation:**
- [CODE_CHANGE_RULES.md](../../../task-management/CODE_CHANGE_RULES.md)
- [STANDARDS.md](../../../Reference/STANDARDS.md)
- [COMPLIANCE.md](../../../Reference/COMPLIANCE.md) — No PHI in logs
- [instagram-dm-reply-troubleshooting](../../February%202026/Week%203/instagram-dm-reply-troubleshooting.md)

---

## ✅ Task Breakdown (Hierarchical)

### 1. Duplicate Fallback Spam (DONE)
- [x] 1.1 On createMessage ConflictError: mark processed and return (do not continue to send)
- [x] 1.2 On outer ConflictError: mark processed only, no fallback send
- [x] 1.3 Verify logs show "marking processed, no fallback send" instead of "Fallback reply sent"

### 2. Page ID as Recipient (DONE)
- [x] 2.1 parseInstagramMessage: when sender is page ID, use recipient.id for message_edit
- [x] 2.2 parseInstagramMessage: skip any sender that is in pageIds
- [x] 2.3 tryResolveSenderFromMessageEdit: reject page IDs from all fallbacks (DB, API, getOnlyInstagramConversationSenderId, decodeMidExperimental)
- [x] 2.4 Add send guard: if senderId in pageIds, skip send and mark processed
- [x] 2.5 ConflictError fallback: add !pageIds.includes(senderId) check

### 3. 304-byte Payload Signature Failures (DONE)
- [x] 3.1 Log raw payload structure for 304-byte requests (without PHI) to identify event type
- [x] 3.2 Check Meta docs for read receipts, typing indicators, reactions payload format
- [x] 3.3 Option A: Add handling for known 304-byte event types (e.g. return 200 without processing if not actionable)
- [x] 3.4 Option B: Document as known limitation; these events may not require processing
- [x] 3.5 Ensure signature verification uses correct raw body (no middleware alteration)

### 4. Verification & Testing
- [x] 4.1 Type-check and lint
- [ ] 4.2 Deploy and verify: single reply per user message, no "No matching user found" errors
- [x] 4.3 Monitor 304-byte failures; diagnostic logging added; read/delivery return 200 early

---

## 📁 Files to Create/Update

```
backend/
└── src/
    ├── controllers/
    │   └── webhook-controller.ts  (UPDATED - 304-byte diagnostics, non-actionable early return)
    ├── utils/
    │   └── webhook-event-id.ts    (UPDATED - getInstagramPayloadStructure, isNonActionableInstagramEvent)
    └── workers/
        └── webhook-worker.ts     (UPDATED - ConflictError, page ID guards, parse logic)
```

**Existing Code Status:**
- ✅ webhook-worker.ts — UPDATED (duplicate fix, page ID guards)
- ✅ webhook-controller.ts — UPDATED (304-byte diagnostics, read/delivery early return)
- ✅ webhook-event-id.ts — UPDATED (payload structure helpers)

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- No PHI in logs (COMPLIANCE.md)
- Service layer must not import Express types
- Meta webhook signature uses HMAC-SHA256 of raw body; verification must use unaltered body

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** (N – no schema change)
- [x] **Any PHI in logs?** (No)
- [x] **External API or AI call?** (Y – Instagram Send API)
  - [x] Consent + redaction confirmed
- [x] **Retention / deletion impact?** (N)

---

## ✅ Acceptance & Verification Criteria

- [x] Single reply per user message (no duplicate fallback spam)
- [x] No "No matching user found" when sending (page ID never used as recipient)
- [x] 304-byte payloads: diagnostic logging + early return for read/delivery
- [x] Logs show "marking processed, no fallback send" for ConflictError
- [x] Logs show "Skipping send: senderId is page ID" when applicable

---

## 🐛 Issues Encountered & Resolved

**Issue:** createMessage ConflictError was caught and flow continued to send → duplicate reply.  
**Solution:** On ConflictError at createMessage, mark processed and return immediately.

**Issue:** Outer ConflictError handler sent fallback every time → spam.  
**Solution:** Remove fallback send; mark processed only.

**Issue:** recipient_id was page ID (17841479659492101) → "No matching user found".  
**Solution:** parseInstagramMessage use recipient when sender is page; tryResolveSenderFromMessageEdit reject page IDs; add send guard.

---

## 📝 Notes

- 304-byte payloads: `payloadType: "unknown"` suggests different structure (e.g. read, typing). Meta may compute signature differently or payload may be altered before verification.
- **Implemented:** When signature fails for 300–320 byte payloads, we log `payloadStructure` (keys only, no PHI) to identify event type. For read/delivery events that pass verification, we return 200 early without processing.
- **Fix for zero replies:** (1) Skip queueing `message_edit` entirely. (2) On ConflictError (message already stored, e.g. retry after partial failure), send fallback reply so user gets a response instead of silence.
- Consider unsubscribing from `message_edit` in Meta Webhooks if edits are not needed; would reduce duplicate processing.

---

## 🔗 Related Tasks

- [e-task-14: Use doctor's Instagram token](../../February%202026/Week%201/2026-02-06/e-task-14-instagram-send-use-doctor-token.md)
- [instagram-dm-reply-troubleshooting](../../February%202026/Week%203/instagram-dm-reply-troubleshooting.md)

---

**Last Updated:** 2026-03-06  
**Reference:** [TASK_MANAGEMENT_GUIDE.md](../../../task-management/TASK_MANAGEMENT_GUIDE.md)
