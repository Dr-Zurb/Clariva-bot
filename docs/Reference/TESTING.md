# Testing Guide
## Testing Strategy, Patterns & Best Practices

---

## ⚠️ DO NOT Violate Response Contracts in Tests

**AI Agents MUST NOT:**
- ❌ Assert `{ data: ... }` format - **MUST** assert canonical `{ success: true, data: {...}, meta: {...} }`
- ❌ Expect manual error formats - **MUST** expect canonical error format from STANDARDS.md
- ❌ Skip asserting `meta.requestId` - **MUST** verify request ID is present

**ALWAYS:**
- ✅ Assert full canonical response format
- ✅ Verify `success`, `data`, and `meta` are present
- ✅ Check `meta.requestId` matches correlation ID

**See:** [STANDARDS.md](./STANDARDS.md) "Canonical Contracts" section for exact format.

---

## 📌 Rule vs Example Policy

**CRITICAL FOR AI AGENTS:**

- **Text outside code blocks** = **ENFORCEMENT RULES** (testing requirements)
- **Code blocks** = **ILLUSTRATIVE EXAMPLES ONLY** (show pattern, adapt to context)
- **If an example conflicts with rules, the rule always wins**

**Rationale:**
- Prevents AI from treating examples as mandatory implementation
- Test code must be adapted to actual codebase context

**AI Agents:** 
- Follow rules (text) exactly (test requirements)
- Use examples (code blocks) as pattern guidance
- Adapt test code to match actual implementation

---

## 🎯 Purpose

This document defines testing strategies, patterns, and best practices for the Clariva Bot API. Follow these guidelines to ensure reliable, maintainable, and comprehensive test coverage.

**Related Files:**
- [STANDARDS.md](./STANDARDS.md) - Coding rules (testing requirements)
- [ARCHITECTURE.md](./ARCHITECTURE.md) - Project structure
- [RECIPES.md](./RECIPES.md) - Implementation patterns
- [CODING_WORKFLOW.md](./CODING_WORKFLOW.md) - Coding process

---

## ⚠️ Source of Truth

**IMPORTANT:** This file complements STANDARDS.md. STANDARDS.md mentions testing requirements (SHOULD have 80%+ coverage), and this file provides detailed guidance on how to achieve that.

---

## 🚨 PII Handling in Tests (MANDATORY)

**CRITICAL RULES FOR AI AGENTS:**

**Tests must NOT use real PHI:**
- **MUST** use obvious fake placeholders: `'PATIENT_TEST'`, `'+10000000000'`, `'TEST_EMAIL@example.com'`
- **MUST NOT** use real patient names, phones, DOBs, or other PHI in test data
- **MUST NOT** assert raw PHI values unless endpoint explicitly returns them (prefer structure assertions)
- **MUST** disable verbose body dumps in test failures (use `--silent` or configure Jest)

**Test Failure Safety:**
- Test snapshots and debug output often leak values
- Use fake placeholders to prevent accidental PHI exposure
- Prefer `expect.any(String)` over asserting exact PHI values

**Example:**
```typescript
// ❌ BAD - Real PHI in tests
const data = { patientName: 'John Doe', phone: '+1234567890' };

// ✅ CORRECT - Fake placeholders
const data = { patientName: 'PATIENT_TEST', phone: '+10000000000' };

// ✅ CORRECT - Assert structure, not values
expect(response.body.data).toMatchObject({
  id: expect.any(String),
  patientName: expect.any(String), // Not exact value
  phone: expect.any(String), // Not exact value
});
```

**E2E Test Rule:**
- E2E tests must NOT assert raw PHI echo unless endpoint explicitly returns it
- Prefer asserting response structure and IDs over PHI values

---

## 🤖 AI Test Discipline

**If you are an AI coding assistant, follow these testing rules:**

### Testing Mandates for AI Agents

- **NEVER skip tests for speed** - Tests are non-negotiable
- **NEVER reduce coverage to satisfy deadlines** - Maintain 80%+ coverage minimum
- **NEVER create features without tests** - Code and tests must be created together
- **PREFER failing tests over silent behavior** - Better to have a test that fails than no test
- **IF unsure how to test, create a failing test and ask** - Don't skip testing due to uncertainty

### Test Creation Rules

