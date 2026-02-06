/**
 * Test Script for Webhook Signature Verification
 * 
 * This script tests the verifyInstagramSignature function to verify:
 * 1. Valid signature returns true
 * 2. Invalid signature returns false
 * 3. Missing header returns false
 * 4. Malformed signature format returns false
 * 
 * Usage:
 *   npx ts-node tests/integration/test-webhook-verification.ts
 * 
 * Prerequisites:
 *   - INSTAGRAM_APP_SECRET must be set in .env file
 */

// Load environment variables FIRST, before any other imports
import dotenv from 'dotenv';
dotenv.config();

// Import type setup
import '../../src/types/setup';

import { verifyInstagramSignature } from '../../src/utils/webhook-verification';
import { createHmac } from 'crypto';
import { env } from '../../src/config/env';

// Test configuration
const correlationId = `test-${Date.now()}-${Math.random().toString(36).substring(7)}`;

// Sample webhook payload (as it would appear in raw request body)
const testPayload = JSON.stringify({
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
});

// Convert to Buffer (as it would be in Express raw body)
const rawBody = Buffer.from(testPayload, 'utf-8');

/**
 * Generate a valid signature for testing
 */
function generateValidSignature(body: Buffer, secret: string): string {
  const hash = createHmac('sha256', secret)
    .update(body)
    .digest('hex');
  return `sha256=${hash}`;
}

/**
 * Run all signature verification tests
 */
async function runTests(): Promise<void> {
  console.log('🧪 Starting Webhook Signature Verification Tests\n');
  console.log(`Correlation ID: ${correlationId}\n`);

  // Check if app secret is configured
  if (!env.INSTAGRAM_APP_SECRET) {
    console.error('❌ ERROR: INSTAGRAM_APP_SECRET not configured in .env file');
    console.error('   Please set INSTAGRAM_APP_SECRET to run these tests.');
    process.exit(1);
  }

  let passedTests = 0;
  let failedTests = 0;

  // ============================================================================
  // Test 5.1.1: Valid signature (should return true)
  // ============================================================================
  console.log('📋 Test 5.1.1: Valid signature (should return true)');
  try {
    const validSignature = generateValidSignature(rawBody, env.INSTAGRAM_APP_SECRET!);
    const result = verifyInstagramSignature(validSignature, rawBody, correlationId);
    
    if (result === true) {
      console.log('   ✅ PASS: Valid signature correctly returns true\n');
      passedTests++;
    } else {
      console.log('   ❌ FAIL: Valid signature returned false (expected true)\n');
      failedTests++;
    }
  } catch (error) {
    console.log(`   ❌ FAIL: Unexpected error: ${error}\n`);
    failedTests++;
  }

  // ============================================================================
  // Test 5.1.2: Invalid signature (should return false)
  // ============================================================================
  console.log('📋 Test 5.1.2: Invalid signature (should return false)');
  try {
    // Generate signature with wrong secret
    const wrongSecret = 'wrong_secret_' + env.INSTAGRAM_APP_SECRET;
    const invalidSignature = generateValidSignature(rawBody, wrongSecret);
    const result = verifyInstagramSignature(invalidSignature, rawBody, correlationId);
    
    if (result === false) {
      console.log('   ✅ PASS: Invalid signature correctly returns false\n');
      passedTests++;
    } else {
      console.log('   ❌ FAIL: Invalid signature returned true (expected false)\n');
      failedTests++;
    }
  } catch (error) {
    console.log(`   ❌ FAIL: Unexpected error: ${error}\n`);
    failedTests++;
  }

  // ============================================================================
  // Test 5.1.3: Missing header (should return false)
  // ============================================================================
  console.log('📋 Test 5.1.3: Missing header (should return false)');
  try {
    const result = verifyInstagramSignature(undefined, rawBody, correlationId);
    
    if (result === false) {
      console.log('   ✅ PASS: Missing header correctly returns false\n');
      passedTests++;
    } else {
      console.log('   ❌ FAIL: Missing header returned true (expected false)\n');
      failedTests++;
    }
  } catch (error) {
    console.log(`   ❌ FAIL: Unexpected error: ${error}\n`);
    failedTests++;
  }

  // ============================================================================
  // Test 5.1.4: Malformed signature format (should return false)
  // ============================================================================
  console.log('📋 Test 5.1.4: Malformed signature format (should return false)');
  try {
    // Test various malformed formats
    const malformedSignatures = [
      'invalid_signature',           // No prefix
      'sha1=abc123',                 // Wrong algorithm prefix
      'sha256=',                     // Empty hash
      'sha256:abc123',               // Wrong separator (colon instead of equals)
      'abc123',                      // Just hash, no prefix
    ];

    let allPassed = true;
    for (const malformed of malformedSignatures) {
      const result = verifyInstagramSignature(malformed, rawBody, correlationId);
      if (result !== false) {
        console.log(`   ❌ FAIL: Malformed signature "${malformed}" returned true (expected false)`);
        allPassed = false;
      }
    }

    if (allPassed) {
      console.log('   ✅ PASS: All malformed signature formats correctly return false\n');
      passedTests++;
    } else {
      console.log('   ❌ FAIL: Some malformed signatures did not return false\n');
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
    console.log('✅ All signature verification tests passed!\n');
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
