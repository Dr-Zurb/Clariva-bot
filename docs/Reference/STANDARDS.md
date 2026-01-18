# Coding Standards (MUST/SHOULD Rules)
## Production-Quality Enforcement Rules

---

## ⚠️ Source of Truth

**IMPORTANT: If there is any conflict between documents, STANDARDS.md overrides everything else.**

This file is the authoritative source for all coding standards. Other documentation files (ARCHITECTURE.md, RECIPES.md) should align with these rules.

---

## 🎯 Core Principle

**Elite code, simple explanations.**
- **Code:** Production-quality, best practices, industry standards
- **Explanations:** Beginner-friendly
- **Structure:** Scalable, maintainable, professional
- **Patterns:** Industry-standard patterns

---

## ⚠️ MANDATORY Rules (MUST)

### Input Validation (MANDATORY)

**MUST: Use Zod for all external inputs**
- Every route MUST validate `req.body`, `req.query`, `req.params`, and webhook payloads with Zod
- Validation MUST happen in controllers before calling services
- Never trust external input

**MUST: No raw `process.env.X` except in `src/config/env.ts`**
- All environment variable access MUST go through validated config
- Fail fast if required variables are missing

**Example:**
```typescript
// ✅ GOOD - Zod validation with asyncHandler (canonical pattern)
import { z } from 'zod';
import { asyncHandler } from '../utils/async-handler';
import { ValidationError } from '../utils/errors';

const createAppointmentSchema = z.object({
  patientName: z.string().min(1),
  phone: z.string().regex(/^\+?[1-9]\d{1,14}$/),
  appointmentDate: z.string().datetime(),
});

// Use asyncHandler - ZodError automatically caught and mapped to ValidationError by error middleware
export const createAppointment = asyncHandler(async (req: Request, res: Response) => {
  // MUST validate before processing - no try/catch needed
  const validated = createAppointmentSchema.parse(req.body);
  
  // Process validated data
  const appointment = await createAppointmentService(validated);
  res.status(201).json({ data: appointment });
});

// Error middleware automatically maps ZodError → ValidationError (400)

// ❌ BAD - No validation
export const createAppointment = asyncHandler(async (req: Request, res: Response) => {
  const { patientName, phone } = req.body; // DANGEROUS!
  // ...
});
```

---

### Error Handling (MANDATORY)

**MUST: Use asyncHandler wrapper (recommended pattern)**
- All async controllers MUST use `asyncHandler` wrapper
- Never use `_next: Function` - always use `NextFunction` type if not using asyncHandler
- Errors MUST be typed (ValidationError → 400, NotFoundError → 404, etc.)
- All errors MUST pass through error middleware
- **Note:** Manual try/catch with NextFunction is legacy pattern - use asyncHandler for all new code

**MUST: Base Error Class Contract**
- All custom errors MUST extend `AppError` (never extend raw `Error`)
- `AppError` MUST define:
  - `statusCode: number` - HTTP status code (400, 401, 404, 500, etc.)
  - `isOperational: boolean` - Whether error is expected (operational) or unexpected (programming error)
  - `message: string` - Error message
- All custom error classes MUST call `super(message)` with appropriate status code

**MUST: Typed error classes**
- `ValidationError` → 400 (Bad Request) - extends AppError
- `UnauthorizedError` → 401 (Unauthorized) - extends AppError
- `ForbiddenError` → 403 (Forbidden) - extends AppError
- `NotFoundError` → 404 (Not Found) - extends AppError
- `ConflictError` → 409 (Conflict) - extends AppError
- `InternalError` → 500 (Internal Server Error) - extends AppError, for database failures, unexpected errors
- `AppError` → 500 (Internal Server Error - default base class)

