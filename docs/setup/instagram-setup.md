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

**Check in this order:**

1. **Queue and worker are running (production)**  
   - Open `https://your-backend-url/health` (e.g. your Render URL).
   - In the response, check:
     - `services.queue.enabled` must be `true`. If `false`, **REDIS_URL** is not set on the server; webhooks are accepted but never processed, so no replies.
     - `services.webhookWorker.running` must be `true`. If `false`, the worker did not start (usually because REDIS_URL is missing or invalid).
   - **Fix:** Set **REDIS_URL** in your hosting env (e.g. Render) to a valid Redis URL (e.g. from Upstash or Redis Cloud). Redeploy so the worker starts.

2. **Webhook is receiving events**  
   - In your server logs (e.g. Render logs), when you send a DM you should see entries like "Webhook queued for processing" or "Webhook received" (and no 401 from signature failure).
   - If you see "placeholder - REDIS_URL not set", the job is not actually queued; fix REDIS_URL as above.
   - If you see no log at all when you send a message, the webhook URL in Meta may be wrong or the app may not be in Live mode / subscriptions not enabled.

3. **Page is linked to a doctor**  
   - The backend resolves the Instagram **page ID** (from the webhook) to a **doctor** via `doctor_instagram`. If no row exists for that page, the bot marks the webhook as failed and does not reply (unless a fallback env token is set).
   - **Fix:** Use the app’s “Connect Instagram” flow so the doctor connects their account; that inserts a row in `doctor_instagram` with the page ID and token.

4. **Doctor has an Instagram token**  
   - For the linked doctor, the backend needs an Instagram access token (stored in `doctor_instagram` after connect). If the token is missing or expired, the bot will not send replies.
   - **Fix:** Reconnect Instagram for that doctor so a new token is saved.

5. **Latest code is deployed**  
   - Ensure the fix for audit log UUID (no longer passing Instagram event ID as `resource_id`) is deployed. Without it, webhook processing can fail on DB insert and no reply is sent.
   - Redeploy after setting REDIS_URL and any env changes.

**Quick check:** After sending a DM, check Render (or your host) logs for:
- `"Webhook queued"` or `"webhook_received"` → request reached the server.
- `"Webhook queue connected"` / `"Worker started"` at startup → queue and worker are active.
- `"No doctor linked for page"` → connect the Instagram account for the doctor.
- `"No Instagram token for doctor"` → reconnect Instagram to refresh the token.

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
