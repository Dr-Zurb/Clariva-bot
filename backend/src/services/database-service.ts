/**
 * Database Service Base Functions
 *
 * This file provides generic CRUD helper functions for database operations.
 * These functions are used by table-specific service functions to provide
 * consistent database operations with proper error handling and audit logging.
 *
 * IMPORTANT:
 * - All functions throw AppError (never return {error})
 * - All functions include correlation ID for tracing
 * - Services are framework-agnostic (no Express types)
 * - For multi-step operations, prefer Postgres rpc() functions over compensating logic
 */

import { supabase } from '../config/database';
import { handleSupabaseError } from '../utils/db-helpers';
import { logDataModification } from '../utils/audit-logger';
import { logger } from '../config/logger';

// ============================================================================
// Generic CRUD Functions
// ============================================================================

/**
 * Find resource by ID
 * 
 * Generic function to find any resource by ID.
 * 
 * @param table - Table name
 * @param id - Resource ID
 * @param correlationId - Request correlation ID for error logging
 * @returns Resource or throws NotFoundError
 * 
 * @throws NotFoundError if resource not found
 * @throws InternalError if database operation fails
 * 
 * @example
 * ```typescript
 * const appointment = await findById<Appointment>('appointments', id, correlationId);
 * ```
 */
export async function findById<T>(
  table: string,
  id: string,
  correlationId: string
): Promise<T> {
  const { data, error } = await supabase
    .from(table)
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    handleSupabaseError(error, correlationId);
  }

  if (!data) {
    handleSupabaseError({ code: 'PGRST116', message: 'Resource not found' }, correlationId);
  }

  return data as T;
}

/**
 * Find multiple resources with filters
 * 
 * Generic function to find resources with optional filters.
 * 
 * @param table - Table name
 * @param correlationId - Request correlation ID for error logging
 * @param filters - Filter object (e.g., { doctor_id: '123', status: 'pending' })
 * @returns Array of resources
 * 
 * @throws InternalError if database operation fails
 * 
 * @example
 * ```typescript
 * const appointments = await findMany<Appointment>(
 *   'appointments',
 *   correlationId,
 *   { doctor_id: '123', status: 'pending' }
 * );
 * ```
 */
export async function findMany<T>(
  table: string,
  correlationId: string,
  filters?: Record<string, unknown>
): Promise<T[]> {
  let query = supabase.from(table).select('*');

  // Apply filters
  if (filters) {
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== null) {
        query = query.eq(key, value);
      }
    }
  }

  const { data, error } = await query;

  if (error) {
    handleSupabaseError(error, correlationId);
  }

  return (data || []) as T[];
}

/**
 * Create a new resource
 * 
 * Generic function to create any resource.
 * 
 * @param table - Table name
 * @param data - Data to insert (InsertType)
 * @param correlationId - Request correlation ID for audit logging
 * @param userId - User ID performing the operation (optional)
 * @returns Created resource
 * 
 * @throws ValidationError if data validation fails
 * @throws ConflictError if unique constraint violated
 * @throws InternalError if database operation fails
 * 
 * @example
 * ```typescript
 * const appointment = await create<Appointment, InsertAppointment>(
 *   'appointments',
 *   insertData,
 *   correlationId,
 *   userId
 * );
 * ```
 */
export async function create<T, I>(
  table: string,
  data: I,
  correlationId: string,
  userId?: string
): Promise<T> {
  const { data: created, error } = await supabase
    .from(table)
    .insert(data)
    .select()
    .single();

  if (error || !created) {
    handleSupabaseError(error, correlationId);
  }

  // Audit log
  await logDataModification(correlationId, userId || 'system', 'create', table, (created as any).id);

  return created as T;
}

/**
 * Update an existing resource
 * 
 * Generic function to update any resource.
 * 
 * @param table - Table name
 * @param id - Resource ID
 * @param data - Update data (UpdateType)
 * @param correlationId - Request correlation ID for audit logging
 * @param userId - User ID performing the operation (optional)
 * @returns Updated resource
 * 
 * @throws NotFoundError if resource not found
 * @throws ValidationError if data validation fails
 * @throws InternalError if database operation fails
 * 
 * @example
 * ```typescript
 * const updated = await update<Appointment, UpdateAppointment>(
 *   'appointments',
 *   id,
 *   { status: 'confirmed' },
 *   correlationId,
 *   userId
 * );
 * ```
 */
