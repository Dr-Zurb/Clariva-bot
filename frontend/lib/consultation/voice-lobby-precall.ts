/**
 * crc-12 — voice analogue of `shouldSkipVideoPrecallGate`.
 *
 * Holding (doctor has not started) must not mint a Twilio join token
 * (CRC-D1). The mic check is raw getUserMedia only.
 */

import type { TextConsultSessionStatus } from "@/lib/api";

export function shouldSkipVoicePrecallGate(input: {
  arrivedViaLobby: boolean;
}): boolean {
  return input.arrivedViaLobby === true;
}

export type VoiceEntryPhase = "holding" | "precall" | "ended";

export function voicePhaseFromSessionStatus(
  status: TextConsultSessionStatus
): VoiceEntryPhase {
  if (status === "scheduled") return "holding";
  if (status === "live") return "precall";
  return "ended";
}

/** Twilio join tokens are minted only after the doctor starts. */
export function shouldMintVoiceTwilio(
  status: TextConsultSessionStatus
): boolean {
  return status === "live";
}
