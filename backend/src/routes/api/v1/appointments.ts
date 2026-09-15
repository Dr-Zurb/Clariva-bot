/**
 * Appointment API Routes
 *
 * GET /api/v1/appointments/available-slots - Available time slots for a doctor on a date
 * POST /api/v1/appointments/book - Book an appointment
 * POST /api/v1/appointments - Create appointment (doctor or opted-in staff)
 * GET /api/v1/appointments - List appointments (doctor or opted-in staff)
 * GET /api/v1/appointments/lab-pending - Derived internal-lab pending list (dvp P4)
 * GET /api/v1/appointments/:id/lab-orders - Attested investigation-order projection (dvp P4)
 * PUT /api/v1/appointments/:id/lab-orders - Per-test uploaded / not-done close-out (dvp P4)
 * GET /api/v1/appointments/:id - Get appointment by ID (doctor-only, requires auth)
 * POST /api/v1/appointments/:id/check-in - Arrival stamp (doctor or opted-in staff)
 * GET/PUT /api/v1/appointments/:id/desk-vitals - Optional intake after check-in
 * GET/POST /api/v1/appointments/:id/documents - Desk visit documents (dvp P1)
 * POST …/pages/:pageId/extract-lab + PUT …/extracted-results — desk lab confirm (236)
 * GET/PUT /api/v1/appointments/:id/history-submission - Desk history sidecar (dvp P2)
 * PATCH /api/v1/appointments/:id/history-submission/accept - Doctor per-item accept (dvp P2)
 * POST /api/v1/appointments/:id/visit-payments - Desk hisab collect (cash/UPI/card/no charge)
 * POST /api/v1/appointments/:id/desk-cancel - Cancel waiting / booked (not checked-in)
 * POST /api/v1/appointments/:id/desk-left - Left after check-in + till return
 * POST /api/v1/appointments/:id/desk-reschedule - Move waiting / booked to another slot or day
 * POST /api/v1/appointments/:id/wrap-up - Finalise appointment (pf-02)
 *
 * Auth: available-slots/book unauthenticated; POST /, list, check-in,
 * desk-vitals, documents, lab-orders, lab-pending, history-submission, visit-payments, desk-cancel, desk-left, desk-reschedule accept staff via staffCapability;
 * getById, patch, wrap-up, history-submission/accept remain doctor-only.
 */

import { Router } from 'express';
import { authenticateToken } from '../../../middleware/auth';
import { staffCapability } from '../../../middleware/allow-staff';
import { STAFF_CAPABILITIES } from '../../../auth/staff-capabilities';
import { resolveActingDoctor } from '../../../middleware/resolve-acting-doctor';
import {
  getAvailableSlotsHandler,
  bookAppointmentHandler,
  createAppointmentHandler,
  listAppointmentsHandler,
  getAppointmentByIdHandler,
  patchAppointmentByIdHandler,
  checkInAppointmentHandler,
  wrapUpAppointmentHandler,
} from '../../../controllers/appointment-controller';
import {
  getDeskVitalsHandler,
  upsertDeskVitalsHandler,
} from '../../../controllers/desk-vitals-controller';
import { collectVisitPaymentHandler } from '../../../controllers/visit-payments-controller';
import { deskCancelAppointmentHandler } from '../../../controllers/desk-cancel-controller';
import { deskLeftAppointmentHandler } from '../../../controllers/desk-left-controller';
import { deskRescheduleAppointmentHandler } from '../../../controllers/desk-reschedule-controller';
import { labExtractLimiter } from '../../../middleware/rate-limiters';
import {
  addVisitDocumentPageHandler,
  confirmVisitDocumentExtractedResultsHandler,
  createVisitDocumentHandler,
  createVisitDocumentUploadUrlHandler,
  deleteVisitDocumentHandler,
  deleteVisitDocumentPageHandler,
  extractVisitDocumentPageLabHandler,
  getVisitDocumentPageDownloadUrlHandler,
  listVisitDocumentsHandler,
  updateVisitDocumentHandler,
} from '../../../controllers/visit-documents-controller';
import {
  acceptHistorySubmissionHandler,
  getHistorySubmissionHandler,
  upsertHistorySubmissionHandler,
} from '../../../controllers/patient-history-submissions-controller';
import {
  getLabOrdersHandler,
  listPendingLabAppointmentsHandler,
  upsertLabOrdersHandler,
} from '../../../controllers/desk-lab-orders-controller';

const router = Router();

