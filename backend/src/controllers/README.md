# Controllers Directory

## Purpose

This directory contains **controller functions** that handle HTTP requests. Controllers are part of the **Controller Pattern** - an industry-standard architecture pattern.

## What Goes Here?

- Request handler functions (one file per feature/domain)
- HTTP request/response logic
- Input validation (Zod schemas)
- Error handling (asyncHandler wrapper - no try-catch needed)

## What Does NOT Go Here?

- Business logic (that goes in `services/`)
- Database queries (that goes in `services/`)
- Route definitions (that goes in `routes/`)
- Complex validation (that goes in `utils/`)

## Architecture Flow

```
HTTP Request
    ↓
routes/*.ts (defines path)
    ↓
controllers/*.ts (handles request)
    ↓
services/*.ts (business logic)
    ↓
HTTP Response
```

## File Naming Convention

- Use kebab-case: `health-controller.ts`, `appointment-controller.ts`
- One controller file per feature/domain
- Export functions, not classes (functional approach)

## Example

```typescript
// controllers/health-controller.ts
import { Request, Response } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { z } from 'zod';

// Zod schema for input validation (if needed)
const createAppointmentSchema = z.object({
  patientName: z.string().min(1),
  phone: z.string().regex(/^\+?[1-9]\d{1,14}$/),
});

/**
 * Health check controller
 * GET /health
 * 
 * MUST: Use asyncHandler (not manual try/catch) - see STANDARDS.md
 */
export const getHealth = asyncHandler(async (_req: Request, res: Response) => {
  // No try-catch needed - asyncHandler handles errors automatically
  res.json({ status: 'ok' });
});

/**
 * Create appointment controller
 * POST /appointments
 * 
 * MUST: Validate input with Zod before processing - see STANDARDS.md
 */
export const createAppointment = asyncHandler(async (req: Request, res: Response) => {
  // MUST validate before processing
  const validated = createAppointmentSchema.parse(req.body);
  
  // Process validated data
  const appointment = await createAppointmentService(validated);
  res.status(201).json({ data: appointment });
});
```

## Coding Standards

- ✅ Always use TypeScript types (`Request`, `Response`)
- ✅ Always include JSDoc comments
- ✅ Always use `asyncHandler` wrapper (no try-catch needed)
- ✅ Always validate input with Zod schemas before processing
- ✅ Errors are automatically handled by asyncHandler and error middleware

## Related Directories

- `routes/` - Route definitions (mounts controllers)
- `services/` - Business logic (called by controllers)
- `utils/` - Helper functions (used by controllers)
