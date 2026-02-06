/**
 * Webhook Event ID Extraction Utilities
 *
 * Extracts unique event identifiers from webhook payloads for idempotency checking.
 * Uses platform-specific IDs when available, falls back to hash-based IDs when not.
 *
 * IMPORTANT:
 * - Event IDs are used for idempotency (prevent duplicate processing)
 * - Platform-specific IDs are preferred (more reliable)
 * - Fallback hash uses 5-minute timestamp buckets for consistency
 * - Normalization ensures same payload = same hash
 *
 * @see WEBHOOKS.md - Idempotency strategy
 */

import { createHash } from 'crypto';
import type {
  InstagramWebhookPayload,
  FacebookWebhookPayload,
  WhatsAppWebhookPayload,
} from '../types/webhook';

// ============================================================================
// Constants
// ============================================================================

const TIMESTAMP_BUCKET_MS = 300000; // 5 minutes in milliseconds

// ============================================================================
// Platform-Specific ID Extraction
// ============================================================================

/**
 * Extract Instagram page/object ID from webhook payload.
 *
 * For Instagram, entry[0].id is the page (object) ID that receives the message.
 * This value is stored in doctor_instagram.instagram_page_id when a doctor
 * connects their account. Used by webhook worker to resolve doctor_id.
 *
 * @see WEBHOOKS.md - Instagram idempotency uses entry[0].id
 * @see docs/Development/Daily-plans/2026-02-06/e-task-2-webhook-resolution-page-id-to-doctor-id.md
 */
export function getInstagramPageId(
  payload: InstagramWebhookPayload
): string | null {
  const id = payload.entry?.[0]?.id;
  return id != null ? String(id) : null;
}

/**
 * Extract Instagram event ID from webhook payload
 *
 * Instagram uses `entry[0].id` as the primary event identifier.
 *
 * @param payload - Instagram webhook payload
 * @returns Event ID if found, null otherwise
 *
 * @example
 * ```typescript
 * const eventId = extractInstagramEventId(req.body);
 * if (!eventId) {
 *   eventId = generateFallbackEventId(req.body);
 * }
 * ```
 */
export function extractInstagramEventId(
  payload: unknown
): string | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const instagramPayload = payload as InstagramWebhookPayload;

  // Check if this is an Instagram payload
  if (instagramPayload.object !== 'instagram') {
    return null;
  }

  // Extract entry ID (primary identifier for Instagram)
  if (
    instagramPayload.entry &&
    Array.isArray(instagramPayload.entry) &&
    instagramPayload.entry.length > 0 &&
    instagramPayload.entry[0]?.id
  ) {
    return String(instagramPayload.entry[0].id);
  }

  return null;
}

/**
 * Extract Facebook event ID from webhook payload
 *
 * Facebook uses `entry[0].messaging[0].message.mid` (message ID) as the primary identifier,
 * with `entry[0].id` (entry ID) as fallback.
 *
 * @param payload - Facebook webhook payload
 * @returns Event ID if found, null otherwise
 *
 * @example
 * ```typescript
 * const eventId = extractFacebookEventId(req.body);
 * if (!eventId) {
 *   eventId = generateFallbackEventId(req.body);
 * }
 * ```
 */
export function extractFacebookEventId(
  payload: unknown
): string | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const facebookPayload = payload as FacebookWebhookPayload;

  // Check if this is a Facebook payload
  if (facebookPayload.object !== 'page') {
    return null;
  }

  // Try to extract message ID (most reliable for Facebook)
  if (
    facebookPayload.entry &&
    Array.isArray(facebookPayload.entry) &&
    facebookPayload.entry.length > 0 &&
    facebookPayload.entry[0]?.messaging &&
    Array.isArray(facebookPayload.entry[0].messaging) &&
    facebookPayload.entry[0].messaging.length > 0 &&
    facebookPayload.entry[0].messaging[0]?.message?.mid
  ) {
    return String(facebookPayload.entry[0].messaging[0].message.mid);
  }

  // Fallback to entry ID
  if (
    facebookPayload.entry &&
    Array.isArray(facebookPayload.entry) &&
    facebookPayload.entry.length > 0 &&
    facebookPayload.entry[0]?.id
  ) {
    return String(facebookPayload.entry[0].id);
  }

  return null;
}

/**
 * Extract WhatsApp event ID from webhook payload
 *
 * WhatsApp uses `entry[0].changes[0].value.messages[0].id` (message ID) as the primary identifier.
 *
 * @param payload - WhatsApp webhook payload
 * @returns Event ID if found, null otherwise
 *
 * @example
 * ```typescript
 * const eventId = extractWhatsAppEventId(req.body);
 * if (!eventId) {
 *   eventId = generateFallbackEventId(req.body);
 * }
 * ```
 */
