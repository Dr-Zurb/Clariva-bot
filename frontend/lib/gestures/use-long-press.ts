"use client";

import { useCallback, useRef } from "react";

export interface UseLongPressOptions {
  onLongPress: (anchor: HTMLElement) => void;
  durationMs?: number;
  moveTolerancePx?: number;
  /** Defaults true — calls `navigator.vibrate(15)` when the API exists. */
  haptic?: boolean;
}

export interface UseLongPressHandlers {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onPointerCancel: (e: React.PointerEvent) => void;
}

/**
 * text-C4 — long-press gesture with movement tolerance and optional haptic feedback.
 */
export function useLongPress({
  onLongPress,
  durationMs = 300,
  moveTolerancePx = 10,
  haptic = true,
}: UseLongPressOptions): UseLongPressHandlers {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const originRef = useRef<{ x: number; y: number } | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    originRef.current = null;
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      clearTimer();
      originRef.current = { x: e.clientX, y: e.clientY };
      const target = e.currentTarget as HTMLElement;

      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        originRef.current = null;
        if (haptic && typeof navigator !== "undefined") {
          navigator.vibrate?.(15);
        }
        onLongPress(target);
      }, durationMs);

      e.preventDefault();
    },
    [clearTimer, durationMs, haptic, onLongPress],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!timerRef.current || !originRef.current) return;
      const dx = e.clientX - originRef.current.x;
      const dy = e.clientY - originRef.current.y;
      if (Math.hypot(dx, dy) > moveTolerancePx) {
        clearTimer();
      }
    },
    [clearTimer, moveTolerancePx],
  );

  const onPointerUp = useCallback(() => {
    clearTimer();
  }, [clearTimer]);

  const onPointerCancel = useCallback(() => {
    clearTimer();
  }, [clearTimer]);

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel };
}
