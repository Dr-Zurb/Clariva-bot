/**
 * Consultation Session Types (Plan 01 · Task 15 · Decision 8 LOCKED)
 *
 * Modality-blind shape used by the new `consultation-session-service.ts`
 * facade. Plans 04 (text) and 05 (voice) ship adapters that satisfy
 * `ConsultationSessionAdapter`; today only the video adapter
 * (`videoSessionTwilioAdapter` in `services/video-session-twilio.ts`) is
 * registered.
 *
 * Lifecycle pointer:
 *   booking → facade.createSession() → adapter.createSession() → DB row
 *           → adapter.getJoinToken() → participant joins
 *           → Twilio/provider webhook → verification-service updates row
 *           → facade.endSession() / status webhook → row marked 'ended'
 *
 * **No PHI** — only opaque IDs, ISO timestamps, enum values. Safe for
 * structured logs.
 */

// ============================================================================
// Enums (mirror the Postgres ENUMs in migration 049)
// ============================================================================

/** Modality of consultation. Mirrors `consultation_modality` ENUM. */
export type Modality = 'text' | 'voice' | 'video';

/** Lifecycle status. Mirrors `consultation_status` ENUM. */
export type SessionStatus =
  | 'scheduled'
  | 'live'
  | 'ended'
  | 'no_show'
  | 'cancelled';

/**
 * Provider string is intentionally free-text (TEXT in SQL) so a future
 * `whatsapp` / `pstn` / `supabase_realtime` adapter can register without a
 * schema bump. Narrowed to a union here for compile-time safety on the
 * adapters we actually ship; widen with new entries as plans land.
 */
export type Provider =
  | 'twilio_video'        // Plan 01 (this task)
  | 'twilio_video_audio'  // Plan 05 — voice via Twilio Video audio-only mode
  | 'supabase_realtime';  // Plan 04 — text

// ============================================================================
// Shapes that flow across the facade boundary
// ============================================================================

/**
 * Input to `consultationSession.createSession()`. The facade computes
 * `expectedEndAt` defensively when the caller can't (no `duration_minutes`
 * column on `appointments` today — see Plan 01 task notes).
 */
export interface CreateSessionInput {
  appointmentId: string;
  doctorId: string;
  /**
   * Nullable to match `appointments.patient_id` (guest bookings without a
   * linked patient row). Adapters that need a patient identity (e.g. Twilio
   * Video uses `patient-{appointmentId}`) derive it from `appointmentId`.
   */
  patientId: string | null;
  modality: Modality;
  scheduledStartAt: Date;
  expectedEndAt: Date;
  /**
   * Plan 02 (Task 27) ships the source-of-truth column on `appointments`
   * and threads it through here. Until then this is always `undefined` and
   * the facade persists `NULL`.
   */
  recordingConsentAtBook?: boolean;
}

/**
 * Returned by adapters and re-returned by the facade so callers (controllers,
 * frontend `/start` endpoint) have everything needed to hand the doctor
 * a join URL and the patient a signed deep-link.
 */
export interface SessionRecord {
  /** UUID of the `consultation_sessions` row. */
  id: string;
  appointmentId: string;
  doctorId: string;
  patientId: string | null;
  modality: Modality;
  status: SessionStatus;
  provider: Provider;
  /**
   * Adapter-specific session id (Twilio Video room SID for video; future
   * PSTN call SID; Supabase Realtime channel name for text). May be
   * `undefined` for adapters that mint it lazily on first join.
   */
  providerSessionId?: string;
  scheduledStartAt: Date;
  expectedEndAt: Date;
  /**
   * Companion text channel surface for voice + video sessions (Plan 06 ·
   * Task 36 · Decision 9 LOCKED).
   *
   * Populated by the `createSession` lifecycle hook via
   * `text-session-supabase.provisionCompanionChannel` whenever a fresh
   * `consultation_sessions` row is inserted for `modality: 'voice'` or
   * `'video'`. Undefined for text-modality sessions (the chat IS the
   * consult — no separate companion surface) and undefined on the
   * facade's idempotent early-return path (the first `createSession`
   * call minted + returned it; subsequent callers pick it up from the
   * HTTP response that was surfaced at create-time).
   *
   * Also undefined when companion provisioning failed — the facade logs
   * loudly and continues; callers (Tasks 38 + 24c) render a "Chat
   * unavailable" notice in that case. Frontend code that consumes this
   * field MUST handle the undefined branch.
   *
   * The shape mirrors what `POST /start` / `POST /start-voice` surfaces
   * in their HTTP response so the doctor's `<ConsultationLauncher>` and
   * the patient's consult-ready fan-out can hand it to `<TextConsultRoom>`
   * later when Tasks 38 + 24c mount it inside the room.
   */
  companion?: {
    /**
     * `consultation_sessions.id` — the canonical session UUID that the
     * frontend's `<TextConsultRoom>` uses for its Realtime + RLS queries.
     * Echoed here (rather than re-derived from `patientJoinUrl`) so the
     * doctor-side mount, which uses dashboard auth (no HMAC URL), still
     * knows which session row to chat against. Task 38's `<VideoRoom>`
     * companion panel reads this directly.
     */
    sessionId: string;
    /**
     * Fully-qualified patient-facing join URL — same `/c/text/{sessionId}?t={hmac}`
     * shape as the primary text-modality URL, so the patient's side-panel
     * chat surface uses the exact same route + token-exchange flow. Null
     * when `APP_BASE_URL` is unset or when the helper couldn't mint the
     * HMAC consultation-token (missing `CONSULTATION_TOKEN_SECRET`).
     */
    patientJoinUrl: string | null;
    /**
     * The HMAC consultation-token embedded in `patientJoinUrl` as `?t=...`.
     * Surfaced separately so automated callers (ops scripts, tests, future
     * backfill jobs) can reconstruct the URL or verify the token without
     * re-parsing the URL. NOT the Supabase JWT — the JWT is only minted
     * in-memory by the text-token exchange controller on page load
     * (JWTs-in-URLs leak via referrers / link previews; see
     * `text-session-supabase.buildPatientJoinUrl` doc for the rationale).
     */
    patientToken: string | null;
    /**
     * ISO timestamp matching the text adapter's `getJoinToken` contract
     * (`expected_end_at + TEXT_CONSULT_JWT_TTL_MINUTES_AFTER_END`). This
     * is the Supabase-JWT expiry the eventual token-exchange will use —
     * the HMAC consultation-token embedded in the URL carries its own
     * 24h expiry per `generateConsultationToken`.
     */
    expiresAt: string;
  };
}

