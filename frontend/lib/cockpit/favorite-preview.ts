import type { MedicineRowValue } from "@/components/consultation/MedicineRow";
import {
  formatDurationLegacyLabel,
  getFrequencyLegacyLabel,
} from "@/lib/medicineCodes";

/** Compact one-line preview for favorite chips and side-sheet rows. */
export function formatFavoritePreview(template: MedicineRowValue): string {
  const parts: string[] = [];
  if (template.medicineName) parts.push(template.medicineName);
  if (template.dosage) parts.push(template.dosage);

  const frequency =
    template.frequencyCode != null
      ? getFrequencyLegacyLabel(template.frequencyCode)
      : template.frequency;
  if (frequency) parts.push(frequency);

  const duration =
    template.durationValue != null && template.durationUnit != null
      ? formatDurationLegacyLabel(template.durationValue, template.durationUnit)
      : template.duration;
  if (duration) parts.push(duration);

  return parts.join(" · ");
}
