# Meta Developer App — Comment Webhook Setup

Enable Instagram **comment** webhooks so your backend receives notifications when users comment on your doctors' posts. DMs and comments use the **same** endpoint (`POST /webhooks/instagram`); you only need to subscribe to the `comments` field.

---

## Prerequisites

- [ ] App already receives **DM webhooks** (messages) — if yes, your Callback URL and Verify Token are set
- [ ] Instagram account(s) are **Business/Creator** and linked to a Facebook Page
- [ ] Instagram account(s) are **public** (required for comment webhooks)
- [ ] App is in **Live** mode (Meta does not send webhooks to Development mode in production)

---

## Step 1: Subscribe to `comments` in App Dashboard

1. Go to [Meta for Developers](https://developers.facebook.com/) → **Your App**
2. In the left sidebar, open **Webhooks**
3. Under **Webhooks**, select **Instagram** (or the product that shows your Instagram webhook)
4. Click **Edit** or **Configure** next to your subscription
5. In **Subscribed Fields**, ensure **`comments`** is checked:
   - `messages` — DMs (you likely already have this)
   - `comments` — post comments (add this)
6. Save

**Note:** If you use the Graph API to manage subscriptions, add `comments` to `subscribed_fields`:

```bash
# Example: Subscribe Instagram account to comments + messages
curl -X POST "https://graph.instagram.com/v18.0/{ig-user-id}/subscribed_apps?subscribed_fields=comments,messages&access_token={ACCESS_TOKEN}"
```

---

## Step 2: Permissions

Your app needs **`instagram_manage_comments`** (or equivalent) for comment webhooks.

1. Go to **App Dashboard** → **App Review** → **Permissions and Features**
2. Request **Advanced Access** for:
   - `instagram_manage_comments` — required for comment webhooks
   - `instagram_basic` — often already approved
3. For **Business Login** apps: `instagram_business_manage_comments` or `instagram_business_basic`
4. For **Facebook Login** apps: `instagram_manage_comments` or `instagram_basic`

**Comments require Advanced Access.** Development mode may work for testing; production needs App Review approval.

---

## Step 3: Verify Callback URL

Your webhook endpoint must be:

```
https://<your-backend-domain>/webhooks/instagram
```

Examples:
- Production: `https://clariva-bot.onrender.com/webhooks/instagram`
- Local (ngrok): `https://abc123.ngrok-free.app/webhooks/instagram`

**Verify Token** must match `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` in your `.env`.

---

## Step 4: Enable Subscriptions per Instagram Account

Subscribing in the App Dashboard may apply to all connected accounts. If you manage subscriptions via API:

1. Use the **Instagram User ID** (or linked Facebook Page ID)
2. POST to `/{ig-user-id}/subscribed_apps` with `subscribed_fields=comments,messages`
3. Use the doctor's **Instagram User access token** or **Page access token**

---

## Step 5: Test

1. Post something on the connected Instagram account (Feed or Reel)
2. Comment on that post (from another account)
3. Check backend logs for:
   - `Instagram comment webhook queued for processing`
   - `Comment: resolved doctor from...` or `Comment: no doctor resolved`

---

## Troubleshooting

### No webhooks at all (only /health in logs)

If you comment on a post but see **no** `Webhook POST received (any /webhooks path)` or `Instagram webhook POST received` in logs, Meta is not sending webhooks to your backend.

#### 1. Callback URL — typo check

| Check | Action |
|-------|--------|
| **URL exact?** | Callback must be `https://clariva-bot.onrender.com/webhooks/instagram` (or your actual backend URL). Common typo: `claire-bot` vs `clariva-bot`. |
| **No trailing slash** | Use `/webhooks/instagram` not `/webhooks/instagram/` |

#### 2. Use case: Messenger vs Instagram

You may have two use cases:
- **Engage with customers on Messenger from Meta** — DMs (messages) work here
- **Manage messaging & content on Instagram** — comments may be configured here

| Check | Action |
|-------|--------|
| **Instagram use case** | Click **Customize** on "Manage messaging & content on Instagram". If it has its own webhook config, set the **same** callback URL and subscribe to `comments` there. |
| **Same URL for both** | DMs and comments can use different configs. Ensure both point to your backend. |

#### 3. Subscription and permissions

| Check | Action |
|-------|--------|
| **Instagram account public?** | Comment webhooks require the account (e.g. clariva_care) to be **public**. |
| **comments subscribed?** | Edit Subscriptions → ensure `comments` is checked and **Save**. Verify 4 fields: messages, message_edit, comments, live_comments. |
| **Generate token** | For the Page that owns the Instagram account. Complete the flow. |
| **Advanced Access** | `instagram_manage_comments` needs Advanced Access. Comments may require **Live** mode. |

#### 4. Subscribe via API (if dashboard isn't enough)

```bash
# Replace {PAGE_ID} with your Page ID (e.g. 603305540117942)
# Replace {ACCESS_TOKEN} with the Page's access token

curl -X POST "https://graph.facebook.com/v18.0/{PAGE_ID}/subscribed_apps?subscribed_fields=comments,messages,message_edit&access_token={ACCESS_TOKEN}"
```

#### 5. Test and debug

| Check | Action |
|-------|--------|
| **Webhook Debugger** | Meta Dashboard → Webhooks → **Webhook Debugger**. Enter Page ID, check delivery status. |
| **Meta Test button** | Under Webhooks, use **Test** to send a test event. If test works, URL is correct. |
| **Feed post** | Comment webhooks may not fire for Reels. Use a **Feed post**. |
| **Keyword bypass** | Backend has a test: if comment contains "appointment", it bypasses AI. Add a comment with "appointment" and deploy — if it works, Meta IS sending. |

### Logs show only `message_edit`, never `comment:comments`

If every webhook POST has `payloadType: "message_edit"` and `entry0Keys: ["time","id","messaging"]`, Meta is **not** sending comment webhooks. Comment payloads would have `entry0Keys` including `"changes"` and `firstChangeField: "comments"`.

| Action | Check |
|--------|--------|
| **Meta setup** | Comments may require Live mode, or the "Manage messaging & content on Instagram" use case with its own webhook config |
| **Subscribe via API** | Try `POST /{PAGE_ID}/subscribed_apps?subscribed_fields=comments,messages,message_edit` |
| **Webhook Debugger** | Meta Dashboard → Webhooks → Debugger — see if Meta shows any comment delivery attempts |

### `message_edit` signature failures (401)

If `message_edit` webhooks fail signature verification, the backend now returns 200 (non-critical) to stop Meta's retry storm. DMs (`message`) still require valid signatures.

### Other issues

| Issue | Check |
|-------|--------|
| 401 on verification | `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` matches Dashboard |
| Comment webhook received but no outreach | Doctor resolved? (`doctor_instagram` linked). Intent classified as high-intent? |
| "Advanced Access required" | Request `instagram_manage_comments` in App Review |

---

## References

- [Instagram Webhooks — Comments](https://developers.facebook.com/docs/instagram-api/guides/webhooks)
- [Webhooks Reference: Instagram](https://developers.facebook.com/docs/graph-api/webhooks/reference/instagram/)
- [COMMENTS_MANAGEMENT_PLAN.md](../Development/Daily-plans/March%202026/2026-03-18/COMMENTS_MANAGEMENT_PLAN.md)
