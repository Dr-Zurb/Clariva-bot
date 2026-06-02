"use client";

import { useEffect, useRef, useState } from "react";
import type { Room } from "twilio-video";
import {
  computeKbps,
  pickFirst,
  readFps,
  readJitter,
  readPacketLossPct,
  readResolution,
  readRtt,
  type LooseStatsReport,
} from "@/lib/video/twilio-stats-parse";

/**
 * Sub-batch A · task-video-A8 — `Room.getStats()` polling wrapper.
 *
 * Twilio exposes a per-peer-connection stats array via `room.getStats()`
 * (returns `Promise<StatsReport[]>`). For 1-on-1 calls there's one
 * report; for multi-party (C8) there's one per remote peer. We
 * aggregate into a single tooltip-friendly shape here, taking the
 * first peer connection only — multi-party stats UI is C8's problem.
 *
 * Polling cadence is 2s (per task draft Note #1). That matches
 * Twilio's recommended client-side cadence and is cheap (the SDK
 * caches recent values; we don't trigger a network round-trip on
 * each call). On mobile, 2s is also responsive enough that the
 * tooltip never feels stale when the user opens it after a network
 * hiccup.
 *
 * `kbpsSend` / `kbpsReceive` are computed from the **delta** between
 * two consecutive samples — Twilio reports cumulative `bytesSent` /
 * `bytesReceived`, so the first sample has no prior to delta against
 * (returns `null`). After the second sample (~2s later) the values
 * stabilize and the tooltip shows real numbers.
 *
 * The hook delegates field extraction to
 * `frontend/lib/video/twilio-stats-parse.ts` (shared with the E.6 QoS
 * reporter). The parser module owns the SDK-version quirks
 * (seconds-vs-ms heuristics, missing-field tolerance, audio-level
 * scaling). This hook just owns the React state shape + the 2s polling
 * loop + the per-tick byte-delta bookkeeping.
 *
 * Pulled FORWARD: voice batch has no equivalent yet. When voice ships
 * its own QoS surface (likely E1 / E6 sibling), it can either reuse
 * this hook or fork — voice is audio-only so it'd skip the
 * `resolution` / `fps` fields.
 */
export interface VideoCallStats {
  /** Round-trip time in milliseconds (audio track is the most reliable source). `null` until first sample. */
  rttMs: number | null;
  /** Audio jitter in milliseconds (Twilio reports seconds; we convert). `null` until first sample. */
  jitterMs: number | null;
  /** Locally-sent video dimensions; `null` if no local video or pre-first-sample. */
  resolution: { width: number; height: number } | null;
  /** Locally-sent video frame rate. `null` until first sample. */
  fps: number | null;
  /** Outgoing video bitrate in kbps, computed from byte delta. `null` until SECOND sample. */
  kbpsSend: number | null;
  /** Incoming video bitrate in kbps, computed from byte delta. `null` until SECOND sample. */
  kbpsReceive: number | null;
  /**
   * Lifetime packet-loss percentage from local audio counters.
   * `null` until first sample with counters populated.
   */
  packetLossPct: number | null;
}

const EMPTY_STATS: VideoCallStats = {
  rttMs: null,
  jitterMs: null,
  resolution: null,
  fps: null,
  kbpsSend: null,
  kbpsReceive: null,
  packetLossPct: null,
};

export interface UseVideoCallStatsOptions {
  /**
   * When `false`, polling is paused (no `getStats()` calls). Use for
   * voice A4 where stats run only while the network-bars tooltip is open.
   * Defaults to `true` (video A8 polls continuously while connected).
   */
  enabled?: boolean;
}

const POLL_INTERVAL_MS = 2000;

interface PreviousSample {
  bytesSent: number | null;
  bytesReceived: number | null;
  timestampMs: number;
}

/**
 * Hook: poll Twilio's `Room.getStats()` every 2s while the room is
 * non-null, returning the latest aggregated stats. Returns
 * `EMPTY_STATS` when no room is mounted (e.g. pre-connect).
 */
export function useVideoCallStats(
  room: Room | null,
  options: UseVideoCallStatsOptions = {},
): VideoCallStats {
  const { enabled = true } = options;
  const [stats, setStats] = useState<VideoCallStats>(EMPTY_STATS);
  const prevSendRef = useRef<PreviousSample>({
    bytesSent: null,
    bytesReceived: null,
    timestampMs: 0,
  });

  useEffect(() => {
    if (!room || !enabled) {
      setStats(EMPTY_STATS);
      prevSendRef.current = {
        bytesSent: null,
        bytesReceived: null,
        timestampMs: 0,
      };
      return;
    }

    let cancelled = false;

    const sample = async () => {
      try {
        // Twilio types `getStats` as returning an array of `StatsReport`.
        // Cast through `unknown` to our permissive structural type so we
        // can read fields that may or may not be in the type defs of
        // the installed SDK version (twilio-video@2.34.0).
        const reports = (await room.getStats()) as unknown as LooseStatsReport[];
        if (cancelled) return;

        const report = pickFirst(reports);
        if (!report) {
          setStats(EMPTY_STATS);
          return;
        }

        const localVideo = pickFirst(report.localVideoTrackStats);
        const remoteVideo = pickFirst(report.remoteVideoTrackStats);

        const nowMs = Date.now();
        const currentBytesSent =
          typeof localVideo?.bytesSent === "number"
            ? localVideo.bytesSent
            : null;
        const currentBytesReceived =
          typeof remoteVideo?.bytesReceived === "number"
            ? remoteVideo.bytesReceived
            : null;

        const prev = prevSendRef.current;
        const deltaMs = prev.timestampMs > 0 ? nowMs - prev.timestampMs : 0;
        const kbpsSend = computeKbps(
          currentBytesSent,
          prev.bytesSent,
          deltaMs,
        );
        const kbpsReceive = computeKbps(
          currentBytesReceived,
          prev.bytesReceived,
          deltaMs,
        );

        prevSendRef.current = {
          bytesSent: currentBytesSent,
          bytesReceived: currentBytesReceived,
          timestampMs: nowMs,
        };

        setStats({
          rttMs: readRtt(report),
          jitterMs: readJitter(report),
          resolution: readResolution(report),
          fps: readFps(report),
          kbpsSend,
          kbpsReceive,
          packetLossPct: readPacketLossPct(report),
        });
      } catch {
        // Stats reads can throw transiently mid-disconnect; swallow
        // and let the next tick recover. Don't reset existing stats —
        // a stale-but-good value is better than blanking the tooltip
        // on a single failed read.
      }
    };

    // Kick off an immediate sample so the tooltip isn't blank for the
    // first 2s; subsequent samples populate kbps via the delta.
    sample();
    const interval = setInterval(sample, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [room, enabled]);

  return stats;
}
