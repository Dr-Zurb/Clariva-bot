"use client";

import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const MAX_DX_CHARS = 40;

function formatTreatingDxDisplay(dxValue: string): string {
  const trimmed = dxValue.trim();
  if (!trimmed) return "not assigned";
  return trimmed.length > MAX_DX_CHARS
    ? `${trimmed.slice(0, MAX_DX_CHARS)}…`
    : trimmed;
}

function focusDiagnosisInput(): void {
  const el = document.getElementById("diagnosis");
  if (el instanceof HTMLElement) {
    el.focus();
    el.scrollIntoView({ block: "center", behavior: "smooth" });
  }
}

export function TreatingDiagnosisControl({
  dxValue,
  className,
}: {
  dxValue: string;
  className?: string;
}): JSX.Element {
  const isEmpty = !dxValue.trim();
  const displayText = formatTreatingDxDisplay(dxValue);
  const treatingLabel = `Treating: ${displayText}`;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          data-testid="treating-diagnosis"
          onClick={focusDiagnosisInput}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              focusDiagnosisInput();
            }
          }}
          className={cn(
            "flex cursor-pointer items-center gap-1 rounded px-2 py-1 text-xs font-medium",
            "transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            isEmpty ? "text-muted-foreground" : "text-foreground",
            className,
          )}
          aria-label={
            isEmpty
              ? "Treating diagnosis not assigned. Click to edit."
              : `Treating: ${dxValue}. Click to edit.`
          }
        >
          <span aria-hidden>🎯</span>
          <span className={isEmpty ? "italic" : undefined}>{treatingLabel}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[240px]">
        <p>
          {isEmpty
            ? "Set the provisional treating diagnosis in the Plan pane. Click to jump to the diagnosis field."
            : dxValue.length > MAX_DX_CHARS
              ? `${dxValue} Click to edit in the Plan pane.`
              : "Provisional treating diagnosis for this visit. Click to edit in the Plan pane."}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}
