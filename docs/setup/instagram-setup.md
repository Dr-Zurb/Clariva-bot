# Instagram Setup Guide
## Facebook App & Instagram Product Configuration

---

## 📋 Overview

This guide walks you through setting up Instagram Business Account, creating a Facebook App with Instagram Product, and configuring webhooks for Instagram messaging integration.

**Estimated Time:** 1-2 hours  
**Prerequisites:** 
- Facebook account
- Instagram account (can be converted to Business Account)
- Facebook Page (to link Instagram account)

---

## Step 1: Instagram Business Account Setup

### 1.1 Convert to Business Account

1. **Open Instagram app** on your mobile device
2. **Go to Settings** → Account
3. **Switch to Professional Account**
4. **Choose Business Account** (not Creator)
5. **Link to Facebook Page** (required for API access)
   - If you don't have a Facebook Page, create one first
   - Go to Facebook → Create Page
   - Then link it to your Instagram account
6. **Complete business information** (optional but recommended)

### 1.2 Verify Account is Ready

- ✅ Instagram account is Business Account
- ✅ Linked to Facebook Page
- ✅ Account is active and accessible

**Document the following:**
- Instagram Business Account ID (found in Instagram settings)
- Linked Facebook Page ID (found in Facebook Page settings)

---

## Step 2: Facebook App Creation

### 2.1 Create Facebook App

1. **Navigate to Facebook Developers**
   - Go to `developers.facebook.com`
   - Log in with your Facebook account

2. **Create New App**
   - Click "Create App" button
   - Select "Business" type (for messaging)
   - Enter app name (e.g., "Clariva Care")
   - Enter contact email

3. **Add Use Cases**
   - On the "Add use cases" screen:
     - Select "Business messaging (3)" filter on the left
     - Check "Manage messaging & content on Instagram"
     - Click "Next"

4. **Complete App Setup**
   - Fill in remaining app details
   - Complete Business information
   - Review and submit

### 2.2 Add Instagram Product

1. **Go to App Dashboard**
   - After app creation, you'll be in the App Dashboard
   - Look for "Add Product" section

2. **Add Instagram Product**
   - Click "Add Product"
   - Find "Instagram" in the product list
   - Click "Set Up" button

3. **Configure Instagram Product**
   - Enable Instagram Messaging API
   - Note: Webhook configuration will be done in Step 2.3

### 2.3 Configure Webhooks

**Note:** If your backend is not yet deployed, you can skip webhook configuration for now and configure it later when your backend is available (see Task 4).

1. **Set Webhook Callback URL**
   - Go to Instagram Product → Webhooks
   - Click "Add Callback URL"
   - Enter your webhook URL: `https://yourdomain.com/webhooks/instagram`
   - For local development, use ngrok: `https://your-ngrok-url.ngrok.io/webhooks/instagram`

2. **Set Webhook Verify Token**
   - Generate a secure random token (at least 32 characters)
   - Use Node.js: `crypto.randomBytes(32).toString('hex')`
   - Enter the token in Facebook App settings
   - **Store this token securely** - you'll need it in your `.env` file

3. **Subscribe to Webhook Events**
   - Check the following events:
     - ✅ `messages` - When user sends message
     - ✅ `message_reads` - When message is read
     - ✅ `message_deliveries` - When message is delivered

4. **Verify Webhook**
   - Facebook will send a GET request to verify your webhook
   - Your server must return the challenge if verify token matches
   - This will be implemented in Task 4 (Webhook Controller)

### 2.4 Document App Details

**Record the following (store securely, not in code):**

- **App ID**: Found in App Dashboard → Settings → Basic
- **App Secret**: Found in App Dashboard → Settings → Basic (click "Show" to reveal)
  - ⚠️ **KEEP SECRET** - Never commit to version control
- **Webhook Verify Token**: The token you generated in Step 2.3.2

---

## Step 3: Instagram Graph API Access Token

### 3.1 Generate Access Token

1. **Use Facebook Graph API Explorer**
   - Go to `developers.facebook.com/tools/explorer`
   - Select your app from the dropdown
   - Select your Instagram Business Account

