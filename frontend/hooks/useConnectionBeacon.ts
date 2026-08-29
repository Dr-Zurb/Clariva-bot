"use client";

import { useEffect, useRef, useState } from "react";
import {
  LocalDataTrack,
  type RemoteDataTrack,
  type RemoteParticipant,
  type Room,
} from "twilio-video";
import {
  CONNECTION_STATS_TRACK_NAME,
  isConnectionStatsStale,
  parseConnectionStatsBeacon,
  type ConnectionStatsBeacon,
} from "@/lib/video/connection-stats-beacon";
import {
  computeKbps,
  computeWindowedLossPct,
  pickFirst,
  readFps,
  readJitter,
  readPacketLossCounters,
  readQualityLimitationReason,
  readResolution,
  readRtt,
  smoothMetric,
  type LooseStatsReport,
  type PacketLossCounters,
} from "@/lib/video/twilio-stats-parse";

const BEACON_INTERVAL_MS = 2000;

interface SenderPrev {
  bytesSent: number | null;
  timestampMs: number;
  loss: PacketLossCounters | null;
  rttMs: number | null;
  jitterMs: number | null;
}

function buildBeacon(
  room: Room,
  report: LooseStatsReport,
  prev: SenderPrev,
  nowMs: number,
): { beacon: ConnectionStatsBeacon; next: SenderPrev } {
  const localVideo = pickFirst(report.localVideoTrackStats);
  const currentBytesSent =
    typeof localVideo?.bytesSent === "number" ? localVideo.bytesSent : null;
  const deltaMs = prev.timestampMs > 0 ? nowMs - prev.timestampMs : 0;
  const rttMs = smoothMetric(prev.rttMs, readRtt(report));
  const jitterMs = smoothMetric(prev.jitterMs, readJitter(report));
  const loss = readPacketLossCounters(report);
  const res = readResolution(report);
  const level =
    typeof room.localParticipant.networkQualityLevel === "number"
      ? room.localParticipant.networkQualityLevel
      : null;
  const next: SenderPrev = {
    bytesSent: currentBytesSent,
    timestampMs: nowMs,
    loss,
    rttMs,
    jitterMs,
  };
  return {
    next,
    beacon: {
      v: 1,
      t: nowMs,
      level,
      rttMs,
      jitterMs,
      lossPct: computeWindowedLossPct(loss, prev.loss),
      res: res ? { w: res.width, h: res.height } : null,
      fps: readFps(report),
      kbps: computeKbps(currentBytesSent, prev.bytesSent, deltaMs),
      limit: readQualityLimitationReason(report),
    },
  };
}

/**
 * Always-on sender. Polls `getStats` and publishes a compact JSON
 * snapshot. No React state — VideoRoom must not re-render on the tick.
 * Fail-soft: if the DataTrack cannot publish, the call continues.
 */
export function useConnectionBeaconSender(room: Room | null): void {
  useEffect(() => {
    if (!room) return;
    let cancelled = false;
    let dataTrack: LocalDataTrack | null = null;
    const prev: SenderPrev = {
      bytesSent: null,
      timestampMs: 0,
      loss: null,
      rttMs: null,
      jitterMs: null,
    };

    const sampleAndSend = async () => {
      if (!dataTrack || cancelled) return;
      try {
        const reports = (await room.getStats()) as unknown as LooseStatsReport[];
        if (cancelled) return;
        const report = pickFirst(reports);
        if (!report) return;
        const { beacon, next } = buildBeacon(room, report, prev, Date.now());
        prev.bytesSent = next.bytesSent;
        prev.timestampMs = next.timestampMs;
        prev.loss = next.loss;
        prev.rttMs = next.rttMs;
        prev.jitterMs = next.jitterMs;
        dataTrack.send(JSON.stringify(beacon));
      } catch {
        // Mid-disconnect / unpublished track — next tick recovers.
      }
    };

    void (async () => {
      try {
        const track = new LocalDataTrack({
          name: CONNECTION_STATS_TRACK_NAME,
          ordered: false,
          maxPacketLifeTime: 2500,
        });
        if (cancelled) {
          return;
        }
        dataTrack = track;
        await room.localParticipant.publishTrack(track);
        if (cancelled) return;
        void sampleAndSend();
      } catch {
        dataTrack = null;
      }
    })();

    const interval = window.setInterval(() => {
      void sampleAndSend();
    }, BEACON_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      if (dataTrack) {
        try {
          room.localParticipant.unpublishTrack(dataTrack);
        } catch {
          // Already unpublished.
        }
      }
    };
  }, [room]);
}

export interface PeerConnectionBeaconState {
  beacon: ConnectionStatsBeacon | null;
  stale: boolean;
}

/**
 * Latest snapshot from the counterparty's DataTrack. Lives in the
 * report child so a 2s message cannot re-render VideoRoom.
 */
export function usePeerConnectionBeacon(
  participant: RemoteParticipant | null,
): PeerConnectionBeaconState {
  const [beacon, setBeacon] = useState<ConnectionStatsBeacon | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const attachedRef = useRef(new Set<RemoteDataTrack>());

  useEffect(() => {
    if (!participant) {
      setBeacon(null);
      return;
    }

    const onMessage = (data: string | ArrayBuffer) => {
      const parsed = parseConnectionStatsBeacon(data);
      if (parsed) {
        setBeacon(parsed);
        setNowMs(Date.now());
      }
    };

    const attach = (track: RemoteDataTrack) => {
      if (track.name && track.name !== CONNECTION_STATS_TRACK_NAME) return;
      if (attachedRef.current.has(track)) return;
      attachedRef.current.add(track);
      track.on("message", onMessage);
    };

    const onSubscribed = (track: { kind: string }) => {
      if (track.kind === "data") {
        attach(track as RemoteDataTrack);
      }
    };

    participant.dataTracks.forEach((pub) => {
      if (pub.track) attach(pub.track);
    });
    participant.on("trackSubscribed", onSubscribed);

    const staleTick = window.setInterval(() => {
      setNowMs(Date.now());
    }, 2000);

    const attached = attachedRef.current;
    return () => {
      window.clearInterval(staleTick);
      participant.off("trackSubscribed", onSubscribed);
      attached.forEach((track) => {
        track.off("message", onMessage);
      });
      attached.clear();
    };
  }, [participant]);

  return {
    beacon,
    stale: isConnectionStatsStale(beacon, nowMs),
  };
}
