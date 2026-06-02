/**
 * Sub-batch E · task-video-E1 — pure adaptive-bitrate state machine.
 *
 * Watches Twilio's `Participant.networkQualityLevel` (0–5; A8's hook
 * exposes this) and decides when to downgrade / upgrade the locally-
 * published video resolution. The controller is intentionally split
 * into a pure decision function (`evaluateAdaptiveTransition`) plus
 * thin React glue (lives in `<VideoRoom>`) so the state-machine logic
 * is unit-testable without a Twilio room or React renderer.
 *
 * Why pure functions instead of a class:
 *   - Frontend has no jest/vitest today (E.1's `data-estimate.ts`
 *     hit the same constraint). Pure functions make a future jest
 *     setup trivial; class-with-side-effects would force test
 *     scaffolding.
 *   - Time is passed in as `now: number` (epoch ms), not read from
 *     `Date.now()`, so tests can advance time without fake timers.
 *
 * Decision §22 — `bandwidthProfile.video.mode = 'collaboration'` is
 * already wired into `<VideoRoom>`'s `connect()` call (B8 set it for
 * the picker's `maxSubscriptionBitrate` ceiling). E1 only manages
 * the LOCAL publish dimensions — `bandwidthProfile` itself is
 * set-once at connect time per Twilio Video JS 2.x (no runtime API).
 *
 * Decision §23 — simulcast OFF in v1 (two-party calls don't benefit;
 * revisit when C8 three-way ships). Not handled here; this is a
 * connect-time option in Twilio.
 *
 * Coupling with B8 (`<VideoQualityPicker>`):
 *   - When picker is `'auto'`, this controller is in charge.
 *   - When picker is `'1080p' | '720p' | '480p'`, controller is
 *     suspended — the user explicitly chose a ceiling and we honour
 *     it (would be confusing if their choice silently downgraded).
 *   - When picker is `'audio-only'`, controller is suspended — no
 *     local video track to manage.
 *
 * Coupling with E.4 / E2 (audio-fallback, ✅ SHIPPED 2026-05-02):
 *   - The `'audio-only'` adaptive level is now emitted when the
 *     state machine is at `'low'` AND network quality stays "down"
 *     (≤ 1) for another DOWNGRADE_SUSTAINED_MS window. The caller
 *     unpublishes the local video track entirely + posts the
 *     `auto_audio_fallback` system row.
 *   - The caller passes `audioFallbackCooldownActive: boolean` in
 *     each tick input. When true (set after the user clicks "Try
 *     video again" — Decision §25's 60s flapping-prevention
 *     window), only the audio-only transition is blocked; other
 *     downgrades (high → medium → low) and all upgrades still
 *     fire. Sustain windows continue to accumulate so the moment
 *     cooldown lifts, audio-only fires immediately if conditions
 *     still hold.
 */

import { type QualityOption } from "@/components/consultation/VideoQualityPicker";

/**
 * Adaptive controller's internal "level" — distinct from B8's
 * `QualityOption` so the state machine doesn't depend on picker
 * vocabulary. The mapping (`adaptiveLevelToQuality`) lives below.
 *
 *   high       → no explicit video constraints (camera + Twilio
 *                negotiate; today's connect-path default ~640x480,
 *                modern cameras typically deliver 720p/1080p when
 *                bandwidth allows)
 *   medium     → 720p / 24fps
 *   low        → 480p / 20fps  ← v1 floor
 *   audio-only → no video track at all  ← reserved for E.4 (E2)
 */
export type AdaptiveLevel = "high" | "medium" | "low" | "audio-only";

/**
 * Map an `AdaptiveLevel` to the equivalent `QualityOption` so the
 * caller can reuse `videoConstraintsForQuality()` from B8 to derive
 * `MediaTrackConstraints`. Keeping this in a single helper means
 * the controller doesn't import constraint-shape types directly,
 * which keeps the module pure (no `MediaTrackConstraints` dep at
 * test time).
 */
export function adaptiveLevelToQuality(level: AdaptiveLevel): QualityOption {
  switch (level) {
    case "high":
      return "auto";
    case "medium":
      return "720p";
    case "low":
      return "480p";
    case "audio-only":
      return "audio-only";
  }
}

