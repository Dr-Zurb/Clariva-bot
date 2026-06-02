/**
 * Encryption Utilities
 *
 * Provides AES-256-GCM encryption/decryption for sensitive data.
 * Used for encrypting webhook payloads in dead letter queue (contains PHI/PII).
 *
 * IMPORTANT:
 * - Uses AES-256-GCM (authenticated encryption)
 * - Encryption key must be 32 bytes (256 bits)
 * - Key stored in environment variables (ENCRYPTION_KEY)
 * - Never log encrypted or decrypted payloads (contains PHI/PII)
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { env } from '../config/env';
import { InternalError } from './errors';
import { logger } from '../config/logger';

// ============================================================================
// Constants
// ============================================================================

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits for GCM (recommended)
const TAG_LENGTH = 16; // 128 bits for authentication tag
const KEY_LENGTH = 32; // 256 bits for AES-256

// ============================================================================
// Encryption Functions
// ============================================================================

/**
 * Get encryption key from environment
 *
 * @returns Encryption key as Buffer (32 bytes)
 * @throws InternalError if key is missing or invalid
 */
function getEncryptionKey(): Buffer {
  if (!env.ENCRYPTION_KEY) {
    throw new InternalError('ENCRYPTION_KEY environment variable is required for encryption');
  }

  try {
    // Decode base64 key
    const key = Buffer.from(env.ENCRYPTION_KEY, 'base64');
    
    // Validate key length
    if (key.length !== KEY_LENGTH) {
      throw new InternalError(
        `Encryption key must be ${KEY_LENGTH} bytes (${KEY_LENGTH * 8} bits). Got ${key.length} bytes.`
      );
    }
    
    return key;
  } catch (error) {
    logger.error({ error }, 'Failed to decode encryption key');
    throw new InternalError('Invalid encryption key format (must be base64-encoded)');
  }
}

/**
 * Encrypt payload using AES-256-GCM
 *
 * Encrypts a string payload and returns a base64-encoded string containing:
 * - IV (initialization vector)
 * - Authentication tag
 * - Encrypted data
 *
 * Format: base64(iv + tag + encryptedData)
 *
 * @param payload - Plaintext payload to encrypt (string)
 * @param correlationId - Request correlation ID for error logging
 * @returns Base64-encoded encrypted payload
 * @throws InternalError if encryption fails
 *
 * @example
 * ```typescript
 * const encrypted = await encryptPayload(JSON.stringify({ data: 'sensitive' }), correlationId);
 * ```
 */
export function encryptPayload(payload: string, correlationId: string): string {
  try {
    const key = getEncryptionKey();
    
    // Generate random IV (initialization vector)
    const iv = randomBytes(IV_LENGTH);
    
    // Create cipher
    const cipher = createCipheriv(ALGORITHM, key, iv);
    
    // Encrypt payload
    let encrypted = cipher.update(payload, 'utf8');
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    
    // Get authentication tag
    const tag = cipher.getAuthTag();
    
    // Combine IV + tag + encrypted data
    const combined = Buffer.concat([iv, tag, encrypted]);
    
    // Return as base64 string
    return combined.toString('base64');
  } catch (error) {
    // Log error (without payload - contains PHI)
    logger.error(
      { error, correlationId, algorithm: ALGORITHM },
      'Failed to encrypt payload'
    );
    
    // Re-throw as InternalError
    if (error instanceof InternalError) {
      throw error;
    }
    throw new InternalError('Encryption failed');
  }
}

/**
 * Decrypt payload using AES-256-GCM
 *
 * Decrypts a base64-encoded encrypted payload and returns the plaintext.
 *
 * Format: base64(iv + tag + encryptedData)
 *
 * @param encryptedPayload - Base64-encoded encrypted payload
 * @param correlationId - Request correlation ID for error logging
 * @returns Decrypted plaintext payload (string)
 * @throws InternalError if decryption fails
 *
 * @example
 * ```typescript
 * const decrypted = await decryptPayload(encrypted, correlationId);
 * const payload = JSON.parse(decrypted);
 * ```
 */
export function decryptPayload(encryptedPayload: string, correlationId: string): string {
  try {
    const key = getEncryptionKey();
    
    // Decode base64
    const combined = Buffer.from(encryptedPayload, 'base64');
    
    // Extract IV, tag, and encrypted data
    const iv = combined.subarray(0, IV_LENGTH);
    const tag = combined.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const encrypted = combined.subarray(IV_LENGTH + TAG_LENGTH);
    
    // Create decipher
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    
    // Decrypt payload
    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    
    // Return as UTF-8 string
    return decrypted.toString('utf8');
  } catch (error) {
    // Log error (without payload - contains PHI)
    logger.error(
      { error, correlationId, algorithm: ALGORITHM },
      'Failed to decrypt payload'
    );
    
    // Re-throw as InternalError
    if (error instanceof InternalError) {
      throw error;
    }
    throw new InternalError('Decryption failed (invalid key or corrupted data)');
  }
}
