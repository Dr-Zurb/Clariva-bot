# Types Directory

## Purpose

This directory contains **TypeScript type definitions** used throughout the application. Types help ensure type safety and make code self-documenting.

## What Goes Here?

- API request/response types
- Database model types
- Service function parameter/return types
- Utility types and interfaces
- Shared type definitions

## What Does NOT Go Here?

- Implementation code (that goes in `controllers/`, `services/`, etc.)
- Business logic (that goes in `services/`)
- Route definitions (that goes in `routes/`)

## File Structure

- `index.ts` - Main types file (exports all types)
- Additional files can be created for specific domains (e.g., `database.ts`, `api.ts`)

## Example

```typescript
// types/index.ts

/**
 * Standard API response structure
 */
export interface ApiResponse<T = unknown> {
  data?: T;
  error?: string;
  message?: string;
  timestamp?: string;
}

/**
 * Health check response type
 */
export interface HealthResponse {
  status: string;
  message: string;
  timestamp: string;
}
```

## Coding Standards

- ✅ Use descriptive names (e.g., `AppointmentData`, not `Data`)
- ✅ Add JSDoc comments for complex types
- ✅ Use interfaces for object shapes
- ✅ Use type aliases for unions/primitives
- ✅ Export types from `index.ts` for easy importing

## Usage

```typescript
// In other files
import { ApiResponse, HealthResponse } from '../types';

function getHealth(): HealthResponse {
  return {
    status: 'ok',
    message: 'API is running',
    timestamp: new Date().toISOString(),
  };
}
```

## Related Directories

- `controllers/` - Uses types for request/response
- `services/` - Uses types for function parameters/returns
- `utils/` - Uses types for utility functions
