"use client";

import { HelpCircle } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CLUBBING_GRADE_REFERENCE } from "@/lib/cockpit/clubbing-grade";

/** On-demand digital clubbing grade reference beside the Grade row label. */
export function ClubbingGradeHelp(): JSX.Element {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground"
          aria-label="Digital clubbing grade reference"
          data-testid="general-clubbing-grade-help"
        >
          <HelpCircle className="size-3.5" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        className="w-[17rem] p-3"
        data-testid="general-clubbing-grade-help-panel"
      >
        <p className="mb-2 text-[11px] font-medium text-foreground">Digital clubbing grade</p>
        <ul className="space-y-1.5">
          {CLUBBING_GRADE_REFERENCE.map((row) => (
            <li
              key={row.grade}
              className="text-[11px] leading-snug text-muted-foreground"
            >
              <span className="font-medium text-foreground">{row.grade}</span>
              {" — "}
              {row.description}
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
