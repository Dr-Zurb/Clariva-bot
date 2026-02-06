# Learning Topics - Instagram Account Setup & Configuration
## Task #1: Facebook App, Instagram Product, and API Access Setup

---

## 📚 What Are We Learning Today?

Today we're learning about **Instagram Account Setup & Configuration** - setting up Instagram Business Account, creating Facebook App with Instagram Product, obtaining API access tokens, and configuring webhooks. Think of it like **getting a business license and setting up phone lines for a medical practice** - you need official accounts (Instagram Business), proper registration (Facebook App), credentials to make calls (Access Token), and a way to receive calls (Webhooks)!

We'll learn about:
1. **Instagram Business Account** - Converting personal account to business account
2. **Facebook App & Instagram Product** - Creating the integration platform
3. **Access Tokens** - Getting API credentials to send messages
4. **Webhook Configuration** - Setting up to receive messages
5. **Environment Variables** - Securely storing credentials
6. **Security Best Practices** - Protecting sensitive credentials
7. **Meta Platform Integration** - Understanding Facebook/Instagram ecosystem
8. **Token Management** - Handling token expiration and refresh

---

## 🎓 Topic 1: Instagram Business Account Setup

### What is an Instagram Business Account?

An **Instagram Business Account** is a special type of Instagram account that provides access to business features and APIs.

**Think of it like:**
- **Personal Account** = Regular phone line (can make calls, but limited features)
- **Business Account** = Business phone system (can make calls, receive calls, has advanced features, API access)

### Why Do We Need a Business Account?

**Personal accounts CANNOT:**
- Access Instagram Graph API
- Receive webhooks
- Send messages via API
- Access business insights

**Business accounts CAN:**
- Access Instagram Graph API
- Receive webhooks for messages
- Send messages programmatically
- Access business analytics
- Link to Facebook Page

**Think of it like:**
- **Personal account** = Can't connect to hospital phone system
- **Business account** = Can connect to hospital phone system and use all features

### How to Convert to Business Account

**Step-by-step process:**

1. **Open Instagram app** on mobile device
2. **Go to Settings** → Account
3. **Switch to Professional Account**
4. **Choose Business Account** (not Creator)
5. **Link to Facebook Page** (required for API access)
6. **Complete business information** (optional but recommended)

**Think of it like:**
- **Step 1-2** = Opening your account settings
- **Step 3** = Choosing to upgrade
- **Step 4** = Selecting business type
- **Step 5** = Linking to your business (Facebook Page)
- **Step 6** = Adding business details

### Important Requirements

**MUST have:**
- Facebook Page (to link Instagram account)
- Business email (for verification)
- Business information (name, category)

**Think of it like:**
- **Facebook Page** = Your business registration
- **Business email** = Your business contact
- **Business information** = Your business details

---

## 🎓 Topic 2: Facebook App & Instagram Product

### What is a Facebook App?

A **Facebook App** is an application registered in Facebook Developer Console that provides access to Facebook/Instagram APIs.

**Think of it like:**
- **Facebook App** = Your application's registration with Facebook
- **Like a business license** = Official permission to use Facebook/Instagram services
- **Like an API key** = Credentials to access Facebook/Instagram APIs

### Why Do We Need a Facebook App?

**Without Facebook App:**
- Cannot access Instagram Graph API
- Cannot receive webhooks
- Cannot send messages via API
- No way to integrate with Instagram

**With Facebook App:**
- Can access Instagram Graph API
- Can receive webhooks
- Can send messages programmatically
- Full integration with Instagram

