/**
 * Public prescription routes (EHR Sub-batch B2 / T3.16).
 *
 * Mounted at `/api/v1/public/prescriptions` from the v1 router. The
 * `/public` prefix is reserved for token-gated, no-auth-middleware
 * endpoints (Decision T3-D3) — adding more public surfaces in the
 * future means putting them under this router.
 *
 * GET /:id?t=<token>  →  patient share-link surface; HMAC-token gate.
 *
 * **No auth middleware.** Token verification happens inside the
 * handler so the deny path can return a structured 401/410 instead
 * of the generic UnauthorizedError thrown by `authenticateToken`.
 */

import { Router } from 'express';
import { getPublicPrescriptionHandler } from '../../../controllers/public-prescription-controller';

const router = Router();

router.get('/:id', getPublicPrescriptionHandler);

export default router;
