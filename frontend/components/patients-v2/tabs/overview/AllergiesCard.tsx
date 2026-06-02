"use client";

import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { PatientAllergy, PatientAllergySeverity } from "@/types/patient-chart";
import { OverviewCardFrame } from "./OverviewCardFrame";

interface AllergiesCardProps {
  allergies: PatientAllergy[] | undefined;
}

const SEVERITY_CHIP_CLASS: Record<PatientAllergySeverity, string> = {
  severe: "bg-red-50 text-red-700 ring-1 ring-red-600/20 border-transparent",
  moderate: "bg-amber-50 text-amber-800 ring-1 ring-amber-600/20 border-transparent",
  mild: "bg-muted text-muted-foreground ring-1 ring-border border-transparent",
  unknown: "bg-muted text-muted-foreground ring-1 ring-border border-transparent",
};

function reactionNotes(allergy: PatientAllergy): string | null {
  const parts = [allergy.reaction, allergy.note].filter(Boolean) as string[];
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function AllergiesCard({ allergies }: AllergiesCardProps) {
  const rows = allergies ?? [];

  return (
    <OverviewCardFrame title="Allergies">
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No known allergies.</p>
      ) : (
        <TooltipProvider delayDuration={200}>
          <div className="flex flex-wrap gap-2">
            {rows.map((a) => {
              const notes = reactionNotes(a);
              const chip = (
                <Badge
                  className={cn(
                    "cursor-default text-xs font-medium",
                    SEVERITY_CHIP_CLASS[a.severity],
                  )}
                >
                  {a.allergen}
                </Badge>
              );

              if (!notes) return <span key={a.id}>{chip}</span>;

              return (
                <Tooltip key={a.id}>
                  <TooltipTrigger asChild>
                    <button type="button" className="inline-flex rounded-md focus:outline-none focus:ring-2 focus:ring-ring">
                      {chip}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs">
                    {notes}
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </TooltipProvider>
      )}
    </OverviewCardFrame>
  );
}
