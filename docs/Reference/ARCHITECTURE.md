# Architecture & Folder Structure
## Project Organization & Boundaries

---

## 📁 Project Structure

```
backend/src/
├── config/              ← Configuration files
│   ├── database.ts      ← Supabase client setup (no queries here)
│   ├── env.ts           ← Environment variable validation (Zod)
│   └── logger.ts        ← Logger setup (pino/winston)
│
├── controllers/         ← HTTP request handlers (Controller Pattern)
│   ├── health-controller.ts
│   ├── appointment-controller.ts
│   └── webhook-controller.ts
│
├── routes/              ← Route definitions (mounts controllers)
│   ├── index.ts         ← Route aggregation
│   ├── health.ts        ← Health check routes
│   ├── appointments.ts  ← Appointment routes
│   └── webhooks.ts      ← Webhook routes
│
├── services/            ← Business logic (framework-agnostic)
│   ├── booking-service.ts
│   ├── ai-service.ts
│   └── patient-service.ts
│
├── types/               ← TypeScript type definitions
│   └── index.ts         ← Shared types
│
├── utils/               ← Utility functions
│   ├── errors.ts        ← Error classes
│   ├── async-handler.ts ← Async error handler wrapper
│   └── validation.ts    ← Validation helpers
│
├── middleware/          ← Custom middleware
│   ├── auth.ts          ← Authentication middleware
│   ├── correlation-id.ts ← Request ID middleware
│   └── error-handler.ts ← Error handling middleware
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
| `controllers/` | HTTP request/response handling, input validation | `express`, `services/`, `utils/`, `types/` | `config/database.ts` directly |
| `services/` | Business logic | `types/`, `utils/`, `config/` | `express`, `controllers/`, `routes/` |
| `config/` | Configuration, external connections | `types/`, `utils/` | `express`, `controllers/`, `services/` |
| `utils/` | Helper functions | `types/` | `express`, `controllers/`, `services/` |
| `types/` | Type definitions | Nothing (pure types) | Everything |
| `middleware/` | Custom Express middleware | `express`, `utils/`, `types/` | `controllers/`, `services/` |

---

## 🔒 Architecture Rules

### Rule 1: Services Never Import Express

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

### Rule 2: Controllers Bridge HTTP to Business Logic

**Controllers handle HTTP, services handle logic:**
- Controllers validate input (Zod)
- Controllers call services
- Controllers format HTTP response

**Example:**
```typescript
// ✅ GOOD - Controller bridges HTTP to service
// controllers/appointment-controller.ts
import { Request, Response, NextFunction } from 'express';
import { createAppointmentSchema } from '../utils/validation';
import { createAppointment } from '../services/booking-service';
import { asyncHandler } from '../utils/async-handler';

export const createAppointmentController = asyncHandler(async (req, res) => {
  // 1. Validate input (HTTP layer)
  const validated = createAppointmentSchema.parse(req.body);
  
  // 2. Call service (business logic)
  const appointment = await createAppointment(validated);
  
  // 3. Format response (HTTP layer)
  res.status(201).json({ data: appointment });
});
```

---

### Rule 3: Routes Only Define Paths

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

### Rule 5: Types are Shared

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
  - Error handling middleware
  - Logging middleware

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
8. HTTP 201 { data: appointment }
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

**Last Updated:** January 11, 2025  
**See Also:** [`STANDARDS.md`](./STANDARDS.md), [`RECIPES.md`](./RECIPES.md)
