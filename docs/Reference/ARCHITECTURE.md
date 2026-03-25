# Architecture & Folder Structure
## Project Organization & Boundaries

---

## ⚠️ DO NOT Violate Response Contracts

**AI Agents MUST NOT:**
- ❌ Return `{ data: ... }` manually - **MUST** use `successResponse(data, req)` helper
- ❌ Return `{ error, message, stack }` - **MUST** use error middleware (canonical format)
- ❌ Invent error fields like `error.details`, `error.errors` - **MUST** follow STANDARDS.md contract
- ❌ Skip `meta` object with `timestamp` and `requestId` - **MUST** include in all responses

**ALWAYS:**
- ✅ Use `successResponse(data, req)` for success responses
- ✅ Throw typed errors (error middleware formats automatically)
- ✅ Follow canonical contract: `{ success: true, data: {...}, meta: {...} }`

**See:** [STANDARDS.md](./STANDARDS.md) "Canonical Contracts" section for exact format.

---

## 📁 Project Structure

```
backend/src/
├── config/              ← Configuration files
│   ├── database.ts      ← Supabase client setup, testConnection (no queries here)
│   ├── env.ts           ← Environment variable validation (Zod)
│   ├── logger.ts        ← Logger setup (pino)
│   ├── openai.ts        ← OpenAI client (intent detection, response generation)
│   └── queue.ts         ← BullMQ webhook queue (placeholder when REDIS_URL unset)
│
├── controllers/         ← HTTP request handlers (Controller Pattern)
│   ├── health-controller.ts
│   └── webhook-controller.ts
│
├── routes/              ← Route definitions (mounts controllers)
│   ├── index.ts         ← Route aggregation
│   ├── health.ts        ← Health check routes
│   ├── webhooks.ts      ← Webhook routes
│   └── api/v1/index.ts  ← Versioned API routes
│
├── services/            ← Business logic (framework-agnostic)
│   ├── ai-service.ts            ← Intent detection, response generation (in-memory intent cache; Redis for multi-instance)
│   ├── collection-service.ts    ← Patient field collection (preConsentStore in-memory; Redis for multi-worker)
│   ├── consent-service.ts       ← Consent parse, persist, revocation
│   ├── health-service.ts        ← Health/database check (controllers must not use config/database directly)
│   ├── database-service.ts      ← Generic CRUD helpers
│   ├── dead-letter-service.ts   ← Dead letter queue storage (encrypted)
│   ├── instagram-service.ts     ← Instagram Graph API
│   ├── webhook-idempotency-service.ts
│   ├── appointment-service.ts
│   ├── availability-service.ts
│   ├── conversation-service.ts
│   ├── opd/                    ← OPD initiative (e-task-opd): mode, queue, ETA, policy, metrics, snapshot hints
│   ├── message-service.ts
│   └── patient-service.ts
│
├── types/               ← TypeScript type definitions
│   ├── index.ts
│   ├── ai.ts            ← Intent types, IntentDetectionResult
│   ├── conversation.ts  ← ConversationState, step, collectedFields
│   ├── express.ts       ← Request extensions (correlationId, user)
│   ├── setup.ts         ← Type setup (import first)
│   ├── database.ts
│   ├── instagram.ts
│   ├── queue.ts
│   └── webhook.ts
│
├── utils/               ← Utility functions
│   ├── errors.ts        ← Error classes, formatError
│   ├── async-handler.ts ← Async error handler wrapper
│   ├── response.ts      ← successResponse, errorResponse
│   ├── audit-logger.ts
│   ├── encryption.ts
│   ├── db-helpers.ts
│   ├── webhook-verification.ts
│   └── webhook-event-id.ts
│
├── middleware/          ← Custom middleware
│   ├── auth.ts          ← Authentication middleware (JWT; mount on protected routes)
│   ├── correlation-id.ts
│   ├── rate-limiters.ts ← webhookLimiter, etc.
│   ├── request-timing.ts
│   ├── request-logger.ts
│   ├── request-timeout.ts
│   └── sanitize-input.ts
│
├── workers/             ← Background job processors
│   ├── webhook-worker.ts ← BullMQ router + lifecycle (`processWebhookJob`, worker start/stop)
│   ├── instagram-comment-webhook-handler.ts ← Instagram comment jobs (RBH-05)
│   ├── instagram-dm-webhook-handler.ts ← Instagram DM / messaging state machine (RBH-05)
│   └── webhook-dm-send.ts ← Shared DM send locks + throttle + 2018001 fallback (RBH-04)
│
└── index.ts             ← Server entry point
```

