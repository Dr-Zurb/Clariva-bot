# Learning Topics - Backend Security & Compliance Improvements
## Task #5: Authentication, Middleware Order, and Security Enhancements

---

## 📚 What Are We Learning Today?

Today we're learning about **Backend Security & Compliance Improvements** - implementing authentication middleware, fixing middleware order, adding rate limiting, and enhancing security. Think of it like **installing security systems in a hospital** - you need access control (authentication), proper procedures (middleware order), monitoring (rate limiting), and health checks to ensure everything is working correctly!

We'll learn about:
1. **Authentication Middleware** - Verifying user identity with JWT tokens
2. **Middleware Order** - Why the order matters for security and logging
3. **Rate Limiting** - Preventing abuse (IP-based and user-based)
4. **Auth Event Audit Logging** - Recording all authentication attempts
5. **Health Check Endpoints** - Monitoring system health
6. **Security Best Practices** - Defense in depth approach
7. **Error Handling in Auth** - Proper error responses
8. **Compliance Requirements** - Meeting HIPAA and security standards

---

## 🎓 Topic 1: Authentication Middleware

### What is Authentication Middleware?

**Authentication middleware** is a function that runs before your route handlers to verify that the user is who they claim to be.

**Think of it like:**
- **Hospital ID Badge Checker** - Verifies your ID before allowing access
- **Security Guard** - Checks credentials at the entrance
- **Access Card Reader** - Validates your card before opening doors

### Why Authentication is Critical

**Without authentication:**
- Anyone can access protected routes
- No way to know who is making requests
- Can't enforce access control
- Security vulnerability

**With authentication:**
- Only authorized users can access protected routes
- Know who is making each request
- Can enforce access control (RLS)
- Required for healthcare compliance

**Think of it like:**
- **Without auth** = Hospital with no security (anyone can enter)
- **With auth** = Hospital with ID checks (only authorized staff can enter)

### How Authentication Works

**Step-by-step process:**

1. **Client sends request** with JWT token in Authorization header
   ```
   Authorization: Bearer <jwt-token>
   ```

2. **Middleware extracts token** from header
   - Checks if header exists
   - Checks if it starts with "Bearer "
   - Extracts the token string

3. **Middleware verifies token** with Supabase Auth
   - Calls `supabase.auth.getUser(token)`
   - Supabase validates the JWT token
   - Returns user information if valid

4. **Middleware attaches user** to request
   - Sets `req.user = user`
   - User is now available in route handlers
   - Properly typed via Express type extensions

5. **Middleware calls next()** to continue
   - Request proceeds to route handler
   - Route handler can access `req.user`

**Think of it like:**
- **Step 1** = Showing your ID badge
- **Step 2** = Security guard checking your ID
- **Step 3** = Verifying your ID is valid and not expired
- **Step 4** = Attaching your name tag (so everyone knows who you are)
- **Step 5** = Allowing you to proceed

### Authentication Middleware Implementation

**Basic Structure:**
```typescript
/**
 * Authenticate user using Supabase Auth
 * 
 * Extracts JWT from Authorization header and verifies with Supabase
 * Attaches user to req.user
 * 
 * MUST: Audit log all authentication attempts (success and failure)
 * MUST: Use asyncHandler (not try-catch) - see STANDARDS.md
 */
export const authenticateToken = asyncHandler(
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const correlationId = req.correlationId || 'unknown';
    const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';

    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // Audit log failed authentication attempt
      await logSecurityEvent(
        correlationId,
        undefined,
        'failed_auth',
        'medium',
        ipAddress,
        'Missing or invalid authorization header'
      );
      throw new UnauthorizedError('Missing or invalid authorization header');
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      // Audit log failed authentication attempt
      await logSecurityEvent(
        correlationId,
        undefined,
        'failed_auth',
        'medium',
        ipAddress,
        error?.message || 'Invalid or expired token'
      );
      throw new UnauthorizedError('Invalid or expired token');
    }

    // Attach user to request (properly typed via types/express.d.ts)
    req.user = user;

    // Audit log successful authentication
    await logDataAccess(
      correlationId,
      user.id,
      'authenticate',
      'auth',
      undefined
    );

    next();
  }
);
```

**Key Points:**
- Uses `asyncHandler` wrapper (not try-catch)
- Extracts token from Authorization header
- Verifies with Supabase Auth
- Throws `UnauthorizedError` (401) for failures
- Attaches user to `req.user`
- Audit logs all attempts (success and failure)

**Think of it like:**
- **asyncHandler** = Standard procedure wrapper (handles errors automatically)
- **Token extraction** = Reading the ID badge
- **Supabase verification** = Checking ID against database
- **UnauthorizedError** = "Access denied" message
- **req.user** = Your name tag (available throughout the visit)
- **Audit logging** = Recording who tried to access (for security)

---

## 🎓 Topic 2: Middleware Order - Why It Matters

### What is Middleware Order?

**Middleware order** is the sequence in which middleware functions execute. The order is critical for proper error handling, logging, and security.

