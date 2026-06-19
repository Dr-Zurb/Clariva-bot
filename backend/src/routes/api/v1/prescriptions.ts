/**
 * Prescription API Routes (Prescription V1)
 *
 * POST /api/v1/prescriptions - Create prescription (auth required)
 * GET /api/v1/prescriptions/:id - Get prescription by ID (auth required)
 * GET /api/v1/prescriptions - List by appointmentId or patientId (auth required)
 * PATCH /api/v1/prescriptions/:id - Update prescription (auth required)
 */

import { Router } from 'express';
import { authenticateToken } from '../../../middleware/auth';
import {
  createPrescriptionHandler,
  createPrescriptionShareLinkHandler,
  getLastPrescriptionInEpisodeHandler,
  getLastSubjectiveForPatientHandler,
  getPrescriptionByIdHandler,
  listPrescriptionsHandler,
  regeneratePrescriptionPdfHandler,
  updatePrescriptionHandler,
  createUploadUrlHandler,
  registerAttachmentHandler,
  getAttachmentDownloadUrlHandler,
  sendPrescriptionToPatientHandler,
} from '../../../controllers/prescription-controller';

const router = Router();

router.use(authenticateToken);

router.post('/', createPrescriptionHandler);
router.get('/', listPrescriptionsHandler);
// EHR Sub-batch B1 / T2.14 — must come BEFORE the /:id route or
// `last-in-episode` would be parsed as an :id (UUID validator inside
// the handler would still reject, but reordering keeps the routing
// clean and avoids the noisy 400).
router.get('/last-in-episode', getLastPrescriptionInEpisodeHandler);
router.get('/last-subjective', getLastSubjectiveForPatientHandler);
router.get('/:id', getPrescriptionByIdHandler);
router.patch('/:id', updatePrescriptionHandler);

// Attachment routes (nested under prescription id)
router.post('/:id/attachments/upload-url', createUploadUrlHandler);
router.post('/:id/attachments', registerAttachmentHandler);
router.get('/:id/attachments/:attachmentId/download-url', getAttachmentDownloadUrlHandler);

// Send to patient
router.post('/:id/send', sendPrescriptionToPatientHandler);

// EHR Sub-batch B2 / T3.19 — past-Rx kebab actions
//   - regenerate-pdf forces a fresh render bypassing the 5-min cache.
//   - share-link mints a fresh 24h HMAC token (no side effects).
router.post('/:id/regenerate-pdf', regeneratePrescriptionPdfHandler);
router.post('/:id/share-link', createPrescriptionShareLinkHandler);

export default router;
