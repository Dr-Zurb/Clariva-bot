/**
 * Doctor Verification Routes (doctor-verification-v1 · ver-03).
 *
 * Mounted at `/api/v1/verification` from `routes/api/v1/index.ts`.
 * All routes require a doctor JWT.
 *
 * - POST /upload-url — mint a signed upload URL for a document.
 * - POST /submit     — submit registration details + doc paths (→ pending_review).
 * - GET  /status     — the doctor's own verification status.
 */

import { Router } from 'express';
import { authenticateToken } from '../../../middleware/auth';
import {
  createUploadUrlHandler,
  getVerificationStatusHandler,
  submitVerificationHandler,
} from '../../../controllers/doctor-verification-controller';

const router = Router();

router.post('/upload-url', authenticateToken, createUploadUrlHandler);
router.post('/submit', authenticateToken, submitVerificationHandler);
router.get('/status', authenticateToken, getVerificationStatusHandler);

export default router;