**Example:**
```typescript
// ✅ GOOD - asyncHandler pattern (canonical, recommended)
import { asyncHandler } from '../utils/async-handler';

export const createAppointment = asyncHandler(async (req, res) => {
  const validated = createAppointmentSchema.parse(req.body);
  // No try-catch needed - asyncHandler handles errors automatically
  // ZodError is automatically caught and mapped to ValidationError by error middleware
  const appointment = await createAppointmentService(validated);
  res.status(201).json({ data: appointment });
});

// ❌ BAD - Using Function type
app.use((err: Error, _req: Request, res: Response, _next: Function) => {
  // NEVER use Function type
});

// ✅ GOOD - All errors extend AppError
export class ValidationError extends AppError {
  constructor(message: string = 'Validation failed') {
    super(message, 400); // statusCode, isOperational defaults to true
  }
}

// ❌ BAD - Extends raw Error
export class ValidationError extends Error {
  // Wrong - doesn't have statusCode, isOperational
}
```

---

### Authentication (MANDATORY)

**MUST: Use Supabase Auth (not custom JWT)**
- Access tokens MUST be short-lived (15 minutes)
- Refresh tokens MUST rotate
- Never implement custom JWT - use Supabase Auth SDK

**MUST: Secure token storage**
- **Web clients:** Use httpOnly cookies (preferred) or secure session storage
- **Mobile clients:** Use secure storage (iOS Keychain / Android Keystore)
- Never store tokens in localStorage (web) or plain text (mobile)
- This prevents token theft via XSS attacks (web) or device compromise (mobile)

**MUST: Role-based access control**
- Doctors can only access their own patients
- Audit all authentication attempts

---

### Environment Variables (MANDATORY)

**MUST: Validate all environment variables at startup with Zod**
- All env vars MUST be validated in `src/config/env.ts`
- Server MUST fail fast if required vars are missing
- No defaults for production-required variables

**Example:**
```typescript
// src/config/env.ts
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']),
  PORT: z.string().transform(Number),
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
});

export const env = envSchema.parse(process.env);
```

---

### Logging (MANDATORY)

**MUST: Use structured logger (pino/winston)**
- All logs MUST be JSON format
- Correlation IDs MUST be on all requests (via middleware)
- Request ID middleware MUST be implemented
- **NEVER log PII** (including in errors)

**MUST: Never log raw request objects**
- Never log `req`, `res`, `req.body`, `req.headers` directly
- Only log derived, sanitized fields (IDs, paths, methods, correlation IDs)
- This prevents accidental PII leakage from nested objects
- AI tools sometimes log objects accidentally - this explicit ban prevents that footgun

**MUST: Standard log fields**
- All logs MUST include these fields for debugging at scale:
  - `correlationId` - Request correlation ID (for tracing)
  - `path` - Request path (e.g., `/appointments`)
  - `method` - HTTP method (e.g., `GET`, `POST`)
  - `statusCode` - HTTP status code (e.g., `200`, `400`, `500`)
  - `durationMs` - Request duration in milliseconds
- These fields make debugging 10x faster by enabling request tracing and performance analysis

**MUST: Log levels**
- ERROR: System errors, failures
- WARN: Recoverable issues, deprecations
- INFO: Business events (appointment created, etc.)
- DEBUG: Development only

**Example:**
```typescript
// ✅ GOOD - Structured logging with standard fields
// Note: durationMs comes from request-timing middleware (see RECIPES.md section 8)
const durationMs = req.startTime ? Date.now() - req.startTime : undefined;

logger.info('Appointment created', {
  correlationId: req.correlationId,  // MUST: For request tracing
  path: req.path,                     // MUST: Request path
  method: req.method,                 // MUST: HTTP method
  statusCode: 201,                    // MUST: HTTP status code
  durationMs,                         // MUST: Request duration (from middleware)
  appointmentId: 'abc123',
  doctorId: 'doc456',
  timestamp: new Date().toISOString(),
  // ❌ NEVER: patientName, patientPhone, patientDob
  // ❌ NEVER: req.body, req.headers, req (raw objects)
});

// ❌ BAD - Unstructured or PII in logs
console.log(`Patient ${patient.name} called ${patient.phone}`);
logger.info('Request received', req); // DANGEROUS - may contain PII
logger.info('Request body', req.body); // DANGEROUS - contains patient data
```

---

### Production Tooling (MANDATORY)

**MUST: ESLint + Prettier configured**
- Code formatting MUST be enforced
- Linting MUST catch common errors

**MUST: TypeScript strict mode enabled**
- `"strict": true` in `tsconfig.json`
- No `any` types (use `unknown` when needed)

