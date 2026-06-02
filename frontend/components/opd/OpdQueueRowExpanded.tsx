"use client";

/**
 * OpdQueueRowExpanded — inline-expand secondary panel (oq-05).
 *
 * Renders beneath a clicked OpdQueueDenseRow to reveal secondary clinical
 * context that the dense row can't carry: allergies/flags, episode link,
 * full reason for visit, and the patient's booking note to the doctor.
 *
 * Data is fetched lazily on first mount (only once per entry per session).
 * The panel reads from:
 *   - entry.patientId   → allergies via listPatientAllergies
 *   - entry.episodeId   → episode link (no separate fetch — renders the ID)
 *   - entry.reasonForVisit → already on the queue row
 *   - entry.patientNote → already on the queue row (appointments.notes)
 *
 * "Last visit" column: no patient-appointments list endpoint exists yet.
 * Rendered as "—" until a helper is added.
 * TODO (oq-05 follow-up): add getPatientAppointments helper and wire it here.
 *
 * @see docs/Work/Daily-plans/May 2026/08-05-2026/Tasks/task-oq-05-row-expanded-panel.md
 */

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
import type { PatientAllergy } from "@/types/patient-chart";
import type { DoctorQueueSessionRow } from "@/types/opd-doctor";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface OpdQueueRowExpandedProps {
  entry: DoctorQueueSessionRow;
  /** Doctor JWT for fetching the side data. */
  token: string;
  /** Optional callback fired when the panel data finishes its first load (telemetry, pre-warm). */
  onLoaded?: () => void;
}

// ---------------------------------------------------------------------------
// Internal — panel data shape
// ---------------------------------------------------------------------------

interface PanelData {
  allergies: PatientAllergy[];
}

// ---------------------------------------------------------------------------
// AllergyChips
// ---------------------------------------------------------------------------

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
    return <span className="text-xs text-muted-foreground">None recorded</span>;
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
                aria-label={`${overflow.length} more allergies: ${overflow.map((a) => a.allergen).join(", ")}`}
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

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function PanelSkeleton() {
  return (
    <div className="flex gap-4 p-3">
      <Skeleton className="h-4 flex-1 rounded" />
      <Skeleton className="h-4 flex-1 rounded" />
      <Skeleton className="h-4 flex-1 rounded" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function OpdQueueRowExpanded({
  entry,
  token,
  onLoaded,
}: OpdQueueRowExpandedProps): JSX.Element {
  const [panelData, setPanelData] = useState<PanelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);

  // Guard: fetch only once per mount, even under strict-mode double-invoke.
  const fetchedRef = useRef(false);

  const doFetch = useCallback(async () => {
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
  }, [entry.patientId, token, onLoaded]);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    void doFetch();
  }, [doFetch]);

  // ── Loading ──
  if (loading) {
    return (
      <section
        aria-label={`Patient context for token #${entry.tokenNumber}`}
        role="region"
        className="border-b border-border bg-muted/40"
      >
        <PanelSkeleton />
      </section>
    );
  }

  // ── Error ──
  if (fetchError) {
    return (
      <section
        aria-label={`Patient context for token #${entry.tokenNumber}`}
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
      aria-label={`Patient context for token #${entry.tokenNumber}`}
      role="region"
      className="border-b border-border bg-muted/40"
    >
      {/* ── Three-column strip ── */}
      <div className="flex flex-col gap-3 p-3 lg:flex-row lg:gap-4">
        {/* ── Col 1 — Last visit ── */}
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Last visit
          </p>
          {/*
           * TODO (oq-05 follow-up): wire getPatientAppointments helper once
           * a /api/v1/patients/:id/appointments endpoint is available.
           */}
          <p className="text-xs text-muted-foreground">—</p>
        </div>

        {/* ── Col 2 — Allergies ── */}
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Allergies
          </p>
          {panelData ? (
            entry.patientId ? (
              <AllergyChips allergies={panelData.allergies} />
            ) : (
              <span className="text-xs text-muted-foreground">
                No patient record
              </span>
            )
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </div>

        {/* ── Col 3 — Episode ── */}
        {hasEpisode && (
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Episode
            </p>
            <Link
              href={`/dashboard/episodes/${entry.episodeId}`}
              className={cn(
                "inline-flex items-center gap-1 text-xs text-primary underline-offset-2 hover:underline",
                "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded"
              )}
              aria-label={`Open episode ${entry.episodeId}`}
            >
              <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
              Open episode
            </Link>
          </div>
        )}

        {/* Spacer when episode column is absent so 2-column layout still fills nicely */}
        {!hasEpisode && <div className="hidden flex-1 lg:block" />}
      </div>

      {/* ── Full-width — Reason for visit ── */}
      {entry.reasonForVisit && (
        <div className="border-t border-border/60 px-3 py-2">
          <span className="mr-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Reason:
          </span>
          <span className="text-xs text-foreground">{entry.reasonForVisit}</span>
        </div>
      )}

      {/* ── Full-width — Patient note ── */}
      {entry.patientNote && (
        <div className="border-t border-border/60 px-3 py-2">
          <p className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Patient note
          </p>
          <p className="text-xs italic text-foreground">&ldquo;{entry.patientNote}&rdquo;</p>
        </div>
      )}
    </section>
  );
}
