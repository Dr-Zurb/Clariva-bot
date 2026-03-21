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

## Next Steps (in order)

### 1. Stop retrying on 100/2018001 (reduce noise)

Treat `metaCode 100` + `error_subcode 2018001` as **non-retryable** in the Instagram send logic. Mark the job as failed (or skip) instead of retrying 3 times. This prevents log spam and dead-letter buildup for a permanent failure.

### 2. Log entry ID and recipient for debugging

When we resolve the doctor via "page ID mismatch fallback", log:
- `webhook_entry_id` (from the message payload)
- `doctor_page_id` (from doctor_instagram)
- `recipient_id` (who we're trying to send to)

Helps confirm the mismatch theory.

### 3. Verify ID in message webhooks

Inspect a real message webhook payload (when a user sends a DM): check `sender.id`, `entry[].id`, and compare with the comment webhook's `value.from.id` for the same user. If they differ, we may need to normalize or use a different lookup.

### 4. Consider Private Reply API for comment-initiated DMs

For comments, we send a **proactive DM** using `commenterIgId` from the comment webhook. That works. For **replies** to that DM, we use the standard Messaging API with `sender.id` from the message webhook. If Meta uses different IDs for comment context vs DM context, we could try using the **Private Reply** API (`recipient: { comment_id: "..." }`) for the first message—but we've already moved to DM, so that may not apply to follow-up replies.

---

## Impact

- **Comment → DM flow:** Working
- **Public reply:** Working (after adding instagram_manage_comments)
- **DM follow-up replies:** Failing when user replies to our DM (if that's the failing webhook)

If users reply "yes" or "schedule" in the DM thread and we fail to respond, that's a gap. The comment flow itself is fine.

---

**Reference:** [Stack Overflow: 2018001](https://stackoverflow.com/questions/45819783/) | [Meta Community](https://developers.facebook.com/community/threads/1227767161235265/)
