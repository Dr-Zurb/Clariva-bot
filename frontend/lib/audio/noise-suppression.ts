/**
 * Sub-batch C · task-voice-C9 — background-noise suppression.
 *
 * Voice consults pick up clinic background noise (typing, fan, traffic).
 * Twilio Video 2.27+ ships first-party noise-cancellation hooks that
 * accept a Krisp or RNNoise WASM bundle served from the same origin,
 * driven by `createLocalAudioTrack({ noiseCancellationOptions: { ... } })`.
 *
 * Vendor decision (plan §9 LOCKED):
 *   - **Krisp**, behind a **per-doctor opt-in toggle defaulted ON**.
 *   - Same toggle exposed on the patient side (Decision §9 explicitly
 *     calls out "Doctors with quiet clinics can turn it off if it adds
 *     latency" — same rationale applies to patients in office vs.
 *     bedroom environments).
 *   - Preference persisted to `localStorage` (`voice-noise-suppression-enabled`);
 *     no doctor-settings table extension in v1 per task spec
 *     ("localStorage works for v1").
 *
 * Runtime asset path:
 *   The Krisp WASM bundle must be served at a same-origin path (CORS
 *   constraint on `WebAssembly.instantiateStreaming`). Operators
 *   configure it via `NEXT_PUBLIC_NOISE_SUPPRESSION_ASSETS_PATH` (e.g.
 *   `/krisp`). When unset, the feature is silently unavailable — the
 *   toggle still flips state for telemetry/preference parity, but
 *   `createLocalAudioTrack` is called without `noiseCancellationOptions`
 *   so Twilio doesn't attempt to load missing assets. This is the
 *   "graceful degrade" path called out in the task acceptance criteria
 *   ("Krisp plugin failure handled gracefully — call still works
 *   without suppression").
 *
 * PHI hygiene:
 *   This module never logs message bodies or session identifiers. The
 *   non-prod warn-level logs only emit the vendor name + boolean state.
 *
 * @see frontend/components/consultation/VoiceConsultRoom.tsx (mount site)
 * @see frontend/components/consultation/VoiceConsultPreCall.tsx (precall toggle)
 * @see docs/Work/Daily-plans/April 2026/28-04-2026/Tasks/voice/task-voice-C9-noise-suppression.md
 */

import type {
  LocalAudioTrack,
  NoiseCancellationOptions,
  NoiseCancellationVendor,
} from "twilio-video";

/** localStorage key — shared by doctor + patient mounts (decision §9). */
export const NOISE_SUPPRESSION_STORAGE_KEY = "voice-noise-suppression-enabled";

/** Default vendor when none is configured at runtime. */
const DEFAULT_VENDOR: NoiseCancellationVendor = "krisp";

/** Per-spec, defaulted ON for both doctor and patient mounts. */
export const NOISE_SUPPRESSION_DEFAULT_ENABLED = true;

const VALID_VENDORS: readonly NoiseCancellationVendor[] = ["krisp", "rnnoise"];

