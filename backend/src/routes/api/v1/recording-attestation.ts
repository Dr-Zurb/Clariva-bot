/**
 * Doctor recording attestation (rec-11).
 *
 * Mounted at `/api/v1/recording-attestation`. Doctor JWT only.
 */

import { Router } from 'express';
import { authenticateToken } from '../../../middleware/auth';
import {
  acceptRecordingAttestationHandler,
  getRecordingAttestationHandler,
} from '../../../controllers/doctor-recording-attestation-controller';

const router = Router();

router.get('/', authenticateToken, getRecordingAttestationHandler);
router.post('/', authenticateToken, acceptRecordingAttestationHandler);

export default router;
