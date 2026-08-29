"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Meet-style chrome visibility: show on pointer activity, dim/hide after idle.
 */
export function useAutoHideChrome(options?: {
  hideDelayMs?: number;
  /** When true, chrome stays fully visible (e.g. hold / connecting). */
  forceVisible?: boolean;
}) {
  const hideDelayMs = options?.hideDelayMs ?? 3000;
  const forceVisible = options?.forceVisible ?? false;
  const [visible, setVisible] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const armTimer = useCallback(() => {
    if (forceVisible) return;
    clearTimer();
    timerRef.current = setTimeout(() => setVisible(false), hideDelayMs);
  }, [clearTimer, forceVisible, hideDelayMs]);

  const reveal = useCallback(() => {
    setVisible(true);
    armTimer();
  }, [armTimer]);

  useEffect(() => {
    if (forceVisible) {
      clearTimer();
      setVisible(true);
      return;
    }
    armTimer();
    return clearTimer;
  }, [forceVisible, armTimer, clearTimer]);

  return { visible: forceVisible || visible, reveal, armTimer };
}
