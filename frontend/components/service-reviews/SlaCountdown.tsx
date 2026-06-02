"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/format-date";
import { formatAgo, formatTimeUntil } from "@/lib/relative-time";

const TICK_MS = 30_000;

export function useTickInterval(ms: number = TICK_MS): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

export function SlaCountdown({ deadlineIso }: { deadlineIso: string }) {
  const now = useTickInterval();
  const { label, urgency } = formatTimeUntil(deadlineIso, now);
  const variant =
    urgency === "overdue" ? "destructive" : urgency === "soon" ? "warning" : "info";
  const absolute = formatDateTime(deadlineIso, { dateStyle: "short", timeStyle: "short" });

  return (
    <Badge variant={variant} title={absolute} className="tabular-nums">
      <Clock className="mr-1 h-3 w-3" />
      {label}
    </Badge>
  );
}

export function QueuedAgeLabel({ createdAtIso }: { createdAtIso: string }) {
  const now = useTickInterval();
  const ago = formatAgo(createdAtIso, now);
  const absolute = formatDateTime(createdAtIso, { dateStyle: "short", timeStyle: "short" });

  if (ago === "—") {
    return <span className="tabular-nums text-muted-foreground">—</span>;
  }

  return (
    <span className="text-sm tabular-nums text-muted-foreground" title={absolute}>
      queued {ago}
    </span>
  );
}
