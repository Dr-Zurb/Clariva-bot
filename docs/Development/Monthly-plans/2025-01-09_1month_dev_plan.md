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

**Documentation Reference:** All development must follow our reference documentation in [`docs/Reference/`](../../Reference/):
- **[STANDARDS.md](../../Reference/STANDARDS.md)** - Rules and requirements (MUST/SHOULD)
- **[ARCHITECTURE.md](../../Reference/ARCHITECTURE.md)** - Project structure and boundaries
- **[RECIPES.md](../../Reference/RECIPES.md)** - Copy-pastable code patterns
- **[COMPLIANCE.md](../../Reference/COMPLIANCE.md)** - Compliance, governance, and security requirements

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

1. **[STANDARDS.md](../../Reference/STANDARDS.md)** - Rules and requirements
   - Use for: Coding rules, error handling, validation, authentication, logging
   - Key sections: Input Validation, Error Handling, Services Architecture, Webhook Security

2. **[ARCHITECTURE.md](../../Reference/ARCHITECTURE.md)** - Project structure
   - Use for: Understanding folder structure, where to put code, layer boundaries
   - Key sections: Project Structure, Layer Boundaries, Request Flow

3. **[RECIPES.md](../../Reference/RECIPES.md)** - Copy-pastable patterns
   - Use for: Implementation templates, code examples, step-by-step guides
   - Key sections: Add Route, Add Controller, Add Service, Add Validation, Add Webhook

4. **[COMPLIANCE.md](../../Reference/COMPLIANCE.md)** - Compliance and governance
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
- **"What are the rules?"** → Check [STANDARDS.md](../../Reference/STANDARDS.md)
- **"Where does code go?"** → Check [ARCHITECTURE.md](../../Reference/ARCHITECTURE.md)
- **"How do I implement this?"** → Check [RECIPES.md](../../Reference/RECIPES.md)
- **"What are compliance requirements?"** → Check [COMPLIANCE.md](../../Reference/COMPLIANCE.md)

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
**Status:** ⏳ **PENDING** - Starting Jan 12

**Tasks:**
- [ ] Create Supabase project (if not done)
- [ ] Run database schema SQL (from docs)
- [ ] Create all tables:
  - [ ] doctors
  - [ ] patients
  - [ ] appointments
  - [ ] conversations
  - [ ] messages
  - [ ] availability
  - [ ] blocked_times (optional for now)
- [ ] Set up relationships and foreign keys
- [ ] Create indexes for performance
- [ ] Set up Row Level Security (RLS) policies
- [ ] Create TypeScript types for database models
- [ ] Test database operations (CRUD)
- [x] ✅ **Set up middleware infrastructure (see [RECIPES.md](../../Reference/RECIPES.md)):**
  - [x] ✅ Create `middleware/request-timing.ts` (section 8) - for durationMs in logs - **COMPLETED**
  - [x] ✅ Create `middleware/correlation-id.ts` - for request tracing (correlationId) - **COMPLETED**
  - [x] ✅ Create `types/express.d.ts` (section 9) - for proper Request typing (user, correlationId, startTime) - **COMPLETED**
  - [x] ✅ Mount both middlewares early in middleware chain (before routes) - **COMPLETED**
- [ ] **Follow Reference Documentation:**
  - [ ] Check [ARCHITECTURE.md](../../Reference/ARCHITECTURE.md) for structure
  - [ ] Check [STANDARDS.md](../../Reference/STANDARDS.md) for rules
  - [ ] Check [RECIPES.md](../../Reference/RECIPES.md) for patterns
  - [ ] Check [COMPLIANCE.md](../../Reference/COMPLIANCE.md) for compliance requirements
  - [ ] All database operations use proper types
  - [ ] Classify data at creation (public social, administrative, PHI) - see COMPLIANCE.md section B
  - [ ] Patient data fields marked for encryption (at rest + in transit) - see COMPLIANCE.md section H
  - [ ] Audit logging structure in place (with correlationId, changedFields only, no values) - see COMPLIANCE.md section D
  - [ ] No PII in logs (only IDs) - see COMPLIANCE.md section D & STANDARDS.md
  - [ ] All logs include standard fields: correlationId, path, method, statusCode, durationMs (see [STANDARDS.md](../../Reference/STANDARDS.md))