**Think of it like:**
- **Without app** = No business license (can't operate)
- **With app** = Has business license (can operate legally)

### How to Create Facebook App

**Step-by-step process:**

1. **Navigate to Facebook Developers**
   - Go to `developers.facebook.com`
   - Log in with Facebook account

2. **Create New App**
   - Click "Create App" button
   - Select "Business" type (for messaging)
   - Enter app name and contact email

3. **Add Instagram Product**
   - Go to App Dashboard
   - Click "Add Product"
   - Select "Instagram" product
   - Click "Set Up" button

4. **Configure Instagram Product**
   - Enable Instagram Messaging API
   - Configure webhook callback URL
   - Set webhook verify token
   - Subscribe to webhook events

**Think of it like:**
- **Step 1** = Going to business registration office
- **Step 2** = Filling out application form
- **Step 3** = Adding Instagram service to your license
- **Step 4** = Configuring how Instagram will contact you

### Facebook App Components

**App ID:**
- Unique identifier for your app
- Public (can be exposed in client-side code)
- Used to identify your app to Facebook

**App Secret:**
- Secret key for your app
- **MUST be kept secret** (never expose)
- Used for server-side API calls
- Used for webhook signature verification

**Webhook Verify Token:**
- Random string you generate
- Used to verify webhook requests
- Must match what you configure in Facebook
- **MUST be kept secret**

**Think of it like:**
- **App ID** = Your business license number (public)
- **App Secret** = Your business password (secret)
- **Webhook Verify Token** = Your secret handshake (secret)

---

## 🎓 Topic 3: Instagram Graph API Access Token

### What is an Access Token?

An **Access Token** is a credential that allows your application to access Instagram Graph API on behalf of your Instagram Business Account.

**Think of it like:**
- **Access Token** = Your API key to Instagram
- **Like a password** = Proves you have permission to access Instagram
- **Like a badge** = Shows you're authorized to use Instagram API

### Types of Access Tokens

**Short-lived tokens:**
- Expire in 1 hour
- Used for testing
- Must be exchanged for long-lived token

**Long-lived tokens:**
- Expire in 60 days
- Used for production
- Can be refreshed before expiration

**Think of it like:**
- **Short-lived** = Temporary pass (expires quickly)
- **Long-lived** = Long-term pass (lasts 60 days)

### How to Generate Access Token

**Step-by-step process:**

1. **Use Facebook Graph API Explorer**
   - Go to `developers.facebook.com/tools/explorer`
   - Select your app from dropdown
   - Select Instagram Business Account

2. **Request Permissions**
   - `instagram_business_basic` - Basic Instagram Business account access
   - `instagram_manage_comments` - Manage comments on posts
   - `instagram_business_manage_messages` - Send/receive messages via Instagram Direct

3. **Generate Token**
   - Click "Generate Access Token"
   - Authorize permissions
   - Copy the token

4. **Exchange for Long-lived Token** (if needed)
   - Use Graph API endpoint
   - Exchange short-lived token
   - Get long-lived token (60 days)

**Think of it like:**
- **Step 1** = Going to token generation office
- **Step 2** = Requesting specific permissions
- **Step 3** = Getting your token
- **Step 4** = Upgrading to long-term token

### Access Token Permissions

**instagram_business_basic:**
- Basic Instagram Business account access
- Read account information
- Required for all Instagram Business API calls
- Replaces the older `instagram_basic` permission

**instagram_manage_comments:**
- Manage comments on Instagram posts
- Reply to comments
- Hide/delete comments
- Required for comment management features

**instagram_business_manage_messages:**
- Send messages via Instagram Direct API
- Receive message webhooks
- Required for messaging functionality
- Replaces the older `instagram_manage_messages` permission

**Think of it like:**
- **instagram_business_basic** = Basic access (can see account)
- **instagram_manage_comments** = Can manage comments on posts
- **instagram_business_manage_messages** = Can send/receive direct messages

### Token Security

**MUST:**
- Store in environment variables (never in code)
- Keep secret (never expose publicly)
- Rotate regularly (every 60 days)
- Use different tokens per environment (dev/staging/prod)

**MUST NOT:**
- Commit to version control
- Log in application logs
- Expose in client-side code
- Share publicly

**Think of it like:**
- **MUST** = Keep your password secret
- **MUST NOT** = Don't write password on sticky note

---

## 🎓 Topic 4: Webhook Configuration

### What is a Webhook?

A **Webhook** is a way for Instagram to send real-time notifications to your application when events occur (like receiving a message).

**Think of it like:**
- **Webhook** = Instagram calling your phone when something happens
- **Like a callback** = Instagram notifies you of events
- **Like a push notification** = Real-time updates sent to your app

### Why Do We Need Webhooks?

**Without webhooks:**
- Must poll Instagram API constantly (inefficient)
- Delayed message delivery
- High API usage (rate limits)
- Poor user experience

**With webhooks:**
- Real-time message delivery
- Efficient (only called when events occur)
- Lower API usage
- Better user experience

**Think of it like:**
- **Without webhooks** = Checking mailbox every minute (inefficient)
- **With webhooks** = Mailman rings doorbell when mail arrives (efficient)

### Webhook Configuration Steps

**Step-by-step process:**

1. **Set Webhook Callback URL**
   - URL where Instagram will send webhooks
   - Must be publicly accessible
   - Must use HTTPS in production
   - Example: `https://yourdomain.com/webhooks/instagram`

2. **Set Webhook Verify Token**
   - Random string you generate
   - Used to verify webhook requests
   - Must match what you configure in code
   - Generate using: `crypto.randomBytes(32).toString('hex')`

3. **Subscribe to Webhook Events**
   - `messages` - When user sends message
   - `message_reads` - When message is read
   - `message_deliveries` - When message is delivered

4. **Verify Webhook**
   - Facebook sends GET request with challenge
   - Your server must return challenge if verify token matches
   - This verifies webhook URL is correct

**Think of it like:**
- **Step 1** = Giving Instagram your phone number
- **Step 2** = Setting up secret password
- **Step 3** = Choosing what events to receive
- **Step 4** = Verifying Instagram can reach you

### Webhook Security

**MUST verify:**
- Webhook signature (X-Hub-Signature-256 header)
- Verify token (for GET requests)
- Source IP (optional, but recommended)

**MUST NOT:**
- Trust webhooks without verification
- Process webhooks without signature check
- Expose verify token publicly

**Think of it like:**
- **MUST verify** = Check caller ID before answering
- **MUST NOT** = Don't trust unknown callers

---

## 🎓 Topic 5: Environment Variables Configuration

### What are Environment Variables?

**Environment Variables** are configuration values stored outside your code, typically in `.env` files or system environment.

**Think of it like:**
- **Environment Variables** = Configuration file separate from code
- **Like a settings file** = Stores settings without hardcoding
- **Like a config file** = Keeps secrets out of code

### Why Use Environment Variables?

**Benefits:**
- Keep secrets out of code
- Different values per environment (dev/staging/prod)
- Easy to change without code changes
- Secure (not committed to version control)

**Think of it like:**
- **Benefits** = Keep passwords in safe, not written on paper

### Instagram Environment Variables

**Required variables:**

```bash
# Instagram App Configuration
INSTAGRAM_APP_ID=your_app_id_here
INSTAGRAM_APP_SECRET=your_app_secret_here
INSTAGRAM_ACCESS_TOKEN=your_access_token_here
INSTAGRAM_WEBHOOK_VERIFY_TOKEN=your_verify_token_here
INSTAGRAM_PAGE_ID=your_page_id_here  # Optional
```

**Think of it like:**
- **INSTAGRAM_APP_ID** = Your business license number
- **INSTAGRAM_APP_SECRET** = Your business password
- **INSTAGRAM_ACCESS_TOKEN** = Your API key
- **INSTAGRAM_WEBHOOK_VERIFY_TOKEN** = Your secret handshake
- **INSTAGRAM_PAGE_ID** = Your business page ID

### Environment Variable Validation

**Using Zod schema:**

```typescript
// config/env.ts
import { z } from 'zod';

const envSchema = z.object({
  // ... other variables
  INSTAGRAM_APP_ID: z.string().min(1),
  INSTAGRAM_APP_SECRET: z.string().min(1),
  INSTAGRAM_ACCESS_TOKEN: z.string().min(1),
  INSTAGRAM_WEBHOOK_VERIFY_TOKEN: z.string().min(32), // At least 32 chars for security
  INSTAGRAM_PAGE_ID: z.string().optional(),
});

export const env = envSchema.parse(process.env);
```

**Think of it like:**
- **Zod schema** = Validates your configuration
- **Like a form validator** = Ensures all fields are correct
- **Like a type checker** = Ensures values are right type

---

## 🎓 Topic 6: Security Best Practices

### Credential Security

**MUST:**
- Store all secrets in environment variables
- Use strong, random verify tokens
- Rotate tokens regularly (every 60 days)
- Use different credentials per environment

**MUST NOT:**
- Commit secrets to version control
- Log secrets in application logs
- Expose secrets in client-side code
- Share secrets publicly

**Think of it like:**
- **MUST** = Keep passwords in safe
- **MUST NOT** = Don't write passwords on whiteboard

### Webhook Security

**MUST verify:**
- Webhook signature (prevents spoofing)
- Verify token (for GET requests)
- Source (optional but recommended)

**MUST NOT:**
- Process webhooks without verification
- Trust webhook payloads blindly
- Expose verify token

**Think of it like:**
- **MUST verify** = Check ID before letting someone in
- **MUST NOT** = Don't trust strangers

### Token Management

**Best practices:**
- Use long-lived tokens (60 days)
- Set up token refresh before expiration
- Monitor token expiration dates
- Have backup tokens ready

**Think of it like:**
- **Best practices** = Renew license before it expires
- **Monitor expiration** = Keep track of expiration dates

---

## 🎓 Topic 7: Meta Platform Integration Patterns

### Facebook/Instagram Ecosystem

**Understanding the platform:**
- Instagram is part of Meta (Facebook) platform
- Uses Facebook Graph API for most operations
- Instagram Messaging uses Pages Messaging API
- Webhooks use Facebook webhook system

**Think of it like:**
- **Meta platform** = Parent company (Facebook)
- **Instagram** = Child service (uses Facebook infrastructure)
- **Graph API** = Common API for all Meta services

### API Endpoints

**Instagram Graph API:**
- Base URL: `https://graph.facebook.com/v18.0`
- Uses Facebook Graph API structure
- Requires access token for authentication

**Messaging API:**
- Endpoint: `POST /{page-id}/messages`
- Sends messages to Instagram users
- Requires `instagram_business_manage_messages` permission

**Think of it like:**
- **Graph API** = Main API for all Meta services
- **Messaging API** = Specific API for sending messages

### Rate Limits

**Meta platform rate limits:**
- Strict rate limits on API calls
- Varies by endpoint and app type
- Must handle 429 (Too Many Requests) errors
- Implement exponential backoff for retries

**Think of it like:**
- **Rate limits** = Speed limit on highway
- **429 errors** = Traffic jam (too many requests)
- **Exponential backoff** = Wait before trying again

---

## 🎓 Topic 8: Token Management & Refresh

### Token Lifecycle

**Token stages:**
1. **Generation** - Create new token
2. **Usage** - Use token for API calls
3. **Expiration** - Token expires (60 days)
4. **Refresh** - Get new token before expiration

**Think of it like:**
- **Generation** = Getting new license
- **Usage** = Using license
- **Expiration** = License expires
- **Refresh** = Renewing license

### Token Refresh Strategy

**Best practices:**
- Monitor token expiration (track expiration date)
- Refresh before expiration (e.g., 7 days before)
- Use refresh token endpoint (if available)
- Store expiration date in database

**Think of it like:**
- **Monitor expiration** = Check license expiration date
- **Refresh early** = Renew license before it expires
- **Store expiration** = Keep track of expiration dates

### Token Refresh Implementation

**Future implementation:**
- Scheduled job to check token expiration
- Automatic token refresh before expiration
- Update environment variables or database
- Alert if refresh fails

**Think of it like:**
- **Scheduled job** = Automatic reminder system
- **Automatic refresh** = Auto-renewal service
- **Alert on failure** = Notification if renewal fails

---

## 🎓 Topic 9: Webhook Verify Token Generation

### Why Generate Random Token?

**Security reasons:**
- Prevents unauthorized webhook calls
- Ensures only Facebook can call your webhook
- Protects against webhook spoofing

**Think of it like:**
- **Random token** = Secret password
- **Prevents spoofing** = Only Facebook knows password

### How to Generate Secure Token

**Using Node.js crypto:**

```typescript
import crypto from 'crypto';

// Generate random 32-byte token (64 hex characters)
const verifyToken = crypto.randomBytes(32).toString('hex');

console.log('Webhook Verify Token:', verifyToken);
// Example output: a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6
```

**Think of it like:**
- **crypto.randomBytes** = Random number generator
- **toString('hex')** = Convert to hexadecimal string
- **32 bytes** = 64 characters (very secure)

### Token Requirements

**MUST:**
- Be at least 32 characters long
- Be random (use crypto.randomBytes)
- Be stored securely (environment variables)
- Match what's configured in Facebook

**MUST NOT:**
- Be predictable (don't use simple strings)
- Be short (at least 32 characters)
- Be exposed publicly

**Think of it like:**
- **MUST** = Strong password requirements
- **MUST NOT** = Don't use "password123"

---

## 🎓 Topic 10: Common Setup Issues & Solutions

### Issue: Instagram Account Not Eligible

**Problem:**
- Personal account cannot access API
- Account not linked to Facebook Page

**Solution:**
- Convert to Business Account
- Link to Facebook Page
- Verify business information

**Think of it like:**
- **Problem** = Not registered as business
- **Solution** = Register as business

### Issue: Access Token Expired

**Problem:**
- Token expired (60 days)
- API calls failing with 401 Unauthorized

**Solution:**
- Generate new access token
- Exchange for long-lived token
- Update environment variables

**Think of it like:**
- **Problem** = License expired
- **Solution** = Renew license

### Issue: Webhook Verification Failing

**Problem:**
- Facebook cannot verify webhook URL
- GET request failing

**Solution:**
- Check verify token matches
- Ensure endpoint returns challenge
- Verify URL is publicly accessible

**Think of it like:**
- **Problem** = Can't verify phone number
- **Solution** = Check phone number is correct

### Issue: Missing Permissions

**Problem:**
- API calls failing with 403 Forbidden
- Missing required permissions

**Solution:**
- Request required permissions
- Regenerate access token with permissions
- Verify permissions in App Dashboard

**Think of it like:**
- **Problem** = Don't have required license
- **Solution** = Get required license

---

## 🎓 Topic 11: Testing Setup

### How to Test Setup

**Verification steps:**

1. **Test Access Token**
   - Make test API call to Instagram Graph API
   - Verify response is successful
   - Check permissions are correct

2. **Test Webhook Verification**
   - Send GET request to webhook URL
   - Verify challenge is returned
   - Check verify token matches

3. **Test Webhook Receiving**
   - Send test webhook from Facebook
   - Verify webhook is received
   - Check signature verification works

**Think of it like:**
- **Test Access Token** = Test if key works
- **Test Webhook Verification** = Test if phone works
- **Test Webhook Receiving** = Test if you can receive calls

### Test Data

**Use test data:**
- Test Instagram Business Account
- Test Facebook App (development mode)
- Test webhook payloads
- Never use production credentials in tests

**Think of it like:**
- **Test data** = Practice with test account
- **Never production** = Don't test with real account

---

## 🎓 Topic 12: Documentation Best Practices

### What to Document

**MUST document:**
- Instagram Business Account setup steps
- Facebook App creation process
- Access token generation steps
- Webhook configuration steps
- Environment variables required
- Token expiration dates
- Troubleshooting common issues

**Think of it like:**
- **MUST document** = Write down instructions
- **Like a manual** = Step-by-step guide

### Documentation Structure

**Recommended structure:**

1. **Prerequisites** - What you need before starting
2. **Step-by-step Guide** - Detailed instructions
3. **Configuration** - Environment variables
4. **Verification** - How to test setup
5. **Troubleshooting** - Common issues and solutions

**Think of it like:**
- **Structure** = Organized manual
- **Easy to follow** = Clear instructions

---

## 📝 Summary

### Key Takeaways

1. **Instagram Business Account** - Required for API access
2. **Facebook App** - Registration with Meta platform
3. **Access Token** - Credential for API access (60-day expiration)
4. **Webhook Configuration** - Real-time event notifications
5. **Environment Variables** - Secure credential storage
6. **Security** - Protect all secrets and verify webhooks
7. **Token Management** - Monitor and refresh tokens
8. **Documentation** - Document all setup steps

### Next Steps

After completing this setup:
1. Implement webhook controller (Task 4)
2. Implement Instagram service (Task 5)
3. Set up webhook processing queue (Task 6)
4. Test end-to-end flow (Task 7)

### Remember

- **Keep secrets secret** - Never expose credentials
- **Verify webhooks** - Always verify signatures
- **Monitor tokens** - Track expiration dates
- **Document everything** - Future you will thank you

---

**Last Updated:** 2026-01-21  
**Related Task:** [Task 1: Instagram Account Setup & Configuration](../../Development/Daily-plans/2026-01-21/e-task-1-instagram-setup.md)  
**Reference Documentation:**
- [EXTERNAL_SERVICES.md](../../Reference/EXTERNAL_SERVICES.md)
- [WEBHOOKS.md](../../Reference/WEBHOOKS.md)
- [COMPLIANCE.md](../../Reference/COMPLIANCE.md)
