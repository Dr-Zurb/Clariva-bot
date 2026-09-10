"use client";

import { useState } from "react";
import type {
  LocalParticipant,
  RemoteParticipant,
  Room,
} from "twilio-video";
import NetworkBars from "./NetworkBars";
import {
  usePeerConnectionBeacon,
} from "@/hooks/useConnectionBeacon";
import { useNetworkQuality } from "@/hooks/useNetworkQuality";
import { useVideoCallStats } from "@/hooks/useVideoCallStats";
import type { ConnectionStatsBeacon } from "@/lib/video/connection-stats-beacon";

export interface ConnectionReportBarsProps {
  room: Room | null;
  variant: "local" | "remote";
  localParticipant?: LocalParticipant | null;
  remoteParticipant?: RemoteParticipant | null;
  label: string;
  caption?: string;
  className?: string;
}

function formatMs(n: number | null | undefined): string | null {
  return n == null ? null : `${n} ms`;
}

function formatRes(
  r: { width: number; height: number } | { w: number; h: number } | null | undefined,
): string | null {
  if (!r) return null;
  if ("width" in r) return `${r.width}×${r.height}`;
  return `${r.w}×${r.h}`;
}

function formatFps(n: number | null | undefined): string | null {
  return n == null ? null : `${n}`;
}

function formatKbps(n: number | null | undefined): string | null {
  if (n == null) return null;
  return n >= 1000 ? `${(n / 1000).toFixed(1)} Mbps` : `${n} kbps`;
}

function formatLoss(n: number | null | undefined): string | null {
  return n == null ? null : `${n.toFixed(n < 1 ? 2 : 1)}%`;
}

function StatsRow({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-0.5">
      <span className="text-gray-500">{label}</span>
      <span className="font-mono text-gray-900">{value ?? "—"}</span>
    </div>
  );
}

function LocalTooltip({
  level,
  rttMs,
  jitterMs,
  packetLossPct,
  resolution,
  fps,
  kbpsSend,
  kbpsReceive,
  qualityLimitationReason,
}: {
  level: number | null;
  rttMs: number | null;
  jitterMs: number | null;
  packetLossPct: number | null;
  resolution: { width: number; height: number } | null;
  fps: number | null;
  kbpsSend: number | null;
  kbpsReceive: number | null;
  qualityLimitationReason: string | null;
}) {
  return (
    <div className="space-y-0.5">
      <p className="mb-1 font-semibold text-gray-900">Your connection</p>
      <StatsRow
        label="Quality"
        value={level == null ? null : `${level}/5`}
      />
      <StatsRow label="RTT" value={formatMs(rttMs)} />
      <StatsRow label="Jitter" value={formatMs(jitterMs)} />
      <StatsRow label="Loss" value={formatLoss(packetLossPct)} />
      <StatsRow label="Resolution" value={formatRes(resolution)} />
      <StatsRow label="FPS" value={formatFps(fps)} />
      <StatsRow label="Sending" value={formatKbps(kbpsSend)} />
      <StatsRow label="Receiving" value={formatKbps(kbpsReceive)} />
      {qualityLimitationReason &&
        qualityLimitationReason !== "none" && (
          <StatsRow label="Limited by" value={qualityLimitationReason} />
        )}
    </div>
  );
}

function RemoteTooltip({
  name,
  level,
  beacon,
  stale,
  incomingRes,
  incomingFps,
  kbpsReceive,
  freezes,
}: {
  name: string;
  level: number | null;
  beacon: ConnectionStatsBeacon | null;
  stale: boolean;
  incomingRes: { width: number; height: number } | null;
  incomingFps: number | null;
  kbpsReceive: number | null;
  freezes: number | null;
}) {
  const quality = beacon?.level ?? level;
  return (
    <div className="space-y-0.5">
      <p className="mb-1 font-semibold text-gray-900">{name}&apos;s connection</p>
      <StatsRow
        label="Quality"
        value={quality == null ? null : `${quality}/5`}
      />
      <StatsRow label="RTT" value={formatMs(beacon?.rttMs)} />
      <StatsRow label="Jitter" value={formatMs(beacon?.jitterMs)} />
      <StatsRow label="Loss" value={formatLoss(beacon?.lossPct)} />
      <StatsRow label="Sending" value={formatKbps(beacon?.kbps)} />
      <StatsRow
        label="Their camera"
        value={
          beacon?.res
            ? `${formatRes(beacon.res) ?? "—"}${beacon.fps != null ? ` · ${beacon.fps} fps` : ""}`
            : null
        }
      />
      {beacon?.limit && beacon.limit !== "none" ? (
        <StatsRow label="Limited by" value={beacon.limit} />
      ) : null}
      <StatsRow label="Incoming" value={formatRes(incomingRes)} />
      <StatsRow label="Incoming FPS" value={formatFps(incomingFps)} />
      <StatsRow label="Receiving" value={formatKbps(kbpsReceive)} />
      <StatsRow label="Freezes" value={formatFps(freezes)} />
      <p className="mt-2 text-[11px] leading-snug text-gray-500">
        {beacon && !stale
          ? "RTT, loss, and limit are measured on their device."
          : stale && beacon
            ? "Their last report is stale — incoming figures are measured here."
            : "Incoming figures are measured on this device. Waiting for their report."}
      </p>
    </div>
  );
}

/**
 * Network bars + stats popover. Owns `getStats` polling so a 2s tick
 * cannot re-render `<VideoRoom>`. Remote side prefers the peer DataTrack
 * beacon when it is fresh.
 */
export default function ConnectionReportBars({
  room,
  variant,
  localParticipant = null,
  remoteParticipant = null,
  label,
  caption,
  className,
}: ConnectionReportBarsProps) {
  const [open, setOpen] = useState(false);
  const localNq = useNetworkQuality(
    variant === "local" ? localParticipant : null,
  );
  const remoteNq = useNetworkQuality(
    variant === "remote" ? remoteParticipant : null,
  );
  const callStats = useVideoCallStats(room, { enabled: open });
  const peer = usePeerConnectionBeacon(
    variant === "remote" ? remoteParticipant : null,
  );

  const level =
    variant === "local"
      ? localNq.level
      : (peer.beacon && !peer.stale ? peer.beacon.level : null) ??
        remoteNq.level;

  const tooltip =
    variant === "local" ? (
      <LocalTooltip
        level={localNq.level}
        rttMs={callStats.rttMs}
        jitterMs={callStats.jitterMs}
        packetLossPct={callStats.packetLossPct}
        resolution={callStats.resolution}
        fps={callStats.fps}
        kbpsSend={callStats.kbpsSend}
        kbpsReceive={callStats.kbpsReceive}
        qualityLimitationReason={callStats.qualityLimitationReason}
      />
    ) : (
      <RemoteTooltip
        name={label.replace(/'s connection$/i, "")}
        level={remoteNq.level}
        beacon={peer.beacon}
        stale={peer.stale}
        incomingRes={callStats.remoteResolution}
        incomingFps={callStats.remoteFps}
        kbpsReceive={callStats.kbpsReceive}
        freezes={callStats.remoteFreezeCount}
      />
    );

  return (
    <NetworkBars
      level={level}
      label={label}
      caption={caption}
      className={className}
      tooltip={tooltip}
      onOpenChange={setOpen}
    />
  );
}