2. **Request Permissions**
   - Click "Get Token" → "Get User Access Token"
   - Select the following permissions:
     - ✅ `instagram_business_basic`
     - ✅ `instagram_manage_comments`
     - ✅ `instagram_business_manage_messages`
   - Click "Generate Access Token"

3. **Exchange for Long-lived Token**
   - Short-lived tokens expire in 1 hour
   - Exchange for long-lived token (60 days):
     - Use Graph API: `GET /oauth/access_token?grant_type=fb_exchange_token&client_id={app-id}&client_secret={app-secret}&fb_exchange_token={short-lived-token}`
   - Copy the long-lived access token

4. **Store Access Token**
   - Add to your `.env` file as `INSTAGRAM_ACCESS_TOKEN`
   - ⚠️ **KEEP SECRET** - Never commit to version control

### 3.2 Document Token Information

**Record the following:**
- Access token expiration date (60 days from generation)
- Token refresh process (for future automation)
- Note: Token refresh will be automated in a future task

---

## Step 4: Environment Variables

### 4.1 Add to `.env.example`

Add the following variables to `backend/.env.example`:

```bash
# Instagram Configuration
INSTAGRAM_APP_ID=your_instagram_app_id
INSTAGRAM_APP_SECRET=your_instagram_app_secret
INSTAGRAM_ACCESS_TOKEN=your_instagram_access_token
INSTAGRAM_WEBHOOK_VERIFY_TOKEN=your_webhook_verify_token_min_32_chars
INSTAGRAM_PAGE_ID=your_instagram_page_id  # Optional, for reference
```

### 4.2 Add to Your `.env` File

Copy the values from your Facebook App setup:

```bash
INSTAGRAM_APP_ID=<your-app-id-from-facebook>
INSTAGRAM_APP_SECRET=<your-app-secret-from-facebook>
INSTAGRAM_ACCESS_TOKEN=<your-long-lived-access-token>
INSTAGRAM_WEBHOOK_VERIFY_TOKEN=<your-generated-verify-token>
INSTAGRAM_PAGE_ID=<your-facebook-page-id>  # Optional
```

### 4.3 Verify Environment Variables

The environment variables are validated in `backend/src/config/env.ts` using Zod schema. The server will fail to start if required variables are missing or invalid.

**Validation Rules:**
- `INSTAGRAM_APP_ID`: Required, minimum 1 character
- `INSTAGRAM_APP_SECRET`: Required, minimum 1 character
- `INSTAGRAM_ACCESS_TOKEN`: Required, minimum 1 character
- `INSTAGRAM_WEBHOOK_VERIFY_TOKEN`: Required, minimum 32 characters (for security)
- `INSTAGRAM_PAGE_ID`: Optional

---

## Step 5: Verification

### 5.1 Test Access Token

1. **Make Test API Call**
   - Use Graph API Explorer or curl:
   ```bash
   curl -X GET "https://graph.facebook.com/v18.0/me?access_token=YOUR_ACCESS_TOKEN"
   ```
   - Should return your Instagram Business Account information

2. **Verify Permissions**
   - Check that you have required permissions
   - Verify token hasn't expired

### 5.2 Test Webhook (After Task 4)

Once webhook controller is implemented (Task 4):
1. Send test webhook from Facebook App Dashboard
2. Verify webhook is received
3. Verify signature verification works
4. Verify challenge response works (GET request)

---

## 🔒 Security Best Practices

### Credential Security

**MUST:**
- Store all secrets in environment variables (never in code)
- Use strong, random webhook verify token (at least 32 characters)
- Rotate tokens regularly (every 60 days for access tokens)
- Use different credentials per environment (dev/staging/prod)

**MUST NOT:**
- Commit secrets to version control
- Log secrets in application logs
- Expose secrets in client-side code
- Share secrets publicly

### Webhook Security

**MUST verify:**
- Webhook signature (X-Hub-Signature-256 header)
- Verify token (for GET requests)
- Source IP (optional, but recommended)

