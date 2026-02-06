# Patterns I Need to Know

**Purpose:** The 10 patterns you'll use 80% of the time in Clariva. Master these first.

**How to use:** When building a feature, check if one of these patterns applies. Copy and adapt.

---

## Pattern 1: Controller → Service → Database

**What:** Code organization. Where to put what.

**Rule:**
- **Controller:** Handles HTTP (parse request, call service, send response)
- **Service:** Contains business logic (validation, decisions, database operations)
- **Database:** Data storage (accessed via Supabase)

**Why:** Separation of concerns. Easy to test. Easy to change.

**Example:**

```typescript
// ❌ BAD: Business logic in controller
export async function createPaymentHandler(req, res) {
  const { appointmentId, amount } = req.body;
  
  // Business logic mixed with HTTP handling
  const gateway = appointmentCountry === 'IN' ? 'razorpay' : 'paypal';
  const { data } = await supabase.from('payments').insert({ ... });
  const link = await razorpay.createPaymentLink({ ... });
  
  res.json({ link });
}

// ✅ GOOD: Controller calls service
export const createPaymentLinkHandler = asyncHandler(async (req, res) => {
  const validated = createPaymentLinkSchema.parse(req.body); // Validate
  const result = await createPaymentLink(validated, req.correlationId); // Call service
  return res.status(201).json(successResponse(result, req)); // Respond
});

// Service contains business logic
export async function createPaymentLink(input, correlationId) {
  const gateway = selectGatewayByCountry(input.doctorCountry);
  const adapter = gateway === 'razorpay' ? razorpayAdapter : paypalAdapter;
  // ... business logic
  return { url, gateway };
}
```

---

## Pattern 2: Zod Validation

**What:** Validate all inputs at the boundary (where data enters your system).

**Why:** Never trust external input. Patients, webhooks, APIs can send anything.

**Example:**

```typescript
import { z } from 'zod';

// Define schema
export const createPaymentLinkSchema = z.object({
  appointmentId: z.string().uuid(),
  amountMinor: z.number().int().positive(),
  currency: z.enum(['INR', 'USD', 'EUR', 'GBP']),
  doctorCountry: z.string().length(2), // ISO country code
});

// In controller, validate early
export const createPaymentLinkHandler = asyncHandler(async (req, res) => {
  const validated = createPaymentLinkSchema.parse(req.body); // Throws if invalid
  // Now `validated` has correct types and values
});
```

**When to use:** Every API endpoint, every webhook handler.

---

## Pattern 3: asyncHandler

**What:** A wrapper that catches errors in async Express handlers.

**Why:** Without it, unhandled Promise rejections crash your server or hang.

**Example:**

```typescript
// ❌ BAD: No error handling
router.post('/payments', async (req, res) => {
  const result = await createPayment(req.body); // If this throws, request hangs
  res.json(result);
});

// ✅ GOOD: asyncHandler catches errors
import { asyncHandler } from '../utils/async-handler';

router.post('/payments', asyncHandler(async (req, res) => {
  const result = await createPayment(req.body); // If this throws, error is caught
  res.json(result);
}));
// Error is passed to Express error handler → returns proper error response
```

**When to use:** Every async route handler.

---

## Pattern 4: Response Contracts

**What:** Consistent response format for all API endpoints.

**Why:** Clients know what to expect. Easy to parse. Professional.

**Success:**
```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "timestamp": "2026-01-30T12:00:00.000Z",
    "requestId": "corr-123"
  }
}
```

**Error:**
```json
{
  "success": false,
  "error": {
    "code": "ValidationError",
    "message": "Invalid phone number format",
    "statusCode": 400
  },
  "meta": { ... }
}
```

**Example:**
```typescript
import { successResponse, errorResponse } from '../utils/response';

// Success
return res.status(200).json(successResponse(data, req));

// Error
return res.status(400).json(errorResponse({
  code: 'ValidationError',
  message: 'Invalid input',
  statusCode: 400,
}, req));
```

---

## Pattern 5: Webhook Processing

**What:** The 5-step pattern for handling webhooks safely.

**Why:** Webhooks can be replayed, spoofed, or arrive out of order. Must handle carefully.

**Steps:**
1. **Verify signature** — Prove webhook is from who it claims
2. **Extract event ID** — For idempotency
3. **Check idempotency** — Already processed? Return 200, skip
4. **Queue job** — Don't process inline (too slow)
5. **Return 200** — Tell sender "received"

**Example:**
```typescript
export const handleRazorpayWebhook = asyncHandler(async (req, res) => {
  // 1. Verify signature
  const signature = req.headers['x-razorpay-signature'] as string;
  if (!verifyRazorpaySignature(signature, req.rawBody, req.correlationId)) {
    throw new UnauthorizedError('Invalid webhook signature');
  }

  // 2. Extract event ID
  const eventId = razorpayAdapter.extractEventId(req.body);

  // 3. Check idempotency
  const existing = await isWebhookProcessed(eventId, 'razorpay');
  if (existing?.status === 'processed') {
    return res.status(200).json(successResponse({ status: 'already_processed' }, req));
  }

  // 4. Queue job
  await markWebhookProcessing(eventId, 'razorpay');
  await webhookQueue.add('razorpay', { payload: req.body, correlationId: req.correlationId });

  // 5. Return 200
  return res.status(200).json(successResponse({ status: 'queued' }, req));
});
```

---

## Pattern 6: Error Classes

