/**
 * Notification fan-out types (Plan 01 · Task 16)
 *
 * Shared between `notification-service.ts`'s urgent-moment fan-out helpers
 * (`sendConsultationReadyToPatient`, `sendPrescriptionReadyToPatient`) and
 * any downstream consumer that wants per-channel telemetry — Plans 04 (text
 * consult), 05 (voice consult), 07 (post-session worker).
 *
 * Naming: "fan-out" refers to the parallel-not-cascade dispatch pattern
 * (`Promise.allSettled` across SMS + email + IG DM). Existing helpers in
 * `notification-service.ts` use a cascade pattern (try SMS, fall back to
 * email, fall back to IG, return on first success) — that pattern returns
 * `boolean` and is intentionally kept distinct. See task-16 for the rationale.
 */

/**
 * Channels the v1 fan-out can attempt. WhatsApp + push are deliberately
 * absent (master plan deferral). New channels must be added here AND wired
 * into both fan-out helpers' channel-resolution + dispatch sections.
 */
export type FanOutChannel = 'sms' | 'email' | 'instagram_dm';

/**
 * Per-channel outcome shape. Discriminated on `status` so consumers can
 * `switch` over the union without optional-property drift.
 *
 *   - `'sent'`     — provider accepted the message. `providerMessageId` is
 *                    populated when the underlying sender exposes it
 *                    (Instagram returns one; SMS / email may or may not).
 *   - `'skipped'`  — the channel was not attempted because of a deterministic
 *                    pre-flight gate (no recipient on file, channel disabled
 *                    via env, patient opted out). Distinct from `'failed'`
 *                    so dashboards can spot "we never had a phone number"
 *                    vs "Twilio rejected".
 *   - `'failed'`   — the channel was attempted and the provider rejected
 *                    (or threw, or returned `false` from a low-level helper).
 *                    `error` carries the short string for grouping; the full
 *                    error is logged elsewhere.
 */
export type FanOutChannelOutcome =
  | { channel: FanOutChannel; status: 'sent';    providerMessageId?: string }
  | {
      channel: FanOutChannel;
      status:  'skipped';
      reason:  'no_recipient' | 'channel_disabled' | 'patient_opted_out';
    }
  | { channel: FanOutChannel; status: 'failed';  error: string };

/**
 * Aggregate result of a single fan-out invocation. Always returned (the
 * fan-out helpers never throw — they swallow per-channel failures and surface
 * them via `channels[].status === 'failed'`).
 *
 *   - `sessionOrPrescriptionId` — the resource-id passed in by the caller.
 *     Naming is intentionally generic so the same shape works for both
 *     `sendConsultationReadyToPatient` (consultation_sessions.id) and
 *     `sendPrescriptionReadyToPatient` (prescriptions.id).
 *   - `attemptedAt` — ISO timestamp of the moment the fan-out started, NOT
 *     the moment a specific channel completed. Same value across all
 *     channels, useful for log grouping.
 *   - `channels` — per-channel outcomes, one entry per attempted channel.
 *     Empty array when the fan-out short-circuited (see `reason`).
 *   - `anySent` — true iff at least one channel returned `'sent'`. `'skipped'`
 *     does NOT count as sent. Useful as a one-glance success signal.
 *   - `reason` — populated only when the fan-out short-circuits BEFORE any
 *     channel is attempted. Today the only such reason is
 *     `'recent_duplicate'` (dedup window inside
 *     `sendConsultationReadyToPatient`). Per-channel skip reasons live on
 *     the individual outcome, not here.
 */
export type FanOutResult = {
  sessionOrPrescriptionId: string;
  attemptedAt:             string;
  channels:                FanOutChannelOutcome[];
  anySent:                 boolean;
  reason?:                 'recent_duplicate';
};
