# Code Recipes (Copy-Pastable Patterns)
## Standard Patterns for Common Tasks

---

## 🎯 Purpose

This file contains copy-pastable code patterns for common tasks. Use these as templates when implementing new features.

**See Also:** [`STANDARDS.md`](./STANDARDS.md) for rules, [`ARCHITECTURE.md`](./ARCHITECTURE.md) for structure.

---

## 📋 Table of Contents

1. [Add a New Route](#add-a-new-route)
2. [Add a New Controller](#add-a-new-controller)
3. [Add a New Service](#add-a-new-service)
4. [Add Input Validation (Zod)](#add-input-validation-zod)
5. [Add a Webhook Endpoint](#add-a-webhook-endpoint)
6. [Add Authentication Middleware](#add-authentication-middleware)
7. [Add Error Handling](#add-error-handling)
8. [Add Request Timing Middleware](#add-request-timing-middleware)
9. [Add Express Request Type Extensions](#add-express-request-type-extensions)
10. [Add Environment Variable](#add-environment-variable)

---

## 1. Add a New Route

**When:** You need a new HTTP endpoint

**Steps:**
1. Create controller in `controllers/`
2. Create route file in `routes/`
3. Mount route in `routes/index.ts`

**Pattern:**
```typescript
// routes/appointments.ts
import { Router } from 'express';
import { 
  createAppointmentController,
  getAppointmentController,
  listAppointmentsController 
} from '../controllers/appointment-controller';
import { authenticateToken } from '../middleware/auth';

const router = Router();

/**
 * Create appointment
 * POST /appointments
 */
router.post(
  '/appointments',
  authenticateToken,
  createAppointmentController
);

/**
 * Get appointment by ID
 * GET /appointments/:id
 */
router.get(
  '/appointments/:id',
  authenticateToken,
  getAppointmentController
);

/**
 * List appointments
 * GET /appointments
 */
router.get(
  '/appointments',
  authenticateToken,
  listAppointmentsController
);

export default router;
```

```typescript
// routes/index.ts
import { Router } from 'express';
import healthRoutes from './health';
import appointmentRoutes from './appointments';
// ... other routes

const router = Router();

router.use('/', healthRoutes);
router.use('/api/v1', appointmentRoutes); // Mount at /api/v1
// ... mount other routes

export default router;
```

---

## 2. Add a New Controller

**When:** You need to handle HTTP requests

**Steps:**
1. Create controller file in `controllers/`
2. Import from services (business logic)
3. Use asyncHandler (recommended - eliminates try-catch boilerplate)
4. Validate input with Zod

**Pattern:**
```typescript
// controllers/appointment-controller.ts
import { Request, Response, NextFunction } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { ValidationError } from '../utils/errors';
import { createAppointmentSchema } from '../utils/validation';
import { createAppointment, getAppointment, listAppointments } from '../services/booking-service';

/**
 * Create appointment controller
 * POST /appointments
 */
export const createAppointmentController = asyncHandler(async (req: Request, res: Response) => {
  // 1. Validate input with Zod
  const validated = createAppointmentSchema.parse(req.body);
  
  // 2. Call service (business logic)
  const appointment = await createAppointment(validated);
  
  // 3. Return response
  res.status(201).json({ data: appointment });
});

/**
 * Get appointment by ID
 * GET /appointments/:id
 */
export const getAppointmentController = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  
  const appointment = await getAppointment(id);
  
  if (!appointment) {
    throw new NotFoundError('Appointment not found');
  }
  
  res.json({ data: appointment });
});

/**
 * List appointments
 * GET /appointments
 */
export const listAppointmentsController = asyncHandler(async (req: Request, res: Response) => {
  const { doctorId } = req.query;
  
  const appointments = await listAppointments({ doctorId: doctorId as string });
  
  res.json({ data: appointments });
});
```

---

## 3. Add a New Service

**When:** You need business logic

**Steps:**
1. Create service file in `services/`
2. Import types (not Express types)
3. Import database config
4. Implement business logic

**Pattern:**
```typescript
// services/booking-service.ts
import { AppointmentData, Appointment } from '../types';
import { supabase } from '../config/database';
import { NotFoundError, InternalError } from '../utils/errors';

/**
 * Create a new appointment
 * 
 * @param data - Appointment data
 * @returns Created appointment
 */
export async function createAppointment(data: AppointmentData): Promise<Appointment> {
  const { data: appointment, error } = await supabase
    .from('appointments')
    .insert(data)
    .select()
    .single();
  
  if (error) {
    throw new InternalError(`Failed to create appointment: ${error.message}`);
  }
  
  return appointment;
}

/**
 * Get appointment by ID
 * 
 * @param id - Appointment ID
 * @returns Appointment or null
 */
export async function getAppointment(id: string): Promise<Appointment | null> {
  const { data: appointment, error } = await supabase
    .from('appointments')
    .select('*')
    .eq('id', id)
    .single();
  
  if (error) {
    if (error.code === 'PGRST116') {
      return null; // Not found
    }
    throw new InternalError(`Failed to get appointment: ${error.message}`);
  }
  
  return appointment;
}

/**
 * List appointments
 * 
 * @param filters - Filter options
 * @returns List of appointments
 */
export async function listAppointments(filters: { doctorId?: string }): Promise<Appointment[]> {
  let query = supabase
    .from('appointments')
    .select('*');
  
  if (filters.doctorId) {
    query = query.eq('doctor_id', filters.doctorId);
  }
  
  const { data: appointments, error } = await query;
  
  if (error) {
    throw new InternalError(`Failed to list appointments: ${error.message}`);
  }
  
  return appointments || [];
}
```

---

## 4. Add Input Validation (Zod)

**When:** You need to validate request data

**Steps:**
1. Create Zod schema
2. Use in controller before calling service
3. Handle validation errors

**Pattern:**
```typescript
// utils/validation.ts
import { z } from 'zod';

/**
 * Create appointment validation schema
 */
export const createAppointmentSchema = z.object({
  patientName: z.string().min(1, 'Patient name is required'),
  phone: z.string().regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number'),
  appointmentDate: z.string().datetime('Invalid date format'),
  reason: z.string().min(1, 'Reason is required'),
  doctorId: z.string().uuid('Invalid doctor ID'),
});

/**
 * Get appointment validation schema (params)
 */
export const getAppointmentParamsSchema = z.object({
  id: z.string().uuid('Invalid appointment ID'),
});

/**
 * List appointments validation schema (query)
 */
export const listAppointmentsQuerySchema = z.object({
  doctorId: z.string().uuid('Invalid doctor ID').optional(),
  page: z.string().transform(Number).pipe(z.number().int().positive()).optional(),
  limit: z.string().transform(Number).pipe(z.number().int().positive().max(100)).optional(),
});
```

```typescript
// controllers/appointment-controller.ts
import { createAppointmentSchema } from '../utils/validation';

export const createAppointmentController = asyncHandler(async (req, res) => {
  // Validate body
  const validated = createAppointmentSchema.parse(req.body);
  
  // Validate params
  const { id } = getAppointmentParamsSchema.parse(req.params);
  
  // Validate query
  const query = listAppointmentsQuerySchema.parse(req.query);
  
  // ... rest of controller
});
```

---

## 5. Add a Webhook Endpoint

**When:** You need to handle webhooks from external services

**Steps:**
1. Verify signature (MUST)
2. Check idempotency (MUST)
3. Enqueue for async processing
4. Return 200 immediately

**Pattern:**
```typescript
// controllers/webhook-controller.ts
import { Request, Response } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { UnauthorizedError } from '../utils/errors';
import { verifyFacebookSignature } from '../utils/webhook-verification';
import { isWebhookProcessed, markWebhookProcessing } from '../services/webhook-service';
import { webhookQueue } from '../config/queue';
import { logger } from '../config/logger';

/**
 * Facebook webhook handler
 * POST /webhooks/facebook
 * 
 * MUST: Verify signature, check idempotency, process async, return 200 quickly
 */
export const facebookWebhookController = asyncHandler(async (req: Request, res: Response) => {
  // 1. MUST: Verify signature FIRST
  if (!verifyFacebookSignature(req)) {
    logger.warn('Invalid webhook signature', { ip: req.ip });
    throw new UnauthorizedError('Invalid webhook signature');
  }
  
  // 2. MUST: Check idempotency
  const eventId = req.body.entry?.[0]?.id;
  if (!eventId) {
    throw new ValidationError('Missing event ID');
  }
  
  if (await isWebhookProcessed(eventId)) {
    logger.info('Webhook already processed', { eventId });
    return res.status(200).json({ message: 'OK' }); // Already processed
  }
  
  // 3. MUST: Mark as processing (prevent duplicates)
  await markWebhookProcessing(eventId);
  
  // 4. MUST: Enqueue for async processing (don't block)
  await webhookQueue.add('processFacebookWebhook', {
    data: req.body,
    eventId,
    platform: 'facebook',
    timestamp: new Date().toISOString(),
  });
  
  // 5. MUST: Respond immediately (< 20 seconds for Facebook)
  res.status(200).json({ message: 'OK' });
});
```

```typescript
// routes/webhooks.ts
import { Router } from 'express';
import { facebookWebhookController } from '../controllers/webhook-controller';

const router = Router();

router.post('/webhooks/facebook', facebookWebhookController);

export default router;
```

---

## 6. Add Authentication Middleware

**When:** You need to protect routes

**Steps:**
1. Extract token from Authorization header
2. Verify with Supabase Auth
3. Attach user to request
4. Continue or reject

**Pattern:**
```typescript
// middleware/auth.ts
import { Request, Response, NextFunction } from 'express';
import { supabase } from '../config/database';
import { UnauthorizedError } from '../utils/errors';

/**
 * Authenticate user using Supabase Auth
 * 
 * Extracts JWT from Authorization header and verifies with Supabase
 * Attaches user to req.user
 */
export async function authenticateToken(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing or invalid authorization header');
    }
    
    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    // Verify token with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      throw new UnauthorizedError('Invalid or expired token');
    }
    
    // Attach user to request (properly typed via types/express.d.ts)
    req.user = user;
    
    next();
  } catch (error) {
    next(error);
  }
}
```

---

## 7. Add Error Handling

**When:** You need to handle errors consistently

**Steps:**
1. Use typed error classes (all extend AppError - never raw Error)
2. Use asyncHandler (recommended - eliminates try-catch boilerplate)
3. Pass errors to middleware (asyncHandler handles this automatically)

**Pattern:**
```typescript
// utils/async-handler.ts
import { Request, Response, NextFunction } from 'express';

/**
 * Wrapper for async route handlers
 * Automatically catches errors and passes them to error middleware
 * 
 * Usage:
 * export const myController = asyncHandler(async (req, res) => {
 *   // No need for try-catch - asyncHandler handles it
 *   const result = await someAsyncOperation();
 *   res.json({ data: result });
 * });
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
```

```typescript
// middleware/error-handler.ts
import { Request, Response, NextFunction } from 'express';
import { AppError, formatError } from '../utils/errors';
import { logger } from '../config/logger';

/**
 * Global error handling middleware
 * MUST be last middleware in the chain
 */
export function errorHandler(
  err: Error | AppError,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Format error for response
  const formatted = formatError(err, process.env.NODE_ENV === 'development');
  
  // Log error (without PII) - includes all standard fields
  const durationMs = req.startTime ? Date.now() - req.startTime : undefined;
  
  logger.error('Request error', {
    correlationId: req.correlationId,  // MUST: Standard field
    path: req.path,                     // MUST: Standard field
    method: req.method,                 // MUST: Standard field
    statusCode: formatted.statusCode,  // MUST: Standard field
    durationMs,                         // MUST: Standard field
    error: formatted.error,
    message: formatted.message,
    // ❌ NEVER log req.body for healthcare routes
  });
  
  // Send error response
  res.status(formatted.statusCode || 500).json({
    error: formatted.error,
    message: formatted.message,
    ...(process.env.NODE_ENV === 'development' && formatted.stack ? { stack: formatted.stack } : {}),
  });
}
```

```typescript
// index.ts
import { errorHandler } from './middleware/error-handler';

// ... routes ...

// Error handler MUST be last
app.use(errorHandler);
```

---

## 8. Add Request Timing Middleware

**When:** You need to track request duration for logging

**Steps:**
1. Create `middleware/request-timing.ts`
2. Set `req.startTime` at request start
3. Calculate duration on response finish
4. Include `durationMs` in all logs

**Pattern:**
```typescript
// middleware/request-timing.ts
import { Request, Response, NextFunction } from 'express';

/**
 * Request timing middleware
 * 
 * Sets req.startTime and calculates durationMs for logging
 * MUST be included in all logs per STANDARDS.md
 */
export function requestTiming(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Set start time
  req.startTime = Date.now();
  
  // Calculate duration when response finishes
  res.on('finish', () => {
    const durationMs = req.startTime ? Date.now() - req.startTime : undefined;
    // Duration is now available in req.startTime for logging
    // Use in error handler or response logging
  });
  
  next();
}
```

```typescript
// index.ts - Mount timing middleware early
import { requestTiming } from './middleware/request-timing';

// Mount timing middleware before routes (so it captures full request)
app.use(requestTiming);

// ... other middleware ...

app.use('/', routes);
```

**Usage in logs:**
```typescript
// In controllers or error handlers
const durationMs = req.startTime ? Date.now() - req.startTime : undefined;

logger.info('Appointment created', {
  correlationId: req.correlationId,
  path: req.path,
  method: req.method,
  statusCode: 201,
  durationMs, // ✅ MUST: Include in all logs
  appointmentId: 'abc123',
});
```

---

## 9. Add Express Request Type Extensions

**When:** You need to add custom properties to Express Request (user, correlationId, etc.)

**Steps:**
1. Create `types/express.d.ts`
2. Extend Express.Request interface
3. Use typed properties instead of `(req as any)`

**Pattern:**
```typescript
// types/express.d.ts
import { User } from '@supabase/supabase-js';

declare global {
  namespace Express {
    interface Request {
      /**
       * Authenticated user (set by auth middleware)
       */
      user?: User;
      
      /**
       * Request correlation ID (set by correlation-id middleware)
       */
      correlationId?: string;
      
      /**
       * Request start time (set by request-timing middleware)
       */
      startTime?: number;
    }
  }
}
```

**Usage:**
```typescript
// ✅ GOOD - Properly typed (no 'as any')
export const createAppointmentController = asyncHandler(async (req, res) => {
  // req.user is properly typed
  const doctorId = req.user?.id;
  
  // req.correlationId is properly typed
  logger.info('Appointment created', {
    correlationId: req.correlationId,
    doctorId,
  });
});

// ❌ BAD - Using 'as any'
const doctorId = (req as any).user?.id;
const correlationId = (req as any).correlationId;
```

---

## 10. Add Environment Variable

**When:** You need a new environment variable

**Steps:**
1. Add to `config/env.ts` schema
2. Use from `config/env.ts` (never `process.env` directly)

**Pattern:**
```typescript
// config/env.ts
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform(Number).default('3000'),
  
  // Database
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  
  // New variable - add here
  NEW_VARIABLE: z.string().min(1), // No default = required
  OPTIONAL_VARIABLE: z.string().optional(), // Optional
  
  // ... other variables
});

// Validate and export
export const env = envSchema.parse(process.env);

// Type for env (useful for TypeScript)
export type Env = z.infer<typeof envSchema>;
```

```typescript
// Use from config/env.ts (not process.env)
import { env } from '../config/env';

const value = env.NEW_VARIABLE; // ✅ GOOD

// ❌ BAD - Never do this:
const value = process.env.NEW_VARIABLE;
```

---

## 🎯 Quick Reference

### File Naming Convention
- Routes: `kebab-case.ts` (e.g., `appointment-controller.ts`)
- Controllers: `kebab-case-controller.ts`
- Services: `kebab-case-service.ts`
- Middleware: `kebab-case.ts` (e.g., `auth.ts`)

### Import Order
1. External libraries (express, zod, etc.)
2. Internal modules (types, utils, config)
3. Services
4. Controllers

### Error Handling
- Use `asyncHandler` for cleaner code
- Use typed error classes (ValidationError, NotFoundError, etc.)
- Always pass errors to `next()`

### Validation
- Always validate with Zod before processing
- Validate body, params, and query separately
- Return 400 with validation errors

---

**Last Updated:** January 11, 2025  
**See Also:** [`STANDARDS.md`](./STANDARDS.md), [`ARCHITECTURE.md`](./ARCHITECTURE.md)
