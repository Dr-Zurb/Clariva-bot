/**
 * PHI-free telemetry for voice pre-call mic check (task-voice-A6).
 * Swap `emit` for a production analytics SDK in one place.
 */

export type VoicePrecallTelemetryEvent =
  | { event: "precall_mic_check_shown" }
  | { event: "precall_mic_permission_granted" }
  | { event: "precall_mic_permission_denied" }
  | { event: "precall_test_sound_played" }
  | { event: "precall_skip_clicked" }
  | { event: "precall_join_clicked" };

export function trackVoicePrecallEvent(payload: VoicePrecallTelemetryEvent): void {
  try {
    // eslint-disable-next-line no-console
    console.debug("[telemetry]", payload.event, payload);
  } catch {
    /* telemetry must never break the UI */
  }
}
