/**
 * /api/v1/me routes
 *
 * Patient-self routes. These are the endpoints a patient surface
 * (booking page, post-consult links, /data-deletion page) hits
 * without requiring a doctor JWT. Authentication is either a
 * doctor JWT (for admin-initiated flows) or a booking-token + OTP
 * (for self-serve flows) — resolved inside each controller.
 *
 * Currently registered:
 *   - POST /api/v1/me/account-deletion   Plan 02 · Task 33
 *   - POST /api/v1/me/account-recovery   Plan 02 · Task 33
 */

import { Router } from 'express';
import { optionalAuthenticateToken } from '../../../middleware/auth';
import {
  postMeAccountDeletionHandler,
  postMeAccountRecoveryHandler,
} from '../../../controllers/account-deletion-controller';

const router = Router();

router.post(
  '/account-deletion',
  optionalAuthenticateToken,
  postMeAccountDeletionHandler,
);

router.post(
  '/account-recovery',
  optionalAuthenticateToken,
  postMeAccountRecoveryHandler,
);

export default router;