**MUST: Security headers**
- Helmet middleware MUST be configured
- Rate limiting MUST be on all endpoints
- CORS MUST be properly configured (restrict origins in production)

**MUST: Request body size limits**
- JSON body size MUST be limited (e.g., 10mb) to prevent DoS attacks
- Form data size MUST be limited (e.g., 10mb)
- Limits MUST be configured in `express.json()` and `express.urlencoded()`

**MUST: API Documentation**
- OpenAPI spec generation OR
- Rule: Every endpoint MUST be documented (JSDoc + OpenAPI)

---

### Data Encryption & Compliance (MANDATORY)

**MUST: Field-level encryption for sensitive columns**
- Phone numbers, DOB, email addresses MUST be encrypted at application level (in addition to DB encryption)
- Use Supabase encryption OR application-level encryption library
- Keys MUST be stored in KMS at scale (not env vars)

**MUST: Never log request body for healthcare routes**
- Healthcare-related endpoints MUST not log request bodies
- Log only IDs and metadata

**MUST: DPDPA India compliance (primary)**
- Right to access (patients can request their data)
- Right to deletion (patients can request data deletion)
- Data minimization (only collect necessary data)
- Data retention policies (automated deletion after legal period)

**MUST: HIPAA compliance (secondary - for US market)**
- Same principles as DPDPA
- Additional US-specific requirements

**Example:**
```typescript
// ✅ GOOD - No PII in logs for healthcare routes
router.post('/appointments', async (req, res) => {
  // DO NOT log req.body for healthcare routes
  logger.info('Appointment request received', {
    correlationId: req.correlationId,
    doctorId: req.params.doctorId,
    // ❌ NEVER: patientName, phone, dob from req.body
  });
  
  // Process appointment
  const appointment = await createAppointmentService(req.body);
  
  // Log only IDs
  logger.info('Appointment created', {
    correlationId: req.correlationId,
    appointmentId: appointment.id,
    doctorId: appointment.doctorId,
    // ✅ GOOD - No PII
  });
});
```

---

### Services Architecture (MANDATORY)

**MUST: Services never import Express types**
- Services MUST be framework-agnostic
- Services MUST only import from `types/`, `utils/`, `config/`
- Controllers bridge HTTP (Express) to business logic (services)

**MUST: Service return shape**
- Services MUST throw typed errors (AppError subclasses) - never return `{error}` objects
- Services MUST return data directly (not wrapped in `{data, error}` objects)
- This ensures consistent error handling and prevents mixed patterns

**MUST: Use transactions for multi-resource operations**
- If an operation modifies more than one persistent resource (multiple tables, files, external APIs), it MUST be wrapped in a transaction or use compensating logic
- This prevents data corruption when operations partially fail
- Healthcare operations often need atomicity (appointment + notification + audit log)
- **Supabase Note:** Prefer Postgres `rpc()` functions for true atomic multi-step operations; otherwise use compensating logic + idempotency. The Supabase JS client doesn't provide classic multi-statement SQL transactions like ORMs do.

**Example:**
```typescript
// ✅ GOOD - Service is framework-agnostic
// services/booking-service.ts
import { AppointmentData } from '../types';
import { supabase } from '../config/database';

export async function createAppointment(data: AppointmentData): Promise<Appointment> {
  // No Express types here
  const { data: appointment, error } = await supabase
    .from('appointments')
    .insert(data)
    .select()
    .single();
  
  if (error) throw new InternalError(`Failed to create appointment: ${error.message}`);
  return appointment; // ✅ GOOD - Return data directly, throw errors
}

// ❌ BAD - Service returns {error} object (mixed pattern)
export async function createAppointment(data: AppointmentData): Promise<{ data?: Appointment; error?: string }> {
  const { data: appointment, error } = await supabase.from('appointments').insert(data).select().single();
  if (error) return { error: error.message }; // WRONG - should throw InternalError
  return { data: appointment };
}

// ❌ BAD - Service imports Express
import { Request } from 'express';
export async function createAppointment(req: Request) {
  // Wrong - services shouldn't know about HTTP
}
```

---

### Webhook Security (MANDATORY)

**MUST: Webhook signature verification**
- Verify signature BEFORE processing
- Respond 401 if signature invalid

