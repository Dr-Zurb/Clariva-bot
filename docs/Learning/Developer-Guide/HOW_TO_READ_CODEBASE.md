# How to Read the Codebase

**Purpose:** Navigate the Clariva codebase. Know where to look for what.

**How to use:** When you're stuck or exploring, use this as your map.

---

## 🗺️ Project Map

```
clariva-bot/
│
├── backend/                 # 🖥️ ALL SERVER CODE LIVES HERE
│   ├── src/
│   │   ├── index.ts         # App entry point (starts server)
│   │   │
│   │   ├── config/          # ⚙️ CONFIGURATION
│   │   │   ├── env.ts       # Environment variables (validated)
│   │   │   ├── database.ts  # Supabase client setup
│   │   │   ├── logger.ts    # Logging configuration
│   │   │   ├── queue.ts     # BullMQ queue setup
│   │   │   └── payment.ts   # Payment gateway routing
│   │   │
│   │   ├── routes/          # 🛤️ URL → HANDLER MAPPING
│   │   │   ├── index.ts     # Main router (mounts all routes)
│   │   │   ├── health.ts    # GET /health
│   │   │   ├── webhooks.ts  # POST /webhooks/* (Instagram, Razorpay, PayPal)
│   │   │   └── api/
│   │   │       └── v1/
│   │   │           ├── index.ts    # API v1 router
│   │   │           └── payments.ts # /api/v1/payments/*
│   │   │
│   │   ├── controllers/     # 🎮 REQUEST HANDLERS
│   │   │   ├── health-controller.ts
│   │   │   ├── webhook-controller.ts  # Instagram, Razorpay, PayPal webhooks
│   │   │   └── payment-controller.ts
│   │   │
│   │   ├── services/        # 🧠 BUSINESS LOGIC
│   │   │   ├── appointment-service.ts
│   │   │   ├── availability-service.ts
│   │   │   ├── conversation-service.ts
│   │   │   ├── instagram-service.ts
│   │   │   ├── message-service.ts
│   │   │   ├── patient-service.ts
│   │   │   ├── payment-service.ts
│   │   │   └── health-service.ts
│   │   │
│   │   ├── adapters/        # 🔌 EXTERNAL SERVICE ADAPTERS
│   │   │   ├── payment-gateway.interface.ts  # Gateway contract
│   │   │   ├── razorpay-adapter.ts
│   │   │   └── paypal-adapter.ts
│   │   │
│   │   ├── middleware/      # 🚧 MIDDLEWARE (runs before handlers)
│   │   │   ├── auth.ts              # JWT authentication
│   │   │   ├── rate-limiters.ts     # Rate limiting
│   │   │   ├── sanitize-input.ts    # Input sanitization
│   │   │   ├── correlation-id.ts    # Request tracing
│   │   │   ├── request-logger.ts    # Log requests
│   │   │   └── request-timing.ts    # Performance timing
│   │   │
│   │   ├── workers/         # 👷 ASYNC JOB PROCESSORS
│   │   │   └── webhook-worker.ts    # Processes queued webhooks
│   │   │
│   │   ├── types/           # 📝 TYPESCRIPT DEFINITIONS
│   │   │   ├── index.ts
│   │   │   ├── express.ts   # Express type extensions
│   │   │   ├── database.ts  # Database types
│   │   │   ├── instagram.ts
│   │   │   ├── payment.ts
│   │   │   ├── queue.ts
│   │   │   └── webhook.ts
│   │   │
│   │   └── utils/           # 🔧 HELPER FUNCTIONS
│   │       ├── errors.ts           # Error classes
│   │       ├── response.ts         # Response helpers
│   │       ├── async-handler.ts    # Express async wrapper
│   │       ├── validation.ts       # Zod schemas
│   │       ├── audit-logger.ts     # Compliance logging
│   │       ├── encryption.ts       # Encryption helpers
│   │       └── webhook-verification.ts  # Signature verification
│   │
│   ├── migrations/          # 📊 DATABASE SCHEMA CHANGES
│   │   ├── 001_initial_schema.sql
│   │   ├── 002_...sql
│   │   └── ...
│   │
│   ├── tests/               # 🧪 TESTS
│   │   ├── setup.ts         # Test configuration
│   │   ├── unit/
│   │   │   ├── config/
│   │   │   ├── services/
│   │   │   └── controllers/
│   │   └── integration/
│   │
│   ├── .env                 # 🔐 LOCAL SECRETS (not in git)
│   ├── .env.example         # Template for .env
│   └── package.json
│
├── docs/                    # 📚 DOCUMENTATION
│   ├── Reference/           # AI reference docs (standards, patterns)
│   ├── Learning/            # Your learning guides (this folder)
│   │   └── Developer-Guide/
│   ├── Development/         # Task files and plans
│   │   ├── Daily-plans/
│   │   └── Monthly-plans/
│   ├── task-management/     # Task creation rules
│   └── Business files/      # Business plan, pricing
│
└── README.md
```

---

## 🔎 "I want to..." Quick Reference

### Add a new API endpoint

**Files to touch:**

1. **Route:** `src/routes/api/v1/[resource].ts`
   - Define the URL and HTTP method
   - Example: `router.post('/appointments', authenticateJWT, createAppointmentHandler);`

2. **Controller:** `src/controllers/[resource]-controller.ts`
   - Handle the request, call service, return response
   - Uses `asyncHandler`, Zod validation, `successResponse`

