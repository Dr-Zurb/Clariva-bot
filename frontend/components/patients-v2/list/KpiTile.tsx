"use client";

import { forwardRef, type ReactNode } from "react";
import { ChevronDown, ChevronUp, Minus } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface KpiTileProps {
  label: string;
  count: number | null;
  delta7d: number | null;
  icon: ReactNode;
  severity?: "default" | "attention";
  onClick?: () => void;
  isActive?: boolean;
  muted?: boolean;
}

function formatDelta(delta: number): string {
  if (delta === 0) return "—";
  const abs = Math.abs(delta);
  return delta > 0 ? `↑ ${abs}` : `↓ ${abs}`;
}

function deltaColorClass(delta: number, invert: boolean): string {
  if (delta === 0) return "text-muted-foreground";
  const rising = delta > 0;
  const good = invert ? !rising : rising;
  return good ? "text-emerald-600 dark:text-emerald-400" : "text-destructive";
}

export const KpiTile = forwardRef<HTMLButtonElement, KpiTileProps>(function KpiTile(
  {
    label,
    count,
    delta7d,
    icon,
    severity = "default",
    onClick,
    isActive = false,
    muted = false,
  },
  ref,
) {
  const isLoading = count === null || delta7d === null;
  const invert = severity === "attention";

  const countDisplay =
    muted && !isLoading ? "—" : count !== null ? String(count) : null;

  const ariaLabel =
    isLoading || count === null
      ? label
      : `${label}: ${count}, 7-day change ${delta7d ?? 0}`;

  const shellClass = cn(
    "rounded-xl border bg-card p-4 text-left w-full",
    "hover:shadow-sm transition-shadow",
    severity === "attention" &&
      "border-amber-200 bg-amber-50/30 dark:border-amber-800 dark:bg-amber-950/30",
    isActive && "ring-2 ring-primary/40",
    muted && "opacity-60",
    onClick && "cursor-pointer",
  );

  const content = (
    <>
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground [&>svg]:size-4">{icon}</span>
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
      </div>
      <div className="mt-2 h-8 flex items-center">
        {isLoading ? (
          <Skeleton className="h-8 w-16" />
        ) : (
          <span className="text-3xl font-semibold tabular-nums">{countDisplay}</span>
        )}
      </div>
      <div className="mt-1 flex items-center gap-0.5 text-xs font-medium">
        {isLoading ? (
          <Skeleton className="h-4 w-10" />
        ) : muted ? (
          <span className="text-muted-foreground tabular-nums">—</span>
        ) : delta7d !== null ? (
          <>
            {delta7d === 0 ? (
              <Minus className="size-3.5 text-muted-foreground" aria-hidden />
            ) : delta7d > 0 ? (
              <ChevronUp
                className={cn("size-3.5", deltaColorClass(delta7d, invert))}
                aria-hidden
              />
            ) : (
              <ChevronDown
                className={cn("size-3.5", deltaColorClass(delta7d, invert))}
                aria-hidden
              />
            )}
            <span className={cn("tabular-nums", deltaColorClass(delta7d, invert))}>
              {formatDelta(delta7d)}
            </span>
          </>
        ) : null}
      </div>
    </>
  );

  if (onClick) {
    return (
      <button
        ref={ref}
        type="button"
        className={shellClass}
        onClick={onClick}
        aria-pressed={isActive}
        aria-label={ariaLabel}
        role="tab"
      >
        {content}
      </button>
    );
  }

  return (
    <div className={shellClass} aria-label={ariaLabel}>
      {content}
    </div>
  );
});
