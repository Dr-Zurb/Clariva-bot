/**
 * Test Script for Webhook Idempotency Service
 * 
 * This script tests the webhook idempotency service functions to verify:
 * 1. isWebhookProcessed (existing and non-existing records)
 * 2. markWebhookProcessing (insert and update)
 * 3. markWebhookProcessed (status update)
 * 4. markWebhookFailed (error handling and retry count)
 * 
 * Usage:
 *   npx ts-node tests/integration/test-webhook-idempotency.ts
 * 
 * Prerequisites:
 *   - Migration 001_initial_schema.sql must be executed in Supabase
 *   - SUPABASE_SERVICE_ROLE_KEY must be set in .env file
 *   - Database connection must be available
 */

// Load environment variables FIRST, before any other imports
import dotenv from 'dotenv';
dotenv.config();

// Import type setup
import '../../src/types/setup';

import {
  isWebhookProcessed,
  markWebhookProcessing,
  markWebhookProcessed,
  markWebhookFailed,
} from '../../src/services/webhook-idempotency-service';
import { getSupabaseAdminClient } from '../../src/config/database';

// Generate unique test identifiers
const correlationId = `test-${Date.now()}-${Math.random().toString(36).substring(7)}`;
const eventId = `evt_test_${Date.now()}_${Math.random().toString(36).substring(7)}`;
const provider: 'instagram' = 'instagram';

/**
 * Cleanup test data from database
 */
async function cleanupTestData(): Promise<void> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    console.warn('⚠️  Cannot cleanup: Service role client not available');
    return;
  }

  try {
    await supabase
      .from('webhook_idempotency')
      .delete()
      .eq('event_id', eventId)
      .eq('provider', provider);
    
    console.log(`\n🧹 Cleaned up test data (event_id: ${eventId})\n`);
  } catch (error) {
    console.warn(`⚠️  Cleanup warning: ${error}`);
  }
}

/**
 * Run all idempotency service tests
 */
