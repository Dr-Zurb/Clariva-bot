# Safe Defaults
## Fallback Rules When Unsure

**⚠️ CRITICAL: When in doubt, use these defaults. They minimize risk and prevent accidental violations.**

---

## 🎯 Purpose

This file provides safe fallback defaults when AI agents are uncertain about implementation choices.

**This file owns:**
- Default error handling
- Default authentication behavior
- Default logging behavior
- Default data handling
- Default async processing

**This file MUST NOT contain:**
- New rules (those belong in STANDARDS.md)
- Implementation patterns (those belong in RECIPES.md)
- Conflict resolution (see DECISION_RULES.md)

---

## 📋 Related Files

- [STANDARDS.md](./STANDARDS.md) - Explicit rules (override these defaults)
- [DECISION_RULES.md](./DECISION_RULES.md) - Conflict resolution
- [ERROR_CATALOG.md](./ERROR_CATALOG.md) - Error classes
- [COMPLIANCE.md](./COMPLIANCE.md) - PHI handling requirements

---

## 🔒 Default Rules (Use When Unsure)

### Default Error → InternalError

**Rule:** When error type is unclear, use `InternalError` (500).

**Rationale:**
- InternalError is catch-all for unexpected errors
- Better to log as error than ignore
- Can be refined later based on actual error patterns

**Example:**
```typescript
// Unsure what error to throw
try {
  await someOperation();
} catch (error) {
  // Default to InternalError
  throw new InternalError('Operation failed');
}

// Later: Refine based on actual error types
// throw new ValidationError('Invalid input');
// throw new NotFoundError('Resource not found');
```

**Override:** Use specific error type if you know it (ValidationError, NotFoundError, etc.)

---

### Default Auth → Required

**Rule:** When authentication requirement is unclear, assume authentication is REQUIRED.

**Rationale:**
- Safer to require auth than accidentally expose endpoints
- Easier to make public later than to secure after breach
- Healthcare data requires strong security

**Example:**
```typescript
// Unsure if endpoint needs auth
// Default: Require auth
router.get('/appointments', authenticateToken, getAppointmentsController);

// If truly public, explicitly mark as public
router.get('/health', getHealthController); // Public endpoint
```

**Override:** Only make public if explicitly documented as public endpoint.

---

### Default Logging → Minimal + IDs Only

**Rule:** When unsure what to log, log minimal metadata + IDs only.

**Rationale:**
- Prevents accidental PII leakage
- IDs enable tracing without exposing data
- Minimal logs are safer than verbose logs

**Default Fields:**
- `correlationId` (required)
- `resourceId` (if applicable)
- `userId` (if applicable)
- `action` (what happened)
- `status` (success/failure)

**Example:**
```typescript
// Unsure what to log
// Default: Minimal + IDs only
logger.info('Operation completed', {
  correlationId: req.correlationId,
  resourceId: appointment.id,
  userId: req.user?.id,
  action: 'create_appointment',
  status: 'success',
  // ❌ DON'T: patientName, patientPhone, req.body
});
```

**Override:** Add more fields only if explicitly safe (no PII) and necessary.

---

### Default Data Handling → Assume PHI

**Rule:** When unsure if data contains PHI, assume it DOES contain PHI.

**Rationale:**
- Healthcare context means data likely contains PHI
- Safer to treat as PHI than accidentally expose
- Better to over-protect than under-protect

**Default Behavior:**
- Encrypt at rest
- Never log
- Never include in error messages
- Never expose in responses (unless required)
- Redact before external AI calls

**Example:**
```typescript
// Unsure if field contains PHI
// Default: Treat as PHI
const patientData = {
  name: req.body.name, // Assume PHI
  phone: req.body.phone, // Assume PHI
};

// Never log patientData
// Never include in error messages
// Encrypt before storing
```

**Override:** Only if explicitly documented as non-PHI and verified.

---

### Default Async → Queue It

**Rule:** When unsure if operation should be async, make it async (queue it).

**Rationale:**
- Better to queue than block request
- Easier to make synchronous later than to add queuing later
- Improves response times

