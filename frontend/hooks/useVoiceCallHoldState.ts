"use client";

/**
 * voice T2.11 / task-voice-B3 — bilateral hold state for voice consults.
 *
 * Tracks `'live' | 'hold-by-self' | 'hold-by-other'` and applies the
 * locked decision §4 semantics: only the actor who initiated hold may
 * resume; the counterparty sees a waiting banner with no Resume CTA.
 */

import { useCallback, useRef, useState } from "react";

export type CallHoldState = "live" | "hold-by-self" | "hold-by-other";

export interface HoldChangedMetadata {
  actor_id?: string;
  actor_role?: string;
  actor_name?: string;
  on_hold?: boolean;
}

export interface HoldMicSnapshot {
  micMutedBefore: boolean;
}

export interface UseVoiceCallHoldStateApi {
  holdState: CallHoldState;
  /** Display name for the remote party who put the call on hold. */
  remoteHoldActorName: string | null;
  isOnHold: boolean;
  canToggleHold: boolean;
  /** Enter self-initiated hold; returns snapshot for track restore on resume. */
  beginSelfHold: (current: HoldMicSnapshot) => HoldMicSnapshot;
  /** Exit self-initiated hold; returns snapshot captured at beginSelfHold. */
  endSelfHold: () => HoldMicSnapshot | null;
  /** React to a `hold_changed` Realtime row (companion chat). */
  applyHoldChangedMessage: (
    metadata: Record<string, unknown> | null | undefined,
    currentUserId: string,
  ) => void;
}

function asHoldMetadata(
  metadata: Record<string, unknown> | null | undefined,
): HoldChangedMetadata | null {
  if (!metadata || typeof metadata !== "object") return null;
  return metadata as HoldChangedMetadata;
}

export function useVoiceCallHoldState(): UseVoiceCallHoldStateApi {
  const [holdState, setHoldState] = useState<CallHoldState>("live");
  const [remoteHoldActorName, setRemoteHoldActorName] = useState<string | null>(
    null,
  );
  const selfSnapshotRef = useRef<HoldMicSnapshot | null>(null);
  const holdStateRef = useRef<CallHoldState>("live");
  holdStateRef.current = holdState;

  const beginSelfHold = useCallback((current: HoldMicSnapshot): HoldMicSnapshot => {
    selfSnapshotRef.current = current;
    setHoldState("hold-by-self");
    setRemoteHoldActorName(null);
    return current;
  }, []);

  const endSelfHold = useCallback((): HoldMicSnapshot | null => {
    if (holdStateRef.current !== "hold-by-self" || selfSnapshotRef.current === null) {
      return null;
    }
    const snapshot = selfSnapshotRef.current;
    selfSnapshotRef.current = null;
    setHoldState("live");
    return snapshot;
  }, []);

  const applyHoldChangedMessage = useCallback(
    (
      metadata: Record<string, unknown> | null | undefined,
      currentUserId: string,
    ) => {
      const meta = asHoldMetadata(metadata);
      if (!meta || typeof meta.on_hold !== "boolean") return;

      const actorId =
        typeof meta.actor_id === "string" ? meta.actor_id : null;
      const isSelf = actorId !== null && actorId === currentUserId;
      const actorName =
        typeof meta.actor_name === "string" && meta.actor_name.trim().length > 0
          ? meta.actor_name.trim()
          : meta.actor_role === "doctor"
            ? "Doctor"
            : "Patient";

      if (meta.on_hold) {
        if (isSelf) {
          // Echo of our own POST — state already flipped locally.
          return;
        }
        setRemoteHoldActorName(actorName);
        setHoldState("hold-by-other");
        selfSnapshotRef.current = null;
        return;
      }

      // Resume
      if (isSelf) {
        if (holdStateRef.current === "hold-by-self") {
          selfSnapshotRef.current = null;
          setHoldState("live");
        }
        return;
      }
      setRemoteHoldActorName(null);
      setHoldState("live");
    },
    [],
  );

  const isOnHold = holdState !== "live";
  const canToggleHold = holdState === "live" || holdState === "hold-by-self";

  return {
    holdState,
    remoteHoldActorName,
    isOnHold,
    canToggleHold,
    beginSelfHold,
    endSelfHold,
    applyHoldChangedMessage,
  };
}
