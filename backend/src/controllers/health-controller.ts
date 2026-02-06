import { Request, Response } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { checkDatabaseConnection } from '../services/health-service';
import { successResponse } from '../utils/response';

/**
 * Health check controller
 * GET /health
 *
 * Returns server status with database connection check, uptime, and memory usage.
 * Used for monitoring and uptime checks.
 *
 * Response Format:
 * - status: 'ok' | 'error'
 * - message: Human-readable status message
 * - timestamp: ISO timestamp of health check
 * - services: Object containing service health statuses
 *   - database: Database connection status and response time
 * - uptime: Formatted uptime string (e.g., "2h 15m")
 * - memory: Memory usage statistics
 *
 * Status Codes:
 * - 200 OK: All services healthy
 * - 503 Service Unavailable: Database or critical service is down
 *
 * MUST: Use asyncHandler (not manual try/catch) - see STANDARDS.md
 */
export const getHealth = asyncHandler(async (_req: Request, res: Response) => {
  // Measure database connection test time (via service per ARCHITECTURE)
  const dbStartTime = Date.now();
  const dbConnected = await checkDatabaseConnection();
  const dbResponseTime = Date.now() - dbStartTime;

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

  // Prepare health data
  const healthData = {
    status: dbConnected ? 'ok' : 'error',
    message: dbConnected ? 'Clariva Bot API is running' : 'Service unavailable',
    timestamp: new Date().toISOString(),
    services: {
      database: {
        status: dbConnected ? 'ok' : 'error',
        connected: dbConnected,
        responseTimeMs: dbResponseTime,
      },
      // Future: Add other services here (e.g., openai, etc.)
    },
    uptime: uptimeFormatted,
    memory: {
      used: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}mb`,
      total: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}mb`,
      rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}mb`,
    },
  };

  // If database is down, return 503 Service Unavailable
  if (!dbConnected) {
    res.status(503).json(successResponse(healthData, _req));
    return;
  }

  // Return 200 OK with full health information
  res.status(200).json(successResponse(healthData, _req));
});

/**
 * Root endpoint controller
 * GET /
 *
 * Returns API information and available endpoints
 *
 * MUST: Use asyncHandler (not manual try/catch) - see STANDARDS.md
 */
export const getRoot = asyncHandler(async (req: Request, res: Response) => {
  const rootData = {
    message: 'Welcome to Clariva Care AI Receptionist Bot API',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      'health-v1': '/api/v1/health',
      webhooks: '/webhooks',
    },
    api: {
      v1: {
        base: '/api/v1',
        endpoints: {
          health: '/api/v1/health',
        },
      },
    },
  };

  res.json(successResponse(rootData, req));
});
