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

/** ARM-10: booking link used before staff clears pending service review */
export class StaffServiceReviewPendingPaymentError extends ForbiddenError {
  constructor(
    message: string = 'Your visit type is still being confirmed by the clinic. Return to the chat and try again once you receive confirmation.'
  ) {
    super(message);
  }
}

/** ARM-10: multi-service catalog requires finalized selection from chat before payment */
export class ServiceSelectionNotFinalizedPaymentError extends ForbiddenError {
  constructor(
    message: string = 'Please finish choosing your visit type in chat with the clinic before paying. Return to the conversation for the next step.'
  ) {
    super(message);
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
 * Consultation quote: service_key not present in catalog (SFU-03)
 */
export class ServiceNotFoundForQuote extends AppError {
  constructor(serviceKey: string) {
    super(`Service not found in catalog: ${serviceKey}`, 400);
  }
}

/**
 * Consultation quote: modality not offered for this service (SFU-03)
 */
export class ModalityNotOfferedForQuote extends AppError {
  constructor(serviceKey: string, modality: string) {
    super(`Modality "${modality}" is not offered for service: ${serviceKey}`, 400);
  }
}

/**
 * Legacy quote path: doctor has no catalog and appointment_fee_minor is unset (SFU-03)
 */
export class LegacyAppointmentFeeNotConfiguredError extends AppError {
  constructor() {
    super(
      'Cannot quote: practice has no services in the catalog (or catalog is unset) and no legacy appointment fee is configured. Add services under Practice Setup → Services catalog, or set a fallback fee.',
      400
    );
  }
}

/**
 * Too many requests error (429)
 * Used when rate limit is exceeded
 */
export class TooManyRequestsError extends AppError {
  constructor(message: string = 'Too many requests') {
    super(message, 429);
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

/**
 * Service unavailable error (503)
 * Used when external services are unavailable (network errors, timeouts, etc.)
 */
export class ServiceUnavailableError extends AppError {
  constructor(message: string = 'Service unavailable') {
    super(message, 503);
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
export function formatError(
  error: Error | AppError,
  includeStack: boolean = false
): {
  error: string;
  message: string;
  statusCode?: number;
  stack?: string;
} {
  const isAppError = error instanceof AppError;
  const statusCode = isAppError ? error.statusCode : 500;

  // Use stable code per ERROR_CATALOG/CONTRACTS: AppError subclass name, or InternalServerError for untyped errors
  const code = isAppError ? error.name : 'InternalServerError';
  const formatted: {
    error: string;
    message: string;
    statusCode?: number;
    stack?: string;
  } = {
    error: code,
    message: error.message || 'An unexpected error occurred',
    statusCode,
  };

  if (includeStack && error.stack) {
    formatted.stack = error.stack;
  }

  return formatted;
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
