import { Router } from 'express';
import healthRoutes from '../../health';
import appointmentRoutes from './appointments';
import bookingRoutes from './bookings';
import consultationRoutes from './consultation';
import paymentRoutes from './payments';
import patientRoutes from './patients';
import instagramSettingsRoutes from './settings/instagram';
import doctorSettingsRoutes from './settings/doctor';
import availabilityRoutes from './availability';
import blockedTimesRoutes from './blocked-times';
import prescriptionRoutes from './prescriptions';
import opdRoutes from './opd';
import serviceStaffReviewRoutes from './service-staff-reviews';
import serviceMatchLearningRoutes from './service-match-learning';
import catalogRoutes from './catalog';
import meRoutes from './me';
import adminRoutes from './admin';
import dashboardEventsRoutes from './dashboard-events';

const router = Router();

/**
 * API v1 Routes
 *
 * All versioned API endpoints go here
 * This allows for future API versions (v2, v3, etc.) without breaking existing clients
 */

// Health check endpoint (versioned)
// GET /api/v1/health
router.use('/health', healthRoutes);

// Appointment endpoints
// GET /api/v1/appointments/available-slots
router.use('/appointments', appointmentRoutes);

// Booking slot picker (e-task-3): day-slots, select-slot, slot-page-info
router.use('/bookings', bookingRoutes);

// Consultation (e-task-3): start, token
router.use('/consultation', consultationRoutes);

// Payment endpoints (e-task-4)
// POST /api/v1/payments/create-link, GET /api/v1/payments/:id
router.use('/payments', paymentRoutes);

// Patient endpoints (e-task-5)
// GET /api/v1/patients/:id
router.use('/patients', patientRoutes);

// Instagram connect (e-task-3): GET /connect (auth), GET /callback
router.use('/settings/instagram', instagramSettingsRoutes);

// Doctor settings (e-task-2): GET/PATCH /settings/doctor (auth required)
router.use('/settings/doctor', doctorSettingsRoutes);

// Availability (e-task-3): GET/PUT /availability (auth required)
router.use('/availability', availabilityRoutes);

// Blocked times (e-task-3): GET/POST/DELETE /blocked-times (auth required)
router.use('/blocked-times', blockedTimesRoutes);

// Prescriptions (Prescription V1): POST/GET/PATCH /prescriptions (auth required)
router.use('/prescriptions', prescriptionRoutes);

// Doctor OPD controls (e-task-opd-06): queue session, early join, delay
router.use('/opd', opdRoutes);

// ARM-06: Pending service catalog staff reviews (inbox / resolve)
router.use('/service-staff-reviews', serviceStaffReviewRoutes);

// learn-04: Policy suggestions + autobook policies (doctor opt-in)
router.use('/service-match-learning', serviceMatchLearningRoutes);

// Plan 02 / Task 06: AI auto-fill for service catalog cards (POST /catalog/ai-suggest)
router.use('/catalog', catalogRoutes);

// Plan 02 / Task 33: Patient-self routes (account-deletion, recovery).
// Auth is resolved per-handler (doctor JWT OR booking token).
router.use('/me', meRoutes);

// Plan 02 / Task 34: ops-facing admin endpoints (archival preview).
// Gated by CRON_SECRET shared-secret until a proper admin-role
// middleware lands.
router.use('/admin', adminRoutes);

// Plan 07 / Task 30: doctor dashboard event feed (recording-replay
// notifications today; widens additively in Plans 08/09).
router.use('/dashboard/events', dashboardEventsRoutes);

export default router;
