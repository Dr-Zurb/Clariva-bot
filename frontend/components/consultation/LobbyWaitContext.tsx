"use client";

/**
 * crc-12 — why the patient is waiting, using the same words `/my-visit`
 * already uses. Renders nothing when the snapshot is missing or has
 * nothing useful — generic lobby copy stays in the parent.
 */

import DelayBanner from "@/components/opd/DelayBanner";
import {
  DOCTOR_BUSY_OTHER_PATIENT,
  QUEUE_ETA_LEAD,
  formatQueueEtaRange,
  lobbyWaitHasContent,
} from "@/lib/consultation/lobby-wait-copy";
import type { PatientOpdSnapshot } from "@/types/opd-session";

export default function LobbyWaitContext({
  snapshot,
}: {
  snapshot: PatientOpdSnapshot | null | undefined;
}) {
  if (!lobbyWaitHasContent(snapshot) || !snapshot) return null;

  const delay =
    snapshot.delayMinutes != null && snapshot.delayMinutes > 0
      ? snapshot.delayMinutes
      : null;
  const showEta = snapshot.opdMode === "queue" && snapshot.etaMinutes != null;

  return (
    <div className="space-y-3" data-testid="lobby-wait-context">
      {snapshot.doctorBusyWith === "other_patient" ? (
        <div
          className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800"
          role="status"
        >
          {DOCTOR_BUSY_OTHER_PATIENT}
        </div>
      ) : null}
      {delay != null ? <DelayBanner delayMinutes={delay} /> : null}
      {showEta ? (
        <p className="text-center text-sm text-gray-700">
          {QUEUE_ETA_LEAD}{" "}
          <span className="font-semibold">{snapshot.etaMinutes} min</span>
          {snapshot.etaRange ? (
            <span className="text-gray-600">
              {" "}
              {formatQueueEtaRange(snapshot.etaRange)}
            </span>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
