"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";
import { EXAM_PATIENT_ASSISTED_PILL_CLASS } from "@/components/cockpit/rx/inputs/ExamTeleconsultFeasibilityChip";
import { RX_EXAM_FIELD_LABEL_CLASS } from "@/components/cockpit/rx/sections/field-styles";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface ExamTeleconsultFindingCardHeaderProps {
  label: string;
  findingId: string;
  testIdPrefix: string;
  disabled?: boolean;
  open: boolean;
  isRecorded: boolean;
  detailPreview: string;
  teleconsultFeasibilityHint?: string;
  onToggle: () => void;
  onClear?: () => void;
  expandCollapseButton: ReactNode;
}

/** Shared teleconsult limited / patient-assisted header row for structured exam cards. */
export function ExamTeleconsultFindingCardHeader({
  label,
  findingId,
  testIdPrefix,
  disabled = false,
  open,
  isRecorded,
  detailPreview,
  teleconsultFeasibilityHint,
  onToggle,
  onClear,
  expandCollapseButton,
}: ExamTeleconsultFindingCardHeaderProps) {
  const flaggedTeleconsult = Boolean(teleconsultFeasibilityHint);
  const limitedOnTeleconsult = flaggedTeleconsult && !isRecorded;
  const patientAssisted = flaggedTeleconsult && isRecorded;

  return (
    <div className="flex items-center gap-2 px-1.5 py-1.5">
      {limitedOnTeleconsult ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              disabled={disabled}
              onClick={onToggle}
              aria-expanded={open}
              aria-label={`${label}. ${teleconsultFeasibilityHint}`}
              className="flex min-w-0 flex-1 items-center gap-2 rounded-sm text-left text-muted-foreground disabled:opacity-50"
              data-testid={`${testIdPrefix}-toggle-${findingId}`}
            >
              <span className={cn("shrink-0", RX_EXAM_FIELD_LABEL_CLASS)}>{label}</span>
              {!open ? (
                <span className="truncate text-xs text-muted-foreground/60">
                  — Limited on teleconsult
                </span>
              ) : null}
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-[16rem] text-left">
            {teleconsultFeasibilityHint}
          </TooltipContent>
        </Tooltip>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={onToggle}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-sm text-left disabled:opacity-50"
          data-testid={`${testIdPrefix}-toggle-${findingId}`}
        >
          {isRecorded && !open ? (
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary/70" aria-hidden />
          ) : null}
          <span className={cn("shrink-0", RX_EXAM_FIELD_LABEL_CLASS)}>{label}</span>
          {!open ? (
            <span
              className={cn(
                "truncate text-xs",
                isRecorded ? "text-muted-foreground" : "text-muted-foreground/60",
              )}
            >
              {detailPreview ? ` — ${detailPreview}` : null}
            </span>
          ) : null}
        </button>
      )}
      {patientAssisted ? (
        <span
          className={EXAM_PATIENT_ASSISTED_PILL_CLASS}
          data-testid={`${testIdPrefix}-patient-assisted-${findingId}`}
        >
          Patient-assisted
        </span>
      ) : null}
      {isRecorded && onClear ? (
        <button
          type="button"
          disabled={disabled}
          onClick={onClear}
          aria-label={`Clear ${label}`}
          data-testid={`${testIdPrefix}-clear-${findingId}`}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground disabled:opacity-50"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      ) : null}
      {expandCollapseButton}
    </div>
  );
}

export function examTeleconsultFindingCardShellClass(
  open: boolean,
  isRecorded: boolean,
  limitedOnTeleconsult: boolean,
): string {
  return cn(
    limitedOnTeleconsult && !open && "border border-dashed border-border/50 bg-muted/20",
    open
      ? "my-1 rounded-sm border border-border/70 bg-background px-1 shadow-sm"
      : isRecorded
        ? "bg-muted/10 hover:bg-muted/20"
        : limitedOnTeleconsult
          ? "hover:bg-muted/25"
          : "hover:bg-muted/15",
  );
}

export function useExamTeleconsultFindingCardState(
  isRecorded: boolean,
  teleconsultFeasibilityHint?: string,
) {
  const flaggedTeleconsult = Boolean(teleconsultFeasibilityHint);
  return {
    flaggedTeleconsult,
    limitedOnTeleconsult: flaggedTeleconsult && !isRecorded,
    patientAssisted: flaggedTeleconsult && isRecorded,
  };
}
