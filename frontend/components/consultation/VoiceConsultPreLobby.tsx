"use client";

/**
 * Pre-call lobby for voice consults (task-voice-B2).
 * Clinic branding + countdown above A6's mic-check; reuses video B1 chrome.
 *
 * @see task-voice-A6-precall-mic-check.md — mic-check section unchanged below.
 */

import type { ReactNode } from "react";
import VideoConsultLobbyHeader from "@/components/consultation/VideoConsultLobbyHeader";
import VideoConsultLobbyCountdown, {
  type LobbyCountdownPerspective,
} from "@/components/consultation/VideoConsultLobbyCountdown";
import VoiceConsultPreCall from "@/components/consultation/VoiceConsultPreCall";
import {
  formatAppointmentTimeEnGB,
  resolveClinicBranding,
  type BrandingInput,
  type ClinicBranding,
} from "@/lib/clinic/branding";

export interface VoiceConsultPreLobbyProps {
  role: LobbyCountdownPerspective;
  /** Sparse server payload or resolved branding. */
  branding?: BrandingInput | ClinicBranding | null;
  scheduledStartAt?: string | null;
  /** e.g. "your doctor" (patient) or patient first name (doctor). */
  counterpartyLabel: string;
  onJoin: () => void;
  onSkip: () => void;
  className?: string;
  /**
   * crc-12 — patient holding room before the doctor starts. Completing
   * the mic check must not mint a Twilio token (CRC-D1).
   */
  holdingMode?: boolean;
  deviceCheckDone?: boolean;
  contextSlot?: ReactNode;
}

function toResolvedBranding(
  branding: BrandingInput | ClinicBranding | null | undefined
): ClinicBranding {
  if (branding && "initials" in branding && "initialsBgClass" in branding) {
    return branding;
  }
  return resolveClinicBranding(branding ?? null);
}

export default function VoiceConsultPreLobby({
  role,
  branding: brandingProp,
  scheduledStartAt,
  counterpartyLabel,
  onJoin,
  onSkip,
  className = "",
  holdingMode = false,
  deviceCheckDone = false,
  contextSlot,
}: VoiceConsultPreLobbyProps) {
  const branding = toResolvedBranding(brandingProp);
  const appointmentTime = formatAppointmentTimeEnGB(scheduledStartAt);
  const pageTitle = holdingMode ? "Waiting room" : "Voice consultation";

  return (
    <div
      className={"mx-auto flex w-full max-w-2xl flex-col gap-4 " + className}
      data-testid="voice-consult-pre-lobby"
      data-role={role}
      data-holding={holdingMode ? "true" : "false"}
    >
      <h1 className="text-center text-xl font-semibold text-gray-900">
        {pageTitle}
      </h1>
      <VideoConsultLobbyHeader
        branding={branding}
        appointmentTime={appointmentTime}
      />
      <VideoConsultLobbyCountdown
        scheduledStartAt={scheduledStartAt}
        counterpartyLabel={counterpartyLabel}
        perspective={role}
      />
      {holdingMode ? (
        <p className="text-center text-sm text-gray-700">
          Stay on this page. We&apos;ll open the call as soon as the doctor
          starts the session.
        </p>
      ) : null}
      {contextSlot}
      {holdingMode && deviceCheckDone ? (
        <div
          className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-center"
          data-testid="voice-lobby-ready"
          role="status"
        >
          <p className="text-sm font-medium text-emerald-900">
            You&apos;re ready
          </p>
          <p className="mt-1 text-sm text-emerald-800">
            Stay on this page — we&apos;ll open the call when the doctor starts.
            No extra tap needed.
          </p>
        </div>
      ) : (
        <VoiceConsultPreCall onJoin={onJoin} onSkip={onSkip} />
      )}
      {holdingMode ? (
        <p className="text-center text-xs font-medium uppercase tracking-wide text-emerald-700">
          Waiting for the doctor…
        </p>
      ) : null}
    </div>
  );
}