function isValidVendor(value: string): value is NoiseCancellationVendor {
  return (VALID_VENDORS as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Runtime config (env-driven)
// ---------------------------------------------------------------------------

export interface NoiseSuppressionRuntimeConfig {
  /**
   * Same-origin path to the WASM/JS bundle. Returned as `null` when the
   * operator has NOT staged the assets — feature is unavailable.
   *
   * Example: `"/krisp"` or `"/static/noise-suppression/krisp"`.
   */
  sdkAssetsPath: string | null;
  /** Vendor identifier passed to Twilio (`"krisp" | "rnnoise"`). */
  vendor: NoiseCancellationVendor;
}

/**
 * Resolve the runtime config from environment variables.
 *
 * Reads `NEXT_PUBLIC_NOISE_SUPPRESSION_ASSETS_PATH` (required for
 * feature availability) and `NEXT_PUBLIC_NOISE_SUPPRESSION_VENDOR`
 * (optional override; defaults to `"krisp"`).
 *
 * The env object can be overridden for tests via the optional arg —
 * production callers should pass nothing.
 */
export function resolveNoiseSuppressionConfig(
  env: Record<string, string | undefined> = (typeof process !== "undefined" &&
  process.env
    ? process.env
    : {}) as Record<string, string | undefined>,
): NoiseSuppressionRuntimeConfig {
  const rawPath = env.NEXT_PUBLIC_NOISE_SUPPRESSION_ASSETS_PATH ?? "";
  const trimmedPath = typeof rawPath === "string" ? rawPath.trim() : "";
  const sdkAssetsPath = trimmedPath.length > 0 ? trimmedPath : null;

  const rawVendor = env.NEXT_PUBLIC_NOISE_SUPPRESSION_VENDOR ?? "";
  const trimmedVendor =
    typeof rawVendor === "string" ? rawVendor.trim().toLowerCase() : "";
  const vendor: NoiseCancellationVendor =
    trimmedVendor.length > 0 && isValidVendor(trimmedVendor)
      ? trimmedVendor
      : DEFAULT_VENDOR;

  return { sdkAssetsPath, vendor };
}

/**
 * `true` when the operator has staged a same-origin WASM bundle. When
 * `false`, callers should hide the toggle (or render it disabled with a
 * "coming soon" tooltip) so doctors don't see a non-functional control.
 */
export function isNoiseSuppressionAvailable(
  config: NoiseSuppressionRuntimeConfig = resolveNoiseSuppressionConfig(),
): boolean {
  return Boolean(config.sdkAssetsPath);
}

/**
 * Build the `noiseCancellationOptions` value to hand to
 * `createLocalAudioTrack`. Returns `undefined` when the runtime is not
 * configured — caller should omit the option entirely in that case so
 * Twilio doesn't attempt to load missing assets.
 */
export function buildNoiseCancellationOptions(
  config: NoiseSuppressionRuntimeConfig = resolveNoiseSuppressionConfig(),
): NoiseCancellationOptions | undefined {
  if (!config.sdkAssetsPath) return undefined;
  return { sdkAssetsPath: config.sdkAssetsPath, vendor: config.vendor };
}

// ---------------------------------------------------------------------------
// localStorage preference helpers (SSR-safe)
// ---------------------------------------------------------------------------

/**
 * Read the persisted preference. Returns the default (`true`) when the
 * key is missing, malformed, or `window` is unavailable (SSR).
 *
 * Defensive about quota / private-browsing exceptions: reads are
 * wrapped in try/catch so a denied storage call falls back to the
 * default.
 */
export function readNoiseSuppressionPreference(): boolean {
  if (typeof window === "undefined") return NOISE_SUPPRESSION_DEFAULT_ENABLED;
  try {
    const raw = window.localStorage.getItem(NOISE_SUPPRESSION_STORAGE_KEY);
    if (raw == null) return NOISE_SUPPRESSION_DEFAULT_ENABLED;
    if (raw === "true") return true;
    if (raw === "false") return false;
    return NOISE_SUPPRESSION_DEFAULT_ENABLED;
  } catch {
    return NOISE_SUPPRESSION_DEFAULT_ENABLED;
  }
}

/**
 * Persist the preference. Best-effort — swallows quota / private-mode
 * exceptions because the toggle is not safety-critical (worst case the
 * preference reverts to the default on next call). Multi-tab consumers
 * can subscribe to the `storage` event on `NOISE_SUPPRESSION_STORAGE_KEY`
 * to react to changes from sibling tabs.
 */
export function writeNoiseSuppressionPreference(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      NOISE_SUPPRESSION_STORAGE_KEY,
      enabled ? "true" : "false",
    );
  } catch {
    // best-effort — see docstring.
  }
}

// ---------------------------------------------------------------------------
// Twilio LocalAudioTrack runtime control
// ---------------------------------------------------------------------------

/**
 * Apply the user's preference to a live `LocalAudioTrack` produced by
 * `createLocalAudioTrack({ noiseCancellationOptions: ... })`.
 *
 * Behaviour:
 *   - When the track has no `noiseCancellation` property (Twilio could
 *     not load the assets, or `noiseCancellationOptions` was omitted at
 *     track-creation time), this function is a no-op + a single
 *     warn-level dev log. The call is unaffected.
 *   - When the property is present, `enable()` / `disable()` is awaited
 *     so the caller can know when the request has settled. Promise
 *     errors are swallowed (Twilio occasionally rejects in narrow
 *     races; the next toggle recovers).
 *   - PHI safety: only the vendor name + boolean state are logged
 *     under `process.env.NODE_ENV !== "production"`. No session IDs,
 *     names, or tokens.
 */
export async function applyNoiseSuppressionPreference(
  track: LocalAudioTrack | null | undefined,
  enabled: boolean,
): Promise<void> {
  if (!track) return;
  const nc = track.noiseCancellation;
  if (!nc) {
    if (
      typeof process !== "undefined" &&
      process.env?.NODE_ENV !== "production"
    ) {
      // eslint-disable-next-line no-console
      console.warn(
        "[noise-suppression] LocalAudioTrack has no noiseCancellation processor; toggle is a no-op.",
      );
    }
    return;
  }
  try {
    if (enabled && !nc.isEnabled) {
      await nc.enable();
    } else if (!enabled && nc.isEnabled) {
      await nc.disable();
    }
  } catch (err) {
    if (
      typeof process !== "undefined" &&
      process.env?.NODE_ENV !== "production"
    ) {
      // eslint-disable-next-line no-console
      console.warn(
        `[noise-suppression] ${nc.vendor} ${enabled ? "enable" : "disable"} failed:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
}