**Think of it like:**
- **Hospital Check-in Process** - Must follow specific steps in order
- **Security Checkpoint Sequence** - ID check → Bag check → Metal detector → Entry
- **Medical Procedure Steps** - Must follow steps in correct order for safety

### Why Order Matters

**Critical dependencies:**

1. **correlationId MUST be first**
   - Needed for error logging
   - If body parsing fails, correlation ID still exists
   - Ensures all errors have traceable IDs

2. **requestTiming MUST be second**
   - Needs correlationId for logging
   - Sets `req.startTime` for duration calculation
   - Required by requestLogger

3. **Body parsers MUST come after correlationId**
   - If parsing fails, correlation ID exists for error logging
   - Error responses will include correlation ID

4. **requestLogger MUST come after requestTiming and cors**
   - Needs `req.startTime` for duration
   - Needs `req.correlationId` for tracing
   - Should log after security headers are set

**Think of it like:**
- **correlationId first** = Getting your visitor badge first (before anything else)
- **requestTiming second** = Starting the timer (needs your badge number)
- **Body parsers** = Processing your request (if it fails, we still have your badge)
- **requestLogger** = Recording your visit (needs timer and badge number)

### Correct Middleware Order (STANDARDS.md)

**Required order:**

```
1. correlationId                      // FIRST - Generate correlation ID
2. requestTiming                      // SECOND - Track start time
3. express.json() / express.urlencoded()  // THIRD - Parse request body
4. sanitizeInput                      // FOURTH - Sanitize input
5. compression                        // FIFTH - Compress responses
6. helmet                             // SIXTH - Security headers
7. cors                               // SEVENTH - CORS configuration
8. requestLogger                      // EIGHTH - Log requests
9. requestTimeout                     // NINTH - Prevent hanging requests
10. rateLimit                         // TENTH - Rate limiting
11. routes                            // ELEVENTH - Application routes
12. 404 handler                       // TWELFTH - Catch unmatched routes
13. errorMiddleware                   // THIRTEENTH - Error handling (LAST)
```

**Why this order:**

- **correlationId first** = Ensures ID exists even if body parsing fails
- **Body parsers early** = Parse data before sanitization
- **Security middleware** = Set headers before logging
- **requestLogger late** = Log after everything is set up
- **errorMiddleware last** = Catches all errors

**Think of it like:**
- **correlationId** = Getting visitor badge (first thing)
- **Body parsers** = Processing your request (early, before security checks)
- **Security middleware** = Security checks (helmet, cors)
- **requestLogger** = Recording your visit (after security checks)
- **errorMiddleware** = Final safety net (catches any problems)

### What Happens if Order is Wrong?

**Example: Wrong order (requestLogger before body parsers):**

```typescript
// ❌ WRONG ORDER
app.use(correlationId);
app.use(requestTiming);
app.use(requestLogger);  // Too early! Body not parsed yet
app.use(express.json()); // Body parsing happens after logging
```

**Problems:**
- Request logger might not have access to parsed body
- If body parsing fails, logger might not have correlation ID
- Error handling might not work correctly

**Think of it like:**
- **Wrong order** = Recording your visit before checking your ID (confusing!)
- **Correct order** = Check ID first, then record visit (logical!)

---

## 🎓 Topic 3: Rate Limiting

### What is Rate Limiting?

**Rate limiting** is restricting how many requests a client can make in a given time period. It prevents abuse and protects your API.

**Think of it like:**
- **Hospital Visitor Limits** - Only X visitors per hour per patient
- **Security Checkpoint Queue** - Limits how many people can enter at once
- **Appointment Booking Limits** - Prevents one person from booking all slots

### Why Rate Limiting is Critical

**Without rate limiting:**
- Attackers can send thousands of requests
- Can overwhelm your server (DoS attack)
- Can abuse authentication endpoints (brute force)
- Can cause performance issues

**With rate limiting:**
- Limits requests per IP/user
- Prevents abuse and DoS attacks
- Protects authentication endpoints
- Ensures fair resource usage

**Think of it like:**
- **Without rate limiting** = No limits on visitors (can cause chaos)
- **With rate limiting** = Reasonable limits (prevents abuse)

### Types of Rate Limiting

**1. IP-Based Rate Limiting:**
- Limits requests per IP address
- Used for public endpoints
- Prevents abuse from single IP
- Example: 100 requests per 15 minutes per IP

**2. User-Based Rate Limiting:**
- Limits requests per authenticated user
- Used for protected endpoints
- Requires authentication middleware first
- Example: 1000 requests per 15 minutes per user

**Think of it like:**
- **IP-based** = Limiting visitors per entrance (public areas)
- **User-based** = Limiting actions per staff member (private areas)

### Rate Limiting Implementation

**IP-Based Rate Limiter:**
```typescript
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: env.NODE_ENV === 'production' ? 100 : 1000, // Requests per window
  handler: (req: Request, res: Response) => {
    const error = new TooManyRequestsError('Too many requests from this IP');
    return res.status(429).json(errorResponse({
      code: 'TooManyRequestsError',
      message: error.message,
      statusCode: 429,
    }, req));
  },
  standardHeaders: true, // Include rate limit headers
  legacyHeaders: false,
});
```

