import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from './env';
import { logger } from './logger';

/**
 * Database Configuration
 * 
 * This file handles Supabase database connection setup and initialization.
 * It creates clients for both normal operations (anon key) and admin operations (service role key).
 * 
 * Security Notes:
 * - Anon key: Safe for client-side use, respects Row Level Security (RLS)
 * - Service role key: Server-side only, bypasses RLS - must be kept secret
 * 
 * MUST: Use validated env from config/env.ts (not raw process.env) - see STANDARDS.md
 */

// Step 1: Get environment variables from validated config
const supabaseUrl = env.SUPABASE_URL;
const supabaseAnonKey = env.SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

// Step 2: Environment variables are already validated by config/env.ts
// No need to check here - env.ts will throw if required vars are missing

// Step 3: Create Supabase clients
/**
 * Supabase client for normal operations (uses anon key)
 * 
 * This client respects Row Level Security (RLS) policies.
 * Use this for most database operations.
 */
export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false, // Server-side: don't persist sessions
  },
});

/**
 * Supabase admin client for server-side operations (uses service role key)
 * 
 * This client bypasses Row Level Security (RLS) policies.
 * Use only for admin operations on the server-side.
 * 
 * ⚠️ SECURITY WARNING: Never expose this key to client-side code!
 */
export const supabaseAdmin: SupabaseClient | null = supabaseServiceRoleKey
  ? createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        persistSession: false, // Server-side: don't persist sessions
      },
    })
  : null;

/**
 * Test database connection
 * 
 * Performs a simple query to verify the database is accessible.
 * Uses a lightweight query that will fail gracefully if tables don't exist yet,
 * but will indicate connection/auth failures.
 * 
 * @returns {Promise<boolean>} True if connection successful, false otherwise
 */
export async function testConnection(): Promise<boolean> {
  try {
    // Attempt a simple query to test connection
    // We use a non-existent table name - if connection works, we'll get a "relation does not exist" error
    // If connection/auth fails, we'll get network/auth errors
    const { error } = await supabase.from('_connection_test').select('*').limit(0);
    
    if (error) {
      // Network/connection errors indicate connection failure
      if (error.message.includes('Failed to fetch') || 
          error.message.includes('Network') ||
          error.message.includes('ECONNREFUSED') ||
          error.message.includes('timeout') ||
          error.message.includes('getaddrinfo')) {
        logger.error({ error: error.message }, 'Database connection test failed - cannot reach database');
        return false;
      }
      
      // Authentication errors indicate wrong credentials
      if (error.message.includes('JWT') || 
          error.message.includes('invalid') ||
          error.message.includes('unauthorized') ||
          error.message.includes('Invalid API key')) {
        logger.error({ error: error.message }, 'Database connection test failed - authentication error');
        return false;
      }
      
      // "Relation does not exist" error is OK - connection works, just no tables yet
      // This means the database is reachable and authentication works
      if (error.message.includes('relation') || 
          error.message.includes('does not exist') ||
          error.message.includes('permission denied for schema')) {
        // Connection successful - table just doesn't exist yet (this is expected)
        return true;
      }
      
      // For any other error, log it but assume connection works (to be safe)
      logger.warn({ error: error.message }, 'Database connection test - unexpected error (assuming connection OK)');
      return true;
    }
    
    // No error means connection is successful
    return true;
  } catch (error) {
    // Catch any unexpected errors
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // Network errors mean connection failed
    if (errorMessage.includes('fetch') || 
        errorMessage.includes('network') ||
        errorMessage.includes('ECONNREFUSED') ||
        errorMessage.includes('timeout')) {
      logger.error({ error: errorMessage }, 'Database connection test failed - network error');
      return false;
    }
    
    // Other errors - log but don't fail (might be environment-specific)
    logger.error({ error: errorMessage }, 'Database connection test - unexpected error');
    return false;
  }
}

/**
 * Initialize database connection
 * 
 * Tests the database connection and throws an error if it fails.
 * Call this function when the server starts to ensure database is accessible.
 * 
 * @throws {Error} If database connection fails
 */
export async function initializeDatabase(): Promise<void> {
  const isConnected = await testConnection();
  
  if (!isConnected) {
    throw new Error(
      'Failed to connect to Supabase database. ' +
      'Please check your SUPABASE_URL and SUPABASE_ANON_KEY in your .env file.'
    );
  }
  
  logger.info('✅ Database connected successfully');
}

/**
 * Get Supabase client for normal operations
 * 
 * @returns {SupabaseClient} Supabase client instance
 */
export function getSupabaseClient(): SupabaseClient {
  return supabase;
}

/**
 * Get Supabase admin client for server-side operations
 * 
 * ⚠️ SECURITY WARNING: This client bypasses RLS - use only on server-side!
 * 
 * @returns {SupabaseClient | null} Supabase admin client instance, or null if service role key not configured
 */
export function getSupabaseAdminClient(): SupabaseClient | null {
  return supabaseAdmin;
}
