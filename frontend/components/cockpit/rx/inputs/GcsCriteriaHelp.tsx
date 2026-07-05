"use client";

import { HelpCircle } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  gcsCriteriaSections,
  type GcsCriteriaSection,
} from "@/lib/cockpit/gcs-criteria";
import type { GcsComponentKey } from "@/lib/cockpit/gcs-subscore";
import { cn } from "@/lib/utils";

function GcsCriteriaSectionList({
  sections,
  compact,
}: {
  sections: readonly GcsCriteriaSection[];
  compact?: boolean;
}): JSX.Element {
  return (
    <div className={cn("space-y-3", compact && "space-y-2")}>
      {sections.map((section) => (
        <div key={section.componentKey}>
          <p className="text-[11px] font-medium text-foreground">
            {section.title}
            <span className="ml-1 font-normal text-muted-foreground">{section.scaleLabel}</span>
          </p>
          <ul className="mt-1 space-y-0.5">
            {section.rows.map((row) => (
              <li
                key={`${section.componentKey}-${row.score}`}
                className="flex gap-2 text-[11px] leading-snug text-muted-foreground"
              >
                <span className="w-3 shrink-0 tabular-nums text-foreground">{row.score}</span>
                <span>{row.label}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export interface GcsCriteriaHelpProps {
  /** When set, shows criteria for one component only (E/V/M inline help). */
  componentKey?: GcsComponentKey;
  /** `inline` — small icon beside E/V/M; `title` — beside the GCS card heading. */
  variant?: "inline" | "title";
}

/** On-demand adult GCS scoring reference — not shown inline in the grid. */
export function GcsCriteriaHelp({
  componentKey,
  variant = "title",
}: GcsCriteriaHelpProps): JSX.Element {
  const sections = gcsCriteriaSections(componentKey);
  const isInline = variant === "inline";
  const ariaLabel = componentKey
    ? `GCS ${sections[0]!.title} scoring criteria`
    : "Glasgow Coma Scale scoring criteria";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            isInline ? "size-4" : "size-5",
          )}
          aria-label={ariaLabel}
          data-testid={
            componentKey
              ? `gcs-criteria-help-${componentKey}`
              : "gcs-criteria-help"
          }
        >
          <HelpCircle className={cn(isInline ? "size-3" : "size-3.5")} aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align={isInline ? "start" : "start"}
        side={isInline ? "top" : "bottom"}
        className={cn("p-3", isInline ? "w-[14rem]" : "w-[17rem]")}
        data-testid={
          componentKey
            ? `gcs-criteria-panel-${componentKey}`
            : "gcs-criteria-panel"
        }
      >
        {!isInline ? (
          <p className="mb-2 text-[11px] font-medium text-foreground">Adult GCS reference</p>
        ) : null}
        <GcsCriteriaSectionList sections={sections} compact={isInline} />
      </PopoverContent>
    </Popover>
  );
}
