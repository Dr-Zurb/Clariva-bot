import pino from 'pino';
import { env } from './env';

/**
 * Structured Logger Configuration
 * 
 * Uses Pino for fast, structured JSON logging
 * MUST: Include standard log fields (correlationId, path, method, statusCode, durationMs) - see STANDARDS.md
 * 
 * In development: Pretty logs for readability
 * In production: JSON logs for log aggregation tools
 * 
 * MUST: Use validated env from config/env.ts (not raw process.env) - see STANDARDS.md
 */

const isDevelopment = env.NODE_ENV === 'development';

export const logger = pino({
  level: env.LOG_LEVEL,
  transport: isDevelopment
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      }
    : undefined, // Production: JSON output
});

/**
 * Helper function to create log context with standard fields
 * 
 * MUST: Include correlationId, path, method, statusCode, durationMs in all logs
 * 
 * @param req - Express request object (optional)
 * @param additionalFields - Additional fields to include in log
 * @returns Log context object with standard fields
 */
export function createLogContext(
  req?: { correlationId?: string; path?: string; method?: string; startTime?: number },
  additionalFields?: Record<string, unknown>
): Record<string, unknown> {
  const durationMs = req?.startTime ? Date.now() - req.startTime : undefined;

  return {
    ...(req?.correlationId && { correlationId: req.correlationId }),
    ...(req?.path && { path: req.path }),
    ...(req?.method && { method: req.method }),
    ...(durationMs !== undefined && { durationMs }),
    ...additionalFields,
  };
}
