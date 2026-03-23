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
  getPrescriptionByIdHandler,
  listPrescriptionsHandler,
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
router.get('/:id', getPrescriptionByIdHandler);
router.patch('/:id', updatePrescriptionHandler);

// Attachment routes (nested under prescription id)
router.post('/:id/attachments/upload-url', createUploadUrlHandler);
router.post('/:id/attachments', registerAttachmentHandler);
router.get('/:id/attachments/:attachmentId/download-url', getAttachmentDownloadUrlHandler);

// Send to patient
router.post('/:id/send', sendPrescriptionToPatientHandler);

export default router;
