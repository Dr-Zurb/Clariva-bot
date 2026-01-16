# Utils Directory

## Purpose

This directory contains **utility functions** and helper code that can be reused across the application.

## What Goes Here?

- Error handling utilities
- Validation functions
- Formatting functions (dates, strings, etc.)
- Helper functions (common operations)
- Constants and configuration helpers

## What Does NOT Go Here?

- Business logic (that goes in `services/`)
- Request handlers (that goes in `controllers/`)
- Type definitions (that goes in `types/`)
- Route definitions (that goes in `routes/`)

## File Naming Convention

- Use kebab-case: `errors.ts`, `validation.ts`, `formatters.ts`
- Group related utilities in the same file
- One file per utility category

## Example Files

### errors.ts
Custom error classes and error handling utilities.

```typescript
// utils/errors.ts
export class ValidationError extends AppError {
  constructor(message: string = 'Validation failed') {
    super(message, 400);
  }
}
```

### validation.ts
Input validation functions.

```typescript
// utils/validation.ts
export function validatePhoneNumber(phone: string): boolean {
  // Validation logic
}
```

### formatters.ts
Data formatting functions.

```typescript
// utils/formatters.ts
export function formatDate(date: Date): string {
  // Formatting logic
}
```

## Coding Standards

- ✅ Always use TypeScript types
- ✅ Always include JSDoc comments
- ✅ Keep functions pure when possible (no side effects)
- ✅ Make functions reusable (not tied to specific features)
- ✅ Export functions individually (not as default)

## Usage

```typescript
// In other files
import { ValidationError } from '../utils/errors';
import { validatePhoneNumber } from '../utils/validation';

if (!validatePhoneNumber(phone)) {
  throw new ValidationError('Invalid phone number');
}
```

## Related Directories

- `controllers/` - Uses utilities for validation, formatting
- `services/` - Uses utilities for error handling, validation
- `types/` - Defines types used by utilities
