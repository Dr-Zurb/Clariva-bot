"use client";

/**
 * crc-17 — lobby network-drop resilience.
 *
 * Owns the visible-tab timer, visibility listener (extends p2 — do not
 * add a second one on the same surface), and online/offline recovery.
 * Failed ticks back off; recovery refetches immediately.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  LOBBY_RECONNECT_BASE_MS,
  nextLobbyBackoffMs,
} from "@/lib/consultation/lobby-reconnect";

export function useLobbyReconnect(input: {
  enabled: boolean;
  onTick: () => Promise<void>;
}): { reconnecting: boolean; isOnline: boolean } {
  const enabled = input.enabled;
  const onTickRef = useRef(input.onTick);
  onTickRef.current = input.onTick;

  const [reconnecting, setReconnecting] = useState(false);
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine
  );

  const failCountRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const runningRef = useRef(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const schedule = useCallback(
    (delayMs: number) => {
      clearTimer();
      if (!enabledRef.current) return;
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        void runRef.current();
      }, delayMs);
    },
    [clearTimer]
  );

  const runRef = useRef<() => Promise<void>>(async () => undefined);

  runRef.current = async () => {
    if (!enabledRef.current) return;
    if (
      typeof document !== "undefined" &&
      document.visibilityState !== "visible"
    ) {
      return;
    }
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setIsOnline(false);
      setReconnecting(true);
      return;
    }
    if (runningRef.current) return;
    runningRef.current = true;
    try {
      await onTickRef.current();
      failCountRef.current = 0;
      setReconnecting(false);
      schedule(LOBBY_RECONNECT_BASE_MS);
    } catch {
      failCountRef.current += 1;
      setReconnecting(true);
      schedule(nextLobbyBackoffMs(failCountRef.current));
    } finally {
      runningRef.current = false;
    }
  };

  const recoverNow = useCallback(() => {
    failCountRef.current = 0;
    void runRef.current();
  }, []);

  useEffect(() => {
    if (!enabled) {
      clearTimer();
      failCountRef.current = 0;
      setReconnecting(false);
      return;
    }

    void runRef.current();

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        recoverNow();
      } else {
        clearTimer();
      }
    };
    const onOnline = () => {
      setIsOnline(true);
      recoverNow();
    };
    const onOffline = () => {
      setIsOnline(false);
      setReconnecting(true);
    };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      clearTimer();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [enabled, clearTimer, recoverNow]);

  return { reconnecting, isOnline };
}

export function LobbyReconnectNotice({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-0 z-40 flex justify-center p-3"
    >
      <p className="rounded-full border border-amber-200 bg-amber-50 px-4 py-1.5 text-sm font-medium text-amber-900 shadow-sm">
        Reconnecting…
      </p>
    </div>
  );
}
