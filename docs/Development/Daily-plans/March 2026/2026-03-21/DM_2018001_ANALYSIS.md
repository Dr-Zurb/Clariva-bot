# Incoming DM Handling: "(#100) No matching user found" (2018001)

**Date:** 2026-03-21  
**Status:** Analysis complete; fix proposed

---

## Summary

When a user replies to our proactive DM (triggered by a comment), the message webhook is processed but **sending the bot reply fails** with Meta error `(#100) No matching user found` (subcode 2018001). The comment flow (public reply + DM) succeeds; the failure occurs when processing the **incoming message** webhook.

---

## Log Evidence

```
webhook_entry_id: 17841402147561728
doctor_page_id:   17841479659492101
recipient_id:     3019759344855285  (senderId from webhook)

"Message webhook: page ID mismatch (diagnostic for 2018001)"
"Conversation fallback: resolved sender"
"(#100) No matching user found"
```

---

## Root Cause

### 1. Page ID Mismatch

| ID | Source | Meaning |
|----|--------|---------|
| **webhook_entry_id** (17841402147561728) | `entry[0].id` from webhook payload | The object (Page or Instagram account) that **received** the message |
| **doctor_page_id** (17841479659492101) | `doctor_instagram.instagram_page_id` | Stored when doctor connects; from `page.instagram_business_account.id` (Instagram account ID) |
| **recipient_id** (3019759344855285) | `sender.id` from webhook | The user who sent the message (page-scoped ID) |

**Meta sends different IDs in different contexts:**
- **Webhook** `entry.id` can be the **Facebook Page ID** (when using Messenger Platform / Pages webhook)
- **OAuth connect** returns `instagram_business_account.id` = **Instagram account ID**

These are different even for the same business. We store only the Instagram account ID, so when the webhook sends the Page ID, we don't match.

### 2. Doctor Resolution Fallback

When `getDoctorIdByPageIds([webhook_entry_id])` finds no match, we use **single-doctor fallback**: if there is exactly one `doctor_instagram` row, we use that doctor. So we get a `doctorId` and token, but the token is for the doctor's connected Page/Instagram account.

### 3. ID Scoping

The sender ID `3019759344855285` is **page-scoped** to the object that received the message (17841402147561728). When we call the Send API with a token for a *different* object (17841479659492101), Meta cannot resolve the recipient → "No matching user found".

### 4. Conversation Fallback

We have a fallback: when send fails with `NotFoundError` and there's a page ID mismatch, we call `getSenderFromMostRecentConversation(doctorToken, correlationId, webhookEntryId)`. This returns a sender ID from the Conversation API. The log shows "Conversation fallback: resolved sender" (with `base: "fb"`), so we *did* get an ID. But sending to that ID also fails—likely because:
- The Conversation API returned an ID scoped to `webhookEntryId` (17841402147561728)
- Our token is for `doctorPageId` (17841479659492101)
- So the resolved ID is still invalid for our token's context

---

## Flow Diagram

```
User comments "i have headache"
    → Comment webhook (entry.id = 17841479659492101 for comments?)
    → Resolved doctor, sent DM + reply ✓

User receives DM, clicks into thread, replies
    → Message webhook (entry.id = 17841402147561728)  ← different ID!
    → getDoctorIdByPageIds([17841402147561728]) → no match
    → Single-doctor fallback → doctorId ✓
    → getStoredInstagramPageIdForDoctor → 17841479659492101
    → Mismatch: webhook 17841402147561728 ≠ stored 17841479659492101
    → sendInstagramMessage(senderId=3019759344855285) → 2018001 ✗
    → getSenderFromMostRecentConversation(webhookEntryId) → fallbackId
    → sendInstagramMessage(fallbackId) → 2018001 ✗ (same scoping issue)
```

---

## Why Comment Flow Works

Comment webhooks use `entry[].changes[]` with `field: "comments"`. The `entry.id` for comments may be the Instagram account ID (matches our stored value). Or the comment flow uses `resolveDoctorIdFromComment` which resolves via media owner → different code path. Either way, the comment → DM path succeeds because the IDs align.

---

## Proposed Fix

### Option A: Store Facebook Page ID (Recommended)

**During OAuth connect**, we already have `page.id` (Facebook Page ID). Store it:

1. **Migration**: Add `facebook_page_id` to `doctor_instagram` (nullable, for backward compatibility).
2. **Connect flow**: In `saveDoctorInstagram`, also persist `facebook_page_id` from `getPageTokenAndInstagramAccount` (return it alongside `instagramPageId`).
3. **Resolution**: In `getDoctorIdByPageIds`, try matching `instagram_page_id` *and* `facebook_page_id`.
4. **Effect**: When the webhook sends `entry.id = 17841402147561728` (Page ID), we'll match and use the correct doctor. The token is the Page token, which is valid for sending to recipients who messaged that Page.

### Option B: Use Webhook Entry ID for Lookup When Mismatch

When `webhookEntryId !== doctorPageId`, before sending, try:
- Resolving doctor by `webhookEntryId` again (e.g. if we added `facebook_page_id`).
- Or: ensure the Conversation API uses the token's native "me" context—maybe the fallback is querying the wrong target.

### Option C: Webhook Subscription Check

Verify the app's webhook subscription: is it subscribed to the **Page** or the **Instagram account**? If subscribed at Page level, `entry.id` = Page ID. Ensure our stored IDs cover both.

---

## Implementation: Option A

### 1. Migration

```sql
ALTER TABLE doctor_instagram ADD COLUMN IF NOT EXISTS facebook_page_id TEXT;
CREATE INDEX IF NOT EXISTS idx_doctor_instagram_facebook_page_id 
  ON doctor_instagram(facebook_page_id) WHERE facebook_page_id IS NOT NULL;
```

### 2. Connect Service

- `getPageTokenAndInstagramAccount`: return `{ pageAccessToken, instagramPageId, facebookPageId: page.id, instagramUsername }`.
- `saveDoctorInstagram`: accept and persist `facebook_page_id`.
- `getDoctorIdByPageIds`: when iterating `pageIds`, also match `facebook_page_id`.

### 3. Backfill for existing doctors

**Existing `doctor_instagram` rows** will have `facebook_page_id = null` until the doctor reconnects. Options:
- **Reconnect**: Have the doctor go to Settings → Instagram → Disconnect, then Connect again. This will populate `facebook_page_id`.
- **Backfill script** (optional): For each row, call `/{page-id}?fields=instagram_business_account` to resolve the Page ID from the Instagram account, then update `facebook_page_id`. (The reverse mapping is more complex; reconnect is simpler.)

---

## References

- [Meta 2018001 - No matching user found](https://stackoverflow.com/questions/45819783/) – page-scoped vs app-scoped IDs
- [Instagram Messaging Webhooks](https://developers.facebook.com/docs/messenger-platform/instagram/features/webhook/)
- `backend/src/services/instagram-connect-service.ts` – connect flow, `getPageTokenAndInstagramAccount`
- `backend/src/workers/webhook-worker.ts` – message handler, fallback around lines 2365–2402
- `backend/src/services/instagram-service.ts` – `getSenderFromMostRecentConversation`, 2018001 handling
