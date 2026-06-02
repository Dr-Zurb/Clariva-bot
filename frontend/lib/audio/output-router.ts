/**
 * Bluetooth / wired output routing heuristics (voice T6.34 / task-voice-C7).
 *
 * Web APIs do not expose audio transport type reliably; label matching is the
 * v1 approach until W3C `MediaDeviceInfo.transport` ships broadly.
 *
 * @see task-voice-C7-bluetooth-airpods-relay.md
 */

import { isIOSUserAgent } from "@/lib/video/screen-share-support";

/** Known Bluetooth headset brand prefixes (label heuristic). */
const BLUETOOTH_BRAND_PREFIXES: ReadonlyArray<string> = [
  "airpods",
  "beats",
  "bose",
  "jabra",
  "sony wh-",
  "sony wf-",
  "galaxy buds",
  "pixel buds",
  "nothing ear",
  "anker",
  "plantronics",
  "poly ",
  "sennheiser momentum",
];

type MediaDeviceInfoWithTransport = MediaDeviceInfo & {
  transport?: string;
};

function normalizedLabel(device: MediaDeviceInfo): string {
  return device.label.trim().toLowerCase();
}

/**
 * Future W3C transport field when exposed by the browser.
 */
function transportIsBluetooth(device: MediaDeviceInfo): boolean {
  const transport = (device as MediaDeviceInfoWithTransport).transport;
  return transport === "bluetooth";
}

/**
 * Heuristic: device is a Bluetooth audio output (AirPods, BT headsets, etc.).
 */
export function isBluetoothDevice(device: MediaDeviceInfo): boolean {
  if (transportIsBluetooth(device)) return true;

  const label = normalizedLabel(device);
  if (!label) return false;

  if (label.includes("airpods")) return true;
  if (/\bbluetooth\b/.test(label) || /\bbt\b/.test(label)) return true;

  if (BLUETOOTH_BRAND_PREFIXES.some((prefix) => label.includes(prefix))) {
    return true;
  }

  if (
    /headphones?/.test(label) &&
    (/\bbluetooth\b/.test(label) || /\bbt\b/.test(label))
  ) {
    return true;
  }

  return false;
}

/** Promotion rank: higher = more desirable as a call output route. */
export type OutputPromotionRank = 0 | 1 | 2 | 3;

/**
 * Rank outputs for promotion heuristics:
 * Bluetooth (3) > wired headphones (2) > built-in speaker/earpiece (1) > unknown (0).
 */
export function getOutputPromotionRank(device: MediaDeviceInfo): OutputPromotionRank {
  if (isBluetoothDevice(device)) return 3;

  const label = normalizedLabel(device);
  if (!label) return 0;

  if (
    /headphones?|headset|earbud|in-?ear|over-?ear|usb audio|usb headset/i.test(
      label,
    ) &&
    !isBluetoothDevice(device)
  ) {
    return 2;
  }

  if (
    /speaker|loudspeaker|built-?in|default|earpiece|receiver|handset|communications|phone/i.test(
      label,
    )
  ) {
    return 1;
  }

  return 0;
}

/**
 * True when switching from `prevDevice` to `device` is a promotion (e.g. BT over speaker).
 */
export function isPreferredOutput(
  device: MediaDeviceInfo,
  prevDevice: MediaDeviceInfo | null,
): boolean {
  const nextRank = getOutputPromotionRank(device);
  const prevRank = prevDevice ? getOutputPromotionRank(prevDevice) : 0;
  return nextRank > prevRank;
}

/**
 * User-facing toast copy for a newly detected output device.
 */
export function getNewOutputToastMessage(device: MediaDeviceInfo): string {
  const label = normalizedLabel(device);
  if (label.includes("airpods")) {
    return "AirPods detected — switch?";
  }
  if (isBluetoothDevice(device)) {
    return "Bluetooth headset detected — switch?";
  }
  return "New audio output detected — switch?";
}

/**
 * iOS routes AirPods at the OS level; mid-call `setSinkId` relay prompts are redundant.
 * Gate the auto-detect toast off on iPhone / iPad / iPod only (desktop Safari + Mac OK).
 */
export function shouldOfferBluetoothRelayPrompt(userAgent?: string | null): boolean {
  return !isIOSUserAgent(userAgent);
}

export const NEW_OUTPUT_DEVICE_HINT_MS = 30_000;
export const NEW_OUTPUT_TOAST_AUTO_DISMISS_MS = 10_000;
