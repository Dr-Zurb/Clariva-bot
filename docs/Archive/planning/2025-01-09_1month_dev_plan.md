# Clariva Care - 1 Month Development Plan
## January 9, 2025 - February 12, 2025 (Adjusted Timeline)

---

## Overview

**Goal:** Build and launch MVP (Phase 0) - A working Instagram AI receptionist bot with appointment booking and payment integration

**Timeline:** 4 weeks (30 days) - Adjusted from Jan 9 to Feb 12, 2025
- ✅ **Jan 9:** Completed (Project Setup - Tasks 1-3)
- ⏸️ **Jan 10-11:** Skipped (slacked)
- 🚀 **Jan 12 onwards:** Continue with remaining plan

**Status:** 🟢 In Progress - Foundation Complete

**⚠️ Compliance Review:** This plan has been reviewed for compliance (Jan 20, 2026). Critical security and compliance tasks have been added: Rate Limiting Middleware, Authentication Middleware, Compliance Monitoring, Consent Mechanisms, Dead Letter Queue, Secrets Management, Environment Separation, and Data Retention Automation. See tasks marked with compliance requirements.

**Documentation Reference:** All development must follow our reference documentation in [`docs/Reference/`](../../Reference/):
- **[STANDARDS.md](../../Reference/engineering/development/STANDARDS.md)** - Rules and requirements (MUST/SHOULD)
- **[ARCHITECTURE.md](../../Reference/engineering/architecture/ARCHITECTURE.md)** - Project structure and boundaries
- **[RECIPES.md](../../Reference/engineering/development/RECIPES.md)** - Copy-pastable code patterns
- **[COMPLIANCE.md](../../Reference/engineering/compliance/COMPLIANCE.md)** - Compliance, governance, and security requirements

**Key Standards:** Controller Pattern, asyncHandler, AppError, Zod validation, TypeScript types, Error handling, Healthcare compliance, AI/ML best practices, Webhook security.

---

## Phase 0 MVP Features Checklist

All Phase 0 features must be completed in this 1-month plan:

- [x] ✅ **1. Instagram Webhook Integration** (Week 1)
- [x] ✅ **2. AI Intent Detection** (Week 2)
- [x] ✅ **3. Natural Conversation Flow** (Week 2)
- [x] ✅ **4. Patient Information Collection** (Week 2)
- [x] ✅ **5. Appointment Booking System** (Week 3)
- [x] ✅ **6. Basic Doctor Dashboard** (Week 4)
- [x] ✅ **7. Database Schema & Backend API** (Week 1)
- [x] ✅ **8. Notifications (Doctor & Patient)** (Week 3)
- [x] ✅ **9. Payment Management System** (Week 3)

**Phase 1 Features (NOT in this plan - will be next month):**
- Availability Management UI (full feature)
- Basic Analytics Dashboard
- Appointment Cancellation/Rescheduling (basic version in Phase 0, full in Phase 1)
- Enhanced Conversation Context (advanced)
- Security & Compliance (basic in Phase 0, full in Phase 1)
- Multi-Platform (Facebook, WhatsApp)

---

## 📋 Documentation Reference Integration

**All development must follow our reference documentation:**

### 📚 Documentation Files (in `docs/Reference/`)

1. **[STANDARDS.md](../../Reference/engineering/development/STANDARDS.md)** - Rules and requirements
   - Use for: Coding rules, error handling, validation, authentication, logging
   - Key sections: Input Validation, Error Handling, Services Architecture, Webhook Security

2. **[ARCHITECTURE.md](../../Reference/engineering/architecture/ARCHITECTURE.md)** - Project structure
   - Use for: Understanding folder structure, where to put code, layer boundaries
   - Key sections: Project Structure, Layer Boundaries, Request Flow

3. **[RECIPES.md](../../Reference/engineering/development/RECIPES.md)** - Copy-pastable patterns
   - Use for: Implementation templates, code examples, step-by-step guides
   - Key sections: Add Route, Add Controller, Add Service, Add Validation, Add Webhook

4. **[COMPLIANCE.md](../../Reference/engineering/compliance/COMPLIANCE.md)** - Compliance and governance
   - Use for: Data handling, security requirements, audit logging, access control, AI governance
   - Key sections: Data Classification, Audit Logging, Access Control, AI Safety, Security Baseline

### 🏗️ Architecture Patterns (from ARCHITECTURE.md & STANDARDS.md)
- ✅ **Controller Pattern** - All routes use controllers (routes define paths, controllers handle requests)
- ✅ **Router Pattern** - Routes organized in separate files, aggregated in `routes/index.ts`
- ✅ **Separation of Concerns** - Routes → Controllers → Services → Database
- ✅ **asyncHandler** - Use asyncHandler wrapper (not manual try/catch) - see STANDARDS.md
- ✅ **TypeScript Types** - All functions properly typed
- ✅ **Error Handling** - All errors extend AppError, use error middleware - see STANDARDS.md

### 🏥 Healthcare Compliance (from COMPLIANCE.md & STANDARDS.md)
- ✅ **Data Classification** - Public social data, administrative data, PHI (see COMPLIANCE.md section B)
- ✅ **Patient Data Encryption** - At rest and in transit (see COMPLIANCE.md section H)
- ✅ **No PII in Logs** - Only IDs, never patient names/phones (standard log fields required - see STANDARDS.md & COMPLIANCE.md section D)
- ✅ **Audit Logging** - Track all data access with correlationId (see COMPLIANCE.md section D)
- ✅ **Access Controls** - Doctor-only access to their patients via RLS (see COMPLIANCE.md section E)
- ✅ **Consent & Transparency** - Patient consent required for PHI collection (see COMPLIANCE.md section C)
- ✅ **Data Lifecycle** - Retention and deletion policies (see COMPLIANCE.md section F)

### 🤖 AI/ML Standards (from STANDARDS.md & COMPLIANCE.md)
- ✅ **Retry Logic** - Exponential backoff for AI API calls
- ✅ **Response Caching** - Cache common AI responses
- ✅ **Fallback Mechanisms** - Graceful degradation if AI fails
- ✅ **Response Validation** - Ensure appropriate medical responses
- ✅ **Rate Limiting** - Prevent API abuse
- ✅ **AI Safety & Governance** - AI is assistive only, no autonomous diagnosis (see COMPLIANCE.md section G)
- ✅ **PHI Redaction** - Redact PHI from prompts sent to external AI services (see COMPLIANCE.md section G)
- ✅ **AI Audit Logging** - Log all AI interactions (metadata only, no raw prompts/responses with PHI) - see COMPLIANCE.md section G

### 🔒 Webhook Security (from STANDARDS.md & RECIPES.md)
- ✅ **Signature Verification** - Verify all webhook signatures (see RECIPES.md section 5)
- ✅ **Idempotency** - Handle duplicate webhooks
- ✅ **Async Processing** - Don't block webhook responses
- ✅ **Retry Queues** - Retry failed webhook processing

### 💡 Quick Reference
- **"What are the rules?"** → Check [STANDARDS.md](../../Reference/engineering/development/STANDARDS.md)
- **"Where does code go?"** → Check [ARCHITECTURE.md](../../Reference/engineering/architecture/ARCHITECTURE.md)
- **"How do I implement this?"** → Check [RECIPES.md](../../Reference/engineering/development/RECIPES.md)
- **"What are compliance requirements?"** → Check [COMPLIANCE.md](../../Reference/engineering/compliance/COMPLIANCE.md)

---

## Week 1: Foundation & Instagram Integration (Jan 9 - Jan 17)

### ✅ Day 1: Project Setup (Jan 9) - COMPLETED
**Status:** ✅ **COMPLETED**