**What:** Custom error classes for different error types.

**Why:** Consistent error handling. Correct HTTP status codes. Easy to catch specific errors.

**Error Classes:**
| Class | Status | When to use |
|-------|--------|-------------|
| `ValidationError` | 400 | Invalid input |
| `UnauthorizedError` | 401 | Missing/invalid auth |
| `NotFoundError` | 404 | Resource doesn't exist |
| `ConflictError` | 409 | Duplicate, already exists |
| `TooManyRequestsError` | 429 | Rate limit exceeded |
| `InternalError` | 500 | Unexpected error |

**Example:**
```typescript
import { NotFoundError, ValidationError } from '../utils/errors';

async function getAppointment(id: string, userId: string) {
  const { data } = await supabase.from('appointments').select('*').eq('id', id).single();
  
  if (!data) {
    throw new NotFoundError('Appointment not found'); // 404
  }
  
  if (data.doctor_id !== userId) {
    throw new NotFoundError('Appointment not found'); // 404 (not 403, to avoid info leak)
  }
  
  return data;
}
```

---

## Pattern 7: Environment Variables

**What:** Configuration from `.env` file, validated with Zod.

**Why:** Secrets not in code. Different config per environment. Fail fast if missing.

**Example:**
```typescript
// In config/env.ts
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  RAZORPAY_KEY_ID: z.string().min(1),
  RAZORPAY_KEY_SECRET: z.string().min(1),
  // ... other vars
});

export const env = envSchema.parse(process.env);

// Usage (anywhere in code)
import { env } from '../config/env';

const keyId = env.RAZORPAY_KEY_ID; // Type-safe, validated
```

**Never do:**
```typescript
// ❌ BAD: Direct access, no validation
const keyId = process.env.RAZORPAY_KEY_ID; // Might be undefined
```

---

## Pattern 8: Logging with Correlation ID

**What:** Every log includes correlation ID + relevant metadata (no PHI).

**Why:** Trace requests through entire system. Debug production issues.

**Example:**
```typescript
import { logger } from '../config/logger';

// Good logging
logger.info({
  correlationId,
  action: 'create_payment_link',
  gateway: 'razorpay',
  appointmentId, // ID is okay
  amountMinor: 50000,
}, 'Creating payment link');

// ❌ BAD: PHI in logs
logger.info({
  patientName: 'John Doe', // PHI!
  patientPhone: '+1234567890', // PHI!
}, 'Patient booked');
```

**Rule:** Log IDs, statuses, actions. Never log names, phones, medical info.

---

## Pattern 9: RLS + Ownership Checks

**What:** Row-Level Security in database + manual checks when bypassing RLS.

**Why:** Multi-tenant security. Doctor A can't see Doctor B's data.

**Two scenarios:**

**1. API endpoint (uses anon client with RLS):**
```typescript
// RLS automatically enforces: WHERE doctor_id = auth.uid()
const { data } = await supabase // anon client
  .from('appointments')
  .select('*');
// Returns only current user's appointments
```

**2. Webhook/worker (uses service role, bypasses RLS):**
```typescript
// Service role bypasses RLS - MUST check ownership manually
const { data: appointment } = await supabaseAdmin
  .from('appointments')
  .select('doctor_id')
  .eq('id', appointmentId)
  .single();

if (appointment.doctor_id !== userId) {
  throw new NotFoundError('Appointment not found'); // Manual ownership check
}
```

---

## Pattern 10: Testing (AAA Pattern)

**What:** Arrange, Act, Assert — structure for every test.

**Why:** Readable tests. Easy to understand what's being tested.

**Example:**
```typescript
describe('selectGatewayByCountry', () => {
  it('returns razorpay for India', () => {
    // Arrange (setup)
    const country = 'IN';

    // Act (execute)
    const result = selectGatewayByCountry(country);

    // Assert (verify)
    expect(result).toBe('razorpay');
  });

  it('returns paypal for US', () => {
    // Arrange
    const country = 'US';

    // Act
    const result = selectGatewayByCountry(country);

    // Assert
    expect(result).toBe('paypal');
  });
});
```

**What to test:**
- Happy path (normal usage)
- Edge cases (empty, null, max values)
- Error cases (invalid input, not found)

---

## Quick Reference Card

| Pattern | When to Use | Key File |
|---------|-------------|----------|
| Controller → Service | Every feature | `controllers/*.ts`, `services/*.ts` |
| Zod Validation | Every input | `utils/validation.ts` |
| asyncHandler | Every route | `utils/async-handler.ts` |
| Response Contracts | Every response | `utils/response.ts` |
| Webhook Processing | Every webhook | `controllers/webhook-controller.ts` |
| Error Classes | Every error | `utils/errors.ts` |
| Env Variables | Every config | `config/env.ts` |
| Logging | Every action | `config/logger.ts` |
| RLS + Ownership | Every data access | `services/*.ts` |
| AAA Testing | Every test | `tests/**/*.test.ts` |

---

## 🔗 Related Documents

- [LEARNING_PATH.md](./LEARNING_PATH.md) — Your curriculum
- [CONCEPTS_GLOSSARY.md](./CONCEPTS_GLOSSARY.md) — Key terms
- [COMMON_MISTAKES.md](./COMMON_MISTAKES.md) — What to avoid
- [../../Reference/RECIPES.md](../../Reference/RECIPES.md) — Full code recipes

---

**Last Updated:** 2026-01-30  
**Version:** 1.0.0
