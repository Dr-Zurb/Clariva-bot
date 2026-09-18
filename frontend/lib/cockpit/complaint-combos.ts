/**
 * Client-side filter + preview for doctor chief-complaint habits.
 */

import type { DoctorComplaintCombo } from "@/lib/api/doctor-complaint-combos";

export const COMPLAINT_COMBO_MIN_QUERY = 2;
export const COMPLAINT_COMBO_DISPLAY_CAP = 3;

export function matchComplaintCombos(
  combos: readonly DoctorComplaintCombo[],
  query: string,
  limit = COMPLAINT_COMBO_DISPLAY_CAP
): DoctorComplaintCombo[] {
  const q = query.trim().toLowerCase();
  if (q.length < COMPLAINT_COMBO_MIN_QUERY) return [];

  return combos.filter((combo) => combo.nameKey.startsWith(q)).slice(0, limit);
}

function formatBand(band: string | null): string {
  if (!band) return "";
  return band.replace(/_/g, " ");
}

export function formatComplaintComboHint(combo: DoctorComplaintCombo): string {
  const parts = [combo.complaintName];
  const band = formatBand(combo.severityBand);
  if (band) parts.push(band);
  if (combo.laterality) parts.push(combo.laterality);
  if (combo.character) parts.push(combo.character);
  if (combo.associatedNames.length > 0) {
    parts.push(`+ ${combo.associatedNames.join(", ")}`);
  }
  return parts.join(" · ");
}