/**
 * Trigger thresholds. The spec calls for "sustained ≤ 1 for 10s"
 * (downgrade) and "sustained ≥ 4 for 30s" (upgrade) with a 30s
 * cooldown between any two transitions to prevent flapping.
 *
 * `null`-level (Twilio hasn't measured yet) is treated as
 * "neutral" — neither builds the downgrade nor upgrade window.
 * Otherwise a freshly-connected room would briefly look "low" to
 * the controller and trigger a spurious downgrade.
 */
export const DOWNGRADE_SUSTAINED_MS = 10_000;
export const UPGRADE_SUSTAINED_MS = 30_000;
export const TRANSITION_COOLDOWN_MS = 30_000;

/** Internal sustain-window classification of a network-quality level. */
export type LevelTrend = "down" | "neutral" | "up";

/**
 * Classify a Twilio network-quality level (0–5) into a trend bucket
 * for the sustain windows. Boundaries match the controller's intent:
 *
 *   level 0       → 'down'    (no signal — count toward downgrade)
 *   level 1       → 'down'    (very poor)
 *   level 2 or 3  → 'neutral' (don't accumulate either window)
 *   level 4 or 5  → 'up'      (good / excellent — count toward upgrade)
 *   null          → 'neutral' (Twilio still measuring; don't act)
 */
export function classifyLevelTrend(level: number | null): LevelTrend {
  if (level == null) return "neutral";
  if (level <= 1) return "down";
  if (level >= 4) return "up";
  return "neutral";
}

/**
 * Adjacent levels for the step-by-step degradation / recovery ladder.
 * The state machine downgrades / upgrades ONE step at a time so a
 * single bad sample doesn't flip 'high' straight to 'audio-only'.
 *
 * Post-E.4 (2026-05-02): `nextLevelDown('low')` returns
 * `'audio-only'` — when bandwidth can't sustain even 480p, the
 * caller tears down the local video track entirely so audio
 * payload gets the full upstream budget. The transition is gated
 * by the cooldown signal in `AdaptiveEvaluationInput` so users
 * who just clicked "Try video again" aren't yanked back to
 * audio-only in the next tick (Decision §25's 60s window).
 *
 * `nextLevelDown('audio-only')` is a no-op — there's no level
 * below audio-only in v1.
 */
export function nextLevelDown(level: AdaptiveLevel): AdaptiveLevel {
  switch (level) {
    case "high":
      return "medium";
    case "medium":
      return "low";
    case "low":
      return "audio-only";
    case "audio-only":
      return level;
  }
}

export function nextLevelUp(level: AdaptiveLevel): AdaptiveLevel {
  switch (level) {
    case "audio-only":
      return "low";
    case "low":
      return "medium";
    case "medium":
      return "high";
    case "high":
      return level;
  }
}

/**
 * Pure controller state. Stored in a React ref by `<VideoRoom>` so
 * the per-tick evaluator can read + write without triggering re-
 * renders. The `Pick`-style fields (sustained-since timestamps) are
 * `null` when no sustain window is currently building.
 */
export interface AdaptiveControllerState {
  /** Current effective adaptive level. Initial: 'high'. */
  currentLevel: AdaptiveLevel;
  /**
   * Epoch-ms when the level FIRST entered the sustained-down window
   * AND has stayed there since. Reset to `null` whenever a non-down
   * sample arrives.
   */
  sustainedDownSince: number | null;
  /**
   * Same for the sustained-up window. Reset to `null` whenever a
   * non-up sample arrives. Note: 'up' samples DO accumulate even
   * when `currentLevel === 'high'` (already at ceiling) — the
   * evaluator just refuses to emit a transition in that case, which
   * keeps the cooldown counter from firing meaninglessly.
   */
  sustainedUpSince: number | null;
  /**
   * Epoch-ms of the last actual transition emitted. Used to enforce
   * the 30s cooldown — even if a sustain window completes,
   * `now - lastTransitionAt < TRANSITION_COOLDOWN_MS` blocks the
   * transition. `null` until the first transition fires.
   */
  lastTransitionAt: number | null;
}

/** Factory for a fresh state — `<VideoRoom>` calls this on mount. */
export function makeInitialAdaptiveState(): AdaptiveControllerState {
  return {
    currentLevel: "high",
    sustainedDownSince: null,
    sustainedUpSince: null,
    lastTransitionAt: null,
  };
}

