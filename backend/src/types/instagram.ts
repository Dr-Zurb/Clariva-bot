/**
 * Instagram API Type Definitions
 *
 * TypeScript types for Instagram Graph API integration.
 * Used by Instagram service for sending messages and handling API responses.
 *
 * IMPORTANT:
 * - Message content may contain PHI - never log message content
 * - Types match Instagram Graph API v18.0 structure
 * - Error types match Meta Platform error format
 */

// ============================================================================
// Instagram API Request Types
// ============================================================================

/**
 * Instagram send message request payload
 * Used for POST /{page-id}/messages endpoint
 */
export interface InstagramSendMessageRequest {
  recipient: {
    id: string; // Instagram user ID (recipient)
  };
  message: {
    text: string; // Message text (may contain PHI)
  };
}

/**
 * Instagram send message response
 * Success response from Instagram Graph API
 */
export interface InstagramSendMessageResponse {
  recipient_id: string; // Instagram user ID
  message_id: string; // Instagram message ID
}

// ============================================================================
// Instagram API Error Types
// ============================================================================

/**
 * Instagram API error structure
 * Error response format from Instagram Graph API
 */
export interface InstagramApiError {
  error: {
    message: string; // Error message
    type: string; // Error type (e.g., 'OAuthException', 'GraphMethodException')
    code: number; // Error code (e.g., 190, 4, 100)
    error_subcode?: number; // Optional error subcode (e.g., 463)
    fbtrace_id?: string; // Facebook trace ID for debugging
  };
}

// ============================================================================
// Instagram Message Types (for webhook payloads)
// ============================================================================

/**
 * Instagram message structure
 * Used for parsing webhook payloads (already defined in webhook.ts)
 * Re-exported here for convenience
 */
export type { InstagramWebhookPayload } from './webhook';

/**
 * Instagram message entry
 * Extracted from webhook payload for easier access
 */
export interface InstagramMessage {
  id: string; // Entry ID
  time: number; // Unix timestamp
  messaging?: Array<{
    sender: {
      id: string; // Instagram user ID (sender)
    };
    recipient: {
      id: string; // Instagram page ID (recipient)
    };
    timestamp: number; // Message timestamp
    message?: {
      mid: string; // Message ID
      text?: string; // Message text (may contain PHI)
    };
  }>;
}
