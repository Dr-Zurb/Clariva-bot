/**
 * Webhook Type Definitions
 *
 * TypeScript types for webhook processing, verification, and idempotency.
 * Used by webhook security utilities and webhook controllers.
 *
 * IMPORTANT:
 * - Webhook payloads may contain PHI/PII - never log raw payloads
 * - Types match platform-specific webhook structures
 * - Provider types must match database schema CHECK constraints
 */

// Re-export WebhookProvider from database.ts (already defined there)
import type { WebhookProvider } from './database';
export type { WebhookProvider };

// ============================================================================
// Webhook Payload Types
// ============================================================================

/**
 * Instagram webhook payload structure
 * Based on Meta Platform webhook format
 */
export interface InstagramWebhookPayload {
  object: 'instagram';
  entry: Array<{
    id: string; // Entry ID (used as event ID)
    time: number; // Unix timestamp
    messaging?: Array<{
      sender: {
        id: string;
      };
      recipient: {
        id: string;
      };
      timestamp: number;
      message?: {
        mid: string;
        text?: string;
      };
    }>;
  }>;
}

/**
 * Facebook webhook payload structure
 * Based on Meta Platform webhook format
 */
export interface FacebookWebhookPayload {
  object: 'page';
  entry: Array<{
    id: string; // Entry ID
    time: number; // Unix timestamp
    messaging?: Array<{
      sender: {
        id: string;
      };
      recipient: {
        id: string;
      };
      timestamp: number;
      message?: {
        mid: string; // Message ID (preferred event ID for Facebook)
        text?: string;
      };
    }>;
  }>;
}

/**
 * WhatsApp webhook payload structure
 * Based on Meta Platform webhook format
 */
export interface WhatsAppWebhookPayload {
  object: 'whatsapp_business_account';
  entry: Array<{
    id: string;
    time: number;
    changes?: Array<{
      value: {
        messaging_product: string;
        metadata: {
          display_phone_number: string;
          phone_number_id: string;
        };
        messages?: Array<{
          id: string; // Message ID (preferred event ID for WhatsApp)
          from: string;
          timestamp: string;
          text?: {
            body: string;
          };
        }>;
      };
    }>;
  }>;
}

/**
 * Payment webhook payloads (Razorpay, PayPal) - minimal structure for queue
 */
export interface PaymentWebhookPayload {
  entity?: string;
  event?: string;
  event_type?: string;
  payload?: Record<string, unknown>;
  resource?: Record<string, unknown>;
}

/**
 * Union type for all webhook payloads
 */
export type WebhookPayload =
  | InstagramWebhookPayload
  | FacebookWebhookPayload
  | WhatsAppWebhookPayload
  | PaymentWebhookPayload;

// ============================================================================
// Verification Types
// ============================================================================

/**
 * Webhook signature verification result
 */
export interface WebhookVerificationResult {
  isValid: boolean;
  reason?: string; // Reason for failure (if invalid)
}

// ============================================================================
// Idempotency Types
// ============================================================================

// Note: WebhookIdempotency, WebhookStatus, InsertWebhookIdempotency, and UpdateWebhookIdempotency
// are all defined in database.ts - re-export them here for convenience
export type {
  WebhookIdempotency,
  WebhookStatus,
  InsertWebhookIdempotency,
  UpdateWebhookIdempotency,
} from './database';
