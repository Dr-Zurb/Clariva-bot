# Instagram DM Reply Troubleshooting
## Automated replies not sent when someone DMs the connected Instagram account

---

## Canonical behavior (RBH-11)

For **controller vs worker** split, **why `message_edit`-only requests are not queued**, and the **full fallback order** (DB → Graph → single conversation → `decodeMidExperimental`), use the reference doc — avoid duplicating long explanations here:

**→ [WEBHOOKS.md — RBH-11: Instagram message_edit and sender fallbacks](../../../../Reference/WEBHOOKS.md)** (search **RBH-11** in page)  

That section also states when **not** to delete “experimental” mid decoding and how to escalate to Meta **without** pasting real message IDs or patient text.

---

## 📋 Problem Summary

**Symptom:** When a user sends a DM to the connected Instagram professional account (@clariva_care), no automated reply is sent.

**What works:**
- Webhooks are received (both test and real DMs)
- Test subscription payload is parsed correctly and replies would work (duplicates handled)
- OAuth connect flow, token storage, and send API work

**What fails:**
- Real DMs do not trigger replies because the webhook payload lacks `sender` and `recipient`

---

## 🔍 Root Cause

| Source | Format | Has sender? | Result |
|--------|--------|-------------|--------|
| **Test subscription** (Meta "Send to server") | `entry[].changes[]` with `value: { sender, recipient, message }` | ✅ Yes | Parsed, reply flow works |
| **Real DMs** | `entry[].messaging[]` with only `message_edit` | ❌ No | Sender resolution fails, no reply |

Meta sends real Instagram DMs as `message_edit` events in `entry[].messaging[]` **without** `sender` or `recipient` in the payload. Our fallback methods (DB lookup, Conversations API, message lookup) fail to resolve the sender.

---

## ✅ What We've Already Tried

### Code changes (completed)
- [x] Handle `ConflictError` on `createMessage` (idempotent for duplicate `mid`)
- [x] Support `message_edit` in changes format for `extractInstagramEventId`
- [x] Handle 23505 in `findOrCreatePlaceholderPatient` (re-fetch on unique violation)
- [x] Top-level `ConflictError` handler in webhook worker (mark processed, return)
- [x] API-first sender resolution before DB fallback in `tryResolveSenderFromMessageEdit`
- [x] On `createMessage` conflict: continue to send reply instead of returning
- [x] Add `isValidInstagramSenderId()` to reject short placeholder IDs (e.g. `"12334"`)
- [x] Use `getOnlyInstagramConversationSenderId` only when result passes validation
- [x] Add `graph.facebook.com` fallback when `graph.instagram.com` returns 500 for message lookup
- [x] Use stored `instagram_page_id` from `doctor_instagram` for webhook resolution

### Verified
- [x] Permissions: `instagram_business_basic`, `instagram_business_manage_messages`
- [x] Webhook subscriptions: `messages`, `message_edits`
- [x] Token validation via API Integration Helper
- [x] Send API works (API Integration Helper can send messages)

---

## 🛠️ What's Left to Try

### 1. Unable to Report to Meta (couldn't file)

**Note:** Attempted to file a bug report or support ticket with Meta, but was unable to submit the issue due to platform restrictions or lack of submission options at the time.

**Action:** _Not completed; could not report bug/support request_

**What would have been reported (for future reference):**
- App uses Instagram API with Instagram Login
- Subscribed to `messages` and `message_edits`
- Real DMs trigger only `message_edit` in `entry[].messaging[]`
- Payload has `hasMessage: false`, `hasMessageEdit: true`, `hasSender: false`, `hasRecipient: false`
- Test payload uses `entry[].changes[]` with sender/recipient and works
- Request: Real DM webhooks should include `sender` and `recipient` per docs