---

## 🏗️ Layer Boundaries

### Request Flow

```
HTTP Request
    ↓
routes/*.ts (defines path, mounts controller)
    ↓
controllers/*.ts (validates input with Zod, handles HTTP)
    ↓
services/*.ts (business logic, framework-agnostic)
    ↓
services call Supabase client from config/database.ts (database client setup)
    ↓
HTTP Response
```

### What Goes Where

| Directory | Responsibility | Can Import From | Cannot Import |
|-----------|---------------|-----------------|---------------|
| `routes/` | Route definitions only | `express`, `controllers/` | `services/`, `config/` |
| `controllers/` | HTTP request/response handling, input validation | `express`, `services/`, `utils/`, `types/`, `config/env`, `config/logger`, `config/queue` | `config/database.ts` directly |
| `services/` | Business logic | `types/`, `utils/`, `config/` | `express`, `controllers/`, `routes/` |
| `config/` | Configuration, external connections | `types/`, `utils/` | `express`, `controllers/`, `services/` |
| `utils/` | Helper functions | `types/` | `express`, `controllers/`, `services/` |
| `types/` | Type definitions | Nothing (pure types) | Everything |
| `middleware/` | Custom Express middleware | `express`, `utils/`, `types/` | `controllers/`, `services/` |

**Controller → config:** Controllers may import `config/env`, `config/logger`, and `config/queue` for orchestration (e.g. webhook controller needs env and queue). Controllers must **not** import `config/database` directly; use a service (e.g. `health-service` for database connection check) so the layer boundary is preserved.

**Protected routes:** Routes that require authentication must mount `authenticateToken` (from `middleware/auth.ts`) before the controller. Optionally mount `userLimiter` after auth for per-user rate limiting. See [RECIPES.md](./RECIPES.md) R-AUTH-001.

---

## 📊 Decision Matrix: Controller vs Service vs DB

**AI Agents MUST follow this decision matrix when implementing features.**

| Responsibility | Layer | What Goes Here |
|---------------|-------|----------------|
| **Input Validation** | Controller | Zod schema parsing (`req.body`, `req.params`, `req.query`) |
| **Orchestration** | Controller | Call services, format HTTP responses using `successResponse()` |
| **Business Rules** | Service | Validation logic, business calculations, data transformations |
| **Permissions/Authorization** | Service | Check user permissions, role-based access control |
| **Database Queries** | Service | All database operations (SELECT, INSERT, UPDATE, DELETE) |
| **Audit Events** | Service | Log audit events (who did what, when) |
| **Ownership Enforcement** | DB (RLS) | Row-level security policies (who can access which rows) |
| **Least Privilege** | DB (RLS) | Database-level access control |

**See STANDARDS.md for detailed examples and anti-patterns.**

---

## ❌ Forbidden Cross-Layer Access (MANDATORY)

**AI Agents MUST NOT generate code that violates these boundaries:**

| From Layer | Must NOT Access | Why |
|------------|----------------|-----|
| **Controller** | Database client directly (`config/database.ts`) | Controllers orchestrate, services handle data |
| **Controller** | Business logic (calculations, transformations) | Business logic belongs in services |
| **Service** | Express types (`Request`, `Response`, `NextFunction`) | Services must be framework-agnostic |
| **Service** | HTTP-specific logic (status codes, headers) | Services return plain objects |
| **Utils** | Supabase client or database | Utils are pure functions, no side effects |
| **Utils** | Express types or HTTP logic | Utils are framework-agnostic |
| **Middleware** | Business logic or database queries | Middleware handles cross-cutting concerns only |
| **Routes** | Services or business logic directly | Routes mount controllers, controllers call services |
| **Routes** | Database client | Routes only define paths, mount controllers |

