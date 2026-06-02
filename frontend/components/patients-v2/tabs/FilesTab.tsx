"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Download, FileImage, FileText } from "lucide-react";
import {
  getAppointmentsForPatient,
  getPrescriptionDownloadUrl,
  listPrescriptionsByPatient,
} from "@/lib/api";
import { formatDate } from "@/lib/format-date";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { Appointment } from "@/types/appointment";
import type { PrescriptionAttachment, PrescriptionWithRelations } from "@/types/prescription";
import { chiefComplaintForVisit } from "./history-tabs-utils";
import { useTabOpenedTelemetry } from "./use-tab-opened-telemetry";

export interface FilesTabProps {
  patientId: string;
  token: string;
}

type FileFilter = "all" | "images" | "pdfs" | "other";

const FILTER_OPTIONS: { key: FileFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "images", label: "Images" },
  { key: "pdfs", label: "PDFs" },
  { key: "other", label: "Other" },
];

export type FlatAttachment = PrescriptionAttachment & {
  prescriptionId: string;
  visitDate: string;
  visitId: string;
  chiefComplaint: string;
};

function fileNameFromPath(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1] || path;
}

function fileCategory(fileType: string | null): FileFilter {
  const t = (fileType ?? "").toLowerCase();
  if (t.startsWith("image/")) return "images";
  if (t === "application/pdf" || t.endsWith("/pdf")) return "pdfs";
  return "other";
}

function matchesFilter(att: FlatAttachment, filter: FileFilter): boolean {
  if (filter === "all") return true;
  return fileCategory(att.file_type) === filter;
}

export function FilesTab({ patientId, token }: FilesTabProps) {
  useTabOpenedTelemetry("files", patientId);

  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FileFilter>("all");
  const [expandedVisit, setExpandedVisit] = useState<string | null>(null);
  const [groups, setGroups] = useState<
    { visit: Appointment; attachments: FlatAttachment[] }[]
  >([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    void Promise.all([
      getAppointmentsForPatient(token, patientId),
      listPrescriptionsByPatient(token, patientId),
    ])
      .then(([apptRes, rxRes]) => {
        if (cancelled) return;
        const visits = (apptRes.data.appointments ?? []).sort(
          (a, b) =>
            new Date(b.appointment_date).getTime() -
            new Date(a.appointment_date).getTime(),
        );
        const rxByAppt = new Map<string, PrescriptionWithRelations>();
        for (const rx of rxRes.data.prescriptions ?? []) {
          if (rx.appointment_id && !rxByAppt.has(rx.appointment_id)) {
            rxByAppt.set(rx.appointment_id, rx);
          }
        }
        const grouped = visits
          .map((visit) => {
            const rx = rxByAppt.get(visit.id);
            const attachments: FlatAttachment[] = (rx?.prescription_attachments ?? []).map(
              (att) => ({
                ...att,
                prescriptionId: rx!.id,
                visitDate: visit.appointment_date,
                visitId: visit.id,
                chiefComplaint: chiefComplaintForVisit(visit),
              }),
            );
            return { visit, attachments };
          })
          .filter((g) => g.attachments.length > 0);
        setGroups(grouped);
        setExpandedVisit((prev) => prev ?? grouped[0]?.visit.id ?? null);
      })
      .catch(() => {
        if (!cancelled) setGroups([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [patientId, token]);

  useEffect(() => load(), [load]);

  const filteredGroups = useMemo(() => {
    return groups
      .map((g) => ({
        ...g,
        attachments: g.attachments.filter((a) => matchesFilter(a, filter)),
      }))
      .filter((g) => g.attachments.length > 0);
  }, [groups, filter]);

  const totalCount = useMemo(
    () => filteredGroups.reduce((n, g) => n + g.attachments.length, 0),
    [filteredGroups],
  );

  const openAttachment = async (att: FlatAttachment) => {
    const key = `${att.prescriptionId}-${att.id}`;
    setBusyId(key);
    try {
      const res = await getPrescriptionDownloadUrl(token, att.prescriptionId, att.id);
      const url = res.data.downloadUrl;
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      /* ignore */
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <p className="p-6 text-center text-sm text-muted-foreground">
        No files uploaded for this patient yet.
      </p>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {totalCount} file{totalCount === 1 ? "" : "s"} across visits
        </p>
        <div className="flex flex-wrap gap-1" role="group" aria-label="File type filter">
          {FILTER_OPTIONS.map((opt) => (
            <Button
              key={opt.key}
              type="button"
              size="sm"
              variant={filter === opt.key ? "default" : "outline"}
              onClick={() => setFilter(opt.key)}
            >
              {opt.label}
            </Button>
          ))}
        </div>
      </div>

      {filteredGroups.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground">
          No files match this filter.
        </p>
      ) : (
        <div className="space-y-2">
          {filteredGroups.map(({ visit, attachments }) => {
            const open = expandedVisit === visit.id;
            return (
              <div key={visit.id} className="rounded-lg border">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/50"
                  onClick={() => setExpandedVisit(open ? null : visit.id)}
                >
                  {open ? (
                    <ChevronDown className="h-4 w-4 shrink-0" aria-hidden />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {formatDate(visit.appointment_date)}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {chiefComplaintForVisit(visit)}
                    </p>
                  </div>
                  <Badge variant="secondary" className="shrink-0">
                    {attachments.length}
                  </Badge>
                </button>
                {open ? (
                  <ul className="divide-y border-t">
                    {attachments.map((att) => {
                      const key = `${att.prescriptionId}-${att.id}`;
                      const isImage = (att.file_type ?? "").startsWith("image/");
                      return (
                        <li key={att.id}>
                          <button
                            type="button"
                            className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted/40"
                            disabled={busyId === key}
                            onClick={() => void openAttachment(att)}
                          >
                            {isImage ? (
                              <FileImage
                                className="h-8 w-8 shrink-0 text-muted-foreground"
                                aria-hidden
                              />
                            ) : (
                              <FileText
                                className="h-8 w-8 shrink-0 text-muted-foreground"
                                aria-hidden
                              />
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">
                                {att.caption?.trim() || fileNameFromPath(att.file_path)}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {att.file_type ?? "file"} ·{" "}
                                {formatDate(att.uploaded_at)}
                              </p>
                            </div>
                            <Download
                              className={cn(
                                "h-4 w-4 shrink-0 text-muted-foreground",
                                busyId === key && "opacity-40",
                              )}
                              aria-hidden
                            />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