**MUST:**
- Create unit tests for all utility functions
- Create integration tests for all API endpoints
- Test error cases (validation failures, not found, etc.)
- Test edge cases (null, undefined, empty strings)
- Use existing test patterns from this file

**MUST NOT:**
- Skip tests because "it's simple code"
- Reduce test coverage for convenience
- Create tests that don't actually verify behavior
- Mock everything (test real behavior when possible)

**When in doubt:**
1. Look at existing tests for patterns
2. Write the test first (TDD approach)
3. Test the behavior, not the implementation
4. Ask for clarification if testing approach is unclear

---

## 📋 Table of Contents

1. [Test Ownership Rules](#2-test-ownership-rules)
2. [Testing Pyramid](#2-testing-pyramid)
3. [Test Organization](#3-test-organization)
4. [Unit Testing](#4-unit-testing)
5. [Integration Testing](#5-integration-testing)
6. [End-to-End Testing](#6-end-to-end-testing)
7. [Test Utilities & Helpers](#7-test-utilities--helpers)
8. [Mocking Strategies](#8-mocking-strategies)
9. [Test Coverage](#9-test-coverage)
10. [Testing Checklist](#10-testing-checklist)
11. [Common Testing Patterns](#11-common-testing-patterns)

---

## 2. Testing Pyramid

### Test Distribution

```
        /\
       /  \
      / E2E \          ← Few tests (critical paths)
     /--------\
    /          \
   /Integration \      ← Some tests (API endpoints, services)
  /--------------\
 /                \
/    Unit Tests     \  ← Many tests (utilities, pure functions)
\--------------------/
```

### Test Type Guidelines

**Unit Tests (80% of tests):**
- Test individual functions/modules in isolation
- Fast execution (< 100ms per test)
- No external dependencies (database, APIs)
- Mock all external calls

**Integration Tests (15% of tests):**
- Test components working together
- May use test database
- Test API endpoints with real middleware
- Slower execution (< 2s per test)

**E2E Tests (5% of tests):**
- Test complete user workflows
- Use real/test database
- Test full request/response cycle
- Slowest execution (< 10s per test)

---

## 3. Test Organization

### Directory Structure

```
backend/
├── src/
│   ├── controllers/
│   ├── services/
│   └── utils/
└── tests/
    ├── unit/
    │   ├── utils/
    │   ├── services/
    │   └── helpers/
    ├── integration/
    │   ├── controllers/
    │   ├── routes/
    │   └── services/
    ├── e2e/
    │   ├── api/
    │   └── workflows/
    ├── fixtures/
    │   └── data/
    └── helpers/
        ├── test-setup.ts
        ├── mock-data.ts
        └── test-client.ts
```

### File Naming Convention

**Pattern:** `*.test.ts` or `*.spec.ts`

```
✅ GOOD:
utils/async-handler.test.ts
services/booking-service.test.ts
controllers/health-controller.integration.test.ts

❌ BAD:
utils/async-handler.test.js
test-async-handler.ts
async-handler-test.ts
```

---

## 4. Unit Testing

### What to Test

- **Utility functions** (pure functions, helpers)
- **Service functions** (business logic, mocked dependencies)
- **Validation functions** (Zod schemas, custom validators)
- **Error classes** (error instantiation, properties)

### Unit Test Structure

```typescript
// tests/unit/utils/validation.test.ts
import { describe, it, expect, jest, beforeEach, beforeAll, afterAll } from '@jest/globals';
import { validatePhoneNumber } from '../../../src/utils/validation';

describe('validatePhoneNumber', () => {
  it('should return true for valid phone numbers', () => {
    expect(validatePhoneNumber('+1234567890')).toBe(true);
    expect(validatePhoneNumber('1234567890')).toBe(true);
  });

  it('should return false for invalid phone numbers', () => {
    expect(validatePhoneNumber('abc')).toBe(false);
    expect(validatePhoneNumber('123')).toBe(false);
  });

  it('should handle edge cases', () => {
    expect(validatePhoneNumber('')).toBe(false);
    expect(validatePhoneNumber(null as any)).toBe(false);
  });
});
```

### Service Unit Test Pattern

```typescript
// tests/unit/services/booking-service.test.ts
import { describe, it, expect, jest } from '@jest/globals';
import { createAppointment } from '../../../src/services/booking-service';
import * as database from '../../../src/config/database';

// Mock dependencies
jest.mock('../../../src/config/database');

describe('createAppointment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should create appointment successfully', async () => {
    // Arrange
    // Use obvious fake placeholders (not real PHI) - see TESTING.md PII rules
    const appointmentData = {
      patientName: 'PATIENT_TEST',
      phone: '+10000000000',
      date: '2026-01-20',
    };
    
    const mockAppointment = { id: '123', ...appointmentData };
    (database.supabase.from as jest.Mock).mockReturnValue({
      insert: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({ data: mockAppointment, error: null }),
        }),
      }),
    });

    // Act
    const result = await createAppointment(appointmentData);

    // Assert
    expect(result).toEqual(mockAppointment);
    expect(database.supabase.from).toHaveBeenCalledWith('appointments');
  });

  it('should throw InternalError on database error', async () => {
    // Arrange
    // Use fake placeholders (not real PHI)
    const appointmentData = { patientName: 'PATIENT_TEST', phone: '+10000000000', date: '2026-01-20' };
    (database.supabase.from as jest.Mock).mockReturnValue({
      insert: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: null,
            error: { message: 'Database error' },
          }),
        }),
      }),
    });

    // Act & Assert
    await expect(createAppointment(appointmentData)).rejects.toThrow('Database error');
  });
});
```

---

## 5. Integration Testing

### Unit tests vs server-required integration scripts

**Unit tests (Jest):** Run with `npm test` (or `npm test -- --testPathPattern=...`). No server required; mocks used. Location: `tests/unit/`.

**Server-required integration scripts:** Scripts in `tests/integration/` that call a running server (e.g. `test-webhook-controller.ts`, `test-webhook-verification.ts`). **Server must be running** (e.g. `npm run dev`). Run from backend directory: `npx ts-node tests/integration/<script-name>.ts`. Use for live endpoint checks (GET/POST webhook, signature, idempotency, rate limit). See `docs/testing/webhook-testing-guide.md` for webhook-specific commands.

### What to Test

- **API endpoints** (full request/response cycle)
- **Controllers** (with real middleware, mocked services)
- **Routes** (endpoint mounting, middleware order)
- **Services with database** (using test database)

### Integration Test Pattern

```typescript
// tests/integration/routes/health.test.ts
import request from 'supertest';
import app from '../../../src/index';
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';

describe('GET /health', () => {
  it('should return 200 with health data', async () => {
    const response = await request(app)
      .get('/health')
      .expect(200)
      .expect('Content-Type', /json/);

    expect(response.body).toMatchObject({
      success: true,
      data: expect.objectContaining({
        status: expect.any(String),
        services: expect.objectContaining({
          database: expect.objectContaining({
            connected: expect.any(Boolean),
            responseTimeMs: expect.any(Number),
          }),
        }),
      }),
      meta: expect.objectContaining({
        timestamp: expect.any(String),
        requestId: expect.any(String),
      }),
    });
  });

  it('should include X-Correlation-ID header', async () => {
    const response = await request(app).get('/health');
    expect(response.headers['x-correlation-id']).toBeDefined();
    expect(response.headers['x-correlation-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
  });
});
```

### Controller Integration Test

**Testing Preference Order (MANDATORY):**

1. **Supertest route tests** (preferred) - Tests full request/response cycle
2. **Service unit tests** - Tests business logic in isolation
3. ❌ **Direct controller invocation** - Only if route testing is impossible (legacy/discouraged)

**⚠️ IMPORTANT:** Prefer Supertest (tests the route, not the controller directly). This is closer to reality and avoids mocking Express internals.

**Option 1: Supertest (RECOMMENDED - Beginner-safe, closest to reality):**

The health controller uses `health-service.checkDatabaseConnection()` (which calls `config/database.testConnection`). Mocking `config/database.testConnection` in Supertest still works because the request goes through the app and the service calls that config.

```typescript
// tests/integration/controllers/health-controller.test.ts
import request from 'supertest';
import app from '../../../src/index'; // Your Express app
import * as database from '../../../src/config/database';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// Mock database (health-service.checkDatabaseConnection uses testConnection)
jest.mock('../../../src/config/database');

describe('GET /health', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return 200 when database is connected', async () => {
    // Arrange
    (database.testConnection as jest.Mock).mockResolvedValue(true);

    // Act - Test the actual route
    const response = await request(app)
      .get('/health')
      .expect(200);

    // Assert - Verify canonical response format
    expect(response.body).toMatchObject({
      success: true,
      data: expect.objectContaining({
        services: expect.objectContaining({
          database: expect.objectContaining({
            connected: true,
          }),
        }),
      }),
      meta: expect.objectContaining({
        timestamp: expect.any(String),
        requestId: expect.any(String),
      }),
    });
  });

  it('should return 503 when database is disconnected', async () => {
    // Arrange
    (database.testConnection as jest.Mock).mockResolvedValue(false);

    // Act - Test the actual route
    const response = await request(app)
      .get('/health')
      .expect(503);

    // Assert - Health returns 503 with success: true and data (canonical success envelope)
    expect(response.body).toMatchObject({
      success: true,
      data: expect.objectContaining({
        status: 'error',
        services: expect.objectContaining({
          database: expect.objectContaining({
            connected: false,
          }),
        }),
      }),
      meta: expect.objectContaining({
        timestamp: expect.any(String),
        requestId: expect.any(String),
      }),
    });
  });
});
```

**Option 2: Service Unit Tests (Recommended for Business Logic):**

The health-service exports `checkDatabaseConnection(): Promise<boolean>`. Mock `config/database.testConnection` and assert on the boolean result.

```typescript
// tests/unit/services/health-service.test.ts
import { testConnection } from '../../../src/config/database';
import { checkDatabaseConnection } from '../../../src/services/health-service';

jest.mock('../../../src/config/database');

describe('checkDatabaseConnection', () => {
  it('should return true when database is reachable', async () => {
    (testConnection as jest.Mock).mockResolvedValue(true);

    const connected = await checkDatabaseConnection();

    expect(connected).toBe(true);
  });

  it('should return false when database is unreachable', async () => {
    (testConnection as jest.Mock).mockResolvedValue(false);

    const connected = await checkDatabaseConnection();

    expect(connected).toBe(false);
  });
});
```

**Why Supertest Over Direct Controller Tests:**
- Tests the full request/response cycle (middleware, routes, controllers)
- No need to mock Express internals (`res.status().json()` chain)
- Verifies middleware order and error handling
- Closer to how users actually call your API

**Option 3: Direct Controller Invocation (LEGACY - Discouraged)**

```typescript
// ⚠️ DISCOURAGED: Only use if Supertest is impossible
// This pattern requires extensive mocking and doesn't test middleware
// Prefer Option 1 (Supertest) or Option 2 (Service tests) instead
```

**AI Agents:** Always prefer Supertest. Direct controller invocation is a last resort.
```

---

## 6. End-to-End Testing

### What to Test

- **Complete user workflows** (create appointment, cancel appointment)
- **API contract** (request/response formats)
- **Error scenarios** (validation failures, authentication failures)
- **Critical business paths**

### E2E Test Pattern

```typescript
// tests/e2e/api/appointments.test.ts
import request from 'supertest';
import app from '../../../src/index';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { setupTestDatabase, teardownTestDatabase } from '../../helpers/test-setup';

describe('Appointments API E2E', () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  describe('POST /api/v1/appointments', () => {
    it('should create appointment with valid data', async () => {
    // Use fake placeholders (not real PHI) - see PII rules below
    const appointmentData = {
      patientName: 'PATIENT_TEST',
      phone: '+10000000000',
      appointmentDate: '2026-01-20T14:00:00.000Z',
    };

      const response = await request(app)
        .post('/api/v1/appointments')
        .set('Authorization', 'Bearer valid-token')
        .send(appointmentData)
        .expect(201);

      expect(response.body).toMatchObject({
        success: true,
        data: expect.objectContaining({
          id: expect.any(String),
          // Only assert structure, not raw PHI values unless endpoint explicitly returns them
          patientName: expect.any(String),
          phone: expect.any(String),
        }),
        meta: {
          timestamp: expect.any(String),
          requestId: expect.any(String),
        },
      });
    });

    it('should return 400 for invalid data', async () => {
    // Use fake placeholders even for invalid data
    const invalidData = {
      patientName: '', // Invalid: empty string
      phone: 'INVALID_PHONE', // Invalid: not a phone number
    };

      const response = await request(app)
        .post('/api/v1/appointments')
        .set('Authorization', 'Bearer valid-token')
        .send(invalidData)
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'ValidationError',
          statusCode: 400,
        },
      });
    });

    it('should return 401 without authentication', async () => {
      const response = await request(app)
        .post('/api/v1/appointments')
        .send({ patientName: 'PATIENT_TEST', phone: '+10000000000' })
        .expect(401);

      expect(response.body.error.code).toBe('UnauthorizedError');
    });
  });
});
```

---

## 7. Test Utilities & Helpers

### Test Setup Helper

```typescript
// tests/helpers/test-setup.ts
import { supabase } from '../../src/config/database';

export async function setupTestDatabase(): Promise<void> {
  // Create test database schema
  // Seed test data
  // Setup test environment
}

export async function teardownTestDatabase(): Promise<void> {
  // Clean up test data
  // Reset test database
}

export function createMockRequest(overrides?: Partial<Request>): Partial<Request> {
  return {
    body: {},
    query: {},
    params: {},
    headers: {},
    correlationId: 'test-correlation-id',
    ...overrides,
  };
}

export function createMockResponse(): Partial<Response> {
  const jsonMock = jest.fn().mockReturnThis();
  const statusMock = jest.fn().mockReturnValue({ json: jsonMock });
  
  return {
    status: statusMock,
    json: jsonMock,
    setHeader: jest.fn(),
    headers: {},
  };
}
```

### Mock Data Factory

```typescript
// tests/helpers/mock-data.ts
export function createMockAppointment(overrides?: Partial<Appointment>): Appointment {
  return {
    id: 'test-id-123',
    patientName: 'PATIENT_TEST', // Fake placeholder (not real PHI)
    phone: '+10000000000', // Fake placeholder (not real PHI)
    appointmentDate: '2026-01-20T14:00:00.000Z',
    status: 'pending',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

export function createMockUser(overrides?: Partial<User>): User {
  return {
    id: 'user-123',
    email: 'test@example.com',
    role: 'doctor',
    ...overrides,
  };
}
```

---

## 8. Mocking Strategies

### Database Mocking

```typescript
// Mock Supabase client
jest.mock('../../src/config/database', () => ({
  supabase: {
    from: jest.fn(),
    auth: {
      getUser: jest.fn(),
    },
  },
  testConnection: jest.fn(),
}));
```

### Service Mocking

```typescript
// Mock service in controller tests
jest.mock('../../src/services/booking-service', () => ({
  createAppointment: jest.fn(),
  getAppointment: jest.fn(),
}));
```

### External API Mocking

```typescript
// Mock external API calls
jest.mock('axios', () => ({
  default: {
    post: jest.fn(),
    get: jest.fn(),
  },
}));
```

### Environment Variables Mocking

```typescript
// Mock environment variables
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_KEY = 'test-key';
```

---

## 9. Test Coverage

### Coverage Targets (from STANDARDS.md)

**SHOULD:** 80%+ coverage overall
- **MUST:** 100% coverage for critical paths (authentication, payment processing)
- **SHOULD:** 90%+ coverage for services
- **SHOULD:** 80%+ coverage for controllers
- **SHOULD:** 70%+ coverage for utilities

### Coverage Tools

**Recommended:** Jest with coverage reports

```json
// package.json
{
  "scripts": {
    "test": "jest",
    "test:coverage": "jest --coverage",
    "test:watch": "jest --watch",
    "test:unit": "jest tests/unit",
    "test:integration": "jest tests/integration",
    "test:e2e": "jest tests/e2e"
  },
  "jest": {
    "collectCoverageFrom": [
      "src/**/*.ts",
      "!src/**/*.d.ts",
      "!src/**/*.test.ts"
    ],
    "coverageThresholds": {
      "global": {
        "branches": 80,
        "functions": 80,
        "lines": 80,
        "statements": 80
      }
    }
  }
}
```

---

## 10. Notification Test Scripts (Backend)

**Purpose:** Verify Resend email and doctor notifications without running the full booking/payment flow.

**Scripts (run from `backend/`):**

- **`npm run test:email`** — Sends one test email to `DEFAULT_DOCTOR_EMAIL` via Resend. Use to confirm `RESEND_API_KEY` and env are set.
- **`npm run test:full-notifications`** — Sends the same two doctor emails the app sends in production: "New appointment booked" and "Payment received for appointment". Uses dummy IDs; doctor email resolves via `DEFAULT_DOCTOR_EMAIL` fallback.

**Requirements:** `.env` in `backend/` must have `RESEND_API_KEY` and `DEFAULT_DOCTOR_EMAIL` set. No server or Redis required.

**See:** `backend/scripts/send-test-email.ts`, `backend/scripts/send-full-notification-test.ts`.

---

## 11. Testing Checklist

### Before Writing Tests

- [ ] Understand what needs to be tested
- [ ] Identify test type (unit/integration/e2e)
- [ ] Check for existing test patterns to follow
- [ ] Identify dependencies to mock

### Writing Tests

- [ ] Follow AAA pattern (Arrange, Act, Assert)
- [ ] Test happy path (success case)
- [ ] Test error cases (validation, not found, etc.)
- [ ] Test edge cases (null, undefined, empty strings)
- [ ] Use descriptive test names (`should do X when Y`)
- [ ] Keep tests isolated (no shared state)
- [ ] Clean up after tests (beforeEach/afterEach)

### After Writing Tests

- [ ] Run tests locally
- [ ] Verify coverage meets targets
- [ ] Check for flaky tests (run multiple times)
- [ ] Update test documentation if needed

---

## 12. Common Testing Patterns

### Testing Async Functions

```typescript
it('should handle async operations', async () => {
  const result = await asyncFunction();
  expect(result).toBeDefined();
});

it('should handle async errors', async () => {
  await expect(asyncFunction()).rejects.toThrow(Error);
});
```

### Testing Error Handling

```typescript
it('should throw ValidationError for invalid input', () => {
  expect(() => {
    validateInput(invalidData);
  }).toThrow(ValidationError);
});
```

### Testing Zod Validation

```typescript
it('should validate with Zod schema', () => {
  const schema = z.object({
    email: z.string().email(),
  });

  expect(() => schema.parse({ email: 'invalid' })).toThrow(ZodError);
  expect(schema.parse({ email: 'valid@example.com' })).toEqual({
    email: 'valid@example.com',
  });
});
```

### Testing Middleware

```typescript
it('should add correlation ID to request', async () => {
  const req = createMockRequest();
  const res = createMockResponse();
  const next = jest.fn();

  await correlationId(req as Request, res as Response, next);

  expect(req.correlationId).toBeDefined();
  expect(next).toHaveBeenCalled();
});
```

### Testing Standardized Responses

```typescript
it('should return standardized response format', async () => {
  const response = await request(app).get('/api/v1/resource');

  expect(response.body).toMatchObject({
    success: expect.any(Boolean),
    data: expect.anything(),
    meta: {
      timestamp: expect.any(String),
      requestId: expect.any(String),
    },
  });
});
```

---

## 📝 Best Practices Summary

### DO:
✅ Write tests before or alongside code (TDD/BDD)  
✅ Test one thing per test case  
✅ Use descriptive test names  
✅ Mock external dependencies  
✅ Clean up test data  
✅ Test error cases  
✅ Test edge cases  
✅ Aim for 80%+ coverage  
✅ Keep tests fast and isolated  
✅ Follow AAA pattern (Arrange, Act, Assert)  

### DON'T:
❌ Test implementation details  
❌ Share state between tests  
❌ Mock everything (test real behavior when possible)  
❌ Write flaky tests  
❌ Skip error case testing  
❌ Ignore test failures  
❌ Write tests without assertions  
❌ Hardcode test data (use factories)  

---

## 🔗 Related Files

- [STANDARDS.md](./STANDARDS.md) - Testing requirements (80%+ coverage)
- [ARCHITECTURE.md](./ARCHITECTURE.md) - Project structure
- [RECIPES.md](./RECIPES.md) - Implementation patterns
- [CODING_WORKFLOW.md](./CODING_WORKFLOW.md) - Coding process

---

**Last Updated:** 2026-02-01  
**Version:** 1.1.0  
**Status:** Active