**Data Flow Contract (MUST Follow This Order):**

```
HTTP Request
    ↓
Middleware (correlation-id, auth, timing, logging)
    ↓
Routes (define path, mount controller)
    ↓
Controller (validate input with Zod, orchestrate)
    ↓
Service (business logic, framework-agnostic)
    ↓
Database (Supabase client, queries)
    ↓
Service (return plain object)
    ↓
Controller (format response with successResponse)
    ↓
Middleware (error handling if error thrown)
    ↓
HTTP Response
```

**AI Agents:** If you see code that violates this flow, **STOP** and refactor to follow the contract.

---

## 🔒 Architecture Rules

### Rule 1: Dependency Direction Rules (MANDATORY)

**AI agents MUST refuse changes that violate dependency direction.**

**Allowed imports:**
- Controllers → Services
- Services → utils, config, types
- Services → database client
- Controllers → validation schemas
- Controllers → middleware

**Forbidden imports:**
- Services → Controllers (creates circular dependency)
- Services → Express types (violates framework-agnostic rule)
- Controllers → database client (must go through services)
- Utils → Controllers or Services (utils should be pure functions)

**Enforcement:**
- AI agents **MUST** validate import statements
- AI agents **MUST** refuse implementations that violate these rules
- AI agents **MUST** suggest correct dependency direction if violation detected

**Example:**
```typescript
// ✅ CORRECT - Controller imports service
// controllers/appointment-controller.ts
import { createAppointment } from '../services/booking-service';

// ✅ CORRECT - Service imports database client
// services/booking-service.ts
import { supabase } from '../config/database';

// ❌ WRONG - Service imports Express
// services/booking-service.ts
import { Request } from 'express'; // VIOLATION

// ❌ WRONG - Controller imports database directly
// controllers/appointment-controller.ts
import { supabase } from '../config/database'; // VIOLATION
```

**Rationale:**
- Prevents architecture erosion over time
- Maintains clear layer boundaries
- Enables framework-agnostic services

---

### Rule 2: Services Never Import Express

**Services MUST be framework-agnostic:**
- Services receive plain JavaScript objects
- Services return plain JavaScript objects
- Services have no knowledge of HTTP

**Example:**
```typescript
// ✅ GOOD - Service is framework-agnostic
// services/booking-service.ts
import { AppointmentData, Appointment } from '../types';

export async function createAppointment(data: AppointmentData): Promise<Appointment> {
  // Business logic only - no HTTP knowledge
  const appointment = await supabase.from('appointments').insert(data).select().single();
  return appointment;
}

// ❌ BAD - Service imports Express
import { Request } from 'express';
export async function createAppointment(req: Request) {
  // Wrong - services shouldn't know about HTTP
}
```

---

### Rule 3: Controllers Bridge HTTP to Business Logic

**Controllers handle HTTP, services handle logic:**
- Controllers validate input (Zod)
- Controllers call services
- Controllers format HTTP response

**Example:**
```typescript
// ✅ GOOD - Controller bridges HTTP to service
// controllers/appointment-controller.ts
import { Request, Response } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { successResponse } from '../utils/response';
import { createAppointmentSchema } from '../utils/validation';
import { createAppointment } from '../services/booking-service';

export const createAppointmentController = asyncHandler(async (req, res) => {
  // 1. Validate input (HTTP layer)
  const validated = createAppointmentSchema.parse(req.body);
  
  // 2. Call service (business logic)
  const appointment = await createAppointment(validated);
  
  // 3. Format response (HTTP layer)
  // ✅ CORRECT - Use successResponse helper (canonical format)
  return res.status(201).json(successResponse(appointment, req));
});
```

---

### Rule 4: Service Atomicity & Consistency

**Atomicity Rule (MANDATORY):**

If an operation affects multiple resources and Supabase RPC is not used, the service **MUST** implement one of:

1. **Compensating rollback logic** (undo on failure)
2. **Explicit idempotency guarantees** (safe to retry)
3. **Use Supabase RPC functions** (database-level transactions)

**Rationale:**
- Supabase JS client doesn't support multi-statement transactions
- Partial writes leave system in inconsistent state
- Must prevent silent corruption

