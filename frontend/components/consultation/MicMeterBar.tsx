"use client";

import { useEffect, useRef, useState } from "react";
import { createMicMeter } from "@/lib/audio/mic-meter";

/** Low-pass smoothing — lerp factor per animation frame. */
const SMOOTHING_LERP = 0.2;

export interface MicMeterBarProps {
  stream: MediaStream | null;
  mode: "horizontal" | "vertical-tiny";
  className?: string;
}

function meterBarColor(level: number): string {
  if (level > 0.9) return "bg-red-500";
  if (level > 0.7) return "bg-yellow-500";
  return "bg-emerald-500";
}

/**
 * Thin mic-level bar for pre-call (horizontal) and in-call header
 * (vertical-tiny). Subscribes to `createMicMeter` when `stream` is set;
 * pass `null` when muted or unavailable so the bar stays flat.
 *
 * @see docs/Work/Daily-plans/April 2026/28-04-2026/Tasks/voice/task-voice-A3-mic-level-meter.md
 */
export default function MicMeterBar({
  stream,
  mode,
  className = "",
}: MicMeterBarProps) {
  const [displayLevel, setDisplayLevel] = useState(0);
  const smoothedRef = useRef(0);

  useEffect(() => {
    smoothedRef.current = 0;
    setDisplayLevel(0);
    if (!stream || stream.getAudioTracks().length === 0) {
      return;
    }

    const meter = createMicMeter(stream);
    meter.subscribe((raw) => {
      const next =
        smoothedRef.current +
        (raw - smoothedRef.current) * SMOOTHING_LERP;
      smoothedRef.current = next;
      setDisplayLevel(next);
    });

    return () => {
      meter.stop();
    };
  }, [stream]);

  const isVertical = mode === "vertical-tiny";
  const fillPct = Math.round(Math.min(1, Math.max(0, displayLevel)) * 100);

  return (
    <div
      role="meter"
      aria-label="Microphone level"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={fillPct}
      className={
        "relative overflow-hidden rounded-sm bg-gray-200 " +
        (isVertical ? "h-6 w-1" : "h-1.5 w-12") +
        (className ? ` ${className}` : "")
      }
    >
      <span
        className={
          "absolute bottom-0 left-0 block transition-[width,height] duration-75 " +
          meterBarColor(displayLevel) +
          (isVertical ? " w-full" : " h-full")
        }
        style={
          isVertical
            ? { height: `${fillPct}%` }
            : { width: `${fillPct}%` }
        }
      />
    </div>
  );
}