export function extractWhatsAppEventId(
  payload: unknown
): string | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const whatsappPayload = payload as WhatsAppWebhookPayload;

  // Check if this is a WhatsApp payload
  if (whatsappPayload.object !== 'whatsapp_business_account') {
    return null;
  }

  // Extract message ID (primary identifier for WhatsApp)
  if (
    whatsappPayload.entry &&
    Array.isArray(whatsappPayload.entry) &&
    whatsappPayload.entry.length > 0 &&
    whatsappPayload.entry[0]?.changes &&
    Array.isArray(whatsappPayload.entry[0].changes) &&
    whatsappPayload.entry[0].changes.length > 0 &&
    whatsappPayload.entry[0].changes[0]?.value?.messages &&
    Array.isArray(whatsappPayload.entry[0].changes[0].value.messages) &&
    whatsappPayload.entry[0].changes[0].value.messages.length > 0 &&
    whatsappPayload.entry[0].changes[0].value.messages[0]?.id
  ) {
    return String(whatsappPayload.entry[0].changes[0].value.messages[0].id);
  }

  return null;
}

// ============================================================================
// Fallback Hash Strategy
// ============================================================================

/**
 * Normalize payload for consistent hashing
 *
 * Removes timestamps, sorts keys, and removes whitespace to ensure
 * the same payload content produces the same hash regardless of formatting.
 *
 * @param payload - Webhook payload to normalize
 * @returns Normalized payload object
 */
function normalizePayload(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object') {
    return payload;
  }

  // Deep clone to avoid mutating original
  const cloned = JSON.parse(JSON.stringify(payload));

  // Recursively normalize object
  function normalize(obj: unknown): unknown {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(normalize);
    }

    // Remove timestamp fields (they vary but don't affect event uniqueness)
    const timestampFields = ['time', 'timestamp', 'created_at', 'updated_at', 'received_at'];
    const normalized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      // Skip timestamp fields
      if (timestampFields.includes(key)) {
        continue;
      }

      // Recursively normalize nested objects
      normalized[key] = normalize(value);
    }

    // Sort keys for consistent ordering
    const sorted: Record<string, unknown> = {};
    const sortedKeys = Object.keys(normalized).sort();
    for (const key of sortedKeys) {
      sorted[key] = normalized[key];
    }

    return sorted;
  }

  return normalize(cloned);
}

/**
 * Generate fallback event ID using hash strategy
 *
 * Creates a unique event ID by hashing the normalized payload combined with
 * a 5-minute timestamp bucket. This ensures:
 * - Same payload within 5 minutes = same hash (prevents false duplicates from retries)
 * - Different payloads = different hashes
 * - Consistent hashing regardless of payload formatting
 *
 * @param payload - Webhook payload to hash
 * @returns SHA-256 hash as event ID
 *
 * @example
 * ```typescript
 * const eventId = extractInstagramEventId(req.body) 
 *   || generateFallbackEventId(req.body);
 * ```
 *
 * @see WEBHOOKS.md - Fallback hash strategy
 */
export function generateFallbackEventId(payload: unknown): string {
  // 1. Normalize payload (remove timestamps, sort keys, remove whitespace)
  const normalized = normalizePayload(payload);

  // 2. Create timestamp bucket (5-minute window)
  // Groups similar webhooks within 5 minutes to prevent false positives from retries
  const timestampBucket = Math.floor(Date.now() / TIMESTAMP_BUCKET_MS);

  // 3. Hash normalized payload + timestamp bucket
  const hash = createHash('sha256')
    .update(JSON.stringify(normalized))
    .update(String(timestampBucket))
    .digest('hex');

  return hash;
}

/**
 * Extract event ID with automatic fallback
 *
 * Attempts platform-specific extraction first, falls back to hash if not available.
 *
 * @param payload - Webhook payload
 * @param provider - Webhook provider ('instagram', 'facebook', 'whatsapp')
 * @returns Event ID (platform-specific or fallback hash)
 *
 * @example
 * ```typescript
 * const eventId = extractEventId(req.body, 'instagram');
 * ```
 */
export function extractEventId(
  payload: unknown,
  provider: 'instagram' | 'facebook' | 'whatsapp'
): string {
  let eventId: string | null = null;

  // Try platform-specific extraction
  switch (provider) {
    case 'instagram':
      eventId = extractInstagramEventId(payload);
      break;
    case 'facebook':
      eventId = extractFacebookEventId(payload);
      break;
    case 'whatsapp':
      eventId = extractWhatsAppEventId(payload);
      break;
  }

  // Fallback to hash if platform ID not available
  if (!eventId) {
    eventId = generateFallbackEventId(payload);
  }

  return eventId;
}