**MUST NOT:**
- Trust webhooks without verification
- Process webhooks without signature check
- Expose verify token publicly

---

## 🐛 Troubleshooting

### Issue: Instagram Account Not Eligible

**Problem:** Personal account cannot access API

**Solution:**
- Convert to Business Account
- Link to Facebook Page
- Verify business information

### Issue: Access Token Expired

**Problem:** Token expired (60 days)

**Solution:**
- Generate new access token
- Exchange for long-lived token
- Update environment variables

### Issue: Webhook Verification Failing

**Problem:** Facebook cannot verify webhook URL

**Solution:**
- Check verify token matches
- Ensure endpoint returns challenge
- Verify URL is publicly accessible
- Check HTTPS is enabled (required in production)

### Issue: Missing Permissions

**Problem:** API calls failing with 403 Forbidden

**Solution:**
- Request required permissions
- Regenerate access token with permissions
- Verify permissions in App Dashboard

### Issue: No automated replies when someone DMs the Instagram account

**Problem:** User sends messages (e.g. "hello") but receives no reply from the bot.

Work through the checklist below in order. Mark each item when verified or fixed.

---

#### Troubleshooting checklist (no auto-replies)

- [x] **1. Queue and worker are running** — *checked; no issue.*  
  - **Verify:** Open `https://<your-backend>/health` (e.g. `https://clariva-bot.onrender.com/health`). Not the root URL — that returns API info only; use the path that ends with `/health`.
  - **Check in response:** `data.services.queue.enabled` is `true` and `data.services.webhookWorker.running` is `true`.
  - **If not:** Set **REDIS_URL** in your host env (e.g. Render) to a valid Redis URL (Upstash, Redis Cloud, etc.). Redeploy.

- [ ] **2. Webhook is receiving events**
  - **Verify:** In server logs (e.g. Render), when you send a DM you see "Webhook queued for processing" or "webhook_received" (and no 401).
  - **If you see:** "placeholder - REDIS_URL not set" → fix step 1 (REDIS_URL).
  - **If you see nothing when you send a message** (no webhook logs at all), Meta is not sending events. Check the following in your Meta app:

    1. **Complete Meta "API setup" Step 2: Generate access tokens**
       - In Meta Developer Console → your app → Instagram API setup, Step 2 must be **complete** (green check), not "in progress" (half-blue). If it turns green on reload then back to in progress, a token has not been successfully generated yet.
       - **Adding the account and turning "Webhook subscription" On is not enough.** You must **click "Generate token"** for the **receiver** account (e.g. `clariva_care`) and complete the authorization flow (log in with that account, click Allow). Until a token is generated, Step 2 stays in progress and Meta may not deliver message webhooks.
       - Ensure the **receiver** (e.g. `clariva_care`) is an Instagram Tester (Roles tab). For **receiving** webhooks, only the **receiver** account needs "Generate token" completed; the sender (e.g. `dr_abhishek_sahil`) can be added for testing but the critical one is the receiver’s token.
       - If you added both sender and receiver but Step 2 still shows "in progress" after refresh, complete **"Generate token"** for **clariva_care** (the DM receiver) in Step 2; that is what flips the step to complete and allows webhook delivery.

    2. **Messaging permission still shows "0" users**
       - In Meta app → **Permissions and features**, **`instagram_business_manage_messages`** (or **`instagram_manage_messages`**) may show **"0"** even after you clicked Allow in your app’s **Connect Instagram** flow. Meta’s count often reflects accounts that completed **Meta’s** token flow (Step 2 "Generate token" in the Developer Console), not only your app’s OAuth.
       - **Fix:** (1) Keep using your app’s Connect Instagram with the receiver account (so your backend has a token for sending replies). (2) In addition, in Meta Step 2 click **"Generate token"** for the receiver (e.g. `clariva_care`) and complete the flow. After that, the permission count should show 1 and Step 2 should stay green; Meta will then deliver message webhooks.

    3. **Webhook URL and subscription**
       - **Callback URL:** Must be exactly your backend base URL + `/webhooks/instagram`, e.g. `https://clariva-bot.onrender.com/webhooks/instagram`. No trailing slash. Verify token must match **INSTAGRAM_WEBHOOK_VERIFY_TOKEN** in your env.
       - **Subscribe:** Under the webhook, ensure **`messages`** is **Subscribed** (toggle On). You can leave other messaging fields (e.g. `message_edit`, `message_reactions`) as desired.
       - **"App must be in published state" warning:** In **development** mode, testers can still receive webhooks; that warning applies to non-tester/live usage. You do not need to complete app review for testers to get message webhooks.

    4. **Step 2 keeps reverting to "in progress" (half-blue)**
       - Meta's UI sometimes shows Step 2 as complete after you generate a token, then flips back to "in progress" on refresh. Tokens generated in the console can be short-lived or the UI may not persist the "complete" state reliably.
       - **First check:** When you send a DM to the receiver account, do you see **any** webhook request in Render logs (e.g. "Webhook queued" or a POST to `/webhooks/instagram`)? If **yes**, then Meta is sending webhooks and the Step 2 badge is a cosmetic issue — focus on steps 3–5 (doctor linked, token in DB, code deployed). If **no**, Meta is not sending; try the steps below.
       - **Try:** (1) Generate token again for **only** the **receiver** (`clariva_care`) in Step 2 — use a normal (non-incognito) browser and the same Facebook/Instagram account. (2) In **Roles** → **Instagram Testers**, ensure `clariva_care` is listed. (3) In **Permissions and features**, confirm **`instagram_business_manage_messages`** is "Ready for testing" and, if possible, shows 1+ user after you complete "Generate token". (4) Send a test DM and check Render logs immediately; if still nothing, wait a few minutes and try again (Meta can delay subscription activation).
       - **Note:** Your app uses the token in **Supabase** (from Connect Instagram) for **sending** replies. The Meta Console token is for Meta's side (webhook delivery). So even if Step 2 stays half-blue, if webhooks start appearing in logs, the rest of your pipeline (doctor link, Supabase token) will determine whether replies are sent.

  - **Development mode:** Using tester accounts (e.g. `clariva_care` as DM receiver, `dr_abhishek_sahil` as sender) is correct. The **receiver** account is the one that must have granted the app messaging permission and be the one you used to "Connect Instagram" in your app’s settings.

