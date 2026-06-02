/**
 * Test Script for Instagram Service
 * 
 * This script tests the sendInstagramMessage function to verify:
 * 1. Valid recipient ID and message (mock API call)
 * 2. Invalid recipient ID (should throw NotFoundError)
 * 3. Invalid access token (should throw UnauthorizedError)
 * 4. Rate limit error (should retry with backoff)
 * 5. Exponential backoff delays
 * 6. Max retries (should fail after 3 attempts)
 * 7. Non-retryable errors (should fail immediately)
 * 8. Error mapping (Instagram errors → AppError)
 * 9. Error logging (audit events)
 * 
 * Usage:
 *   npx ts-node tests/integration/test-instagram-service.ts
 * 
 * Prerequisites:
 *   - INSTAGRAM_ACCESS_TOKEN must be set in .env file (for validation, not actual API calls)
 *   - Server environment variables must be configured
 */

// Load environment variables FIRST, before any other imports
import dotenv from 'dotenv';
dotenv.config();

// Import type setup
import '../../src/types/setup';

import axios, { AxiosError } from 'axios';
import { sendInstagramMessage } from '../../src/services/instagram-service';
import {
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  TooManyRequestsError,
  InternalError,
  ServiceUnavailableError,
} from '../../src/utils/errors';
import { getSupabaseAdminClient } from '../../src/config/database';

// Test configuration
const correlationId = `test-${Date.now()}-${Math.random().toString(36).substring(7)}`;
const validRecipientId = '123456789';
const validMessage = 'Test message';
const validResponse = {
  recipient_id: validRecipientId,
  message_id: 'mid.test.123456',
};

// Test counters
let passedTests = 0;
let failedTests = 0;

// Store original axios.post for restoration
const originalAxiosPost = axios.post;

// Mock state
let mockCalls: Array<() => Promise<any>> = [];
let callIndex = 0;

/**
 * Setup axios mock with a sequence of responses
 */
function setupAxiosMock(responses: Array<() => Promise<any>>): void {
  mockCalls = responses;
  callIndex = 0;
  (axios.post as any) = async () => {
    if (callIndex >= mockCalls.length) {
      throw new Error('No more mock responses available');
    }
    const response = await mockCalls[callIndex]();
    callIndex++;
    return response;
  };
}

/**
 * Restore axios.post
 */
function restoreAxios(): void {
  axios.post = originalAxiosPost;
  mockCalls = [];
  callIndex = 0;
}

/**
 * Test helper function
 */
async function testCase(name: string, testFn: () => Promise<void>): Promise<void> {
  try {
    restoreAxios(); // Reset before each test
    await testFn();
    passedTests++;
    console.log(`   ✅ PASS: ${name}`);
  } catch (error) {
    failedTests++;
    console.error(`   ❌ FAIL: ${name}`);
    console.error(`      Error: ${error instanceof Error ? error.message : String(error)}`);
    if (error instanceof Error && error.stack) {
      const stackLines = error.stack.split('\n').slice(0, 3);
      console.error(`      Stack: ${stackLines.join('\n')}`);
    }
  } finally {
    restoreAxios();
  }
}

/**
 * Test 4.1.1: Test with valid recipient ID and message (mock API call)
 */
async function testValidRecipientAndMessage(): Promise<void> {
  // Mock successful API response
  setupAxiosMock([
    async () => ({
      data: validResponse,
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {} as any,
    }),
  ]);

  const result = await sendInstagramMessage(validRecipientId, validMessage, correlationId);

  if (result.recipient_id !== validRecipientId || !result.message_id) {
    throw new Error('Invalid response structure');
  }

  // Verify axios was called
  if (callIndex !== 1) {
    throw new Error(`Expected 1 axios call but got ${callIndex}`);
  }
}

/**
 * Test 4.1.2: Test with invalid recipient ID (should throw NotFoundError)
 */
