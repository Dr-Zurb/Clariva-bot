/**
 * Instagram DM copy for booking / reschedule links (OPD slot vs queue mode).
 */

import type { DoctorSettingsRow } from '../types/doctor-settings';
import { resolveOpdModeFromSettings } from '../services/opd/opd-mode-service';

/**
 * Primary booking link message after patient details are ready.
 */
export function formatBookingLinkDm(
  slotLink: string,
  mrnHint: string,
  doctorSettings: DoctorSettingsRow | null | undefined
): string {
  const mode = resolveOpdModeFromSettings(doctorSettings);
  if (mode === 'queue') {
    return `Join the queue for your visit here: ${slotLink}\n\nChoose a day, then confirm — you'll get a token number. Wait times are approximate.${mrnHint}`;
  }
  return `Pick your slot and complete payment here: ${slotLink}\n\nYou'll be redirected back to this chat when done.${mrnHint}`;
}

/**
 * Reschedule deep-link (Markdown) — queue practices emphasize day, not fixed time.
 */
export function formatRescheduleLinkDm(
  url: string,
  doctorSettings: DoctorSettingsRow | null | undefined
): string {
  const mode = resolveOpdModeFromSettings(doctorSettings);
  if (mode === 'queue') {
    return `Pick a new day for your visit: [Reschedule](${url})`;
  }
  return `Pick a new date and time: [Reschedule](${url})`;
}

/**
 * Reschedule flow after user picks from list (uses "Choose new slot" label).
 */
export function formatRescheduleChoiceLinkDm(
  url: string,
  doctorSettings: DoctorSettingsRow | null | undefined
): string {
  const mode = resolveOpdModeFromSettings(doctorSettings);
  if (mode === 'queue') {
    return `Pick a new day for your visit: [Choose new day](${url})`;
  }
  return `Pick a new date and time: [Choose new slot](${url})`;
}

/**
 * When user is in awaiting_slot_selection and did not ask for a new link.
 */
export function formatBookingAwaitingFollowUpDm(
  doctorSettings: DoctorSettingsRow | null | undefined
): string {
  const mode = resolveOpdModeFromSettings(doctorSettings);
  if (mode === 'queue') {
    return "Join the queue using the link above, or say 'change' to get a new link.";
  }
  return "Pick your slot and complete payment using the link above, or say 'change' to get a new link.";
}
