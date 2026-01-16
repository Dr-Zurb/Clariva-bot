import { Request, Response } from 'express';
import { asyncHandler } from '../utils/async-handler';

/**
 * Health check controller
 * GET /health
 * 
 * Returns server status and timestamp
 * Used for monitoring and uptime checks
 * 
 * MUST: Use asyncHandler (not manual try/catch) - see STANDARDS.md
 */
export const getHealth = asyncHandler(async (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    message: 'Clariva Bot API is running',
    timestamp: new Date().toISOString(),
  });
});

/**
 * Root endpoint controller
 * GET /
 * 
 * Returns API information and available endpoints
 * 
 * MUST: Use asyncHandler (not manual try/catch) - see STANDARDS.md
 */
export const getRoot = asyncHandler(async (_req: Request, res: Response) => {
  res.json({
    message: 'Welcome to Clariva Care AI Receptionist Bot API',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      webhooks: '/webhooks',
    },
  });
});