**User-Based Rate Limiter:**
```typescript
export const userLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // 1000 requests per 15 minutes per user
  keyGenerator: (req: Request) => {
    // Use user ID if authenticated, fallback to IP
    return req.user?.id || req.ip || 'unknown';
  },
  handler: (req: Request, res: Response) => {
    const error = new TooManyRequestsError('Too many requests');
    return res.status(429).json(errorResponse({
      code: 'TooManyRequestsError',
      message: error.message,
      statusCode: 429,
    }, req));
  },
  standardHeaders: true,
  legacyHeaders: false,
});
```

**Key Points:**
- `windowMs` = Time window (15 minutes)
- `max` = Maximum requests per window
- `keyGenerator` = How to identify the client (IP or user ID)
- `handler` = What to do when limit exceeded (429 error)
- `standardHeaders` = Include rate limit info in response headers

**Think of it like:**
- **windowMs** = Time period (15 minutes)
- **max** = Maximum visits allowed
- **keyGenerator** = How to identify you (by ID badge or entrance)
- **handler** = "Sorry, you've reached your limit" message
- **standardHeaders** = Showing how many visits you have left

### Progressive Rate Limiting

**Progressive rate limiting** means different limits for different scenarios:

1. **Warn** - Approaching limit (80% of max)
2. **Throttle** - Slow down responses (90% of max)
3. **Block** - Reject requests (100% of max)

**Think of it like:**
- **Warn** = "You're visiting frequently, please slow down"
- **Throttle** = "You're visiting too much, wait a bit"
- **Block** = "You've exceeded the limit, come back later"

---

## 🎓 Topic 4: Auth Event Audit Logging

### What is Auth Event Audit Logging?

**Auth event audit logging** is recording all authentication attempts (successful and failed) for security and compliance.

**Think of it like:**
- **Hospital Access Log** - Records who entered and when
- **Security Camera Footage** - Records all access attempts
- **Visitor Log Book** - Tracks all visitors and their purpose

### Why Audit Logging is Required

**Compliance Requirements (COMPLIANCE.md):**
- HIPAA requires audit trails for access
- Must log all authentication attempts
- Must track who accessed what, when
- Required for security investigations

**Security Benefits:**
- Detect brute force attacks
- Identify suspicious access patterns
- Investigate security incidents
- Track user activity

**Think of it like:**
- **Compliance** = Legal requirement (must have audit trail)
- **Security** = Detect problems (who tried to access, when)

### What to Log

**Failed Authentication Attempts:**
- Correlation ID (for tracing)
- IP address (where request came from)
- Error message (why it failed)
- Timestamp (when it happened)
- Severity: 'medium' (security event)

**Successful Authentication:**
- Correlation ID (for tracing)
- User ID (who authenticated)
- Action: 'authenticate'
- Resource Type: 'auth'
- Timestamp (when it happened)

**Think of it like:**
- **Failed attempts** = Recording "John tried to enter but ID was invalid"
- **Successful attempts** = Recording "Jane entered successfully"

### Audit Logging Implementation

**Failed Authentication:**
```typescript
await logSecurityEvent(
  correlationId,
  undefined, // No user ID (authentication failed)
  'failed_auth',
  'medium',
  ipAddress,
  'Invalid or expired token'
);
```

**Successful Authentication:**
```typescript
await logDataAccess(
  correlationId,
  user.id,
  'authenticate',
  'auth',
  undefined // No specific resource ID
);
```

**Key Points:**
- Failed auth uses `logSecurityEvent` (security event)
- Successful auth uses `logDataAccess` (data access event)
- Include correlation ID for tracing
- Include IP address for security
- Never log PHI (only user IDs)

**Think of it like:**
- **logSecurityEvent** = Security incident log (failed attempts)
- **logDataAccess** = Access log (successful authentication)
- **correlationId** = Reference number (for tracing)
- **IP address** = Location (where request came from)

---

## 🎓 Topic 5: Health Check Endpoints

### What is a Health Check Endpoint?

**Health check endpoint** is a special route that returns the status of your application and its dependencies. It's used for monitoring and uptime checks.

**Think of it like:**
- **Hospital Vital Signs Monitor** - Checks if systems are working
- **System Status Dashboard** - Shows what's running and what's not
- **Heartbeat Monitor** - Confirms the system is alive

### Why Health Checks are Important

**Monitoring:**
- Uptime monitoring services ping health endpoint
- Alerts when service is down
- Tracks service availability
- Measures response times

**Debugging:**
- Quick way to check if server is running
- Verify database connectivity
- Check memory usage
- Identify performance issues

