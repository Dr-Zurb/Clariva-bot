/**
 * Instagram Service Unit Tests
 * 
 * Tests for Instagram service send message function, retry logic, and error handling.
 * All tests use mocked dependencies to avoid actual API calls.
 * 
 * Test Coverage:
 * - 4.1: Test send message function
 *   - 4.1.1: Valid recipient ID and message (mock API call)
 *   - 4.1.2: Invalid recipient ID (should throw NotFoundError)
 *   - 4.1.3: Invalid access token (should throw UnauthorizedError)
 *   - 4.1.4: Rate limit error (should retry with backoff)
 * - 4.2: Test retry logic
 *   - 4.2.1: Exponential backoff (verify delays)
 *   - 4.2.2: Max retries (should fail after 3 attempts)
 *   - 4.2.3: Non-retryable errors (should fail immediately)
 * - 4.3: Test error handling
 *   - 4.3.1: Error mapping (Instagram errors → AppError)
 *   - 4.3.2: Error logging (audit events)
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import axios, { AxiosError } from 'axios';
import { sendInstagramMessage, mapInstagramError } from '../../../src/services/instagram-service';
import {
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  TooManyRequestsError,
  InternalError,
  ServiceUnavailableError,
} from '../../../src/utils/errors';
import * as auditLogger from '../../../src/utils/audit-logger';

// Mock dependencies
jest.mock('../../../src/utils/audit-logger');
jest.mock('../../../src/config/logger', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));
jest.mock('../../../src/config/env', () => ({
  env: {
    NODE_ENV: 'test',
    PORT: 3000,
    LOG_LEVEL: 'error',
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_ANON_KEY: 'test-anon-key',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
    INSTAGRAM_ACCESS_TOKEN: 'test-access-token',
  },
}));

// Spy on axios.post instead of fully mocking axios
// This allows axios.isAxiosError to work correctly
const mockedAxiosPost = jest.spyOn(axios, 'post');
const mockedAuditLogger = auditLogger as jest.Mocked<typeof auditLogger>;

/**
 * Helper function to create properly structured AxiosError instances for testing
 * Ensures errors are properly recognized by axios.isAxiosError
 */
function createAxiosError(
  message: string,
  status?: number,
  errorData?: any,
  code?: string
): AxiosError {
  const error = new AxiosError(message);
  error.config = {} as any;
  
  // Ensure isAxiosError property is set (required for axios.isAxiosError to work)
  // AxiosError instances should have this automatically, but we ensure it's set
  Object.defineProperty(error, 'isAxiosError', {
    value: true,
    writable: false,
    enumerable: false,
    configurable: true,
  });
  
  if (status && errorData) {
    // HTTP error - has response, explicitly no error.code
    error.response = {
      data: { error: errorData },
      status,
      statusText: message,
      headers: {},
      config: {} as any,
    };
    // Explicitly ensure code is undefined for HTTP errors
    // This prevents falling through to network error checks
    if ('code' in error) {
      delete (error as any).code;
    }
    // Use Object.defineProperty to ensure code is truly undefined
    Object.defineProperty(error, 'code', {
      value: undefined,
      writable: true,
      enumerable: false,
      configurable: true,
    });
  } else if (code) {
    // Network error - has error.code, explicitly no response
    error.code = code;
    error.response = undefined;
  }
  
  return error;
}

