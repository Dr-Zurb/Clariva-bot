"use client";

import { ChartFieldGroup } from "@/components/ehr/chart/ConditionTimingField";
import type { ReactNode } from "react";

/** Shared subsection shell for patient-background zones (PMH, PSH, etc.). */
export const HISTORY_SUBSECTION_CLASS =
  "scroll-mt-2 space-y-3 rounded-lg border border-border/60 bg-background/40 p-3";

export function HistorySubsection({
  id,
  testId,
  label,
  hint,
  children,
}: {
  id?: string;
  testId: string;
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div id={id} className={HISTORY_SUBSECTION_CLASS} data-testid={testId}>
      <ChartFieldGroup label={label}>
        {hint ? <p className="text-[10px] text-muted-foreground">{hint}</p> : null}
      </ChartFieldGroup>
      {children}
    </div>
  );
}
