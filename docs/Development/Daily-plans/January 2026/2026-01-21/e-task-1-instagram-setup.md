# Task 1: Instagram Account Setup & Configuration
## January 21, 2026 - Instagram Webhook Integration Day

---

## 📋 Task Overview

Set up Instagram Business Account, create Facebook App and Instagram Product, obtain Instagram Graph API access token, and configure webhook endpoint URL. This is primarily an external setup task that requires manual steps in Facebook Developer Console.

**Estimated Time:** 1-2 hours  
**Status:** ⏳ **PENDING**

**Scope Guard:**
- Expected files touched: ≤ 2 (environment variables, documentation)
- Any expansion requires explicit approval

**Reference Documentation:**
- [EXTERNAL_SERVICES.md](../../Reference/EXTERNAL_SERVICES.md) - Meta platform integration patterns
- [WEBHOOKS.md](../../Reference/WEBHOOKS.md) - Webhook security requirements
- [COMPLIANCE.md](../../Reference/COMPLIANCE.md) - Security requirements

---

## ✅ Task Breakdown (Hierarchical)

### 1. Instagram Business Account Setup
- [x] 1.1 Create or convert Instagram account to Business Account
  - [x] 1.1.1 Verify Instagram account exists
  - [x] 1.1.2 Convert to Business Account (if needed)
  - [x] 1.1.3 Link Instagram account to Facebook Page
  - [x] 1.1.4 Verify account is ready for API access
- [x] 1.2 Document Instagram Business Account details
  - [x] 1.2.1 Record Instagram Business Account ID
  - [x] 1.2.2 Record linked Facebook Page ID
  - [x] 1.2.3 Store credentials securely (not in code)

### 2. Facebook App & Instagram Product Setup
- [x] 2.1 Create Facebook App in Facebook Developer Console
  - [x] 2.1.1 Navigate to Facebook Developers (developers.facebook.com)
  - [x] 2.1.2 Create new app (select "Business" type)
  - [x] 2.1.3 Configure app basic settings
  - [x] 2.1.4 Add Instagram Product to app
- [x] 2.2 Configure Instagram Product settings
  - [x] 2.2.1 Enable Instagram Messaging API
  - [x] 2.2.2 Configure webhook callback URL  
        _Note: If your backend does not currently have a public URL, you can skip setting the callback for now. Once your backend is available (see Task 4), update the webhook callback URL in the Facebook App settings to your deployed endpoint (e.g., via a service like Ngrok for local development or your production domain)._
  - [x] 2.2.3 Set webhook verify token (store in environment variables)
  - [x] 2.2.4 Subscribe to webhook events (messages, message_reads, message_deliveries)
- [x] 2.3 Document Facebook App details
  - [x] 2.3.1 Record App ID
  - [x] 2.3.2 Record App Secret (store securely in environment variables)
  - [x] 2.3.3 Record webhook verify token

### 3. Instagram Graph API Access Token
- [x] 3.1 Generate Instagram Graph API access token
  - [x] 3.1.1 Use Facebook Graph API Explorer or App Dashboard
  - [x] 3.1.2 Request permissions: `instagram_business_basic`, `instagram_manage_comments`, `instagram_business_manage_messages`
  - [x] 3.1.3 Generate long-lived access token (60 days)
  - [x] 3.1.4 Store access token securely in environment variables
- [x] 3.2 Set up token refresh mechanism (for future)
  - [x] 3.2.1 Document token expiration date
  - [x] 3.2.2 Plan for token refresh automation (future task)
  - [x] 3.2.3 Document refresh process

### 4. Environment Variables Configuration
- [x] 4.1 Add Instagram-related environment variables
  - [x] 4.1.1 Add `INSTAGRAM_APP_ID` to `.env.example` - ✅ COMPLETED (already exists)
  - [x] 4.1.2 Add `INSTAGRAM_APP_SECRET` to `.env.example` - ✅ COMPLETED (already exists)
  - [x] 4.1.3 Add `INSTAGRAM_ACCESS_TOKEN` to `.env.example` - ✅ COMPLETED (already exists)
  - [x] 4.1.4 Add `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` to `.env.example` - ✅ COMPLETED (already exists)
  - [x] 4.1.5 Add `INSTAGRAM_PAGE_ID` to `.env.example` (optional, for reference) - ✅ COMPLETED (already exists)
- [x] 4.2 Update environment variable validation
  - [x] 4.2.1 Add Instagram variables to `config/env.ts` Zod schema - ✅ COMPLETED
  - [x] 4.2.2 Ensure all variables are validated on startup - ✅ COMPLETED (Zod schema validates on startup)
  - [x] 4.2.3 Document variable requirements - ✅ COMPLETED (documented in instagram-setup.md)

