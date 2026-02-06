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

  // OpenAI Configuration (optional at startup; required when AI features are invoked)
  // AI routes or worker MUST fail fast if key is missing when calling OpenAI (see config/openai.ts)
  OPENAI_API_KEY: z.string().optional(),
  // Model identifier for audit metadata and cost tracking (COMPLIANCE.md G, EXTERNAL_SERVICES.md)
  OPENAI_MODEL: z.string().optional(),
  // Max tokens for output; enforces token limits and cost control (Task 2)
  OPENAI_MAX_TOKENS: z
    .string()
    .optional()
    .transform((v) => (v !== undefined && v !== '' ? parseInt(v, 10) : undefined)),

  // Twilio Configuration (optional - only if using Twilio)
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_PHONE_NUMBER: z.string().optional(),

  // Doctor/Conversation (MVP single-tenant: one doctor for all webhook conversations)
  DEFAULT_DOCTOR_ID: z.string().uuid().optional(),

  // Instagram Configuration (optional - only required when Instagram webhook integration is active)
  // Made optional to allow server startup during setup phase
  INSTAGRAM_APP_ID: z.string().optional(),
  INSTAGRAM_APP_SECRET: z.string().optional(),
  INSTAGRAM_ACCESS_TOKEN: z.string().optional(),
  INSTAGRAM_WEBHOOK_VERIFY_TOKEN: z.string().optional(), // Should be at least 32 characters when provided
  INSTAGRAM_PAGE_ID: z.string().optional(), // Optional, for reference

  // Encryption Configuration (required for dead letter queue payload encryption)
  ENCRYPTION_KEY: z.string().min(32, 'Encryption key must be at least 32 characters').optional(), // Base64-encoded 32-byte key (256 bits for AES-256)

  // Redis / Queue Configuration (optional - queue disabled when not set)
  REDIS_URL: z.string().optional(),
  WEBHOOK_WORKER_CONCURRENCY: z.string().default('5').transform(Number),

  // Availability / Slot Configuration (Phase 0 - optional with defaults)
  SLOT_INTERVAL_MINUTES: z.string().default('30').transform(Number),
  AVAILABLE_SLOTS_MAX_FUTURE_DAYS: z.string().default('90').transform(Number),

  // Payment Gateways (e-task-4 - Razorpay India, PayPal International)
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  PAYPAL_CLIENT_ID: z.string().optional(),
  PAYPAL_CLIENT_SECRET: z.string().optional(),
  PAYPAL_WEBHOOK_ID: z.string().optional(),
  PAYPAL_MODE: z.enum(['sandbox', 'live']).default('sandbox'),
  // Default doctor country for MVP (IN = India -> Razorpay; US/UK/EU -> PayPal)
  DEFAULT_DOCTOR_COUNTRY: z.string().default('IN'),
  // Appointment fee for Phase 0 (fixed amount in smallest unit; e.g. 50000 = ₹500 or $500.00)
  APPOINTMENT_FEE_MINOR: z.string().default('50000').transform(Number),
  APPOINTMENT_FEE_CURRENCY: z.string().default('INR'),

  // Notifications (e-task-5 - email via Resend)
  RESEND_API_KEY: z.string().optional(),
  // Doctor email for notifications when not in auth (MVP fallback)
  DEFAULT_DOCTOR_EMAIL: z.string().email().optional(),
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
