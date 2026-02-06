/**
 * Audit Logger Utility
 *
 * This file provides functions for creating audit log entries.
 * Audit logs record all system actions for compliance and security.
 *
 * IMPORTANT:
 * - All audit logs MUST use service role client (bypasses RLS)
 * - Audit logs MUST NOT contain PHI (only IDs and metadata)
 * - All audit logs MUST include correlation ID
 * - Changed fields only (field names, not values) in audit logs
 *
 * Compliance Requirements (see COMPLIANCE.md):
 * - All data access must be audited
 * - All data modifications must be audited
 * - All AI interactions must be audited
 * - All security events must be audited
 */

import { getSupabaseAdminClient } from '../config/database';
import { logger } from '../config/logger';
import { AuditLogStatus, InsertAuditLog } from '../types';
import { InternalError } from './errors';

// ============================================================================
// PHI Field Names (must not be logged)
// ============================================================================

/**
 * List of PHI field names that must never appear in audit log metadata
 * 
 * These fields contain Protected Health Information (PHI) and must be
 * excluded from audit logs per compliance requirements.
 */
const PHI_FIELDS = [
  'patient_name',
  'patient_phone',
  'name',
  'phone',
  'date_of_birth',
  'content', // Message content may contain PHI
] as const;

/**
 * Validate that metadata does not contain PHI fields
 * 
 * @param metadata - Metadata object to validate
 * @throws InternalError if PHI fields are detected
 */
function validateNoPHI(metadata?: Record<string, unknown>): void {
  if (!metadata) {
    return;
  }

  const phiFieldsFound: string[] = [];

  for (const key of Object.keys(metadata)) {
    const lowerKey = key.toLowerCase();
    for (const phiField of PHI_FIELDS) {
      if (lowerKey.includes(phiField)) {
        phiFieldsFound.push(key);
      }
    }
  }

  if (phiFieldsFound.length > 0) {
    throw new InternalError(
      `PHI fields detected in audit log metadata: ${phiFieldsFound.join(', ')}. ` +
        'Audit logs must not contain PHI per compliance requirements.'
    );
  }
}

// ============================================================================
// Core Audit Logging Function
// ============================================================================

/**
 * Log an audit event
 * 
 * Records who did what, when, and the result. Uses service role client
 * to bypass RLS for audit log insertion (audit logs are system operations).
 * 
 * @param params - Audit log parameters
 * @param params.correlationId - Request correlation ID (required for tracing)
 * @param params.userId - User who performed the action (optional for system operations)
 * @param params.action - Action performed (e.g., 'create_appointment', 'read_patient')
 * @param params.resourceType - Type of resource affected (e.g., 'appointment', 'patient')
 * @param params.resourceId - ID of the resource affected (optional)
 * @param params.status - Operation status ('success' or 'failure')
 * @param params.errorMessage - Error message if status is 'failure' (optional)
 * @param params.metadata - Additional context (optional, must not contain PHI)
 * 
 * @throws InternalError if service role client is not available
 * @throws InternalError if PHI is detected in metadata
 * 
 * Note: This function never throws errors that would break the main operation.
 * If audit log creation fails, it is logged but does not throw.
 */