async function runTests(): Promise<void> {
  console.log('🧪 Starting Webhook Idempotency Service Tests\n');
  console.log(`Correlation ID: ${correlationId}`);
  console.log(`Event ID: ${eventId}`);
  console.log(`Provider: ${provider}\n`);

  // Check if service role client is available
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    console.error('❌ ERROR: Service role client not available');
    console.error('   Please set SUPABASE_SERVICE_ROLE_KEY in .env file.');
    process.exit(1);
  }

  let passedTests = 0;
  let failedTests = 0;

  try {
    // ============================================================================
    // Test 5.3.1: isWebhookProcessed (existing and non-existing)
    // ============================================================================
    console.log('📋 Test 5.3.1: isWebhookProcessed (existing and non-existing)');
    
    // Test with non-existing record
    try {
      const result = await isWebhookProcessed(eventId, provider);
      if (result === null) {
        console.log('   ✅ PASS: Non-existing record correctly returns null\n');
        passedTests++;
      } else {
        console.log(`   ❌ FAIL: Expected null, got: ${JSON.stringify(result)}\n`);
        failedTests++;
      }
    } catch (error) {
      console.log(`   ❌ FAIL: Unexpected error: ${error}\n`);
      failedTests++;
    }

    // Create a record first for testing existing record
    try {
      await markWebhookProcessing(eventId, provider, correlationId);
      const existing = await isWebhookProcessed(eventId, provider);
      
      if (existing && existing.event_id === eventId && existing.provider === provider) {
        console.log('   ✅ PASS: Existing record correctly returned with all fields\n');
        passedTests++;
        
        // Verify status is 'pending'
        if (existing.status === 'pending') {
          console.log('   ✅ PASS: Existing record has correct status (pending)\n');
          passedTests++;
        } else {
          console.log(`   ❌ FAIL: Expected status 'pending', got '${existing.status}'\n`);
          failedTests++;
        }
      } else {
        console.log(`   ❌ FAIL: Existing record not found or incorrect\n`);
        failedTests++;
      }
    } catch (error) {
      console.log(`   ❌ FAIL: Error creating test record: ${error}\n`);
      failedTests++;
    }

    // ============================================================================
    // Test 5.3.2: markWebhookProcessing (insert and update)
    // ============================================================================
    console.log('📋 Test 5.3.2: markWebhookProcessing (insert and update)');
    
    // Test insert (new record)
    try {
      const newEventId = `evt_test_new_${Date.now()}`;
      const result = await markWebhookProcessing(newEventId, provider, correlationId);
      
      if (result && result.event_id === newEventId && result.status === 'pending') {
        console.log('   ✅ PASS: markWebhookProcessing correctly inserts new record\n');
        passedTests++;
        
        // Cleanup
        await supabase
          .from('webhook_idempotency')
          .delete()
          .eq('event_id', newEventId);
      } else {
        console.log(`   ❌ FAIL: Insert failed or incorrect data\n`);
        failedTests++;
      }
    } catch (error) {
      console.log(`   ❌ FAIL: Error testing insert: ${error}\n`);
      failedTests++;
    }

    // Test update (existing record - upsert behavior)
    try {
      // Record should already exist from previous test
      const result = await markWebhookProcessing(eventId, provider, correlationId);
      
      if (result && result.event_id === eventId && result.status === 'pending') {
        console.log('   ✅ PASS: markWebhookProcessing correctly updates existing record\n');
        passedTests++;
      } else {
        console.log(`   ❌ FAIL: Update failed or incorrect data\n`);
        failedTests++;
      }
    } catch (error) {
      console.log(`   ❌ FAIL: Error testing update: ${error}\n`);
      failedTests++;
    }

    // ============================================================================
    // Test 5.3.3: markWebhookProcessed (status update)
    // ============================================================================
    console.log('📋 Test 5.3.3: markWebhookProcessed (status update)');
    
    try {
      // Ensure record exists and is in 'pending' state
      await markWebhookProcessing(eventId, provider, correlationId);
      
      // Mark as processed
      const result = await markWebhookProcessed(eventId, provider);
      
      if (result && result.status === 'processed' && result.processed_at) {
        console.log('   ✅ PASS: markWebhookProcessed correctly updates status to processed\n');
        passedTests++;
        
        // Verify processed_at is set
        if (result.processed_at instanceof Date) {
          console.log('   ✅ PASS: processed_at timestamp is correctly set\n');
          passedTests++;
        } else {
          console.log(`   ❌ FAIL: processed_at not set or incorrect type\n`);
          failedTests++;
        }
      } else {
        console.log(`   ❌ FAIL: Status update failed or incorrect\n`);
        failedTests++;
      }
    } catch (error) {
      console.log(`   ❌ FAIL: Error testing markWebhookProcessed: ${error}\n`);
      failedTests++;
    }

    // ============================================================================
    // Test 5.3.4: markWebhookFailed (error handling)
    // ============================================================================
    console.log('📋 Test 5.3.4: markWebhookFailed (error handling)');
    
    try {
      // Create a new record for failure testing
      const failedEventId = `evt_test_failed_${Date.now()}`;
      await markWebhookProcessing(failedEventId, provider, correlationId);
      
      // Mark as failed
      const errorMessage = 'Test error: Processing failed';
      const result = await markWebhookFailed(failedEventId, provider, errorMessage);
      
      if (result && result.status === 'failed' && result.error_message === errorMessage) {
        console.log('   ✅ PASS: markWebhookFailed correctly updates status to failed\n');
        passedTests++;
        
        // Verify error_message is stored
        if (result.error_message === errorMessage) {
          console.log('   ✅ PASS: Error message is correctly stored\n');
          passedTests++;
        } else {
          console.log(`   ❌ FAIL: Error message not stored correctly\n`);
          failedTests++;
        }
        
        // Verify retry_count is incremented
        if (result.retry_count === 1) {
          console.log('   ✅ PASS: retry_count is correctly incremented to 1\n');
          passedTests++;
        } else {
          console.log(`   ❌ FAIL: Expected retry_count 1, got ${result.retry_count}\n`);
          failedTests++;
        }
        
        // Test retry_count increment on second failure
        const result2 = await markWebhookFailed(failedEventId, provider, 'Second error');
        if (result2 && result2.retry_count === 2) {
          console.log('   ✅ PASS: retry_count correctly increments on subsequent failures\n');
          passedTests++;
        } else {
          console.log(`   ❌ FAIL: retry_count not incremented correctly (expected 2, got ${result2?.retry_count})\n`);
          failedTests++;
        }
        
        // Cleanup
        await supabase
          .from('webhook_idempotency')
          .delete()
          .eq('event_id', failedEventId);
      } else {
        console.log(`   ❌ FAIL: markWebhookFailed did not work correctly\n`);
        failedTests++;
      }
    } catch (error) {
      console.log(`   ❌ FAIL: Error testing markWebhookFailed: ${error}\n`);
      failedTests++;
    }

    // ============================================================================
    // Test Summary
    // ============================================================================
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`\n📊 Test Results: ${passedTests} passed, ${failedTests} failed\n`);

    if (failedTests === 0) {
      console.log('✅ All idempotency service tests passed!\n');
    } else {
      console.log('❌ Some tests failed. Please review the output above.\n');
    }

    // Cleanup test data
    await cleanupTestData();

    process.exit(failedTests === 0 ? 0 : 1);
  } catch (error) {
    console.error('Fatal error:', error);
    await cleanupTestData();
    process.exit(1);
  }
}

// Run tests
runTests().catch(async (error) => {
  console.error('Fatal error:', error);
  await cleanupTestData();
  process.exit(1);
});
