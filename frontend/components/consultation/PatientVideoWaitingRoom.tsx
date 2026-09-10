"use client";

/**
 * crc-10 — video lobby chrome shown *before* the doctor starts.
 *
 * Same pieces as the post-Start pre-call gate (header, countdown,
 * device check, cellular warning) plus the "stay on this page"
 * reassurance. Completing the check does not enter the Twilio room
 * (CRC-D1); it only caches the choice on the parent.
 */

import VideoConsultPreCall from "@/components/consultation/VideoConsultPreCall";
import VideoConsultLobbyHeader from "@/components/consultation/VideoConsultLobbyHeader";
import VideoConsultLobbyCountdown from "@/components/consultation/VideoConsultLobbyCountdown";
import CellularDataWarning from "@/components/consultation/CellularDataWarning";
import LobbyConnectionProbe from "@/components/consultation/LobbyConnectionProbe";
import LobbyWaitContext from "@/components/consultation/LobbyWaitContext";
import type { PatientOpdSnapshot } from "@/types/opd-session";
import {
  formatAppointmentTimeEnGB,
  resolveClinicBranding,
} from "@/lib/clinic/branding";

export interface PatientVideoWaitingRoomProps {
  scheduledStartAt: string | null;
  practiceName?: string;
  deviceCheckDone: boolean;
  onContinue: (chosen: {
    cameraId: string | null;
    micId: string | null;
  }) => void;
  onSkipMic: (chosen: { cameraId: string | null }) => void;
  /** crc-12 — OPD snapshot from the parent lobby poll; optional. */
  snapshot?: PatientOpdSnapshot | null;
}

export default function PatientVideoWaitingRoom({
  scheduledStartAt,
  practiceName,
  deviceCheckDone,
  onContinue,
  onSkipMic,
  snapshot,
}: PatientVideoWaitingRoomProps) {
  const branding = resolveClinicBranding({ practiceName });
  const appointmentTime = formatAppointmentTimeEnGB(scheduledStartAt);

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        <h1 className="text-center text-xl font-semibold text-gray-900">
          Waiting room
        </h1>
        <VideoConsultLobbyHeader
          branding={branding}
          appointmentTime={appointmentTime}
        />
        <VideoConsultLobbyCountdown
          scheduledStartAt={scheduledStartAt}
          counterpartyLabel="your doctor"
        />
        <p className="text-center text-sm text-gray-700">
          Stay on this page. We&apos;ll open the call as soon as the doctor
          starts the session.
        </p>
        <LobbyWaitContext snapshot={snapshot} />
        <LobbyConnectionProbe />
        {deviceCheckDone ? (
          <div
            className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-center"
            data-testid="video-lobby-ready"
            role="status"
          >
            <p className="text-sm font-medium text-emerald-900">
              You&apos;re ready
            </p>
            <p className="mt-1 text-sm text-emerald-800">
              Stay on this page — we&apos;ll open the call when the doctor
              starts. No extra tap needed.
            </p>
          </div>
        ) : (
          <VideoConsultPreCall onContinue={onContinue} onSkipMic={onSkipMic} />
        )}
        <p className="text-center text-xs font-medium uppercase tracking-wide text-emerald-700">
          Waiting for the doctor…
        </p>
      </div>
      <CellularDataWarning />
    </div>
  );
}
