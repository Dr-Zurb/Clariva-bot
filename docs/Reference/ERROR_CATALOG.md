# Error Catalog
## Prevent Random Error Throwing

**⚠️ CRITICAL: Use these error classes exactly as defined. Do not invent new error types.**

---

## 🎯 Purpose

This file catalogs all error classes and when to use each one.

**This file owns:**
- Error classes
- Status codes
- When to use each
- Message guidelines

**This file MUST NOT contain:**
- Error handling implementation (see RECIPES.md)
- Error response contracts (see CONTRACTS.md)
- Logging rules (see OBSERVABILITY.md)

---

## 📋 Related Files

- [CONTRACTS.md](./CONTRACTS.md) - Error response format
- [RECIPES.md](./RECIPES.md) - Error handling patterns
- [STANDARDS.md](./STANDARDS.md) - Error mapping rules
- [OBSERVABILITY.md](./OBSERVABILITY.md) - Error logging rules

---

## 📚 Error Classes Catalog

### Base Error Class

**Class:** `AppError`

**Status Code:** 500 (default, but subclasses override)

**Properties:**
- `message: string` - Human-readable error message
- `statusCode: number` - HTTP status code
- `isOperational: boolean` - Whether error is expected (default: true)

**When to Use:**
- Never use directly - always use subclass
- Base class for all custom errors

**Example:**
```typescript
// ❌ WRONG - Never use AppError directly
throw new AppError('Something went wrong');

// ✅ CORRECT - Use specific error class
throw new ValidationError('Invalid email format');
```

---

## 🚫 4xx Client Errors

### ValidationError (400)

**Status Code:** 400 Bad Request

**When to Use:**
- Request data is invalid (Zod validation fails)
- Missing required fields
- Invalid data format
- Type mismatches

**Message Guidelines:**
- Be specific about what's wrong
- Include field name if applicable
- Use user-friendly language

**Example:**
```typescript
// Zod validation fails (automatically mapped by error middleware)
const validated = createAppointmentSchema.parse(req.body); // Throws ZodError → ValidationError

// Manual validation
if (!isValidEmail(email)) {
  throw new ValidationError('Invalid email format');
}

if (!phone.match(/^\+?[1-9]\d{1,14}$/)) {
  throw new ValidationError('Invalid phone number format');
}
```

**AI Agents:** Zod validation errors are automatically mapped to ValidationError by error middleware. 

**CRITICAL RULE:** **NEVER catch `ZodError` to throw `ValidationError` manually. Mapping is centralized in error middleware.**

---

### UnauthorizedError (401)

**Status Code:** 401 Unauthorized

**When to Use:**
- Authentication is required but not provided
- Missing or invalid authentication token
- Token expired
- Invalid webhook signature

**Message Guidelines:**
- Do not reveal why authentication failed (security)
- Generic message: "Unauthorized" or "Invalid or expired token"

**Example:**
```typescript
// Missing token
if (!req.headers.authorization) {
  throw new UnauthorizedError('Missing authorization header');
}

// Invalid token
if (!isValidToken(token)) {
  throw new UnauthorizedError('Invalid or expired token');
}

// Invalid webhook signature
if (!verifyWebhookSignature(req)) {
  throw new UnauthorizedError('Invalid webhook signature');
}
```

---

### ForbiddenError (403)

**Status Code:** 403 Forbidden

**When to Use:**
- User is authenticated but doesn't have permission
- Role-based access control (RBAC) violation
- Resource ownership violation

**Message Guidelines:**
- Explain what permission is missing
- Do not reveal existence of resource if user can't access it

**Example:**
```typescript
// User doesn't have permission
if (!user.roles.includes('admin')) {
  throw new ForbiddenError('Admin access required');
}

// User doesn't own resource
if (appointment.userId !== user.id) {
  throw new ForbiddenError('Access denied');
}
```

---

### NotFoundError (404)

**Status Code:** 404 Not Found

**When to Use:**
- Resource doesn't exist
- Route not found
- Resource was deleted

**Message Guidelines:**
- Be specific: "Appointment not found" not just "Not found"
- Do not reveal existence of resource if user can't access it (use 403 instead)

**Example:**
```typescript
// Resource doesn't exist
const appointment = await getAppointment(id);
if (!appointment) {
  throw new NotFoundError('Appointment not found');
}

// Route not found (404 handler)
app.use((req, res, next) => {
  next(new NotFoundError(`Route ${req.method} ${req.path} not found`));
});
```

---

### ConflictError (409)