async function testInvalidRecipientId(): Promise<void> {
  const invalidRecipientId = 'invalid_recipient_123';

  // Mock 404 response
  const error = new AxiosError('Not Found');
  error.response = {
    data: {
      error: {
        message: 'Invalid recipient ID',
        type: 'GraphMethodException',
        code: 100,
      },
    },
    status: 404,
    statusText: 'Not Found',
    headers: {},
    config: {} as any,
  };

  setupAxiosMock([
    async () => {
      throw error;
    },
  ]);

  try {
    await sendInstagramMessage(invalidRecipientId, validMessage, correlationId);
    throw new Error('Expected NotFoundError but no error was thrown');
  } catch (err) {
    const error = err as Error;
    if (!(error instanceof NotFoundError)) {
      throw new Error(`Expected NotFoundError but got ${error.constructor.name}`);
    }
  }
}

/**
 * Test 4.1.3: Test with invalid access token (should throw UnauthorizedError)
 */
async function testInvalidAccessToken(): Promise<void> {
  // Mock 401 response
  const error = new AxiosError('Unauthorized');
  error.response = {
    data: {
      error: {
        message: 'Invalid OAuth access token',
        type: 'OAuthException',
        code: 190,
      },
    },
    status: 401,
    statusText: 'Unauthorized',
    headers: {},
    config: {} as any,
  };

  setupAxiosMock([
    async () => {
      throw error;
    },
  ]);

  try {
    await sendInstagramMessage(validRecipientId, validMessage, correlationId);
    throw new Error('Expected UnauthorizedError but no error was thrown');
  } catch (err) {
    const error = err as Error;
    if (!(error instanceof UnauthorizedError)) {
      throw new Error(`Expected UnauthorizedError but got ${error.constructor.name}`);
    }
  }
}

/**
 * Test 4.1.4: Test with rate limit error (should retry with backoff)
 */
async function testRateLimitWithRetry(): Promise<void> {
  // Mock rate limit error (429) followed by success
  const rateLimitError = new AxiosError('Too Many Requests');
  rateLimitError.response = {
    data: {
      error: {
        message: 'Rate limit exceeded',
        type: 'OAuthException',
        code: 4,
      },
    },
    status: 429,
    statusText: 'Too Many Requests',
    headers: {
      'retry-after': '1', // 1 second for faster testing
    },
    config: {} as any,
  };

  setupAxiosMock([
    async () => {
      throw rateLimitError;
    },
    async () => ({
      data: validResponse,
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {} as any,
    }),
  ]);

  const startTime = Date.now();
  const result = await sendInstagramMessage(validRecipientId, validMessage, correlationId);
  const elapsed = Date.now() - startTime;

  // Verify retry happened (should have waited at least 1 second)
  if (elapsed < 1000) {
    throw new Error(`Expected retry delay but elapsed time was only ${elapsed}ms`);
  }

  // Verify result is correct
  if (result.recipient_id !== validRecipientId || !result.message_id) {
    throw new Error('Invalid response structure after retry');
  }

  // Verify axios was called twice (initial + retry)
  if (callIndex !== 2) {
    throw new Error(`Expected 2 axios calls but got ${callIndex}`);
  }
}

/**
 * Test 4.2.1: Test exponential backoff (verify delays)
 */
async function testExponentialBackoff(): Promise<void> {
  // Mock multiple 5xx errors to trigger retries
  const serverError = new AxiosError('Internal Server Error');
  serverError.response = {
    data: {
      error: {
        message: 'Internal server error',
        type: 'GraphMethodException',
        code: 1,
      },
    },
    status: 500,
    statusText: 'Internal Server Error',
    headers: {},
    config: {} as any,
  };

  // Mock 3 failures (max retries) then success
  setupAxiosMock([
    async () => {
      throw serverError;
    },
    async () => {
      throw serverError;
    },
    async () => {
      throw serverError;
    },
    async () => ({
      data: validResponse,
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {} as any,
    }),
  ]);

  const startTime = Date.now();
  const result = await sendInstagramMessage(validRecipientId, validMessage, correlationId);
  const elapsed = Date.now() - startTime;

  // Verify exponential backoff (should have waited: 1s + 2s + 4s = ~7s minimum)
  // Allow some margin for execution time
  if (elapsed < 6000) {
    throw new Error(`Expected exponential backoff delays but elapsed time was only ${elapsed}ms`);
  }

  // Verify result is correct
  if (result.recipient_id !== validRecipientId || !result.message_id) {
    throw new Error('Invalid response structure after retries');
  }

  // Verify axios was called 4 times (initial + 3 retries)
  if (callIndex !== 4) {
    throw new Error(`Expected 4 axios calls but got ${callIndex}`);
  }
}

