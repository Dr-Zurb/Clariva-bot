/**
 * Express Request Type Extensions
 *
 * Extends Express Request type to include custom properties
 * This prevents the need for (req as any) throughout the codebase
 */

import { User } from '@supabase/supabase-js';

declare global {
  namespace Express {
    interface Request {
      /**
       * Authenticated user (set by auth middleware)
       * Available after authenticateToken middleware
       */
      user?: User;

      /**
       * Request correlation ID (set by correlation-id middleware)
       * Used for request tracing across services
       */
      correlationId?: string;

      /**
       * Resolved admin actor (set by the admin authz guard, admin-console-v1).
       * The admin's `auth.users` id when authenticated via an admin JWT, or the
       * literal `'ops'` when authenticated via the CRON_SECRET fallback. Used to
       * stamp `reviewed_by` on verification actions.
       */
      adminActor?: string;

      /**
       * Request start time (set by request-timing middleware)
       * Used for calculating request duration
       */
      startTime?: number;

      /**
       * Raw request body (set by express.json verify callback)
       * Used for webhook signature verification (requires exact raw bytes)
       */
      rawBody?: Buffer;
    }
  }
}

// Export empty object to make this a valid module
export {};
