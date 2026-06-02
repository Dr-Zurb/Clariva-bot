// Import type setup to ensure Express type extensions are loaded
import '../types/setup';

import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

/**
 * Correlation ID middleware
 *
 * Generates a unique correlation ID for each request and attaches it to req.correlationId
 * This ID is used for request tracing across services and must be included in all logs
 *
 * Supports both X-Request-ID (industry standard, preferred) and X-Correlation-ID (backward compatibility)
 * Validates ID format (UUID v4) - rejects invalid formats and generates new UUID
 *
 * MUST: Include correlationId in all logs per STANDARDS.md
 *
 * @param req - Express request object
 * @param res - Express response object
 * @param next - Express next function
 */
export function correlationId(req: Request, res: Response, next: NextFunction): void {
  // Check for X-Request-ID first (industry standard), then X-Correlation-ID (backward compatibility)
  const clientRequestId = req.headers['x-request-id'] as string | undefined;
  const clientCorrelationId = req.headers['x-correlation-id'] as string | undefined;

  // Use client-provided ID if valid, otherwise generate
  const clientId = clientRequestId || clientCorrelationId;
  req.correlationId = clientId && isValidUUID(clientId) ? clientId : randomUUID();

  // Set correlation ID in response header for client tracking
  res.setHeader('X-Correlation-ID', req.correlationId);

  next();
}

/**
 * Validate UUID v4 format
 *
 * @param id - String to validate
 * @returns true if valid UUID v4 format, false otherwise
 */
function isValidUUID(id: string): boolean {
  // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
  // where x is any hexadecimal digit and y is one of 8, 9, A, or B
  const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidV4Regex.test(id);
}
