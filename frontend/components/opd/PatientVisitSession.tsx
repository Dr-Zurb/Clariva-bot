"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  acceptOpdEarlyJoin,
  declineOpdEarlyJoin,
  getOpdSessionSnapshot,
  postLobbyHeartbeat,
} from "@/lib/api";
import type { PatientOpdSnapshot } from "@/types/opd-session";
import {
  DOCTOR_BUSY_OTHER_PATIENT,
  QUEUE_ETA_LEAD,
  formatQueueEtaRange,
} from "@/lib/consultation/lobby-wait-copy";
import {
  LobbyReconnectNotice,
  useLobbyReconnect,
} from "@/hooks/useLobbyReconnect";
import OpdAppointmentCard from "./OpdAppointmentCard";
import DelayBanner from "./DelayBanner";
import EarlyInviteBanner from "./EarlyInviteBanner";
import PrimaryCta from "./PrimaryCta";
import TurnSoonBanner from "./TurnSoonBanner";
import { formatDateTime, formatTime } from "@/lib/format-date";

interface PatientVisitSessionProps {
  consultationToken: string;
}

/** Backend default for `PatientOpdSnapshot.suggestedPollSeconds` (CRC2-D1). */
const FALLBACK_POLL_SECONDS = 20;

function formatSlotWindow(slotStart?: string, slotEnd?: string): string {
  if (!slotStart || !slotEnd) return "";
  return `${formatDateTime(slotStart, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })} – ${formatTime(slotEnd, {
    hour: "numeric",
    minute: "2-digit",
  })}`;
}

/**
 * §6.4 patient dashboard: banners, mode-specific copy, primary CTA (e-task-opd-05).
 */
