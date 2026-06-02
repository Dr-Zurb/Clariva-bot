/**
 * Appointment API Routes
 *
 * GET /api/v1/appointments/available-slots - Available time slots for a doctor on a date
 * POST /api/v1/appointments/book - Book an appointment
 * POST /api/v1/appointments - Create appointment (doctor-only, requires auth)
 * GET /api/v1/appointments - List appointments for authenticated doctor (requires auth)
 * GET /api/v1/appointments/:id - Get appointment by ID (doctor-only, requires auth)
 * POST /api/v1/appointments/:id/wrap-up - Finalise appointment (pf-02)
 *
 * Auth: available-slots/book unauthenticated; POST /, list, getById, patch,
 * wrap-up require auth (doctor).
 */

import { Router } from 'express';
import { authenticateToken, optionalAuthenticateToken } from '../../../middleware/auth';
import {
  getAvailableSlotsHandler,
  bookAppointmentHandler,
  createAppointmentHandler,
  listAppointmentsHandler,
  getAppointmentByIdHandler,
  patchAppointmentByIdHandler,
  postRecordingConsentHandler,
  wrapUpAppointmentHandler,
} from '../../../controllers/appointment-controller';

const router = Router();

router.get('/available-slots', getAvailableSlotsHandler);
router.post('/book', bookAppointmentHandler);
router.post('/', authenticateToken, createAppointmentHandler);
router.get('/', authenticateToken, listAppointmentsHandler);
router.get('/:id', authenticateToken, getAppointmentByIdHandler);
router.patch('/:id', authenticateToken, patchAppointmentByIdHandler);
// Plan 02 · Task 27 — recording consent capture. Dual-auth: doctor JWT OR
// booking token in body (optional auth so patient booking flow works).
router.post(
  '/:id/recording-consent',
  optionalAuthenticateToken,
  postRecordingConsentHandler
);
// Patient seeing flow · pf-02 — single transactional wrap-up endpoint:
// persists diagnosis + follow-up, flips status='completed', best-effort
// ends the live consultation session. Idempotent on re-call.
router.post('/:id/wrap-up', authenticateToken, wrapUpAppointmentHandler);

export default router;
