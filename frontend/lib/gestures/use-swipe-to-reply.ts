"use client";

import { useCallback, useRef, useState } from "react";

export interface UseSwipeToReplyOptions {
  onTrigger: () => void;
  thresholdPx?: number;
  maxDragPx?: number;
  /** When false, handlers are no-ops and drag state stays at 0. */
  enabled?: boolean;
}

export interface UseSwipeToReplyHandlers {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onPointerCancel: (e: React.PointerEvent) => void;
}

const VERTICAL_CANCEL_PX = 20;

/**
 * text-C5 — touch-only swipe-right on a message row to enter reply mode.
 */
export function useSwipeToReply({
  onTrigger,
  thresholdPx = 60,
  maxDragPx = 80,
  enabled = true,
}: UseSwipeToReplyOptions): {
  handlers: UseSwipeToReplyHandlers;
  dragOffset: number;
  dragging: boolean;
} {
  const [dragOffset, setDragOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const activeRef = useRef(false);
  const originRef = useRef<{ x: number; y: number } | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const dragOffsetRef = useRef(0);

  const syncDragOffset = useCallback((next: number) => {
    dragOffsetRef.current = next;
    setDragOffset(next);
  }, []);

  const releasePointer = useCallback((e: React.PointerEvent) => {
    const el = e.currentTarget as HTMLElement;
    if (pointerIdRef.current !== null && el.hasPointerCapture(pointerIdRef.current)) {
      try {
        el.releasePointerCapture(pointerIdRef.current);
      } catch {
        // ignore
      }
    }
  }, []);

  const finishGesture = useCallback(
    (e: React.PointerEvent) => {
      if (!activeRef.current) return;

      const offset = dragOffsetRef.current;
      if (offset >= thresholdPx) {
        onTrigger();
      }

      activeRef.current = false;
      originRef.current = null;
      pointerIdRef.current = null;
      setDragging(false);
      syncDragOffset(0);
      releasePointer(e);
    },
    [onTrigger, releasePointer, syncDragOffset, thresholdPx],
  );

  const cancelGesture = useCallback(
    (e?: React.PointerEvent) => {
      if (!activeRef.current) return;
      activeRef.current = false;
      originRef.current = null;
      pointerIdRef.current = null;
      setDragging(false);
      syncDragOffset(0);
      if (e) releasePointer(e);
    },
    [releasePointer, syncDragOffset],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!enabled) return;
      if (e.pointerType !== "touch") return;
      if (e.button !== 0) return;

      activeRef.current = true;
      originRef.current = { x: e.clientX, y: e.clientY };
      pointerIdRef.current = e.pointerId;
      setDragging(true);
      syncDragOffset(0);

      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch {
        // ignore — capture is best-effort
      }
    },
    [enabled, syncDragOffset],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!enabled || !activeRef.current || !originRef.current) return;
      if (pointerIdRef.current !== null && e.pointerId !== pointerIdRef.current) {
        return;
      }

      const dx = e.clientX - originRef.current.x;
      const dy = e.clientY - originRef.current.y;

      if (Math.abs(dy) > VERTICAL_CANCEL_PX) {
        cancelGesture(e);
        return;
      }

      syncDragOffset(Math.min(maxDragPx, Math.max(0, dx)));
    },
    [cancelGesture, enabled, maxDragPx, syncDragOffset],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!enabled) return;
      if (pointerIdRef.current !== null && e.pointerId !== pointerIdRef.current) {
        return;
      }
      finishGesture(e);
    },
    [enabled, finishGesture],
  );

  const onPointerCancel = useCallback(
    (e: React.PointerEvent) => {
      if (!enabled) return;
      cancelGesture(e);
    },
    [cancelGesture, enabled],
  );

  return {
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel },
    dragOffset,
    dragging,
  };
}
