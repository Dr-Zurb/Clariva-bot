import { Router } from 'express';
import healthRoutes from './health';
import apiV1Routes from './api/v1';
import webhookRoutes from './webhooks';

const router = Router();

/**
 * Route aggregation
 *
 * All routes are registered here and then mounted in the main app
 * This pattern allows for better organization and scalability
 *
 * API Versioning Strategy:
 * - Unversioned routes (/, /health) - kept for monitoring tools and backward compatibility
 * - Versioned routes (/api/v1/*) - all new API endpoints should use versioning
 * - Future versions (/api/v2/*) can be added without breaking existing clients
 */

// Health and root routes (unversioned - for monitoring tools)
// GET /health - Health check endpoint (kept unversioned for monitoring tools)
// GET / - Root endpoint with API information
router.use('/', healthRoutes);

// API v1 routes (versioned)
// All versioned API endpoints: /api/v1/*
router.use('/api/v1', apiV1Routes);

// Webhook routes (unversioned - external service callbacks)
// GET /webhooks/instagram - Webhook verification
// POST /webhooks/instagram - Webhook event processing
router.use('/webhooks', webhookRoutes);

export default router;
