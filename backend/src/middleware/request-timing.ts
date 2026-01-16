// Import type setup to ensure Express type extensions are loaded
import '../types/setup';

import { Request, Response, NextFunction } from 'express';

/**
 * Request timing middleware
 * 
 * Sets req.startTime and calculates durationMs for logging
 * MUST be included in all logs per STANDARDS.md
 * 
 * This middleware:
 * 1. Sets req.startTime when request starts
 * 2. Calculates durationMs when response finishes
 * 3. Makes durationMs available for logging in error middleware
 * 
 * @param req - Express request object
 * @param res - Express response object
 * @param next - Express next function
 */
export function requestTiming(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  // Set start time at request start
  req.startTime = Date.now();
  
  // Duration is calculated on-demand in error handler or logging middleware
  // using: const durationMs = req.startTime ? Date.now() - req.startTime : undefined;
  
  next();
}
