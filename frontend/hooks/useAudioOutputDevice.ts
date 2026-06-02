"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  NEW_OUTPUT_DEVICE_HINT_MS,
  getOutputPromotionRank,
  isBluetoothDevice,
  isPreferredOutput,
  shouldOfferBluetoothRelayPrompt,
} from "@/lib/audio/output-router";

export const VOICE_OUTPUT_DEVICE_STORAGE_KEY = "voice-output-device-id";

/** Chrome Android special sink IDs when enumeration is sparse. */
export const ANDROID_SPEAKER_SINK_ID = "speaker";
export const ANDROID_EARPIECE_SINK_ID = "communications";

function readStoredDeviceId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(VOICE_OUTPUT_DEVICE_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredDeviceId(deviceId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(VOICE_OUTPUT_DEVICE_STORAGE_KEY, deviceId);
  } catch {
    /* localStorage may be locked down */
  }
}

export function isAudioOutputSelectionSupported(): boolean {
  if (typeof HTMLMediaElement === "undefined") return false;
  return "setSinkId" in HTMLMediaElement.prototype;
}

async function applySinkId(
  element: HTMLMediaElement,
  deviceId: string,
): Promise<void> {
  if (!isAudioOutputSelectionSupported()) return;
  try {
    await element.setSinkId(deviceId);
  } catch {
    /* Overconstrained or revoked device — fall back to system default */
  }
}

export interface UseAudioOutputDeviceResult {
  devices: MediaDeviceInfo[];
  current: MediaDeviceInfo | null;
  setOutput: (deviceId: string) => Promise<void>;
  /** Apply the current (or stored) sink to a specific media element (e.g. test chime). */
  applyToElement: (element: HTMLMediaElement | null) => Promise<void>;
  /** Register a Twilio remote-audio (or other) sink; reapplies when output changes. */
  registerSinkElement: (element: HTMLMediaElement | null) => () => void;
  isSupported: boolean;
  enumerated: boolean;
  refresh: () => Promise<void>;
  /** Newly connected BT output worth promoting; cleared on dismiss or after 30s. */
  newDeviceJustConnected: MediaDeviceInfo | null;
  dismissNewDevice: () => void;
}

/**
 * Enumerates audio outputs, persists last choice, and routes playback via
 * `HTMLMediaElement.setSinkId`. Foundation for A5 pickers + A6 test chime.
 * voice-C7 adds `newDeviceJustConnected` via `devicechange` + label heuristics.
 *
 * @see task-voice-A5-audio-output-device-picker.md
 * @see task-voice-C7-bluetooth-airpods-relay.md
 */