**Example:**
```typescript
// ✅ GOOD - Idempotent with explicit check
export async function createAppointmentWithNotification(data: AppointmentData): Promise<Appointment> {
  // Check idempotency first
  const existing = await checkIdempotency(data.idempotencyKey);
  if (existing) return existing;
  
  // Create appointment (if this fails, nothing committed)
  const appointment = await supabase.from('appointments').insert(data).select().single();
  
  try {
    // Send notification (can fail)
    await sendNotification(appointment);
  } catch (error) {
    // Compensating action: mark appointment as notification_pending
    await supabase.from('appointments')
      .update({ notification_status: 'pending' })
      .eq('id', appointment.id);
    
    // Still return appointment (idempotent retry will handle notification)
    logger.warn('Notification failed, marked for retry', { appointmentId: appointment.id });
  }
  
  return appointment;
}

// ❌ BAD - No compensation, inconsistent state on failure
export async function createAppointmentWithNotification(data: AppointmentData): Promise<Appointment> {
  const appointment = await supabase.from('appointments').insert(data).select().single();
  await sendNotification(appointment); // If this fails, appointment exists but no notification
  return appointment;
}
```

---

### Rule 5: Routes Only Define Paths

**Routes are thin - they just mount controllers:**
- Routes define HTTP method + path
- Routes mount controller functions
- Routes can mount middleware (auth, validation, etc.)

**Example:**
```typescript
// ✅ GOOD - Route only defines path
// routes/appointments.ts
import { Router } from 'express';
import { createAppointmentController } from '../controllers/appointment-controller';
import { authenticateToken } from '../middleware/auth';

const router = Router();

router.post(
  '/appointments',
  authenticateToken,              // Middleware
  createAppointmentController     // Controller
);

export default router;
```

---

### Rule 4: Configuration is Centralized

**All configuration in `config/` directory:**
- `config/env.ts` - Environment variables (validated with Zod)
- `config/database.ts` - Supabase client setup (no queries here)
- `config/logger.ts` - Logger setup (pino/winston)

**No raw `process.env` anywhere except `config/env.ts`:**

```typescript
// ✅ GOOD - Centralized config
// config/env.ts
import { z } from 'zod';
export const env = envSchema.parse(process.env);

// config/database.ts
import { env } from './env';
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

// ❌ BAD - Raw process.env everywhere
const port = process.env.PORT; // Don't do this!
```

---

### Rule 6: Types are Shared

**Types live in `types/` directory:**
- Shared between controllers, services, utils
- No Express-specific types in services
- Types are pure TypeScript interfaces/types

**Example:**
```typescript
// ✅ GOOD - Shared types
// types/index.ts
export interface AppointmentData {
  patientName: string;
  phone: string;
  appointmentDate: string;
}

export interface Appointment extends AppointmentData {
  id: string;
  createdAt: string;
}

// controllers/appointment-controller.ts
import { AppointmentData, Appointment } from '../types';

// services/booking-service.ts
import { AppointmentData, Appointment } from '../types';
```

---

## 📂 Directory Details

### `config/` - Configuration
- **Purpose:** Centralized configuration management
- **What goes here:**
  - Environment variable validation (`env.ts`)
  - Supabase client setup (`database.ts` - no queries here)
  - Logger configuration (`logger.ts`)
  - External service clients (OpenAI, etc.)

### `controllers/` - HTTP Request Handlers
- **Purpose:** Handle HTTP requests/responses
- **What goes here:**
  - Input validation (Zod schemas)
  - HTTP request/response formatting
  - Error handling (try-catch or asyncHandler)
