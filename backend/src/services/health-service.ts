/**
 * Health Service
 *
 * Provides health check data (database connectivity, etc.) for the health controller.
 * Controllers must not import config/database directly per ARCHITECTURE; this service
 * performs the connection test and returns results.
 *
 * MUST: Services may import config/database; controllers call this service only.
 */

import { testConnection } from '../config/database';

/**
 * Check database connection
 *
 * @returns True if database is reachable and auth succeeds, false otherwise
 */
export async function checkDatabaseConnection(): Promise<boolean> {
  return testConnection();
}