/**
 * Per-tick input for the evaluator. `picker` is the B8 picker value
 * (passed through unchanged so the evaluator can decide whether to
 * suspend); `now` is epoch-ms (caller usually passes `Date.now()`,
 * tests can pass a synthetic timeline).
 */
export interface AdaptiveEvaluationInput {
  now: number;
  /** Latest Twilio network-quality level for the local participant. */
  networkLevel: number | null;
  /** Current B8 picker value. Suspends controller when not 'auto'. */
  picker: QualityOption;
  /**
   * Sub-batch E · task-video-E2 — Decision §25 cooldown signal.
   *
   * `true` for 60s after the user clicks "Try video again" in the
   * `<AudioFallbackBanner>`. While true, the audio-only transition
   * is BLOCKED (other downgrades / upgrades still fire). Sustain
   * windows continue to accumulate so the moment cooldown lifts,
   * audio-only fires immediately if conditions still hold —
   * preventing flapping without permanently disabling the
   * fallback.
   *
   * Optional for backwards compatibility with E.3-era callers
   * (which never set it, treated as `false`). E.4's <VideoRoom>
   * integration always passes the live cooldown state.
   */
  audioFallbackCooldownActive?: boolean;
}

/**
 * Evaluator output. `transitionTo` is `null` when no transition is
 * decided this tick; the new state is always returned so the caller
 * can swap it into the ref. `reason` carries the transition kind
 * for the toast copy ('downgrade' fires the user-visible toast;
 * 'upgrade' is silent per spec — toast only on degrades).
 */
export interface AdaptiveEvaluationResult {
  newState: AdaptiveControllerState;
  transitionTo: AdaptiveLevel | null;
  reason: "downgrade" | "upgrade" | null;
}

/**
 * Pure state-machine step. Given the current state + the latest
 * tick input, returns the next state + an optional transition. Does
 * not mutate the input state.
 *
 * Suspension rules (no transition emitted):
 *   - picker !== 'auto' — user has manual control; reset sustain
 *     windows so when they switch back to 'auto' we start fresh.
 *   - networkLevel is null or trend is 'neutral' — no signal to act
 *     on; reset both sustain windows.
 *   - lastTransitionAt within the cooldown — sustain window may
 *     have completed but cooldown blocks; preserve sustain windows
 *     so they continue accumulating.
 *
 * Transition rules:
 *   - Sustained 'down' for ≥ DOWNGRADE_SUSTAINED_MS AND not at
 *     'low' (the v1 floor) → emit `transitionTo = nextLevelDown(...)`.
 *   - Sustained 'up' for ≥ UPGRADE_SUSTAINED_MS AND not at 'high'
 *     → emit `transitionTo = nextLevelUp(...)`.
 *   - On any emitted transition: bump `lastTransitionAt`, clear the
 *     sustain window for the OPPOSITE direction (so we don't
 *     immediately fire the inverse on the next tick).
 */
