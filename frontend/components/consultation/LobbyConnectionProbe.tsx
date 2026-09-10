"use client";

/**
 * crc-11 — advisory connection result in the video lobby.
 *
 * Auto-runs once on Wi-Fi / unknown. On cellular (or save-data) waits
 * for an explicit "Test connection" tap so we don't burn mobile data
 * to tell the patient their mobile data is slow.
 *
 * Failure / timeout / abort → render nothing (CellularDataWarning
 * precedent). Never blocks Continue or auto-connect.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CONNECTION_PROBE_TIMEOUT_MS,
  readProbeAutoRunGate,
  runConnectionProbe,
  type ConnectionProbeTier,
} from "@/lib/consultation/connection-probe";

const TIER_COPY: Record<
  ConnectionProbeTier,
  { label: string; hint: string; className: string }
> = {
  good: {
    label: "Good",
    hint: "Your connection looks ready for video.",
    className: "border-emerald-200 bg-emerald-50 text-emerald-900",
  },
  marginal: {
    label: "Fair",
    hint: "Video should work. If it stutters, move closer to your router.",
    className: "border-amber-200 bg-amber-50 text-amber-900",
  },
  poor: {
    label: "Poor",
    hint: "Move closer to your router, switch to audio-only, or use the voice consult instead.",
    className: "border-red-200 bg-red-50 text-red-900",
  },
};

type ProbeUi =
  | { kind: "boot" }
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "result"; tier: ConnectionProbeTier }
  | { kind: "hidden" };

export default function LobbyConnectionProbe() {
  const [ui, setUi] = useState<ProbeUi>({ kind: "boot" });
  const ranAutoRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const startProbe = useCallback((showRunning: boolean) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const timeoutId = window.setTimeout(() => {
      controller.abort();
    }, CONNECTION_PROBE_TIMEOUT_MS);

    if (showRunning) setUi({ kind: "running" });

    void (async () => {
      try {
        const tier = await runConnectionProbe({ signal: controller.signal });
        if (abortRef.current !== controller) return;
        setUi({ kind: "result", tier });
      } catch {
        if (abortRef.current !== controller) return;
        setUi({ kind: "hidden" });
      } finally {
        window.clearTimeout(timeoutId);
      }
    })();
  }, []);

  useEffect(() => {
    if (ranAutoRef.current) return;
    ranAutoRef.current = true;
    const gate = readProbeAutoRunGate();
    if (!gate.autoRun) {
      setUi({ kind: "idle" });
      return;
    }
    startProbe(false);
  }, [startProbe]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  if (ui.kind === "boot" || ui.kind === "hidden") return null;

  if (ui.kind === "idle") {
    return (
      <div className="text-center" data-testid="lobby-connection-probe-idle">
        <button
          type="button"
          onClick={() => startProbe(true)}
          className="text-sm text-gray-600 underline-offset-2 hover:underline"
        >
          Test connection
        </button>
      </div>
    );
  }

  if (ui.kind === "running") {
    return (
      <p
        className="text-center text-sm text-gray-500"
        data-testid="lobby-connection-probe-running"
        role="status"
      >
        Checking connection…
      </p>
    );
  }

  const copy = TIER_COPY[ui.tier];
  return (
    <div
      className={`rounded-xl border px-4 py-3 text-center text-sm ${copy.className}`}
      data-testid="lobby-connection-probe"
      data-tier={ui.tier}
      role="status"
    >
      <p className="font-medium">Connection: {copy.label}</p>
      <p className="mt-1 text-xs opacity-90">{copy.hint}</p>
      <button
        type="button"
        onClick={() => startProbe(true)}
        className="mt-2 text-xs underline-offset-2 hover:underline"
      >
        Test again
      </button>
    </div>
  );
}