**Deliverables:**
- ✅ All tables created in Supabase
- ✅ TypeScript types for all models
- ✅ Database helper functions working
- ✅ Test data inserted and retrieved
- ✅ Healthcare compliance measures in place (data classification, audit logging, access control)
- ✅ Request timing middleware implemented and mounted - **COMPLETED**
- ✅ Correlation ID middleware implemented and mounted - **COMPLETED**
- ✅ Express Request type extensions set up (types/express.d.ts) - **COMPLETED**
- ✅ Structured logging with standard fields implemented - **COMPLETED**

**Files to Create:**
```
backend/src/
├── types/
│   ├── database.ts          (TypeScript types for all models)
│   └── express.d.ts         (Express Request type extensions - see RECIPES.md section 9)
├── config/
│   └── database.ts          (update with schema functions)
├── middleware/
│   ├── request-timing.ts    (request duration tracking - see RECIPES.md section 8)
│   └── correlation-id.ts    (request correlation ID generation)
├── services/
│   └── database-service.ts  (database operations - follows standards)
└── utils/
    ├── db-helpers.ts        (helper functions)
    └── audit-logger.ts      (audit logging utility)
```

**Reference Documentation Requirements:**
- All database queries use TypeScript types (see [STANDARDS.md](../../Reference/STANDARDS.md))
- Data classification at creation (public social, administrative, PHI) - see [COMPLIANCE.md](../../Reference/COMPLIANCE.md) section B
- Patient data fields documented for encryption (at rest + in transit) - see [COMPLIANCE.md](../../Reference/COMPLIANCE.md) section H
- Audit logging for all data access (with correlationId, changedFields only) - see [COMPLIANCE.md](../../Reference/COMPLIANCE.md) section D
- Error handling with asyncHandler (see [STANDARDS.md](../../Reference/STANDARDS.md) & [RECIPES.md](../../Reference/RECIPES.md) section 7)
- Services throw AppError (never return {error} objects) - see [STANDARDS.md](../../Reference/STANDARDS.md) Services Architecture
- For multi-step operations, prefer Postgres `rpc()` functions (see [STANDARDS.md](../../Reference/STANDARDS.md) Services Architecture)
- Connection pooling configured (see [ARCHITECTURE.md](../../Reference/ARCHITECTURE.md))
- All logs include standard fields: correlationId, path, method, statusCode, durationMs (see [STANDARDS.md](../../Reference/STANDARDS.md) Logging section)
- Access control via RLS (doctor-only access) - see [COMPLIANCE.md](../../Reference/COMPLIANCE.md) section E

---

### Day 6-8: Instagram Webhook Integration (Jan 14-16)
**Status:** ⏳ **PENDING**

