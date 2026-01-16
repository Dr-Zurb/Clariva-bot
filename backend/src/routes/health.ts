import { Router } from 'express';
import { getHealth, getRoot } from '../controllers/health-controller';

const router = Router();

/**
 * Health check endpoint
 * GET /health
 * 
 * Returns server status and timestamp
 * Used for monitoring and uptime checks
 */
router.get('/health', getHealth);

/**
 * Root endpoint
 * GET /
 * 
 * Returns API information and available endpoints
 */
router.get('/', getRoot);

export default router;
