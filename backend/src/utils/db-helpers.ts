/**
 * Database Helper Functions
 *
 * This file provides utility functions for common database operations,
 * error handling, data validation, and PHI redaction.
 *
 * These helpers ensure consistency across all database operations and
 * enforce compliance requirements (no PHI in logs, proper error handling, etc.).
 */

import { logger } from '../config/logger';
import {
  ConflictError,
  ForbiddenError,
  InternalError,
  NotFoundError,
  ValidationError,
} from './errors';

// ============================================================================
// Error Handling Helpers
// ============================================================================

/**
 * Handle Supabase errors and map to AppError
 * 
 * Converts Supabase PostgREST errors to appropriate AppError subclasses
 * based on error codes.
 * 
 * @param error - Supabase error object
 * @param correlationId - Request correlation ID for logging
 * @throws AppError subclass based on error type
 * 
 * Error Code Mappings:
 * - PGRST116 → NotFoundError (resource not found)
 * - 23505 → ConflictError (unique violation)
 * - 23503 → ValidationError (foreign key violation)
 * - 23502 → ValidationError (not null violation)
 * - Other → InternalError (database operation failed)
 */
export function handleSupabaseError(error: unknown, correlationId: string): never {
  if (!error || typeof error !== 'object') {
    logger.error({ error, correlationId }, 'Unknown database error');
    throw new InternalError('Unknown database error');
  }

  const supabaseError = error as { code?: string; message?: string; details?: string };
  const errorCode = supabaseError.code;
  const errorMessage = supabaseError.message || 'Database operation failed';

  // Map Supabase error codes to AppError
  switch (errorCode) {
    case 'PGRST116': // Not found (PostgREST error code)
      throw new NotFoundError('Resource not found');

    case '23505': // Unique violation (PostgreSQL error code)
      throw new ConflictError('Resource already exists');

    case '23503': // Foreign key violation (PostgreSQL error code)
      throw new ValidationError('Invalid reference: related resource does not exist');

    case '23502': // Not null violation (PostgreSQL error code)
      throw new ValidationError('Required field missing');

    default:
      // Log error for debugging
      logger.error(
        {
          error: {
            code: errorCode,
            message: errorMessage,
            details: supabaseError.details,
          },
          correlationId,
        },
        'Database error'
      );
      throw new InternalError('Database operation failed');
  }
}

/**
 * Validate resource ownership
 * 
 * Ensures doctor_id matches authenticated user ID.
 * Used for defense in depth (RLS also enforces this at database level).
 * 
 * @param doctorId - Doctor ID from resource
 * @param userId - Authenticated user ID
 * @throws ForbiddenError if ownership doesn't match
 */
export function validateOwnership(doctorId: string, userId: string): void {
  if (doctorId !== userId) {
    throw new ForbiddenError('Access denied: Resource does not belong to user');
  }
}

// ============================================================================
// Query Building Helpers
// ============================================================================

/**
 * Build query filters for Supabase queries
 * 
 * Helper to apply multiple filters to a Supabase query builder.
 * Supports equality filters only.
 * 
 * @param query - Supabase query builder
 * @param filters - Object with field names and values to filter by
 * @returns Query builder with filters applied
 * 
 * @example
 * ```typescript
 * let query = supabase.from('appointments').select('*');
 * query = buildQueryFilters(query, { doctor_id: '123', status: 'pending' });
 * ```
 */
export function buildQueryFilters(
  query: any,
  filters?: Record<string, unknown>
): any {
  if (!filters) {
    return query;
  }

  let filteredQuery = query;

  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== null) {
      filteredQuery = filteredQuery.eq(key, value);
    }
  }

  return filteredQuery;
}

// ============================================================================
// Data Transformation Helpers
// ============================================================================

/**
 * List of PHI field names that must be removed before logging
 */
const PHI_FIELD_NAMES = [
  'patient_name',
  'patient_phone',
  'name',
  'phone',
  'date_of_birth',
  'content', // Message content may contain PHI
] as const;

/**
 * Sanitize data for logging
 * 
 * Removes PHI fields from objects before logging.
 * Only keeps IDs and safe metadata fields.
 * 
 * @param data - Object that may contain PHI
 * @returns Sanitized object (no PHI)
 * 
 * @example
 * ```typescript
 * const sanitized = sanitizeForLogging({
 *   id: '123',
 *   patient_name: 'John Doe',  // PHI - removed
 *   status: 'pending'          // Safe - kept
 * });
 * // Returns: { id: '123', status: 'pending' }
 * ```
 */
export function sanitizeForLogging(data: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = { ...data };

  // Remove PHI fields
  for (const fieldName of PHI_FIELD_NAMES) {
    delete sanitized[fieldName];
  }

  // Also remove nested PHI (check common nested structures)
  if (sanitized.metadata && typeof sanitized.metadata === 'object') {
    const metadata = sanitized.metadata as Record<string, unknown>;
    for (const fieldName of PHI_FIELD_NAMES) {
      delete metadata[fieldName];
    }
  }

  return sanitized;
}

/**
 * Classify data sensitivity
 * 
 * Determines if data is public, administrative, or PHI based on field names.
 * Used for appropriate handling and logging.
 * 
 * @param data - Data to classify
 * @returns Data classification ('public', 'administrative', or 'phi')
 * 
 * @example
 * ```typescript
 * classifyData({ patient_name: 'John' }) // Returns 'phi'
 * classifyData({ status: 'pending' })    // Returns 'administrative'
 * ```
 */
export function classifyData(data: Record<string, unknown>): 'public' | 'administrative' | 'phi' {
  // Check if any PHI fields are present
  const hasPHI = PHI_FIELD_NAMES.some((field) => field in data && data[field] != null);

  if (hasPHI) {
    return 'phi';
  }

  // Check if administrative data (appointment status, availability, etc.)
  const adminFields = ['status', 'appointment_date', 'is_available', 'day_of_week'];
  const hasAdmin = adminFields.some((field) => field in data);

  if (hasAdmin) {
    return 'administrative';
  }

  return 'public';
}

/**
 * Redact PHI from text
 * 
 * Removes or replaces PHI in text before sending to external services (AI, etc.).
 * This is a basic implementation - can be enhanced for production use.
 * 
 * @param text - Text that may contain PHI
 * @returns Text with PHI redacted
 * 
 * @example
 * ```typescript
 * redactPHI('Patient John Doe called from +1234567890')
 * // Returns: 'Patient [NAME_REDACTED] called from [PHONE_REDACTED]'
 * ```
 */
export function redactPHI(text: string): string {
  let redacted = text;

  // Replace phone numbers (US format: ###-###-####, ###.###.####, ##########)
  redacted = redacted.replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, '[PHONE_REDACTED]');

  // Replace phone numbers with country codes (+1-###-###-####)
  redacted = redacted.replace(/\b\+\d{1,3}[-.]?\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, '[PHONE_REDACTED]');

  // Replace names (basic pattern: FirstName LastName)
  // Note: This is a simple implementation - production systems may need more sophisticated patterns
  redacted = redacted.replace(/\b[A-Z][a-z]+ [A-Z][a-z]+\b/g, '[NAME_REDACTED]');

  // Replace dates that look like DOB (MM/DD/YYYY or DD/MM/YYYY)
  redacted = redacted.replace(/\b\d{1,2}\/\d{1,2}\/\d{4}\b/g, '[DATE_REDACTED]');

  // Replace email addresses
  redacted = redacted.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL_REDACTED]');

  return redacted;
}
