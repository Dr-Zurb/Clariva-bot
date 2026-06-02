"use client";

/**
 * Sub-batch C · task-voice-C9 — per-doctor / per-patient noise
 * suppression preference, persisted to `localStorage`.
 *
 * Shared by `<VoiceConsultPreCall>` (precall toggle) and
 * `<VoiceConsultRoom>` (in-call control bar + plugin wiring). The hook
 * does three things:
 *
 *   1. Lazy-reads the persisted preference on mount (SSR-safe — the
 *      initial state defaults to ON so the server-rendered HTML matches
 *      the spec default; the effective value is rehydrated in
 *      `useEffect` after mount).
 *   2. Persists changes on every `setEnabled` call (best-effort —
 *      private-browsing / quota errors are swallowed inside the
 *      writer).
 *   3. Listens to the cross-tab `storage` event so a doctor flipping
 *      the toggle from the dashboard settings (future surface) or from
 *      a second open consult tab keeps every tab consistent.
 *
 * @see frontend/lib/audio/noise-suppression.ts (the underlying helpers)
 * @see docs/Work/Daily-plans/April 2026/28-04-2026/Tasks/voice/task-voice-C9-noise-suppression.md
 */

import { useCallback, useEffect, useState } from "react";
import {
  NOISE_SUPPRESSION_DEFAULT_ENABLED,
  NOISE_SUPPRESSION_STORAGE_KEY,
  readNoiseSuppressionPreference,
  writeNoiseSuppressionPreference,
} from "@/lib/audio/noise-suppression";

export interface UseNoiseSuppressionPreferenceResult {
  /** Current effective preference (defaults to ON until rehydrated). */
  enabled: boolean;
  /** Persist + broadcast a new value. Idempotent on equal value. */
  setEnabled: (next: boolean) => void;
  /** Convenience for toggle buttons. */
  toggle: () => void;
}

export function useNoiseSuppressionPreference(): UseNoiseSuppressionPreferenceResult {
  const [enabled, setEnabledState] = useState<boolean>(
    NOISE_SUPPRESSION_DEFAULT_ENABLED,
  );

  // Rehydrate from localStorage after mount (SSR-safe).
  useEffect(() => {
    setEnabledState(readNoiseSuppressionPreference());
  }, []);

  // Cross-tab sync via the `storage` event. Same-tab `setItem` doesn't
  // fire `storage`, so persistence in `setEnabled` is the only writer
  // we need to handle here — pure observer.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onStorage = (event: StorageEvent) => {
      if (event.key !== NOISE_SUPPRESSION_STORAGE_KEY) return;
      if (event.newValue == null) {
        setEnabledState(NOISE_SUPPRESSION_DEFAULT_ENABLED);
        return;
      }
      if (event.newValue === "true") setEnabledState(true);
      else if (event.newValue === "false") setEnabledState(false);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setEnabled = useCallback((next: boolean) => {
    setEnabledState((prev) => {
      if (prev === next) return prev;
      writeNoiseSuppressionPreference(next);
      return next;
    });
  }, []);

  const toggle = useCallback(() => {
    setEnabledState((prev) => {
      const next = !prev;
      writeNoiseSuppressionPreference(next);
      return next;
    });
  }, []);

  return { enabled, setEnabled, toggle };
}
