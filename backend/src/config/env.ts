import { z } from 'zod';

/**
 * Environment Variable Schema
 * 
 * Validates all environment variables at startup using Zod
 * Server will fail fast if required variables are missing or invalid
 * 
 * MUST: No raw process.env.X anywhere except this file
 */

const envSchema = z.object({
  // Node Environment
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  
  // Server Configuration
  PORT: z.string().default('3000').transform(Number),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  
  // Supabase Configuration
  SUPABASE_URL: z.string().url('Invalid Supabase URL'),
  SUPABASE_ANON_KEY: z.string().min(1, 'Supabase anonymous key is required'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'Supabase service role key is required'),
  
  // OpenAI Configuration (optional - only if using OpenAI)
  OPENAI_API_KEY: z.string().optional(),
  
  // Twilio Configuration (optional - only if using Twilio)
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_PHONE_NUMBER: z.string().optional(),
  
  // Add more environment variables as needed
});

/**
 * Validated environment variables
 * 
 * This object contains all validated environment variables
 * Use this instead of process.env directly
 * 
 * Example:
 * ```typescript
 * import { env } from '../config/env';
 * const port = env.PORT; // ✅ GOOD
 * 
 * // ❌ BAD - Never do this:
 * const port = process.env.PORT;
 * ```
 */
export const env = envSchema.parse(process.env);

/**
 * Type for environment variables
 * Useful for TypeScript type checking
 */
export type Env = z.infer<typeof envSchema>;
