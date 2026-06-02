/**
 * voice-C1 — doctor-side "patient joined" chime (T5.31).
 *
 * Soft single-shot ding when a remote participant with Twilio identity
 * `patient-{appointmentId}` connects. Not a PSTN ring (Principle 8).
 *
 * @see task-voice-C1-audible-ringtone.md
 */

/** Same asset family as A6 precall test chime — soft in-app notification tone. */
export const PATIENT_JOINED_CHIME_SRC = "/audio/patient-joined-chime.mp3";

const PATIENT_IDENTITY_PREFIX = "patient-";
const CHIME_DEBOUNCE_MS = 5_000;

let lastPatientJoinedChimeAt = 0;

/** @internal Vitest-only — resets module debounce state between cases. */
export function resetPatientJoinedChimeDebounceForTests(): void {
  lastPatientJoinedChimeAt = 0;
}

/** Twilio identity convention: `patient-{appointmentId}` (backend video-session-twilio). */
export function isPatientTwilioIdentity(identity: string): boolean {
  return identity.startsWith(PATIENT_IDENTITY_PREFIX);
}

/**
 * Play the patient-joined chime once. Doctor-side only — callers must gate
 * on `role === 'doctor'`. Debounces rapid `participantConnected` (reconnect).
 * Autoplay failures are swallowed (doctor has usually clicked Join in lobby).
 */
export function playPatientJoinedChime(): void {
  const now = Date.now();
  if (now - lastPatientJoinedChimeAt < CHIME_DEBOUNCE_MS) return;
  lastPatientJoinedChimeAt = now;

  try {
    const audio = new Audio(PATIENT_JOINED_CHIME_SRC);
    void audio.play().catch(() => {
      /* autoplay policy or missing asset — silent */
    });
  } catch {
    /* Audio constructor unavailable */
  }
}