- **What does NOT go here:**
  - Business logic (that's in services)
  - Database queries (that's in services)
  - Route definitions (that's in routes)

### `routes/` - Route Definitions
- **Purpose:** Define HTTP endpoints
- **What goes here:**
  - HTTP method + path definitions
  - Middleware mounting (auth, validation, etc.)
  - Controller mounting
- **What does NOT go here:**
  - Request handling logic (that's in controllers)
  - Business logic (that's in services)

### `services/` - Business Logic
- **Purpose:** Core application logic
- **What goes here:**
  - Business rules
  - Database operations (services call Supabase client from `config/database.ts`)
  - External API calls (OpenAI, Instagram, etc.)
  - Data transformation
- **What does NOT go here:**
  - HTTP request/response handling (that's in controllers)
  - Express-specific code

### `types/` - Type Definitions
- **Purpose:** Shared TypeScript types
- **What goes here:**
  - API request/response types
  - Database model types
  - Service parameter/return types
  - Utility types

### `utils/` - Utility Functions
- **Purpose:** Reusable helper functions
- **What goes here:**
  - Error classes (`errors.ts`)
  - Async handler wrapper (`async-handler.ts`)
  - Validation helpers
  - Formatting functions

### `middleware/` - Custom Middleware
- **Purpose:** Express middleware
- **What goes here:**
  - Authentication middleware
  - Request ID/correlation ID middleware
  - Request timing middleware
  - Request logging middleware
  - Error handling middleware

---

## 🔄 Middleware Order

**CRITICAL:** The order of middleware in `index.ts` matters. Middleware executes top-to-bottom:

### Standard Middleware Order (Canonical Source: STANDARDS.md)

**⚠️ The exact order is defined in STANDARDS.md. This is for explanation only.**

```typescript
// 1. Type extensions (loaded via import, not middleware)
import './types/setup';

// 2. Request tracking (BEFORE body parsers - critical for error logging)
app.use(correlationId);     // FIRST - must exist even if body parsing fails
app.use(requestTiming);     // Second - needs correlationId

// 3. Body parsing (AFTER correlation ID)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(sanitizeInput);     // After body parsing

// 4. Security & compression
app.use(compression);
app.use(helmet());
app.use(cors());

// 5. Request logging (needs timing + correlation ID)
app.use(requestLogger);     // After timing and correlationId

// 6. Rate limiting
app.use(rateLimit({ ... }));

// 7. Routes
app.use('/', routes);

// 8. 404 Handler (after all routes, before error handler)
app.use((req, res, next) => {
  next(new NotFoundError(`Route ${req.method} ${req.path} not found`));
});

// 9. Error handler (MUST be last)
app.use(errorHandler);
```

**See STANDARDS.md "Non-Negotiable Middleware Order" for the authoritative list.**

### Why Order Matters (Per STANDARDS.md)

1. **correlationId FIRST** - Must exist before body parsers (ensures correlation ID exists even if parsing fails)
2. **requestTiming second** - Needs correlationId, needed by requestLogger for duration
3. **Body parsers AFTER correlationId** - If parsing fails, correlation ID already exists for error logging
4. **sanitizeInput after body parsing** - Sanitizes parsed body
5. **Security & compression** - Helmet, CORS, compression
6. **requestLogger after timing** - Needs `req.startTime` and `req.correlationId`
7. **Rate limiting** - After logging
8. **Routes before 404 handler** - 404 handler catches unmatched routes
9. **Error handler last** - Catches all errors from routes and 404 handler

### Common Mistakes

❌ **Putting body parsers before correlationId:**
```typescript
app.use(express.json());  // ❌ If this fails, no correlation ID!
app.use(correlationId);
```

✅ **Correct order (per STANDARDS.md):**
```typescript
app.use(correlationId);   // ✅ First - exists even if parsing fails
app.use(requestTiming);   // ✅ Second
app.use(express.json());  // ✅ After correlation ID
```

❌ **Putting requestLogger before requestTiming:**
```typescript
app.use(requestLogger);  // ❌ No req.startTime yet!
app.use(requestTiming);
```

✅ **Correct order:**
```typescript
app.use(requestTiming);   // ✅ Sets req.startTime
app.use(requestLogger);   // ✅ Can use req.startTime
```

❌ **Putting 404 handler before routes:**
```typescript
app.use((req, res, next) => next(new NotFoundError())); // ❌ Catches all routes!
app.use('/', routes);
```

✅ **Correct order:**
```typescript
app.use('/', routes);      // ✅ Routes handled first
app.use((req, res, next) => next(new NotFoundError())); // ✅ Only unmatched routes
```

---

## 🔄 Data Flow Examples

### Example 1: Creating an Appointment

```
1. HTTP POST /appointments
   ↓
2. routes/appointments.ts (defines route)
   router.post('/appointments', authenticateToken, createAppointmentController)
   ↓
3. middleware/auth.ts (authenticates user)
   ↓
4. controllers/appointment-controller.ts (validates input with Zod)
   const validated = createAppointmentSchema.parse(req.body);
   ↓
5. services/booking-service.ts (business logic)
   const appointment = await createAppointment(validated);
   ↓
6. services call Supabase client from config/database.ts (database client setup)
   supabase.from('appointments').insert(data)
   ↓
7. Response flows back up
   ↓
8. Controller formats response using successResponse helper
   HTTP 201 { success: true, data: appointment, meta: { timestamp, requestId } }
```

### Example 2: Webhook Handler

```
1. HTTP POST /webhooks/facebook
   ↓
2. routes/webhooks.ts (defines route)
   router.post('/webhooks/facebook', webhookController)
   ↓
3. controllers/webhook-controller.ts
   - Verify signature
   - Check idempotency
   - Enqueue for processing
   - Return 200 immediately
   ↓
4. Queue processes async
   ↓
5. services/webhook-service.ts (business logic)
   - Handle webhook event
   - Call AI service
   - Create appointment
```

---

## 🚫 Common Violations

### Violation 1: Service Imports Express
```typescript
// ❌ BAD
// services/booking-service.ts
import { Request } from 'express';
export async function createAppointment(req: Request) {
  // Services shouldn't know about HTTP
}
```

### Violation 2: Route Has Business Logic
```typescript
// ❌ BAD
// routes/appointments.ts
router.post('/appointments', async (req, res) => {
  const appointment = await supabase.from('appointments').insert(req.body);
  // Business logic belongs in services
  res.json(appointment);
});
```

### Violation 3: Raw process.env
```typescript
// ❌ BAD
const port = process.env.PORT; // Should use config/env.ts
```

---

## 🌐 Full-Stack / Frontend

**Frontend (Next.js, React) is documented separately.** This file describes the **backend** structure. For UI structure, data flow, and frontend boundaries:

- **[FRONTEND_ARCHITECTURE.md](./FRONTEND_ARCHITECTURE.md)** – Next.js App Router layout, `app/`, `components/`, `lib/`, auth, data fetching
- **[FRONTEND_STANDARDS.md](./FRONTEND_STANDARDS.md)** – Frontend coding rules (TypeScript, API consumption, a11y)
- **[FRONTEND_RECIPES.md](./FRONTEND_RECIPES.md)** – Copy-pastable frontend patterns (API client, Supabase, auth guard)
- **[CONTRACTS.md](./CONTRACTS.md)** – API response shapes consumed by both backend (implementation) and frontend (types)

**AI agents:** When editing or adding **frontend** code, read FRONTEND_ARCHITECTURE.md and FRONTEND_STANDARDS.md (and FRONTEND_RECIPES.md where applicable). When editing **backend** code, use this file and STANDARDS.md.

---

**Last Updated:** 2026-01-30  
**Version:** 1.0.0  
**See Also:**

### Tier 1 (Must-Have):
- [STANDARDS.md](./STANDARDS.md) - Coding standards (single source of truth)
- [CONTRACTS.md](./CONTRACTS.md) - API response contracts
- [AI_AGENT_RULES.md](./AI_AGENT_RULES.md) - AI behavior rules

### Tier 2 (Required for Safe Coding):
- [CODING_WORKFLOW.md](./CODING_WORKFLOW.md) - Step-by-step coding process
- [RECIPES.md](./RECIPES.md) - Code patterns
- [TESTING.md](./TESTING.md) - Testing strategies
- [API_DESIGN.md](./API_DESIGN.md) - API conventions

### Tier 3 (Security & Data Integrity):
- [DB_SCHEMA.md](./DB_SCHEMA.md) - Database schema
- [RLS_POLICIES.md](./RLS_POLICIES.md) - Row-level security policies
- [EXTERNAL_SERVICES.md](./EXTERNAL_SERVICES.md) - External service integration patterns
