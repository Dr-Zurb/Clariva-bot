"use client";

import { useState } from "react";
import { acceptOpdEarlyJoin, declineOpdEarlyJoin } from "@/lib/api";
import { useOpdSnapshot } from "@/hooks/useOpdSnapshot";
import OpdAppointmentCard from "./OpdAppointmentCard";
import DelayBanner from "./DelayBanner";
import EarlyInviteBanner from "./EarlyInviteBanner";
import PrimaryCta from "./PrimaryCta";
import TurnSoonBanner from "./TurnSoonBanner";

interface PatientVisitSessionProps {
  consultationToken: string;
}

function formatSlotWindow(slotStart?: string, slotEnd?: string): string {
  if (!slotStart || !slotEnd) return "";
  try {
    const start = new Date(slotStart);
    const end = new Date(slotEnd);
    return `${start.toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    })} – ${end.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    })}`;
  } catch {
    return `${slotStart} – ${slotEnd}`;
  }
}

/**
 * §6.4 patient dashboard: banners, mode-specific copy, primary CTA (e-task-opd-05).
 */
export default function PatientVisitSession({
  consultationToken,
}: PatientVisitSessionProps) {
  const { snapshot, loading, error, refetch } = useOpdSnapshot(
    consultationToken.trim() ? consultationToken : null
  );
  const [earlyBusy, setEarlyBusy] = useState(false);

  if (loading && !snapshot) {
    return (
      <main className="min-h-screen bg-gray-50 p-4">
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
          <h1 className="text-lg font-semibold text-red-800">Unable to load visit</h1>
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
                The doctor is with another patient. Sit tight — this page updates
                automatically.
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
                <h2 id="slot-heading" className="text-sm font-medium text-gray-900">
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
                    Your slot is the scheduled time window for this visit. If the
                    doctor offers an early join, you can opt in here — it does not
                    change your official appointment time unless you reschedule
                    separately in chat.
                  </p>
                </details>
              </section>
            ) : null}

            {snapshot.opdMode === "queue" ? (
              <section aria-labelledby="queue-heading">
                <h2 id="queue-heading" className="text-sm font-medium text-gray-900">
                  Queue
                </h2>
                {snapshot.tokenNumber != null ? (
                  <p className="mt-1 text-gray-700">
                    Token <span className="font-semibold">#{snapshot.tokenNumber}</span>
                    {snapshot.aheadCount != null ? (
                      <>
                        {" "}
                        · {snapshot.aheadCount} ahead of you
                      </>
                    ) : null}
                  </p>
                ) : (
                  <p className="mt-1 text-sm text-gray-600">
                    Queue position will appear here once assigned.
                  </p>
                )}
                {snapshot.etaMinutes != null ? (
                  <p className="mt-2 text-gray-700">
                    Estimated wait: about{" "}
                    <span className="font-semibold">{snapshot.etaMinutes} min</span>
                    {snapshot.etaRange ? (
                      <span className="text-gray-600">
                        {" "}
                        (range {snapshot.etaRange.minMinutes}–
                        {snapshot.etaRange.maxMinutes} min)
                      </span>
                    ) : null}
                  </p>
                ) : null}
                {showQueueColdCopy ? (
                  <p className="mt-2 text-xs text-gray-500">
                    Estimates get more accurate as earlier visits finish (cold start
                    may show a wider range).
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
          Updates every ~{snapshot.suggestedPollSeconds ?? 20}s. Keep this tab open.
        </p>
      </div>
    </main>
  );
}