**Think of it like:**
- **Monitoring** = Regular checkups (is everything working?)
- **Debugging** = Diagnostic tool (what's wrong?)

### Health Check Response Structure

**Basic Health Check:**
```typescript
{
  status: 'ok' | 'error',
  message: 'Clariva Bot API is running',
  database: {
    connected: true,
    responseTimeMs: 45
  },
  services: {
    supabase: {
      status: 'ok',
      responseTimeMs: 45
    }
  },
  uptime: '2h 15m',
  memory: {
    used: '125mb',
    total: '256mb',
    rss: '180mb'
  },
  timestamp: '2026-01-20T10:30:00Z'
}
```

**Status Codes:**
- **200 OK** = Everything is healthy
- **503 Service Unavailable** = Database or critical service is down

**Think of it like:**
- **200 OK** = "All systems operational"
- **503 Service Unavailable** = "Critical system down, service unavailable"

### Health Check Implementation

**Basic Structure:**
```typescript
export const getHealth = asyncHandler(async (req: Request, res: Response) => {
  // Test database connection
  const dbStartTime = Date.now();
  const dbConnected = await testConnection();
  const dbResponseTime = Date.now() - dbStartTime;

  // Get uptime
  const uptimeSeconds = process.uptime();
  const uptimeFormatted = formatUptime(uptimeSeconds);

  // Get memory usage
  const memoryUsage = process.memoryUsage();

  // Prepare health data
  const healthData = {
    status: dbConnected ? 'ok' : 'error',
    message: dbConnected ? 'Clariva Bot API is running' : 'Service unavailable',
    database: {
      connected: dbConnected,
      responseTimeMs: dbResponseTime,
    },
    services: {
      supabase: {
        status: dbConnected ? 'ok' : 'error',
        responseTimeMs: dbResponseTime,
      },
    },
    uptime: uptimeFormatted,
    memory: {
      used: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}mb`,
      total: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}mb`,
      rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}mb`,
    },
    timestamp: new Date().toISOString(),
  };

  // Return appropriate status code
  if (!dbConnected) {
    res.status(503).json(successResponse(healthData, req));
    return;
  }

  res.status(200).json(successResponse(healthData, req));
});
```

**Key Points:**
- Test database connection
- Measure response times
- Include uptime and memory usage
- Return 503 if critical services are down
- Return 200 if everything is healthy
- Include timestamp for monitoring

**Think of it like:**
- **Database test** = Checking if database is reachable
- **Response time** = How fast the database responds
- **Uptime** = How long the server has been running
- **Memory** = How much memory is being used
- **Status code** = Overall health status

---

## 🎓 Topic 6: Security Best Practices

### Defense in Depth

**Defense in depth** means having multiple layers of security. If one layer fails, others still protect your system.

**Security Layers:**

1. **Network Layer** - HTTPS/TLS encryption
2. **Application Layer** - Authentication middleware
3. **Database Layer** - RLS policies
4. **Storage Layer** - Encryption at rest
5. **Monitoring Layer** - Audit logging and alerts

**Think of it like:**
- **Multiple Security Layers** = Hospital with guards, keycards, locked doors, cameras
- **If one fails** = Other layers still protect
- **Defense in depth** = Multiple barriers to prevent breaches

### Authentication Best Practices

**1. Use Short-Lived Tokens:**
- Access tokens: 15 minutes
- Refresh tokens: 7 days
- Prevents token theft abuse

**2. Validate Tokens on Every Request:**
- Don't cache token validation
- Check expiration on every request
- Verify token signature

**3. Use Secure Token Storage:**
- Web: httpOnly cookies (preferred)
- Mobile: Secure storage (Keychain/Keystore)
- Never: localStorage or plain text

**4. Audit All Authentication Events:**
- Log successful authentications
- Log failed authentication attempts
- Include IP address and correlation ID

**Think of it like:**
- **Short-lived tokens** = ID badges that expire quickly
- **Validate every request** = Check ID badge every time
- **Secure storage** = Keep ID badge in safe place
- **Audit logging** = Record all access attempts

### Rate Limiting Best Practices

**1. Different Limits for Different Endpoints:**
- Public endpoints: Higher limits (100 req/15min)
- Authentication endpoints: Stricter limits (5 req/15min)
- Protected endpoints: User-based limits (1000 req/15min)

**2. Progressive Rate Limiting:**
- Warn at 80% of limit
- Throttle at 90% of limit
- Block at 100% of limit

**3. Audit Rate Limit Violations:**
- Log when limits are exceeded
- Include user ID and IP address
- Track patterns for security analysis

**Think of it like:**
- **Different limits** = Different rules for different areas
- **Progressive limiting** = Gradual restrictions (warn → throttle → block)
- **Audit violations** = Recording who exceeded limits

---

## 🎓 Topic 7: Error Handling in Authentication

### Proper Error Responses

**Authentication errors MUST return 401 Unauthorized:**

```typescript
// ❌ WRONG - Returns 500 Internal Server Error
if (!token) {
  throw new Error('Missing token'); // Wrong error type
}

