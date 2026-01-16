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
 * MUST: Include correlationId in all logs per STANDARDS.md
 * 
 * @param req - Express request object
 * @param res - Express response object
 * @param next - Express next function
 */
export function correlationId(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Generate or use existing correlation ID from header (for distributed tracing)
  // If X-Correlation-ID header exists, use it; otherwise generate new one
  const headerCorrelationId = req.headers['x-correlation-id'] as string | undefined;
  
  req.correlationId = headerCorrelationId || randomUUID();
  
  // Set correlation ID in response header for client tracking
  res.setHeader('X-Correlation-ID', req.correlationId);
  
  next();
}
