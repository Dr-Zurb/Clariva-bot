"use client";

import { useCallback, useEffect, useState } from "react";
import {
  inferRouteFromDeviceId,
  resolveEarpieceSinkId,
  resolveSpeakerSinkId,
  type UseAudioOutputDeviceResult,
} from "@/hooks/useAudioOutputDevice";

export interface SpeakerEarpieceToggleProps {
  audioOutput: UseAudioOutputDeviceResult;
  className?: string;
}

type Route = "speaker" | "earpiece";

/**
 * Mobile two-state output toggle (T1.6).
 */
export default function SpeakerEarpieceToggle({
  audioOutput,
  className = "",
}: SpeakerEarpieceToggleProps) {
  const { devices, current, setOutput, isSupported, enumerated } = audioOutput;
  const [route, setRoute] = useState<Route>("speaker");

  useEffect(() => {
    if (!enumerated || !isSupported) return;
    setRoute(inferRouteFromDeviceId(current?.deviceId ?? null, devices));
  }, [current?.deviceId, devices, enumerated, isSupported]);

  const toggle = useCallback(() => {
    const next: Route = route === "speaker" ? "earpiece" : "speaker";
    const sinkId =
      next === "speaker"
        ? resolveSpeakerSinkId(devices)
        : resolveEarpieceSinkId(devices);
    setRoute(next);
    void setOutput(sinkId);
  }, [route, devices, setOutput]);

  if (!isSupported) {
    return (
      <p className={"text-xs text-gray-500 " + className}>
        Switch output via your system controls.
      </p>
    );
  }

  const label = route === "speaker" ? "Speaker" : "Earpiece";
  const icon = route === "speaker" ? "🔊" : "🔈";

  return (
    <div className={"flex items-center gap-3 " + className}>
      <span className="text-xs font-medium text-gray-600">Audio output</span>
      <button
        type="button"
        onClick={toggle}
        className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 shadow-sm hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        aria-pressed={route === "speaker"}
        aria-label={`Audio output: ${label}. Tap to switch.`}
      >
        <span aria-hidden="true">{icon}</span>
        {label}
      </button>
    </div>
  );
}
