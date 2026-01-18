import { Request, Response, NextFunction } from 'express';

/**
 * Request Timeout Middleware
 * 
 * Sets a timeout for all requests to prevent hanging requests.
 * If a request takes longer than the specified duration, it will be cancelled
 * and return a 408 Request Timeout error.
 * 
 * @param timeoutMs - Timeout duration in milliseconds (default: 30000 = 30 seconds)
 * @returns Express middleware function
 */
export function requestTimeout(timeoutMs: number = 30000) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Set timeout for this request
    const timeout = setTimeout(() => {
      // Only send timeout error if response hasn't been sent yet
      if (!res.headersSent) {
        res.status(408).json({
          error: 'RequestTimeoutError',
          message: `Request timeout after ${timeoutMs / 1000} seconds`,
        });
      }
      
      // Destroy the request to free up resources
      req.destroy();
    }, timeoutMs);
    
    // Clear timeout when request completes (success or error)
    res.on('finish', () => {
      clearTimeout(timeout);
    });
    
    res.on('close', () => {
      clearTimeout(timeout);
    });
    
    // Continue to next middleware
    next();
  };
}