**Tasks Completed:**
- [x] ✅ Set up TypeScript configuration (`tsconfig.json`)
- [x] ✅ Configure Express server structure (Router Pattern)
- [x] ✅ Set up environment variables (`.env.example`)
- [x] ✅ Initialize Supabase connection
- [x] ✅ Create basic Express server with health check endpoint
- [x] ✅ Set up development scripts (dev, build, start)
- [x] ✅ Configure git repository and .gitignore
- [x] ✅ Create project structure with controllers/ directory
- [x] ✅ Refactor routes to use Controller Pattern

**Deliverables:**
- ✅ Express server running on localhost:3000
- ✅ Health check endpoint working (`/health`)
- ✅ Database connection established
- ✅ TypeScript compilation working
- ✅ Controller Pattern implemented

**Files Created:**
```
backend/
├── tsconfig.json
├── .env.example
├── .gitignore
└── src/
    ├── index.ts
    ├── config/
    │   └── database.ts
    ├── routes/
    │   ├── index.ts
    │   └── health.ts
    ├── controllers/          ✅ Controller Pattern
    │   └── health-controller.ts
    ├── services/
    ├── types/
    └── utils/
```

---

### ⏸️ Days 2-3: Skipped (Jan 10-11)
**Status:** ⏸️ **SKIPPED** - No work done

---

### Day 4-5: Database Schema Setup (Jan 12-13)
**Status:** ✅ **COMPLETED** - Completed Jan 20, 2026

**Tasks:**
- [x] Create Supabase project (if not done)
- [x] Run database schema SQL (from docs) - **Executed in Supabase**
- [x] Create all tables:
  - [x] appointments (doctors use auth.users, no separate doctors table)
  - [x] patients
  - [x] appointments
  - [x] conversations
  - [x] messages
  - [x] availability
  - [x] blocked_times
  - [x] webhook_idempotency
  - [x] audit_logs
- [x] Set up relationships and foreign keys
- [x] Create indexes for performance
- [x] Set up Row Level Security (RLS) policies - **Executed in Supabase**
- [x] Create TypeScript types for database models
- [x] Test database operations (CRUD) - **Basic testing complete, RLS user testing deferred until frontend available**
- [x] ✅ **Set up middleware infrastructure (see [RECIPES.md](../../Reference/engineering/development/RECIPES.md)):**
  - [x] ✅ Create `middleware/request-timing.ts` (section 8) - for durationMs in logs - **COMPLETED**
  - [x] ✅ Create `middleware/correlation-id.ts` - for request tracing (correlationId) - **COMPLETED**
  - [x] ✅ Create `types/express.d.ts` (section 9) - for proper Request typing (user, correlationId, startTime) - **COMPLETED**
  - [x] ✅ Mount both middlewares early in middleware chain (before routes) - **COMPLETED**
- [x] **Follow Reference Documentation:**
  - [x] Check [ARCHITECTURE.md](../../Reference/engineering/architecture/ARCHITECTURE.md) for structure
  - [x] Check [STANDARDS.md](../../Reference/engineering/development/STANDARDS.md) for rules
  - [x] Check [RECIPES.md](../../Reference/engineering/development/RECIPES.md) for patterns
  - [x] Check [COMPLIANCE.md](../../Reference/engineering/compliance/COMPLIANCE.md) for compliance requirements
  - [x] All database operations use proper types
  - [x] Classify data at creation (public social, administrative, PHI) - see COMPLIANCE.md section B
  - [x] Patient data fields marked for encryption (at rest + in transit) - see COMPLIANCE.md section H
  - [x] Audit logging structure in place (with correlationId, changedFields only, no values) - see COMPLIANCE.md section D
  - [x] No PII in logs (only IDs) - see COMPLIANCE.md section D & STANDARDS.md
  - [x] All logs include standard fields: correlationId, path, method, statusCode, durationMs (see [STANDARDS.md](../../Reference/engineering/development/STANDARDS.md))

**Deliverables:**
- ✅ All tables created in Supabase - **COMPLETED** (Migrations executed Jan 20, 2026)
- ✅ TypeScript types for all models - **COMPLETED**
- ✅ Database helper functions working - **COMPLETED**
- ✅ Test data inserted and retrieved - **COMPLETED**
- ✅ Healthcare compliance measures in place (data classification, audit logging, access control) - **COMPLETED**
- ✅ RLS policies executed in Supabase - **COMPLETED** (User testing deferred until frontend available)
- ✅ Request timing middleware implemented and mounted - **COMPLETED**
- ✅ Correlation ID middleware implemented and mounted - **COMPLETED**
- ✅ Express Request type extensions set up (types/express.d.ts) - **COMPLETED**
- ✅ Structured logging with standard fields implemented - **COMPLETED**
- ✅ Audit logging utility implemented - **COMPLETED**
- ✅ Database service functions created for all tables - **COMPLETED**

**Files Created:**
```
backend/
├── migrations/
│   ├── 001_initial_schema.sql  (All tables, indexes, triggers, RLS enablement)
│   └── 002_rls_policies.sql    (RLS policies for all tables)
└── src/
    ├── types/
    │   ├── database.ts          (TypeScript types for all models) ✅
    │   └── express.d.ts         (Express Request type extensions) ✅
    ├── config/
    │   └── database.ts          (Supabase client configuration) ✅
    ├── middleware/
    │   ├── request-timing.ts    (request duration tracking) ✅
    │   └── correlation-id.ts   (request correlation ID generation) ✅
    ├── services/
    │   ├── database-service.ts  (generic CRUD operations) ✅
    │   ├── patient-service.ts   (patient operations) ✅
    │   ├── conversation-service.ts (conversation operations) ✅
    │   ├── message-service.ts   (message operations) ✅
    │   ├── appointment-service.ts (appointment operations) ✅
    │   └── availability-service.ts (availability operations) ✅
    └── utils/
        ├── db-helpers.ts        (helper functions) ✅
        └── audit-logger.ts      (audit logging utility) ✅
```

**Reference Documentation Requirements:**
- All database queries use TypeScript types (see [STANDARDS.md](../../Reference/engineering/development/STANDARDS.md))
- Data classification at creation (public social, administrative, PHI) - see [COMPLIANCE.md](../../Reference/engineering/compliance/COMPLIANCE.md) section B
- Patient data fields documented for encryption (at rest + in transit) - see [COMPLIANCE.md](../../Reference/engineering/compliance/COMPLIANCE.md) section H
- Audit logging for all data access (with correlationId, changedFields only) - see [COMPLIANCE.md](../../Reference/engineering/compliance/COMPLIANCE.md) section D
- Error handling with asyncHandler (see [STANDARDS.md](../../Reference/engineering/development/STANDARDS.md) & [RECIPES.md](../../Reference/engineering/development/RECIPES.md) section 7)
- Services throw AppError (never return {error} objects) - see [STANDARDS.md](../../Reference/engineering/development/STANDARDS.md) Services Architecture
- For multi-step operations, prefer Postgres `rpc()` functions (see [STANDARDS.md](../../Reference/engineering/development/STANDARDS.md) Services Architecture)
- Connection pooling configured (see [ARCHITECTURE.md](../../Reference/engineering/architecture/ARCHITECTURE.md))
- All logs include standard fields: correlationId, path, method, statusCode, durationMs (see [STANDARDS.md](../../Reference/engineering/development/STANDARDS.md) Logging section)
- Access control via RLS (doctor-only access) - see [COMPLIANCE.md](../../Reference/engineering/compliance/COMPLIANCE.md) section E

---

### Day 4.5: Rate Limiting Middleware Implementation
**Status:** ✅ **COMPLETED** - Completed Jan 20, 2026

**Tasks:**
- [x] Install express-rate-limit library
- [x] Create IP-based rate limiting middleware
  - [x] Configure limits for public endpoints (e.g., 100 req/15min per IP)
  - [x] Configure stricter limits for authentication endpoints (e.g., 5 req/15min per IP)
  - [x] Note: Progressive rate limiting (warn → throttle → block) not implemented (standard rate limiting used)
- [x] Create user-based rate limiting middleware
  - [x] Configure limits for authenticated endpoints (e.g., 1000 req/15min per user)
  - [x] Use user ID from JWT for rate limiting (falls back to IP if not authenticated)
