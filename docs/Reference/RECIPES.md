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
9. [Add Request Logging Middleware](#add-request-logging-middleware)
10. [Add Express Request Type Extensions](#add-express-request-type-extensions)
11. [Add Environment Variable](#add-environment-variable)
12. [Add Security Headers (Helmet)](#add-security-headers-helmet)
13. [Add Rate Limiting](#add-rate-limiting)
14. [Configure CORS](#configure-cors)
15. [Add 404 Handler](#add-404-handler)
16. [Add Graceful Shutdown](#add-graceful-shutdown)
17. [Configure Request Body Size Limits](#configure-request-body-size-limits)

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
import { ZodError } from 'zod';
import { AppError, formatError, ValidationError } from '../utils/errors';
import { logger, createLogContext } from '../config/logger';
import { env } from '../config/env';

/**
 * Global error handling middleware
 * MUST be last middleware in the chain
 * MUST: Map ZodError to ValidationError (400) per STANDARDS.md
 */
export function errorHandler(
  err: Error | AppError | ZodError,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Map ZodError to ValidationError (MUST per STANDARDS.md)
  if (err instanceof ZodError) {
    const validationError = new ValidationError(
      `Validation failed: ${err.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')}`
    );
    err = validationError;
  }
  
  // Format error for response
  const formatted = formatError(err, env.NODE_ENV === 'development');
  
  // Log error (without PII) - includes all standard fields
  const logContext = createLogContext(req, {
    statusCode: formatted.statusCode,
    error: formatted.error,
    message: formatted.message,
    ...(env.NODE_ENV === 'development' && formatted.stack ? { stack: formatted.stack } : {}),
  });
  
  logger.error(logContext, 'Error occurred');
  
  // Send error response
  res.status(formatted.statusCode || 500).json({
    error: formatted.error,
    message: formatted.message,
    ...(env.NODE_ENV === 'development' && formatted.stack ? { stack: formatted.stack } : {}),
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

## 9. Add Request Logging Middleware

**When:** You need to log all HTTP requests with standard fields

**Steps:**
1. Create `middleware/request-logger.ts`
2. Listen for `res.on('finish')` event
3. Calculate request duration from `req.startTime`
4. Log with standard fields using `createLogContext`
5. Use appropriate log levels (info/warn/error based on status code)

**Pattern:**
```typescript
// middleware/request-logger.ts
import { Request, Response, NextFunction } from 'express';
import { logger, createLogContext } from '../config/logger';

/**
 * Request logging middleware
 * 
 * Logs all HTTP requests with standard fields (correlationId, path, method, statusCode, durationMs)
 * MUST: Include standard log fields per STANDARDS.md
 */
export function requestLogger(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Log when response finishes (after response is sent)
  res.on('finish', () => {
    // Calculate duration
    const durationMs = req.startTime ? Date.now() - req.startTime : undefined;
    
    // Create log context with standard fields (MUST per STANDARDS.md)
    const logContext = createLogContext(req, {
      statusCode: res.statusCode,
      durationMs,
    });
    
    // Log based on status code (MUST per STANDARDS.md log levels)
    if (res.statusCode >= 500) {
      // Server errors (500+) - log as error
      logger.error(logContext, 'Request completed with server error');
    } else if (res.statusCode >= 400) {
      // Client errors (400-499) - log as warn
      logger.warn(logContext, 'Request completed with client error');
    } else {
      // Success (200-399) - log as info
      logger.info(logContext, 'Request completed');
    }
  });
  
  next();
}
```

```typescript
// index.ts - Mount after request-timing middleware
import { correlationId } from './middleware/correlation-id';
import { requestTiming } from './middleware/request-timing';
import { requestLogger } from './middleware/request-logger';

// Middleware order: correlation → timing → logging → ...
app.use(correlationId);   // First - adds correlationId
app.use(requestTiming);    // Second - adds startTime
app.use(requestLogger);    // Third - logs requests (needs correlationId and startTime)
// ... rest of middleware
```

**Note:** This middleware must be mounted after `requestTiming` middleware, as it depends on `req.startTime` for duration calculation.

---

## 10. Add Express Request Type Extensions

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

## 11. Add Environment Variable

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

## 12. Add Security Headers (Helmet)

**When:** You need to add security headers to HTTP responses

**Steps:**
1. Install: `npm install helmet`
2. Install types: `npm install --save-dev @types/helmet`
3. Import and mount in `index.ts`
4. Configure for production vs development

**Pattern:**
```typescript
// index.ts
import helmet from 'helmet';
import { env } from './config/env';

// Mount after CORS but before routes
app.use(helmet({
  contentSecurityPolicy: env.NODE_ENV === 'production',
  crossOriginEmbedderPolicy: false, // May need to be false for some APIs
  crossOriginResourcePolicy: { policy: 'cross-origin' }, // Allow cross-origin resources
}));
```

**Configuration Options:**
```typescript
app.use(helmet({
  // Enable CSP in production only (can break APIs in dev)
  contentSecurityPolicy: env.NODE_ENV === 'production',
  
  // Disable COEP (may interfere with API responses)
  crossOriginEmbedderPolicy: false,
  
  // Allow cross-origin resources (needed for APIs)
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  
  // Other headers (Helmet enables these by default):
  // - X-Content-Type-Options: nosniff
  // - X-Frame-Options: SAMEORIGIN
  // - X-XSS-Protection: 0 (disabled, modern browsers handle XSS)
  // - Strict-Transport-Security (HSTS) - set by reverse proxy in production
}));
```

**Note:** Helmet adds security headers automatically. In production, you may need to adjust `contentSecurityPolicy` based on your frontend requirements.

---

## 13. Add Rate Limiting

**When:** You need to prevent abuse and DDoS attacks

**Steps:**
1. Install: `npm install express-rate-limit`
2. Install types: `npm install --save-dev @types/express-rate-limit`
3. Create rate limiters (general + strict for auth)
4. Mount in middleware chain (after request logging, before routes)

**Pattern:**
```typescript
// index.ts
import rateLimit from 'express-rate-limit';
import { env } from './config/env';

// General API rate limiter (applies to all routes)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    error: 'TooManyRequestsError',
    message: 'Too many requests from this IP, please try again later.',
  },
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false,
  // Skip successful requests (optional - only count failures)
  skipSuccessfulRequests: false,
});

// Strict rate limiter for authentication endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per 15 minutes (prevents brute force)
  message: {
    error: 'TooManyRequestsError',
    message: 'Too many authentication attempts, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Only count failed auth attempts
});

// Mount general rate limiter (applies to all routes by default)
app.use(apiLimiter);

// Skip rate limiting for health checks (optional)
app.use('/health', (req, res, next) => {
  // Health check should not be rate limited
  next();
});
```

**Usage on Specific Routes:**
```typescript
// routes/auth.ts
import { authLimiter } from '../middleware/rate-limit';

router.post('/login', authLimiter, loginController);
router.post('/register', authLimiter, registerController);
```

**Environment-Based Configuration:**
```typescript
// More lenient in development
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.NODE_ENV === 'production' ? 100 : 1000, // 10x more in dev
  // ... other options
});
```

---

## 14. Configure CORS

**When:** You need to restrict cross-origin requests in production

**Steps:**
1. Create CORS configuration object
2. Allow specific origins in production
3. Allow all origins in development (or specific dev origins)
4. Mount in middleware chain (after security, before parsers)

**Pattern:**
```typescript
// index.ts
import cors from 'cors';
import { env } from './config/env';

const corsOptions = {
  origin: (origin, callback) => {
    // List of allowed origins
    const allowedOrigins = env.NODE_ENV === 'production'
      ? [
          'https://clariva.com',
          'https://www.clariva.com',
          'https://app.clariva.com',
        ]
      : [
          'http://localhost:3000',
          'http://localhost:3001',
          'http://127.0.0.1:3000',
        ];
    
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) {
      return callback(null, true);
    }
    
    // Check if origin is allowed
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true, // Allow cookies/credentials
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Correlation-ID'],
  exposedHeaders: ['X-Correlation-ID'], // Expose custom headers
  maxAge: 86400, // Cache preflight for 24 hours
};

// Use different CORS config for development vs production
app.use(cors(env.NODE_ENV === 'production' ? corsOptions : {}));
```

**Simple Configuration (Development Only):**
```typescript
// For development - allows all origins
app.use(cors());

// For production - restrict to specific origins (use corsOptions above)
```

---

## 15. Add 404 Handler

**When:** You need to handle unmatched routes with proper JSON responses

**Steps:**
1. Add middleware after all routes
2. Before error handler
3. Throw `NotFoundError`
4. Pass to error handler via `next()`

**Pattern:**
```typescript
// index.ts
import { Request, Response, NextFunction } from 'express';
import { NotFoundError } from './utils/errors';

// ... routes ...
app.use('/', routes);

// 404 Handler - Must be AFTER all routes but BEFORE error handler
// Catches all unmatched routes and returns proper JSON 404 response
// MUST: Use NotFoundError (typed error class) per STANDARDS.md
app.use((req: Request, _res: Response, next: NextFunction) => {
  const notFoundError = new NotFoundError(`Route ${req.method} ${req.path} not found`);
  next(notFoundError); // Pass to error handler middleware
});

// Error handling middleware (goes LAST, after all routes and 404 handler)
app.use((err, req, res, next) => {
  // Error handler processes NotFoundError
});
```

**Why This Pattern:**
- Returns JSON (not plain text "Cannot GET /path")
- Uses typed error class (`NotFoundError`)
- Consistent error format with other errors
- Passes through error handler (proper logging, formatting)

---

## 16. Add Graceful Shutdown

**When:** You need to handle server shutdown cleanly (production requirement)

**Steps:**
1. Store server instance from `app.listen()`
2. Listen for SIGTERM and SIGINT signals
3. Close HTTP server gracefully
4. Close database connections
5. Exit process

**Pattern:**
```typescript
// index.ts
import { initializeDatabase } from './config/database';
import { logger } from './config/logger';

let server: ReturnType<typeof app.listen>;

// Initialize database and start server
initializeDatabase()
  .then(() => {
    server = app.listen(PORT, () => {
      logger.info({ port: PORT, environment: env.NODE_ENV }, '🚀 Server is running...');
    });
  })
  .catch((error: Error) => {
    logger.error({ error: error.message, stack: error.stack }, '❌ Failed to start server');
    process.exit(1);
  });

// Graceful shutdown handler
const gracefulShutdown = (signal: string) => {
  logger.info(`Received ${signal}, shutting down gracefully...`);
  
  // Close HTTP server (stop accepting new requests)
  server.close(() => {
    logger.info('HTTP server closed');
    
    // Close database connections if needed
    // Example: await supabase.disconnect();
    
    logger.info('Graceful shutdown complete');
    process.exit(0);
  });
  
  // Force close after 10 seconds
  setTimeout(() => {
    logger.error('Forcing shutdown after timeout...');
    process.exit(1);
  }, 10000);
};

// Listen for termination signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM')); // Docker/K8s sends this
process.on('SIGINT', () => gracefulShutdown('SIGINT'));   // Ctrl+C sends this

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
  logger.error({
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  }, 'Unhandled Promise Rejection');
  
  // In production, exit on unhandled rejections
  if (env.NODE_ENV === 'production') {
    gracefulShutdown('unhandledRejection');
  }
});

// Handle uncaught exceptions
process.on('uncaughtException', (error: Error) => {
  logger.error({
    error: error.message,
    stack: error.stack,
  }, 'Uncaught Exception');
  
  // Always exit on uncaught exceptions
  process.exit(1);
});
```

**Why This Matters:**
- Prevents dropped requests during deployment
- Closes connections cleanly
- Prevents data corruption
- Required for production deployments (Docker, Kubernetes)

---

## 17. Configure Request Body Size Limits

**When:** You need to prevent DoS attacks via large payloads

**Steps:**
1. Set limit in `express.json()`
2. Set limit in `express.urlencoded()`
3. Configure appropriate size (typically 10mb for APIs)

**Pattern:**
```typescript
// index.ts
import express from 'express';

// Configure body size limits
const BODY_SIZE_LIMIT = '10mb'; // Adjust based on your needs

app.use(express.json({ limit: BODY_SIZE_LIMIT })); // Limit JSON body size
app.use(express.urlencoded({ 
  extended: true,
  limit: BODY_SIZE_LIMIT  // Limit form data size
}));
```

**Size Recommendations:**
- `10mb` - Standard for most APIs
- `1mb` - Strict (prevents large uploads)
- `50mb` - If you need file uploads

**Error Handling:**
When limit is exceeded, Express returns `413 Payload Too Large`. You can handle this:

```typescript
// Custom error for payload too large
app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') {
    return res.status(413).json({
      error: 'PayloadTooLargeError',
      message: 'Request entity too large',
    });
  }
  next(err);
});
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

**Last Updated:** January 16, 2025  
**See Also:** [`STANDARDS.md`](./STANDARDS.md), [`ARCHITECTURE.md`](./ARCHITECTURE.md)
