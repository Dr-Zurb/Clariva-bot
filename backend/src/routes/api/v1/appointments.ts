/**
 * Appointment API Routes
 *
 * GET /api/v1/appointments/available-slots - Available time slots for a doctor on a date
 * POST /api/v1/appointments/book - Book an appointment
 * POST /api/v1/appointments - Create appointment (doctor-only, requires auth)
 * GET /api/v1/appointments - List appointments for authenticated doctor (requires auth)
 * GET /api/v1/appointments/:id - Get appointment by ID (doctor-only, requires auth)
 *
 * Auth: available-slots/book unauthenticated; POST /, list, getById, patch require auth (doctor).
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

export default router;