**Example:**
```typescript
// Unsure if operation should be async
// Default: Queue it
export const createAppointment = asyncHandler(async (req, res) => {
  // Fast: Create appointment (synchronous)
  const appointment = await createAppointmentService(validated);
  
  // Slow: Send notification (queue it)
  await notificationQueue.add({
    appointmentId: appointment.id,
    type: 'appointment_created',
  });
  
  // Return immediately
  return res.status(201).json(successResponse(appointment, req));
});
```

**Override:** Only make synchronous if operation is fast (< 100ms) and required for response.

---

### Default Validation → Strict

**Rule:** When unsure about validation rules, use strict validation.

**Rationale:**
- Better to reject invalid data than accept it
- Easier to relax rules later than to tighten them
- Prevents security issues from malformed data

**Default Validation:**
- Reject unknown fields
- Require all fields (unless optional explicitly)
- Validate types strictly
- Validate formats (email, phone, etc.)

**Example:**
```typescript
// Unsure about validation strictness
// Default: Strict validation
const schema = z.object({
  name: z.string().min(1).max(100), // Strict length
  email: z.string().email().strict(), // Strict email format
  phone: z.string().regex(/^\+?[1-9]\d{1,14}$/), // Strict phone format
}).strict(); // Reject unknown fields
```

**Override:** Only relax validation if explicitly required by business rules.

---

### Default Response → Canonical Format

**Rule:** When unsure about response format, use canonical format.

**Rationale:**
- Consistent API responses
- Required by CONTRACTS.md
- Better to follow standard than invent format

**Default Format:**
```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "timestamp": "...",
    "requestId": "..."
  }
}
```

**Example:**
```typescript
// Unsure about response format
// Default: Canonical format
return res.status(200).json(successResponse(data, req));
// Always includes success, data, meta
```

**Override:** Never override - canonical format is mandatory (CONTRACTS.md).

---

### Default Timeouts (Operational Defaults)

**Rule:** When unsure about timeout values, use these defaults:

**HTTP Request Timeout:**
- Default: **10-15 seconds**
- Rationale: Balance between user experience and resource usage
- Use for: External API calls, webhook processing

**Database Query Timeout:**
- Default: **3-5 seconds**
- Rationale: DB queries should be fast; longer indicates problem
- Use for: All Supabase queries

**External API Timeout:**
- Default: **3-8 seconds**
- Rationale: External services may be slow; fail fast to avoid blocking
- Use for: Third-party API calls (AI services, payment processors)

**Example:**
```typescript
// Default timeouts
const HTTP_TIMEOUT = 12000; // 12 seconds
const DB_TIMEOUT = 4000; // 4 seconds
const EXTERNAL_API_TIMEOUT = 5000; // 5 seconds

// Use in fetch calls
const response = await fetch(url, {
  signal: AbortSignal.timeout(EXTERNAL_API_TIMEOUT),
});
```

**Override:** Adjust based on specific service SLAs and requirements.

---

### Default Retry Policy

**Rule:** When unsure about retries, use this default policy:

**Retry Rules:**
- **Retry only idempotent operations** (GET, safe operations)
- **Never retry writes unless idempotency key exists**
- **Max retries:** 3 attempts
- **Backoff:** Exponential (1s, 2s, 4s)

**Rationale:**
- Retries can cause duplicates if not idempotent
- Writes without idempotency keys risk data corruption
- Exponential backoff prevents hammering failing services

**Example:**
```typescript
// Default retry policy
const retryConfig = {
  maxRetries: 3,
  backoff: 'exponential', // 1s, 2s, 4s
  retryable: (error) => {
    // Only retry on network errors, not validation errors
    return error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT';
  },
};

// ✅ GOOD - Idempotent operation (safe to retry)
await fetch(`/api/appointments/${id}`, { method: 'GET' }); // Can retry

// ❌ BAD - Write without idempotency key (don't retry)
await createAppointment(data); // Don't retry unless idempotency key exists

// ✅ GOOD - Write with idempotency key (safe to retry)
await createAppointment(data, { idempotencyKey: req.correlationId }); // Can retry
```

**Override:** Adjust based on operation criticality and idempotency guarantees.

---

### Default Transaction Rule

**Rule:** If an operation writes to >1 table, default to a DB transaction unless explicitly safe not to.

**Rationale:**
- Prevents partial updates (data inconsistency)
- Ensures atomicity (all-or-nothing)
- Supabase doesn't support multi-statement transactions, so use compensating logic or idempotency