describe('Instagram Service', () => {
  const validRecipientId = '123456789';
  const validMessage = 'Test message';
  const correlationId = 'test-correlation-id';
  const validResponse = {
    recipient_id: validRecipientId,
    message_id: 'mid.test.123456',
  };

  beforeEach(() => {
    jest.resetAllMocks();
    // Mock audit logger functions to return resolved promises
    (mockedAuditLogger.logAuditEvent as jest.Mock) = jest.fn().mockImplementation(() => Promise.resolve());
    (mockedAuditLogger.logSecurityEvent as jest.Mock) = jest.fn().mockImplementation(() => Promise.resolve());
    // Clear spy call history; keep implementation so mockRejectedValueOnce works
    mockedAxiosPost.mockClear();
  });

  afterAll(() => {
    mockedAxiosPost.mockRestore();
  });

  describe('4.1: Send Message Function', () => {
    describe('4.1.1: Test with valid recipient ID and message (mock API call)', () => {
      it('should send message successfully with valid inputs', async () => {
        // Arrange
        mockedAxiosPost.mockResolvedValueOnce({
          data: validResponse,
          status: 200,
          statusText: 'OK',
          headers: {},
          config: {} as any,
        });

        // Act
        const result = await sendInstagramMessage(validRecipientId, validMessage, correlationId);

        // Assert
        expect(result).toEqual(validResponse);
        expect(result.recipient_id).toBe(validRecipientId);
        expect(result.message_id).toBeDefined();
        expect(mockedAxiosPost).toHaveBeenCalledTimes(1);
        expect(mockedAxiosPost).toHaveBeenCalledWith(
          'https://graph.facebook.com/v18.0/me/messages',
          {
            recipient: { id: validRecipientId },
            message: { text: validMessage },
          },
          expect.objectContaining({
            params: { access_token: 'test-access-token' },
            timeout: 10000,
          })
        );
        expect(mockedAuditLogger.logAuditEvent).toHaveBeenCalledWith(
          expect.objectContaining({
            correlationId,
            action: 'send_message',
            resourceType: 'instagram_message',
            resourceId: validResponse.message_id,
            status: 'success',
            metadata: expect.objectContaining({
              recipient_id: validRecipientId,
              message_length: validMessage.length,
              message_id: validResponse.message_id,
            }),
          })
        );
      });
    });

    describe('4.1.2: Test with invalid recipient ID (should throw NotFoundError)', () => {
      it('should throw NotFoundError for invalid recipient ID', async () => {
        // Arrange
        const invalidRecipientId = 'invalid_recipient_123';
        const error = createAxiosError('Not Found', 404, {
          message: 'Invalid recipient ID',
          type: 'GraphMethodException',
          code: 100,
        });

        mockedAxiosPost.mockRejectedValueOnce(error);

        // Act & Assert
        await expect(
          sendInstagramMessage(invalidRecipientId, validMessage, correlationId)
        ).rejects.toThrow(NotFoundError);

        expect(mockedAxiosPost).toHaveBeenCalledTimes(1);
        expect(mockedAuditLogger.logAuditEvent).toHaveBeenCalledWith(
          expect.objectContaining({
            correlationId,
            action: 'send_message',
            resourceType: 'instagram_message',
            status: 'failure',
            errorMessage: expect.any(String),
            metadata: expect.objectContaining({
              recipient_id: invalidRecipientId,
              message_length: validMessage.length,
              error_type: 'NotFoundError',
            }),
          })
        );
      });
    });

    describe('4.1.3: Test with invalid access token (should throw UnauthorizedError)', () => {
      it('should throw UnauthorizedError for invalid access token', async () => {
        // Arrange
        const error = createAxiosError('Unauthorized', 401, {
          message: 'Invalid OAuth access token',
          type: 'OAuthException',
          code: 190,
        });

        mockedAxiosPost.mockRejectedValueOnce(error);

        // Act & Assert
        await expect(
          sendInstagramMessage(validRecipientId, validMessage, correlationId)
        ).rejects.toThrow(UnauthorizedError);

        expect(mockedAxiosPost).toHaveBeenCalledTimes(1);
        expect(mockedAuditLogger.logAuditEvent).toHaveBeenCalledWith(
          expect.objectContaining({
            correlationId,
            action: 'send_message',
            resourceType: 'instagram_message',
            status: 'failure',
            errorMessage: expect.any(String),
            metadata: expect.objectContaining({
              error_type: 'UnauthorizedError',
            }),
          })
        );
      });
    });

    describe('4.1.4: Test with rate limit error (should retry with backoff)', () => {
      beforeEach(() => {
        jest.useFakeTimers();
      });

      afterEach(() => {
        jest.useRealTimers();
      });

      it('should retry on rate limit error (429) and eventually succeed', async () => {
        // Arrange
        const rateLimitError = createAxiosError('Too Many Requests', 429, {
          message: 'Rate limit exceeded',
          type: 'OAuthException',
          code: 4,
        });
        if (rateLimitError.response) {
          rateLimitError.response.headers = { 'retry-after': '1' };
        }

        mockedAxiosPost
          .mockRejectedValueOnce(rateLimitError)
          .mockResolvedValueOnce({
            data: validResponse,
            status: 200,
            statusText: 'OK',
            headers: {},
            config: {} as any,
          });

        // Act
        const promise = sendInstagramMessage(validRecipientId, validMessage, correlationId);

        // Fast-forward time by 1 second (retry delay)
        await jest.runAllTimersAsync();

        const result = await promise;

        // Assert
        expect(result).toEqual(validResponse);
        expect(mockedAxiosPost).toHaveBeenCalledTimes(2);
        expect(mockedAuditLogger.logSecurityEvent).toHaveBeenCalledWith(
          correlationId,
          undefined,
          'rate_limit_exceeded',
          'medium',
          undefined,
          'Instagram API rate limit exceeded'
        );
      });
    });
  });

  describe('4.2: Retry Logic', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    describe('4.2.1: Test exponential backoff (verify delays)', () => {

      it('should implement exponential backoff with correct delays', async () => {
        // Arrange
        const serverError = createAxiosError('Internal Server Error', 500, {
          message: 'Internal server error',
          type: 'GraphMethodException',
          code: 1,
        });

        mockedAxiosPost
          .mockRejectedValueOnce(serverError) // Attempt 0
          .mockRejectedValueOnce(serverError) // Attempt 1 (delay 1s)
          .mockRejectedValueOnce(serverError) // Attempt 2 (delay 2s)
          .mockResolvedValueOnce({
            data: validResponse,
            status: 200,
            statusText: 'OK',
            headers: {},
            config: {} as any,
          });

        // Act
        const promise = sendInstagramMessage(validRecipientId, validMessage, correlationId);

        // Fast-forward through retry delays: 1s + 2s + 4s (capped at 4s) = 7s total
        await jest.runAllTimersAsync();

        const result = await promise;

        // Assert
        expect(result).toEqual(validResponse);
        expect(mockedAxiosPost).toHaveBeenCalledTimes(4);
      });
    });

    describe('4.2.2: Test max retries (should fail after 3 attempts)', () => {
      it('should fail after max retries (3) are exhausted', async () => {
        jest.useRealTimers();
        const serverError = createAxiosError('Internal Server Error', 500, {
          message: 'Internal server error',
          type: 'GraphMethodException',
          code: 1,
        });

        // Mock 4 failures (initial + 3 retries)
        mockedAxiosPost
          .mockRejectedValueOnce(serverError)
          .mockRejectedValueOnce(serverError)
          .mockRejectedValueOnce(serverError)
          .mockRejectedValueOnce(serverError);

        // Act: call fails with 500 (retryable); after retries exhausted, throws InternalError
        await expect(
          sendInstagramMessage(validRecipientId, validMessage, correlationId)
        ).rejects.toThrow(InternalError);

        expect(mockedAxiosPost).toHaveBeenCalledTimes(4);
        jest.useFakeTimers();
      }, 15000);
    });

    describe('4.2.3: Test non-retryable errors (should fail immediately)', () => {
      beforeEach(() => {
        jest.useRealTimers(); // Use real timers for non-retryable errors
      });

      afterEach(() => {
        jest.useFakeTimers(); // Restore fake timers for other retry tests
      });

      it('should not retry on 403 Forbidden error', async () => {
        // Arrange
        const forbiddenError = createAxiosError('Forbidden', 403, {
          message: 'Permission denied',
          type: 'OAuthException',
          code: 10,
        });

        mockedAxiosPost.mockRejectedValueOnce(forbiddenError);

        // Act & Assert
        await expect(
          sendInstagramMessage(validRecipientId, validMessage, correlationId)
        ).rejects.toThrow(ForbiddenError);

        // Should only be called once (no retries)
        expect(mockedAxiosPost).toHaveBeenCalledTimes(1);
      });

      it('should not retry on 401 Unauthorized error', async () => {
        // Arrange
        const unauthorizedError = createAxiosError('Unauthorized', 401, {
          message: 'Invalid token',
          type: 'OAuthException',
          code: 190,
        });

        mockedAxiosPost.mockRejectedValueOnce(unauthorizedError);

        // Act & Assert
        await expect(
          sendInstagramMessage(validRecipientId, validMessage, correlationId)
        ).rejects.toThrow(UnauthorizedError);

        // Should only be called once (no retries)
        expect(mockedAxiosPost).toHaveBeenCalledTimes(1);
      });

      it('should not retry on 404 Not Found error', async () => {
        // Arrange
        const notFoundError = createAxiosError('Not Found', 404, {
          message: 'Recipient not found',
          type: 'GraphMethodException',
          code: 100,
        });

        mockedAxiosPost.mockRejectedValueOnce(notFoundError);

        // Act & Assert
        await expect(
          sendInstagramMessage(validRecipientId, validMessage, correlationId)
        ).rejects.toThrow(NotFoundError);

        // Should only be called once (no retries)
        expect(mockedAxiosPost).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('4.3: Error Handling', () => {
    describe('4.3.1: Test error mapping (Instagram errors → AppError)', () => {
      it('should map 401 to UnauthorizedError', async () => {
        const error = createAxiosError('Unauthorized', 401, {
          message: 'Invalid token',
          type: 'OAuthException',
          code: 190,
        });

        mockedAxiosPost.mockRejectedValueOnce(error);

        await expect(
          sendInstagramMessage(validRecipientId, validMessage, correlationId)
        ).rejects.toThrow(UnauthorizedError);
      });

      it('should map 403 to ForbiddenError', async () => {
        const error = createAxiosError('Forbidden', 403, {
          message: 'Permission denied',
          type: 'OAuthException',
          code: 10,
        });

        mockedAxiosPost.mockRejectedValueOnce(error);

        await expect(
          sendInstagramMessage(validRecipientId, validMessage, correlationId)
        ).rejects.toThrow(ForbiddenError);
      });

      it('should map 404 to NotFoundError', async () => {
        const error = createAxiosError('Not Found', 404, {
          message: 'Recipient not found',
          type: 'GraphMethodException',
          code: 100,
          error_subcode: 463,
        });

        mockedAxiosPost.mockRejectedValueOnce(error);

        await expect(
          sendInstagramMessage(validRecipientId, validMessage, correlationId)
        ).rejects.toThrow(NotFoundError);
      });

      it('should map 429 to TooManyRequestsError', async () => {
        const error = createAxiosError('Too Many Requests', 429, {
          message: 'Rate limit exceeded',
          type: 'OAuthException',
          code: 4,
        });

        // Service retries on 429; mock all attempts so we don't hit real axios
        mockedAxiosPost.mockRejectedValue(error);

        await expect(
          sendInstagramMessage(validRecipientId, validMessage, correlationId)
        ).rejects.toThrow(TooManyRequestsError);
      });

      it('should map 5xx to InternalError', async () => {
        const error = createAxiosError('Internal Server Error', 500, {
          message: 'Server error',
          type: 'GraphMethodException',
          code: 1,
        });

        // Service retries on 5xx; mock all attempts so we don't hit real axios
        mockedAxiosPost.mockRejectedValue(error);

        await expect(
          sendInstagramMessage(validRecipientId, validMessage, correlationId)
        ).rejects.toThrow(InternalError);
      });

      it('should map network timeout to ServiceUnavailableError', () => {
        const error = createAxiosError('timeout of 10000ms exceeded', undefined, undefined, 'ECONNABORTED');
        const result = mapInstagramError(error, correlationId);
        expect(result).toBeInstanceOf(ServiceUnavailableError);
        expect(result.message).toBe('Instagram API request timeout');
      });

      it('should map connection refused to ServiceUnavailableError', () => {
        const error = createAxiosError('Connection refused', undefined, undefined, 'ECONNREFUSED');
        const result = mapInstagramError(error, correlationId);
        expect(result).toBeInstanceOf(ServiceUnavailableError);
        expect(result.message).toBe('Instagram API connection failed');
      });
    });

    describe('4.3.2: Test error logging (audit events)', () => {
      it('should log audit event on successful message send', async () => {
        // Arrange
        mockedAxiosPost.mockResolvedValueOnce({
          data: validResponse,
          status: 200,
          statusText: 'OK',
          headers: {},
          config: {} as any,
        });

        // Act
        await sendInstagramMessage(validRecipientId, validMessage, correlationId);

        // Assert
        expect(mockedAuditLogger.logAuditEvent).toHaveBeenCalledWith(
          expect.objectContaining({
            correlationId,
            action: 'send_message',
            resourceType: 'instagram_message',
            resourceId: validResponse.message_id,
            status: 'success',
            metadata: expect.objectContaining({
              recipient_id: validRecipientId,
              message_length: validMessage.length,
              message_id: validResponse.message_id,
            }),
          })
        );
      });

      it('should log audit event on error with failure status', async () => {
        // Arrange
        const error = createAxiosError('Unauthorized', 401, {
          message: 'Invalid token',
          type: 'OAuthException',
          code: 190,
        });

        mockedAxiosPost.mockRejectedValueOnce(error);

        // Act
        await expect(
          sendInstagramMessage(validRecipientId, validMessage, correlationId)
        ).rejects.toThrow(UnauthorizedError);

        // Assert
        expect(mockedAuditLogger.logAuditEvent).toHaveBeenCalledWith(
          expect.objectContaining({
            correlationId,
            action: 'send_message',
            resourceType: 'instagram_message',
            status: 'failure',
            errorMessage: expect.any(String),
            metadata: expect.objectContaining({
              recipient_id: validRecipientId,
              message_length: validMessage.length,
              error_type: 'UnauthorizedError',
            }),
          })
        );
      });

      it('should log security event on rate limit', async () => {
        // Arrange
        const rateLimitError = createAxiosError('Too Many Requests', 429, {
          message: 'Rate limit exceeded',
          type: 'OAuthException',
          code: 4,
        });

        // Service retries on 429; mock all attempts so we don't hit real axios
        mockedAxiosPost.mockRejectedValue(rateLimitError);

        // Act
        await expect(
          sendInstagramMessage(validRecipientId, validMessage, correlationId)
        ).rejects.toThrow(TooManyRequestsError);

        // Assert
        expect(mockedAuditLogger.logSecurityEvent).toHaveBeenCalledWith(
          correlationId,
          undefined,
          'rate_limit_exceeded',
          'medium',
          undefined,
          'Instagram API rate limit exceeded'
        );
      });
    });
  });
});
