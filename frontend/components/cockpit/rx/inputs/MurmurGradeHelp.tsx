"use client";

import { HelpCircle } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const GRADE_LINES = [
  { grade: "1/6", description: "Very faint, heard only in quiet room" },
  { grade: "2/6", description: "Quiet but readily heard" },
  { grade: "3/6", description: "Moderately loud, no thrill" },
  { grade: "4/6", description: "Loud with palpable thrill" },
  { grade: "5/6", description: "Very loud, thrill, stethoscope edge barely off chest" },
  { grade: "6/6", description: "Audible without stethoscope contact" },
] as const;

/** On-demand murmur grade reference beside the Grade row label. */
export function MurmurGradeHelp(): JSX.Element {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground"
          aria-label="Murmur grade reference"
          data-testid="cvs-murmur-grade-help"
        >
          <HelpCircle className="size-3.5" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        className="w-[18rem] p-3"
        data-testid="cvs-murmur-grade-help-panel"
      >
        <p className="mb-2 text-[11px] font-medium text-foreground">Murmur grade</p>
        <ul className="space-y-1.5">
          {GRADE_LINES.map((row) => (
            <li key={row.grade} className="text-[11px] leading-snug text-muted-foreground">
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
