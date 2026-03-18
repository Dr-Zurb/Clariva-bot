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

| Issue | Check |
|-------|--------|
| No comment webhooks received | App in Live mode? `comments` subscribed? Instagram account public? |
| 401 on verification | `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` matches Dashboard |
| Comment webhook received but no outreach | Doctor resolved? (`doctor_instagram` linked). Intent classified as high-intent? |
| "Advanced Access required" | Request `instagram_manage_comments` in App Review |

---

## References

- [Instagram Webhooks — Comments](https://developers.facebook.com/docs/instagram-api/guides/webhooks)
- [Webhooks Reference: Instagram](https://developers.facebook.com/docs/graph-api/webhooks/reference/instagram/)
- [COMMENTS_MANAGEMENT_PLAN.md](../Development/Daily-plans/March%202026/2026-03-18/COMMENTS_MANAGEMENT_PLAN.md)