// ✅ CORRECT - Returns 401 Unauthorized
if (!token) {
  throw new UnauthorizedError('Missing or invalid authorization header');
}
```

**Think of it like:**
- **500 Error** = "Something broke" (confusing!)
- **401 Error** = "You're not authorized" (clear!)

### Error Types for Authentication

**UnauthorizedError (401):**
- Missing Authorization header
- Invalid token format
- Expired token
- Invalid token signature

**Think of it like:**
- **401 Unauthorized** = "Your ID badge is invalid or expired"

### Error Response Format

**Standard Error Response:**
```typescript
{
  success: false,
  error: {
    code: 'UnauthorizedError',
    message: 'Invalid or expired token',
    statusCode: 401
  },
  meta: {
    timestamp: '2026-01-20T10:30:00Z',
    requestId: 'correlation-id-123'
  }
}
```

**Key Points:**
- Use `errorResponse` helper (not manual format)
- Include correlation ID in meta
- Include timestamp
- Clear error message (no PHI)

**Think of it like:**
- **errorResponse helper** = Standardized error format
- **correlation ID** = Reference number for support
- **Clear message** = "Your ID badge is invalid" (not "Token abc123 failed")

---

## 🎓 Topic 8: Middleware Dependencies

### Understanding Dependencies

**Middleware dependencies** are when one middleware needs something from another middleware.

**Critical Dependencies:**

1. **requestLogger needs:**
   - `req.correlationId` (from correlationId middleware)
   - `req.startTime` (from requestTiming middleware)
   - Must come AFTER both

2. **errorMiddleware needs:**
   - `req.correlationId` (for error logging)
   - Must come AFTER correlationId
   - Must be LAST (catches all errors)

3. **sanitizeInput needs:**
   - Parsed body (from express.json middleware)
   - Must come AFTER body parsers

**Think of it like:**
- **requestLogger** = Needs visitor badge and start time (depends on others)
- **errorMiddleware** = Needs visitor badge (depends on correlationId)
- **sanitizeInput** = Needs parsed request (depends on body parsers)

### Dependency Chain

**Visual representation:**

```
correlationId (no dependencies)
    ↓
requestTiming (needs correlationId)
    ↓
body parsers (needs correlationId for error logging)
    ↓
sanitizeInput (needs parsed body)
    ↓
compression (no dependencies)
    ↓
helmet (no dependencies)
    ↓
cors (no dependencies)
    ↓
requestLogger (needs correlationId + startTime)
    ↓
requestTimeout (no dependencies)
    ↓
rateLimit (no dependencies)
    ↓
routes (no dependencies)
    ↓
404 handler (no dependencies)
    ↓
errorMiddleware (needs correlationId, MUST BE LAST)
```

**Think of it like:**
- **Dependency chain** = Step-by-step process (each step needs previous steps)
- **Must follow order** = Can't skip steps (would break dependencies)

---

## 🎓 Topic 9: Using Authentication Middleware

### Protecting Routes

**Basic Usage:**

```typescript
// routes/appointments.ts
import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import { createAppointmentController } from '../controllers/appointment-controller';

const router = Router();

// Protected route - requires authentication
router.post(
  '/appointments',
  authenticateToken, // Authentication middleware
  createAppointmentController
);

export default router;
```

**Think of it like:**
- **authenticateToken** = Security checkpoint (must pass before entering)
- **createAppointmentController** = The actual room (protected area)

### Accessing User in Controllers

**After authentication middleware, user is available:**

```typescript
export const createAppointmentController = asyncHandler(
  async (req: Request, res: Response) => {
    // req.user is available (set by authenticateToken middleware)
    const userId = req.user!.id; // Non-null assertion (we know user exists)
    
    // Use userId for authorization checks
    // Use userId for audit logging
    // Use userId for RLS (database will enforce)
    
    const appointment = await createAppointment({
      ...req.body,
      doctor_id: userId, // Set doctor_id from authenticated user
    }, req.correlationId!, userId);
    
    res.status(201).json(successResponse(appointment, req));
  }
);
```

**Key Points:**
- `req.user` is available after `authenticateToken` middleware
- Use `req.user!.id` (non-null assertion - we know user exists)
- Use userId for authorization, audit logging, and database operations

**Think of it like:**
- **req.user** = Your name tag (available after ID check)
- **req.user.id** = Your employee ID (used for authorization)
- **Non-null assertion** = We know you're authenticated (security checkpoint passed)

### Combining with Rate Limiting

**User-based rate limiting on protected routes:**

```typescript
import { authenticateToken } from '../middleware/auth';
import { userLimiter } from '../index'; // Imported from index.ts

