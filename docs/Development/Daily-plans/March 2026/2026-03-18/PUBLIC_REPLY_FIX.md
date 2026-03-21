# Public Reply Failure (metaCode 100) — Root Cause & Fix

**Date:** 2026-03-21  
**Log message:** `Comment reply failed (user blocked, comment deleted, or permission denied)` — status 400, metaCode 100

---

## What Happened

When a high-intent comment was received, the flow:
1. ✅ Classified intent (AI)
2. ✅ Sent proactive DM to the commenter
3. ❌ **Public reply failed** — `POST /{comment_id}/replies` returned 400 with `error.code: 100`
4. ✅ Doctor email sent

Instagram's error 100 usually means: **"Object does not exist, cannot be loaded due to missing permissions, or does not support this operation"**.

---

## Root Cause

**Missing OAuth scope: `instagram_manage_comments`**

The connect flow (`instagram-connect-service.ts`) requests these scopes:

```
pages_show_list, business_management, pages_read_engagement,
instagram_basic, ads_management, pages_manage_metadata,
pages_messaging, instagram_manage_messages
```

**`instagram_manage_comments` was NOT requested.** The Instagram Graph API [documentation](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-comment/replies/) explicitly requires it for `POST /{ig-comment-id}/replies`:

| Permission | Purpose |
|------------|---------|
| instagram_basic | Required |
| **instagram_manage_comments** | **Required for replying** |
| pages_show_list | Required |
| page_read_engagement | Required |

Without `instagram_manage_comments`, the Page token cannot post public replies to comments. The API returns 400 with code 100.

---

## Fix

1. **Add `instagram_manage_comments` to the OAuth scopes** in `instagram-connect-service.ts` (FACEBOOK_SCOPES).
2. **Reconnect Instagram** — The doctor must go to the dashboard and **reconnect** their Instagram so a new token is obtained with the new permission. The existing token was granted without `instagram_manage_comments` and will not gain it retroactively.
3. **Meta App Dashboard** — Ensure `instagram_manage_comments` is added to your app's permissions (Basic Display / Instagram API product) and requested in the OAuth flow. If the app is in Development mode, this works for test users. For Live mode, it may need App Review.

---

## Other Possible Causes (if fix above doesn't help)

| Cause | Check |
|-------|-------|
| **Hidden comment** | Instagram does not allow replies to hidden comments |
| **Live video** | Cannot reply to comments on live; use private reply instead |
| **Reply to a reply** | Can only reply to top-level comments |
| **Comment deleted** | Comment may have been deleted before we replied |
| **User blocked DMs** | Unrelated to public reply; DM would fail, not reply |
| **graph.instagram.com** | Try `graph.instagram.com` instead of `graph.facebook.com` if token is Instagram User token (not Page token) |

---

## After Fix

Once the doctor reconnects with `instagram_manage_comments`:
- Public reply `"Check your DM for more information."` should post successfully.
- Logs will show `comment_reply` audit event with `reply_id`.

---

**Reference:** [COMMENTS_MANAGEMENT_PLAN.md](./COMMENTS_MANAGEMENT_PLAN.md) | [meta-permissions-self-review.md](../../setup/meta-permissions-self-review.md)
