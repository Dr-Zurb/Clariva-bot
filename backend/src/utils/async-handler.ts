import { Request, Response, NextFunction } from 'express';

/**
 * Wrapper for async route handlers
 * Automatically catches errors and passes them to error middleware
 *
 * This eliminates the need for try-catch blocks in controllers
 * and ensures all errors are properly handled.
 *
 * Usage:
 * ```typescript
 * export const myController = asyncHandler(async (req, res) => {
 *   // No need for try-catch - asyncHandler handles it
 *   const result = await someAsyncOperation();
 *   res.json({ data: result });
 * });
 * ```
 *
 * @param fn - Async route handler function
 * @returns Wrapped route handler that catches errors
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
