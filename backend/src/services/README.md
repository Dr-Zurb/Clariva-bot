# Services Directory

## Purpose

This directory contains **service functions** that handle business logic. Services are called by controllers and contain the core application logic.

## What Goes Here?

- Business logic functions
- Database operations (queries, inserts, updates)
- External API calls (OpenAI, Instagram, etc.)
- Data transformation and processing
- Complex calculations and algorithms

## What Does NOT Go Here?

- HTTP request/response handling (that goes in `controllers/`)
- Route definitions (that goes in `routes/`)
- Type definitions (that goes in `types/`)
- Utility functions (that goes in `utils/`)

## Architecture Flow

```
controllers/*.ts (receives HTTP request)
    ↓
services/*.ts (handles business logic)
    ↓
config/database.ts (database operations)
    ↓
Return data to controller
```

## File Naming Convention

- Use kebab-case: `ai-service.ts`, `booking-service.ts`, `patient-service.ts`
- One service file per feature/domain
- Export functions, not classes (functional approach)

## Example

```typescript
// services/booking-service.ts
import { supabase } from '../config/database';

/**
 * Create a new appointment
 * 
 * @param appointmentData - Appointment data
 * @returns Created appointment
 */
export async function createAppointment(appointmentData: AppointmentData): Promise<Appointment> {
  const { data, error } = await supabase
    .from('appointments')
    .insert(appointmentData)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create appointment: ${error.message}`);
  }

  return data;
}
```

## Coding Standards

- ✅ Always use TypeScript types
- ✅ Always include JSDoc comments
- ✅ Always handle errors (throw or return error)
- ✅ Keep functions focused (single responsibility)
- ✅ Make functions testable (pure functions when possible)

## Related Directories

- `controllers/` - Request handlers (call services)
- `config/` - Configuration (database, etc.)
- `types/` - Type definitions (used by services)
