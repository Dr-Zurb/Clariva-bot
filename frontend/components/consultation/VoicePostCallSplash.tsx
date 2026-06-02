"use client";

import { useCallback, useEffect, useRef } from "react";
import CallDisconnectSplash from "./CallDisconnectSplash";
import type { DisconnectReason } from "@/lib/voice/classify-disconnect";

/**
 * voice-A9 — post-call disconnect splash for `<VoiceConsultRoom>`.
 *
 * Wraps the modality-agnostic `<CallDisconnectSplash>` (video B5) and adds
 * the voice-specific behaviours from T2 §T2.16:
 *   - 5s auto-dismiss (cancelled on pointer activity inside the card)
 *
 * B5 (post-call summary) mounts below once the splash dismisses; the
 * parent lifts `disconnectReason` via `onDisconnectReason` so B5 can
 * consume it even after dismiss.
 */

const AUTO_DISMISS_MS = 5_000;

export interface VoicePostCallSplashProps {
  reason: DisconnectReason;
  role: "doctor" | "patient";
  actorLabel?: string;
  onDismiss: () => void;
  onRejoin?: () => void;
  onRestart?: () => void;
}

export default function VoicePostCallSplash({
  reason,
  role,
  actorLabel,
  onDismiss,
  onRejoin,
  onRestart,
}: VoicePostCallSplashProps) {
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearAutoDismiss = useCallback(() => {
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
  }, []);

  const scheduleAutoDismiss = useCallback(() => {
    clearAutoDismiss();
    dismissTimerRef.current = setTimeout(() => {
      onDismiss();
    }, AUTO_DISMISS_MS);
  }, [clearAutoDismiss, onDismiss]);

  useEffect(() => {
    scheduleAutoDismiss();
    return clearAutoDismiss;
  }, [scheduleAutoDismiss, clearAutoDismiss]);

  const handleInteraction = useCallback(() => {
    clearAutoDismiss();
  }, [clearAutoDismiss]);

  return (
    <div
      onPointerDown={handleInteraction}
      onMouseMove={handleInteraction}
      data-testid="voice-post-call-splash"
    >
      <CallDisconnectSplash
        reason={reason}
        role={role}
        actorLabel={actorLabel}
        modality="voice"
        onDismiss={() => {
          clearAutoDismiss();
          onDismiss();
        }}
        onRejoin={onRejoin}
        onRestart={onRestart}
      />
    </div>
  );
}
