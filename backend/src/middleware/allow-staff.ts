/**
 * Route-level marker: this endpoint accepts staff JWTs (DL-2 / DL-3).
 *
 * MUST run before `authenticateToken` so the deny check sees `req.staffAllowed`.
 * Pair with `resolveActingDoctor` after auth on the same route.
 *
 *   router.post('/', allowStaff, authenticateToken, resolveActingDoctor, handler);
 */

import type { NextFunction, Request, RequestHandler, Response } from 'express';

export const allowStaff: RequestHandler = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  req.staffAllowed = true;
  next();
};
