"use client";

import { HelpCircle } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  BMI_DISPLAY_LABEL,
  BMI_FORMULA,
  BMI_WHO_ADULT_RANGES,
  BSA_CLINICAL_NOTE,
  BSA_DISPLAY_LABEL,
  BSA_MOSTELLER_FORMULA,
  DERIVED_VITALS_CARD_LABEL,
} from "@/lib/cockpit/bmi";

/** On-demand BMI/BSA formula + WHO range reference beside the derived card title. */
export function DerivedVitalsHelp(): JSX.Element {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground"
          aria-label={`${DERIVED_VITALS_CARD_LABEL} reference`}
          data-testid="derived-vitals-help"
        >
          <HelpCircle className="size-3.5" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        className="w-[17rem] p-3"
        data-testid="derived-vitals-help-panel"
      >
        <p className="mb-2 text-[11px] font-medium text-foreground">
          {DERIVED_VITALS_CARD_LABEL} reference
        </p>

        <div className="space-y-3">
          <div>
            <p className="text-[11px] font-medium text-foreground">{BMI_DISPLAY_LABEL}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{BMI_FORMULA}</p>
            <p className="mt-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              WHO adult ranges
            </p>
            <ul className="mt-1 space-y-0.5">
              {BMI_WHO_ADULT_RANGES.map((row) => (
                <li
                  key={row.category}
                  className="flex justify-between gap-2 text-[11px] leading-snug text-muted-foreground"
                >
                  <span>{row.label}</span>
                  <span className="shrink-0 tabular-nums text-foreground">{row.range}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-[11px] font-medium text-foreground">{BSA_DISPLAY_LABEL}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{BSA_MOSTELLER_FORMULA}</p>
            <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{BSA_CLINICAL_NOTE}</p>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
