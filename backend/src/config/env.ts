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
  // e-task-5: Max message pairs (user+assistant) for AI context; trade-off: more context vs token cost
  AI_MAX_HISTORY_PAIRS: z
    .string()
    .default('8')
    .transform((v): number => {
      const n = parseInt(v, 10);
      return Math.min(15, Math.max(3, Number.isNaN(n) ? 8 : n));
    }),
  // RBH-19 Phase 2: optional short LLM line after deterministic fee block (mid-collection). Default off (latency/cost).
  AI_DM_REPLY_BRIDGE_ENABLED: z
    .string()
    .optional()
    .transform((v) => v === 'true' || v === '1'),

  // Twilio Configuration (optional - only if using Twilio)
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_PHONE_NUMBER: z.string().optional(),
  // Twilio Video (teleconsultation): API Key for access tokens. Create in Twilio Console (US1 region).
  TWILIO_API_KEY_SID: z.string().optional(),
  TWILIO_API_KEY_SECRET: z.string().optional(),

  // Instagram Configuration (optional - only required when Instagram webhook integration is active)
  // Made optional to allow server startup during setup phase
  INSTAGRAM_APP_ID: z.string().optional(),
  INSTAGRAM_APP_SECRET: z.string().optional(),
  // Meta App Secret (fallback - same as App Secret in Meta Dashboard; some setups use META_APP_SECRET)
  META_APP_SECRET: z.string().optional(),
  INSTAGRAM_ACCESS_TOKEN: z.string().optional(),
  INSTAGRAM_WEBHOOK_VERIFY_TOKEN: z.string().optional(), // Should be at least 32 characters when provided
  // OAuth connect flow (e-task-3): redirect URI for Meta callback; required when using connect endpoint
  INSTAGRAM_REDIRECT_URI: z.string().url().optional(),
  // After successful connect, redirect browser here (e.g. https://app.example.com/dashboard/settings/instagram); if unset, callback returns JSON
  INSTAGRAM_FRONTEND_REDIRECT_URI: z.string().url().optional(),

  // Encryption Configuration (required for dead letter queue payload encryption)
  ENCRYPTION_KEY: z.string().min(32, 'Encryption key must be at least 32 characters').optional(), // Base64-encoded 32-byte key (256 bits for AES-256)

  // Redis / Queue Configuration (optional - queue disabled when not set)
  REDIS_URL: z.string().optional(),
  WEBHOOK_WORKER_CONCURRENCY: z.string().default('5').transform(Number),

  // Availability / Slot Configuration (Phase 0 - optional with defaults)
  SLOT_INTERVAL_MINUTES: z.string().default('30').transform(Number),
  AVAILABLE_SLOTS_MAX_FUTURE_DAYS: z.string().default('90').transform(Number),
  /** Queue-mode OPD: default consult length (minutes) when no rolling telemetry yet (e-task-opd-03). */
  OPD_QUEUE_DEFAULT_CONSULT_MINUTES: z.string().default('10').transform(Number),

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
  // Appointment fee fallback when doctor has no settings (optional; doctors should set fee in Booking Rules)
  APPOINTMENT_FEE_MINOR: z.string().optional().transform((v) => (v ? parseInt(v, 10) : 0)),
  APPOINTMENT_FEE_CURRENCY: z.string().default('INR'),

  // Notifications (e-task-5 - email via Resend)
  RESEND_API_KEY: z.string().optional(),
  // Doctor email for notifications when not in auth (MVP fallback)
  DEFAULT_DOCTOR_EMAIL: z.string().email().optional(),

  // Booking slot picker (e-task-3 - external page URL; token auth)
  BOOKING_TOKEN_SECRET: z.string().min(16, 'At least 16 chars for HMAC').optional(),
  BOOKING_PAGE_URL: z.string().url().optional(),

  // Teleconsultation (e-task-3 - patient join link; signed token auth)
  CONSULTATION_TOKEN_SECRET: z.string().min(16, 'At least 16 chars for HMAC').optional(),
  CONSULTATION_JOIN_BASE_URL: z.string().url().optional(),
  // Teleconsultation (e-task-4 - Twilio status callbacks). Backend base URL (e.g. https://api.onrender.com).
  WEBHOOK_BASE_URL: z.string().url().optional(),
  // Min consultation duration (seconds) to mark as verified for payout (Consultation Verification v2)
  MIN_VERIFIED_CONSULTATION_SECONDS: z
    .string()
    .default('60')
    .transform((v) => Math.max(60, parseInt(v, 10) || 60)),

  // Platform Fee (monetization - migration 022)
  // Percent fee when amount >= threshold; flat fee when amount < threshold.
  PLATFORM_FEE_PERCENT: z
    .string()
    .default('5')
    .transform((v) => Math.min(100, Math.max(0, parseInt(v, 10) || 5))),
  PLATFORM_FEE_FLAT_MINOR: z
    .string()
    .default('2500')
    .transform((v) => Math.max(0, parseInt(v, 10) || 2500)), // ₹25 in paise
  PLATFORM_FEE_THRESHOLD_MINOR: z
    .string()
    .default('50000')
    .transform((v) => Math.max(0, parseInt(v, 10) || 50000)), // ₹500 in paise
  PLATFORM_FEE_GST_PERCENT: z
    .string()
    .default('18')
    .transform((v) => Math.min(100, Math.max(0, parseInt(v, 10) || 18))),

  // Cron jobs (e-task-5): secret for securing payout cron endpoint. Render cron hits POST /cron/payouts.
  CRON_SECRET: z.string().min(16, 'CRON_SECRET must be at least 16 chars when set').optional(),

  /**
   * e-task-dm-06: min classify confidence (0–1) to trust `pricing_signal` / `fee_thread_continuation`
   * for DM routing; below this, regex / keyword fallbacks apply.
   */
  DM_CLASSIFIER_PRICING_SIGNAL_MIN_CONFIDENCE: z
    .string()
    .optional()
    .transform((v) => {
      if (v === undefined || v === '') return 0.62;
      const n = parseFloat(v);
      if (!Number.isFinite(n)) return 0.62;
      return Math.min(1, Math.max(0, n));
    }),

  /**
   * When true (default), post-medical payment-existence ack is localized from canonical EN via OpenAI.
   * Set false for airgapped tests or to force English-only without an API call.
   */
  POST_MEDICAL_ACK_AI_LOCALIZE: z
    .string()
    .optional()
    .transform((v) => !(v === 'false' || v === '0')),

  /**
   * When true (default, unset env): reason-first “noted reasons” / confirm snippets use OpenAI JSON extraction
   * (`resolveVisitReasonSnippetForTriage`). Set false only for tests or cost debugging — not as the primary
   * way to handle new patient phrasings (see AI_BOT_BUILDING_PHILOSOPHY.md).
   */
  VISIT_REASON_SNIPPET_AI_ENABLED: z
    .string()
    .optional()
    .transform((v) => !(v === 'false' || v === '0')),

  /**
   * When true (default), clinical-led fee DMs that would defer to staff for ambiguous catalog match
   * first try `matchServiceCatalogOffering` (LLM allowlist) once before showing the deferral block.
   */
  FEE_DM_CATALOG_LLM_NARROW_ENABLED: z
    .string()
    .optional()
    .transform((v) => !(v === 'false' || v === '0')),

  /**
   * When true (default), book_for_someone_else flows that lack a regex kin match call OpenAI once
   * for a short English relation label (e.g. grandmother, child, friend).
   */
  BOOKING_RELATION_LLM_ENABLED: z
    .string()
    .optional()
    .transform((v) => !(v === 'false' || v === '0')),

  /**
   * learn-02: write service_match_learning_examples on staff confirm/reassign.
   * Set false to disable ingest without deploy rollback.
   */
  SERVICE_MATCH_LEARNING_INGEST_ENABLED: z
    .string()
    .optional()
    .transform((v) => !(v === 'false' || v === '0')),

  /**
   * learn-03: compute and store shadow suggestion when a pending staff review row is created.
   */
  SHADOW_LEARNING_ENABLED: z
    .string()
    .optional()
    .transform((v) => !(v === 'false' || v === '0')),

  /** learn-04: min reassignment count per pattern to suggest policy (RPC + job). */
  LEARNING_POLICY_MIN_RESOLUTIONS: z
    .string()
    .default('5')
    .transform((v) => Math.max(1, parseInt(v, 10) || 5)),

  /** learn-04: rolling window (days) for stability RPC. */
  LEARNING_POLICY_WINDOW_DAYS: z
    .string()
    .default('30')
    .transform((v) => Math.max(1, parseInt(v, 10) || 30)),

  /** learn-04: default snooze duration when doctor snoozes a suggestion. */
  LEARNING_POLICY_SNOOZE_DAYS: z
    .string()
    .default('14')
    .transform((v) => Math.min(365, Math.max(1, parseInt(v, 10) || 14))),

  /** learn-04: send Resend email when a new suggestion is created (optional; in-app is primary). */
  LEARNING_POLICY_SUGGESTION_EMAIL_ENABLED: z
    .string()
    .optional()
    .transform((v) => v === 'true' || v === '1'),

  /**
   * learn-05: when true (default), apply enabled `service_match_autobook_policies` to skip staff review
   * when structured pattern matches. Set false for instant kill switch.
   */
  LEARNING_AUTOBOOK_ENABLED: z
    .string()
    .optional()
    .transform((v) => !(v === 'false' || v === '0')),

  /**
   * Plan service-catalog-matcher-routing-v2 · Task 10 (preview widget, Phase 4 hybrid).
   * Gates the dev-facing `POST /api/v1/catalog/preview-match` endpoint that lets
   * a doctor (or us during dev) paste a sample patient message and see which
   * Stage (A — instant rules, or B — assistant) won, without sending a real
   * Instagram DM. Default behavior:
   *   - unset / `'auto'` → enabled when `NODE_ENV !== 'production'`
   *   - `'true'` / `'1'` → force-enable (e.g. enable on a staging build)
   *   - `'false'` / `'0'` → force-disable
   * The route never logs raw input beyond the matcher's existing PHI redaction
   * (`redactPhiForAI`) and is auth-gated by `authenticateToken` regardless.
   */
  CATALOG_PREVIEW_MATCH_ENABLED: z
    .string()
    .optional()
    .transform((v) => {
      if (v === undefined || v === '' || v === 'auto') return undefined;
      return v === 'true' || v === '1';
    }),

  /**
   * Plan 03 · Task 11 (legacy `appointment_fee_minor` deprecation, Phase 1).
   * When true, `warnDeprecation()` emits a once-per-process structured log line
   * for each classified legacy call site so developers notice migration work.
   * Default false — production stays quiet while Phase 2 migrations are in
   * flight. Flip `true` in dev/staging only.
   * See `docs/Development/Architecture/legacy-appointment-fee-minor-deprecation.md`.
   */
  DEPRECATION_WARNINGS_ENABLED: z
    .string()
    .optional()
    .transform((v) => v === 'true' || v === '1'),
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
