// Import type setup to ensure Express type extensions are loaded
import '../types/setup';

import { Request, Response, NextFunction } from 'express';
import DOMPurify from 'isomorphic-dompurify';

/**
 * Input sanitization middleware
 *
 * Sanitizes user input to prevent XSS attacks and injection attacks
 * Removes HTML/script tags while preserving legitimate data
 *
 * MUST: Mount after body parsing, before routes
 * MUST: Preserve legitimate data (emails, URLs, JSON structure)
 *
 * @param req - Express request object
 * @param res - Express response object
 * @param next - Express next function
 */
export function sanitizeInput(req: Request, _res: Response, next: NextFunction): void {
  // Sanitize request body (can be reassigned)
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body);
  }

  // Sanitize query parameters (read-only in Express, sanitize values in place)
  if (req.query && typeof req.query === 'object') {
    const query = req.query;
    for (const key in query) {
      if (Object.prototype.hasOwnProperty.call(query, key)) {
        const value = query[key];
        if (typeof value === 'string') {
          // Replace the value in the query object
          query[key] = sanitizeObject(value) as string | string[];
        } else if (Array.isArray(value)) {
          // Sanitize array values
          query[key] = value.map((v) => (typeof v === 'string' ? sanitizeObject(v) : v)) as string | string[];
        }
      }
    }
  }

  // Sanitize URL parameters (read-only in Express, sanitize values in place)
  if (req.params && typeof req.params === 'object') {
    const params = req.params;
    for (const key in params) {
      if (Object.prototype.hasOwnProperty.call(params, key)) {
        const value = params[key];
        if (typeof value === 'string') {
          // Replace the value in the params object
          params[key] = sanitizeObject(value) as string;
        }
      }
    }
  }

  next();
}

/**
 * Recursively sanitize object values
 *
 * @param obj - Object to sanitize
 * @returns Sanitized object
 */
function sanitizeObject(obj: unknown): unknown {
  // Handle null/undefined
  if (obj === null || obj === undefined) {
    return obj;
  }

  // Handle strings - sanitize HTML/scripts
  if (typeof obj === 'string') {
    return DOMPurify.sanitize(obj, { ALLOWED_TAGS: [] }); // Remove all HTML tags
  }

  // Handle arrays - sanitize each element
  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeObject(item));
  }

  // Handle objects - sanitize each property value
  if (typeof obj === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      sanitized[key] = sanitizeObject(value);
    }
    return sanitized;
  }

  // Return primitive values as-is (numbers, booleans, etc.)
  return obj;
}
