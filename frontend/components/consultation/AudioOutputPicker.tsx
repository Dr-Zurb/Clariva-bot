"use client";

import type { UseAudioOutputDeviceResult } from "@/hooks/useAudioOutputDevice";

export interface AudioOutputPickerProps {
  audioOutput: UseAudioOutputDeviceResult;
  className?: string;
}

/**
 * Desktop pre-call / in-call dropdown for audio output devices (T1.7).
 */
export default function AudioOutputPicker({
  audioOutput,
  className = "",
}: AudioOutputPickerProps) {
  const { devices, current, setOutput, isSupported, enumerated } = audioOutput;

  if (!isSupported) {
    return (
      <p className={"text-xs text-gray-500 " + className}>
        Switch output via your system controls.
      </p>
    );
  }

  if (!enumerated) {
    return (
      <p className={"text-xs text-gray-500 " + className}>Detecting speakers…</p>
    );
  }

  if (devices.length === 0) {
    return (
      <p className={"text-xs text-gray-500 " + className}>
        No separate output devices found — using system default.
      </p>
    );
  }

  return (
    <label className={"block text-sm " + className}>
      <span className="mb-1 block text-xs font-medium text-gray-600">
        Speaker / headphones
      </span>
      <select
        className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        value={current?.deviceId ?? ""}
        onChange={(e) => {
          void setOutput(e.target.value);
        }}
        aria-label="Audio output device"
      >
        {devices.map((d) => (
          <option key={d.deviceId} value={d.deviceId}>
            {d.label?.trim() || `Speaker ${d.deviceId.slice(0, 6)}`}
            {d.deviceId === current?.deviceId ? " ✓" : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
