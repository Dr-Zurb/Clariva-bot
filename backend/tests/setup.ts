/**
 * Jest Test Setup
 * 
 * Global test configuration and mocks
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error'; // Set log level for tests
process.env.INSTAGRAM_ACCESS_TOKEN = 'test-access-token';
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_ANON_KEY = 'test-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
// Payment gateway test placeholders (e-task-4)
process.env.RAZORPAY_KEY_ID = 'rzp_test_FAKE';
process.env.RAZORPAY_KEY_SECRET = 'FAKE_SECRET';
process.env.PAYPAL_CLIENT_ID = 'FAKE_CLIENT_ID';
process.env.PAYPAL_CLIENT_SECRET = 'FAKE_CLIENT_SECRET';
process.env.PAYPAL_MODE = 'sandbox';
process.env.DEFAULT_DOCTOR_COUNTRY = 'IN';