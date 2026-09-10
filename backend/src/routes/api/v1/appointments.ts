/**
 * Appointment API Routes
 *
 * GET /api/v1/appointments/available-slots - Available time slots for a doctor on a date
 * POST /api/v1/appointments/book - Book an appointment
 * POST /api/v1/appointments - Create appointment (doctor or opted-in staff)
 * GET /api/v1/appointments - List appointments (doctor or opted-in staff)
 * GET /api/v1/appointments/:id - Get appointment by ID (doctor-only, requires auth)
 * POST /api/v1/appointments/:id/check-in - Arrival stamp (doctor or opted-in staff)
 * GET/PUT /api/v1/appointments/:id/desk-vitals - Optional intake after check-in
 * POST /api/v1/appointments/:id/visit-payments - Desk hisab collect (cash/UPI/card/no charge)
 * POST /api/v1/appointments/:id/desk-cancel - Cancel waiting / booked (not checked-in)
 * POST /api/v1/appointments/:id/desk-left - Left after check-in + till return
 * POST /api/v1/appointments/:id/desk-reschedule - Move waiting / booked to another slot or day
 * POST /api/v1/appointments/:id/wrap-up - Finalise appointment (pf-02)
 *
 * Auth: available-slots/book unauthenticated; POST /, list, check-in,
 * desk-vitals, visit-payments, desk-cancel, desk-left, desk-reschedule accept staff via allowStaff;
 * getById, patch, wrap-up remain doctor-only.
 */

import { Router } from 'express';
import { authenticateToken } from '../../../middleware/auth';
import { allowStaff } from '../../../middleware/allow-staff';
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

const router = Router();

router.get('/available-slots', getAvailableSlotsHandler);
router.post('/book', bookAppointmentHandler);
router.post('/', allowStaff, authenticateToken, resolveActingDoctor, createAppointmentHandler);
router.get('/', allowStaff, authenticateToken, resolveActingDoctor, listAppointmentsHandler);
router.get('/:id', authenticateToken, getAppointmentByIdHandler);
router.patch('/:id', authenticateToken, patchAppointmentByIdHandler);
router.post(
  '/:id/check-in',
  allowStaff,
  authenticateToken,
  resolveActingDoctor,
  checkInAppointmentHandler
);
router.get(
  '/:id/desk-vitals',
  allowStaff,
  authenticateToken,
  resolveActingDoctor,
  getDeskVitalsHandler
);
router.put(
  '/:id/desk-vitals',
  allowStaff,
  authenticateToken,
  resolveActingDoctor,
  upsertDeskVitalsHandler
);
router.post(
  '/:id/visit-payments',
  allowStaff,
  authenticateToken,
  resolveActingDoctor,
  collectVisitPaymentHandler
);
router.post(
  '/:id/desk-cancel',
  allowStaff,
  authenticateToken,
  resolveActingDoctor,
  deskCancelAppointmentHandler
);
router.post(
  '/:id/desk-left',
  allowStaff,
  authenticateToken,
  resolveActingDoctor,
  deskLeftAppointmentHandler
);
router.post(
  '/:id/desk-reschedule',
  allowStaff,
  authenticateToken,
  resolveActingDoctor,
  deskRescheduleAppointmentHandler
);
// Patient seeing flow · pf-02 — single transactional wrap-up endpoint:
// persists diagnosis + follow-up, flips status='completed', best-effort
// ends the live consultation session. Idempotent on re-call.
router.post('/:id/wrap-up', authenticateToken, wrapUpAppointmentHandler);

export default router;
