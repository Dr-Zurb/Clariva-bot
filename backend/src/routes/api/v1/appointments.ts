/**
 * Appointment API Routes
 *
 * GET /api/v1/appointments/available-slots - Available time slots for a doctor on a date
 * POST /api/v1/appointments/book - Book an appointment
 * GET /api/v1/appointments - List appointments for authenticated doctor (requires auth)
 * GET /api/v1/appointments/:id - Get appointment by ID (doctor-only, requires auth)
 *
 * Auth: available-slots/book unauthenticated; list and getById require auth (doctor).
 */

import { Router } from 'express';
import { authenticateToken } from '../../../middleware/auth';
import {
  getAvailableSlotsHandler,
  bookAppointmentHandler,
  listAppointmentsHandler,
  getAppointmentByIdHandler,
} from '../../../controllers/appointment-controller';

const router = Router();

router.get('/available-slots', getAvailableSlotsHandler);
router.post('/book', bookAppointmentHandler);
router.get('/', authenticateToken, listAppointmentsHandler);
router.get('/:id', authenticateToken, getAppointmentByIdHandler);

export default router;
