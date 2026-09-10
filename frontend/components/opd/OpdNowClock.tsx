"use client";

import { formatTimeShort } from "@/lib/format-date";
import { useNowMs } from "@/hooks/useNowMs";
import { cn } from "@/lib/utils";

/**
 * Ambient wall-clock beside the OPD page title — reference point for the
 * per-row deltas on the board.
 */
export function OpdNowClock({ className }: { className?: string }): JSX.Element {
  const nowMs = useNowMs(30_000);
  const time = formatTimeShort(nowMs);

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-baseline gap-1.5 text-sm text-muted-foreground",
        className
      )}
      aria-live="polite"
      aria-atomic="true"
      aria-label={`Current time ${time}`}
    >
      <span className="text-xs uppercase tracking-wide">Now</span>
      <span className="font-medium tabular-nums tracking-tight text-foreground">
        {time}
      </span>
    </span>
  );
}
