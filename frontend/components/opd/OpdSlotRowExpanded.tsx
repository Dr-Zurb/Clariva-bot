"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink } from "lucide-react";
import Link from "next/link";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { listPatientAllergies } from "@/lib/api";
import { formatDateTime } from "@/lib/format-date";
import type { PatientAllergy } from "@/types/patient-chart";
import type { SlotSessionRow } from "@/types/opd-doctor";

export interface OpdSlotRowExpandedProps {
  entry: SlotSessionRow;
  token: string;
  onLoaded?: () => void;
}

interface PanelData {
  allergies: PatientAllergy[];
}

const SEVERITY_CHIP: Record<string, string> = {
  severe: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  moderate:
    "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  mild: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
  unknown: "bg-muted text-muted-foreground",
};

const MAX_VISIBLE_CHIPS = 3;

function AllergyChips({ allergies }: { allergies: PatientAllergy[] }) {
  const active = allergies.filter((a) => !a.archived_at);

  if (active.length === 0) {
    return (
      <span className="text-xs text-muted-foreground">No known allergies</span>
    );
  }

  const visible = active.slice(0, MAX_VISIBLE_CHIPS);
  const overflow = active.slice(MAX_VISIBLE_CHIPS);

  return (
    <div className="flex flex-wrap gap-1">
      {visible.map((a) => (
        <span
          key={a.id}
          role="img"
          aria-label={`Allergy: ${a.allergen}${a.severity !== "unknown" ? `, ${a.severity}` : ""}`}
          className={cn(
            "inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium",
            SEVERITY_CHIP[a.severity] ?? SEVERITY_CHIP.unknown
          )}
        >
          {a.allergen}
        </span>
      ))}
      {overflow.length > 0 && (
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className="inline-flex cursor-default items-center rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground"
                aria-label={`${overflow.length} more allergies: ${overflow.map((x) => x.allergen).join(", ")}`}
              >
                +{overflow.length} more
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <ul className="space-y-0.5">
                {overflow.map((a) => (
                  <li key={a.id} className="text-xs">
                    {a.allergen}
                    {a.severity !== "unknown" && (
                      <span className="ml-1 text-muted-foreground">
                        ({a.severity})
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
}

function PanelSkeleton() {
  return (
    <div className="flex gap-4 p-3">
      <Skeleton className="h-4 flex-1 rounded" />
      <Skeleton className="h-4 flex-1 rounded" />
      <Skeleton className="h-4 flex-1 rounded" />
    </div>
  );
}

export function OpdSlotRowExpanded({
  entry,
  token,
  onLoaded,
}: OpdSlotRowExpandedProps): JSX.Element {
  const isWalkIn = entry.patientId == null;
  const [panelData, setPanelData] = useState<PanelData | null>(null);
  const [loading, setLoading] = useState(!isWalkIn);
  const [fetchError, setFetchError] = useState(false);
  const fetchedRef = useRef(false);

  const doFetch = useCallback(async () => {
    if (isWalkIn) return;
    setLoading(true);
    setFetchError(false);
    try {
      let allergies: PatientAllergy[] = [];
      if (entry.patientId) {
        const res = await listPatientAllergies(token, entry.patientId);
        allergies = res.data.allergies;
      }
      setPanelData({ allergies });
      onLoaded?.();
    } catch {
      setFetchError(true);
    } finally {
      setLoading(false);
    }
  }, [entry.patientId, token, onLoaded, isWalkIn]);

  useEffect(() => {
    if (isWalkIn || fetchedRef.current) return;
    fetchedRef.current = true;
    void doFetch();
  }, [doFetch, isWalkIn]);

  const scheduledLine = formatDateTime(entry.scheduledAt, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  const durationPart =
    entry.durationMinutes != null
      ? ` · ${entry.durationMinutes} min slot`
      : "";

  if (!entry.patientId) {
    return (
      <section
        aria-label="Walk-in appointment context"
        role="region"
        className="border-b border-border bg-muted/40 px-3 py-3"
      >
        <p className="text-xs font-medium text-foreground">
          Walk-in appointment — no chart data
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Scheduled: {scheduledLine}
          {durationPart}
        </p>
        {entry.patientNote && (
          <div className="mt-2 border-t border-border/60 pt-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Booking note
            </p>
            <p className="text-xs italic text-foreground">
              &ldquo;{entry.patientNote}&rdquo;
            </p>
          </div>
        )}
      </section>
    );
  }

  if (loading) {
    return (
      <section
        aria-label="Patient context for slot row"
        role="region"
        className="border-b border-border bg-muted/40"
      >
        <PanelSkeleton />
      </section>
    );
  }

  if (fetchError) {
    return (
      <section
        aria-label="Patient context for slot row"
        role="region"
        className="border-b border-border bg-muted/40 px-4 py-2.5 text-xs text-muted-foreground"
      >
        Couldn&apos;t load patient context.{" "}
        <button
          type="button"
          onClick={() => {
            fetchedRef.current = false;
            void doFetch();
          }}
          className="font-medium underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          Retry
        </button>
      </section>
    );
  }

  const hasEpisode = Boolean(entry.episodeId);

  return (
    <section
      aria-label="Patient context for slot row"
      role="region"
      className="border-b border-border bg-muted/40"
    >
      <div className="border-b border-border/60 px-3 py-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Scheduled
        </p>
        <p className="text-xs text-foreground">
          {scheduledLine}
          {durationPart}
        </p>
      </div>

      <div className="flex flex-col gap-3 p-3 lg:flex-row lg:gap-4">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Last visit
          </p>
          <p className="text-xs text-muted-foreground">—</p>
        </div>

        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Allergies
          </p>
          {panelData ? (
            <AllergyChips allergies={panelData.allergies} />
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </div>

        {hasEpisode && (
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Episode
            </p>
            <Link
              href={`/dashboard/episodes/${entry.episodeId}`}
              className={cn(
                "inline-flex items-center gap-1 text-xs text-primary underline-offset-2 hover:underline",
                "rounded focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              )}
              aria-label={`Open episode ${entry.episodeId}`}
            >
              <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
              Open episode
            </Link>
          </div>
        )}

        {!hasEpisode && <div className="hidden flex-1 lg:block" />}
      </div>

      {entry.reasonForVisit && (
        <div className="border-t border-border/60 px-3 py-2">
          <span className="mr-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Reason:
          </span>
          <span className="text-xs text-foreground">{entry.reasonForVisit}</span>
        </div>
      )}

      {entry.patientNote && (
        <div className="border-t border-border/60 px-3 py-2">
          <p className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Booking note
          </p>
          <p className="text-xs italic text-foreground">
            &ldquo;{entry.patientNote}&rdquo;
          </p>
        </div>
      )}
    </section>
  );
}
