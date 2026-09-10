/**
 * crc-10 — when the HMAC exchange flips from lobby → live, should the
 * patient skip the post-Start pre-call gate?
 *
 * - Waited in the lobby (with or without tapping Continue) → skip.
 *   Cached device IDs are used when the check was completed; otherwise
 *   Twilio picks browser defaults (CRC3-D2, AC 4).
 * - Arrived already-live (late opener / resend link) → keep the gate
 *   (CRC3-D3).
 */
export function shouldSkipVideoPrecallGate(input: {
  arrivedViaLobby: boolean;
}): boolean {
  return input.arrivedViaLobby === true;
}
