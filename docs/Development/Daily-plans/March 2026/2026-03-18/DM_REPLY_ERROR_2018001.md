# DM Reply Error: (#100) No matching user found (subcode 2018001)

**Date:** 2026-03-21  
**Recipient ID in logs:** `3019759344855285`  
**Context:** Comment flow worked (DM + public reply). A separate **message** webhook failed when trying to send a reply.

---

## What Worked ✅

1. **Comment** "book an appointment" → webhook received, AI classified, DM sent, public reply posted, doctor email sent
2. **User received** the DM and the public reply "Check your DM for more information."

---

## What Failed ❌

A **message** (DM) webhook was queued and tried to send a reply to `recipient_id: 3019759344855285`. The Instagram API returned:

```
(#100) No matching user found
error_subcode: 2018001
type: OAuthException
```

The job retried 3 times, then failed.

---

## Likely Cause

**Page/entry ID mismatch** — The message webhook had `entry.id = 17841402147561728` while our connected doctor has `instagram_page_id = 17841479659492101`. We used "single doctor fallback" (only one doctor connected), but:

- The **token** is for page `17841479659492101`
- The **recipient** `3019759344855285` may be scoped to entry `17841402147561728`
- Meta may not allow sending to that recipient with this token (different ID space)

**Meta error 2018001** often means: invalid recipient ID, or recipient not in the conversation for this token.

---

## Possible Scenarios

| Scenario | Explanation |
|----------|-------------|
| **User replied to DM** | User sent a message in the DM thread. We got the webhook, extracted sender 3019759344855285, tried to reply. Failed because of ID/token scope. |
| **Different ID formats** | Comment webhooks use `value.from.id` (IG format). Message webhooks may use a different format. We might need to map or use a different field. |
| **Echo misclassified** | Unlikely—we have "message echo - returning 200" for another request. |

---

## Implemented Fix (2026-03-21)

### 1. Comment-lead fallback when 2018001 occurs

When sending a DM reply fails with `NotFoundError` (100/2018001) **and** the webhook entry ID does not match the doctor's stored page ID (page ID mismatch / single-doctor fallback scenario):

1. Fetch recent comment leads with `dm_sent=true` (last 10 minutes, up to 3 leads)
2. Retry sending using `commenter_ig_id` from each lead instead of the message webhook's `senderId`
3. The comment webhook's `commenterIgId` worked for the initial DM; it may work for follow-up replies when the message webhook's sender ID is in a different ID space

**Files changed:**
- `backend/src/services/comment-lead-service.ts` – added `getRecentCommentLeadsWithDmSent()`
- `backend/src/workers/webhook-worker.ts` – wrap `sendInstagramMessage` in try-catch; on NotFoundError + page mismatch, retry with comment_lead fallback

### 2. Diagnostic logging

When the message webhook has a page ID mismatch, we now log:
- `webhook_entry_id`
- `doctor_page_id`
- `recipient_id`

### 3. Non-retryable

`metaCode 100` + `error_subcode 2018001` is already mapped to `NotFoundError` in `instagram-service.ts`; `sendWithRetry` does not retry on `NotFoundError`.

---

## Impact

- **Comment → DM flow:** Working
- **Public reply:** Working (after adding instagram_manage_comments)
- **DM follow-up replies:** Failing when user replies to our DM (if that's the failing webhook)

If users reply "yes" or "schedule" in the DM thread and we fail to respond, that's a gap. The comment flow itself is fine.

---

**Reference:** [Stack Overflow: 2018001](https://stackoverflow.com/questions/45819783/) | [Meta Community](https://developers.facebook.com/community/threads/1227767161235265/)
