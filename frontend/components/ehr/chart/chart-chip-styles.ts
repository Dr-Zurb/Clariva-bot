import { RX_FIELD_INPUT_CLASS } from "@/components/cockpit/rx/sections/field-styles";
import { cn } from "@/lib/utils";

/** Matches social-history StatusChipRow (tobacco, alcohol, substances). */
export const CHART_SELECT_CHIP_CLASS =
  "min-h-9 rounded-full border px-3 text-xs transition-colors disabled:opacity-50";

export const CHART_SELECT_CHIP_SELECTED_CLASS =
  "border-primary bg-primary/10 font-medium text-foreground";

export const CHART_SELECT_CHIP_UNSELECTED_CLASS =
  "border-border text-muted-foreground hover:border-primary/60 hover:text-foreground";

export const CHART_SELECT_CHIP_GROUP_CLASS = "flex flex-wrap gap-1.5";

/** Squarish chips inside nested item cards (matches substance/tobacco phase toggles). */
export const CHART_CARD_OPTION_CHIP_CLASS =
  "rounded border px-1.5 py-0.5 text-[10px] font-medium transition-colors disabled:opacity-50";

export const CHART_CARD_OPTION_CHIP_GROUP_CLASS = "flex shrink-0 gap-0.5";

/** Small unit / preset chips (social-history DurationField unit row). */
export const CHART_OPTION_CHIP_CLASS =
  "rounded-md border px-2 py-1 text-[11px] font-medium transition-colors disabled:opacity-50";

export function chartCardOptionChipClass(isSelected: boolean, isPastSelected = false): string {
  if (!isSelected) {
    return cn(
      CHART_CARD_OPTION_CHIP_CLASS,
      "border-border text-muted-foreground hover:border-primary/60",
    );
  }
  if (isPastSelected) {
    return cn(
      CHART_CARD_OPTION_CHIP_CLASS,
      "border-muted-foreground bg-muted text-foreground",
    );
  }
  return cn(
    CHART_CARD_OPTION_CHIP_CLASS,
    CHART_SELECT_CHIP_SELECTED_CLASS,
  );
}

export function chartSelectChipClass(isSelected: boolean): string {
  return cn(
    CHART_SELECT_CHIP_CLASS,
    isSelected ? CHART_SELECT_CHIP_SELECTED_CLASS : CHART_SELECT_CHIP_UNSELECTED_CLASS,
  );
}

export function chartOptionChipClass(isSelected: boolean): string {
  return cn(
    CHART_OPTION_CHIP_CLASS,
    isSelected ? CHART_SELECT_CHIP_SELECTED_CLASS : CHART_SELECT_CHIP_UNSELECTED_CLASS,
  );
}

export const CHART_CHIP_CLASS =
  "inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-xs";

export const CHART_QUICK_CHIP_CLASS =
  "min-h-8 rounded-full border border-dashed border-border px-2.5 text-[11px] text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground disabled:opacity-50";

export function chartQuickChipClass(isSelected = false): string {
  if (!isSelected) return CHART_QUICK_CHIP_CLASS;
  return cn(
    "min-h-8 rounded-full border px-2.5 text-[11px] transition-colors disabled:opacity-50",
    CHART_SELECT_CHIP_SELECTED_CLASS,
  );
}

export const CHART_COMPACT_INPUT_CLASS = cn(RX_FIELD_INPUT_CLASS, "h-7 px-2 py-0.5 text-xs");

/** Relative duration value (For / Resolved / stopped-ago) — fits up to 3 digits with steppers. */
export const CHART_DURATION_VALUE_INPUT_CLASS = cn(
  RX_FIELD_INPUT_CLASS,
  "h-8 w-[4.25rem] min-w-[4.25rem] shrink-0 px-1.5 py-1 text-xs tabular-nums",
);

export const CHART_COMBOBOX_INPUT_CLASS = cn(
  CHART_COMPACT_INPUT_CLASS,
  "w-full min-w-0 transition-[border-radius,box-shadow]",
);
