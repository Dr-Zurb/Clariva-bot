/**
 * Route-level marker: this endpoint accepts staff JWTs (DL-2 / DL-3).
 *
 * MUST run before `authenticateToken` so the deny check sees `req.staffAllowed`.
 * Pair with `resolveActingDoctor` after auth on the same route.
 *
 * Production routes must declare a capability (fail closed). Use
 * `allowStaffSession` only for `/clinic-staff/me`.
 */

import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { StaffCapability } from '../auth/staff-capabilities';

export function staffCapability(...caps: StaffCapability[]): RequestHandler {
  if (caps.length === 0) {
    throw new Error('staffCapability requires at least one capability');
  }
  return (req: Request, _res: Response, next: NextFunction): void => {
    req.staffAllowed = true;
    req.requiredCapabilities = caps;
    next();
  };
}

/** Session bootstrap — any linked staff. */
export const allowStaffSession: RequestHandler = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  req.staffAllowed = true;
  req.staffSessionOnly = true;
  next();
};

/**
 * Marks the route staff-reachable for authenticateToken.
 * Does not grant a capability — resolveActingDoctor denies staff unless
 * `staffCapability` or `allowStaffSession` also ran.
 */
export const allowStaff: RequestHandler = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  req.staffAllowed = true;
  next();
};
