# Learning Topics - Instagram Service Testing with Jest
## Task #5: Instagram Service Testing (Deferred Tests Implementation)

---

## 📚 What Are We Learning Today?

Today we're learning about **Unit Testing with Jest** - how to write comprehensive tests for services that interact with external APIs. Think of it like **quality control in a hospital lab** - we need to verify our Instagram service works correctly without actually calling Instagram's API (which would be slow, expensive, and unreliable). We'll learn to mock dependencies, test success cases, error cases, retry logic, and verify that our code handles all scenarios correctly. This ensures our service is reliable and maintainable!

We'll learn about:
1. **Jest Testing Framework** - Modern JavaScript/TypeScript testing framework
2. **Unit Testing Patterns** - Isolated testing of individual functions
3. **Mocking Dependencies** - Replacing external dependencies with test doubles
4. **Testing Async Functions** - Handling promises and async/await in tests
5. **Testing Error Handling** - Verifying error paths and error mapping
6. **Testing Retry Logic** - Using fake timers to test delays and retries
7. **Test Organization** - Structuring tests for maintainability
8. **Test Coverage** - Ensuring comprehensive test coverage
9. **Mocking Axios** - Testing HTTP calls without real network requests
10. **Mocking Audit Logger** - Testing compliance logging without database writes

---

## 🎓 Topic 1: Jest Testing Framework

### What is Jest?

**Jest** is a JavaScript/TypeScript testing framework developed by Facebook. It provides:
- Test runner (executes tests)
- Assertion library (expect, toBe, toThrow, etc.)
- Mocking utilities (jest.mock, jest.fn)
- Code coverage reporting
- Snapshot testing
- Fake timers (for testing delays)

**Think of it like:**
- **Jest** = Quality control lab equipment
- **Tests** = Test procedures
- **Mocks** = Simulated test samples (not real API calls)
- **Assertions** = Pass/fail criteria

### Jest Installation

**Package.json:**
```json
{
  "devDependencies": {
    "jest": "^29.7.0",
    "ts-jest": "^29.4.6",
    "@types/jest": "^29.5.14"
  },
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage"
  }
}
```

**Install:**
```bash
npm install --save-dev jest ts-jest @types/jest
```

### Jest Configuration

**jest.config.js:**
```javascript
/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',              // Use ts-jest for TypeScript
  testEnvironment: 'node',         // Node.js environment (not browser)
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: ['**/?(*.)+(spec|test).ts'],
  transform: {
    '^.+\\.ts$': 'ts-jest',        // Transform TypeScript files
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts',
  ],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  testTimeout: 10000,
};
```

**Key Configuration Options:**
- `preset: 'ts-jest'` - Enables TypeScript support
- `testEnvironment: 'node'` - Node.js environment (not browser)
- `testMatch` - Pattern for test files (`*.test.ts`, `*.spec.ts`)
- `setupFilesAfterEnv` - Files to run before each test file
- `testTimeout` - Maximum time for a test (default: 5000ms)

