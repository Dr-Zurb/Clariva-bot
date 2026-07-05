"use client";

import { HelpCircle } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { EDEMA_GRADE_REFERENCE } from "@/lib/cockpit/edema-sites";

/** On-demand pitting edema grade reference beside the Grade row label. */
export function EdemaGradeHelp({ siteId }: { siteId?: string }): JSX.Element {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground"
          aria-label="Pitting edema grade reference"
          data-testid={
            siteId ? `general-edema-${siteId}-grade-help` : "general-edema-grade-help"
          }
        >
          <HelpCircle className="size-3.5" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        className="w-[17rem] p-3"
        data-testid="general-edema-grade-help-panel"
      >
        <p className="mb-2 text-[11px] font-medium text-foreground">Pitting edema grade</p>
        <ul className="space-y-1.5">
          {EDEMA_GRADE_REFERENCE.map((row) => (
            <li
              key={row.grade}
              className="text-[11px] leading-snug text-muted-foreground"
            >
              <span className="font-medium text-foreground">{row.grade}</span>
              {" — "}
              {row.pitDepth}
              {row.rebound !== "—" ? `, ${row.rebound.toLowerCase()}` : ""}
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
