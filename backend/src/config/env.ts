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
  /**
   * Supabase project JWT secret (from Project Settings → API → JWT Secret).
   * Used by `services/supabase-jwt-mint.ts` (Plan 04 · Task 18) to sign
   * scoped patient + doctor JWTs for the text-consult Realtime channel.
   * Optional at startup — text-consult code-paths fail-fast at call time
   * with a clear error if missing, so non-text deployments (video-only,
   * pre-Plan-04) keep working without this var. Once Plan 04 ships in
   * production, treat this as effectively required.
   */
  SUPABASE_JWT_SECRET: z.string().min(16, 'SUPABASE_JWT_SECRET must be at least 16 chars when set').optional(),

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

  /**
   * Plan 01 · Task 16 — `sendConsultationReadyToPatient` dedup window.
   *
   * Second call into the helper for the same `consultation_sessions.id` within
   * this many seconds short-circuits with `FanOutResult { anySent: false,
   * channels: [], reason: 'recent_duplicate' }`. Default: 60s — long enough to
   * absorb double-fires from the post-session cron + manual launcher click,
   * short enough that a legitimate retry after a transient failure still ships.
   * Set to 0 to disable dedup entirely (not recommended in production).
   */
  CONSULTATION_READY_NOTIFY_DEDUP_SECONDS: z
    .string()
    .default('60')
    .transform((v) => Math.max(0, parseInt(v, 10) || 60)),

  /**
   * Plan 01 · Task 16 — base URL for the patient-facing prescription view used
   * by `sendPrescriptionReadyToPatient`. When set, the urgent-moment ping
   * includes a deep link `${PRESCRIPTION_VIEW_BASE_URL}/${prescriptionId}`.
   * When unset, the helper sends a URL-less ping ("your prescription is ready
   * — check your messages"); the existing `sendPrescriptionToPatient` already
   * delivered the content body so the patient still has the prescription.
   * No PDF infra is shipped in this task — Plan 02 / 07 own that.
   */
  PRESCRIPTION_VIEW_BASE_URL: z.string().url().optional(),

  /**
   * Plan 04 · Task 18 — patient-facing app base URL for the text-consult
   * join page (`/c/text/{sessionId}?token=...`). When set, the text adapter
   * builds the patient join URL using this base; when unset, the adapter
   * returns a token-only `JoinToken` (no `url`) and the fan-out helper
   * skips the text-modality CTA gracefully (logs + returns empty).
   *
   * Distinct from `CONSULTATION_JOIN_BASE_URL` (which today serves the
   * video flat-URL `?token=` shape) so we can migrate text to a clean
   * route convention without disrupting the live video flow. Once Plan 09
   * mid-consult switching ships, both modalities will likely converge on
   * `APP_BASE_URL` + per-modality path segments.
   */
  APP_BASE_URL: z.string().url().optional(),

  /**
   * Plan 04 · Task 18 — pre-consult cron lead time. Every minute the cron
   * picks up sessions whose `scheduled_start_at` is within this many
   * minutes of `now()` and provisions them via the facade. Default 5 min
   * is a happy medium between "too early — patient ignores the ping" and
   * "too late — patient misses the consult". Tune via env without deploy.
   */
  CONSULTATION_PRE_PING_LEAD_MINUTES: z
    .string()
    .default('5')
    .transform((v) => Math.max(1, Math.min(60, parseInt(v, 10) || 5))),

  /**
   * Plan 04 · Task 18 — text-consult JWT lifetime (minutes after the
   * session's scheduled end). Default 30 min — covers slot overrun + a
   * grace window for the patient to read the final transcript before the
   * token expires. Capped at 240 min so a misconfigured production env
   * doesn't mint multi-hour bearer tokens.
   */
  TEXT_CONSULT_JWT_TTL_MINUTES_AFTER_END: z
    .string()
    .default('30')
    .transform((v) => Math.max(5, Math.min(240, parseInt(v, 10) || 30))),

  /**
   * Plan 04 · Task 18 — per-sender per-session sliding-window message rate
   * limit. Defaults: 60 messages per 60-second window. The limiter is
   * **in-memory per backend pod** — with N pods the effective ceiling is
   * `60 × N` per minute. Acceptable for v1 (low pod count); promote to
   * Redis in a follow-up if traffic warrants.
   */
  CONSULTATION_MESSAGE_RATE_LIMIT_MAX: z
    .string()
    .default('60')
    .transform((v) => Math.max(1, parseInt(v, 10) || 60)),
  CONSULTATION_MESSAGE_RATE_LIMIT_WINDOW_SECONDS: z
    .string()
    .default('60')
    .transform((v) => Math.max(1, parseInt(v, 10) || 60)),

  /**
   * Plan 02 · Task 33 — soft-delete grace window for patient account
   * deletion, in days. `requestAccountDeletion` writes
   * `grace_window_until = now() + this many days`; the nightly cron finalizes
   * only after the cutoff passes, giving a patient a chance to log back in
   * and cancel. Default 7 days matches the doctrine locked in the task.
   *
   * `0` is accepted for tests (so the suite can exercise the finalize path
   * without waiting), but a production startup assertion (see
   * `assertProductionEnvSafety` below) fails fast if `NODE_ENV ===
   * 'production'` and this value is 0 — belt-and-suspenders because a
   * zero-day grace on a real deployment would let an accidentally-tapped
   * "delete my account" request finalize before the patient could
   * retract it.
   */
  ACCOUNT_DELETION_GRACE_DAYS: z
    .string()
    .default('7')
    .transform((v) => {
      const n = parseInt(v, 10);
      return Math.max(0, Number.isNaN(n) ? 7 : n);
    }),

  /**
   * Plan 02 · Task 34 — archival worker hard-delete kill switch.
   *
   * When `'true'`, the nightly archival cron's hard-delete phase actually
   * removes storage objects and stamps `hard_deleted_at` on
   * `recording_artifact_index`. When any other value (default `'false'`),
   * the hard-delete phase runs in dry-run mode only: it scans for
   * candidates and logs the structured `event: 'archival_dry_run',
   * phase: 'delete'` payload, but does not mutate anything.
   *
   * Shipped as `'false'` in production for the first 30 days post-deploy
   * — the ops runbook (see task-34-regulatory-retention-policy-and-
   * archival-worker.md Note 3) describes the flag-flip ritual once the
   * dry-run output has been stable and the seed policy values have been
   * legal-reviewed. The hide phase (reversible) is never gated by this
   * flag.
   */
  ARCHIVAL_HARD_DELETE_ENABLED: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),

  /**
   * Plan 02 · Task 34 — dry-run preview horizon.
   *
   * How many days of upcoming hide-phase and hard-delete-phase candidates
   * `GET /api/v1/admin/archival-preview` returns by default. Callers can
   * override per-request via `?days=N` up to a hard cap enforced in the
   * route. Increasing this is cheap (it widens the WHERE clause) but the
   * response payload grows linearly in candidates — 7 days is enough for
   * an ops weekly review cadence.
   */
  ARCHIVAL_DRY_RUN_REPORT_DAYS: z
    .string()
    .default('7')
    .transform((v) => {
      const n = parseInt(v, 10);
      return Math.max(1, Number.isNaN(n) ? 7 : n);
    }),

  // ==========================================================================
  // Plan 05 · Task 25 — Voice transcription pipeline
  // ==========================================================================
  /**
   * Deepgram Nova-2 API key. Required when `selectProvider` routes a Hindi /
   * Hinglish consult to Deepgram. If missing, `transcribeWithDeepgram`
   * throws a TranscriptionPermanentError at call time — the worker marks
   * the row `'failed'` (retry cannot recover from a missing credential).
   * Non-Hindi deployments (English-only) can leave this unset.
   */
  DEEPGRAM_API_KEY: z.string().optional(),

  /**
   * Master kill-switch for the post-consult transcription pipeline. When
   * `false`, `enqueueVoiceTranscription` is a no-op that logs and returns —
   * the voice adapter keeps working, just nothing lands in
   * `consultation_transcripts`. Used for staging environments without
   * provider credentials, and as an ops emergency brake if provider costs
   * spike.
   */
  VOICE_TRANSCRIPTION_ENABLED: z
    .string()
    .default('true')
    .transform((v) => v !== 'false' && v !== '0'),

  /**
   * Worker polling interval in seconds. The worker wakes, pulls up to
   * `VOICE_TRANSCRIPTION_WORKER_BATCH_SIZE` queued rows, and processes
   * them. Default 30s balances Composition-readiness latency (Twilio
   * finalises 5-30s after room close) against the feedback loop.
   */
  VOICE_TRANSCRIPTION_POLL_INTERVAL_SEC: z
    .string()
    .default('30')
    .transform((v) => {
      const n = parseInt(v, 10);
      return Math.max(5, Number.isNaN(n) ? 30 : n);
    }),

  /**
   * Max rows per worker tick. Small to keep the cron run bounded; the
   * worker runs frequently so throughput is `batch × (60 / poll)` per
   * minute.
   */
  VOICE_TRANSCRIPTION_WORKER_BATCH_SIZE: z
    .string()
    .default('25')
    .transform((v) => {
      const n = parseInt(v, 10);
      return Math.max(1, Math.min(100, Number.isNaN(n) ? 25 : n));
    }),

  /**
   * Retry cap before a row flips from `'queued'` to `'failed'`. The worker
   * increments `retry_count` on each transient-failure cycle. Backoff
   * table is hardcoded in `voice-transcription-worker.ts` (1m, 5m, 15m,
   * 1h, 6h) so a retry only fires once enough time has elapsed since the
   * last attempt — the cap is the second, belt-and-braces guard.
   */
  VOICE_TRANSCRIPTION_MAX_RETRIES: z
    .string()
    .default('5')
    .transform((v) => {
      const n = parseInt(v, 10);
      return Math.max(0, Number.isNaN(n) ? 5 : n);
    }),
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
 * Plan 02 · Task 33 — production-only env guardrails.
 *
 * Zod gets us type-level + default-value validation, but a few settings
 * have a *runtime* semantic that only matters in production: "this must
 * not be 0 on a real deployment". We collect those checks here, call
 * them once at module load, and let the process fail fast with a clear
 * message rather than boot into a subtly-broken configuration.
 *
 * Add new assertions sparingly — for a setting to belong here it should
 * be something where (a) the schema allows a value that breaks an
 * invariant only in production, and (b) we cannot reasonably express
 * the constraint in the schema itself (because tests rely on the
 * "unsafe" default).
 */
function assertProductionEnvSafety(): void {
  if (env.NODE_ENV !== 'production') return;

  if (env.ACCOUNT_DELETION_GRACE_DAYS === 0) {
    throw new Error(
      'ACCOUNT_DELETION_GRACE_DAYS must be > 0 in production. ' +
        'Zero-day grace means a single accidental tap on "delete my account" ' +
        'finalizes irreversibly before the patient can retract. Set to 7 ' +
        '(the task default) or higher. See task-33-account-deletion-revocation-list.md.',
    );
  }
}

assertProductionEnvSafety();

/**
 * Type for environment variables
 * Useful for TypeScript type checking
 */
export type Env = z.infer<typeof envSchema>;