3. **Service:** `src/services/[resource]-service.ts`
   - Business logic (database queries, decisions)
   - Called by controller

4. **Validation:** `src/utils/validation.ts`
   - Add Zod schema for request body

5. **Types:** `src/types/[resource].ts`
   - TypeScript interfaces for input/output

**Example flow:**
```
POST /api/v1/appointments
→ routes/api/v1/appointments.ts (route definition)
→ controllers/appointment-controller.ts (handler)
→ services/appointment-service.ts (business logic)
→ database (via Supabase)
```

---

### Handle a new webhook

**Files to touch:**

1. **Route:** `src/routes/webhooks.ts`
   ```typescript
   router.post('/new-provider', webhookLimiter, handleNewProviderWebhook);
   ```

2. **Controller:** `src/controllers/webhook-controller.ts`
   - Add handler following the 5-step pattern (verify → extract ID → idempotency → queue → respond)

3. **Verification:** `src/utils/[provider]-verification.ts`
   - Signature verification logic

4. **Adapter:** `src/adapters/[provider]-adapter.ts`
   - If it's a payment provider, implement `IPaymentGateway`

5. **Worker:** `src/workers/webhook-worker.ts`
   - Add case for processing the webhook job

---

### Add a database table

**Files to touch:**

1. **Migration:** `backend/migrations/XXX_[description].sql`
   - Create table, add columns, add indexes
   - Add RLS policies

2. **Types:** `src/types/database.ts`
   - Add TypeScript interface for the table

3. **Service:** `src/services/[resource]-service.ts`
   - Add functions to query the new table

4. **Documentation:** `docs/Reference/DB_SCHEMA.md`
   - Document the new table

---

### Add environment variable

**Files to touch:**

1. **`.env.example`** — Add placeholder
   ```
   NEW_API_KEY=your_key_here
   ```

2. **`src/config/env.ts`** — Add to Zod schema
   ```typescript
   const envSchema = z.object({
     // ...existing
     NEW_API_KEY: z.string().min(1),
   });
   ```

3. **Your actual `.env`** — Add real value
   ```
   NEW_API_KEY=actual_secret_value
   ```

---

### Fix a bug

**Step 1: Find the correlation ID in logs**

```
error: { correlationId: "abc-123", message: "Failed to create payment" }
```

**Step 2: Trace the flow**

```
Search for "abc-123" in logs
→ See request arrived at POST /webhooks/instagram
→ See it was queued
→ See worker picked it up
→ See payment-service.createPaymentLink called
→ See error thrown at line X
```

**Step 3: Find the file**

Use the flow: webhook → worker → service → adapter

**Step 4: Read the code**

- What is the input?
- What is expected?
- Where does it fail?

---

### Understand a feature

**Example: "How does payment work?"**

1. **Start at the route:** `src/routes/api/v1/payments.ts`
   - See what endpoints exist

2. **Read the controller:** `src/controllers/payment-controller.ts`
   - See what handlers are called

3. **Read the service:** `src/services/payment-service.ts`
   - See business logic (gateway selection, database operations)

4. **Read the adapters:** `src/adapters/razorpay-adapter.ts`, `paypal-adapter.ts`
   - See how each gateway is called

5. **Check the types:** `src/types/payment.ts`
   - See data structures

6. **Read the tests:** `tests/unit/services/payment-service.test.ts`
   - Tests often explain expected behavior

---

## 🔍 Code Reading Tips

### Tip 1: Start at the Entry Point

**For a request:** Start at the route, follow to controller, then service.

**For the app:** Start at `src/index.ts`, see what's initialized.

### Tip 2: Follow the Types

TypeScript types tell you what data looks like:

```typescript
interface CreatePaymentLinkInput {
  appointmentId: string;
  amountMinor: number;  // Amount is in cents/paise
  currency: 'INR' | 'USD'; // Only these currencies allowed
}
```

### Tip 3: Read the Tests

Tests show:
- Expected inputs
- Expected outputs
- Edge cases
- Error cases

```typescript
// This test tells you: selectGatewayByCountry('IN') should return 'razorpay'
it('returns razorpay for India', () => {
  expect(selectGatewayByCountry('IN')).toBe('razorpay');
});
```

### Tip 4: Use "Find All References" (VS Code)

Right-click on a function → "Find All References"

See everywhere it's called. Understand how it's used.

### Tip 5: Check the Reference Docs

```
"How should webhooks work?" → docs/Reference/WEBHOOKS.md
"What error should I throw?" → docs/Reference/ERROR_CATALOG.md
"How to add validation?" → docs/Reference/STANDARDS.md
```

---

## 🏷️ File Naming Conventions

| Pattern | Meaning | Example |
|---------|---------|---------|
| `*-service.ts` | Business logic | `payment-service.ts` |
| `*-controller.ts` | HTTP handlers | `webhook-controller.ts` |
| `*-adapter.ts` | External service wrapper | `razorpay-adapter.ts` |
| `*.interface.ts` | TypeScript interfaces | `payment-gateway.interface.ts` |
| `*.test.ts` | Test file | `payment-service.test.ts` |

---

## 🔗 Related Documents

- [LEARNING_PATH.md](./LEARNING_PATH.md) — Your curriculum
- [CONCEPTS_GLOSSARY.md](./CONCEPTS_GLOSSARY.md) — Key terms
- [../../Reference/ARCHITECTURE.md](../../Reference/ARCHITECTURE.md) — Detailed architecture

---

**Last Updated:** 2026-01-30  
**Version:** 1.0.0
