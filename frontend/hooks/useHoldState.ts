"use client";

/**
 * Sub-batch B · task-video-B3 — local hold state for video / voice consults.
 *
 * **Contract authored here, ahead of voice B3.** The voice batch's
 * `task-voice-B3-hold-call.md` will mount the same hook from
 * `<VoiceConsultRoom>` (audio-only flow — `videoOff` snapshot stays
 * `null` because there's no video track to remember). When voice B3
 * picks up, no changes to this hook are needed.
 *
 * What this hook owns:
 *
 *   - `onHold` boolean — the only piece of UI state that toggles when
 *     the user (or the counterparty, eventually) presses Hold/Resume.
 *   - **Pre-hold snapshot** — kept in refs (NOT state) so it doesn't
 *     trigger re-renders. On `putOnHold` we capture `{ micMutedBefore,
 *     cameraOffBefore }`; on `resume` we hand them back so the caller
 *     can restore the prior mic/camera state. Without the snapshot, a
 *     user who was already muted before pressing Hold would silently
 *     get unmuted on Resume (a bug — Resume should restore the prior
 *     state, not unconditionally enable everything).
 *
 * What this hook does NOT own (intentional separation of concerns):
 *
 *   - Twilio track operations (`enable()` / `disable()`). The caller
 *     wires those in its own handler — this hook returns the snapshot
 *     and the new state, but doesn't touch tracks. Keeps the hook
 *     trivially testable without Twilio mocks.
 *   - System-message emission (`hold_changed` event). Deferred to
 *     voice B3's backend route (same A1-style deferral — see
 *     `task-video-A1-mute-unmute-mic.md` §"Why the system-message
 *     wire is deferred" for the full reasoning).
 *   - Counterparty signal (peer-to-peer hold notification). Today the
 *     counterparty sees the existing A2 (camera-off → avatar) + A1
 *     (audio mute) visual changes; the explicit "Dr. Sharma is on
 *     hold" banner is gated on the system-message route landing.
 *
 * Consumed by `<VideoRoom>` (B3) and `<VoiceConsultRoom>` (voice B3)
 * via the same import path. Voice B3 can pass `cameraOffBefore: null`
 * unconditionally (audio-only) — the snapshot just won't carry that
 * field, and the resume callback's caller-side type guard handles it.
 */

import { useCallback, useRef, useState } from "react";

/**
 * Pre-hold snapshot of the local user's mic + camera state. Returned
 * by `resume()` so the caller can restore Twilio tracks to exactly
 * the state they were in before the hold (instead of unconditionally
 * enabling, which would unmute a previously-muted user — a bug).
 *
 * Voice B3 will pass `cameraOffBefore: false` always (audio-only) and
 * just ignore the field on resume. Field is non-optional in the type
 * so the snapshot shape stays stable across both modalities.
 */
export interface HoldSnapshot {
  micMutedBefore: boolean;
  cameraOffBefore: boolean;
}

export interface UseHoldStateApi {
  /** Whether the local user has the call on hold. */
  onHold: boolean;
  /**
   * Put the call on hold. Caller must pass the CURRENT mic + camera
   * state so the hook can snapshot them for restore on resume. Caller
   * is responsible for the actual track `disable()` calls AFTER this
   * returns (so the snapshot is taken pre-disable and the state
   * stays consistent).
   *
   * No-op if already on hold (defensive — guards against double-clicks
   * before React re-renders the disabled button state).
   *
   * Returns the snapshot that was captured (or `null` if no-op),
   * mostly for tests / logging — production callers can ignore.
   */
  putOnHold: (current: HoldSnapshot) => HoldSnapshot | null;
  /**
   * Resume from hold. Returns the snapshot captured at `putOnHold`
   * time (or `null` if not on hold). Caller uses the snapshot to
   * restore mic + camera tracks to their pre-hold state.
   *
   * No-op if not on hold (mirror of `putOnHold`'s defensive guard).
   */
  resume: () => HoldSnapshot | null;
  /**
   * Convenience wrapper — flips between hold / resume. Caller still
   * handles Twilio tracks based on the returned `{ next, snapshot }`
   * (snapshot is the captured snapshot when going INTO hold, OR the
   * snapshot to restore when coming OUT — disambiguated by `next`).
   */
  toggleHold: (current: HoldSnapshot) => {
    next: boolean;
    snapshot: HoldSnapshot;
  };
}

export function useHoldState(): UseHoldStateApi {
  const [onHold, setOnHold] = useState(false);
  // Pre-hold snapshot — held in a ref so updating it doesn't
  // re-render. Effectively a value cell that survives across the
  // hold/resume lifecycle without being part of React's reactive
  // graph (the only piece that needs to react is `onHold` itself).
  const snapshotRef = useRef<HoldSnapshot | null>(null);

  const putOnHold = useCallback(
    (current: HoldSnapshot): HoldSnapshot | null => {
      if (snapshotRef.current !== null) {
        // Already on hold — no-op (defensive against double-clicks
        // before React re-renders the button state). Return null so
        // tests / logging can distinguish "captured" from "no-op".
        return null;
      }
      snapshotRef.current = current;
      setOnHold(true);
      return current;
    },
    [],
  );

  const resume = useCallback((): HoldSnapshot | null => {
    if (snapshotRef.current === null) {
      // Not on hold — no-op.
      return null;
    }
    const snapshot = snapshotRef.current;
    snapshotRef.current = null;
    setOnHold(false);
    return snapshot;
  }, []);

  const toggleHold = useCallback(
    (current: HoldSnapshot): { next: boolean; snapshot: HoldSnapshot } => {
      // `snapshotRef.current` is the source of truth for whether
      // we're on hold (in lockstep with `onHold` state — synchronous
      // ref read avoids the stale-closure trap that `onHold` would
      // hit when called rapidly back-to-back).
      if (snapshotRef.current !== null) {
        const restored = snapshotRef.current;
        snapshotRef.current = null;
        setOnHold(false);
        return { next: false, snapshot: restored };
      }
      snapshotRef.current = current;
      setOnHold(true);
      return { next: true, snapshot: current };
    },
    [],
  );

  return { onHold, putOnHold, resume, toggleHold };
}