**MUST: Idempotency check**
- Check if webhook already processed
- Return 200 immediately if duplicate

**MUST: Async processing**
- Don't block webhook response
- Enqueue for background processing
- Return 200 quickly (< 20 seconds for Facebook)

**Example:**
```typescript
router.post('/webhooks/facebook', async (req, res) => {
  // 1. MUST verify signature FIRST
  if (!verifyFacebookSignature(req)) {
    return res.status(401).send('Unauthorized');
  }
  
  // 2. MUST check idempotency
  const eventId = req.body.entry[0].id;
  if (await isProcessed(eventId)) {
    return res.status(200).send('OK');
  }
  
  // 3. MUST process async (don't block)
  await queue.add('processWebhook', { data: req.body, eventId });
  
  // 4. MUST respond immediately
  res.status(200).send('OK');
});
```

---

## 📋 SHOULD Rules (Best Practices)

### TypeScript Types (SHOULD)
- SHOULD use proper types everywhere
- SHOULD avoid `any` (use `unknown` when needed)
- SHOULD use type guards for runtime validation

### Code Organization (SHOULD)
- SHOULD follow Controller Pattern
- SHOULD keep files small (< 200 lines)
- SHOULD use JSDoc comments for public functions

### Testing (SHOULD)
- SHOULD have unit tests (80%+ coverage)
- SHOULD have integration tests for critical paths
- SHOULD test error cases

### Performance (SHOULD)
- SHOULD cache frequently accessed data (Redis)
- SHOULD use database indexes
- SHOULD implement connection pooling

---

## ❌ Anti-Patterns (NEVER DO)

1. **NEVER** use `process.env.X` directly (use `env.ts`)
2. **NEVER** log PII (patient names, phones, DOBs)
3. **NEVER** log raw request objects (`req`, `res`, `req.body`, `req.headers`) - only derived, sanitized fields
4. **NEVER** use `_next: Function` (use `NextFunction`)
5. **NEVER** skip input validation
6. **NEVER** import Express types in services
7. **NEVER** implement custom JWT (use Supabase Auth)
8. **NEVER** log request body for healthcare routes
9. **NEVER** trust external input
10. **NEVER** use `any` type (use `unknown`)
11. **NEVER** extend raw `Error` class - always extend `AppError`
12. **NEVER** modify multiple persistent resources without transactions

---

## 🔍 Enforcement

These rules are enforced through:
- Code reviews
- Linting (ESLint)
- Type checking (TypeScript strict mode)
- Automated testing
- Documentation review

---

## Task Management & Documentation

### Task Completion Tracking (MANDATORY)

**MUST:** When marking a task as complete (checking `[x]`), you MUST also record the date of completion.

**Format:**
```markdown
- [x] ✅ Task description - **Completed: YYYY-MM-DD**
```

**Example:**
```markdown
- [x] ✅ Create database configuration - **Completed: 2025-01-09**
```

**MUST:** Update task status with completion date:
```markdown
**Status:** ✅ **COMPLETED** - **Completed: YYYY-MM-DD**
```

**Reference:** See [TASK_MANAGEMENT_GUIDE.md](../../task-management/TASK_MANAGEMENT_GUIDE.md) for complete task management rules.

**MUST:** Before creating any new task, review:
1. [TASK_MANAGEMENT_GUIDE.md](../../task-management/TASK_MANAGEMENT_GUIDE.md)
2. [TASK_TEMPLATE.md](../../task-management/TASK_TEMPLATE.md)
3. This STANDARDS.md file
4. [ARCHITECTURE.md](./ARCHITECTURE.md)
5. [RECIPES.md](./RECIPES.md)
6. [COMPLIANCE.md](./COMPLIANCE.md)

---

**Last Updated:** 2025-01-12  
**Status:** ✅ Production-Enforced  
**See Also:** [`ARCHITECTURE.md`](./ARCHITECTURE.md), [`RECIPES.md`](./RECIPES.md), [`COMPLIANCE.md`](./COMPLIANCE.md), [`TASK_MANAGEMENT_GUIDE.md`](../../task-management/TASK_MANAGEMENT_GUIDE.md)
