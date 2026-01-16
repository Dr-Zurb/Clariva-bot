import { Router } from 'express';
import healthRoutes from './health';
// Import other route modules here as they're created
// import webhookRoutes from './webhooks';
// import apiRoutes from './api';

const router = Router();

/**
 * Route aggregation
 * 
 * All routes are registered here and then mounted in the main app
 * This pattern allows for better organization and scalability
 */

// Health and root routes
router.use('/', healthRoutes);

// Webhook routes (to be added)
// router.use('/webhooks', webhookRoutes);

// API routes (to be added)
// router.use('/api', apiRoutes);

export default router;