export function evaluateAdaptiveTransition(
  state: AdaptiveControllerState,
  input: AdaptiveEvaluationInput,
): AdaptiveEvaluationResult {
  const { now, networkLevel, picker } = input;

  // Suspend when picker isn't 'auto'. Reset sustain windows so the
  // controller picks up cleanly when the user returns to 'auto'.
  if (picker !== "auto") {
    return {
      newState: {
        ...state,
        sustainedDownSince: null,
        sustainedUpSince: null,
      },
      transitionTo: null,
      reason: null,
    };
  }

  const trend = classifyLevelTrend(networkLevel);

  // Update sustain windows based on the trend. 'neutral' / null
  // resets BOTH; 'down' starts/continues the down window AND clears
  // the up window; 'up' the inverse.
  let sustainedDownSince = state.sustainedDownSince;
  let sustainedUpSince = state.sustainedUpSince;
  if (trend === "down") {
    sustainedDownSince = sustainedDownSince ?? now;
    sustainedUpSince = null;
  } else if (trend === "up") {
    sustainedUpSince = sustainedUpSince ?? now;
    sustainedDownSince = null;
  } else {
    sustainedDownSince = null;
    sustainedUpSince = null;
  }

  const cooldownActive =
    state.lastTransitionAt != null &&
    now - state.lastTransitionAt < TRANSITION_COOLDOWN_MS;

  // Cooldown blocks transitions — sustain windows continue to
  // accumulate (don't reset them) so the moment cooldown expires,
  // a still-bad network triggers immediately.
  if (cooldownActive) {
    return {
      newState: {
        ...state,
        sustainedDownSince,
        sustainedUpSince,
      },
      transitionTo: null,
      reason: null,
    };
  }

  // Downgrade gate: sustained 'down' for ≥ 10s. When `nextLevelDown`
  // returns the same level (already at the audio-only floor), we
  // treat that as "no transition" so the cooldown timer doesn't fire
  // spuriously.
  //
  // Sub-batch E · task-video-E2 — additional gate: when the
  // proposed transition is to 'audio-only' AND the
  // `audioFallbackCooldownActive` flag is true (Decision §25's 60s
  // window after user-initiated restore), block the transition but
  // KEEP the sustain window accumulating. The moment cooldown lifts
  // (caller flips the flag back to false), audio-only fires
  // immediately if network is still bad. Other downgrades
  // (high → medium, medium → low) are unaffected by the flag —
  // those pre-fallback degradations still need to happen.
  if (
    sustainedDownSince != null &&
    now - sustainedDownSince >= DOWNGRADE_SUSTAINED_MS
  ) {
    const next = nextLevelDown(state.currentLevel);
    if (next !== state.currentLevel) {
      const isAudioOnlyTransition = next === "audio-only";
      if (isAudioOnlyTransition && input.audioFallbackCooldownActive) {
        // Cooldown blocks this transition only. Persist the
        // accumulating sustain window so cooldown expiry triggers
        // immediately on the next tick.
        return {
          newState: {
            ...state,
            sustainedDownSince,
            sustainedUpSince,
          },
          transitionTo: null,
          reason: null,
        };
      }
      return {
        newState: {
          currentLevel: next,
          // Clear BOTH sustain windows on transition — we want a
          // fresh sustained read at the new level before either
          // direction fires again.
          sustainedDownSince: null,
          sustainedUpSince: null,
          lastTransitionAt: now,
        },
        transitionTo: next,
        reason: "downgrade",
      };
    }
  }

  // Upgrade gate: sustained 'up' for ≥ 30s AND not at 'high'.
  if (
    sustainedUpSince != null &&
    now - sustainedUpSince >= UPGRADE_SUSTAINED_MS
  ) {
    const next = nextLevelUp(state.currentLevel);
    if (next !== state.currentLevel) {
      return {
        newState: {
          currentLevel: next,
          sustainedDownSince: null,
          sustainedUpSince: null,
          lastTransitionAt: now,
        },
        transitionTo: next,
        reason: "upgrade",
      };
    }
  }

  // No transition this tick — just persist updated sustain windows.
  return {
    newState: {
      ...state,
      sustainedDownSince,
      sustainedUpSince,
    },
    transitionTo: null,
    reason: null,
  };
}

/**
 * User-visible toast copy on downgrade for the medium / low levels.
 * The audio-only transition is handled separately via the
 * `<AudioFallbackBanner>` (E.4) which is a sticky banner with a
 * "Try video again" CTA — much more prominent than a self-clearing
 * pill, because the user can no longer rely on the camera-off
 * avatar alone to signal "you've lost video for a reason".
 *
 * Per spec §"UI surfacing" (E.3): downgrades surface a toast;
 * upgrades are silent (no toast) so we don't clutter the call with
 * positive notices on every recovery cycle.
 *
 * Returns `null` for:
 *   - upgrades (silent restore)
 *   - the 'audio-only' transition (caller mounts the sticky banner instead)
 *   - the 'high' transition (we never "downgrade to high")
 */
export function adaptiveToastMessage(
  reason: "downgrade" | "upgrade" | null,
  newLevel: AdaptiveLevel,
): string | null {
  if (reason !== "downgrade") return null;
  switch (newLevel) {
    case "medium":
      return "Video quality reduced to 720p — keeping audio clear.";
    case "low":
      return "Video quality reduced to 480p — keeping audio clear on a slow network.";
    case "audio-only":
      // E.4 caller mounts <AudioFallbackBanner> instead of a
      // self-clearing pill. Returning `null` here keeps the toast
      // surface from double-firing on the same transition.
      return null;
    case "high":
    default:
      return null;
  }
}
