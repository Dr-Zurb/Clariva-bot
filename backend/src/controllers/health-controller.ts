import { Request, Response } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { testConnection } from '../config/database';

/**
 * Health check controller
 * GET /health
 * 
 * Returns server status with database connection check, uptime, and memory usage
 * Used for monitoring and uptime checks
 * 
 * Returns 200 if healthy, 503 if database is down
 * 
 * MUST: Use asyncHandler (not manual try/catch) - see STANDARDS.md
 */
export const getHealth = asyncHandler(async (_req: Request, res: Response) => {
  // Check database connection
  const dbConnected = await testConnection();
  
  // Get uptime (seconds)
  const uptimeSeconds = process.uptime();
  const uptimeMinutes = Math.floor(uptimeSeconds / 60);
  const uptimeHours = Math.floor(uptimeMinutes / 60);
  const uptimeDays = Math.floor(uptimeHours / 24);
  
  // Format uptime string
  let uptimeFormatted = '';
  if (uptimeDays > 0) {
    uptimeFormatted = `${uptimeDays}d ${uptimeHours % 24}h ${uptimeMinutes % 60}m`;
  } else if (uptimeHours > 0) {
    uptimeFormatted = `${uptimeHours}h ${uptimeMinutes % 60}m`;
  } else if (uptimeMinutes > 0) {
    uptimeFormatted = `${uptimeMinutes}m ${Math.floor(uptimeSeconds % 60)}s`;
  } else {
    uptimeFormatted = `${Math.floor(uptimeSeconds)}s`;
  }
  
  // Get memory usage
  const memoryUsage = process.memoryUsage();
  
  // If database is down, return 503 Service Unavailable
  if (!dbConnected) {
    res.status(503).json({
      status: 'error',
      message: 'Service unavailable',
      database: 'disconnected',
      uptime: uptimeFormatted,
      timestamp: new Date().toISOString(),
    });
    return;
  }
  
  // Return 200 OK with full health information
  res.status(200).json({
    status: 'ok',
    message: 'Clariva Bot API is running',
    database: 'connected',
    uptime: uptimeFormatted,
    memory: {
      used: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}mb`,
      total: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}mb`,
      rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}mb`,
    },
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
