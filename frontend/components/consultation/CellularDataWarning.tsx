"use client";

/**
 * Sub-batch E · task-video-E7 — one-time pre-call warning shown to
 * patients on cellular data.
 *
 * Surface: full-screen modal overlay mounted ABOVE the A7 pre-call
 * surface (lobby header + countdown + camera-mic check). Renders only
 * when ALL of these are true:
 *
 *   1. `navigator.connection` says cellular (see
 *      `lib/video/data-estimate.ts#detectCellularConnection`). Safari
 *      / unsupported browsers degrade silently — no modal.
 *   2. The one-time localStorage flag
 *      (`video-cellular-warning-shown`) is NOT set. The flag is set by
 *      either "Audio-only" OR "Continue on cellular" — picking
 *      "I'll switch to Wi-Fi" intentionally does NOT set the flag so
 *      the user sees the warning again the next time they're on
 *      cellular.
 *
 * Three actions (matching Decision §30 + the task spec):
 *
 *   - **"I'll switch to Wi-Fi"** → dismiss only. Do NOT set the
 *     one-time flag. Do NOT touch B8 quality. The user is expected
 *     to actually move to Wi-Fi and re-enter; if they don't, the
 *     modal greets them again.
 *
 *   - **"Continue with audio-only"** → write
 *     `localStorage["video-quality"] = "audio-only"` (the same key
 *     that `<VideoRoom>` reads at connect time, see
 *     `readPersistedVideoQuality`). Set the one-time flag. Dismiss.
 *     The user still needs to click Continue on the A7 form to enter
 *     the live room — we don't auto-continue because the patient
 *     might still want to verify their mic before going live.
 *
 *   - **"Continue on cellular"** → set the one-time flag. Dismiss.
 *     B8 quality is left untouched.
 *
 * Why a passive overlay instead of an auto-applied policy: the user
 * owns their plan + their patience. We surface the cost, suggest two
 * concrete next-steps, and let them choose. Same pattern as B5
 * disconnect-splash.
 *
 * MB estimate shape: based on the assumed 30-min consult duration
 * (matches the task spec's example copy). The duration is hard-coded
 * here because no per-appointment duration is yet plumbed down to the
 * pre-call surface; when scheduling exposes a duration column, swap
 * the prop in. The estimate is a hint, not a billing figure.
 *
 * Coordination with F4 (battery saver): F4 may auto-trigger
 * audio-only at very-low battery. The two warnings should never fire
 * simultaneously — F4 reads the same `video-quality` localStorage key,
 * and once the flag is set here, F4's auto-downgrade still applies.
 * Decision §30 covers this.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  detectCellularConnection,
  estimatedMbForDuration,
  formatMbEstimate,
  type CellularDetection,
} from "@/lib/video/data-estimate";
import {
  isQualityOption,
  type QualityOption,
} from "./VideoQualityPicker";

const ONE_TIME_FLAG_KEY = "video-cellular-warning-shown";
const VIDEO_QUALITY_STORAGE_KEY = "video-quality";
/**
 * Default consult duration used in the MB estimate copy. Matches the
 * task spec's "30-min" wording. Plumb in real per-appointment duration
 * if/when scheduling exposes it.
 */
const DEFAULT_CONSULT_DURATION_MIN = 30;

export interface CellularDataWarningProps {
  /**
   * Optional override for the assumed call duration (minutes). Defaults
   * to 30 — the figure used in the task spec's copy. Tests pass small
   * numbers; production callers can pass the real appointment length
   * once it lands in the lobby props.
   */
  durationMinutes?: number;
  /**
   * Optional override for the localStorage flag key. Tests use this to
   * isolate one-time-flag state; production callers should leave it
   * unset.
   */
  flagKeyOverride?: string;
}

/**
 * Read the persisted `video-quality` synchronously. SSR-safe (returns
 * `'auto'` outside the browser). Mirrors the contract in `<VideoRoom>`
 * but kept local so this component doesn't import VideoRoom internals.
 */
function readQualityFromStorage(): QualityOption {
  if (typeof window === "undefined") return "auto";
  try {
    const raw = window.localStorage.getItem(VIDEO_QUALITY_STORAGE_KEY);
    if (isQualityOption(raw)) return raw;
  } catch {
    // private-browsing / quota — fall through.
  }
  return "auto";
}