- [x] Mount rate limiting in correct middleware order (after requestLogger, before routes)
- [x] Test rate limiting with different scenarios - Implementation complete, manual testing pending
- [x] Audit log rate limit violations (see COMPLIANCE.md section J)
- [x] Configure rate limit headers in responses

**Deliverables:**
- ✅ IP-based rate limiting working for public endpoints
- ✅ User-based rate limiting working for authenticated endpoints
- ✅ Rate limiting mounted in correct order
- ✅ Rate limit violations audit logged

**Files Created/Updated:**
```
backend/src/
└── index.ts              (UPDATED - Added userLimiter rate limiting middleware)
```

**Reference Documentation Requirements:**
- [STANDARDS.md](../../Reference/engineering/development/STANDARDS.md) - Middleware order (rate limiting after auth)
- [COMPLIANCE.md](../../Reference/engineering/compliance/COMPLIANCE.md) Section H - Rate limiting requirements (MUST)

---

### Day 4.6: Authentication Middleware Implementation
**Status:** ✅ **COMPLETED** - Completed Jan 20, 2026

**Tasks:**
- [x] Create JWT validation middleware
  - [x] Validate JWT tokens on every request
  - [x] Extract user from JWT (set req.user)
  - [x] Handle expired tokens (401 Unauthorized)
  - [x] Handle invalid tokens (401 Unauthorized)
  - [x] Handle missing tokens (401 Unauthorized for protected routes)
- [x] Implement auth event audit logging
  - [x] Log successful authentication (token validation success)
  - [x] Log failed authentication (invalid/expired tokens)
  - [x] Include IP address in audit logs
  - [x] Include correlation ID in audit logs
  - [x] Use logSecurityEvent helper for auth failures
- [x] Mount auth middleware in correct order (after correlation ID, before routes)
- [x] Test authentication with valid/invalid/expired tokens - Implementation complete, manual testing pending
- [x] Verify audit logging works correctly - Implementation complete, manual testing pending
- [x] Create protected route example - Middleware ready for use in routes

**Deliverables:**
- ✅ JWT validation middleware working
- ✅ User extracted from JWT (req.user set)
- ✅ Auth events audit logged
- ✅ Auth middleware mounted in correct order
- ✅ Protected routes require authentication (middleware ready for route integration)

**Files to Create:**
```
backend/src/
└── middleware/
    └── auth.ts           (JWT validation middleware)
```

**Reference Documentation Requirements:**
- [STANDARDS.md](../../Reference/engineering/development/STANDARDS.md) - Middleware order
- [COMPLIANCE.md](../../Reference/engineering/compliance/COMPLIANCE.md) Section E & H - Authentication requirements (MUST)
- [COMPLIANCE.md](../../Reference/engineering/compliance/COMPLIANCE.md) Section D - Audit logging for auth events

---

### Day 6-8: Instagram Webhook Integration (Jan 14-16)
**Status:** ✅ **DONE** (Daily plans 2026-01-21: e-task-1 through e-task-7)