**Where (if possible in the future):** [Meta Developer Support](https://developers.facebook.com/support/)

---

### 2. Try Page-linked Instagram (different integration path)

**Idea:** If Clariva Care can be linked to a Facebook Page, use **Messenger Platform** / **Page token** instead of Instagram Login. Page-linked flows often send `message` events with `sender` and `recipient` in the payload.

**Steps:**
1. Ensure Instagram account is linked to a Facebook Page
2. Add **Messenger** product to the app (if not already)
3. Configure webhooks for the Page
4. Use Page access token instead of Instagram user token
5. Test if incoming DMs include sender in payload

**Effort:** Medium (OAuth flow and token type change)

---

### 3. API Integration Helper – verify sender ID ✅ (done, finding confirmed)

**Purpose:** Confirm Meta knows about conversations and get a real sender ID for testing.

**Status:** Completed – finding confirmed

**Steps Taken:**
1. Went to [Instagram Graph API – Send Messages](https://developers.facebook.com/tools/explorer/) and the API Integration Helper in the app’s Instagram product.
2. Pasted stored access token and clicked **Validate**.
3. Checked the **"To"** dropdown:
   - Only the business account appeared, even though real DMs are received – no other user IDs shown.
4. Clicked **Send message** – functioned normally, confirming token/permissions are fine.
5. Attempted to use known recipient IDs for hardcoded testing.

**Finding (2026-02):** Confirmed – when using an OAuth token from Instagram Connect, the "To" dropdown only shows the business account (@clariva_care). Real DMs trigger webhooks as expected but Meta’s Conversations API does not return other conversation participants for this token type. This matches the logs ("Conversation fallback: no conversations found") and results in `getOnlyInstagramConversationSenderId` returning only a test placeholder.

---

### 4. Reconnect Instagram ✅ (done, no fix)

**Status:** Tried as a troubleshooting step; did not resolve the issue. Reconnecting Instagram (disconnect + new OAuth flow, sending new DM, checking logs) did not change the payload format — problem persists as before. No further action from this step.


---

### 5. Subscribe to `messages` (not just `message_edits`) ✅ (done, no fix)

**Status:** Subscribed to both `messages` and `message_edits` on Meta App Dashboard. Sent new DMs (not edits) and checked logs. Real DMs still do **not** trigger `message` events containing sender, only `message_edit` without sender. No change in webhook payloads; issue remains unresolved.


---

### 6. Decode message ID (experimental) ✅ (done, no fix)

**Idea:** The `message_edit.mid` (base64) might encode sender info in Meta’s internal format.

**Steps:**
1. Log a few real `mid` values (no PII)
2. Try base64 decode and inspect structure
3. Search Meta docs or community for `mid` format
4. **Note:** Likely low yield; Meta may not document this

**Implemented:** Worker decodes `mid`, extracts 15–20 digit IDs from binary, filters page IDs, tries first candidate as sender. Logs: `Experimental: mid decode`, `Experimental: trying decoded mid candidate as sender`. Sample `mid` has page ID + long message IDs; no 15–17 digit sender ID found yet.

---

### 7. Temporary manual workaround

**Until Meta fixes payloads:**
- Use Meta Business Suite or Instagram app to monitor and reply to DMs manually
- Or accept that automated replies are disabled until sender is available in webhooks

---

## 📂 Relevant Code Paths

| Component | Path | Purpose |
|-----------|------|---------|
| Webhook router | `backend/src/workers/webhook-worker.ts` | BullMQ job dispatch to DM / comment handlers (RBH-05) |
| DM handler | `backend/src/workers/instagram-dm-webhook-handler.ts` | `processInstagramDmWebhook`, `parseInstagramMessage`, `tryResolveSenderFromMessageEdit`, `decodeMidExperimental`, `isValidInstagramSenderId` |
| Webhook controller | `backend/src/controllers/webhook-controller.ts` | Skip queue for `message_edit`-only `messaging[]`; signature branches for `message_edit` |
| Patient service | `backend/src/services/patient-service.ts` | `findOrCreatePlaceholderPatient` (23505 handling) |
| Instagram service | `backend/src/services/instagram-service.ts` | `getInstagramMessageSender`, `getSenderFromMostRecentConversation`, `sendInstagramMessage` |
| Conversation service | `backend/src/services/conversation-service.ts` | `getOnlyInstagramConversationSenderId` |
| Message service | `backend/src/services/message-service.ts` | `getSenderIdByPlatformMessageId` |
| Event ID util | `backend/src/utils/webhook-event-id.ts` | `extractInstagramEventId` (supports `message_edit` in changes format) |

---

## 📊 Debug Checklist

When investigating, check logs for:

1. **`payloadStructure`** – `hasSender`, `hasRecipient`, `hasMessage`, `hasMessageEdit`, `firstChangeField`, `changesLength`
2. **`Webhook has no message to reply to`** – Indicates sender resolution failed
3. **`Instagram message_edit: resolved sender`** – Fallback succeeded (rare for real DMs)
4. **`isValidInstagramSenderId` rejection** – Sender ID too short (e.g. test placeholder)

---

## 🔗 Related Docs

- [WEBHOOKS.md — RBH-11: message_edit & sender fallbacks](../../../../Reference/WEBHOOKS.md)
- [Instagram Setup](../../../setup/instagram-setup.md)
- [Webhooks Reference](../../../Reference/WEBHOOKS.md)
- [e-task-3: Connect flow (OAuth)](../../Week%201/2026-02-06/e-task-3-instagram-connect-flow-oauth.md)
- [e-task-2: Webhook resolution page_id → doctor_id](../../Week%201/2026-02-06/e-task-2-webhook-resolution-page-id-to-doctor-id.md)

---

**Last updated:** 2026-03-28 (RBH-11: links + code paths after worker split)  
**Status:** Blocked on Meta webhook payload (missing sender for real DMs); engineering reference migrated to WEBHOOKS.md
