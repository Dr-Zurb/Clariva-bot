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

## Implemented and Reverted

### Comment-lead fallback (REVERTED 2026-03-21)

A fallback was added to retry with `commenter_ig_id` from recent comment leads when 2018001 occurred. **This caused worse issues:**
- Sent replies to the **wrong recipient** (most recent commenter, not the actual message sender)
- Triggered **multiple duplicate replies** (6+ intro messages) when Meta sent several webhooks for the same message
- `REPLY_THROTTLE_SEC` (5s) was too short; webhooks ~7s apart all passed throttle

**Reverted** to avoid wrong-recipient spam. DM replies will again fail with 2018001 when page ID mismatches, but we no longer spam the wrong user.

### Current fixes (2026-03-21)

1. **REPLY_THROTTLE_SEC increased 5 → 60** – prevents duplicate sends when Meta sends multiple webhooks for the same message (typically 7–15s apart).
2. **Diagnostic logging retained** – `webhook_entry_id`, `doctor_page_id`, `recipient_id` logged on page mismatch.
3. **2018001 remains non-retryable** – mapped to `NotFoundError` in `instagram-service.ts`.

### Conversation API fallback (2026-03-21, re-added)

When send fails with 2018001 **and** page ID mismatch, we now call `getSenderFromMostRecentConversation()` to get the recipient ID from the Graph API. The API returns IDs that work for sending; the webhook `sender.id` may be in a different format. We try both `webhookEntryId` and `doctorPageId` as the conversation target. Safer than the comment_lead fallback (which used the most recent commenter, risking wrong recipient).

---

## Impact

- **Comment → DM flow:** Working
- **Public reply:** Working (after adding instagram_manage_comments)
- **DM follow-up replies:** Failing when user replies to our DM (if that's the failing webhook)

If users reply "yes" or "schedule" in the DM thread and we fail to respond, that's a gap. The comment flow itself is fine.

---

**Reference:** [Stack Overflow: 2018001](https://stackoverflow.com/questions/45819783/) | [Meta Community](https://developers.facebook.com/community/threads/1227767161235265/)
