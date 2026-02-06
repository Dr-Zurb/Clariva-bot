import { Router } from 'express';
import healthRoutes from '../../health';
import appointmentRoutes from './appointments';
import paymentRoutes from './payments';
import patientRoutes from './patients';
import instagramSettingsRoutes from './settings/instagram';

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

// Payment endpoints (e-task-4)
// POST /api/v1/payments/create-link, GET /api/v1/payments/:id
router.use('/payments', paymentRoutes);

// Patient endpoints (e-task-5)
// GET /api/v1/patients/:id
router.use('/patients', patientRoutes);

// Instagram connect (e-task-3): GET /connect (auth), GET /callback
router.use('/settings/instagram', instagramSettingsRoutes);

export default router;
