"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { MessageSquare, Mic, Video } from "lucide-react";
import {
  getPatientConsultTimeline,
  type ConsultTimelineEntry,
} from "@/lib/api/patients";
import { buildCockpitAppointmentPath } from "@/lib/cockpit/back-target";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * rec-28 — consult timeline on the patient profile Overview.
 * Read-only. No mint, no delete. Drill-down reuses EndedCard.
 */

export interface ConsultTimelinePaneProps {
  patientId: string;
  token: string;
}

const MODALITY_ICON = {
  video: Video,
  voice: Mic,
  text: MessageSquare,
} as const;

function formatConsultedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Unknown date";
  return d.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return "Duration unknown";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

function artifactChips(entry: ConsultTimelineEntry): string[] {
  const chips: string[] = [];
  if (entry.artifacts.hasRecording) chips.push("Recording");
  if (entry.artifacts.recordingDeleted && !entry.artifacts.hasRecording) {
    chips.push("Recording deleted (retention)");
  }
  if (entry.artifacts.hasTranscript) chips.push("Transcript");
  if (entry.artifacts.hasPrescription) chips.push("Prescription");
  if (entry.artifacts.hasSnapshots) chips.push("Snapshots");
  return chips;
}

export function ConsultTimelinePane({
  patientId,
  token,
}: ConsultTimelinePaneProps) {
  const [items, setItems] = useState<ConsultTimelineEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getPatientConsultTimeline(token, patientId);
      setItems(data.items);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to load consults.");
      setItems(null);
    } finally {
      setLoading(false);
    }
  }, [patientId, token]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !items) {
    return (
      <Card className="shadow-sm lg:col-span-2" data-testid="consult-timeline-pane">
        <CardContent className="space-y-3 p-4">
          <Skeleton className="h-4 w-1/4" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="shadow-sm lg:col-span-2" data-testid="consult-timeline-pane">
        <CardContent className="space-y-3 p-4">
          <p className="text-sm font-medium">Consults</p>
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
          <Button type="button" variant="outline" size="sm" onClick={() => load()}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const list = items ?? [];

  return (
    <Card className="shadow-sm lg:col-span-2" data-testid="consult-timeline-pane">
      <CardContent className="space-y-3 p-4">
        <p className="text-sm font-medium">Consults</p>
        {list.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No consults yet for this patient.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {list.map((entry) => {
              const Icon = MODALITY_ICON[entry.modality];
              const chips = artifactChips(entry);
              const href = buildCockpitAppointmentPath(entry.appointmentId, "patients-v2", {
                patientId,
              });
              return (
                <li key={entry.sessionId}>
                  <Link
                    href={href}
                    className="flex items-start gap-3 py-3 text-sm hover:bg-muted/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-baseline gap-x-2">
                        <span className="font-medium">{formatConsultedAt(entry.consultedAt)}</span>
                        <span className="capitalize text-muted-foreground">{entry.modality}</span>
                        <span className="text-muted-foreground">
                          {formatDuration(entry.durationSeconds)}
                        </span>
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {chips.length > 0
                          ? chips.join(" · ")
                          : "No recording, transcript, prescription, or snapshots"}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