export async function logAuditEvent(params: {
  correlationId: string;
  userId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  status: AuditLogStatus;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  // Validate correlation ID is provided
  if (!params.correlationId) {
    logger.error({ params }, 'Audit log missing correlation ID');
    return; // Don't throw - audit logging shouldn't break main flow
  }

  // Validate no PHI in metadata
  try {
    validateNoPHI(params.metadata);
  } catch (error) {
    // Log error but don't throw - audit logging shouldn't break main flow
    logger.error(
      { error, correlationId: params.correlationId, metadata: params.metadata },
      'PHI detected in audit log metadata - audit log not created'
    );
    return;
  }

  // Get service role client (bypasses RLS for audit log insertion)
  const supabaseAdmin = getSupabaseAdminClient();
  if (!supabaseAdmin) {
    logger.error(
      { correlationId: params.correlationId },
      'Service role client not available - cannot create audit log'
    );
    return; // Don't throw - audit logging shouldn't break main flow
  }

  // Prepare audit log data
  const auditLogData: InsertAuditLog = {
    correlation_id: params.correlationId,
    user_id: params.userId || undefined,
    action: params.action,
    resource_type: params.resourceType,
    resource_id: params.resourceId || undefined,
    status: params.status,
    error_message: params.errorMessage || undefined,
    metadata: params.metadata || undefined,
  };

  // Insert audit log (service role bypasses RLS)
  const { error } = await supabaseAdmin.from('audit_logs').insert(auditLogData);

  if (error) {
    // Log error but don't throw - audit logging shouldn't break main flow
    logger.error(
      { error, correlationId: params.correlationId, action: params.action },
      'Failed to create audit log'
    );
  }
}

// ============================================================================
// Helper Functions for Common Scenarios
// ============================================================================

/**
 * Log data access event
 * 
 * Use this function when reading PHI or sensitive data.
 * 
 * @param correlationId - Request correlation ID
 * @param userId - User who accessed the data
 * @param resourceType - Type of resource accessed (e.g., 'appointment', 'patient')
 * @param resourceId - ID of the resource accessed
 */
export async function logDataAccess(
  correlationId: string,
  userId: string,
  resourceType: string,
  resourceId?: string
): Promise<void> {
  await logAuditEvent({
    correlationId,
    userId,
    action: `read_${resourceType}`,
    resourceType,
    resourceId,
    status: 'success',
  });
}

/**
 * Log data modification event
 * 
 * Use this function when creating, updating, or deleting data.
 * 
 * @param correlationId - Request correlation ID
 * @param userId - User who performed the modification
 * @param action - Modification action ('create', 'update', or 'delete')
 * @param resourceType - Type of resource modified (e.g., 'appointment', 'patient')
 * @param resourceId - ID of the resource modified
 * @param changedFields - Array of field names that were changed (field names only, not values)
 */
export async function logDataModification(
  correlationId: string,
  userId: string,
  action: 'create' | 'update' | 'delete',
  resourceType: string,
  resourceId: string,
  changedFields?: string[]
): Promise<void> {
  await logAuditEvent({
    correlationId,
    userId,
    action: `${action}_${resourceType}`,
    resourceType,
    resourceId,
    status: 'success',
    metadata: changedFields ? { changedFields } : undefined,
  });
}

/**
 * Log AI interaction event
 * 
 * Use this function when sending data to AI services or receiving AI responses.
 * 
 * @param correlationId - Request correlation ID
 * @param userId - User who initiated the AI interaction
 * @param conversationId - ID of the conversation
 * @param model - AI model used (e.g., 'gpt-4', 'claude-3')
 * @param tokens - Number of tokens used (optional)
 * @param redactionApplied - Whether PHI redaction was applied before sending to AI
 */
export async function logAIIntraction(
  correlationId: string,
  userId: string,
  conversationId: string,
  model: string,
  tokens?: number,
  redactionApplied: boolean = false
): Promise<void> {
  await logAuditEvent({
    correlationId,
    userId,
    action: 'ai_interaction',
    resourceType: 'conversation',
    resourceId: conversationId,
    status: 'success',
    metadata: {
      model,
      ...(tokens !== undefined ? { tokens } : {}),
      redactionApplied,
    },
  });
}

/**
 * Log AI classification event (intent detection).
 * Metadata only: model, tokens, redactionApplied. No raw prompt/response with PHI (COMPLIANCE.md G).
 *
 * @param correlationId - Request correlation ID (required)
 * @param model - AI model used (e.g. gpt-5.2)
 * @param redactionApplied - Whether PHI was redacted before sending to AI
 * @param status - 'success' or 'failure'
 * @param resourceId - Optional resource ID (e.g. conversation ID)
 * @param tokens - Token usage if available from API
 * @param errorMessage - Error message if status is 'failure' (must not contain PHI)
 */
export async function logAIClassification(params: {
  correlationId: string;
  model: string;
  redactionApplied: boolean;
  status: AuditLogStatus;
  resourceId?: string;
  tokens?: number;
  errorMessage?: string;
}): Promise<void> {
  await logAuditEvent({
    correlationId: params.correlationId,
    action: 'ai_classification',
    resourceType: 'ai',
    resourceId: params.resourceId,
    status: params.status,
    errorMessage: params.errorMessage,
    metadata: {
      model: params.model,
      redactionApplied: params.redactionApplied,
      ...(params.tokens !== undefined ? { tokens: params.tokens } : {}),
    },
  });
}

/**
 * Log AI response generation event (e-task-3).
 * Metadata only: model, tokens, redactionApplied. No raw prompt/response with PHI (COMPLIANCE.md G).
 */
export async function logAIResponseGeneration(params: {
  correlationId: string;
  model: string;
  redactionApplied: boolean;
  status: AuditLogStatus;
  resourceId?: string;
  tokens?: number;
  errorMessage?: string;
}): Promise<void> {
  await logAuditEvent({
    correlationId: params.correlationId,
    action: 'ai_response_generation',
    resourceType: 'ai',
    resourceId: params.resourceId,
    status: params.status,
    errorMessage: params.errorMessage,
    metadata: {
      model: params.model,
      redactionApplied: params.redactionApplied,
      ...(params.tokens !== undefined ? { tokens: params.tokens } : {}),
    },
  });
}

/**
 * Log patient data collection event (e-task-4). Metadata only: field name and status; no values (COMPLIANCE D).
 */
export async function logPatientDataCollection(params: {
  correlationId: string;
  conversationId: string;
  fieldName: string;
  status: 'collected' | 'validation_failed';
}): Promise<void> {
  await logAuditEvent({
    correlationId: params.correlationId,
    action: 'patient_data_collection',
    resourceType: 'conversation',
    resourceId: params.conversationId,
    status: 'success',
    metadata: {
      field: params.fieldName,
      collectionStatus: params.status,
    },
  });
}

/**
 * Log consent event (e-task-5). Metadata only: status, method; no PHI (COMPLIANCE D).
 */
export async function logConsentEvent(params: {
  correlationId: string;
  patientId: string;
  status: 'granted' | 'denied' | 'revoked';
  method: string;
}): Promise<void> {
  await logAuditEvent({
    correlationId: params.correlationId,
    action: 'consent_event',
    resourceType: 'patient',
    resourceId: params.patientId,
    status: 'success',
    metadata: {
      consentStatus: params.status,
      consentMethod: params.method,
    },
  });
}

/**
 * Log security event
 *
 * Use this function for failed authentication, rate limiting, suspicious activity, etc.
 * 
 * @param correlationId - Request correlation ID
 * @param userId - User associated with the event (optional)
 * @param eventType - Type of security event (e.g., 'failed_auth', 'rate_limit_exceeded')
 * @param severity - Event severity ('low', 'medium', or 'high')
 * @param ipAddress - IP address associated with the event (optional)
 * @param errorMessage - Error message if applicable (optional)
 */
export async function logSecurityEvent(
  correlationId: string,
  userId: string | undefined,
  eventType: string,
  severity: 'low' | 'medium' | 'high',
  ipAddress?: string,
  errorMessage?: string
): Promise<void> {
  await logAuditEvent({
    correlationId,
    userId,
    action: 'security_event',
    resourceType: 'security',
    status: 'failure',
    errorMessage,
    metadata: {
      eventType,
      severity,
      ...(ipAddress ? { ipAddress } : {}),
    },
  });
}
