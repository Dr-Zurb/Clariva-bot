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
       * Tenant — whose data this request operates on (receptionist-portal P1).
       * Set by `resolveActingDoctor`.
       */
      actingDoctorId?: string;

      /**
       * Real `auth.users` id of whoever is clicking (receptionist-portal P1).
       * Set by `resolveActingDoctor`.
       */
      actorId?: string;

      /**
       * Whether the actor is the doctor themselves or staff acting for them.
       */
      actorKind?: 'doctor' | 'staff';

      /**
       * `clinic_staff.role` when `actorKind === 'staff'`.
       */
      staffRole?: string;

      /**
       * Set by `allowStaff` / `staffCapability` before `authenticateToken`
       * so staff JWTs are not denied on opted-in routes (DL-2 / DL-3).
       */
      staffAllowed?: boolean;

      /**
       * Capabilities this route requires. Staff must have at least one.
       * Set by `staffCapability`. Missing on a staff-allowed route → 403.
       */
      requiredCapabilities?: import('../auth/staff-capabilities').StaffCapability[];

      /**
       * `/clinic-staff/me` only — any linked staff may read their session.
       */
      staffSessionOnly?: boolean;

      /**
       * `clinic_staff.capabilities` when `actorKind === 'staff'`.
       */
      staffCapabilities?: string[];

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