/**
 * Returned by `getJoinToken()`. Token shape is provider-specific (Twilio
 * Video JWT for video/voice; Supabase JWT for text) — callers should treat
 * it as opaque.
 *
 * `url` is **adapter-controlled** when populated — text adapter (Plan 04 ·
 * Task 18) returns the full patient-facing join URL because the route
 * shape (`/c/text/{sessionId}?token=...`) embeds the session id in the
 * path, which the caller doesn't have. Video adapter leaves `url`
 * undefined and the caller (notification fan-out) builds the URL via
 * `env.CONSULTATION_JOIN_BASE_URL`. New adapters: prefer populating `url`
 * to keep URL-shape decisions inside the adapter.
 */
export interface JoinToken {
  token: string;
  expiresAt: Date;
  /** Optional fully-qualified join URL — see field doc. */
  url?: string;
}

// ============================================================================
// Adapter contract — every modality implementation satisfies this
// ============================================================================

/**
 * Per-modality adapter contract. Adapters are stateless; the facade owns
 * the `consultation_sessions` row lifecycle. Adapters only own the
 * provider-side (Twilio room, Supabase channel, etc.).
 *
 * Conventions:
 *   - `createSession` provisions the provider-side resource and returns
 *     enough metadata for the facade to persist the DB row.
 *   - `endSession` tears down the provider-side resource. Idempotent.
 *   - `getJoinToken` mints a participant join token; identity convention
 *     is `doctor-{doctorId}` / `patient-{appointmentId}` (preserved from
 *     the legacy `consultation-room-service.ts` API so existing webhook
 *     identity parsing continues to work).
 */
export interface ConsultationSessionAdapter {
  readonly modality: Modality;
  readonly provider: Provider;

  createSession(
    input: CreateSessionInput,
    correlationId: string
  ): Promise<AdapterCreateResult>;

  endSession(
    providerSessionId: string,
    correlationId: string
  ): Promise<void>;

  getJoinToken(
    input: AdapterGetJoinTokenInput,
    correlationId: string
  ): Promise<JoinToken>;
}

/**
 * Adapter return shape from `createSession`. The facade enriches this with
 * the persisted row id and returns a `SessionRecord` to its callers.
 */
export interface AdapterCreateResult {
  /**
   * Provider-side session id. For video this is the Twilio room SID; for
   * text it will be the Supabase channel name; etc. May be `undefined` if
   * the adapter mints lazily on first join (none today).
   */
  providerSessionId?: string;
}

/**
 * What an adapter needs to mint a join token. The facade resolves the
 * session row and passes through the bits the adapter cares about.
 *
 * `sessionId` was added in Plan 04 · Task 18 — the text adapter needs the
 * `consultation_sessions.id` UUID for both the JWT's `session_id` claim
 * (custom-claim RLS in migration 052) and the route URL
 * (`/c/text/{sessionId}?token=...`). It's optional in the type because
 * `getJoinTokenForAppointment` (the lazy-write bridge) may not have a
 * persisted row yet — in that case the adapter must either resolve it
 * itself or refuse with a clear error. Video adapter ignores it.
 */
export interface AdapterGetJoinTokenInput {
  appointmentId: string;
  doctorId: string;
  role: 'doctor' | 'patient';
  /** Provider-assigned session id, if already known. */
  providerSessionId?: string;
  /** `consultation_sessions.id` if a row exists; populated by the facade. */
  sessionId?: string;
}
