/**
 * crc-11 — one-shot lobby connection probe.
 *
 * Downloads a known-size same-origin static asset and classifies the
 * measured throughput into the same three bands the in-call Network
 * Quality bars use (A8):
 *
 *   poor      ≈ Twilio levels 1–2 (1 bar, red)
 *   marginal  ≈ Twilio level 3     (2 bars, yellow / "fair")
 *   good      ≈ Twilio levels 4–5  (3–4 bars, green)
 *
 * Budget: one GET of
 * `/twilio-video-processors-assets/selfie_segmentation_landscape.tflite`
 * (~250 KB on disk). cache: 'no-store'. Timeout 8s. No loop.
 */

import {
  detectCellularConnection,
  type CellularDetection,
} from "@/lib/video/data-estimate";

/** Same-origin probe target. File is 250177 bytes (~250 KB). */
export const CONNECTION_PROBE_URL =
  "/twilio-video-processors-assets/selfie_segmentation_landscape.tflite";

export const CONNECTION_PROBE_TIMEOUT_MS = 8_000;

/**
 * Throughput floors in Mbps, aligned with A8's bar colors:
 *   < 0.5  → 1 bar (poor)
 *   < 1.5  → 2 bars (fair / marginal)
 *   ≥ 1.5  → 3–4 bars (good)
 */
export const PROBE_POOR_BELOW_MBPS = 0.5;
export const PROBE_MARGINAL_BELOW_MBPS = 1.5;

export type ConnectionProbeTier = "good" | "marginal" | "poor";

export function classifyProbeMbps(mbps: number): ConnectionProbeTier {
  if (!Number.isFinite(mbps) || mbps < PROBE_POOR_BELOW_MBPS) return "poor";
  if (mbps < PROBE_MARGINAL_BELOW_MBPS) return "marginal";
  return "good";
}

export function shouldAutoRunConnectionProbe(input: {
  detection: CellularDetection;
  saveData: boolean;
}): boolean {
  if (input.saveData) return false;
  if (input.detection === "cellular") return false;
  return true;
}

export function readConnectionSaveData(): boolean {
  if (typeof navigator === "undefined") return false;
  const conn = (navigator as unknown as { connection?: { saveData?: boolean } })
    .connection;
  return conn?.saveData === true;
}

export async function runConnectionProbe(input: {
  signal: AbortSignal;
  fetchImpl?: typeof fetch;
  now?: () => number;
}): Promise<ConnectionProbeTier> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const now =
    input.now ??
    (() =>
      typeof performance !== "undefined" ? performance.now() : Date.now());
  const url = `${CONNECTION_PROBE_URL}?crc11=${Date.now()}`;
  const started = now();
  const res = await fetchImpl(url, {
    cache: "no-store",
    signal: input.signal,
  });
  if (!res.ok) {
    throw new Error("probe_http");
  }
  const buf = await res.arrayBuffer();
  if (buf.byteLength <= 0) {
    throw new Error("probe_empty");
  }
  const elapsedSec = (now() - started) / 1000;
  if (!(elapsedSec > 0)) {
    throw new Error("probe_elapsed");
  }
  const mbps = (buf.byteLength * 8) / elapsedSec / 1_000_000;
  return classifyProbeMbps(mbps);
}

export function readProbeAutoRunGate(): {
  detection: CellularDetection;
  saveData: boolean;
  autoRun: boolean;
} {
  const detection = detectCellularConnection();
  const saveData = readConnectionSaveData();
  return {
    detection,
    saveData,
    autoRun: shouldAutoRunConnectionProbe({ detection, saveData }),
  };
}