- [x] **3. Page is linked to a doctor**
  - **Verify:** Backend looks up the Instagram page ID in `doctor_instagram`. If no row exists, logs show "No doctor linked for page".
  - **Fix:** Use the app’s “Connect Instagram” flow so the doctor connects their account (creates row in `doctor_instagram` with page ID and token).

- [x] **4. Doctor has an Instagram token**  
  - **Verify:** For the linked doctor, a valid token exists in `doctor_instagram`. If missing/expired, logs show "No Instagram token for doctor".
  - **Fix:** Reconnect Instagram for that doctor in the app to save a new token.

- [x] **5. Latest code is deployed**  
  - **Verify:** Audit log fix (no Instagram event ID as `resource_id`) and any REDIS_URL change are deployed.
  - **Fix:** Push to GitHub and redeploy (e.g. Render auto-deploy from `main`), or trigger deploy after env changes.

---

#### Where to see logs on Render

- Use **Logs** (under **Monitor** in the left sidebar), not **Events**. Events shows deployments; Logs shows runtime output (requests, worker, errors).
- After sending a DM, search the log stream for (in order of when they appear):
  - **`Instagram webhook POST received (verifying signature)`** — every POST to `/webhooks/instagram` logs this first, before signature check. If you see this, the request reached your server.
  - **`Instagram webhook queued for processing`** — signature passed and job queued.
  - **`Request completed`** with `path: "/webhooks/instagram"` — request finished (200 or 4xx/5xx).
  - **`Webhook queue connected`** / **`Webhook worker started`** — at startup, confirms Redis and worker are running.
- If you see **no** line containing `Instagram webhook POST received` or `webhooks/instagram` when you send a message, the request is **not reaching your backend** (Meta not sending, wrong URL, or app not subscribed for that account).

