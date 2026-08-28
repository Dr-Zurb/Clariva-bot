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
import publicPrescriptionRoutes from './public-prescription-routes';
import publicDoctorRoutes from './public-doctor-routes';
import drugMasterRoutes from './drug-master';
import drugInteractionsRoutes from './drug-interactions-routes';
import rxTemplateRoutes from './rx-templates';
import opdRoutes from './opd';
import serviceStaffReviewRoutes from './service-staff-reviews';
import serviceMatchLearningRoutes from './service-match-learning';
import catalogRoutes from './catalog';
import meRoutes from './me';
import adminRoutes from './admin';
import dashboardEventsRoutes from './dashboard-events';
import dashboardInsightsRoutes from './dashboard-insights';
import dashboardOnboardingRoutes from './dashboard-onboarding';
import verificationRoutes from './verification';
import adminVerificationRoutes from './admin-verifications';
import adminDoctorsRoutes from './admin-doctors';
import diagnosesRoutes from './diagnoses';
import investigationsRoutes from './investigations';
import doctorDrugFavoritesRoutes from './doctor-drug-favorites';
import doctorDrugUsageRoutes from './doctor-drug-usage';
import complaintMasterRoutes from './complaint-master';
import medicinesRoutes from './medicines';
import noteFavoritesRoutes from './note-favorites';
import pushRoutes from './push';
import authRoutes from './auth';

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

// Public auth helpers (auth-password · AP-D17)
// POST /api/v1/auth/email-status
router.use('/auth', authRoutes);

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

// EHR Sub-batch B2 / T3.16 — Patient-facing share-link surface.
// HMAC-token gate inside the controller (no auth middleware here).
// GET /api/v1/public/prescriptions/:id?t=<token>
router.use('/public/prescriptions', publicPrescriptionRoutes);

// GET /api/v1/public/doctors/:id/mode-schedule (pdm-07)
router.use('/public', publicDoctorRoutes);

// Drug master lookup (EHR Sub-batch B1 / T2.7): GET /drugs/search (auth required)
router.use('/drugs', drugMasterRoutes);

// DDI check endpoint (EHR Sub-batch C / T4.19): GET /drug-interactions/check (auth required)
router.use('/drug-interactions', drugInteractionsRoutes);

// Doctor Rx templates (EHR Sub-batch B1 / T2.11): CRUD + atomic use counter
router.use('/rx-templates', rxTemplateRoutes);

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

// insights-v1 · ins-01: read-only, doctor-scoped, range-aware Tier-1
// practice-health aggregates (GET /dashboard/insights/overview).
router.use('/dashboard/insights', dashboardInsightsRoutes);

// doctor-onboarding-v1 · onb-01: read-only go-live checklist booleans
// (GET /dashboard/onboarding/status).
router.use('/dashboard/onboarding', dashboardOnboardingRoutes);

// doctor-verification-v1 · ver-03: doctor-facing verification submit/status
// (POST /verification/upload-url, /submit; GET /verification/status).
router.use('/verification', verificationRoutes);

// doctor-verification-v1 · ver-04: ops/admin review endpoints, gated by
// CRON_SECRET (GET/POST /admin/verifications...). The generic /admin router
// above only defines /archival-preview and falls through (next()) for other
// paths, so this dedicated sub-router is reached.
router.use('/admin/verifications', adminVerificationRoutes);

// admin-console-v3 · acon3-01: doctors directory (GET /admin/doctors).
// Invite path retired in auth-v2 (self-serve Google + Email OTP).
router.use('/admin/doctors', adminDoctorsRoutes);

// Patient seeing flow · pf-02: doctor-scoped diagnosis-tag autocomplete
// for the wrap-up dialog (powers GET /diagnoses/recent).
router.use('/diagnoses', diagnosesRoutes);

// plan-investigations-library · inv-lib-04: gated, suggestion-only AI resolver
// that normalizes free-text lab/imaging orders into clean terms (POST
// /investigations/parse). The frontend static catalog re-resolves every term.
router.use('/investigations', investigationsRoutes);

// rx-polish-favorites · rxf-04: per-doctor medicine row favorites
router.use('/doctors/me/drug-favorites', doctorDrugFavoritesRoutes);

// rx-polish-favorites · rxf-05: per-doctor drug usage scores for autocomplete ranking
router.use('/doctors/me/drug-usage', doctorDrugUsageRoutes);

// subjective-tab · subj-06: complaint lookup + per-doctor note favourites
router.use('/complaints', complaintMasterRoutes);
router.use('/doctors/me/note-favorites', noteFavoritesRoutes);
// medical-history med redesign: gated AI free-text medication parse
router.use('/medicines', medicinesRoutes);

// task-text-D6b: Web Push subscribe / unsubscribe / list
router.use('/push', pushRoutes);

export default router;
