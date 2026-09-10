/**
 * Prescription API Routes (Prescription V1)
 *
 * POST /api/v1/prescriptions - Create prescription (auth required)
 * GET /api/v1/prescriptions/:id - Get prescription by ID (auth required)
 * GET /api/v1/prescriptions - List by appointmentId or patientId (auth required)
 * PATCH /api/v1/prescriptions/:id - Update prescription (auth required)
 * GET /api/v1/prescriptions/:id/pdf-url - Fresh signed PDF URL for print (auth required)
 * GET /api/v1/prescriptions/:id/pdf - Stream PDF bytes for print/download (auth required)
 * POST /api/v1/prescriptions/:id/reissue - Same-day revise clone (auth required)
 */

import { Router } from 'express';
import { authenticateToken } from '../../../middleware/auth';
import { labExtractLimiter } from '../../../middleware/rate-limiters';
import {
  createPrescriptionHandler,
  createPrescriptionShareLinkHandler,
  getLastPrescriptionInEpisodeHandler,
  getLastSubjectiveForPatientHandler,
  getPrescriptionByIdHandler,
  listPrescriptionsHandler,
  getPrescriptionPdfHandler,
  getPrescriptionPdfUrlHandler,
  regeneratePrescriptionPdfHandler,
  updatePrescriptionHandler,
  createUploadUrlHandler,
  registerAttachmentHandler,
  getAttachmentDownloadUrlHandler,
  extractLabPdfFromAttachmentHandler,
  deleteAttachmentHandler,
  sendPrescriptionToPatientHandler,
  reissuePrescriptionHandler,
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
// rpt-05.6: rate-limited because photo attachments route to a paid vision model.
router.post(
  '/:id/attachments/:attachmentId/extract-lab',
  labExtractLimiter,
  extractLabPdfFromAttachmentHandler
);
// objective-tab (obj-22) — remove a mis-uploaded objective media file. Reuses the shipped
// DELETE RLS policy (migration 026); no new policy.
router.delete('/:id/attachments/:attachmentId', deleteAttachmentHandler);

// Same-day revise — clone as Version N+1. Reason required (RXL-Q8).
router.post('/:id/reissue', reissuePrescriptionHandler);

// Send to patient
router.post('/:id/send', sendPrescriptionToPatientHandler);

// Doctor print — remint (or generate) a signed PDF URL. No send side effects.
router.get('/:id/pdf-url', getPrescriptionPdfUrlHandler);
// Doctor print / download — stream bytes (skips the storage signed-URL hop).
router.get('/:id/pdf', getPrescriptionPdfHandler);

// EHR Sub-batch B2 / T3.19 — past-Rx kebab actions
//   - regenerate-pdf forces a fresh render bypassing the 5-min cache.
//   - share-link mints a fresh 24h HMAC token (no side effects).
router.post('/:id/regenerate-pdf', regeneratePrescriptionPdfHandler);
router.post('/:id/share-link', createPrescriptionShareLinkHandler);

export default router;