router.post(
  '/appointments',
  authenticateToken, // First: Authenticate user
  userLimiter,       // Second: Rate limit per user
  createAppointmentController
);
```

**Order matters:**
1. **authenticateToken** - Sets `req.user`
2. **userLimiter** - Uses `req.user.id` for rate limiting
3. **Controller** - Uses `req.user` for authorization

**Think of it like:**
- **authenticateToken** = Check your ID badge
- **userLimiter** = Check how many times you've visited (uses your ID)
- **Controller** = Allow you to proceed (uses your ID)

---

## 🎓 Topic 10: Compliance & Security Requirements

### HIPAA Requirements

**Authentication Requirements:**
- Must verify user identity
- Must use secure authentication methods
- Must audit all authentication attempts
- Must enforce access controls

**Rate Limiting Requirements:**
- Must prevent abuse
- Must protect authentication endpoints
- Must audit rate limit violations

**Think of it like:**
- **HIPAA** = Legal requirements (must follow)
- **Authentication** = Verify identity (who are you?)
- **Rate limiting** = Prevent abuse (how many requests?)
- **Audit logging** = Record everything (who did what, when?)

### Security Best Practices

**1. Never Log PHI:**
- Only log user IDs (not names, phones, etc.)
- Only log IP addresses (not exact locations)
- Only log metadata (not sensitive data)

**2. Use Proper Error Messages:**
- Generic messages (don't reveal system details)
- No stack traces in production
- Include correlation ID for support

**3. Validate Everything:**
- Validate tokens before processing
- Validate user permissions
- Validate input data

**Think of it like:**
- **No PHI in logs** = Don't write patient names in visitor log
- **Generic errors** = "Access denied" (not "Token expired at 10:30 AM")
- **Validate everything** = Check ID badge, check permissions, check data

---

## 🎓 Topic 11: Common Patterns & Examples

### Pattern 1: Protected Route

**Basic protected route:**

```typescript
router.get(
  '/appointments',
  authenticateToken, // Require authentication
  getAppointmentsController
);
```

**With user-based rate limiting:**

```typescript
router.post(
  '/appointments',
  authenticateToken, // First: Authenticate
  userLimiter,       // Second: Rate limit
  createAppointmentController
);
```

**Think of it like:**
- **Basic** = ID check required
- **With rate limiting** = ID check + visit limit

### Pattern 2: Public Route

**Public route (no authentication):**

```typescript
router.get(
  '/health',
  getHealthController // No authentication required
);
```

**With IP-based rate limiting:**

```typescript
router.post(
  '/webhooks/instagram',
  apiLimiter,        // IP-based rate limiting
  webhookController  // No authentication (webhook signature verified instead)
);
```

**Think of it like:**
- **Public route** = Anyone can access (like hospital lobby)
- **IP-based rate limiting** = Limit by entrance (not by person)

### Pattern 3: Authentication Endpoint

**Strict rate limiting for auth:**

```typescript
router.post(
  '/auth/login',
  authLimiter,       // Stricter limits (5 req/15min)
  loginController
);
```

**Think of it like:**
- **Strict limits** = Prevent brute force attacks
- **5 req/15min** = Very strict (prevents password guessing)

---

## 🎓 Topic 12: Testing Authentication

### Test Cases

**1. Valid Token:**
- Should succeed
- Should set `req.user`
- Should audit log success

**2. Missing Authorization Header:**
- Should fail with 401
- Should audit log failure
- Should include IP address

**3. Invalid Token Format:**
- Should fail with 401
- Should audit log failure
- Should include error message

**4. Expired Token:**
- Should fail with 401
- Should audit log failure
- Should include "expired" in error

**Think of it like:**
- **Valid token** = Valid ID badge (access granted)
- **Missing header** = No ID badge (access denied)
- **Invalid format** = Fake ID badge (access denied)
- **Expired token** = Expired ID badge (access denied)

---

## 🎓 Topic 13: Real-World Scenarios

### Scenario 1: Doctor Logs In

**Flow:**
1. Doctor sends login request
2. Server validates credentials
3. Server returns JWT token
4. Doctor includes token in future requests
5. Authentication middleware verifies token
6. Request proceeds to route handler

**Think of it like:**
- **Login** = Getting your ID badge
- **JWT token** = Your ID badge
- **Future requests** = Showing your ID badge each time
- **Middleware** = Security guard checking your badge

### Scenario 2: Brute Force Attack

**Attack:**
- Attacker tries many passwords
- Rate limiting blocks after 5 attempts
- Audit logging records all attempts
- Security team investigates

**Protection:**
- Rate limiting prevents abuse
- Audit logging tracks attacks
- Alerts can be configured
- Attack is blocked automatically

**Think of it like:**
- **Brute force** = Trying many passwords
- **Rate limiting** = "Too many attempts, wait 15 minutes"
- **Audit logging** = Recording all attempts
- **Automatic protection** = System blocks attack automatically

### Scenario 3: Token Expires

**Flow:**
1. Doctor makes request with expired token
2. Authentication middleware checks token
3. Supabase returns "token expired" error
4. Middleware throws UnauthorizedError
5. Error middleware returns 401 response
6. Audit log records failed authentication

**Think of it like:**
- **Expired token** = Expired ID badge
- **Middleware** = Security guard notices expiration
- **401 response** = "Your badge expired, get a new one"
- **Audit log** = Recording expired badge attempt

---

## 🎓 Topic 14: Best Practices Summary

### Authentication Best Practices

**✅ DO:**
- Use asyncHandler wrapper
- Audit log all attempts (success and failure)
- Include correlation ID in logs
- Include IP address in security logs
- Use UnauthorizedError for auth failures
- Validate tokens on every request

**❌ DON'T:**
- Use try-catch in middleware (use asyncHandler)
- Log PHI in audit logs
- Return 500 for auth failures (use 401)
- Cache token validation
- Skip audit logging

**Think of it like:**
- **DO** = Follow proper procedures
- **DON'T** = Skip steps or take shortcuts

### Middleware Order Best Practices

**✅ DO:**
- Follow STANDARDS.md order exactly
- Document why order matters
- Verify dependencies are met
- Test error scenarios

**❌ DON'T:**
- Change order without understanding dependencies
- Put requestLogger before body parsers
- Put errorMiddleware before routes
- Skip correlationId middleware

**Think of it like:**
- **DO** = Follow the checklist in order
- **DON'T** = Skip steps or change order

### Rate Limiting Best Practices

**✅ DO:**
- Use different limits for different endpoints
- Audit log rate limit violations
- Use user-based limiting for authenticated routes
- Include rate limit info in response headers

**❌ DON'T:**
- Use same limits for all endpoints
- Skip audit logging for violations
- Apply user-based limiting before auth
- Return generic errors (include helpful info)

**Think of it like:**
- **DO** = Customize limits per area
- **DON'T** = Use one-size-fits-all approach

---

## 🎓 Topic 15: Common Mistakes to Avoid

### Mistake 1: Wrong Middleware Order

**❌ WRONG:**
```typescript
app.use(requestLogger);  // Too early! Body not parsed
app.use(express.json());
```

**✅ CORRECT:**
```typescript
app.use(express.json());
app.use(requestLogger);  // After body parsing
```

**Why it matters:**
- requestLogger needs parsed body for better logging
- If body parsing fails, logger might not have correlation ID

**Think of it like:**
- **Wrong** = Recording visit before processing request
- **Correct** = Process request first, then record visit

### Mistake 2: Missing Audit Logging

**❌ WRONG:**
```typescript
if (!user) {
  throw new UnauthorizedError('Invalid token');
  // Missing audit log!
}
```

**✅ CORRECT:**
```typescript
if (!user) {
  await logSecurityEvent(
    correlationId,
    undefined,
    'failed_auth',
    'medium',
    ipAddress,
    'Invalid or expired token'
  );
  throw new UnauthorizedError('Invalid token');
}
```

**Why it matters:**
- Compliance requirement (must audit all auth attempts)
- Security investigation needs audit logs
- Can't detect attacks without logging

**Think of it like:**
- **Missing log** = No record of failed attempt (can't investigate)
- **With log** = Full record (can investigate security incidents)

### Mistake 3: Using Try-Catch Instead of asyncHandler

**❌ WRONG:**
```typescript
export async function authenticateToken(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // ... auth logic
  } catch (error) {
    next(error); // Manual error handling
  }
}
```

**✅ CORRECT:**
```typescript
export const authenticateToken = asyncHandler(
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // ... auth logic
    // Errors automatically passed to error middleware
  }
);
```

**Why it matters:**
- asyncHandler ensures consistent error handling
- STANDARDS.md requires asyncHandler (not try-catch)
- Less boilerplate code

**Think of it like:**
- **Try-catch** = Manual error handling (more code)
- **asyncHandler** = Automatic error handling (less code, consistent)

---

## 🎓 Topic 16: Integration with Other Systems

### Integration with RLS

**Authentication + RLS = Defense in Depth:**

1. **Authentication middleware** verifies user identity
2. **Sets req.user** for application code
3. **RLS policies** enforce access at database level
4. **Both layers** protect data

**Think of it like:**
- **Authentication** = ID badge check (application layer)
- **RLS** = Locked doors (database layer)
- **Both** = Multiple security layers

### Integration with Audit Logging

**Authentication + Audit Logging:**

1. **Authentication middleware** verifies user
2. **Audit logs** record authentication attempt
3. **Service functions** use userId for operations
4. **Audit logs** record data access/modification

**Think of it like:**
- **Auth middleware** = Check ID badge
- **Auth audit log** = Record ID badge check
- **Service audit log** = Record what you did after entering

### Integration with Rate Limiting

**Authentication + Rate Limiting:**

1. **IP-based rate limiting** for public routes
2. **Authentication middleware** for protected routes
3. **User-based rate limiting** after authentication
4. **Audit logging** for rate limit violations

**Think of it like:**
- **IP-based** = Limit by entrance (public areas)
- **Auth** = Check ID badge (protected areas)
- **User-based** = Limit by person (after ID check)

---

## 🎓 Topic 17: Performance Considerations

### Authentication Performance

**Token Validation:**
- Supabase Auth API call (network request)
- Typically 50-200ms response time
- Consider caching for high-traffic scenarios (future optimization)

**Optimization Tips:**
- Use connection pooling (Supabase handles this)
- Consider token caching (if security allows)
- Monitor authentication latency

**Think of it like:**
- **Network request** = Checking ID badge against database (takes time)
- **Caching** = Remembering valid badges (faster, but less secure)
- **Monitoring** = Tracking how long checks take

### Rate Limiting Performance

**Rate Limiting Overhead:**
- Minimal overhead (in-memory storage)
- Express-rate-limit is efficient
- Doesn't significantly impact performance

**Think of it like:**
- **Minimal overhead** = Quick check (doesn't slow things down)
- **Efficient** = Fast processing

---

## 🎓 Topic 18: Security Considerations

### Token Security

**Token Storage:**
- **Web:** Use httpOnly cookies (prevents XSS attacks)
- **Mobile:** Use secure storage (Keychain/Keystore)
- **Never:** localStorage or plain text

**Token Lifetime:**
- Short-lived access tokens (15 minutes)
- Longer refresh tokens (7 days)
- Prevents token theft abuse

**Think of it like:**
- **httpOnly cookies** = Safe storage (can't be stolen by JavaScript)
- **Secure storage** = Locked safe (mobile devices)
- **Short lifetime** = Expires quickly (less risk if stolen)

### IP Address Security

**Trust Proxy Configuration:**
- Required in production (behind reverse proxy)
- Ensures accurate client IP
- Critical for rate limiting

**Think of it like:**
- **Trust proxy** = Trusting the proxy to tell you real client IP
- **Without trust proxy** = Seeing proxy IP instead of client IP
- **Critical** = Rate limiting needs real IP

---

## 🎓 Topic 19: Monitoring & Observability

### What to Monitor

**Authentication Metrics:**
- Success rate (should be high)
- Failure rate (should be low)
- Response time (should be < 200ms)
- Token expiration rate

**Rate Limiting Metrics:**
- Rate limit violations (should be low)
- Requests per IP/user
- Patterns of abuse

**Think of it like:**
- **Success rate** = How many valid ID badges
- **Failure rate** = How many invalid attempts
- **Response time** = How fast ID checks are
- **Violations** = How many exceeded limits

### Alerting

**When to Alert:**
- Spike in authentication failures (possible attack)
- High rate limit violations (possible abuse)
- Slow authentication response times (performance issue)
- Unusual access patterns (security concern)

**Think of it like:**
- **Spike in failures** = Many invalid ID badges (possible attack)
- **High violations** = Many exceeded limits (possible abuse)
- **Slow responses** = ID checks taking too long (performance issue)

---

## 🎓 Topic 20: Summary & Key Takeaways

### Key Concepts

**1. Authentication Middleware:**
- Verifies user identity with JWT tokens
- Sets `req.user` for route handlers
- Must audit log all attempts
- Must use asyncHandler (not try-catch)

**2. Middleware Order:**
- Order is critical for proper error handling
- correlationId must be first
- requestLogger must come after body parsers
- errorMiddleware must be last

**3. Rate Limiting:**
- IP-based for public routes
- User-based for authenticated routes
- Must audit log violations
- Different limits for different endpoints

**4. Audit Logging:**
- Required for compliance
- Log all authentication attempts
- Log rate limit violations
- Never log PHI

**5. Health Checks:**
- Monitor system health
- Check database connectivity
- Include uptime and memory usage
- Return appropriate status codes

### Best Practices

**✅ Always:**
- Use asyncHandler for middleware
- Audit log authentication attempts
- Follow middleware order exactly
- Use proper error types (UnauthorizedError)
- Include correlation ID in logs

**❌ Never:**
- Skip audit logging
- Change middleware order without understanding
- Log PHI in audit logs
- Use try-catch instead of asyncHandler
- Return 500 for auth failures

**Think of it like:**
- **Always** = Follow the checklist
- **Never** = Skip steps or take shortcuts

---

## 📚 Additional Resources

### Reference Documentation

- [STANDARDS.md](../../Reference/STANDARDS.md) - Middleware order and authentication rules
- [RECIPES.md](../../Reference/RECIPES.md) - Authentication middleware pattern (R-AUTH-001)
- [COMPLIANCE.md](../../Reference/COMPLIANCE.md) - Audit logging requirements
- [API_DESIGN.md](../../Reference/API_DESIGN.md) - Authentication patterns

### Related Learning Files

- [l-task-2-rls-policies.md](./l-task-2-rls-policies.md) - Row-level security
- [l-task-4-database-helpers.md](./l-task-4-database-helpers.md) - Audit logging utilities

---

## 🎯 Practice Exercises

### Exercise 1: Implement Authentication Middleware

**Task:** Create authentication middleware following RECIPES.md R-AUTH-001 pattern.

**Requirements:**
- Extract token from Authorization header
- Verify with Supabase Auth
- Audit log all attempts
- Use asyncHandler wrapper
- Throw UnauthorizedError for failures

### Exercise 2: Fix Middleware Order

**Task:** Reorder middleware in index.ts to match STANDARDS.md exactly.

**Requirements:**
- Follow exact order from STANDARDS.md
- Update comments
- Verify dependencies
- Test error scenarios

### Exercise 3: Add User-Based Rate Limiting

**Task:** Create user-based rate limiter for authenticated routes.

**Requirements:**
- Use user ID if authenticated
- Fallback to IP if not authenticated
- Audit log violations
- Export for use in routes

---

**Last Updated:** 2026-01-20  
**Related Task:** [e-task-5-backend-improvements.md](../Development/Daily-plans/2026-01-20/e-task-5-backend-improvements.md)  
**Version:** 1.0.0
