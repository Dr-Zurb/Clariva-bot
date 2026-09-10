"use client";

import { useDeskTodayQuery } from "@/hooks/queries/useDeskTodayQuery";
import { formatDeskWeekday } from "@/lib/desk/format";

export function DeskHeaderStatus({ token }: { token: string }) {
  const { timezone, counts, loading } = useDeskTodayQuery(token);

  if (loading) return null;

  return (
    <p className="hidden min-w-0 items-center gap-2 truncate text-xs text-muted-foreground sm:flex">
      <span className="shrink-0 tabular-nums">{formatDeskWeekday(timezone)}</span>
      <span aria-hidden className="text-border">
        ·
      </span>
      <span className="truncate tabular-nums">
        {counts.waiting} waiting · {counts.arrived} arrived
      </span>
    </p>
  );
}