**See:** [Jest Documentation](https://jestjs.io/docs/getting-started)

---

## 🎓 Topic 2: Unit Testing Patterns

### What is Unit Testing?

**Unit Testing** is testing individual functions or modules in isolation, with all dependencies mocked.

**Think of it like:**
- **Unit Test** = Testing a single medical device in isolation
- **Dependencies** = External systems (power, network, etc.)
- **Mocks** = Simulated dependencies (test power supply, test network)

### Test Structure (AAA Pattern)

**Arrange-Act-Assert Pattern:**
```typescript
describe('functionName', () => {
  it('should do something', async () => {
    // Arrange: Set up test data and mocks
    const input = 'test input';
    jest.mock('dependency').mockReturnValue('mocked value');

    // Act: Execute the function being tested
    const result = await functionName(input);

    // Assert: Verify the result
    expect(result).toBe('expected value');
  });
});
```

### Test File Structure

**File: `tests/unit/services/instagram-service.test.ts`**
```typescript
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { sendInstagramMessage } from '../../../src/services/instagram-service';

// Mock dependencies at the top
jest.mock('axios');
jest.mock('../../../src/utils/audit-logger');
jest.mock('../../../src/config/env');

describe('Instagram Service', () => {
  beforeEach(() => {
    jest.clearAllMocks(); // Reset mocks before each test
  });

  describe('sendInstagramMessage', () => {
    it('should send message successfully', async () => {
      // Test implementation
    });
  });
});
```

**Key Patterns:**
- `describe` - Groups related tests
- `it` or `test` - Individual test case
- `beforeEach` - Runs before each test (setup)
- `afterEach` - Runs after each test (cleanup)
- `expect` - Assertion (verifies expected behavior)

**See:** [TESTING.md](../../Reference/TESTING.md) - Unit Testing section

---

## 🎓 Topic 3: Mocking Dependencies

### What is Mocking?

**Mocking** is replacing real dependencies with fake implementations that we control in tests.

**Think of it like:**
- **Real Dependency** = Real Instagram API (slow, costs money, unreliable)
- **Mock** = Fake Instagram API (instant, free, predictable)

### Mocking Axios

**Mock axios to avoid real HTTP calls:**
```typescript
import axios from 'axios';

// Mock axios module
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('Instagram Service', () => {
  it('should send message successfully', async () => {
    // Arrange: Mock successful response
    mockedAxios.post.mockResolvedValueOnce({
      data: {
        recipient_id: '123',
        message_id: 'mid.123',
      },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {} as any,
    });

    // Act: Call the function
    const result = await sendInstagramMessage('123', 'Hello', 'correlation-id');

    // Assert: Verify axios was called correctly
    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://graph.facebook.com/v18.0/me/messages',
      expect.objectContaining({
        recipient: { id: '123' },
        message: { text: 'Hello' },
      }),
      expect.any(Object)
    );
  });
});
```

**Mocking Error Responses:**
```typescript
it('should handle API errors', async () => {
  // Arrange: Mock error response
  const error = new AxiosError('Not Found');
  error.response = {
    data: { error: { message: 'Invalid recipient', code: 100 } },
    status: 404,
    statusText: 'Not Found',
    headers: {},
    config: {} as any,
  };

  mockedAxios.post.mockRejectedValueOnce(error);

  // Act & Assert: Verify error is thrown
  await expect(
    sendInstagramMessage('invalid', 'Hello', 'correlation-id')
  ).rejects.toThrow(NotFoundError);
});
```

### Mocking Audit Logger

**Mock audit logger to avoid database writes:**
```typescript
import * as auditLogger from '../../../src/utils/audit-logger';

// Mock audit logger module
jest.mock('../../../src/utils/audit-logger');
const mockedAuditLogger = auditLogger as jest.Mocked<typeof auditLogger>;

describe('Instagram Service', () => {
  it('should log audit event on success', async () => {
    // Arrange
    mockedAxios.post.mockResolvedValueOnce({ data: validResponse });

    // Act
    await sendInstagramMessage('123', 'Hello', 'correlation-id');

    // Assert: Verify audit log was called
    expect(mockedAuditLogger.logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        correlationId: 'correlation-id',
        action: 'send_message',
        status: 'success',
      })
    );
  });
});
```

### Mocking Environment Variables

**Mock environment config:**
```typescript
import * as env from '../../../src/config/env';

// Mock env module
jest.mock('../../../src/config/env', () => ({
  env: {
    INSTAGRAM_ACCESS_TOKEN: 'test-access-token',
  },
}));
```

**Or use test setup file:**
```typescript
// tests/setup.ts
process.env.INSTAGRAM_ACCESS_TOKEN = 'test-access-token';
process.env.SUPABASE_URL = 'https://test.supabase.co';
```

**See:** [Jest Mocking Documentation](https://jestjs.io/docs/mock-functions)

---

## 🎓 Topic 4: Testing Async Functions

### Testing Promises

**Testing successful async operations:**
```typescript
it('should return result from async function', async () => {
  // Arrange
  mockedAxios.post.mockResolvedValueOnce({ data: validResponse });

  // Act: Use await with async function
  const result = await sendInstagramMessage('123', 'Hello', 'correlation-id');

  // Assert
  expect(result).toEqual(validResponse);
});
```

**Testing rejected promises (errors):**
```typescript
it('should throw error on failure', async () => {
  // Arrange
  mockedAxios.post.mockRejectedValueOnce(new Error('API Error'));

  // Act & Assert: Use rejects.toThrow
  await expect(
    sendInstagramMessage('123', 'Hello', 'correlation-id')
  ).rejects.toThrow('API Error');
});
```

**Testing specific error types:**
```typescript
it('should throw NotFoundError for 404', async () => {
  // Arrange
  const error = new AxiosError('Not Found');
  error.response = { status: 404, data: {}, ... };
  mockedAxios.post.mockRejectedValueOnce(error);

  // Act & Assert: Verify specific error type
  await expect(
    sendInstagramMessage('invalid', 'Hello', 'correlation-id')
  ).rejects.toThrow(NotFoundError);
});
```

### Async Test Patterns

**Always use `async` in test functions:**
```typescript
// ✅ CORRECT
it('should work', async () => {
  const result = await asyncFunction();
  expect(result).toBeDefined();
});

// ❌ WRONG - Missing async
it('should work', () => {
  const result = asyncFunction(); // Returns Promise, not value
  expect(result).toBeDefined(); // Will always pass (Promise is defined)
});
```

**See:** [Jest Async Testing](https://jestjs.io/docs/asynchronous)

---

## 🎓 Topic 5: Testing Error Handling

### Testing Error Mapping

**Test that Instagram API errors map to correct AppError types:**
```typescript
describe('Error Mapping', () => {
  it('should map 401 to UnauthorizedError', async () => {
    // Arrange
    const error = new AxiosError('Unauthorized');
    error.response = {
      status: 401,
      data: { error: { code: 190 } },
      ...,
    };
    mockedAxios.post.mockRejectedValueOnce(error);

    // Act & Assert
    await expect(
      sendInstagramMessage('123', 'Hello', 'correlation-id')
    ).rejects.toThrow(UnauthorizedError);
  });

  it('should map 404 to NotFoundError', async () => {
    // Arrange
    const error = new AxiosError('Not Found');
    error.response = { status: 404, ... };
    mockedAxios.post.mockRejectedValueOnce(error);

    // Act & Assert
    await expect(
      sendInstagramMessage('invalid', 'Hello', 'correlation-id')
    ).rejects.toThrow(NotFoundError);
  });

  it('should map 429 to TooManyRequestsError', async () => {
    // Arrange
    const error = new AxiosError('Too Many Requests');
    error.response = { status: 429, ... };
    mockedAxios.post.mockRejectedValueOnce(error);

    // Act & Assert
    await expect(
      sendInstagramMessage('123', 'Hello', 'correlation-id')
    ).rejects.toThrow(TooManyRequestsError);
  });
});
```

### Testing Error Logging

**Verify that errors are logged correctly:**
```typescript
it('should log audit event on error', async () => {
  // Arrange
  const error = new AxiosError('Unauthorized');
  error.response = { status: 401, ... };
  mockedAxios.post.mockRejectedValueOnce(error);

  // Act
  await expect(
    sendInstagramMessage('123', 'Hello', 'correlation-id')
  ).rejects.toThrow(UnauthorizedError);

  // Assert: Verify audit log was called with failure status
  expect(mockedAuditLogger.logAuditEvent).toHaveBeenCalledWith(
    expect.objectContaining({
      status: 'failure',
      errorMessage: expect.any(String),
      metadata: expect.objectContaining({
        error_type: 'UnauthorizedError',
      }),
    })
  );
});
```

**See:** [TESTING.md](../../Reference/TESTING.md) - Error Handling section

---

## 🎓 Topic 6: Testing Retry Logic

### Using Fake Timers

**Jest provides fake timers to test delays without waiting:**
```typescript
describe('Retry Logic', () => {
  beforeEach(() => {
    jest.useFakeTimers(); // Enable fake timers
  });

  afterEach(() => {
    jest.useRealTimers(); // Restore real timers
  });

  it('should retry on rate limit with backoff', async () => {
    // Arrange
    const rateLimitError = new AxiosError('Too Many Requests');
    rateLimitError.response = { status: 429, ... };

    mockedAxios.post
      .mockRejectedValueOnce(rateLimitError) // First call fails
      .mockResolvedValueOnce({ data: validResponse }); // Retry succeeds

    // Act: Start the async operation
    const promise = sendInstagramMessage('123', 'Hello', 'correlation-id');

    // Fast-forward time by 1 second (retry delay)
    jest.advanceTimersByTime(1000);

    // Wait for promise to resolve
    const result = await promise;

    // Assert: Verify retry happened
    expect(mockedAxios.post).toHaveBeenCalledTimes(2);
    expect(result).toEqual(validResponse);
  });
});
```

### Testing Exponential Backoff

**Test that delays increase exponentially:**
```typescript
it('should implement exponential backoff', async () => {
  // Arrange: Mock 3 failures then success
  const serverError = new AxiosError('Internal Server Error');
  serverError.response = { status: 500, ... };

  mockedAxios.post
    .mockRejectedValueOnce(serverError) // Attempt 0
    .mockRejectedValueOnce(serverError) // Attempt 1 (delay 1s)
    .mockRejectedValueOnce(serverError) // Attempt 2 (delay 2s)
    .mockResolvedValueOnce({ data: validResponse }); // Attempt 3 (delay 4s)

  // Act
  const promise = sendInstagramMessage('123', 'Hello', 'correlation-id');

  // Fast-forward through all retry delays: 1s + 2s + 4s = 7s
  jest.advanceTimersByTime(7000);

  const result = await promise;

  // Assert: Verify 4 calls (initial + 3 retries)
  expect(mockedAxios.post).toHaveBeenCalledTimes(4);
  expect(result).toEqual(validResponse);
});
```

### Testing Max Retries

**Test that function fails after max retries:**
```typescript
it('should fail after max retries', async () => {
  // Arrange: Mock 4 failures (initial + 3 retries)
  const serverError = new AxiosError('Internal Server Error');
  serverError.response = { status: 500, ... };

  mockedAxios.post
    .mockRejectedValueOnce(serverError)
    .mockRejectedValueOnce(serverError)
    .mockRejectedValueOnce(serverError)
    .mockRejectedValueOnce(serverError);

  // Act
  const promise = sendInstagramMessage('123', 'Hello', 'correlation-id');

  // Fast-forward through all retry delays
  jest.advanceTimersByTime(7000);

  // Assert: Should throw error after max retries
  await expect(promise).rejects.toThrow(InternalError);
  expect(mockedAxios.post).toHaveBeenCalledTimes(4);
});
```

**See:** [Jest Fake Timers](https://jestjs.io/docs/timer-mocks)

---

## 🎓 Topic 7: Test Organization

### Test File Structure

**Organize tests by feature and scenario:**
```typescript
describe('Instagram Service', () => {
  // Shared test data
  const validRecipientId = '123456789';
  const validMessage = 'Test message';
  const correlationId = 'test-correlation-id';

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('4.1: Send Message Function', () => {
    describe('4.1.1: Valid recipient and message', () => {
      it('should send message successfully', async () => {
        // Test implementation
      });
    });

    describe('4.1.2: Invalid recipient ID', () => {
      it('should throw NotFoundError', async () => {
        // Test implementation
      });
    });
  });

  describe('4.2: Retry Logic', () => {
    describe('4.2.1: Exponential backoff', () => {
      it('should implement exponential backoff', async () => {
        // Test implementation
      });
    });
  });
});
```

### Test Naming Conventions

**Use descriptive test names:**
```typescript
// ✅ GOOD: Descriptive and specific
it('should throw NotFoundError for invalid recipient ID', async () => {
  // ...
});

it('should retry on rate limit error with exponential backoff', async () => {
  // ...
});

// ❌ BAD: Vague and unclear
it('should work', async () => {
  // ...
});

it('test 1', async () => {
  // ...
});
```

### Test Data Management

**Use constants for shared test data:**
```typescript
describe('Instagram Service', () => {
  // Shared test data (defined once, used many times)
  const validRecipientId = '123456789';
  const validMessage = 'Test message';
  const correlationId = 'test-correlation-id';
  const validResponse = {
    recipient_id: validRecipientId,
    message_id: 'mid.test.123456',
  };

  // Use in tests
  it('should work', async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: validResponse });
    const result = await sendInstagramMessage(validRecipientId, validMessage, correlationId);
    expect(result).toEqual(validResponse);
  });
});
```

**See:** [TESTING.md](../../Reference/TESTING.md) - Test Organization section

---

## 🎓 Topic 8: Test Coverage

### What is Test Coverage?

**Test Coverage** measures how much of your code is executed by tests.

**Coverage Metrics:**
- **Statements:** Percentage of code statements executed
- **Branches:** Percentage of if/else branches executed
- **Functions:** Percentage of functions called
- **Lines:** Percentage of lines executed

### Running Coverage

**Command:**
```bash
npm run test:coverage
```

**Output:**
```
File                    | % Stmts | % Branch | % Funcs | % Lines
------------------------|---------|----------|---------|--------
instagram-service.ts    |    95.5 |    90.0  |   100.0 |    95.5
```

### Coverage Targets

**From STANDARDS.md:**
- **MUST:** 100% coverage for critical paths (authentication, payment processing)
- **SHOULD:** 90%+ coverage for services
- **SHOULD:** 80%+ coverage for controllers
- **SHOULD:** 70%+ coverage for utilities

**Jest Configuration:**
```javascript
// jest.config.js
module.exports = {
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};
```

**See:** [TESTING.md](../../Reference/TESTING.md) - Test Coverage section

---

## 🎓 Topic 9: Mocking Axios

### Axios Mocking Patterns

**Mock successful responses:**
```typescript
mockedAxios.post.mockResolvedValueOnce({
  data: { recipient_id: '123', message_id: 'mid.123' },
  status: 200,
  statusText: 'OK',
  headers: {},
  config: {} as any,
});
```

**Mock error responses:**
```typescript
const error = new AxiosError('Not Found');
error.response = {
  data: { error: { message: 'Invalid recipient', code: 100 } },
  status: 404,
  statusText: 'Not Found',
  headers: {},
  config: {} as any,
};
mockedAxios.post.mockRejectedValueOnce(error);
```

**Mock network errors:**
```typescript
const timeoutError = new AxiosError('timeout of 10000ms exceeded');
timeoutError.code = 'ECONNABORTED';
timeoutError.config = {} as any;
mockedAxios.post.mockRejectedValueOnce(timeoutError);
```

### Verifying Axios Calls

**Check call count:**
```typescript
expect(mockedAxios.post).toHaveBeenCalledTimes(2); // Called exactly 2 times
```

**Check call arguments:**
```typescript
expect(mockedAxios.post).toHaveBeenCalledWith(
  'https://graph.facebook.com/v18.0/me/messages',
  expect.objectContaining({
    recipient: { id: '123' },
    message: { text: 'Hello' },
  }),
  expect.objectContaining({
    params: { access_token: 'test-access-token' },
    timeout: 10000,
  })
);
```

**Check call order:**
```typescript
// First call
expect(mockedAxios.post).toHaveBeenNthCalledWith(1, ...);
// Second call
expect(mockedAxios.post).toHaveBeenNthCalledWith(2, ...);
```

**See:** [Axios Mocking Guide](https://jestjs.io/docs/mock-functions)

---

## 🎓 Topic 10: Mocking Audit Logger

### Audit Logger Mocking

**Mock audit logger functions:**
```typescript
import * as auditLogger from '../../../src/utils/audit-logger';

jest.mock('../../../src/utils/audit-logger');
const mockedAuditLogger = auditLogger as jest.Mocked<typeof auditLogger>;

// Mock functions return promises
mockedAuditLogger.logAuditEvent.mockResolvedValueOnce(undefined);
mockedAuditLogger.logSecurityEvent.mockResolvedValueOnce(undefined);
```

### Verifying Audit Log Calls

**Check success logging:**
```typescript
it('should log audit event on success', async () => {
  // Arrange
  mockedAxios.post.mockResolvedValueOnce({ data: validResponse });

  // Act
  await sendInstagramMessage('123', 'Hello', 'correlation-id');

  // Assert: Verify audit log was called
  expect(mockedAuditLogger.logAuditEvent).toHaveBeenCalledWith(
    expect.objectContaining({
      correlationId: 'correlation-id',
      action: 'send_message',
      resourceType: 'instagram_message',
      status: 'success',
      metadata: expect.objectContaining({
        recipient_id: '123',
        message_length: 5,
      }),
    })
  );
});
```

**Check error logging:**
```typescript
it('should log audit event on error', async () => {
  // Arrange
  const error = new AxiosError('Unauthorized');
  error.response = { status: 401, ... };
  mockedAxios.post.mockRejectedValueOnce(error);

  // Act
  await expect(
    sendInstagramMessage('123', 'Hello', 'correlation-id')
  ).rejects.toThrow(UnauthorizedError);

  // Assert: Verify error was logged
  expect(mockedAuditLogger.logAuditEvent).toHaveBeenCalledWith(
    expect.objectContaining({
      status: 'failure',
      errorMessage: expect.any(String),
      metadata: expect.objectContaining({
        error_type: 'UnauthorizedError',
      }),
    })
  );
});
```

**Check security event logging:**
```typescript
it('should log security event on rate limit', async () => {
  // Arrange
  const rateLimitError = new AxiosError('Too Many Requests');
  rateLimitError.response = { status: 429, ... };
  mockedAxios.post.mockRejectedValueOnce(rateLimitError);

  // Act
  await expect(
    sendInstagramMessage('123', 'Hello', 'correlation-id')
  ).rejects.toThrow(TooManyRequestsError);

  // Assert: Verify security event was logged
  expect(mockedAuditLogger.logSecurityEvent).toHaveBeenCalledWith(
    'correlation-id',
    undefined,
    'rate_limit_exceeded',
    'medium',
    undefined,
    'Instagram API rate limit exceeded'
  );
});
```

**See:** [COMPLIANCE.md](../../Reference/COMPLIANCE.md) - Audit Logging section

---

## 📝 Summary

### Key Takeaways

1. **Jest is a powerful testing framework** - Provides test runner, assertions, mocking, and coverage
2. **Unit tests test functions in isolation** - All dependencies are mocked
3. **Mocking prevents real API calls** - Tests are fast, reliable, and free
4. **Fake timers test delays** - No need to wait for actual retry delays
5. **Test organization matters** - Group related tests, use descriptive names
6. **Coverage ensures completeness** - Aim for 80%+ coverage, 100% for critical paths
7. **AAA pattern (Arrange-Act-Assert)** - Clear test structure
8. **Test both success and error paths** - Verify all code paths are tested
9. **Mock external dependencies** - Axios, audit logger, environment variables
10. **Use async/await correctly** - Always use `async` in test functions

### Testing Checklist

**Before writing tests:**
- [ ] Understand what needs to be tested
- [ ] Identify dependencies to mock
- [ ] Review existing test patterns
- [ ] Check test coverage requirements

**Writing tests:**
- [ ] Follow AAA pattern (Arrange-Act-Assert)
- [ ] Test happy path (success case)
- [ ] Test error cases (all error types)
- [ ] Test edge cases (null, undefined, empty strings)
- [ ] Use descriptive test names
- [ ] Mock all external dependencies
- [ ] Use fake timers for delays
- [ ] Verify both function results and side effects (logging)

**After writing tests:**
- [ ] Run tests (`npm test`)
- [ ] Check coverage (`npm run test:coverage`)
- [ ] Ensure all tests pass
- [ ] Review test organization
- [ ] Update documentation if needed

### Common Pitfalls

**❌ DON'T:**
- Forget to use `async` in test functions
- Make real API calls in tests
- Forget to clear mocks between tests
- Test implementation details (test behavior, not internals)
- Skip error case testing
- Use real timers for retry logic tests

**✅ DO:**
- Mock all external dependencies
- Use fake timers for delay testing
- Test both success and error paths
- Use descriptive test names
- Clear mocks in `beforeEach`
- Verify function calls and arguments
- Test error mapping and logging

---

## 🔗 Related Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [TESTING.md](../../Reference/TESTING.md) - Project testing guidelines
- [STANDARDS.md](../../Reference/STANDARDS.md) - Code standards and patterns
- [COMPLIANCE.md](../../Reference/COMPLIANCE.md) - Audit logging requirements
- [Task 5: Instagram Service](../Daily-plans/2026-01-21/e-task-5-instagram-service.md) - Original task document

---

**Last Updated:** 2026-01-27  
**Related Task:** Task 5 - Instagram Service Testing  
**Pattern:** Unit Testing, Mocking, Jest Framework  
**Reference:** [TESTING.md](../../Reference/TESTING.md)