**Status Code:** 409 Conflict

**When to Use:**
- Resource conflict (duplicate entry)
- Constraint violation (unique key, foreign key)
- Concurrent modification conflict
- Business rule violation (e.g., appointment already booked)

**Message Guidelines:**
- Explain what conflict occurred
- Include conflicting field/value if helpful

**Example:**
```typescript
// Duplicate entry
const existing = await findUserByEmail(email);
if (existing) {
  throw new ConflictError('Email already registered');
}

// Appointment already booked
if (appointment.status === 'booked') {
  throw new ConflictError('Appointment is already booked');
}
```

---

### TooManyRequestsError (429)

**Status Code:** 429 Too Many Requests

**When to Use:**
- Rate limit exceeded
- Too many requests from IP or user
- Brute force protection triggered

**Message Guidelines:**
- Include retry-after information if available
- Generic message is acceptable (rate limiter handles details)

**Example:**
```typescript
// Rate limit exceeded (handled by rate limiter middleware)
// Error thrown automatically by rate limiter

// Manual rate limit check
if (requestCount > maxRequests) {
  throw new TooManyRequestsError('Too many requests, please try again later');
}
```

**See:** [RECIPES.md](./RECIPES.md) "Rate Limiting" section

---

## ⚠️ 5xx Server Errors

### InternalError (500)

**Status Code:** 500 Internal Server Error

**When to Use:**
- Unexpected server error
- Database connection failure
- External API failure (non-retryable)
- Unhandled error that doesn't fit other categories

**Message Guidelines:**
- Generic message: "Internal server error"
- Never expose internal details in production
- Log full error details server-side

**Example:**
```typescript
// Database connection failed
try {
  await supabase.from('appointments').insert(data);
} catch (error) {
  logger.error({ error, correlationId: req.correlationId }, 'Database error');
  throw new InternalError('Internal server error');
}

// External API failure
try {
  await externalApi.call();
} catch (error) {
  if (!isRetryable(error)) {
    throw new InternalError('Service temporarily unavailable');
  }
  throw error; // Retryable errors should be retried, not converted
}
```

**AI Agents:** Only use InternalError when error doesn't fit other categories. Prefer specific error classes when possible.

---

## 🔄 Error Mapping Rules

### Automatic Mapping

**ZodError → ValidationError:**
- Happens automatically in global error middleware
- **CRITICAL:** Controllers/services **MUST NOT** catch `ZodError` explicitly - **NEVER catch `ZodError` to throw `ValidationError`; mapping is centralized in error middleware**
- Let `asyncHandler` catch and forward to error middleware

**Raw Error → InternalError:**
- If error is not AppError subclass → map to InternalError (500)
- Only in production (development may expose stack traces)

**Implementation:**
```typescript
// Error middleware automatically maps:
// - ZodError → ValidationError (400)
// - AppError → Use existing statusCode
// - Raw Error → InternalError (500)
```

**See:** [STANDARDS.md](./STANDARDS.md) "Error Mapping Rule" section

---

## 📋 Error Usage Decision Tree

**When to use which error:**

```
Is request data invalid?
  YES → ValidationError (400)
  NO → Continue

Is authentication missing/invalid?
  YES → UnauthorizedError (401)
  NO → Continue

Is user authenticated but lacks permission?
  YES → ForbiddenError (403)
  NO → Continue

Does resource not exist?
  YES → NotFoundError (404)
  NO → Continue

Is there a conflict (duplicate, constraint)?
  YES → ConflictError (409)
  NO → Continue

Is rate limit exceeded?
  YES → TooManyRequestsError (429)
  NO → Continue

Unexpected server error?
  YES → InternalError (500)
```

---

## ⚠️ Error Message Guidelines

### DO:
- ✅ Be specific: "Invalid email format" not "Invalid input"
- ✅ Include field name: "Name is required" not "Validation failed"
- ✅ Use user-friendly language
- ✅ Be consistent across similar errors

### DO NOT:
- ❌ Expose internal details in production
- ❌ Reveal why authentication failed (security)
- ❌ Include stack traces in production
- ❌ Use technical jargon users won't understand

---

## 📝 Version

**Last Updated:** 2026-01-17  
**Version:** 1.0.0

---

## See Also

- [CONTRACTS.md](./CONTRACTS.md) - Error response format
- [RECIPES.md](./RECIPES.md) - Error handling implementation
- [STANDARDS.md](./STANDARDS.md) - Error mapping rules
- [OBSERVABILITY.md](./OBSERVABILITY.md) - Error logging