/**
 * Error Utilities
 * 
 * This file contains custom error classes and error handling utilities
 * following production-grade error handling patterns.
 */

// ============================================================================
// Custom Error Classes
// ============================================================================

/**
 * Base custom error class
 * All custom errors should extend this class
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode: number = 500, isOperational: boolean = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }

    this.name = this.constructor.name;
  }
}

/**
 * Validation error (400)
 * Used when request data is invalid
 */
export class ValidationError extends AppError {
  constructor(message: string = 'Validation failed') {
    super(message, 400);
  }
}

/**
 * Not found error (404)
 * Used when a resource is not found
 */
export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found') {
    super(message, 404);
  }
}

/**
 * Unauthorized error (401)
 * Used when authentication is required but not provided
 */
export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super(message, 401);
  }
}

/**
 * Forbidden error (403)
 * Used when user is authenticated but doesn't have permission
 */
export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden') {
    super(message, 403);
  }
}

/**
 * Conflict error (409)
 * Used when there's a conflict with the current state
 */
export class ConflictError extends AppError {
  constructor(message: string = 'Conflict') {
    super(message, 409);
  }
}

/**
 * Internal server error (500)
 * Used for unexpected errors, database failures, etc.
 * This is the default error class for operational errors that don't fit other categories
 */
export class InternalError extends AppError {
  constructor(message: string = 'Internal server error') {
    super(message, 500, true); // isOperational = true (expected operational error)
  }
}

// ============================================================================
// Error Formatting Functions
// ============================================================================

/**
 * Format error for API response
 * 
 * @param error - Error object
 * @param includeStack - Whether to include stack trace (only in development)
 * @returns Formatted error object
 */
export function formatError(error: Error | AppError, includeStack: boolean = false): {
  error: string;
  message: string;
  statusCode?: number;
  stack?: string;
} {
  const isAppError = error instanceof AppError;
  const statusCode = isAppError ? error.statusCode : 500;

  const formatted: {
    error: string;
    message: string;
    statusCode?: number;
    stack?: string;
  } = {
    error: error.name || 'Error',
    message: error.message || 'An unexpected error occurred',
    statusCode,
  };

  if (includeStack && error.stack) {
    formatted.stack = error.stack;
  }

  return formatted;
}

/**
 * Log error with context
 * 
 * NOTE: This function is deprecated. Use structured logger from config/logger.ts instead.
 * This function is kept for backward compatibility but should not be used in new code.
 * 
 * @param error - Error object
 * @param context - Additional context information
 * @deprecated Use logger from config/logger.ts instead
 */
export function logError(error: Error | AppError, context?: Record<string, unknown>): void {
  const isAppError = error instanceof AppError;
  const logData = {
    name: error.name,
    message: error.message,
    statusCode: isAppError ? error.statusCode : 500,
    stack: error.stack,
    ...context,
  };

  // Use structured logger (imported dynamically to avoid circular dependency)
  // In practice, prefer importing logger directly in calling code
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { logger } = require('../config/logger');
  logger.error(logData, 'Error occurred');
}

// ============================================================================
// Error Type Guards
// ============================================================================

/**
 * Check if error is an AppError instance
 */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/**
 * Check if error is operational (expected error)
 */
export function isOperationalError(error: unknown): boolean {
  if (isAppError(error)) {
    return error.isOperational;
  }
  return false;
}