**Default Behavior:**
- **2+ table writes** → Use transaction (or compensating logic)
- **1 table write** → No transaction needed
- **Read-only operations** → No transaction needed

**Example:**
```typescript
// Default: Use transaction for multi-table writes
// Note: Supabase doesn't support transactions, so use compensating logic
export const createAppointmentWithNotification = async (data) => {
  // Write 1: Create appointment
  const appointment = await supabase
    .from('appointments')
    .insert(data)
    .select()
    .single();
  
  // Write 2: Create audit log
  // If this fails, we need to rollback appointment (compensating logic)
  try {
    await supabase
      .from('audit_logs')
      .insert({
        action: 'create_appointment',
        resource_id: appointment.id,
      });
  } catch (error) {
    // Compensating logic: Delete appointment if audit log fails
    await supabase
      .from('appointments')
      .delete()
      .eq('id', appointment.id);
    throw error;
  }
  
  return appointment;
};
```

**Override:** Skip transaction only if explicitly documented as safe (e.g., independent writes that can be reconciled later).

---

### Default Error Handling → Throw Typed Error

**Rule:** When unsure how to handle error, throw typed error (don't return null/undefined).

**Rationale:**
- Errors should be explicit, not hidden
- Typed errors enable proper error middleware handling
- Better to fail loudly than silently

**Example:**
```typescript
// Unsure how to handle error
// Default: Throw typed error
const resource = await getResource(id);
if (!resource) {
  // Default: Throw error (not return null)
  throw new NotFoundError('Resource not found');
}

// Later: Refine based on business rules
// if (!resource && allowMissing) return null;
```

**Override:** Only return null/undefined if explicitly documented as acceptable.

---

### Default Middleware Order → Follow STANDARDS

**Rule:** When unsure about middleware order, follow STANDARDS.md exactly.

**Rationale:**
- STANDARDS.md defines exact order
- Correct order is critical for functionality
- Never deviate from STANDARDS.md order

**Default Order:**
1. correlationId
2. requestTiming
3. body parsers
4. sanitizeInput
5. compression
6. helmet
7. cors
8. requestLogger
9. rateLimit
10. routes
11. 404 handler
12. errorMiddleware

**Example:**
```typescript
// Unsure about middleware order
// Default: Follow STANDARDS.md exactly
app.use(correlationId);
app.use(requestTiming);
app.use(express.json());
// ... (follow exact order from STANDARDS.md)
```

**Override:** Never override - middleware order is non-negotiable.

---

### Default Testing → Unit + Integration

**Rule:** When unsure what tests to write, write both unit and integration tests.

**Rationale:**
- Comprehensive coverage
- Unit tests catch logic errors
- Integration tests catch wiring errors
- Better to over-test than under-test

**Default Tests:**
- Unit test for service function
- Integration test for endpoint (Supertest)
- Test success case
- Test error cases
- Test edge cases

**Example:**
```typescript
// Unsure what tests to write
// Default: Unit + Integration

// Unit test
describe('createAppointmentService', () => {
  it('should create appointment', async () => {
    // Test service logic
  });
});

// Integration test
describe('POST /appointments', () => {
  it('should create appointment', async () => {
    // Test full endpoint
  });
});
```

**Override:** Skip E2E tests unless critical workflow.

---

## 🚨 When NOT to Use Defaults

**Do NOT use defaults when:**

1. **Explicit rule exists** - Follow explicit rule (STANDARDS.md, CONTRACTS.md)
2. **Pattern exists** - Use pattern from RECIPES.md
3. **User specifies** - Follow user's explicit instructions
4. **Compliance requires** - Follow COMPLIANCE.md requirements

**Defaults are fallbacks, not primary guidance.**

---

## 📝 Version

**Last Updated:** 2026-01-17  
**Version:** 1.0.0

---

## See Also

- [STANDARDS.md](./STANDARDS.md) - Explicit rules (override defaults)
- [DECISION_RULES.md](./DECISION_RULES.md) - "If unsure, choose X"
- [ERROR_CATALOG.md](./ERROR_CATALOG.md) - Error classes
- [COMPLIANCE.md](./COMPLIANCE.md) - PHI handling
- [EXTERNAL_SERVICES.md](./EXTERNAL_SERVICES.md) - External service integration patterns