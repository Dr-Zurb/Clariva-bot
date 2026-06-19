import type { RxFormFields } from "@/components/cockpit/rx/RxFormContext";

/** Keys on `RxFormFields` — mirror future `doctor_note_favorites.field_key` values. */
export type HistoryFieldKey = "familyHistory" | "socialHistory" | "pastSurgicalHistory";

export interface HistoryFieldDef {
  fieldKey: HistoryFieldKey;
  label: string;
  placeholder: string;
  /** Static v1 chip palette; Phase 2 swaps in `doctor_note_favorites` by field_key. */
  chips: string[];
}

export const HISTORY_FIELD_DEFS: HistoryFieldDef[] = [
  {
    fieldKey: "familyHistory",
    label: "Family history",
    placeholder: "Additional family history notes",
    chips: [],
  },
  {
    fieldKey: "socialHistory",
    label: "Social / personal history",
    placeholder: "Use dimension chips above; additional notes here",
    chips: [],
  },
];

/** Resolve chip palette for a history field (Phase 2 hook point). */
export function getHistoryFieldChips(fieldKey: HistoryFieldKey): string[] {
  return HISTORY_FIELD_DEFS.find((def) => def.fieldKey === fieldKey)?.chips ?? [];
}

/** Insert a chip phrase into free-text, comma-separated. */
export function insertHistoryChip(current: string, chip: string): string {
  const trimmed = current.trim();
  if (!trimmed) return chip;
  if (trimmed.toLowerCase().includes(chip.toLowerCase())) return current;
  return `${trimmed}, ${chip}`;
}

export function historyFieldInputId(fieldKey: HistoryFieldKey): string {
  return `rx-history-${fieldKey}`;
}

export type HistoryFieldValue = Pick<
  RxFormFields,
  "familyHistory" | "socialHistory" | "pastSurgicalHistory"
>;