### 5. Documentation
- [x] 5.1 Create setup documentation
  - [x] 5.1.1 Document Instagram Business Account setup steps - ✅ COMPLETED (in instagram-setup.md)
  - [x] 5.1.2 Document Facebook App creation steps - ✅ COMPLETED (in instagram-setup.md)
  - [x] 5.1.3 Document access token generation process - ✅ COMPLETED (in instagram-setup.md)
  - [x] 5.1.4 Document webhook configuration steps - ✅ COMPLETED (in instagram-setup.md)
- [x] 5.2 Update project documentation
  - [x] 5.2.1 Add Instagram setup section to README or setup guide - ✅ COMPLETED (created instagram-setup.md)
  - [x] 5.2.2 Document required environment variables - ✅ COMPLETED (in instagram-setup.md)
  - [x] 5.2.3 Document webhook URL format - ✅ COMPLETED (in instagram-setup.md)

---

## 📁 Files to Create/Update

```
backend/
├── .env.example                    (UPDATE - Add Instagram environment variables)
└── src/
    └── config/
        └── env.ts                  (UPDATE - Add Instagram variable validation)

docs/
└── setup/
    └── instagram-setup.md          (NEW - Instagram setup guide)
```

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

**From EXTERNAL_SERVICES.md:**
- Meta platform integration requires signature verification
- Rate limits must be respected (Meta has strict limits)
- Webhook processing must be async (queue-based)

**From WEBHOOKS.md:**
- Webhook signature verification is MANDATORY
- Webhook verify token must be stored securely
- Webhook callback URL must be HTTPS in production

**From COMPLIANCE.md:**
- Webhook security is MANDATORY (signature verification, idempotency)
- All webhook events must be audit logged
- Rate limiting on webhook endpoint is MANDATORY

**Security Considerations:**
- App Secret and Access Token are sensitive credentials
- Must be stored in environment variables (never in code)
- Webhook verify token must be random and secure
- Access tokens expire (60 days for long-lived tokens)

**External Service Considerations:**
- Facebook Developer Console requires manual configuration
- Instagram Business Account setup requires manual steps
- Webhook URL must be publicly accessible (for Facebook to call)
- Webhook URL must use HTTPS in production

---

## 🌍 Global Safety Gate (MANDATORY)

Task **CANNOT proceed** unless this section is completed:

- [x] **Data touched?** (N) - No application data touched (external setup only)
- [x] **Any PHI in logs?** (MUST be No) - No logs generated in this task
- [x] **External API or AI call?** (Y) - Facebook/Instagram API access required
  - [x] **Consent + redaction confirmed?** (N/A) - No API calls made in this task (setup only)
- [x] **Retention / deletion impact?** (N) - No data retention changes

**Rationale:**
- Ensures global compliance (US, EU, Japan, Middle East)
- Prevents silent violations
- Provides audit trail

---

## ✅ Acceptance & Verification Criteria

Task is complete **ONLY when:**
- [x] Instagram Business Account is set up and linked to Facebook Page
- [x] Facebook App is created with Instagram Product enabled
- [x] Instagram Graph API access token is obtained and stored securely
- [x] Webhook verify token is generated and stored securely
- [x] All environment variables are added to `.env.example` and validated in `config/env.ts`
- [x] Setup documentation is created
- [x] Webhook callback URL is documented (will be configured in Task 4)

**See also:** [DEFINITION_OF_DONE.md](../../Reference/DEFINITION_OF_DONE.md) for comprehensive completion checklist.

---

## 🐛 Issues Encountered & Resolved

_To be filled during implementation_

---

## 📝 Notes

- This task involves external service setup (Facebook Developer Console)
- Some steps require manual configuration in Facebook Developer Console
- Access tokens expire after 60 days (long-lived tokens)
- Webhook URL will be configured in Task 4 (webhook controller)
- Webhook verify token must be random and secure (use crypto.randomBytes)

**Implementation Priority:**
1. **Critical:** Instagram Business Account setup (required for API access)
2. **Critical:** Facebook App creation (required for Instagram Product)
3. **Critical:** Access token generation (required for API calls)
4. **High:** Environment variable configuration (required for application)
5. **Medium:** Documentation (helpful for future reference)

---

## 🔗 Related Tasks

- [Task 4: Webhook Controller & Routes](./e-task-4-webhook-controller.md) - Will use webhook verify token
- [Task 5: Instagram Service Implementation](./e-task-5-instagram-service.md) - Will use access token
- [Task 3: Webhook Security & Verification Utilities](./e-task-3-webhook-security.md) - Will use App Secret for signature verification

---

**Last Updated:** 2026-01-21  
**Completed:** _Not yet completed_  
**Related Learning:** `docs/Learning/2026-01-21/l-task-1-instagram-setup.md` (to be created)  
**Pattern:** External service setup pattern  
**Reference:** [TASK_MANAGEMENT_GUIDE.md](../../task-management/TASK_MANAGEMENT_GUIDE.md)

---

**Version:** 2.1.0 (Planning vs execution boundary, global safety gates, cursor stop rules)