export function useAudioOutputDevice(): UseAudioOutputDeviceResult {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [enumerated, setEnumerated] = useState(false);
  const [newDeviceJustConnected, setNewDeviceJustConnected] =
    useState<MediaDeviceInfo | null>(null);
  const isSupported = isAudioOutputSelectionSupported();
  const currentIdRef = useRef<string | null>(null);
  const sinkElementsRef = useRef<Set<HTMLMediaElement>>(new Set());
  const knownOutputIdsRef = useRef<Set<string>>(new Set());
  const enumerationInitializedRef = useRef(false);
  const newDeviceClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const applyToAllSinks = useCallback(
    async (deviceId: string) => {
      if (!isSupported) return;
      await Promise.all(
        Array.from(sinkElementsRef.current).map((el) =>
          applySinkId(el, deviceId),
        ),
      );
    },
    [isSupported],
  );

  const clearNewDeviceHintTimer = useCallback(() => {
    if (newDeviceClearTimerRef.current != null) {
      clearTimeout(newDeviceClearTimerRef.current);
      newDeviceClearTimerRef.current = null;
    }
  }, []);

  const dismissNewDevice = useCallback(() => {
    clearNewDeviceHintTimer();
    setNewDeviceJustConnected(null);
  }, [clearNewDeviceHintTimer]);

  const scheduleNewDeviceClear = useCallback(() => {
    clearNewDeviceHintTimer();
    newDeviceClearTimerRef.current = setTimeout(() => {
      setNewDeviceJustConnected(null);
      newDeviceClearTimerRef.current = null;
    }, NEW_OUTPUT_DEVICE_HINT_MS);
  }, [clearNewDeviceHintTimer]);

  const surfaceNewBluetoothOutput = useCallback(
    (candidate: MediaDeviceInfo, currentOutput: MediaDeviceInfo | null) => {
      if (!isSupported || !shouldOfferBluetoothRelayPrompt()) return;
      if (!isBluetoothDevice(candidate)) return;
      if (!isPreferredOutput(candidate, currentOutput)) return;
      setNewDeviceJustConnected(candidate);
      scheduleNewDeviceClear();
    },
    [isSupported, scheduleNewDeviceClear],
  );

  const refreshDevices = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) {
      setEnumerated(true);
      return;
    }
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      const outputs = all.filter((d) => d.kind === "audiooutput");

      const previousIds = knownOutputIdsRef.current;
      const currentOutput =
        outputs.find((d) => d.deviceId === currentIdRef.current) ?? null;

      if (enumerationInitializedRef.current) {
        const newlyAdded = outputs.filter(
          (d) => d.deviceId && !previousIds.has(d.deviceId),
        );
        const bluetoothNew = newlyAdded.filter(isBluetoothDevice);
        if (bluetoothNew.length > 0) {
          const best = bluetoothNew.reduce((acc, d) =>
            getOutputPromotionRank(d) > getOutputPromotionRank(acc) ? d : acc,
          );
          if (isPreferredOutput(best, currentOutput)) {
            surfaceNewBluetoothOutput(best, currentOutput);
          }
        }
      } else {
        enumerationInitializedRef.current = true;
      }

      knownOutputIdsRef.current = new Set(
        outputs.map((d) => d.deviceId).filter(Boolean),
      );

      setDevices(outputs);
      setEnumerated(true);

      const stored = readStoredDeviceId();
      const stillPresent =
        stored &&
        (outputs.some((d) => d.deviceId === stored) ||
          stored === ANDROID_SPEAKER_SINK_ID ||
          stored === ANDROID_EARPIECE_SINK_ID);
      if (stillPresent && stored) {
        setCurrentId(stored);
        currentIdRef.current = stored;
        await applyToAllSinks(stored);
      } else if (outputs.length > 0 && !currentIdRef.current) {
        const fallback = outputs[0].deviceId;
        setCurrentId(fallback);
        currentIdRef.current = fallback;
        await applyToAllSinks(fallback);
      }
    } catch {
      setEnumerated(true);
    }
  }, [applyToAllSinks, surfaceNewBluetoothOutput]);

  useEffect(() => {
    void refreshDevices();
    if (typeof navigator === "undefined" || !navigator.mediaDevices) return;
    const md = navigator.mediaDevices;
    const onDeviceChange = () => {
      void refreshDevices();
    };
    md.addEventListener("devicechange", onDeviceChange);
    return () => md.removeEventListener("devicechange", onDeviceChange);
  }, [refreshDevices]);

  const setOutput = useCallback(
    async (deviceId: string) => {
      setCurrentId(deviceId);
      currentIdRef.current = deviceId;
      writeStoredDeviceId(deviceId);
      await applyToAllSinks(deviceId);
      setNewDeviceJustConnected((prev) =>
        prev?.deviceId === deviceId ? null : prev,
      );
    },
    [applyToAllSinks],
  );

  useEffect(() => {
    return () => clearNewDeviceHintTimer();
  }, [clearNewDeviceHintTimer]);

  const applyToElement = useCallback(
    async (element: HTMLMediaElement | null) => {
      if (!element || !isSupported) return;
      const id = currentIdRef.current;
      if (!id) return;
      await applySinkId(element, id);
    },
    [isSupported],
  );

  const registerSinkElement = useCallback(
    (element: HTMLMediaElement | null) => {
      if (!element) return () => {};
      sinkElementsRef.current.add(element);
      if (currentIdRef.current) {
        void applySinkId(element, currentIdRef.current);
      }
      return () => {
        sinkElementsRef.current.delete(element);
      };
    },
    [],
  );

  const current =
    devices.find((d) => d.deviceId === currentId) ??
    (currentId
      ? ({
          deviceId: currentId,
          kind: "audiooutput",
          label: "",
          groupId: "",
          toJSON: () => ({}),
        } as MediaDeviceInfo)
      : null) ??
    devices[0] ??
    null;

  return {
    devices,
    current,
    setOutput,
    applyToElement,
    registerSinkElement,
    isSupported,
    enumerated,
    refresh: refreshDevices,
    newDeviceJustConnected,
    dismissNewDevice,
  };
}

/** Heuristic: built-in loudspeaker on mobile / desktop. */
export function pickSpeakerDevice(
  devices: MediaDeviceInfo[],
): MediaDeviceInfo | null {
  const speaker = devices.find((d) =>
    /speaker|loudspeaker|built-?in.*audio|default/i.test(d.label),
  );
  return speaker ?? devices[0] ?? null;
}

/** Heuristic: earpiece / handset on mobile. */
export function pickEarpieceDevice(
  devices: MediaDeviceInfo[],
): MediaDeviceInfo | null {
  const earpiece = devices.find((d) =>
    /earpiece|receiver|phone|handset|communications/i.test(d.label),
  );
  return earpiece ?? devices[1] ?? devices[0] ?? null;
}

/** Resolved sink id for speaker route (enumerated device or Android special id). */
export function resolveSpeakerSinkId(devices: MediaDeviceInfo[]): string {
  return pickSpeakerDevice(devices)?.deviceId ?? ANDROID_SPEAKER_SINK_ID;
}

/** Resolved sink id for earpiece route (enumerated device or Android special id). */
export function resolveEarpieceSinkId(devices: MediaDeviceInfo[]): string {
  return pickEarpieceDevice(devices)?.deviceId ?? ANDROID_EARPIECE_SINK_ID;
}

export function inferRouteFromDeviceId(
  deviceId: string | null,
  devices: MediaDeviceInfo[],
): "speaker" | "earpiece" {
  if (!deviceId) return "speaker";
  if (deviceId === ANDROID_EARPIECE_SINK_ID) return "earpiece";
  if (deviceId === ANDROID_SPEAKER_SINK_ID) return "speaker";
  const ear = pickEarpieceDevice(devices);
  if (ear?.deviceId === deviceId) return "earpiece";
  return "speaker";
}
