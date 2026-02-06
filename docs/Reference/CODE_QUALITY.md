# Code Quality & Style Guide

**Purpose:** Naming conventions, TypeScript rules, code organization, and style standards for the Clariva bot. Follow these to keep the codebase clean, consistent, and maintainable.

**Audience:** AI agents and developers.

**Related:** [STANDARDS.md](./STANDARDS.md) | [ARCHITECTURE.md](./ARCHITECTURE.md)

---

## 📝 Naming Conventions

### Files and Directories

**Format:** `kebab-case.ts` (lowercase, hyphens)

```
✅ GOOD:
src/services/appointment-service.ts
src/controllers/webhook-controller.ts
src/utils/async-handler.ts

❌ BAD:
src/services/AppointmentService.ts (PascalCase)
src/controllers/webhook_controller.ts (snake_case)
src/utils/asyncHandler.ts (camelCase)
```

### Functions and Variables

**Format:** `camelCase`

```typescript
// ✅ GOOD
function createPaymentLink(input: CreatePaymentLinkInput) { }
const appointmentId = '123';
const isValid = true;

// ❌ BAD
function CreatePaymentLink(input) { } // PascalCase for functions
const appointment_id = '123'; // snake_case
const is_valid = true; // snake_case
```

### Types and Interfaces

**Format:** `PascalCase`

```typescript
// ✅ GOOD
interface CreatePaymentLinkInput { }
type PaymentGateway = 'razorpay' | 'paypal';
class RazorpayAdapter { }

// ❌ BAD
interface createPaymentLinkInput { } // camelCase
type payment_gateway = 'razorpay' | 'paypal'; // snake_case
```

### Constants

**Format:** `UPPER_SNAKE_CASE` for true constants; `camelCase` for config objects

```typescript
// ✅ GOOD
const MAX_RETRIES = 3;
const WEBHOOK_JOB_NAME = 'process-webhook';
const razorpayConfig = { keyId: '...', keySecret: '...' }; // Config object

// ❌ BAD
const maxRetries = 3; // camelCase for constant
const webhook_job_name = 'process-webhook'; // snake_case
const RAZORPAY_CONFIG = { ... }; // UPPER for object
```

### Database Tables and Columns

**Format:** `snake_case` (PostgreSQL convention)

```sql
-- ✅ GOOD
CREATE TABLE appointments (
  id UUID,
  patient_name TEXT,
  appointment_date TIMESTAMPTZ
);

-- ❌ BAD
CREATE TABLE Appointments ( -- PascalCase
  Id UUID, -- PascalCase
  patientName TEXT, -- camelCase
  appointmentDate TIMESTAMPTZ
);
```

---

## 🎨 TypeScript-Specific Rules

### `type` vs `interface`

**Use `interface` for:**
- Object shapes that might be extended
- API contracts, data models
- When you want declaration merging (rare)

```typescript
// ✅ GOOD - Interface for extensible contract
export interface IPaymentGateway {
  createPaymentLink(input: AdapterCreatePaymentLinkInput): Promise<AdapterCreatePaymentLinkResult>;
}
```

**Use `type` for:**
- Unions, intersections, primitives
- Function types
- Utility types

```typescript
// ✅ GOOD - Type for union
export type PaymentGateway = 'razorpay' | 'paypal';
export type PaymentStatus = 'pending' | 'captured' | 'failed';
```

### `any` vs `unknown`

**PREFER:** `unknown` over `any` (force type checking)

```typescript
// ✅ GOOD - unknown requires type guard
function processPayload(payload: unknown) {
  if (typeof payload === 'object' && payload !== null) {
    // Now TypeScript knows payload is object
  }
}

// ❌ BAD - any disables type checking
function processPayload(payload: any) {
  payload.anything; // No error, but unsafe
}
```

**When `any` is acceptable:**
- External library types are wrong (use `as any` with `eslint-disable-next-line`)
- Quick prototyping (remove before commit)

### Generics

**Use generics for:** Reusable functions/types that work with multiple types

```typescript
// ✅ GOOD - Generic response type
export function successResponse<T>(data: T, req: Request): { success: true; data: T; meta: {...} } {
  return { success: true, data, meta: {...} };
}
```

### Optional Chaining and Nullish Coalescing

**PREFER:** `?.` and `??` for safer null/undefined handling

```typescript
// ✅ GOOD - Safe access
const phone = patient?.phone ?? 'N/A';
const existing = await isWebhookProcessed(eventId);
if (existing?.status === 'processed') { }

// ❌ BAD - Might throw if patient is null
const phone = patient.phone || 'N/A';
```

---

## 📦 Code Organization Within Files

### Import Order

1. Node built-ins (`import fs from 'fs'`)
2. External packages (`import express from 'express'`)
3. Internal absolute imports (if using `@/` alias)
4. Internal relative imports (`import { logger } from '../config/logger'`)
5. Types (`import type { Request } from 'express'`)