router.get('/available-slots', getAvailableSlotsHandler);
router.post('/book', bookAppointmentHandler);
router.post(
  '/',
  staffCapability('front_desk'),
  authenticateToken,
  resolveActingDoctor,
  createAppointmentHandler
);
router.get(
  '/',
  staffCapability(...STAFF_CAPABILITIES),
  authenticateToken,
  resolveActingDoctor,
  listAppointmentsHandler
);
router.get(
  '/lab-pending',
  staffCapability('internal_labs'),
  authenticateToken,
  resolveActingDoctor,
  listPendingLabAppointmentsHandler
);
router.get('/:id', authenticateToken, getAppointmentByIdHandler);
router.patch('/:id', authenticateToken, patchAppointmentByIdHandler);
router.post(
  '/:id/check-in',
  staffCapability('front_desk'),
  authenticateToken,
  resolveActingDoctor,
  checkInAppointmentHandler
);
router.get(
  '/:id/desk-vitals',
  staffCapability('vitals'),
  authenticateToken,
  resolveActingDoctor,
  getDeskVitalsHandler
);
router.put(
  '/:id/desk-vitals',
  staffCapability('vitals'),
  authenticateToken,
  resolveActingDoctor,
  upsertDeskVitalsHandler
);
router.get(
  '/:id/lab-orders',
  staffCapability('internal_labs'),
  authenticateToken,
  resolveActingDoctor,
  getLabOrdersHandler
);
router.put(
  '/:id/lab-orders',
  staffCapability('internal_labs'),
  authenticateToken,
  resolveActingDoctor,
  upsertLabOrdersHandler
);
router.get(
  '/:id/documents',
  staffCapability('internal_labs', 'papers'),
  authenticateToken,
  resolveActingDoctor,
  listVisitDocumentsHandler
);
router.post(
  '/:id/documents/upload-url',
  staffCapability('internal_labs', 'papers'),
  authenticateToken,
  resolveActingDoctor,
  createVisitDocumentUploadUrlHandler
);
router.post(
  '/:id/documents',
  staffCapability('internal_labs', 'papers'),
  authenticateToken,
  resolveActingDoctor,
  createVisitDocumentHandler
);
router.post(
  '/:id/documents/:documentId/pages',
  staffCapability('internal_labs', 'papers'),
  authenticateToken,
  resolveActingDoctor,
  addVisitDocumentPageHandler
);
router.patch(
  '/:id/documents/:documentId',
  staffCapability('internal_labs', 'papers'),
  authenticateToken,
  resolveActingDoctor,
  updateVisitDocumentHandler
);
router.get(
  '/:id/documents/:documentId/pages/:pageId/download-url',
  staffCapability('internal_labs', 'papers'),
  authenticateToken,
  resolveActingDoctor,
  getVisitDocumentPageDownloadUrlHandler
);
router.post(
  '/:id/documents/:documentId/pages/:pageId/extract-lab',
  staffCapability('internal_labs', 'papers'),
  authenticateToken,
  resolveActingDoctor,
  labExtractLimiter,
  extractVisitDocumentPageLabHandler
);
router.put(
  '/:id/documents/:documentId/extracted-results',
  staffCapability('internal_labs', 'papers'),
  authenticateToken,
  resolveActingDoctor,
  confirmVisitDocumentExtractedResultsHandler
);
router.delete(
  '/:id/documents/:documentId/pages/:pageId',
  staffCapability('internal_labs', 'papers'),
  authenticateToken,
  resolveActingDoctor,
  deleteVisitDocumentPageHandler
);
router.delete(
  '/:id/documents/:documentId',
  staffCapability('internal_labs', 'papers'),
  authenticateToken,
  resolveActingDoctor,
  deleteVisitDocumentHandler
);
router.get(
  '/:id/history-submission',
  staffCapability('history'),
  authenticateToken,
  resolveActingDoctor,
  getHistorySubmissionHandler
);
router.put(
  '/:id/history-submission',
  staffCapability('history'),
  authenticateToken,
  resolveActingDoctor,
  upsertHistorySubmissionHandler
);
router.patch('/:id/history-submission/accept', authenticateToken, acceptHistorySubmissionHandler);
router.post(
  '/:id/visit-payments',
  staffCapability('front_desk'),
  authenticateToken,
  resolveActingDoctor,
  collectVisitPaymentHandler
);
router.post(
  '/:id/desk-cancel',
  staffCapability('front_desk'),
  authenticateToken,
  resolveActingDoctor,
  deskCancelAppointmentHandler
);
router.post(
  '/:id/desk-left',
  staffCapability('front_desk'),
  authenticateToken,
  resolveActingDoctor,
  deskLeftAppointmentHandler
);
router.post(
  '/:id/desk-reschedule',
  staffCapability('front_desk'),
  authenticateToken,
  resolveActingDoctor,
  deskRescheduleAppointmentHandler
);
// Patient seeing flow · pf-02 — single transactional wrap-up endpoint:
// persists diagnosis + follow-up, flips status='completed', best-effort
// ends the live consultation session. Idempotent on re-call.
router.post('/:id/wrap-up', authenticateToken, wrapUpAppointmentHandler);

export default router;
