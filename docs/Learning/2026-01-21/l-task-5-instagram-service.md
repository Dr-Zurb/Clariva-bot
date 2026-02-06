# Learning Topics - Instagram Service Implementation
## Task #5: Instagram Webhook Integration

---

## 📚 What Are We Learning Today?

Today we're learning about **Instagram Service** - the service layer that communicates with Meta's Instagram Graph API to send messages to Instagram users. Think of it like **a hospital's communication department** - we receive instructions to send messages (from the webhook worker), format them correctly for Instagram's API, handle rate limits and retries gracefully, log everything for compliance, and ensure messages are delivered reliably. This service is critical for responding to patient messages on Instagram!

We'll learn about:
1. **Service Pattern** - Business logic layer architecture (vs Controller Pattern)
2. **Instagram Graph API** - Meta's messaging API for Instagram
3. **Sending Messages** - API calls to send text messages to Instagram users
4. **Retry Logic** - Exponential backoff for transient failures
5. **Rate Limit Handling** - Meta platform's strict rate limits
6. **Error Handling** - Mapping Instagram API errors to AppError
7. **Audit Logging** - Compliance requirements for external API calls
8. **TypeScript Types** - Type-safe API integration
9. **Security** - Access token management and HTTPS
10. **Testing External Services** - Mocking and testing patterns

---

## 🎓 Topic 1: Service Pattern

### What is the Service Pattern?

**Service Pattern** is an architectural pattern that separates business logic (services) from HTTP handling (controllers) and data access (database).

**Think of it like:**
- **Controllers** = Reception desk (handles HTTP, validates input)
- **Services** = Medical departments (business logic, no HTTP knowledge)
- **Database** = Medical records (data storage)

### Architecture Layers

```
HTTP Request
    ↓
controllers/*.ts (HTTP layer, validates input)
    ↓
services/*.ts (business logic, framework-agnostic)
    ↓
database/config/*.ts (data access)
    ↓
HTTP Response
```

### Service Responsibilities