```typescript
// ✅ GOOD - Organized imports
import crypto from 'crypto'; // Node
import express from 'express'; // External
import { logger } from '../config/logger'; // Internal
import type { Request, Response } from 'express'; // Types
```

**Group related imports:**

```typescript
// Payment adapters
import { razorpayAdapter } from '../adapters/razorpay-adapter';
import { paypalAdapter } from '../adapters/paypal-adapter';

// Utils
import { asyncHandler } from '../utils/async-handler';
import { ValidationError, InternalError } from '../utils/errors';
```

### Function Order

1. Exported functions (public API)
2. Internal helper functions (private)
3. Constants or config (at top or bottom, consistent per file)

```typescript
// ✅ GOOD - Exported functions first
export async function createPaymentLink(...) { }
export async function processPaymentSuccess(...) { }

// Helpers below (not exported)
function getAdapter(gateway: PaymentGateway) { }
function selectGatewayByCountry(country: string) { }
```

### File Length

**Target:** 200-300 lines per file (exceptions for complex services)

**When file > 500 lines:** Consider splitting:
- Extract helpers to `utils/`
- Split service into multiple domain-specific services
- Move types to `types/`

---

## 💬 Comments and JSDoc

### When to Comment

**Comment when:**
- Business logic is non-obvious ("Why?" not "What?")
- Complex algorithm or edge case handling
- Workarounds for external library issues

**Do not comment:**
- Obvious code (`i++; // increment i`)
- Self-explanatory function names (`createAppointment` doesn't need comment explaining it creates an appointment)

### JSDoc for Exported Functions

**MUST:** Add JSDoc for all exported functions (services, utils, controllers)

```typescript
/**
 * Create payment link for an appointment.
 * Selects gateway by doctor country; stores pending payment for webhook reconciliation.
 *
 * @param input - Create payment link input
 * @param correlationId - Request correlation ID
 * @returns Payment URL and gateway info
 */
export async function createPaymentLink(
  input: CreatePaymentLinkInput,
  correlationId: string
): Promise<CreatePaymentLinkResult> {
  // Implementation
}
```

**Include:**
- Brief description (1-2 sentences)
- `@param` for each parameter
- `@returns` for return value
- `@throws` if function throws specific errors (optional)

---

## 🧹 Code Cleanliness

### No Dead Code

**MUST:** Remove:
- Commented-out blocks (unless marked "TODO: re-enable when X" with task reference)
- Unused imports
- Unused variables or parameters (prefix with `_` if intentionally unused: `_correlationId`)
- Unreachable code

**Tools:**
- ESLint flags unused vars
- TypeScript flags unreachable code
- Manual review during code review

### DRY (Don't Repeat Yourself)

**Extract repeated logic to:**
- Utility functions (`utils/`)
- Shared middleware
- Helper functions within the same file

```typescript
// ✅ GOOD - Extract repeated logic
function formatPaymentAmount(amountMinor: number, currency: string): string {
  return `${currency} ${(amountMinor / 100).toFixed(2)}`;
}

// ❌ BAD - Repeated logic
const formattedRazorpay = `INR ${(amountMinor / 100).toFixed(2)}`;
const formattedPayPal = `USD ${(amountMinor / 100).toFixed(2)}`;
```

### Single Responsibility

**Each function should do one thing:**

```typescript
// ✅ GOOD - Single responsibility
async function createPaymentLink(...) { } // Creates link
async function processPaymentSuccess(...) { } // Processes webhook

// ❌ BAD - Multiple responsibilities
async function handlePayment(...) {
  // Creates link
  // Sends DM
  // Updates appointment
  // Logs audit
}
```

---

## 🎯 Code Review Self-Checklist

Before submitting code (or marking task complete), check:

- [ ] **Naming:** Files kebab-case; functions camelCase; types PascalCase; DB snake_case
- [ ] **TypeScript:** No `any` without `eslint-disable`; prefer `unknown`; use generics where appropriate
- [ ] **Imports:** Organized (Node → external → internal → types)
- [ ] **Comments:** JSDoc for exported functions; inline comments for non-obvious logic
- [ ] **Dead code:** No commented-out blocks, unused imports, or unreachable code
- [ ] **DRY:** No repeated logic; extracted to utils or helpers
- [ ] **Single responsibility:** Each function does one thing
- [ ] **File length:** <500 lines (split if too long)
- [ ] **Consistent:** Follows existing patterns in the codebase

---

## 🔗 Related Documentation

- [STANDARDS.md](./STANDARDS.md) — Coding rules (Zod, asyncHandler, error handling)
- [ARCHITECTURE.md](./ARCHITECTURE.md) — Project structure and layers
- [TESTING.md](./TESTING.md) — Testing patterns
- [CODE_REVIEW.md](./CODE_REVIEW.md) — Code review checklist (when created)

---

**Last Updated:** 2026-01-30  
**Version:** 1.0.0  
**Status:** Active
