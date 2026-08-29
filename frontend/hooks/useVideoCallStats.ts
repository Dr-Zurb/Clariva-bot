"use client";

import { useEffect, useRef, useState } from "react";
import type { Room } from "twilio-video";
import {
  computeKbps,
  computeWindowedLossPct,
  pickFirst,
  readFps,
  readJitter,
  readPacketLossCounters,
  readQualityLimitationReason,
  readRemoteFps,
  readRemoteFreezeCount,
  readRemoteResolution,
  readResolution,
  readRtt,
  smoothMetric,
  type LooseStatsReport,
  type PacketLossCounters,
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
  /** Incoming video dimensions (what the peer is actually sending us). */
  remoteResolution: { width: number; height: number } | null;
  /** Incoming video frame rate. */
  remoteFps: number | null;
  /** Cumulative decode freezes on the incoming video track. */
  remoteFreezeCount: number | null;
  /**
   * Why our encoder is capping quality: `'cpu'`, `'bandwidth'`, `'none'`.
   * The single most useful field when someone reports "it's laggy" — it
   * says whether to blame the device or the link.
   */
  qualityLimitationReason: string | null;
}

const EMPTY_STATS: VideoCallStats = {
  rttMs: null,
  jitterMs: null,
  resolution: null,
  fps: null,
  kbpsSend: null,
  kbpsReceive: null,
  packetLossPct: null,
  remoteResolution: null,
  remoteFps: null,
  remoteFreezeCount: null,
  qualityLimitationReason: null,
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
  loss: PacketLossCounters | null;
  rttMs: number | null;
  jitterMs: number | null;
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
    loss: null,
    rttMs: null,
    jitterMs: null,
  });

  useEffect(() => {
    if (!room || !enabled) {
      setStats(EMPTY_STATS);
      prevSendRef.current = {
        bytesSent: null,
        bytesReceived: null,
        timestampMs: 0,
        loss: null,
        rttMs: null,
        jitterMs: null,
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
        const lossCounters = readPacketLossCounters(report);
        const rttMs = smoothMetric(prev.rttMs, readRtt(report));
        const jitterMs = smoothMetric(prev.jitterMs, readJitter(report));

        prevSendRef.current = {
          bytesSent: currentBytesSent,
          bytesReceived: currentBytesReceived,
          timestampMs: nowMs,
          loss: lossCounters,
          rttMs,
          jitterMs,
        };

        setStats({
          rttMs,
          jitterMs,
          resolution: readResolution(report),
          fps: readFps(report),
          kbpsSend,
          kbpsReceive,
          packetLossPct: computeWindowedLossPct(lossCounters, prev.loss),
          remoteResolution: readRemoteResolution(report),
          remoteFps: readRemoteFps(report),
          remoteFreezeCount: readRemoteFreezeCount(report),
          qualityLimitationReason: readQualityLimitationReason(report),
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