function readShownFlag(key: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(key) === "true";
  } catch {
    return false;
  }
}

function writeShownFlag(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, "true");
  } catch {
    // best-effort — if storage is locked down, the user just sees the
    // warning again next session. Acceptable.
  }
}

function writeQuality(next: QualityOption): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(VIDEO_QUALITY_STORAGE_KEY, next);
  } catch {
    // best-effort.
  }
}

export default function CellularDataWarning({
  durationMinutes = DEFAULT_CONSULT_DURATION_MIN,
  flagKeyOverride,
}: CellularDataWarningProps) {
  const flagKey = flagKeyOverride ?? ONE_TIME_FLAG_KEY;

  // Three dismissal paths funnel through one state slot. `null` =
  // open. Initial state runs synchronously (no flicker) — we read
  // navigator.connection + localStorage on mount via a layout-style
  // useEffect that flips `dismissed=true` immediately when either
  // gate says "skip".
  const [dismissed, setDismissed] = useState(false);
  const [detection, setDetection] = useState<CellularDetection>("unknown");
  // Track quality reactively so the MB-estimate copy refreshes if the
  // user opens B8 in another tab (or if a future task adds a quality
  // toggle inside the modal). Read synchronously at mount; never
  // refreshed mid-modal beyond that — keeping it simple.
  const [quality, setQuality] = useState<QualityOption>("auto");

  useEffect(() => {
    // SSR / unsupported browsers — keep dismissed=false but we'll
    // immediately flip it from the gates below.
    const nextDetection = detectCellularConnection();
    setDetection(nextDetection);
    setQuality(readQualityFromStorage());

    if (nextDetection !== "cellular") {
      // Non-cellular OR unknown: never show the warning.
      setDismissed(true);
      return;
    }
    if (readShownFlag(flagKey)) {
      // One-time gate already tripped; respect it.
      setDismissed(true);
    }
  }, [flagKey]);

  const handleSwitchWifi = useCallback(() => {
    // Decision §30 — do NOT set the one-time flag. The user is
    // expected to physically switch to Wi-Fi and re-enter; if they
    // don't, the warning fires again on the next attempt. That's the
    // intended nudge.
    setDismissed(true);
  }, []);

  const handleAudioOnly = useCallback(() => {
    writeQuality("audio-only");
    writeShownFlag(flagKey);
    setDismissed(true);
  }, [flagKey]);

  const handleContinueOnCellular = useCallback(() => {
    writeShownFlag(flagKey);
    setDismissed(true);
  }, [flagKey]);

  const estimatedMb = useMemo(
    () => estimatedMbForDuration(quality, durationMinutes),
    [quality, durationMinutes],
  );

  const renderable = !dismissed && detection === "cellular";

  if (!renderable) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cellular-data-warning-title"
      aria-describedby="cellular-data-warning-body"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    >
      <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
        <header className="border-b border-gray-200 px-5 py-3">
          <h2
            id="cellular-data-warning-title"
            className="text-base font-semibold text-gray-900"
          >
            You&rsquo;re on cellular data
          </h2>
        </header>
        <div className="px-5 py-4 text-sm text-gray-700" id="cellular-data-warning-body">
          <p>
            This {durationMinutes}-min video consult will use{" "}
            <span className="font-semibold">{formatMbEstimate(estimatedMb)}</span>{" "}
            of data at the current quality
            {quality !== "auto" && quality !== "audio-only"
              ? ` (${quality})`
              : ""}
            .
          </p>
          <p className="mt-2 text-xs text-gray-500">
            Switching to Wi-Fi or audio-only avoids cellular charges. Your
            choice is remembered for next time.
          </p>
        </div>
        <footer className="flex flex-col gap-2 border-t border-gray-100 px-5 py-3">
          <button
            type="button"
            onClick={handleSwitchWifi}
            className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1"
          >
            I&rsquo;ll switch to Wi-Fi
          </button>
          <button
            type="button"
            onClick={handleAudioOnly}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-1"
          >
            Continue with audio-only{" "}
            <span className="text-xs font-normal text-gray-500">(saves data)</span>
          </button>
          <button
            type="button"
            onClick={handleContinueOnCellular}
            className="text-xs text-gray-500 underline-offset-2 hover:text-gray-700 hover:underline focus:outline-none"
          >
            Continue on cellular
          </button>
        </footer>
      </div>
    </div>
  );
}