**Tasks:**
- [ ] Set up Instagram Business Account
- [ ] Create Facebook App and Instagram Product
- [ ] Get Instagram Graph API access token
- [ ] Set up webhook endpoint for Instagram
- [ ] **Implement webhook security (see [STANDARDS.md](../../Reference/STANDARDS.md), [RECIPES.md](../../Reference/RECIPES.md) section 5, & [COMPLIANCE.md](../../Reference/COMPLIANCE.md) section H):**
  - [ ] Webhook signature verification (MUST per COMPLIANCE.md section H)
  - [ ] Idempotency handling (prevent duplicate processing) - MUST per COMPLIANCE.md section H
  - [ ] Rate limiting on webhook endpoint (MUST per COMPLIANCE.md section H)
  - [ ] Async processing (don't block webhook response)
  - [ ] Audit log all webhook events (with correlationId) - see COMPLIANCE.md section D
- [ ] Parse incoming Instagram messages
- [ ] Send responses back to Instagram
- [ ] Handle message status updates (read, delivered)
- [ ] Test complete message flow
- [ ] **Follow Controller Pattern:**
  - [ ] Create `controllers/webhook-controller.ts`
  - [ ] Routes only define paths, controllers handle logic
  - [ ] Services handle Instagram API calls

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
└── types/
    └── instagram.ts         (TypeScript types)
```

**API Endpoints:**
- `POST /webhooks/instagram` - Webhook receiver (with signature verification)
- `POST /api/instagram/send-message` - Send message helper

**Reference Documentation Requirements:**
- See [STANDARDS.md](../../Reference/STANDARDS.md) for rules
- See [ARCHITECTURE.md](../../Reference/ARCHITECTURE.md) for structure
- See [RECIPES.md](../../Reference/RECIPES.md) for patterns
- See [COMPLIANCE.md](../../Reference/COMPLIANCE.md) for security requirements
- Webhook signature verification (MUST per COMPLIANCE.md section H)
- Idempotency handling (MUST per COMPLIANCE.md section H)
- Async processing (queue-based)
- Audit log all webhook events (with correlationId) - see COMPLIANCE.md section D
- Error handling with asyncHandler (see [STANDARDS.md](../../Reference/STANDARDS.md) & [RECIPES.md](../../Reference/RECIPES.md) section 7)
- TypeScript types for all webhook payloads
- Controller Pattern (routes → controllers → services)

---

## Week 2: AI Integration & Conversation Flow (Jan 17 - Jan 23)

### Day 1-2: AI Intent Detection (Jan 17-18)
**Status:** ⏳ **PENDING**

**Tasks:**
- [ ] Set up OpenAI API client
- [ ] Create intent detection service
- [ ] Define intent types:
  - [ ] book_appointment
  - [ ] ask_question
  - [ ] check_availability
  - [ ] greeting
  - [ ] cancel_appointment (basic)
  - [ ] unknown
- [ ] Build prompt for intent classification (medical context)
- [ ] **Implement AI/ML Best Practices (see [STANDARDS.md](../../Reference/STANDARDS.md) & [COMPLIANCE.md](../../Reference/COMPLIANCE.md) section G):**
  - [ ] Retry logic with exponential backoff
  - [ ] Response caching (Redis/cache layer)
  - [ ] Rate limiting on AI API calls
  - [ ] Fallback mechanisms (if AI fails)
  - [ ] Response validation (appropriate content)
  - [ ] AI is assistive only (no autonomous diagnosis) - MUST per COMPLIANCE.md section G
  - [ ] Redact PHI from prompts sent to AI services - MUST per COMPLIANCE.md section G
  - [ ] Store metadata only (model, tokens, redaction flag, hash) - MUST NOT persist raw prompts/responses with PHI - see COMPLIANCE.md section G
  - [ ] Audit all AI interactions (metadata only) - see COMPLIANCE.md section G
- [ ] Test intent detection accuracy
- [ ] Add confidence scoring
- [ ] Handle edge cases
- [ ] **Follow Controller Pattern:**
  - [ ] Create `controllers/ai-controller.ts` (if needed for API endpoints)
  - [ ] Services handle AI logic

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
- See [STANDARDS.md](../../Reference/STANDARDS.md) for rules
- See [ARCHITECTURE.md](../../Reference/ARCHITECTURE.md) for structure
- See [RECIPES.md](../../Reference/RECIPES.md) for patterns
- See [COMPLIANCE.md](../../Reference/COMPLIANCE.md) for AI governance requirements
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
- Error handling with asyncHandler (see [STANDARDS.md](../../Reference/STANDARDS.md) & [RECIPES.md](../../Reference/RECIPES.md) section 7)
- Services throw AppError (never return {error} objects) - see [STANDARDS.md](../../Reference/STANDARDS.md)
- All logs include standard fields: correlationId, path, method, statusCode, durationMs

---

### Day 3-4: Natural Conversation Flow (Jan 19-20)
**Status:** ⏳ **PENDING**

**Tasks:**
- [ ] Create conversation state management
- [ ] Build response generation service
- [ ] Design conversation prompts for medical context
- [ ] Implement context-aware responses
- [ ] Handle multi-turn conversations
- [ ] Store conversation history
- [ ] **Follow AI/ML Best Practices:**
  - [ ] Response caching for common questions
  - [ ] Retry logic for AI API calls
  - [ ] Response validation (no medical advice)
  - [ ] Fallback responses if AI fails
- [ ] Test conversation flows
- [ ] Add error handling and fallbacks
- [ ] **Follow Controller Pattern:**
  - [ ] Controllers handle HTTP requests
  - [ ] Services handle conversation logic

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
- See [STANDARDS.md](../../Reference/STANDARDS.md) for rules
- See [ARCHITECTURE.md](../../Reference/ARCHITECTURE.md) for structure
- See [RECIPES.md](../../Reference/RECIPES.md) for patterns
- See [COMPLIANCE.md](../../Reference/COMPLIANCE.md) for AI governance requirements
- Response caching (Redis/cache layer)
- Retry logic with exponential backoff
- Response validation (medical-appropriate)
- Fallback mechanisms
- Prompt engineering (medical context)
- AI is assistive only (no autonomous diagnosis) - MUST per COMPLIANCE.md section G
- Redact PHI from prompts sent to AI services - MUST per COMPLIANCE.md section G
- Store metadata only (model, tokens, redaction flag, hash) - MUST NOT persist raw prompts/responses with PHI - see COMPLIANCE.md section G
- Audit all AI interactions (metadata only) - see COMPLIANCE.md section G
- Error handling with asyncHandler (see [STANDARDS.md](../../Reference/STANDARDS.md) & [RECIPES.md](../../Reference/RECIPES.md) section 7)
- Services throw AppError (never return {error} objects) - see [STANDARDS.md](../../Reference/STANDARDS.md)
- All logs include standard fields: correlationId, path, method, statusCode, durationMs

---

### Day 5-7: Patient Information Collection (Jan 21-23)
**Status:** ⏳ **PENDING**

**Tasks:**
- [ ] Design patient info collection flow
- [ ] Build data collection service
- [ ] Implement field-by-field collection:
  - [ ] Name
  - [ ] Phone number (with validation)
  - [ ] Date of birth (optional)
  - [ ] Gender (optional)
  - [ ] Reason for visit
- [ ] Add data validation with Zod (see [STANDARDS.md](../../Reference/STANDARDS.md) & [RECIPES.md](../../Reference/RECIPES.md) section 4)
- [ ] Handle partial information gracefully
- [ ] **Follow Healthcare Compliance (see [COMPLIANCE.md](../../Reference/COMPLIANCE.md) & [STANDARDS.md](../../Reference/STANDARDS.md)):**
  - [ ] Classify data at creation (public social, administrative, PHI) - see COMPLIANCE.md section B
  - [ ] Patient data marked for encryption (at rest + in transit) - see COMPLIANCE.md section H
  - [ ] No PII in logs (only IDs, standard log fields) - see COMPLIANCE.md section D & STANDARDS.md
  - [ ] Audit logging for all data access (with correlationId) - see COMPLIANCE.md section D
  - [ ] Data validation (phone, email formats) with Zod
  - [ ] Consent obtained before collecting PHI - see COMPLIANCE.md section C
- [ ] Store patient data in database
- [ ] Update conversation state with collected data
- [ ] Test complete collection flow
- [ ] **Follow Controller Pattern:**
  - [ ] Controllers handle HTTP requests
  - [ ] Services handle patient data logic

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
- See [STANDARDS.md](../../Reference/STANDARDS.md) for rules
- See [ARCHITECTURE.md](../../Reference/ARCHITECTURE.md) for structure
- See [RECIPES.md](../../Reference/RECIPES.md) for patterns
- Patient data encryption (at rest and in transit)
- No PII in logs (only IDs)
- Audit logging for all patient data access
- Data validation with Zod (proper formats) - see [STANDARDS.md](../../Reference/STANDARDS.md) & [RECIPES.md](../../Reference/RECIPES.md) section 4
- Error handling with asyncHandler (see [STANDARDS.md](../../Reference/STANDARDS.md) & [RECIPES.md](../../Reference/RECIPES.md) section 7)
- Services throw AppError (never return {error} objects) - see [STANDARDS.md](../../Reference/STANDARDS.md)
- TypeScript types for all patient data
- All logs include standard fields: correlationId, path, method, statusCode, durationMs

---

## Week 3: Booking System & Payments (Jan 24 - Jan 30)

### Day 1-3: Appointment Booking System (Jan 24-26)
**Status:** ⏳ **PENDING**

**Tasks:**
- [ ] Create basic availability service (for Phase 0 - simple configuration)
- [ ] Build appointment booking logic
- [ ] Implement time slot calculation
- [ ] Add double-booking prevention
- [ ] Create appointment creation function
- [ ] Build booking confirmation flow
- [ ] Send booking confirmation to patient (via Instagram DM)
- [ ] Update doctor's availability after booking
- [ ] **Use Zod for input validation (see [STANDARDS.md](../../Reference/STANDARDS.md) & [RECIPES.md](../../Reference/RECIPES.md) section 4):**
  - [ ] Validate appointment booking data with Zod schemas
- [ ] **For multi-step operations (appointment + notification + audit log), use Postgres rpc() or compensating logic (see [STANDARDS.md](../../Reference/STANDARDS.md) Services Architecture):**
  - [ ] Ensure atomicity for appointment creation
- [ ] **Follow Healthcare Compliance (see [COMPLIANCE.md](../../Reference/COMPLIANCE.md)):**
  - [ ] Appointment data encrypted (at rest + in transit) - see COMPLIANCE.md section H
  - [ ] Audit logging for appointments (with correlationId, changedFields only, no values) - see COMPLIANCE.md section D
  - [ ] No PII in logs (only IDs, standard log fields) - see COMPLIANCE.md section D & STANDARDS.md
  - [ ] All logs include standard fields: correlationId, path, method, statusCode, durationMs
  - [ ] Access control via RLS (doctor-only access) - see COMPLIANCE.md section E
- [ ] Test booking flow end-to-end
- [ ] **Follow Controller Pattern:**
  - [ ] Create `controllers/appointment-controller.ts`
  - [ ] Routes define paths, controllers handle requests
  - [ ] Services handle booking logic

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

**API Endpoints:**
- `GET /api/appointments/available-slots`
- `POST /api/appointments/book`
- `GET /api/appointments/:id`

**Reference Documentation Requirements:**
- See [STANDARDS.md](../../Reference/STANDARDS.md) for rules
- See [ARCHITECTURE.md](../../Reference/ARCHITECTURE.md) for structure
- See [RECIPES.md](../../Reference/RECIPES.md) for patterns
- Controller Pattern (routes → controllers → services)
- TypeScript types for all appointment data
- Input validation with Zod (see [STANDARDS.md](../../Reference/STANDARDS.md) & [RECIPES.md](../../Reference/RECIPES.md) section 4)
- Error handling with asyncHandler and error middleware (see [STANDARDS.md](../../Reference/STANDARDS.md) & [RECIPES.md](../../Reference/RECIPES.md) section 7)
- Services throw AppError (never return {error} objects) - see [STANDARDS.md](../../Reference/STANDARDS.md)
- For multi-step operations, use Postgres rpc() or compensating logic (see [STANDARDS.md](../../Reference/STANDARDS.md) Services Architecture)
- Healthcare compliance (encryption, audit logging)
- No PII in logs (only IDs)
- All logs include standard fields: correlationId, path, method, statusCode, durationMs

---

### Day 4-5: Payment Integration (Jan 27-28)
**Status:** ⏳ **PENDING**

**Tasks:**
- [ ] Set up payment gateway account (Razorpay/Stripe)
- [ ] Install payment SDK
- [ ] Create payment service
- [ ] Build payment link generation
- [ ] Integrate payment with booking flow
- [ ] **Use Zod for input validation (see [STANDARDS.md](../../Reference/STANDARDS.md) & [RECIPES.md](../../Reference/RECIPES.md) section 4):**
  - [ ] Validate payment data with Zod schemas
- [ ] **Implement webhook security (see [STANDARDS.md](../../Reference/STANDARDS.md) & [RECIPES.md](../../Reference/RECIPES.md) section 5):**
  - [ ] Payment webhook signature verification
  - [ ] Idempotency handling
  - [ ] Async processing
  - [ ] Retry queues for failed payments
- [ ] Handle payment webhooks
- [ ] Update appointment status after payment
- [ ] Store payment information
- [ ] Send payment confirmation to both parties
- [ ] Test payment flow end-to-end
- [ ] **Follow Controller Pattern:**
  - [ ] Create `controllers/payment-controller.ts`
  - [ ] Routes define paths, controllers handle requests

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

**API Endpoints:**
- `POST /api/payments/create-link`
- `POST /webhooks/payments` - Payment webhook (with signature verification)
- `GET /api/payments/:id`

**Payment Flow:**
1. Patient books appointment → Collect info
2. Generate payment link → Send via Instagram DM
3. Patient pays → Payment gateway callback
4. Confirm appointment → Notify both parties
5. Send receipt → Store payment record

**Reference Documentation Requirements:**
- See [STANDARDS.md](../../Reference/STANDARDS.md) for rules
- See [ARCHITECTURE.md](../../Reference/ARCHITECTURE.md) for structure
- See [RECIPES.md](../../Reference/RECIPES.md) for patterns
- See [COMPLIANCE.md](../../Reference/COMPLIANCE.md) for security requirements
- Webhook signature verification (MUST per COMPLIANCE.md section H)
- Idempotency handling (MUST per COMPLIANCE.md section H)
- Async processing (queue-based)
- Audit log all webhook events (with correlationId) - see COMPLIANCE.md section D
- Input validation with Zod (see [STANDARDS.md](../../Reference/STANDARDS.md) & [RECIPES.md](../../Reference/RECIPES.md) section 4)
- Error handling with asyncHandler (see [STANDARDS.md](../../Reference/STANDARDS.md) & [RECIPES.md](../../Reference/RECIPES.md) section 7)
- Services throw AppError (never return {error} objects) - see [STANDARDS.md](../../Reference/STANDARDS.md)
- Controller Pattern (routes → controllers → services)
- TypeScript types for all payment data
- All logs include standard fields: correlationId, path, method, statusCode, durationMs

---

### Day 6-7: Notifications System (Jan 29-30)
**Status:** ⏳ **PENDING**

**Tasks:**
- [ ] Set up email service (SendGrid/Resend)
- [ ] Create notification service
- [ ] Build doctor notification system:
  - [ ] New appointment email
  - [ ] Payment received email
  - [ ] SMS notifications (optional)
- [ ] Build patient notification system:
  - [ ] Booking confirmation (Instagram DM)
  - [ ] Payment confirmation (Instagram DM)
  - [ ] Payment receipt
- [ ] **Follow Healthcare Compliance (see [COMPLIANCE.md](../../Reference/COMPLIANCE.md)):**
  - [ ] No PII in email logs (only IDs) - see COMPLIANCE.md section D
  - [ ] Secure email transmission (TLS 1.2+) - see COMPLIANCE.md section H
  - [ ] All logs include standard fields: correlationId, path, method, statusCode, durationMs
  - [ ] Audit log all notification events - see COMPLIANCE.md section D
- [ ] **Note:** Appointment reminders (24h before) will be Phase 1. For Phase 0 MVP, focus on booking and payment confirmations only.
- [ ] Create notification templates
- [ ] Test all notification types
- [ ] Add error handling for failed notifications
- [ ] **Follow Controller Pattern:**
  - [ ] Controllers handle HTTP requests (if API endpoints)
  - [ ] Services handle notification logic

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
- See [STANDARDS.md](../../Reference/STANDARDS.md) for rules
- See [ARCHITECTURE.md](../../Reference/ARCHITECTURE.md) for structure
- See [RECIPES.md](../../Reference/RECIPES.md) for patterns
- No PII in email logs (only IDs)
- Secure email transmission (TLS/SSL)
- Error handling with asyncHandler (see [STANDARDS.md](../../Reference/STANDARDS.md) & [RECIPES.md](../../Reference/RECIPES.md) section 7)
- Services throw AppError (never return {error} objects) - see [STANDARDS.md](../../Reference/STANDARDS.md)
- Retry logic for failed notifications
- TypeScript types for all notification data
- All logs include standard fields: correlationId, path, method, statusCode, durationMs

---

## Week 4: Dashboard & Launch Prep (Jan 31 - Feb 12)

### Day 1-4: Doctor Dashboard Frontend (Jan 31 - Feb 3)
**Status:** ⏳ **PENDING**

**Tasks:**
- [ ] Set up Next.js project
- [ ] Configure TypeScript for frontend
- [ ] Set up Tailwind CSS
- [ ] Implement Supabase Auth
- [ ] Create login/signup pages
- [ ] Build dashboard layout
- [ ] Create appointments list page
- [ ] Create appointment detail view
- [ ] Create patient detail view
- [ ] Add filtering and search
- [ ] Make it responsive (mobile-friendly)
- [ ] Connect to backend API
- [ ] **Follow Frontend Standards (see [STANDARDS.md](../../Reference/STANDARDS.md) & [ARCHITECTURE.md](../../Reference/ARCHITECTURE.md)):**
  - [ ] TypeScript types for all components
  - [ ] Error handling for API calls
  - [ ] Loading states
  - [ ] Responsive design

**Deliverables:**
- ✅ Doctors can log in/sign up
- ✅ View all appointments
- ✅ View patient details
- ✅ Filter appointments by date/status
- ✅ Clean, professional UI
- ✅ Mobile-responsive

**Files to Create:**
```
frontend/
├── pages/
│   ├── login.tsx
│   ├── dashboard.tsx
│   ├── appointments.tsx
│   └── patients/
│       └── [id].tsx
├── components/
│   ├── Layout.tsx
│   ├── AppointmentCard.tsx
│   └── PatientCard.tsx
├── lib/
│   ├── supabase.ts
│   └── api.ts
└── styles/
    └── globals.css
```

---

### Day 5-7: Testing & Bug Fixes (Feb 4-6)
**Status:** ⏳ **PENDING**

**Tasks:**
- [ ] End-to-end testing of complete flow:
  - [ ] Patient sends message on Instagram
  - [ ] Bot responds and collects info
  - [ ] Patient books appointment
  - [ ] Payment link generated
  - [ ] Patient pays
  - [ ] Appointment confirmed
  - [ ] Notifications sent
  - [ ] Doctor sees appointment in dashboard
- [ ] Fix all bugs found
- [ ] Performance optimization
- [ ] Security review
- [ ] Error handling improvements
- [ ] User experience polish
- [ ] **Verify Reference Documentation Compliance:**
  - [ ] Check [STANDARDS.md](../../Reference/STANDARDS.md) for all MUST rules
  - [ ] Check [ARCHITECTURE.md](../../Reference/ARCHITECTURE.md) for structure compliance
  - [ ] Check [RECIPES.md](../../Reference/RECIPES.md) for pattern consistency
  - [ ] Check [COMPLIANCE.md](../../Reference/COMPLIANCE.md) for compliance requirements
  - [ ] All routes use Controller Pattern
  - [ ] All functions have TypeScript types
  - [ ] Error handling in place
  - [ ] Healthcare compliance measures verified (data classification, audit logging, access control)
  - [ ] AI/ML best practices verified (PHI redaction, metadata-only logging)
  - [ ] Webhook security verified (signature verification, idempotency)

**Deliverables:**
- ✅ All features working end-to-end
- ✅ No critical bugs
- ✅ Good performance
- ✅ Secure implementation
- ✅ Reference documentation compliance verified

---

### Day 8-12: Deployment & Launch Prep (Feb 7-12)
**Status:** ⏳ **PENDING**

**Tasks:**
- [ ] Set up production environment
- [ ] Deploy backend to Render/Railway
- [ ] Deploy frontend to Vercel
- [ ] Configure production environment variables
- [ ] Set up domain (if needed)
- [ ] SSL certificates
- [ ] Database backups
- [ ] Monitoring and logging (Sentry)
- [ ] Create deployment documentation
- [ ] Final testing in production
- [ ] Prepare launch materials
- [ ] **Production Readiness Checklist:**
  - [ ] All environment variables configured
  - [ ] Database backups automated
  - [ ] Monitoring in place
  - [ ] Error tracking configured
  - [ ] Performance monitoring
  - [ ] Security audit completed

**Deliverables:**
- ✅ Backend deployed and running
- ✅ Frontend deployed and accessible
- ✅ All services connected
- ✅ Monitoring in place
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
- **Reference documentation compliance:** Review code against [STANDARDS.md](../../Reference/STANDARDS.md), [ARCHITECTURE.md](../../Reference/ARCHITECTURE.md), [RECIPES.md](../../Reference/RECIPES.md), and [COMPLIANCE.md](../../Reference/COMPLIANCE.md) before each commit

### Timeline Risks
- **Feature scope creep:** Stick to MVP features only
- **Unforeseen technical issues:** Build in buffer time (extra 2-3 days)
- **Third-party service delays:** Start account setup early
- **Reference documentation learning curve:** Allocate time to understand [STANDARDS.md](../../Reference/STANDARDS.md), [ARCHITECTURE.md](../../Reference/ARCHITECTURE.md), and [RECIPES.md](../../Reference/RECIPES.md) patterns

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
- [ ] Doctors can log in/sign up
- [ ] View all appointments
- [ ] View patient details
- [ ] Filter appointments

✅ **Quality Metrics:**
- [ ] 80%+ booking completion rate (tested)
- [ ] <5% error rate
- [ ] Response time <2 seconds
- [ ] All features tested end-to-end

✅ **Reference Documentation Compliance:**
- [ ] Controller Pattern implemented throughout (see [ARCHITECTURE.md](../../Reference/ARCHITECTURE.md))
- [ ] All routes use controllers with asyncHandler (see [STANDARDS.md](../../Reference/STANDARDS.md))
- [ ] All errors extend AppError (see [STANDARDS.md](../../Reference/STANDARDS.md))
- [ ] TypeScript types for all functions (see [STANDARDS.md](../../Reference/STANDARDS.md))
- [ ] Error handling in place (see [STANDARDS.md](../../Reference/STANDARDS.md) & [RECIPES.md](../../Reference/RECIPES.md) section 7)
- [ ] Healthcare compliance measures verified (see [COMPLIANCE.md](../../Reference/COMPLIANCE.md))
- [ ] AI/ML best practices implemented (see [STANDARDS.md](../../Reference/STANDARDS.md) & [COMPLIANCE.md](../../Reference/COMPLIANCE.md) section G)
- [ ] Webhook security verified (see [STANDARDS.md](../../Reference/STANDARDS.md), [RECIPES.md](../../Reference/RECIPES.md) section 5, & [COMPLIANCE.md](../../Reference/COMPLIANCE.md) section H)
- [ ] Audit logging implemented (see [COMPLIANCE.md](../../Reference/COMPLIANCE.md) section D)
- [ ] Access control via RLS (see [COMPLIANCE.md](../../Reference/COMPLIANCE.md) section E)

### Phase 0 Completion Checklist

Before moving to Phase 1, ensure:
- [ ] All 9 Phase 0 features working
- [ ] End-to-end user journey tested (patient books → pays → doctor sees in dashboard)
- [ ] No critical bugs
- [ ] Deployed to production
- [ ] Ready for first test customers
- [ ] **Reference documentation compliance verified** (all patterns from [STANDARDS.md](../../Reference/STANDARDS.md), [ARCHITECTURE.md](../../Reference/ARCHITECTURE.md), and [RECIPES.md](../../Reference/RECIPES.md) followed)

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
- [ ] Controller Pattern followed (see [ARCHITECTURE.md](../../Reference/ARCHITECTURE.md))
- [ ] asyncHandler used (not manual try/catch) - see [STANDARDS.md](../../Reference/STANDARDS.md)
- [ ] All errors extend AppError - see [STANDARDS.md](../../Reference/STANDARDS.md)
- [ ] TypeScript types added - see [STANDARDS.md](../../Reference/STANDARDS.md)
- [ ] Error handling in place - see [STANDARDS.md](../../Reference/STANDARDS.md) & [RECIPES.md](../../Reference/RECIPES.md) section 7
- [ ] Healthcare compliance verified (if applicable) - see [COMPLIANCE.md](../../Reference/COMPLIANCE.md)
- [ ] Code reviewed against [STANDARDS.md](../../Reference/STANDARDS.md), [ARCHITECTURE.md](../../Reference/ARCHITECTURE.md), [RECIPES.md](../../Reference/RECIPES.md), and [COMPLIANCE.md](../../Reference/COMPLIANCE.md)

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

---

**Document Created:** January 9, 2025  
**Plan Period:** January 9, 2025 - February 12, 2025 (Adjusted)  
**Last Updated:** January 12, 2025  
**Next Review:** Daily  
**Documentation Reference:**
- [STANDARDS.md](../../Reference/STANDARDS.md) - Rules and requirements
- [ARCHITECTURE.md](../../Reference/ARCHITECTURE.md) - Project structure
- [RECIPES.md](../../Reference/RECIPES.md) - Copy-pastable patterns
- [COMPLIANCE.md](../../Reference/COMPLIANCE.md) - Compliance and governance