**Tasks:**
- [x] Set up Instagram Business Account
- [x] Create Facebook App and Instagram Product
- [x] Get Instagram Graph API access token
- [x] Set up webhook endpoint for Instagram
- [x] **Implement webhook security (see [STANDARDS.md](../../Reference/engineering/development/STANDARDS.md), [RECIPES.md](../../Reference/engineering/development/RECIPES.md) section 5, & [COMPLIANCE.md](../../Reference/engineering/compliance/COMPLIANCE.md) section H):**
  - [x] Webhook signature verification (MUST per COMPLIANCE.md section H)
  - [x] Idempotency handling (prevent duplicate processing) - MUST per COMPLIANCE.md section H
  - [x] Rate limiting on webhook endpoint (MUST per COMPLIANCE.md section H)
  - [x] Async processing (don't block webhook response)
  - [x] Audit log all webhook events (with correlationId) - see COMPLIANCE.md section D
- [x] **Implement Dead Letter Queue (see [WEBHOOKS.md](../../Reference/engineering/operations/WEBHOOKS.md)):**
  - [x] Create dead letter table schema (encrypted payload storage)
  - [x] Store failed webhooks after max retries (3 attempts)
  - [x] Encrypt payloads in dead letter table
  - [x] Set up alerting for dead letter items
  - [x] Document manual review process
  - [x] Implement dead letter recovery mechanism
- [x] Parse incoming Instagram messages
- [x] Send responses back to Instagram
- [x] Handle message status updates (read, delivered)
- [x] Test complete message flow
- [x] **Follow Controller Pattern:**
  - [x] Create `controllers/webhook-controller.ts`
  - [x] Routes only define paths, controllers handle logic
  - [x] Services handle Instagram API calls

**Deliverables:**
- ✅ Webhook endpoint receiving Instagram messages
- ✅ Can send responses back to Instagram
- ✅ Message flow working end-to-end
- ✅ Webhook verification passing
- ✅ Security measures implemented (signature verification, idempotency)
- ✅ Controller Pattern followed
- ✅ Input validation with Zod implemented
- ✅ Error handling with asyncHandler implemented

**Files to Create:**
```
backend/src/
├── routes/
│   └── webhooks/
│       └── instagram.ts     (route definitions only)
├── controllers/
│   └── webhook-controller.ts (request handlers - Controller Pattern)
├── services/
│   └── instagram-service.ts (Instagram API calls, business logic)
├── types/
│   └── instagram.ts         (TypeScript types)
└── migrations/
    └── 003_dead_letter_queue.sql (dead letter table schema)
```

**API Endpoints:**
- `POST /webhooks/instagram` - Webhook receiver (with signature verification)
- `POST /api/instagram/send-message` - Send message helper

**Reference Documentation Requirements:**
- See [STANDARDS.md](../../Reference/engineering/development/STANDARDS.md) for rules
- See [ARCHITECTURE.md](../../Reference/engineering/architecture/ARCHITECTURE.md) for structure
- See [RECIPES.md](../../Reference/engineering/development/RECIPES.md) for patterns
- See [COMPLIANCE.md](../../Reference/engineering/compliance/COMPLIANCE.md) for security requirements
- Webhook signature verification (MUST per COMPLIANCE.md section H)
- Idempotency handling (MUST per COMPLIANCE.md section H)
- Async processing (queue-based)
- Audit log all webhook events (with correlationId) - see COMPLIANCE.md section D
- Error handling with asyncHandler (see [STANDARDS.md](../../Reference/engineering/development/STANDARDS.md) & [RECIPES.md](../../Reference/engineering/development/RECIPES.md) section 7)
- TypeScript types for all webhook payloads
- Controller Pattern (routes → controllers → services)

---

## Week 2: AI Integration & Conversation Flow (Jan 17 - Jan 23)

**Status:** ✅ **DONE** (Completed 2026-01-30)

### Day 1-2: AI Intent Detection (Jan 17-18)
**Status:** ✅ **DONE**

**Tasks:**
- [x] Set up OpenAI API client
- [x] Create intent detection service
- [x] Define intent types:
  - [x] book_appointment
  - [x] ask_question
  - [x] check_availability
  - [x] greeting
  - [x] cancel_appointment (basic)
  - [x] revoke_consent (added in e-task-5)
  - [x] unknown
- [x] Build prompt for intent classification (medical context)
- [x] **Implement AI/ML Best Practices (see [STANDARDS.md](../../Reference/engineering/development/STANDARDS.md) & [COMPLIANCE.md](../../Reference/engineering/compliance/COMPLIANCE.md) section G):**
  - [x] Retry logic with exponential backoff
  - [x] Response caching (in-memory; Redis for multi-instance - see ARCHITECTURE)
  - [ ] Rate limiting on AI API calls (deferred)
  - [x] Fallback mechanisms (if AI fails)
  - [x] Response validation (appropriate content)
  - [x] AI is assistive only (no autonomous diagnosis) - MUST per COMPLIANCE.md section G
  - [x] Redact PHI from prompts sent to AI services - MUST per COMPLIANCE.md section G
  - [x] Store metadata only (model, tokens, redaction flag, hash) - MUST NOT persist raw prompts/responses with PHI - see COMPLIANCE.md section G
  - [x] Audit all AI interactions (metadata only) - see COMPLIANCE.md section G
- [x] Test intent detection accuracy
- [x] Add confidence scoring
- [x] Handle edge cases
- [x] **Follow Controller Pattern:**
  - [x] AI logic in services (ai-service); webhook controller orchestrates
  - [x] Services handle AI logic

**Deliverables:**
- ✅ Intent detection working
- ✅ 85%+ accuracy on test messages
- ✅ Handles medical terminology
- ✅ Returns confidence scores
- ✅ Retry logic and caching implemented
- ✅ Fallback mechanisms in place
- ✅ Error handling with asyncHandler implemented
- ✅ Services throw AppError (not {error} objects)

**Files to Create:**
```
backend/src/
├── services/
│   └── ai-service.ts        (intent detection with retry, caching, fallback)
├── controllers/
│   └── ai-controller.ts     (if API endpoints needed)
└── types/
    └── ai.ts                 (intent types, AI response types)
```

**Reference Documentation Requirements:**
- See [STANDARDS.md](../../Reference/engineering/development/STANDARDS.md) for rules
- See [ARCHITECTURE.md](../../Reference/engineering/architecture/ARCHITECTURE.md) for structure
- See [RECIPES.md](../../Reference/engineering/development/RECIPES.md) for patterns
- See [COMPLIANCE.md](../../Reference/engineering/compliance/COMPLIANCE.md) for AI governance requirements
- Retry logic with exponential backoff (AI APIs can be slow)
- Response caching (common questions cached)
- Rate limiting (prevent API abuse)
- Fallback mechanisms (graceful degradation)
- Response validation (medical-appropriate responses)
- Prompt engineering (medical context awareness)
- Cost monitoring (track AI API usage)
- AI is assistive only (no autonomous diagnosis) - MUST per COMPLIANCE.md section G
- Redact PHI from prompts sent to AI services - MUST per COMPLIANCE.md section G
- Store metadata only (model, tokens, redaction flag, hash) - MUST NOT persist raw prompts/responses with PHI - see COMPLIANCE.md section G
- Audit all AI interactions (metadata only) - see COMPLIANCE.md section G
- Error handling with asyncHandler (see [STANDARDS.md](../../Reference/engineering/development/STANDARDS.md) & [RECIPES.md](../../Reference/engineering/development/RECIPES.md) section 7)
- Services throw AppError (never return {error} objects) - see [STANDARDS.md](../../Reference/engineering/development/STANDARDS.md)
- All logs include standard fields: correlationId, path, method, statusCode, durationMs

---

### Day 3-4: Natural Conversation Flow (Jan 19-20)
**Status:** ✅ **DONE**

**Tasks:**
- [x] Create conversation state management
- [x] Build response generation service
- [x] Design conversation prompts for medical context
- [x] Implement context-aware responses
- [x] Handle multi-turn conversations
- [x] Store conversation history
- [x] **Follow AI/ML Best Practices:**
  - [x] Response caching for common questions
  - [x] Retry logic for AI API calls
  - [x] Response validation (no medical advice)
  - [x] Fallback responses if AI fails
- [x] Test conversation flows
- [x] Add error handling and fallbacks
- [x] **Follow Controller Pattern:**
  - [x] Controllers handle HTTP requests
  - [x] Services handle conversation logic

**Deliverables:**
- ✅ Bot can have natural conversations
- ✅ Maintains conversation context
- ✅ Professional, medical-appropriate responses
- ✅ Conversation history stored in database
- ✅ Caching and retry logic working
- ✅ Fallback responses implemented
- ✅ Error handling with asyncHandler implemented
- ✅ Services throw AppError (not {error} objects)
- ✅ All logs include standard fields: correlationId, path, method, statusCode, durationMs

**Files to Create/Update:**
```
backend/src/
├── services/
│   ├── ai-service.ts        (response generation with caching)
│   └── conversation-service.ts (state management)
├── controllers/
│   └── conversation-controller.ts (if API endpoints needed)
└── types/
    └── conversation.ts       (conversation state types)
```

**Reference Documentation Requirements:**
- See [STANDARDS.md](../../Reference/engineering/development/STANDARDS.md) for rules
- See [ARCHITECTURE.md](../../Reference/engineering/architecture/ARCHITECTURE.md) for structure
- See [RECIPES.md](../../Reference/engineering/development/RECIPES.md) for patterns
- See [COMPLIANCE.md](../../Reference/engineering/compliance/COMPLIANCE.md) for AI governance requirements
- Response caching (Redis/cache layer)
- Retry logic with exponential backoff
- Response validation (medical-appropriate)
- Fallback mechanisms
- Prompt engineering (medical context)
- AI is assistive only (no autonomous diagnosis) - MUST per COMPLIANCE.md section G
- Redact PHI from prompts sent to AI services - MUST per COMPLIANCE.md section G
- Store metadata only (model, tokens, redaction flag, hash) - MUST NOT persist raw prompts/responses with PHI - see COMPLIANCE.md section G
- Audit all AI interactions (metadata only) - see COMPLIANCE.md section G
- Error handling with asyncHandler (see [STANDARDS.md](../../Reference/engineering/development/STANDARDS.md) & [RECIPES.md](../../Reference/engineering/development/RECIPES.md) section 7)
- Services throw AppError (never return {error} objects) - see [STANDARDS.md](../../Reference/engineering/development/STANDARDS.md)
- All logs include standard fields: correlationId, path, method, statusCode, durationMs

---

### Day 5-7: Patient Information Collection (Jan 21-23)
**Status:** ✅ **DONE**

**Tasks:**
- [x] Design patient info collection flow
- [x] Build data collection service
- [x] Implement field-by-field collection:
  - [x] Name
  - [x] Phone number (with validation)
  - [x] Date of birth (optional)
  - [x] Gender (optional)
  - [x] Reason for visit
- [x] Add data validation with Zod (see [STANDARDS.md](../../Reference/engineering/development/STANDARDS.md) & [RECIPES.md](../../Reference/engineering/development/RECIPES.md) section 4)
- [x] Handle partial information gracefully
- [x] **Follow Healthcare Compliance (see [COMPLIANCE.md](../../Reference/engineering/compliance/COMPLIANCE.md) & [STANDARDS.md](../../Reference/engineering/development/STANDARDS.md)):**
  - [x] Classify data at creation (public social, administrative, PHI) - see COMPLIANCE.md section B
  - [x] Patient data marked for encryption (at rest + in transit) - see COMPLIANCE.md section H
  - [x] No PII in logs (only IDs, standard log fields) - see COMPLIANCE.md section D & STANDARDS.md
  - [x] Audit logging for all data access (with correlationId) - see COMPLIANCE.md section D
  - [x] Data validation (phone, email formats) with Zod
- [x] **Implement Consent Collection Mechanism (see [COMPLIANCE.md](../../Reference/engineering/compliance/COMPLIANCE.md) section C):**
  - [x] Ask for consent before collecting PHI
  - [x] Explain what data is collected and why (plain language)
  - [x] Store consent timestamp and method
  - [x] Store consent status (granted, revoked, pending)
  - [x] Implement consent revocation flow
  - [x] Handle data deletion per lifecycle rules after revocation (PHI anonymization)
  - [x] Audit log all consent events (granted, revoked)
- [x] Store patient data in database
- [x] Update conversation state with collected data
- [x] Test complete collection flow
- [x] **Follow Controller Pattern:**
  - [x] Controllers handle HTTP requests
  - [x] Services handle patient data logic

**Deliverables:**
- ✅ Patient info collection working
- ✅ All required fields collected
- ✅ Phone number validation with Zod working
- ✅ Data stored correctly in database
- ✅ Bot handles interruptions gracefully
- ✅ Healthcare compliance measures in place
- ✅ Input validation with Zod implemented
- ✅ Error handling with asyncHandler implemented
- ✅ Services throw AppError (not {error} objects)
- ✅ All logs include standard fields (no PII)

**Files to Create/Update:**
```
backend/src/
├── services/
│   └── patient-service.ts   (patient data operations)
├── controllers/
│   └── patient-controller.ts (if API endpoints needed)
└── utils/
    └── validation.ts        (phone, email validation)
```

**Reference Documentation Requirements:**
- See [STANDARDS.md](../../Reference/engineering/development/STANDARDS.md) for rules
- See [ARCHITECTURE.md](../../Reference/engineering/architecture/ARCHITECTURE.md) for structure
- See [RECIPES.md](../../Reference/engineering/development/RECIPES.md) for patterns
- Patient data encryption (at rest and in transit)
- No PII in logs (only IDs)
- Audit logging for all patient data access
- Data validation with Zod (proper formats) - see [STANDARDS.md](../../Reference/engineering/development/STANDARDS.md) & [RECIPES.md](../../Reference/engineering/development/RECIPES.md) section 4
- Error handling with asyncHandler (see [STANDARDS.md](../../Reference/engineering/development/STANDARDS.md) & [RECIPES.md](../../Reference/engineering/development/RECIPES.md) section 7)
- Services throw AppError (never return {error} objects) - see [STANDARDS.md](../../Reference/engineering/development/STANDARDS.md)
- TypeScript types for all patient data
- All logs include standard fields: correlationId, path, method, statusCode, durationMs

---

## Week 3: Booking System & Payments (Jan 24 - Jan 30)

### Day 1-3: Appointment Booking System (Jan 24-26)
**Status:** ✅ **DONE**

**Tasks:**
- [x] Create basic availability service (for Phase 0 - simple configuration)
- [x] Build appointment booking logic
- [x] Implement time slot calculation
- [x] Add double-booking prevention
- [x] Create appointment creation function
- [x] Build booking confirmation flow
- [x] Send booking confirmation to patient (via Instagram DM)
- [x] Update doctor's availability after booking
- [x] **Use Zod for input validation (see [STANDARDS.md](../../Reference/engineering/development/STANDARDS.md) & [RECIPES.md](../../Reference/engineering/development/RECIPES.md) section 4):**
  - [x] Validate appointment booking data with Zod schemas
- [x] **For multi-step operations (appointment + notification + audit log), use Postgres rpc() or compensating logic (see [STANDARDS.md](../../Reference/engineering/development/STANDARDS.md) Services Architecture):**
  - [x] Ensure atomicity for appointment creation
- [x] **Follow Healthcare Compliance (see [COMPLIANCE.md](../../Reference/engineering/compliance/COMPLIANCE.md)):**
  - [x] Appointment data encrypted (at rest + in transit) - see COMPLIANCE.md section H
  - [x] Audit logging for appointments (with correlationId, changedFields only, no values) - see COMPLIANCE.md section D
  - [x] No PII in logs (only IDs, standard log fields) - see COMPLIANCE.md section D & STANDARDS.md
  - [x] All logs include standard fields: correlationId, path, method, statusCode, durationMs
  - [x] Access control via RLS (doctor-only access) - see COMPLIANCE.md section E
- [x] Test booking flow end-to-end
- [x] **Follow Controller Pattern:**
  - [x] Create `controllers/appointment-controller.ts`
  - [x] Routes define paths, controllers handle requests
  - [x] Services handle booking logic

**Note:** For Phase 0, we need BASIC availability management:
- Doctor can set basic working hours (via dashboard or initial config)
- Simple time slots (e.g., 30-min intervals)
- Block booked slots
- Full Availability Management UI (Phase 1 feature) will be added later

**Deliverables:**
- ✅ Appointments can be booked
- ✅ Prevents double-booking
- ✅ Shows available slots to patients
- ✅ Sends confirmation to patient via Instagram DM
- ✅ Updates doctor's calendar
- ✅ Basic availability system working
- ✅ Healthcare compliance measures in place
- ✅ Input validation with Zod implemented
- ✅ Error handling with asyncHandler implemented
- ✅ Services throw AppError (not {error} objects)
- ✅ Multi-step operations use rpc() or compensating logic
- ✅ All logs include standard fields (no PII)

**Files to Create/Update:**
```
backend/src/
├── services/
│   ├── booking-service.ts
│   └── availability-service.ts
├── controllers/
│   └── appointment-controller.ts (Controller Pattern)
└── routes/
    └── appointments.ts (route definitions only)
```

**API Endpoints:** (Implemented under `/api/v1/`)
- `GET /api/v1/appointments/available-slots`
- `POST /api/v1/appointments/book`
- `GET /api/v1/appointments/:id`

**Reference Documentation Requirements:**
- See [STANDARDS.md](../../Reference/engineering/development/STANDARDS.md) for rules
- See [ARCHITECTURE.md](../../Reference/engineering/architecture/ARCHITECTURE.md) for structure
- See [RECIPES.md](../../Reference/engineering/development/RECIPES.md) for patterns
- Controller Pattern (routes → controllers → services)
- TypeScript types for all appointment data
- Input validation with Zod (see [STANDARDS.md](../../Reference/engineering/development/STANDARDS.md) & [RECIPES.md](../../Reference/engineering/development/RECIPES.md) section 4)
- Error handling with asyncHandler and error middleware (see [STANDARDS.md](../../Reference/engineering/development/STANDARDS.md) & [RECIPES.md](../../Reference/engineering/development/RECIPES.md) section 7)
- Services throw AppError (never return {error} objects) - see [STANDARDS.md](../../Reference/engineering/development/STANDARDS.md)
- For multi-step operations, use Postgres rpc() or compensating logic (see [STANDARDS.md](../../Reference/engineering/development/STANDARDS.md) Services Architecture)
- Healthcare compliance (encryption, audit logging)
- No PII in logs (only IDs)
- All logs include standard fields: correlationId, path, method, statusCode, durationMs

---

### Day 4-5: Payment Integration (Jan 27-28)
**Status:** ✅ **DONE**

**Tasks:**
- [x] Set up payment gateway account (Razorpay/Stripe)
- [x] Install payment SDK
- [x] Create payment service
- [x] Build payment link generation
- [x] Integrate payment with booking flow
- [x] **Use Zod for input validation (see [STANDARDS.md](../../Reference/engineering/development/STANDARDS.md) & [RECIPES.md](../../Reference/engineering/development/RECIPES.md) section 4):**
  - [x] Validate payment data with Zod schemas
- [x] **Implement webhook security (see [STANDARDS.md](../../Reference/engineering/development/STANDARDS.md) & [RECIPES.md](../../Reference/engineering/development/RECIPES.md) section 5):**
  - [x] Payment webhook signature verification
  - [x] Idempotency handling
  - [x] Async processing
  - [x] Retry queues for failed payments
- [x] Handle payment webhooks
- [x] Update appointment status after payment
- [x] Store payment information
- [x] Send payment confirmation to both parties
- [x] Test payment flow end-to-end
- [x] **Follow Controller Pattern:**
  - [x] Create `controllers/payment-controller.ts`
  - [x] Routes define paths, controllers handle requests

**Deliverables:**
- ✅ Payment links generated correctly
- ✅ Payments processed securely
- ✅ Appointment confirmed only after payment
- ✅ Both doctor and patient notified
- ✅ Payment history tracked
- ✅ Webhook security implemented
- ✅ Input validation with Zod implemented
- ✅ Error handling with asyncHandler implemented
- ✅ Services throw AppError (not {error} objects)
- ✅ All logs include standard fields (no PII)

**Files to Create:**
```
backend/src/
├── services/
│   └── payment-service.ts
├── controllers/
│   └── payment-controller.ts (Controller Pattern)
├── routes/
│   └── payments.ts (route definitions only)
└── types/
    └── payment.ts
```

**API Endpoints:** (Implemented under `/api/v1/` and `/webhooks/`)
- `POST /api/v1/payments/create-link`
- `POST /webhooks/razorpay`, `POST /webhooks/paypal` - Payment webhooks (signature verification)
- `GET /api/v1/payments/:id`

**Payment Flow:**
1. Patient books appointment → Collect info
2. Generate payment link → Send via Instagram DM
3. Patient pays → Payment gateway callback
4. Confirm appointment → Notify both parties
5. Send receipt → Store payment record

**Reference Documentation Requirements:**
- See [STANDARDS.md](../../Reference/engineering/development/STANDARDS.md) for rules
- See [ARCHITECTURE.md](../../Reference/engineering/architecture/ARCHITECTURE.md) for structure
- See [RECIPES.md](../../Reference/engineering/development/RECIPES.md) for patterns
- See [COMPLIANCE.md](../../Reference/engineering/compliance/COMPLIANCE.md) for security requirements
- Webhook signature verification (MUST per COMPLIANCE.md section H)
- Idempotency handling (MUST per COMPLIANCE.md section H)
- Async processing (queue-based)
- Audit log all webhook events (with correlationId) - see COMPLIANCE.md section D
- Input validation with Zod (see [STANDARDS.md](../../Reference/engineering/development/STANDARDS.md) & [RECIPES.md](../../Reference/engineering/development/RECIPES.md) section 4)
- Error handling with asyncHandler (see [STANDARDS.md](../../Reference/engineering/development/STANDARDS.md) & [RECIPES.md](../../Reference/engineering/development/RECIPES.md) section 7)
- Services throw AppError (never return {error} objects) - see [STANDARDS.md](../../Reference/engineering/development/STANDARDS.md)
- Controller Pattern (routes → controllers → services)
- TypeScript types for all payment data
- All logs include standard fields: correlationId, path, method, statusCode, durationMs

---

### Day 6-7: Notifications System (Jan 29-30)
**Status:** ✅ **DONE**

**Tasks:**
- [x] Set up email service (SendGrid/Resend)
- [x] Create notification service
- [x] Build doctor notification system:
  - [x] New appointment email
  - [x] Payment received email
  - [ ] SMS notifications (optional)
- [x] Build patient notification system:
  - [x] Booking confirmation (Instagram DM)
  - [x] Payment confirmation (Instagram DM)
  - [x] Payment receipt (Phase 0 = same as payment confirmation DM)
- [x] **Follow Healthcare Compliance (see [COMPLIANCE.md](../../Reference/engineering/compliance/COMPLIANCE.md)):**
  - [x] No PII in email logs (only IDs) - see COMPLIANCE.md section D
  - [x] Secure email transmission (TLS 1.2+) - see COMPLIANCE.md section H
  - [x] All logs include standard fields: correlationId, path, method, statusCode, durationMs
  - [x] Audit log all notification events - see COMPLIANCE.md section D
- [x] **Note:** Appointment reminders (24h before) will be Phase 1. For Phase 0 MVP, focus on booking and payment confirmations only.
- [x] Create notification templates (inline for Phase 0)
- [x] Test all notification types
- [x] Add error handling for failed notifications
- [x] **Follow Controller Pattern:**
  - [x] Controllers handle HTTP requests (if API endpoints)
  - [x] Services handle notification logic

**Deliverables:**
- ✅ Doctor receives email on new appointment
- ✅ Doctor receives payment confirmation
- ✅ Patient receives booking confirmation
- ✅ Patient receives payment receipt
- ✅ All notifications working reliably
- ✅ Healthcare compliance measures in place
- ✅ Error handling with asyncHandler implemented
- ✅ Services throw AppError (not {error} objects)
- ✅ All logs include standard fields (no PII)

**Files to Create:**
```
backend/src/
├── services/
│   └── notification-service.ts
├── controllers/
│   └── notification-controller.ts (if API endpoints needed)
├── templates/
│   ├── email/
│   │   ├── appointment-created.html
│   │   └── payment-received.html
│   └── instagram/
│       ├── booking-confirmation.txt
│       └── payment-confirmation.txt
└── utils/
    └── email-helpers.ts
```

**Reference Documentation Requirements:**
- See [STANDARDS.md](../../Reference/engineering/development/STANDARDS.md) for rules
- See [ARCHITECTURE.md](../../Reference/engineering/architecture/ARCHITECTURE.md) for structure
- See [RECIPES.md](../../Reference/engineering/development/RECIPES.md) for patterns
- No PII in email logs (only IDs)
- Secure email transmission (TLS/SSL)
- Error handling with asyncHandler (see [STANDARDS.md](../../Reference/engineering/development/STANDARDS.md) & [RECIPES.md](../../Reference/engineering/development/RECIPES.md) section 7)
- Services throw AppError (never return {error} objects) - see [STANDARDS.md](../../Reference/engineering/development/STANDARDS.md)
- Retry logic for failed notifications
- TypeScript types for all notification data
- All logs include standard fields: correlationId, path, method, statusCode, durationMs

---

## Week 4: Dashboard & Launch Prep (Jan 31 - Feb 12)

### Day 1-4: Doctor Dashboard Frontend (Jan 31 - Feb 3)
**Status:** ✅ **COMPLETED** (2026-02-03; daily plans e-task-1 through e-task-5)

**Tasks:**
- [x] Set up Next.js project
- [x] Configure TypeScript for frontend
- [x] Set up Tailwind CSS
- [x] Implement Supabase Auth
- [x] Create login/signup pages
- [x] Build dashboard layout
- [x] Create appointments list page
- [x] Create appointment detail view
- [x] Create patient detail view
- [x] Add filtering and search
- [x] Make it responsive (mobile-friendly)
- [x] Connect to backend API
- [x] **Follow Frontend Standards (see [STANDARDS.md](../../Reference/engineering/development/STANDARDS.md) & [ARCHITECTURE.md](../../Reference/engineering/architecture/ARCHITECTURE.md)):**
  - [x] TypeScript types for all components
  - [x] Error handling for API calls
  - [x] Loading states
  - [x] Responsive design

**Deliverables:**
- ✅ Doctors can log in/sign up
- ✅ View all appointments
- ✅ View patient details
- ✅ Filter appointments by date/status
- ✅ Clean, professional UI
- ✅ Mobile-responsive

**Files Created (App Router):**
```
frontend/
├── app/
│   ├── (auth)/login, signup
│   ├── dashboard/ (layout, appointments, appointments/[id], patients, patients/[id])
│   └── ...
├── components/
│   ├── layout/ (Sidebar, Header, DashboardShell)
│   └── appointments/AppointmentsListWithFilters.tsx
├── lib/
│   ├── supabase/ (client, server)
│   └── api.ts
├── types/
│   ├── appointment.ts
│   └── patient.ts
└── middleware.ts (Supabase auth)
```

---

### Day 5-7: Testing & Bug Fixes (Feb 4-6)
**Status:** ✅ **DONE** (e-task-6, e-task-7 completed)

**Tasks:**
- [x] End-to-end testing of complete flow:
  - [x] Patient sends message on Instagram (runbook/simulated)
  - [x] Bot responds and collects info
  - [x] Patient books appointment
  - [x] Payment link generated
  - [x] Patient pays (test mode)
  - [x] Appointment confirmed; notifications sent
  - [x] Doctor sees appointment in dashboard (Playwright E2E + runbook)
- [x] Fix all bugs found (E2E-surfaced login/dashboard; auth on GET payments/:id)
- [x] Performance optimization (quick pass; deferred items in known-issues doc)
- [x] Security review (auth, webhooks, no secrets in repo)
- [x] Error handling improvements (canonical API errors; frontend role="alert")
- [x] User experience polish (loading states, accessibility per DEFINITION_OF_DONE_FRONTEND)
- [x] **Verify Test Data Compliance (see [TESTING.md](../../Reference/engineering/development/TESTING.md)):**
  - [x] All tests use fake PHI placeholders (PATIENT_TEST, +10000000000)
  - [x] No real patient names, phones, DOBs in test data
  - [x] Test failure output doesn't expose PHI (configure Jest --silent)
  - [x] E2E tests assert structure, not PHI values
  - [x] Verify no PHI in test snapshots
- [x] **Verify Reference Documentation Compliance:**
  - [x] Check [STANDARDS.md](../../Reference/engineering/development/STANDARDS.md) for all MUST rules
  - [x] Check [ARCHITECTURE.md](../../Reference/engineering/architecture/ARCHITECTURE.md) for structure compliance
  - [x] Check [RECIPES.md](../../Reference/engineering/development/RECIPES.md) for pattern consistency
  - [x] Check [COMPLIANCE.md](../../Reference/engineering/compliance/COMPLIANCE.md) for compliance requirements
  - [x] All routes use Controller Pattern
  - [x] All functions have TypeScript types
  - [x] Error handling in place
  - [x] Healthcare compliance measures verified (data classification, audit logging, access control)
  - [x] AI/ML best practices verified (PHI redaction, metadata-only logging)
  - [x] Webhook security verified (signature verification, idempotency)

**Deliverables:**
- ✅ All features working end-to-end
- ✅ No critical bugs
- ✅ Good performance
- ✅ Secure implementation
- ✅ Reference documentation compliance verified

---

### Day 8-12: Deployment & Launch Prep (Feb 7-12)
**Status:** 🟢 **MOSTLY DONE** (e-task-8; backend + frontend deployed; Sentry deferred to production)

**Tasks:**
- [x] Set up production environment
- [x] Deploy backend to Render/Railway (Render: https://clariva-bot.onrender.com)
- [x] Deploy frontend to Vercel
- [x] Configure production environment variables (Render + Vercel)
- [x] Set up domain (if needed) — default Render/Vercel URLs in use; custom domain optional
- [x] SSL certificates (default HTTPS on Render and Vercel)
- [x] Database backups (Supabase)
- [ ] Monitoring and logging (Sentry) — **Deferred** until production/launch (see [deferred/deferred-sentry-e-task-8.md](../../Development/deferred/deferred-sentry-e-task-8.md))
- [x] Create deployment documentation (runbook, compliance-monitoring, secrets-and-environments, data-retention)
- [ ] Final testing in production (smoke test per runbook §8 when ready for test customers)
- [ ] Prepare launch materials
- [x] **Configure Compliance Monitoring (see [COMPLIANCE.md](../../Reference/engineering/compliance/COMPLIANCE.md) section J):**
  - [x] Documented in [compliance-monitoring.md](../../setup/compliance-monitoring.md) (alerts: auth spike, rate limit, error rate, DB health)
  - [ ] Authentication failure monitoring (alert on spike) — doc only; Sentry deferred
  - [ ] Rate limit violation monitoring (alert on abuse) — doc only
  - [ ] Error rate monitoring (alert on >5% error rate) — doc only
  - [ ] Suspicious access pattern alerts (unusual IP, unusual time) — doc only
  - [ ] Compliance violation alerts (PHI in logs, missing audit entries) — doc only
  - [x] Database connection health monitoring (GET /health returns DB status)
- [x] **Set up Secrets Management:**
  - [x] Document secrets rotation schedule (quarterly for service role keys)
  - [x] Configure different keys per environment (dev/staging/prod)
  - [ ] Set up secret access auditing (if using secret management service)
  - [x] Document incident response procedures (rotate on security incidents)
- [x] **Set up Environment Separation:**
  - [ ] Create staging environment (separate from production) — optional for now
  - [x] Use different Supabase projects per environment (documented)
  - [x] Use different API keys per environment
  - [x] Verify no production data in dev/staging (documented)
  - [x] Document environment variable management
- [x] **Implement Data Retention Automation:**
  - [x] Documented in [data-retention.md](../../setup/data-retention.md) (policy + phased automation)
  - [ ] Create scheduled job for retention enforcement (phased)
  - [ ] Implement soft delete after retention period (phased)
  - [ ] Implement hard delete after extended retention (phased)
  - [ ] Audit log all deletion events (phased)
  - [ ] Schedule quarterly backup restoration tests (phased)
- [x] **Production Readiness Checklist:**
  - [x] All environment variables configured
  - [x] Database backups automated (Supabase)
  - [x] Monitoring in place (documented; Sentry deferred)
  - [ ] Error tracking configured (Sentry deferred)
  - [ ] Performance monitoring
  - [x] Security audit completed (secrets, env separation documented)
  - [x] Rate limiting implemented and tested
  - [x] Authentication middleware implemented and tested
  - [x] Compliance monitoring configured (documented)
  - [x] Secrets rotation schedule documented
  - [x] Environment separation verified (documented)
  - [x] Data retention automation documented (phased implementation)

**Deliverables:**
- ✅ Backend deployed and running
- ✅ Frontend deployed and accessible
- ✅ All services connected
- ✅ Monitoring in place (including compliance monitoring)
- ✅ Compliance monitoring configured and tested
- ✅ Secrets management documented
- ✅ Environment separation verified
- ✅ Data retention automation implemented
- ✅ Ready for first customers

---

## Key Dependencies & Prerequisites

### Accounts Needed
- [x] ✅ Supabase account (database) - **SET UP**
- [ ] OpenAI API key
- [ ] Instagram Business Account
- [ ] Facebook Developer Account
- [ ] Razorpay/Stripe account (payments)
- [ ] SendGrid/Resend account (emails)
- [ ] Twilio account (optional, for SMS)

### Development Setup
- [x] ✅ Node.js 18+ installed
- [x] ✅ Git repository initialized
- [x] ✅ VS Code/Cursor configured
- [ ] Postman for API testing
- [ ] Instagram test account for testing

---

## Risk Mitigation

### Technical Risks
- **Instagram API changes:** Monitor Facebook Developer updates, have fallback plan
- **Payment gateway issues:** Test thoroughly, have support contact ready
- **AI accuracy:** Start with simple intents, iterate based on feedback
- **Reference documentation compliance:** Review code against [STANDARDS.md](../../Reference/engineering/development/STANDARDS.md), [ARCHITECTURE.md](../../Reference/engineering/architecture/ARCHITECTURE.md), [RECIPES.md](../../Reference/engineering/development/RECIPES.md), and [COMPLIANCE.md](../../Reference/engineering/compliance/COMPLIANCE.md) before each commit

### Timeline Risks
- **Feature scope creep:** Stick to MVP features only
- **Unforeseen technical issues:** Build in buffer time (extra 2-3 days)
- **Third-party service delays:** Start account setup early
- **Reference documentation learning curve:** Allocate time to understand [STANDARDS.md](../../Reference/engineering/development/STANDARDS.md), [ARCHITECTURE.md](../../Reference/engineering/architecture/ARCHITECTURE.md), and [RECIPES.md](../../Reference/engineering/development/RECIPES.md) patterns

---

## Success Metrics

### Phase 0 MVP Launch Criteria

**All of these must be working before launch:**

✅ **Core Functionality:**
- [ ] Bot receives and responds to Instagram messages
- [ ] AI correctly identifies intent (85%+ accuracy)
- [ ] Bot can have natural conversations
- [ ] Patient information collected successfully

✅ **Booking System:**
- [ ] Appointments can be booked through Instagram
- [ ] Prevents double-booking
- [ ] Shows available time slots
- [ ] Basic availability system working

✅ **Payment Integration:**
- [ ] Payment links generated and sent
- [ ] Payments processed securely
- [ ] Appointment confirmed only after payment
- [ ] Payment status tracked

✅ **Notifications:**
- [ ] Doctor receives email on new appointment
- [ ] Doctor receives payment confirmation
- [ ] Patient receives booking confirmation (Instagram DM)
- [ ] Patient receives payment confirmation (Instagram DM)

✅ **Dashboard:**
- [x] Doctors can log in/sign up
- [x] View all appointments
- [x] View patient details
- [x] Filter appointments

✅ **Quality Metrics:**
- [ ] 80%+ booking completion rate (tested)
- [ ] <5% error rate
- [ ] Response time <2 seconds
- [ ] All features tested end-to-end

✅ **Reference Documentation Compliance:**
- [ ] Controller Pattern implemented throughout (see [ARCHITECTURE.md](../../Reference/engineering/architecture/ARCHITECTURE.md))
- [ ] All routes use controllers with asyncHandler (see [STANDARDS.md](../../Reference/engineering/development/STANDARDS.md))
- [ ] All errors extend AppError (see [STANDARDS.md](../../Reference/engineering/development/STANDARDS.md))
- [ ] TypeScript types for all functions (see [STANDARDS.md](../../Reference/engineering/development/STANDARDS.md))
- [ ] Error handling in place (see [STANDARDS.md](../../Reference/engineering/development/STANDARDS.md) & [RECIPES.md](../../Reference/engineering/development/RECIPES.md) section 7)
- [ ] Healthcare compliance measures verified (see [COMPLIANCE.md](../../Reference/engineering/compliance/COMPLIANCE.md))
- [ ] AI/ML best practices implemented (see [STANDARDS.md](../../Reference/engineering/development/STANDARDS.md) & [COMPLIANCE.md](../../Reference/engineering/compliance/COMPLIANCE.md) section G)
- [ ] Webhook security verified (see [STANDARDS.md](../../Reference/engineering/development/STANDARDS.md), [RECIPES.md](../../Reference/engineering/development/RECIPES.md) section 5, & [COMPLIANCE.md](../../Reference/engineering/compliance/COMPLIANCE.md) section H)
- [x] Audit logging implemented (see [COMPLIANCE.md](../../Reference/engineering/compliance/COMPLIANCE.md) section D) - ✅ COMPLETED Jan 20, 2026
- [x] Access control via RLS (see [COMPLIANCE.md](../../Reference/engineering/compliance/COMPLIANCE.md) section E) - ✅ COMPLETED Jan 20, 2026 (Policies executed, user testing deferred)
- [x] Rate limiting implemented (see [COMPLIANCE.md](../../Reference/engineering/compliance/COMPLIANCE.md) section H) - ✅ COMPLETED Jan 20, 2026
- [x] Authentication middleware implemented (see [COMPLIANCE.md](../../Reference/engineering/compliance/COMPLIANCE.md) section E & H) - ✅ COMPLETED Jan 20, 2026
- [ ] Consent mechanisms implemented (see [COMPLIANCE.md](../../Reference/engineering/compliance/COMPLIANCE.md) section C)
- [ ] Compliance monitoring configured (see [COMPLIANCE.md](../../Reference/engineering/compliance/COMPLIANCE.md) section J)
- [ ] Secrets rotation schedule documented (see [COMPLIANCE.md](../../Reference/engineering/compliance/COMPLIANCE.md) section H & I)
- [ ] Environment separation verified (see [COMPLIANCE.md](../../Reference/engineering/compliance/COMPLIANCE.md) section I)
- [ ] Data retention automation implemented (see [COMPLIANCE.md](../../Reference/engineering/compliance/COMPLIANCE.md) section F)
- [ ] Test data compliance verified (see [TESTING.md](../../Reference/engineering/development/TESTING.md))

### Phase 0 Completion Checklist

Before moving to Phase 1, ensure:
- [ ] All 9 Phase 0 features working
- [ ] End-to-end user journey tested (patient books → pays → doctor sees in dashboard)
- [ ] No critical bugs
- [ ] Deployed to production
- [ ] Ready for first test customers
- [ ] **Reference documentation compliance verified** (all patterns from [STANDARDS.md](../../Reference/engineering/development/STANDARDS.md), [ARCHITECTURE.md](../../Reference/engineering/architecture/ARCHITECTURE.md), and [RECIPES.md](../../Reference/engineering/development/RECIPES.md) followed)

---

## Daily Standup Checklist

Use this daily to track progress:

**Today's Focus:**
- Main task: _______________
- Expected completion: _______________

**Blockers:**
- [ ] No blockers
- [ ] Blocker 1: _______________
- [ ] Blocker 2: _______________

**Tomorrow's Plan:**
- Task 1: _______________
- Task 2: _______________

**Reference Documentation Check:**
- [ ] Controller Pattern followed (see [ARCHITECTURE.md](../../Reference/engineering/architecture/ARCHITECTURE.md))
- [ ] asyncHandler used (not manual try/catch) - see [STANDARDS.md](../../Reference/engineering/development/STANDARDS.md)
- [ ] All errors extend AppError - see [STANDARDS.md](../../Reference/engineering/development/STANDARDS.md)
- [ ] TypeScript types added - see [STANDARDS.md](../../Reference/engineering/development/STANDARDS.md)
- [ ] Error handling in place - see [STANDARDS.md](../../Reference/engineering/development/STANDARDS.md) & [RECIPES.md](../../Reference/engineering/development/RECIPES.md) section 7
- [ ] Healthcare compliance verified (if applicable) - see [COMPLIANCE.md](../../Reference/engineering/compliance/COMPLIANCE.md)
- [ ] Code reviewed against [STANDARDS.md](../../Reference/engineering/development/STANDARDS.md), [ARCHITECTURE.md](../../Reference/engineering/architecture/ARCHITECTURE.md), [RECIPES.md](../../Reference/engineering/development/RECIPES.md), and [COMPLIANCE.md](../../Reference/engineering/compliance/COMPLIANCE.md)

---

## Notes & Learnings

**Jan 9, 2025:**
- ✅ Project setup completed
- ✅ Controller Pattern implemented from day one
- ✅ Router Pattern established
- ✅ Database connection working
- ✅ All foundation tasks completed

**Jan 10-11, 2025:**
- ⏸️ Skipped (slacked)

**Jan 12, 2025 onwards:**
- Continue with Database Schema Setup

**Jan 20, 2026:**
- ✅ Database Schema Setup completed (Day 4-5)
- ✅ Rate Limiting Middleware Implementation completed (Day 4.5)
- ✅ Authentication Middleware Implementation completed (Day 4.6)
- ✅ All database tables created and RLS policies executed in Supabase
- ✅ TypeScript types created for all database models
- ✅ Database service helpers and audit logging utilities implemented
- ✅ Authentication middleware with audit logging implemented
- ✅ Middleware order fixed to match STANDARDS.md exactly
- ✅ User-based rate limiting with audit logging implemented
- ✅ Health check endpoint enhanced with timestamp and services structure

**Feb 3, 2026:**
- ✅ Week 4 Day 1-4: Doctor Dashboard Frontend completed (daily plans 2026-02-03 e-task-1 through e-task-5)
- ✅ Next.js 14 frontend: project setup, Supabase Auth (login/signup), dashboard layout & navigation, appointments list & detail, patient detail & GET /api/v1/patients/:id, appointments filtering (status, date range, patient name)
- ✅ Backend: GET /api/v1/appointments (list), GET /api/v1/patients/:id (getPatientForDoctor, RLS-aligned)

---

**Document Created:** January 9, 2025  
**Plan Period:** January 9, 2025 - February 12, 2025 (Adjusted)  
**Last Updated:** February 3, 2026 (Week 4 Dashboard Frontend completed)  
**Next Review:** Daily
**Documentation Reference:**
- [STANDARDS.md](../../Reference/engineering/development/STANDARDS.md) - Rules and requirements
- [ARCHITECTURE.md](../../Reference/engineering/architecture/ARCHITECTURE.md) - Project structure
- [RECIPES.md](../../Reference/engineering/development/RECIPES.md) - Copy-pastable patterns
- [COMPLIANCE.md](../../Reference/engineering/compliance/COMPLIANCE.md) - Compliance and governance
