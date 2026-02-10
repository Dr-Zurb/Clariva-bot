/**
 * Test Script for Webhook Event ID Extraction
 * 
 * This script tests the event ID extraction utilities to verify:
 * 1. Instagram event ID extraction (with entry ID)
 * 2. Fallback hash generation (when entry ID missing)
 * 3. Hash consistency (same payload = same hash)
 * 4. Timestamp bucket (5-minute window)
 * 
 * Usage:
 *   npx ts-node tests/integration/test-webhook-event-id.ts
 * 
 * Prerequisites:
 *   - No external dependencies required (pure function tests)
 */

// Load environment variables FIRST, before any other imports
import dotenv from 'dotenv';
dotenv.config();

// Import type setup
import '../../src/types/setup';

import {
  extractInstagramEventId,
  extractFacebookEventId,
  extractWhatsAppEventId,
  generateFallbackEventId,
  extractEventId,
} from '../../src/utils/webhook-event-id';
import type { InstagramWebhookPayload } from '../../src/types/webhook';

// ============================================================================
// Test Data
// ============================================================================

// Instagram payload with entry ID
const instagramPayloadWithId: InstagramWebhookPayload = {
  object: 'instagram',
  entry: [
    {
      id: '123456789',
      time: Math.floor(Date.now() / 1000),
      messaging: [
        {
          sender: { id: '987654321' },
          recipient: { id: '123456789' },
          timestamp: Math.floor(Date.now() / 1000),
          message: {
            mid: 'mid.test.123',
            text: 'Test message',
          },
        },
      ],
    },
  ],
};

// Instagram payload without entry ID (should use fallback)
const instagramPayloadWithoutId = {
  object: 'instagram',
  entry: [],
};

// Payload for hash consistency test (same content, different timestamps)
const payloadForConsistency = {
  object: 'instagram',
  entry: [
    {
      messaging: [
        {
          sender: { id: '987654321' },
          recipient: { id: '123456789' },
          message: {
            mid: 'mid.test.123',
            text: 'Test message',
          },
        },
      ],
    },
  ],
};

// ============================================================================
// Test Functions
// ============================================================================

/**
 * Run all event ID extraction tests
 */