/**
 * Test 4.2.2: Test max retries (should fail after 3 attempts)
 */
async function testMaxRetries(): Promise<void> {
  // Mock persistent 5xx errors (should fail after max retries)
  const serverError = new AxiosError('Internal Server Error');
  serverError.response = {
    data: {
      error: {
        message: 'Internal server error',
        type: 'GraphMethodException',
        code: 1,
      },
    },
    status: 500,
    statusText: 'Internal Server Error',
    headers: {},
    config: {} as any,
  };

  // Mock 4 failures (initial + 3 retries)
  setupAxiosMock([
    async () => {
      throw serverError;
    },
    async () => {
      throw serverError;
    },
    async () => {
      throw serverError;
    },
    async () => {
      throw serverError;
    },
  ]);

  try {
    await sendInstagramMessage(validRecipientId, validMessage, correlationId);
    throw new Error('Expected error after max retries but no error was thrown');
  } catch (err) {
    const error = err as Error;
    if (!(error instanceof InternalError)) {
      throw new Error(`Expected InternalError but got ${error.constructor.name}`);
    }
  }

  // Verify axios was called 4 times (initial + 3 retries)
  if (callIndex !== 4) {
    throw new Error(`Expected 4 axios calls but got ${callIndex}`);
  }
}

/**
 * Test 4.2.3: Test non-retryable errors (should fail immediately)
 */
async function testNonRetryableErrors(): Promise<void> {
  // Test 403 Forbidden (should not retry)
  const forbiddenError = new AxiosError('Forbidden');
  forbiddenError.response = {
    data: {
      error: {
        message: 'Permission denied',
        type: 'OAuthException',
        code: 10,
      },
    },
    status: 403,
    statusText: 'Forbidden',
    headers: {},
    config: {} as any,
  };

  setupAxiosMock([
    async () => {
      throw forbiddenError;
    },
  ]);

  try {
    await sendInstagramMessage(validRecipientId, validMessage, correlationId);
    throw new Error('Expected ForbiddenError but no error was thrown');
  } catch (err) {
    const error = err as Error;
    if (!(error instanceof ForbiddenError)) {
      throw new Error(`Expected ForbiddenError but got ${error.constructor.name}`);
    }
  }

  // Verify axios was called only once (no retries)
  if (callIndex !== 1) {
    throw new Error(`Expected 1 axios call but got ${callIndex}`);
  }
}

/**
 * Test 4.3.1: Test error mapping (Instagram errors → AppError)
 */
async function testErrorMapping(): Promise<void> {
  const testCases = [
    {
      name: '401 → UnauthorizedError',
      status: 401,
      errorCode: 190,
      expectedError: UnauthorizedError,
    },
    {
      name: '403 → ForbiddenError',
      status: 403,
      errorCode: 10,
      expectedError: ForbiddenError,
    },
    {
      name: '404 → NotFoundError',
      status: 404,
      errorCode: 100,
      expectedError: NotFoundError,
    },
    {
      name: '429 → TooManyRequestsError',
      status: 429,
      errorCode: 4,
      expectedError: TooManyRequestsError,
    },
    {
      name: '500 → InternalError',
      status: 500,
      errorCode: 1,
      expectedError: InternalError,
    },
  ];

  for (const testCase of testCases) {
    const error = new AxiosError('Error');
    error.response = {
      data: {
        error: {
          message: 'Test error',
          type: 'OAuthException',
          code: testCase.errorCode,
        },
      },
      status: testCase.status,
      statusText: 'Error',
      headers: {},
      config: {} as any,
    };

    setupAxiosMock([
      async () => {
        throw error;
      },
    ]);

    try {
      await sendInstagramMessage(validRecipientId, validMessage, correlationId);
      throw new Error(`Expected ${testCase.expectedError.name} but no error was thrown`);
    } catch (err) {
      const error = err as Error;
      if (!(error instanceof testCase.expectedError)) {
        throw new Error(
          `Expected ${testCase.expectedError.name} but got ${error.constructor.name} for ${testCase.name}`
        );
      }
    }
  }
}

/**
 * Test 4.3.2: Test error logging (audit events)
 */
