# Instagram DM Reply Troubleshooting
## Automated replies not sent when someone DMs the connected Instagram account

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

### 1. Report to Meta (recommended)

**Action:** File a bug report or support ticket.

**Details to include:**
- App uses Instagram API with Instagram Login
- Subscribed to `messages` and `message_edits`
- Real DMs trigger only `message_edit` in `entry[].messaging[]`
- Payload has `hasMessage: false`, `hasMessageEdit: true`, `hasSender: false`, `hasRecipient: false`
- Test payload uses `entry[].changes[]` with sender/recipient and works
- Request: Real DM webhooks should include `sender` and `recipient` per docs

**Where:** [Meta Developer Support](https://developers.facebook.com/support/)

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

### 3. API Integration Helper – verify sender ID

**Purpose:** Confirm Meta knows about conversations and get a real sender ID for testing.

**Steps:**
1. Go to [Instagram Graph API – Send Messages](https://developers.facebook.com/tools/explorer/) or the API Integration Helper in your app’s Instagram product
2. Paste your stored access token and click **Validate**
3. Check the **"To"** dropdown:
   - If it lists users who have DMed the account → Meta has conversations; note one recipient ID
   - If it only shows the business account → No other users have messaged (or Meta doesn’t expose them)
4. Click **Send message** – if it works, token and permissions are fine
5. Use a known recipient ID (e.g. `1640416227089561`) for temporary hardcode testing (dev only)

---

### 4. Reconnect Instagram

**Purpose:** Rule out stale token or misconfiguration.

**Steps:**
1. In your app: Disconnect Instagram for the doctor
2. Reconnect via OAuth flow
3. Send a new DM from a personal account
4. Check logs for `payloadStructure` – see if format changes

---

### 5. Subscribe to `messages` (not just `message_edits`)

**Purpose:** Ensure new DMs (not edits) trigger `message` events, which may include sender.

**Steps:**
1. In Meta App Dashboard → Instagram → Webhooks
2. Confirm subscriptions: `messages`, `message_edits`
3. Send a **new** DM (not an edit) and check logs
4. If `message` events arrive with sender, we can prioritize that path

---

### 6. Decode message ID (experimental)

**Idea:** The `message_edit.mid` (base64) might encode sender info in Meta’s internal format.

**Steps:**
1. Log a few real `mid` values (no PII)
2. Try base64 decode and inspect structure
3. Search Meta docs or community for `mid` format
4. **Note:** Likely low yield; Meta may not document this

---

### 7. Temporary manual workaround

**Until Meta fixes payloads:**
- Use Meta Business Suite or Instagram app to monitor and reply to DMs manually
- Or accept that automated replies are disabled until sender is available in webhooks

---

## 📂 Relevant Code Paths

| Component | Path | Purpose |
|-----------|------|---------|
| Webhook worker | `backend/src/workers/webhook-worker.ts` | `parseInstagramMessage`, `tryResolveSenderFromMessageEdit`, `isValidInstagramSenderId` |
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

- [Instagram Setup](../../../setup/instagram-setup.md)
- [Webhooks Reference](../../../Reference/WEBHOOKS.md)
- [e-task-3: Connect flow (OAuth)](../../Week%201/2026-02-06/e-task-3-instagram-connect-flow-oauth.md)
- [e-task-2: Webhook resolution page_id → doctor_id](../../Week%201/2026-02-06/e-task-2-webhook-resolution-page-id-to-doctor-id.md)

---

**Last updated:** 2026-02 (Week 3)  
**Status:** Blocked on Meta webhook payload (missing sender for real DMs)
