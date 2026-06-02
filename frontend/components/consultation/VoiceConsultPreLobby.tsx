"use client";

/**
 * Pre-call lobby for voice consults (task-voice-B2).
 * Clinic branding + countdown above A6's mic-check; reuses video B1 chrome.
 *
 * @see task-voice-A6-precall-mic-check.md — mic-check section unchanged below.
 */

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
}

function toResolvedBranding(
  branding: BrandingInput | ClinicBranding | null | undefined,
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
}: VoiceConsultPreLobbyProps) {
  const branding = toResolvedBranding(brandingProp);
  const appointmentTime = formatAppointmentTimeEnGB(scheduledStartAt);
  const pageTitle = "Voice consultation";

  return (
    <div
      className={"mx-auto flex w-full max-w-2xl flex-col gap-4 " + className}
      data-testid="voice-consult-pre-lobby"
      data-role={role}
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
      <VoiceConsultPreCall onJoin={onJoin} onSkip={onSkip} />
    </div>
  );
}