async function testErrorLogging(): Promise<void> {
  // Mock 401 error
  const error = new AxiosError('Unauthorized');
  error.response = {
    data: {
      error: {
        message: 'Invalid OAuth access token',
        type: 'OAuthException',
        code: 190,
      },
    },
    status: 401,
    statusText: 'Unauthorized',
    headers: {},
    config: {} as any,
  };

  setupAxiosMock([
    async () => {
      throw error;
    },
  ]);

  try {
    await sendInstagramMessage(validRecipientId, validMessage, correlationId);
  } catch (err) {
    const error = err as Error;
    // Error is expected, verify it's the right type
    if (!(error instanceof UnauthorizedError)) {
      throw new Error(`Expected UnauthorizedError but got ${error.constructor.name}`);
    }
  }

  // Wait a bit for async audit logging
  await new Promise((resolve) => setTimeout(resolve, 500));

  // Verify audit log was created (check database)
  const supabase = getSupabaseAdminClient();
  if (supabase) {
    const { data: auditLogs } = await supabase
      .from('audit_logs')
      .select('*')
      .eq('correlation_id', correlationId)
      .eq('action', 'send_message')
      .eq('status', 'failure')
      .order('created_at', { ascending: false })
      .limit(1);

    if (!auditLogs || auditLogs.length === 0) {
      throw new Error('Expected audit log entry but none found');
    }

    const auditLog = auditLogs[0];
    if (auditLog.resource_type !== 'instagram_message') {
      throw new Error(`Expected resource_type 'instagram_message' but got '${auditLog.resource_type}'`);
    }

    if (!auditLog.error_message) {
      throw new Error('Expected error_message in audit log but none found');
    }
  } else {
    console.warn('   ⚠️  WARNING: Could not verify audit log (Supabase client not available)');
  }
}

/**
 * Test network errors (ServiceUnavailableError)
 */
async function testNetworkErrors(): Promise<void> {
  // Mock network timeout
  const timeoutError = new AxiosError('timeout of 10000ms exceeded');
  timeoutError.code = 'ECONNABORTED';
  timeoutError.config = {} as any;

  setupAxiosMock([
    async () => {
      throw timeoutError;
    },
  ]);

  try {
    await sendInstagramMessage(validRecipientId, validMessage, correlationId);
    throw new Error('Expected ServiceUnavailableError but no error was thrown');
  } catch (err) {
    const error = err as Error;
    if (!(error instanceof ServiceUnavailableError)) {
      throw new Error(`Expected ServiceUnavailableError but got ${error.constructor.name}`);
    }
  }
}

/**
 * Run all tests
 */
async function runTests(): Promise<void> {
  console.log('🧪 Starting Instagram Service Tests...\n');
  console.log(`Correlation ID: ${correlationId}\n`);

  // Test 4.1: Test send message function
  console.log('📋 Test 4.1: Send Message Function\n');
  await testCase('4.1.1: Valid recipient ID and message', testValidRecipientAndMessage);
  await testCase('4.1.2: Invalid recipient ID', testInvalidRecipientId);
  await testCase('4.1.3: Invalid access token', testInvalidAccessToken);
  await testCase('4.1.4: Rate limit error with retry', testRateLimitWithRetry);

  // Test 4.2: Test retry logic
  console.log('\n📋 Test 4.2: Retry Logic\n');
  await testCase('4.2.1: Exponential backoff delays', testExponentialBackoff);
  await testCase('4.2.2: Max retries', testMaxRetries);
  await testCase('4.2.3: Non-retryable errors', testNonRetryableErrors);

  // Test 4.3: Test error handling
  console.log('\n📋 Test 4.3: Error Handling\n');
  await testCase('4.3.1: Error mapping', testErrorMapping);
  await testCase('4.3.2: Error logging', testErrorLogging);

  // Additional tests
  console.log('\n📋 Additional Tests\n');
  await testCase('Network errors (ServiceUnavailableError)', testNetworkErrors);

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log(`✅ Passed: ${passedTests}`);
  console.log(`❌ Failed: ${failedTests}`);
  console.log(`📊 Total: ${passedTests + failedTests}`);
  console.log('='.repeat(60) + '\n');

  if (failedTests > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

// Run tests
runTests().catch((error) => {
  console.error('Fatal error running tests:', error);
  process.exit(1);
});