export default function PatientVisitSession({
  consultationToken,
}: PatientVisitSessionProps) {
  const [snapshot, setSnapshot] = useState<PatientOpdSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const snapshotRef = useRef<PatientOpdSnapshot | null>(null);
  snapshotRef.current = snapshot;
  const [earlyBusy, setEarlyBusy] = useState(false);

  const refetch = useCallback(async () => {
    const tok = consultationToken.trim();
    if (!tok) return;
    try {
      const res = await getOpdSessionSnapshot(tok);
      if (mountedRef.current) {
        setSnapshot(res.data.snapshot);
        setError(null);
        setLoading(false);
      }
    } catch (err) {
      // Stale-while-revalidate: keep the last good snapshot. Full-page
      // error only when we have nothing to show (crc-07).
      if (mountedRef.current && snapshotRef.current == null) {
        setError(err instanceof Error ? err.message : "Failed to load visit");
        setLoading(false);
      }
    }
  }, [consultationToken]);

  // crc-17 / CRC2-D3 — heartbeat only. Snapshot poll is independent below.
  const lobbyTick = useCallback(async () => {
    const tok = consultationToken.trim();
    if (!tok) throw new Error("missing_token");
    await postLobbyHeartbeat(tok);
  }, [consultationToken]);

  const { reconnecting } = useLobbyReconnect({
    enabled: Boolean(consultationToken.trim()),
    onTick: lobbyTick,
  });

  useEffect(() => {
    mountedRef.current = true;
    if (!consultationToken.trim()) {
      setLoading(false);
    }
    return () => {
      mountedRef.current = false;
    };
  }, [consultationToken]);

  useEffect(() => {
    if (!consultationToken.trim()) return;
    void refetch();
  }, [consultationToken, refetch]);

  const pollSeconds =
    snapshot?.suggestedPollSeconds != null && snapshot.suggestedPollSeconds > 0
      ? snapshot.suggestedPollSeconds
      : FALLBACK_POLL_SECONDS;

  // crc-07 — server-driven snapshot interval. Own visibility listener
  // (cadence ≠ heartbeat; crc-17's listener cannot re-arm this clock).
  useEffect(() => {
    if (!consultationToken.trim()) return;

    let intervalId: number | null = null;

    const clear = () => {
      if (intervalId != null) {
        window.clearInterval(intervalId);
        intervalId = null;
      }
    };

    const arm = () => {
      clear();
      if (typeof document !== "undefined" && document.hidden) return;
      intervalId = window.setInterval(() => {
        void refetch();
      }, pollSeconds * 1000);
    };

    arm();

    const onVisibility = () => {
      if (document.hidden) {
        clear();
        return;
      }
      void refetch();
      arm();
    };

    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clear();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [consultationToken, refetch, pollSeconds]);

  if (loading && !snapshot) {
    return (
      <main className="min-h-screen bg-gray-50 p-4">
        <LobbyReconnectNotice show={reconnecting} />
        <div className="mx-auto max-w-lg">
          <p className="text-center text-gray-600">Loading your visit…</p>
        </div>
      </main>
    );
  }

  if (error && !snapshot) {
    return (
      <main className="min-h-screen bg-gray-50 p-4">
        <div className="mx-auto max-w-lg rounded-lg border border-red-200 bg-red-50 p-6 text-center">
          <h1 className="text-lg font-semibold text-red-800">
            Unable to load visit
          </h1>
          <p className="mt-2 text-sm text-red-700">{error}</p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="mt-4 rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
          >
            Try again
          </button>
        </div>
      </main>
    );
  }

  if (!snapshot) {
    return null;
  }

  const delay =
    snapshot.delayMinutes != null && snapshot.delayMinutes > 0
      ? snapshot.delayMinutes
      : null;
  const showEarly =
    snapshot.opdMode === "slot" &&
    snapshot.earlyInviteAvailable === true &&
    (snapshot.status === "pending" || snapshot.status === "confirmed");

  const showQueueColdCopy =
    snapshot.opdMode === "queue" &&
    snapshot.etaMinutes != null &&
    snapshot.etaRange &&
    snapshot.etaRange.maxMinutes - snapshot.etaRange.minMinutes >= 8;

  const showWaitHint =
    snapshot.opdMode === "queue" &&
    (snapshot.aheadCount ?? 0) > 0 &&
    (snapshot.status === "pending" || snapshot.status === "confirmed");

  const showTurnSoon =
    snapshot.inAppNotifications?.some((n) => n.type === "your_turn_soon") ===
    true;

  const handleAcceptEarly = async () => {
    setEarlyBusy(true);
    try {
      await acceptOpdEarlyJoin(consultationToken);
      await refetch();
    } finally {
      setEarlyBusy(false);
    }
  };

  const handleDeclineEarly = async () => {
    setEarlyBusy(true);
    try {
      await declineOpdEarlyJoin(consultationToken);
      await refetch();
    } finally {
      setEarlyBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-50 p-4 pb-12">
      <LobbyReconnectNotice show={reconnecting} />
      <div className="mx-auto max-w-lg space-y-4">
        <OpdAppointmentCard mode={snapshot.opdMode}>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Status:{" "}
              <span className="font-medium capitalize text-gray-900">
                {snapshot.status}
              </span>
            </p>

            {snapshot.doctorBusyWith === "other_patient" ? (
              <div
                className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800"
                role="status"
              >
                {DOCTOR_BUSY_OTHER_PATIENT}
              </div>
            ) : null}

            {snapshot.doctorBusyWith === "you" ? (
              <div
                className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-900"
                role="status"
              >
                Your consultation is active. Use the button below to join video.
              </div>
            ) : null}

            {delay != null ? <DelayBanner delayMinutes={delay} /> : null}

            {showEarly ? (
              <EarlyInviteBanner
                expiresAt={snapshot.earlyInviteExpiresAt}
                busy={earlyBusy}
                onAccept={handleAcceptEarly}
                onDecline={handleDeclineEarly}
              />
            ) : null}

            {snapshot.opdMode === "slot" &&
            snapshot.slotStart &&
            snapshot.slotEnd ? (
              <section aria-labelledby="slot-heading">
                <h2
                  id="slot-heading"
                  className="text-sm font-medium text-gray-900"
                >
                  Scheduled window
                </h2>
                <p className="mt-1 text-gray-700">
                  {formatSlotWindow(snapshot.slotStart, snapshot.slotEnd)}
                </p>
                <details className="mt-3 text-sm text-gray-600">
                  <summary className="cursor-pointer font-medium text-gray-800">
                    What my slot means
                  </summary>
                  <p className="mt-2">
                    Your slot is the scheduled time window for this visit. If
                    the doctor offers an early join, you can opt in here — it
                    does not change your official appointment time unless you
                    reschedule separately in chat.
                  </p>
                </details>
              </section>
            ) : null}

            {snapshot.opdMode === "queue" ? (
              <section aria-labelledby="queue-heading">
                <h2
                  id="queue-heading"
                  className="text-sm font-medium text-gray-900"
                >
                  Queue
                </h2>
                {snapshot.tokenNumber != null ? (
                  <p className="mt-1 text-gray-700">
                    Token{" "}
                    <span className="font-semibold">
                      #{snapshot.tokenNumber}
                    </span>
                    {snapshot.aheadCount != null ? (
                      <> · {snapshot.aheadCount} ahead of you</>
                    ) : null}
                  </p>
                ) : (
                  <p className="mt-1 text-sm text-gray-600">
                    Queue position will appear here once assigned.
                  </p>
                )}
                {snapshot.etaMinutes != null ? (
                  <p className="mt-2 text-gray-700">
                    {QUEUE_ETA_LEAD}{" "}
                    <span className="font-semibold">
                      {snapshot.etaMinutes} min
                    </span>
                    {snapshot.etaRange ? (
                      <span className="text-gray-600">
                        {" "}
                        {formatQueueEtaRange(snapshot.etaRange)}
                      </span>
                    ) : null}
                  </p>
                ) : null}
                {showQueueColdCopy ? (
                  <p className="mt-2 text-xs text-gray-500">
                    Estimates get more accurate as earlier visits finish (cold
                    start may show a wider range).
                  </p>
                ) : null}
              </section>
            ) : null}

            {showTurnSoon ? <TurnSoonBanner /> : null}

            <PrimaryCta
              consultationToken={consultationToken}
              status={snapshot.status}
              opdMode={snapshot.opdMode}
              showWaitHint={showWaitHint}
            />
          </div>
        </OpdAppointmentCard>

        <p className="text-center text-xs text-gray-500">
          Updates every ~{pollSeconds}s. Keep this tab open.
        </p>
      </div>
    </main>
  );
}
