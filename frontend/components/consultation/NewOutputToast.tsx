"use client";

/**
 * voice-C7 — One-tap prompt when a new Bluetooth output connects mid-call.
 *
 * @see task-voice-C7-bluetooth-airpods-relay.md
 */

import { useEffect } from "react";
import {
  NEW_OUTPUT_TOAST_AUTO_DISMISS_MS,
  getNewOutputToastMessage,
} from "@/lib/audio/output-router";

export interface NewOutputToastProps {
  device: MediaDeviceInfo;
  onSwitch: (deviceId: string) => void;
  onDismiss: () => void;
}

export default function NewOutputToast({
  device,
  onSwitch,
  onDismiss,
}: NewOutputToastProps) {
  useEffect(() => {
    const handle = window.setTimeout(() => {
      onDismiss();
    }, NEW_OUTPUT_TOAST_AUTO_DISMISS_MS);
    return () => window.clearTimeout(handle);
  }, [device.deviceId, onDismiss]);

  const message = getNewOutputToastMessage(device);

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="new-output-toast"
      className="pointer-events-none absolute left-1/2 top-14 z-40 max-w-[min(100%,24rem)] -translate-x-1/2 px-3"
    >
      <div className="pointer-events-auto flex animate-slide-in-from-top items-center justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-950 shadow-md ring-1 ring-blue-200/80">
        <span className="font-medium">{message}</span>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => onSwitch(device.deviceId)}
            className="rounded-md bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
          >
            Switch
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-md px-2 py-1 text-xs font-medium text-blue-800 hover:bg-blue-100/80 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-1"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