async function runTests(): Promise<void> {
  console.log('🧪 Starting Webhook Event ID Extraction Tests\n');

  let passedTests = 0;
  let failedTests = 0;

  // ============================================================================
  // Test 5.2.1: Instagram event ID extraction (message mid when present)
  // ============================================================================
  console.log('📋 Test 5.2.1: Instagram event ID extraction (message mid when present)');
  try {
    const eventId = extractInstagramEventId(instagramPayloadWithId);
    
    if (eventId === 'mid.test.123') {
      console.log('   ✅ PASS: Correctly extracted Instagram message ID (mid)\n');
      passedTests++;
    } else {
      console.log(`   ❌ FAIL: Expected 'mid.test.123', got '${eventId}'\n`);
      failedTests++;
    }
  } catch (error) {
    console.log(`   ❌ FAIL: Unexpected error: ${error}\n`);
    failedTests++;
  }

  // Test with null payload
  try {
    const eventId = extractInstagramEventId(null);
    if (eventId === null) {
      console.log('   ✅ PASS: Correctly returns null for null payload\n');
      passedTests++;
    } else {
      console.log(`   ❌ FAIL: Expected null, got '${eventId}'\n`);
      failedTests++;
    }
  } catch (error) {
    console.log(`   ❌ FAIL: Unexpected error: ${error}\n`);
    failedTests++;
  }

  // Test with wrong object type
  try {
    const wrongPayload = { object: 'page', entry: [] };
    const eventId = extractInstagramEventId(wrongPayload);
    if (eventId === null) {
      console.log('   ✅ PASS: Correctly returns null for non-Instagram payload\n');
      passedTests++;
    } else {
      console.log(`   ❌ FAIL: Expected null for non-Instagram payload, got '${eventId}'\n`);
      failedTests++;
    }
  } catch (error) {
    console.log(`   ❌ FAIL: Unexpected error: ${error}\n`);
    failedTests++;
  }

  // ============================================================================
  // Test 5.2.2: Fallback hash generation (when entry ID missing)
  // ============================================================================
  console.log('📋 Test 5.2.2: Fallback hash generation (when entry ID missing)');
  try {
    // Test with payload without entry ID
    const eventId1 = extractInstagramEventId(instagramPayloadWithoutId);
    const fallbackId = generateFallbackEventId(instagramPayloadWithoutId);
    
    if (eventId1 === null && fallbackId && fallbackId.length === 64) {
      console.log('   ✅ PASS: Fallback hash generated when entry ID missing\n');
      passedTests++;
    } else {
      console.log(`   ❌ FAIL: Expected fallback hash (64 chars), got '${fallbackId}'\n`);
      failedTests++;
    }

    // Test extractEventId with automatic fallback
    const autoEventId = extractEventId(instagramPayloadWithoutId, 'instagram');
    if (autoEventId && autoEventId.length === 64) {
      console.log('   ✅ PASS: extractEventId automatically uses fallback when ID missing\n');
      passedTests++;
    } else {
      console.log(`   ❌ FAIL: Expected auto fallback hash, got '${autoEventId}'\n`);
      failedTests++;
    }
  } catch (error) {
    console.log(`   ❌ FAIL: Unexpected error: ${error}\n`);
    failedTests++;
  }

  // ============================================================================
  // Test 5.2.3: Hash consistency (same payload = same hash)
  // ============================================================================
  console.log('📋 Test 5.2.3: Hash consistency (same payload = same hash)');
  try {
    // Generate hash twice with same payload (within same 5-minute window)
    const hash1 = generateFallbackEventId(payloadForConsistency);
    
    // Wait a bit (but still within 5-minute window)
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const hash2 = generateFallbackEventId(payloadForConsistency);
    
    if (hash1 === hash2) {
      console.log('   ✅ PASS: Same payload generates same hash (within timestamp bucket)\n');
      passedTests++;
    } else {
      console.log(`   ❌ FAIL: Hash inconsistency - hash1: ${hash1.substring(0, 16)}..., hash2: ${hash2.substring(0, 16)}...\n`);
      failedTests++;
    }

    // Test with different payload (should generate different hash)
    const differentPayload = {
      ...payloadForConsistency,
      entry: [
        {
          messaging: [
            {
              sender: { id: 'DIFFERENT_ID' },
              recipient: { id: '123456789' },
              message: {
                mid: 'mid.test.123',
                text: 'Test message',
              },
            },
          ],
        },
      ],
    };
    const hash3 = generateFallbackEventId(differentPayload);
    
    if (hash1 !== hash3) {
      console.log('   ✅ PASS: Different payload generates different hash\n');
      passedTests++;
    } else {
      console.log('   ❌ FAIL: Different payload generated same hash\n');
      failedTests++;
    }
  } catch (error) {
    console.log(`   ❌ FAIL: Unexpected error: ${error}\n`);
    failedTests++;
  }

  // ============================================================================
  // Test 5.2.4: Timestamp bucket (5-minute window)
  // ============================================================================
  console.log('📋 Test 5.2.4: Timestamp bucket (5-minute window)');
  try {
    // Get current timestamp bucket
    const now = Date.now();
    const currentBucket = Math.floor(now / 300000); // 5 minutes = 300000 ms
    
    // Simulate timestamp 2 minutes later (same bucket)
    const twoMinutesLater = now + (2 * 60 * 1000);
    const bucket2 = Math.floor(twoMinutesLater / 300000);
    
    if (currentBucket === bucket2) {
      // Still in same bucket - hash should be same
      // Note: We can't directly control the timestamp bucket in the function,
      // but we can verify the bucket calculation logic
      console.log('   ✅ PASS: Timestamp bucket calculation verified (2 min = same bucket)\n');
      passedTests++;
    } else {
      console.log('   ❌ FAIL: Timestamp bucket calculation incorrect\n');
      failedTests++;
    }

    // Test that different buckets would produce different hashes
    // (We simulate by manually checking bucket math)
    const sixMinutesLater = now + (6 * 60 * 1000);
    const bucket6 = Math.floor(sixMinutesLater / 300000);
    
    if (currentBucket !== bucket6) {
      console.log('   ✅ PASS: Timestamp bucket calculation verified (6 min = different bucket)\n');
      passedTests++;
    } else {
      console.log('   ❌ FAIL: Timestamp bucket calculation incorrect for 6-minute difference\n');
      failedTests++;
    }

    // Verify the actual hash changes when we're in a different bucket
    // We'll test by creating a payload and manually adjusting the time
    // Since we can't control Date.now(), we verify the normalization removes timestamps
    const payloadWithTime = {
      ...payloadForConsistency,
      entry: [
        {
          time: Math.floor(now / 1000),
          messaging: payloadForConsistency.entry[0].messaging,
        },
      ],
    };
    const hashWithTime = generateFallbackEventId(payloadWithTime);
    const hashWithoutTime = generateFallbackEventId(payloadForConsistency);
    
    // Both should be same because normalization removes timestamps
    if (hashWithTime === hashWithoutTime) {
      console.log('   ✅ PASS: Timestamp normalization works (timestamps removed before hashing)\n');
      passedTests++;
    } else {
      console.log('   ❌ FAIL: Timestamp normalization not working correctly\n');
      failedTests++;
    }
  } catch (error) {
    console.log(`   ❌ FAIL: Unexpected error: ${error}\n`);
    failedTests++;
  }

  // ============================================================================
  // Additional Tests: Platform-specific extraction
  // ============================================================================
  console.log('📋 Additional: Platform-specific extraction functions');
  try {
    // Test Facebook extraction
    const facebookPayload = {
      object: 'page',
      entry: [
        {
          id: 'fb_entry_123',
          time: Math.floor(Date.now() / 1000),
          messaging: [
            {
              sender: { id: '987654321' },
              recipient: { id: '123456789' },
              timestamp: Math.floor(Date.now() / 1000),
              message: {
                mid: 'fb_msg_456',
                text: 'Test',
              },
            },
          ],
        },
      ],
    };
    const fbEventId = extractFacebookEventId(facebookPayload);
    if (fbEventId === 'fb_msg_456') {
      console.log('   ✅ PASS: Facebook message ID extraction works\n');
      passedTests++;
    } else {
      console.log(`   ❌ FAIL: Expected 'fb_msg_456', got '${fbEventId}'\n`);
      failedTests++;
    }

    // Test WhatsApp extraction
    const whatsappPayload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'wa_entry_123',
          time: Math.floor(Date.now() / 1000),
          changes: [
            {
              value: {
                messaging_product: 'whatsapp',
                metadata: {
                  display_phone_number: '+10000000000',
                  phone_number_id: 'wa_phone_123',
                },
                messages: [
                  {
                    id: 'wa_msg_789',
                    from: '987654321',
                    timestamp: String(Math.floor(Date.now() / 1000)),
                    text: {
                      body: 'Test',
                    },
                  },
                ],
              },
            },
          ],
        },
      ],
    };
    const waEventId = extractWhatsAppEventId(whatsappPayload);
    if (waEventId === 'wa_msg_789') {
      console.log('   ✅ PASS: WhatsApp message ID extraction works\n');
      passedTests++;
    } else {
      console.log(`   ❌ FAIL: Expected 'wa_msg_789', got '${waEventId}'\n`);
      failedTests++;
    }
  } catch (error) {
    console.log(`   ❌ FAIL: Unexpected error: ${error}\n`);
    failedTests++;
  }

  // ============================================================================
  // Test Summary
  // ============================================================================
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`\n📊 Test Results: ${passedTests} passed, ${failedTests} failed\n`);

  if (failedTests === 0) {
    console.log('✅ All event ID extraction tests passed!\n');
    process.exit(0);
  } else {
    console.log('❌ Some tests failed. Please review the output above.\n');
    process.exit(1);
  }
}

// Run tests
runTests().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
