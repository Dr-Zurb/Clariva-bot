/**
 * crc-12 — patient-facing wait copy shared by `/my-visit` and the
 * video/voice lobbies. A patient must not read two different sentences
 * for the same situation (CRC3-D6).
 *
 * Do not add a doctor display name here — the backend does not surface
 * one to patients.
 */

import type { PatientOpdSnapshot } from "@/types/opd-session";

export const DOCTOR_BUSY_OTHER_PATIENT =
  "The doctor is with another patient. Sit tight — this page updates automatically.";

export const QUEUE_ETA_LEAD = "Estimated wait: about";

export function formatQueueEtaRange(range: {
  minMinutes: number;
  maxMinutes: number;
}): string {
  return `(range ${range.minMinutes}–${range.maxMinutes} min)`;
}

export function lobbyWaitHasContent(
  snapshot: PatientOpdSnapshot | null | undefined
): boolean {
  if (!snapshot) return false;
  if (snapshot.doctorBusyWith === "other_patient") return true;
  if (snapshot.delayMinutes != null && snapshot.delayMinutes > 0) return true;
  if (snapshot.opdMode === "queue" && snapshot.etaMinutes != null) return true;
  return false;
}
