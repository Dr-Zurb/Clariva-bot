import { Router } from 'express';
import {
  verifyInstagramWebhook,
  handleInstagramWebhook,
  handleRazorpayWebhook,
  handlePayPalWebhook,
} from '../controllers/webhook-controller';
import { handleTwilioRoomStatusWebhook } from '../controllers/twilio-webhook-controller';
import { webhookLimiter } from '../middleware/rate-limiters';

const router = Router();

/**
 * Webhook routes
 *
 * Webhooks are unversioned endpoints that receive external service callbacks
 * These routes handle verification and event processing for third-party services
 *
 * Routes:
 * - GET /webhooks/instagram - Webhook verification (Facebook/Instagram)
 * - POST /webhooks/instagram - Webhook event processing (Facebook/Instagram) - Rate limited
 * - POST /webhooks/razorpay - Razorpay payment webhook (e-task-4)
 * - POST /webhooks/paypal - PayPal payment webhook (e-task-4)
 * - POST /webhooks/twilio/room-status - Twilio Video room status (e-task-4)
 *
 * IMPORTANT:
 * - POST routes have rate limiting (1000 requests per 15 minutes)
 * - Payment webhooks require signature verification (X-Razorpay-Signature, PayPal Verify API)
 */

// Instagram webhook routes
router.get('/instagram', verifyInstagramWebhook);
router.post('/instagram', webhookLimiter, handleInstagramWebhook);

// Payment webhook routes (e-task-4)
router.post('/razorpay', webhookLimiter, handleRazorpayWebhook);
router.post('/paypal', webhookLimiter, handlePayPalWebhook);

// Twilio Video room status (e-task-4 - participant-connected, room-ended, etc.)
router.post('/twilio/room-status', webhookLimiter, handleTwilioRoomStatusWebhook);

export default router;