export async function update<T, U>(
  table: string,
  id: string,
  data: U,
  correlationId: string,
  userId?: string
): Promise<T> {
  const { data: updated, error } = await supabase
    .from(table)
    .update(data)
    .eq('id', id)
    .select()
    .single();

  if (error || !updated) {
    handleSupabaseError(error, correlationId);
  }

  // Get changed fields (field names only, not values)
  const changedFields = Object.keys(data as Record<string, unknown>);

  // Audit log
  await logDataModification(
    correlationId,
    userId || 'system',
    'update',
    table,
    id,
    changedFields
  );

  return updated as T;
}

/**
 * Delete a resource
 * 
 * Generic function to delete any resource.
 * 
 * @param table - Table name
 * @param id - Resource ID
 * @param correlationId - Request correlation ID for audit logging
 * @param userId - User ID performing the operation (optional)
 * 
 * @throws NotFoundError if resource not found
 * @throws InternalError if database operation fails
 * 
 * @example
 * ```typescript
 * await deleteResource('appointments', id, correlationId, userId);
 * ```
 */
export async function deleteResource(
  table: string,
  id: string,
  correlationId: string,
  userId?: string
): Promise<void> {
  const { error } = await supabase.from(table).delete().eq('id', id);

  if (error) {
    handleSupabaseError(error, correlationId);
  }

  // Audit log
  await logDataModification(correlationId, userId || 'system', 'delete', table, id);
}

// ============================================================================
// Transaction Helpers
// ============================================================================

/**
 * Execute a multi-step operation with compensating logic
 * 
 * Note: Supabase does not support transactions via the client. For multi-step
 * operations that require atomicity, prefer using Postgres rpc() functions
 * that execute within a single database transaction.
 * 
 * This helper provides compensating logic (rollback by undoing previous steps)
 * as a fallback when rpc() functions are not available.
 * 
 * @param operation - Async function that performs the multi-step operation
 * @param rollback - Async function that undoes the operation if it fails
 * @param correlationId - Request correlation ID for error logging
 * @returns Result of the operation
 * 
 * @example
 * ```typescript
 * const result = await withTransaction(
 *   async () => {
 *     const appointment = await createAppointment(data);
 *     await createNotification(appointment.id);
 *     return appointment;
 *   },
 *   async (appointment) => {
 *     // Rollback: delete appointment if notification creation fails
 *     if (appointment) {
 *       await deleteResource('appointments', appointment.id, correlationId);
 *     }
 *   },
 *   correlationId
 * );
 * ```
 */
export async function withTransaction<T>(
  operation: () => Promise<T>,
  rollback: (result: T | null) => Promise<void>,
  correlationId: string
): Promise<T> {
  let result: T | null = null;

  try {
    result = await operation();
    return result;
  } catch (error) {
    // Attempt rollback
    try {
      await rollback(result);
    } catch (rollbackError) {
      logger.error(
        { error: rollbackError, correlationId, operationResult: result },
        'Rollback failed during transaction compensation'
      );
    }
    // Re-throw original error
    throw error;
  }
}

/**
 * When to use Postgres rpc() vs transaction helper:
 * 
 * **Use Postgres rpc() functions when:**
 * - True transaction atomicity is required
 * - Multiple table operations need to be atomic
 * - Complex business logic needs database-level guarantees
 * 
 * **Use withTransaction helper when:**
 * - rpc() functions are not available
 * - Simple compensating logic is sufficient
 * - Rollback operations are straightforward
 * 
 * **Example rpc() function:**
 * ```sql
 * CREATE OR REPLACE FUNCTION create_appointment_with_notification(
 *   p_doctor_id UUID,
 *   p_patient_name TEXT,
 *   ...
 * ) RETURNS UUID AS $$
 * DECLARE
 *   v_appointment_id UUID;
 * BEGIN
 *   INSERT INTO appointments (...) VALUES (...) RETURNING id INTO v_appointment_id;
 *   INSERT INTO notifications (...) VALUES (...);
 *   RETURN v_appointment_id;
 * END;
 * $$ LANGUAGE plpgsql;
 * ```
 * 
 * Then call from TypeScript:
 * ```typescript
 * const { data, error } = await supabase.rpc('create_appointment_with_notification', { ... });
 * ```
 */