#### Backend audit (when nothing appears in logs)

The backend flow has been verified end-to-end:

- **Routes:** `POST /webhooks/instagram` is registered; body parser stores `rawBody` for signature verification.
- **Controller:** Signature (X-Hub-Signature-256 + INSTAGRAM_APP_SECRET), eventId extraction, idempotency, queue add, then 200 OK. A log runs at the very start of the handler so any POST to this path is visible.
- **Signature:** Uses HMAC-SHA256 with `INSTAGRAM_APP_SECRET`. On Render, this must match the Meta app’s **App Secret** exactly (no extra spaces).
- **Worker:** Resolves page ID from `entry[0].id`, looks up doctor via `doctor_instagram.instagram_page_id`, gets token from `doctor_instagram.instagram_access_token`, sends reply. Page ID stored at connect is the same value Meta sends in webhooks.
- **Connect flow:** Saves `instagram_page_id` from the token exchange /me (Instagram Business Account ID), which matches webhook `entry[0].id`.

If **no** webhook log appears when you send a DM, the request is not hitting your server. Double-check in Meta: Callback URL is exactly `https://clariva-bot.onrender.com/webhooks/instagram`, Step 2 token generated for the receiver account, and `messages` subscribed. After the next deploy, search logs for **`Instagram webhook POST received`**; if that never appears, the problem is on Meta’s side (subscription/delivery), not the backend code.

#### Log quick reference (after sending a DM)

| Log message | Meaning |
|-------------|--------|
| `Instagram webhook queued for processing` | Meta sent an event; request reached the server and was queued. |
| `Webhook has no message to reply to` with `firstMessagingKeys: ["timestamp","message_edit"]` | Event is a **message_edit** (user edited a message). The backend replies when the payload includes **sender** (or **from**, or entry-level **from**/**sender**, or **message_edit.sender**). If Meta sends message_edit without any of these, we cannot reply. Check **entry0Keys** in the same log line: if you see `sender` or `from` there, the next deploy may pick them up; if not, ensure **messages** is subscribed so **new** DMs send a webhook with `message` and sender. |
| `Webhook queued` (placeholder) | REDIS_URL not set; webhook logged but not processed (no replies). |
| `Webhook queue connected` / `Worker started` (at startup) | Queue and worker are active. |
| `No doctor linked for page` | Connect the Instagram account for the doctor (step 3). |
| `No Instagram token for doctor` | Reconnect Instagram to refresh the token (step 4). |

---

## 📚 Reference Documentation

- [Facebook Developers Documentation](https://developers.facebook.com/docs/instagram-api)
- [Instagram Graph API Reference](https://developers.facebook.com/docs/instagram-api/reference)
- [Webhook Setup Guide](https://developers.facebook.com/docs/graph-api/webhooks)
- [EXTERNAL_SERVICES.md](../../Reference/EXTERNAL_SERVICES.md) - Meta platform integration patterns
- [WEBHOOKS.md](../../Reference/WEBHOOKS.md) - Webhook security requirements
- [COMPLIANCE.md](../../Reference/COMPLIANCE.md) - Security requirements

---

## ✅ Checklist

Before proceeding to Task 4 (Webhook Controller), ensure:

- [ ] Instagram Business Account is set up and linked to Facebook Page
- [ ] Facebook App is created with Instagram Product enabled
- [ ] Instagram Graph API access token is obtained (long-lived, 60 days)
- [ ] Webhook verify token is generated and stored securely
- [ ] All environment variables are added to `.env` file
- [ ] Environment variables are validated in `config/env.ts`
- [ ] App ID, App Secret, and tokens are documented (securely)
- [ ] Access token expiration date is recorded

---

**Last Updated:** 2026-01-21  
**Related Task:** [Task 1: Instagram Account Setup & Configuration](../../Development/Daily-plans/2026-01-21/e-task-1-instagram-setup.md)  
**Next Steps:** [Task 4: Webhook Controller & Routes](../../Development/Daily-plans/2026-01-21/e-task-4-webhook-controller.md)
