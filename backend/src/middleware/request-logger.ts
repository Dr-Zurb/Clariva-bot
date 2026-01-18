// Import type setup to ensure Express type extensions are loaded
import '../types/setup';

import { Request, Response, NextFunction } from 'express';
import { logger, createLogContext } from '../config/logger';

/**
 * Request logging middleware
 * 
 * Logs all HTTP requests with standard fields (correlationId, path, method, statusCode, durationMs)
 * MUST: Include standard log fields per STANDARDS.md
 * 
 * This middleware:
 * 1. Listens for response finish event
 * 2. Calculates request duration
 * 3. Logs request with all standard fields
 * 4. Uses appropriate log level (info for success, warn for client errors, error for server errors)
 * 
 * @param req - Express request object
 * @param res - Express response object
 * @param next - Express next function
 */
export function requestLogger(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Log when response finishes (after response is sent)
  res.on('finish', () => {
    // Calculate duration
    const durationMs = req.startTime ? Date.now() - req.startTime : undefined;
    
    // Create log context with standard fields (MUST per STANDARDS.md)
    const logContext = createLogContext(req, {
      statusCode: res.statusCode,
      durationMs,
    });
    
    // Log based on status code (MUST per STANDARDS.md log levels)
    if (res.statusCode >= 500) {
      // Server errors (500+) - log as error
      logger.error(logContext, 'Request completed with server error');
    } else if (res.statusCode >= 400) {
      // Client errors (400-499) - log as warn
      // Note: Errors are also logged by error middleware, but this provides request-level logging
      logger.warn(logContext, 'Request completed with client error');
    } else {
      // Success (200-399) - log as info
      logger.info(logContext, 'Request completed');
    }
  });
  
  next();
}