**Services MUST:**
- Contain business logic (framework-agnostic)
- Use try-catch (not asyncHandler - that's for controllers)
- Throw AppError on errors (never return {error} objects)
- Have TypeScript types for all functions
- Be stateless (no internal state)
- Not import Express types (framework-agnostic)

**Services MUST NOT:**
- Handle HTTP request/response (that's controllers)
- Import Express types (Request, Response)
- Use asyncHandler (that's for controllers only)
- Return {error} objects (throw AppError instead)
- Contain route definitions (that's routes)

### Service vs Controller

| Aspect | Controller | Service |
|--------|-----------|---------|
| **HTTP Knowledge** | ✅ Uses Request/Response | ❌ No HTTP types |
| **Error Handling** | asyncHandler wrapper | try-catch blocks |
| **Framework** | Express-specific | Framework-agnostic |
| **Business Logic** | ❌ Delegates to services | ✅ Contains business logic |
| **Response Formatting** | ✅ Formats HTTP responses | ❌ Returns raw data |

### Example Service Structure

```typescript
import { AppError, InternalError } from '../utils/errors';
import { logger } from '../config/logger';

/**
 * Service function example
 * 
 * Services use try-catch (not asyncHandler)
 * Services throw AppError (never return {error})
 */
export async function doSomething(input: string): Promise<Result> {
  try {
    // Business logic here
    const result = await someOperation(input);
    
    // Return result (not HTTP response)
    return result;
  } catch (error) {
    // Re-throw AppError as-is
    if (error instanceof AppError) {
      throw error;
    }
    
    // Wrap unexpected errors
    logger.error({ error }, 'Unexpected error in doSomething');
    throw new InternalError('Failed to do something');
  }
}
```

**See:** [STANDARDS.md](../../Reference/STANDARDS.md) - Service Pattern section

---

## 🎓 Topic 2: Instagram Graph API

### What is Instagram Graph API?

**Instagram Graph API** is Meta's API for programmatically interacting with Instagram accounts, including sending messages to users.

**Key Concepts:**
- **Base URL:** `https://graph.facebook.com/v18.0`
- **Authentication:** Access token in query parameter
- **Endpoint:** `POST /{page-id}/messages` (for sending messages)
- **Rate Limits:** Strict limits (must handle 429 errors)

### API Endpoints

**Send Message:**
```
POST https://graph.facebook.com/v18.0/{page-id}/messages?access_token={token}
```

**Request Body:**
```json
{
  "recipient": {
    "id": "instagram_user_id"
  },
  "message": {
    "text": "Hello, this is a message"
  }
}
```

**Response (Success):**
```json
{
  "recipient_id": "instagram_user_id",
  "message_id": "mid.1234567890"
}
```

**Response (Error):**
```json
{
  "error": {
    "message": "Error message",
    "type": "OAuthException",
    "code": 190,
    "error_subcode": 463
  }
}
```

### Authentication

**Access Token:**
- Stored in environment variable: `INSTAGRAM_ACCESS_TOKEN`
- Passed as query parameter: `?access_token={token}`
- Never logged or exposed in responses
- Must be valid and have required permissions

**Page ID:**
- Optional: `INSTAGRAM_PAGE_ID` (for reference)
- Used in endpoint path: `/{page-id}/messages`
- Can use `me` instead: `/me/messages`

### API Versioning

**Current Version:** v18.0 (as of 2026-01-21)
- Meta updates API versions regularly
- Check Meta's documentation for latest version
- Version in URL: `https://graph.facebook.com/v18.0`

**See:** [Meta Platform Documentation](https://developers.facebook.com/docs/instagram-platform)

---

## 🎓 Topic 3: Sending Messages

### Send Message Function

**Function Signature:**
```typescript
async function sendInstagramMessage(
  recipientId: string,
  message: string,
  correlationId: string
): Promise<InstagramSendMessageResponse>
```

**Parameters:**
- `recipientId`: Instagram user ID (from webhook payload)
- `message`: Text message to send
- `correlationId`: Request correlation ID (for logging)

**Implementation:**
```typescript
import axios from 'axios';
import { env } from '../config/env';
import { AppError, UnauthorizedError, NotFoundError } from '../utils/errors';

const GRAPH_API_BASE = 'https://graph.facebook.com/v18.0';

export async function sendInstagramMessage(
  recipientId: string,
  message: string,
  correlationId: string
): Promise<InstagramSendMessageResponse> {
  try {
    // Validate access token
    if (!env.INSTAGRAM_ACCESS_TOKEN) {
      throw new InternalError('Instagram access token not configured');
    }

    // Prepare request
    const url = `${GRAPH_API_BASE}/me/messages`;
    const params = {
      access_token: env.INSTAGRAM_ACCESS_TOKEN,
    };
    const payload = {
      recipient: { id: recipientId },
      message: { text: message },
    };

    // Make API call
    const response = await axios.post(url, payload, { params });

    // Return response
    return {
      recipientId: response.data.recipient_id,
      messageId: response.data.message_id,
    };
  } catch (error) {
    // Handle errors (see Error Handling section)
    throw mapInstagramError(error, correlationId);
  }
}
```

### Request Format

**URL:**
```
POST https://graph.facebook.com/v18.0/me/messages?access_token={token}
```

**Headers:**
```
Content-Type: application/json
```

**Body:**
```json
{
  "recipient": {
    "id": "instagram_user_id"
  },
  "message": {
    "text": "Message text here"
  }
}
```

### Response Format

**Success Response:**
```json
{
  "recipient_id": "instagram_user_id",
  "message_id": "mid.1234567890"
}
```

**Error Response:**
```json
{
  "error": {
    "message": "Error description",
    "type": "OAuthException",
    "code": 190,
    "error_subcode": 463
  }
}
```

---

## 🎓 Topic 4: Retry Logic

### Why Retry Logic?

**Transient Failures:**
- Network issues (timeouts, connection errors)
- Rate limits (429 Too Many Requests)
- Server errors (5xx responses)

**Retry Strategy:**
- Exponential backoff (1s, 2s, 4s)
- Max retries: 3 attempts
- Only retry retryable errors (429, 5xx)
- Don't retry client errors (4xx except 429)

### Exponential Backoff

**Backoff Formula:**
```
delay = min(initialDelay * (2 ^ attempt), maxDelay)
```

**Example:**
- Attempt 1: 1 second
- Attempt 2: 2 seconds
- Attempt 3: 4 seconds
- Max delay: 4 seconds

### Implementation

```typescript
async function sendWithRetry(
  recipientId: string,
  message: string,
  correlationId: string,
  maxRetries: number = 3
): Promise<InstagramSendMessageResponse> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await sendInstagramMessage(recipientId, message, correlationId);
    } catch (error) {
      lastError = error;

      // Don't retry on client errors (except 429)
      if (error instanceof AppError) {
        const statusCode = (error as any).statusCode;
        if (statusCode >= 400 && statusCode < 500 && statusCode !== 429) {
          throw error; // Don't retry
        }
      }

      // Don't retry on last attempt
      if (attempt >= maxRetries) {
        break;
      }

      // Calculate backoff delay
      const delay = Math.min(1000 * Math.pow(2, attempt), 4000);
      
      logger.warn(
        { attempt: attempt + 1, maxRetries, delay, correlationId },
        'Retrying Instagram API call after error'
      );

      // Wait before retry
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // All retries exhausted
  throw lastError || new InternalError('Failed to send message after retries');
}
```

### Retryable vs Non-Retryable Errors

**Retryable (should retry):**
- 429 Too Many Requests (rate limit)
- 500 Internal Server Error
- 502 Bad Gateway
- 503 Service Unavailable
- 504 Gateway Timeout
- Network errors (timeouts, connection errors)

**Non-Retryable (don't retry):**
- 400 Bad Request (invalid input)
- 401 Unauthorized (invalid token)
- 403 Forbidden (permissions)
- 404 Not Found (invalid recipient)
- 422 Unprocessable Entity (validation error)

---

## 🎓 Topic 5: Rate Limit Handling

### Meta Platform Rate Limits

**Instagram Graph API Rate Limits:**
- **Messaging API:** 200 requests per hour per page
- **Rate Limit Response:** 429 Too Many Requests
- **Retry-After Header:** Optional, indicates when to retry

### Detecting Rate Limits

**Rate Limit Response:**
```json
{
  "error": {
    "message": "Rate limit exceeded",
    "type": "OAuthException",
    "code": 4,
    "error_subcode": 2446079
  }
}
```

**HTTP Status:** 429

**Headers:**
- `Retry-After`: Seconds to wait before retrying (optional)

### Rate Limit Handling Strategy

**1. Detect Rate Limit:**
```typescript
if (error.response?.status === 429) {
  // Rate limit hit
}
```

**2. Extract Retry-After:**
```typescript
const retryAfter = error.response?.headers['retry-after'];
const delay = retryAfter ? parseInt(retryAfter, 10) * 1000 : calculateBackoff(attempt);
```

**3. Log Rate Limit Violation:**
```typescript
await logSecurityEvent(
  correlationId,
  undefined,
  'rate_limit_exceeded',
  'medium',
  undefined,
  'Instagram API rate limit exceeded'
);
```

**4. Retry with Backoff:**
```typescript
// Use Retry-After header if available, otherwise use exponential backoff
const delay = retryAfter 
  ? parseInt(retryAfter, 10) * 1000 
  : Math.min(1000 * Math.pow(2, attempt), 4000);
```

### Implementation

```typescript
async function sendWithRateLimitHandling(
  recipientId: string,
  message: string,
  correlationId: string
): Promise<InstagramSendMessageResponse> {
  const maxRetries = 3;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await sendInstagramMessage(recipientId, message, correlationId);
    } catch (error) {
      // Check if rate limit error
      if (error.response?.status === 429) {
        // Log rate limit violation
        await logSecurityEvent(
          correlationId,
          undefined,
          'rate_limit_exceeded',
          'medium',
          undefined,
          'Instagram API rate limit exceeded'
        );

        // Extract Retry-After header
        const retryAfter = error.response?.headers['retry-after'];
        const delay = retryAfter 
          ? parseInt(retryAfter, 10) * 1000 
          : Math.min(1000 * Math.pow(2, attempt), 4000);

        // Don't retry on last attempt
        if (attempt >= maxRetries) {
          throw new TooManyRequestsError('Instagram API rate limit exceeded');
        }

        // Wait before retry
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue; // Retry
      }

      // Handle other errors (see Error Handling section)
      throw mapInstagramError(error, correlationId);
    }
  }

  throw new InternalError('Failed to send message after retries');
}
```

---

## 🎓 Topic 6: Error Handling

### Instagram API Error Format

**Error Response Structure:**
```json
{
  "error": {
    "message": "Error description",
    "type": "OAuthException",
    "code": 190,
    "error_subcode": 463,
    "fbtrace_id": "trace_id_here"
  }
}
```

**Common Error Codes:**
- `190`: OAuthException (invalid/expired token)
- `4`: Rate limit exceeded
- `100`: Invalid parameter
- `200`: Permissions error
- `2500`: Invalid recipient

### Error Mapping

**Map Instagram errors to AppError:**

| Instagram Error | HTTP Status | AppError Type |
|----------------|-------------|---------------|
| OAuthException (190) | 401 | UnauthorizedError |
| Permissions (200) | 403 | ForbiddenError |
| Invalid recipient | 404 | NotFoundError |
| Rate limit (4) | 429 | TooManyRequestsError |
| Server error (5xx) | 500 | InternalServerError |
| Network error | - | ServiceUnavailableError |

### Implementation

```typescript
import {
  AppError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  TooManyRequestsError,
  InternalServerError,
  ServiceUnavailableError,
} from '../utils/errors';

function mapInstagramError(error: unknown, correlationId: string): AppError {
  // Handle axios errors
  if (axios.isAxiosError(error)) {
    const statusCode = error.response?.status;
    const errorData = error.response?.data?.error;

    // Map by HTTP status code
    switch (statusCode) {
      case 401:
        return new UnauthorizedError(
          errorData?.message || 'Instagram API authentication failed'
        );
      case 403:
        return new ForbiddenError(
          errorData?.message || 'Instagram API permission denied'
        );
      case 404:
        return new NotFoundError(
          errorData?.message || 'Instagram recipient not found'
        );
      case 429:
        return new TooManyRequestsError(
          errorData?.message || 'Instagram API rate limit exceeded'
        );
      case 500:
      case 502:
      case 503:
      case 504:
        return new InternalServerError(
          errorData?.message || 'Instagram API server error'
        );
    }

    // Network errors
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      return new ServiceUnavailableError('Instagram API request timeout');
    }

    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      return new ServiceUnavailableError('Instagram API connection failed');
    }
  }

  // Handle Instagram-specific error codes
  if (error.response?.data?.error) {
    const instagramError = error.response.data.error;
    
    // OAuthException (invalid token)
    if (instagramError.code === 190) {
      return new UnauthorizedError('Instagram access token invalid or expired');
    }

    // Rate limit
    if (instagramError.code === 4) {
      return new TooManyRequestsError('Instagram API rate limit exceeded');
    }

    // Invalid recipient
    if (instagramError.error_subcode === 463) {
      return new NotFoundError('Instagram recipient not found');
    }
  }

  // Unknown error
  logger.error(
    { error, correlationId },
    'Unknown Instagram API error'
  );
  return new InternalServerError('Failed to send Instagram message');
}
```

### Error Handling in Service

**Service Error Handling Pattern:**
```typescript
export async function sendInstagramMessage(
  recipientId: string,
  message: string,
  correlationId: string
): Promise<InstagramSendMessageResponse> {
  try {
    // API call
    const response = await axios.post(url, payload, { params });
    return response.data;
  } catch (error) {
    // Re-throw AppError as-is
    if (error instanceof AppError) {
      throw error;
    }

    // Map Instagram errors to AppError
    throw mapInstagramError(error, correlationId);
  }
}
```

**Key Rules:**
- Services MUST throw AppError (never return {error})
- Services MUST use try-catch (not asyncHandler)
- Services MUST map external errors to AppError
- Services MUST log errors (metadata only, no PHI)

---

## 🎓 Topic 7: Audit Logging

### Why Audit Logging?

**Compliance Requirements:**
- All external API calls must be audited
- Required for HIPAA, GDPR, and other regulations
- Provides audit trail for security and compliance

**What to Log:**
- Message sent (success)
- API errors (failures)
- Rate limit violations
- Metadata only (never message content)

### Audit Log Events

**Message Sent (Success):**
```typescript
await logAuditEvent({
  correlationId,
  userId: undefined, // System operation
  action: 'send_message',
  resourceType: 'instagram_message',
  resourceId: messageId,
  status: 'success',
  metadata: {
    recipient_id: recipientId,
    message_length: message.length,
    message_id: messageId,
  },
});
```

**API Error (Failure):**
```typescript
await logAuditEvent({
  correlationId,
  userId: undefined,
  action: 'send_message',
  resourceType: 'instagram_message',
  status: 'failure',
  errorMessage: sanitizedErrorMessage, // Never include PHI
  metadata: {
    recipient_id: recipientId,
    message_length: message.length,
    error_code: errorCode,
  },
});
```

### PII Redaction Rules

**NEVER Log:**
- Message content (may contain PHI)
- Access tokens
- Full error messages (may contain sensitive data)

**ALWAYS Log:**
- Recipient ID (anonymized if possible)
- Message length (not content)
- Message ID
- Error codes (not full error messages)
- Status (success/failure)

### Implementation

```typescript
import { logAuditEvent, logSecurityEvent } from '../utils/audit-logger';

export async function sendInstagramMessage(
  recipientId: string,
  message: string,
  correlationId: string
): Promise<InstagramSendMessageResponse> {
  try {
    // Send message
    const response = await sendInstagramMessageAPI(recipientId, message);

    // Log success (metadata only, never message content)
    await logAuditEvent({
      correlationId,
      userId: undefined,
      action: 'send_message',
      resourceType: 'instagram_message',
      resourceId: response.messageId,
      status: 'success',
      metadata: {
        recipient_id: recipientId,
        message_length: message.length,
        message_id: response.messageId,
      },
    });

    return response;
  } catch (error) {
    // Log failure (sanitized error message)
    const sanitizedError = error instanceof AppError 
      ? error.message 
      : 'Unknown error';

    await logAuditEvent({
      correlationId,
      userId: undefined,
      action: 'send_message',
      resourceType: 'instagram_message',
      status: 'failure',
      errorMessage: sanitizedError,
      metadata: {
        recipient_id: recipientId,
        message_length: message.length,
        error_type: error instanceof AppError ? error.constructor.name : 'Unknown',
      },
    });

    throw error;
  }
}
```

---

## 🎓 Topic 8: TypeScript Types

### Instagram API Types

**Request Types:**
```typescript
export interface InstagramSendMessageRequest {
  recipient: {
    id: string; // Instagram user ID
  };
  message: {
    text: string; // Message text
  };
}
```

**Response Types:**
```typescript
export interface InstagramSendMessageResponse {
  recipientId: string;
  messageId: string;
}
```

**Error Types:**
```typescript
export interface InstagramApiError {
  error: {
    message: string;
    type: string;
    code: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
}
```

### Service Function Types

**Function Signature:**
```typescript
export async function sendInstagramMessage(
  recipientId: string,
  message: string,
  correlationId: string
): Promise<InstagramSendMessageResponse>
```

**Parameters:**
- `recipientId: string` - Instagram user ID
- `message: string` - Text message to send
- `correlationId: string` - Request correlation ID

**Return Type:**
- `Promise<InstagramSendMessageResponse>` - Message ID and recipient ID

### Type Safety

**Benefits:**
- Compile-time error checking
- IntelliSense support
- Documentation through types
- Prevents runtime errors

**Example:**
```typescript
// Type-safe function call
const response = await sendInstagramMessage(
  'instagram_user_id',
  'Hello, patient!',
  'correlation-123'
);

// TypeScript knows response structure
console.log(response.messageId); // ✅ Type-safe
console.log(response.recipientId); // ✅ Type-safe
```

---

## 🎓 Topic 9: Security Considerations

### Access Token Security

**Storage:**
- Store in environment variables (`.env` file)
- Never commit to version control
- Use `.env.example` for documentation

**Usage:**
- Pass as query parameter: `?access_token={token}`
- Never log access tokens
- Never expose in error messages
- Rotate tokens regularly

**Validation:**
```typescript
if (!env.INSTAGRAM_ACCESS_TOKEN) {
  throw new InternalError('Instagram access token not configured');
}
```

### HTTPS Only

**Requirement:**
- All API calls MUST use HTTPS
- Never use HTTP for production
- Verify SSL certificates

**Implementation:**
```typescript
// Axios uses HTTPS by default
const url = 'https://graph.facebook.com/v18.0/me/messages';
// ✅ HTTPS (secure)
```

### Input Validation

**Validate Input:**
- Recipient ID format (Instagram user IDs)
- Message length (Meta has limits)
- Correlation ID format

**Example:**
```typescript
function validateInput(
  recipientId: string,
  message: string
): void {
  if (!recipientId || typeof recipientId !== 'string') {
    throw new ValidationError('Invalid recipient ID');
  }

  if (!message || typeof message !== 'string') {
    throw new ValidationError('Invalid message');
  }

  if (message.length > 2000) {
    throw new ValidationError('Message too long (max 2000 characters)');
  }
}
```

---

## 🎓 Topic 10: Testing External Services

### Mocking External APIs

**Why Mock?**
- Don't make real API calls in tests
- Control test scenarios (success, errors)
- Fast test execution
- No API costs

**Mocking with Jest:**
```typescript
import axios from 'axios';
jest.mock('axios');

test('sends message successfully', async () => {
  const mockResponse = {
    data: {
      recipient_id: 'user_123',
      message_id: 'mid.123',
    },
  };

  (axios.post as jest.Mock).mockResolvedValue(mockResponse);

  const result = await sendInstagramMessage('user_123', 'Hello', 'corr-1');
  
  expect(result.messageId).toBe('mid.123');
  expect(axios.post).toHaveBeenCalledWith(
    expect.stringContaining('/me/messages'),
    expect.objectContaining({
      recipient: { id: 'user_123' },
      message: { text: 'Hello' },
    }),
    expect.any(Object)
  );
});
```

### Testing Error Scenarios

**Test Rate Limit:**
```typescript
test('handles rate limit error', async () => {
  const rateLimitError = {
    response: {
      status: 429,
      headers: { 'retry-after': '60' },
      data: {
        error: {
          message: 'Rate limit exceeded',
          code: 4,
        },
      },
    },
  };

  (axios.post as jest.Mock).mockRejectedValue(rateLimitError);

  await expect(
    sendInstagramMessage('user_123', 'Hello', 'corr-1')
  ).rejects.toThrow(TooManyRequestsError);
});
```

**Test Invalid Token:**
```typescript
test('handles invalid token error', async () => {
  const authError = {
    response: {
      status: 401,
      data: {
        error: {
          message: 'Invalid OAuth access token',
          code: 190,
        },
      },
    },
  };

  (axios.post as jest.Mock).mockRejectedValue(authError);

  await expect(
    sendInstagramMessage('user_123', 'Hello', 'corr-1')
  ).rejects.toThrow(UnauthorizedError);
});
```

### Testing Retry Logic

**Test Exponential Backoff:**
```typescript
test('retries with exponential backoff', async () => {
  const serverError = {
    response: { status: 500 },
    data: { error: { message: 'Server error' } },
  };

  // First 2 attempts fail, 3rd succeeds
  (axios.post as jest.Mock)
    .mockRejectedValueOnce(serverError)
    .mockRejectedValueOnce(serverError)
    .mockResolvedValue({ data: { message_id: 'mid.123' } });

  const result = await sendInstagramMessage('user_123', 'Hello', 'corr-1');

  expect(axios.post).toHaveBeenCalledTimes(3);
  expect(result.messageId).toBe('mid.123');
});
```

---

## 🎓 Topic 11: Service Implementation Pattern

### Complete Service Example

```typescript
/**
 * Instagram Service
 * 
 * Service for sending messages via Instagram Graph API.
 * Handles retries, rate limits, and error mapping.
 * 
 * IMPORTANT:
 * - Services use try-catch (not asyncHandler)
 * - Services throw AppError (never return {error})
 * - Never log message content (may contain PHI)
 */

import axios from 'axios';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { logAuditEvent, logSecurityEvent } from '../utils/audit-logger';
import {
  AppError,
  UnauthorizedError,
  NotFoundError,
  TooManyRequestsError,
  InternalServerError,
  ServiceUnavailableError,
} from '../utils/errors';
import type {
  InstagramSendMessageResponse,
  InstagramApiError,
} from '../types/instagram';

const GRAPH_API_BASE = 'https://graph.facebook.com/v18.0';
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 1000; // 1 second
const MAX_RETRY_DELAY = 4000; // 4 seconds

/**
 * Send message to Instagram user
 * 
 * @param recipientId - Instagram user ID
 * @param message - Text message to send
 * @param correlationId - Request correlation ID
 * @returns Message ID and recipient ID
 * @throws AppError on failure
 */
export async function sendInstagramMessage(
  recipientId: string,
  message: string,
  correlationId: string
): Promise<InstagramSendMessageResponse> {
  // Validate input
  if (!recipientId || !message) {
    throw new ValidationError('Recipient ID and message are required');
  }

  // Validate access token
  if (!env.INSTAGRAM_ACCESS_TOKEN) {
    throw new InternalError('Instagram access token not configured');
  }

  // Send with retry logic
  return sendWithRetry(recipientId, message, correlationId);
}

/**
 * Send message with retry logic
 */
async function sendWithRetry(
  recipientId: string,
  message: string,
  correlationId: string
): Promise<InstagramSendMessageResponse> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await sendMessageAPI(recipientId, message, correlationId);

      // Log success
      await logAuditEvent({
        correlationId,
        userId: undefined,
        action: 'send_message',
        resourceType: 'instagram_message',
        resourceId: response.messageId,
        status: 'success',
        metadata: {
          recipient_id: recipientId,
          message_length: message.length,
          message_id: response.messageId,
        },
      });

      return response;
    } catch (error) {
      lastError = error as Error;

      // Map error
      const appError = mapInstagramError(error, correlationId);

      // Don't retry on client errors (except 429)
      if (
        appError instanceof UnauthorizedError ||
        appError instanceof NotFoundError ||
        (appError instanceof ForbiddenError && attempt === 0)
      ) {
        throw appError;
      }

      // Handle rate limit
      if (appError instanceof TooManyRequestsError) {
        await logSecurityEvent(
          correlationId,
          undefined,
          'rate_limit_exceeded',
          'medium',
          undefined,
          'Instagram API rate limit exceeded'
        );

        // Extract Retry-After header
        const retryAfter = (error as any).response?.headers['retry-after'];
        const delay = retryAfter
          ? parseInt(retryAfter, 10) * 1000
          : Math.min(INITIAL_RETRY_DELAY * Math.pow(2, attempt), MAX_RETRY_DELAY);

        if (attempt >= MAX_RETRIES) {
          throw appError;
        }

        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      // Don't retry on last attempt
      if (attempt >= MAX_RETRIES) {
        break;
      }

      // Calculate backoff delay
      const delay = Math.min(
        INITIAL_RETRY_DELAY * Math.pow(2, attempt),
        MAX_RETRY_DELAY
      );

      logger.warn(
        { attempt: attempt + 1, maxRetries: MAX_RETRIES, delay, correlationId },
        'Retrying Instagram API call after error'
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // Log failure
  await logAuditEvent({
    correlationId,
    userId: undefined,
    action: 'send_message',
    resourceType: 'instagram_message',
    status: 'failure',
    errorMessage: lastError instanceof AppError ? lastError.message : 'Unknown error',
    metadata: {
      recipient_id: recipientId,
      message_length: message.length,
    },
  });

  throw lastError || new InternalServerError('Failed to send message after retries');
}

/**
 * Make Instagram API call
 */
async function sendMessageAPI(
  recipientId: string,
  message: string,
  correlationId: string
): Promise<InstagramSendMessageResponse> {
  const url = `${GRAPH_API_BASE}/me/messages`;
  const params = {
    access_token: env.INSTAGRAM_ACCESS_TOKEN!,
  };
  const payload = {
    recipient: { id: recipientId },
    message: { text: message },
  };

  try {
    const response = await axios.post<InstagramSendMessageResponse>(
      url,
      payload,
      { params }
    );

    return {
      recipientId: response.data.recipient_id,
      messageId: response.data.message_id,
    };
  } catch (error) {
    throw mapInstagramError(error, correlationId);
  }
}

/**
 * Map Instagram API errors to AppError
 */
function mapInstagramError(error: unknown, correlationId: string): AppError {
  if (axios.isAxiosError(error)) {
    const statusCode = error.response?.status;
    const errorData = error.response?.data?.error as InstagramApiError['error'];

    switch (statusCode) {
      case 401:
        return new UnauthorizedError(
          errorData?.message || 'Instagram API authentication failed'
        );
      case 403:
        return new ForbiddenError(
          errorData?.message || 'Instagram API permission denied'
        );
      case 404:
        return new NotFoundError(
          errorData?.message || 'Instagram recipient not found'
        );
      case 429:
        return new TooManyRequestsError(
          errorData?.message || 'Instagram API rate limit exceeded'
        );
      case 500:
      case 502:
      case 503:
      case 504:
        return new InternalServerError(
          errorData?.message || 'Instagram API server error'
        );
    }

    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      return new ServiceUnavailableError('Instagram API request timeout');
    }

    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      return new ServiceUnavailableError('Instagram API connection failed');
    }
  }

  if (error && typeof error === 'object' && 'response' in error) {
    const instagramError = (error as any).response?.data?.error;
    if (instagramError) {
      if (instagramError.code === 190) {
        return new UnauthorizedError('Instagram access token invalid or expired');
      }
      if (instagramError.code === 4) {
        return new TooManyRequestsError('Instagram API rate limit exceeded');
      }
    }
  }

  logger.error({ error, correlationId }, 'Unknown Instagram API error');
  return new InternalServerError('Failed to send Instagram message');
}
```

---

## 🎓 Topic 12: Integration with Webhook Worker

### How Service is Used

**Webhook Worker Calls Service:**
```typescript
// In webhook worker (Task 6)
import { sendInstagramMessage } from '../services/instagram-service';

async function processWebhook(webhookData: WebhookJobData) {
  // Extract message data from webhook
  const recipientId = extractRecipientId(webhookData.payload);
  const responseMessage = generateResponse(webhookData.payload);

  // Send response via Instagram service
  await sendInstagramMessage(
    recipientId,
    responseMessage,
    webhookData.correlationId
  );
}
```

### Service Independence

**Service is Framework-Agnostic:**
- No Express imports
- No HTTP knowledge
- Can be used by workers, CLI tools, or other services
- Pure business logic

**Benefits:**
- Reusable across different contexts
- Easier to test (no HTTP mocking needed)
- Clear separation of concerns

---

## 🎓 Topic 13: Best Practices

### Service Best Practices

**1. Stateless Services:**
- No internal state
- Pure functions (same input = same output)
- Thread-safe

**2. Error Handling:**
- Always throw AppError
- Never return {error} objects
- Map external errors to AppError
- Log errors (metadata only)

**3. Retry Logic:**
- Only retry retryable errors
- Use exponential backoff
- Respect rate limit headers
- Log retry attempts

**4. Audit Logging:**
- Log all external API calls
- Never log PHI (message content)
- Log metadata only
- Include correlation ID

**5. Type Safety:**
- Type all function parameters
- Type all return values
- Use interfaces for API types
- Avoid `any` types

### Anti-Patterns to Avoid

**❌ DON'T:**
```typescript
// ❌ Using asyncHandler in service
export const sendMessage = asyncHandler(async (recipientId, message) => {
  // ...
});

// ❌ Returning error objects
return { error: 'Something went wrong' };

// ❌ Logging PHI
logger.info({ message }, 'Sending message'); // ❌ Contains PHI

// ❌ No error handling
const response = await axios.post(url, payload); // ❌ No try-catch

// ❌ Importing Express types
import { Request, Response } from 'express'; // ❌ Services shouldn't know about HTTP
```

**✅ DO:**
```typescript
// ✅ Using try-catch in service
export async function sendMessage(recipientId: string, message: string) {
  try {
    // ...
  } catch (error) {
    throw mapError(error);
  }
}

// ✅ Throwing AppError
throw new InternalError('Something went wrong');

// ✅ Logging metadata only
logger.info({ message_length: message.length }, 'Sending message'); // ✅ No PHI

// ✅ Proper error handling
try {
  const response = await axios.post(url, payload);
} catch (error) {
  throw mapError(error);
}

// ✅ Framework-agnostic
// No Express imports - service is framework-agnostic
```

---

## 🎓 Topic 14: Common Pitfalls

### Pitfall 1: Logging Message Content

**❌ WRONG:**
```typescript
logger.info({ message }, 'Sending Instagram message'); // ❌ Contains PHI
```

**✅ CORRECT:**
```typescript
logger.info(
  { message_length: message.length, recipient_id: recipientId },
  'Sending Instagram message'
); // ✅ Metadata only
```

### Pitfall 2: Not Handling Rate Limits

**❌ WRONG:**
```typescript
try {
  await axios.post(url, payload);
} catch (error) {
  throw error; // ❌ Doesn't handle rate limits
}
```

**✅ CORRECT:**
```typescript
try {
  await axios.post(url, payload);
} catch (error) {
  if (error.response?.status === 429) {
    // Handle rate limit with retry
    await handleRateLimit(error, correlationId);
  }
  throw mapError(error);
}
```

### Pitfall 3: Retrying Non-Retryable Errors

**❌ WRONG:**
```typescript
// Retries all errors
for (let i = 0; i < 3; i++) {
  try {
    return await sendMessage();
  } catch (error) {
    // Retries even 401 errors ❌
    await delay(1000);
  }
}
```

**✅ CORRECT:**
```typescript
// Only retry retryable errors
for (let i = 0; i < 3; i++) {
  try {
    return await sendMessage();
  } catch (error) {
    // Don't retry client errors (except 429)
    if (isNonRetryableError(error)) {
      throw error;
    }
    await delay(calculateBackoff(i));
  }
}
```

### Pitfall 4: Using asyncHandler in Services

**❌ WRONG:**
```typescript
import { asyncHandler } from '../utils/async-handler';

export const sendMessage = asyncHandler(async (recipientId, message) => {
  // ❌ asyncHandler is for controllers, not services
});
```

**✅ CORRECT:**
```typescript
export async function sendMessage(recipientId: string, message: string) {
  try {
    // ✅ Services use try-catch
  } catch (error) {
    throw mapError(error);
  }
}
```

---

## 🎓 Topic 15: Summary & Key Takeaways

### Key Concepts

1. **Service Pattern:** Framework-agnostic business logic layer
2. **Instagram Graph API:** Meta's API for sending messages
3. **Retry Logic:** Exponential backoff for transient failures
4. **Rate Limit Handling:** Respect Meta's rate limits with Retry-After headers
5. **Error Mapping:** Map Instagram errors to AppError types
6. **Audit Logging:** Log all API calls (metadata only, no PHI)
7. **Type Safety:** TypeScript types for all functions and API responses
8. **Security:** Secure access token handling and HTTPS only

### Critical Rules

**Services MUST:**
- Use try-catch (not asyncHandler)
- Throw AppError (never return {error})
- Be framework-agnostic (no Express imports)
- Log metadata only (never message content)
- Handle rate limits explicitly
- Implement retry logic for transient failures

**Services MUST NOT:**
- Use asyncHandler (that's for controllers)
- Return {error} objects (throw AppError instead)
- Import Express types (Request, Response)
- Log PHI (message content, access tokens)
- Ignore rate limits
- Retry non-retryable errors

### Next Steps

After implementing the Instagram service:
1. **Task 6:** Webhook Queue & Worker (will use this service)
2. **Testing:** Create unit tests for the service
3. **Integration:** Test with actual Instagram API (in development)

---

**See Also:**
- [STANDARDS.md](../../Reference/STANDARDS.md) - Service Pattern and error handling
- [EXTERNAL_SERVICES.md](../../Reference/EXTERNAL_SERVICES.md) - External service integration patterns
- [COMPLIANCE.md](../../Reference/COMPLIANCE.md) - Audit logging requirements
- [Meta Platform Documentation](https://developers.facebook.com/docs/instagram-platform)

---

**Last Updated:** 2026-01-26  
**Related Task:** [Task 5: Instagram Service Implementation](../Development/Daily-plans/2026-01-21/e-task-5-instagram-service.md)
