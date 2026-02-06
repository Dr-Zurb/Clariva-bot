import { Request } from 'express';

/**
 * Response standardization utilities
 *
 * Provides consistent API response format across all endpoints
 * Standard format: { success: true, data: {...}, meta: {...} }
 *
 * MUST: Use these utilities for all success responses per task requirements
 */

/**
 * Success response helper
 *
 * Creates a standardized success response with data and metadata
 *
 * @param data - Response data to include
 * @param req - Express request object (for correlation ID)
 * @param meta - Additional metadata to include (optional)
 * @returns Standardized success response object
 */
export function successResponse<T>(
  data: T,
  req: Request,
  meta?: Record<string, unknown>
): {
  success: true;
  data: T;
  meta: {
    timestamp: string;
    requestId: string;
    [key: string]: unknown;
  };
} {
  return {
    success: true,
    data,
    meta: {
      timestamp: new Date().toISOString(),
      requestId: req.correlationId || 'unknown',
      ...meta,
    },
  };
}

/**
 * Error response helper (for manual error responses, not middleware errors)
 *
 * Creates a standardized error response format
 * Note: Most errors should be handled by error middleware, but this can be used for business logic errors
 *
 * @param error - Error information
 * @param req - Express request object (for correlation ID)
 * @param meta - Additional metadata to include (optional)
 * @returns Standardized error response object
 */
export function errorResponse(
  error: {
    code: string;
    message: string;
    statusCode: number;
  },
  req: Request,
  meta?: Record<string, unknown>
): {
  success: false;
  error: {
    code: string;
    message: string;
    statusCode: number;
  };
  meta: {
    timestamp: string;
    requestId: string;
    [key: string]: unknown;
  };
} {
  return {
    success: false,
    error,
    meta: {
      timestamp: new Date().toISOString(),
      requestId: req.correlationId || 'unknown',
      ...meta,
    },
  };
}
