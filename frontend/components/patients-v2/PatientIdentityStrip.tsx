"use client";

import { useCallback, useMemo, useState } from "react";
import {
  MessageSquare,
  Mic,
  MoreVertical,
  Phone,
  Video,
} from "lucide-react";
import MergePatientsModal from "@/components/patients-v2/shared/MergePatientsModal";
import { SplitStartButton } from "@/components/patient-profile/SplitStartButton";
import { formatDemographics } from "@/components/patient-profile/PatientProfileHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getPossibleDuplicates } from "@/lib/api/patients";
import { trackPatientsV2SplitStartButtonUsed } from "@/lib/patients-v2/telemetry";
import { maskPhoneDisplay } from "@/lib/patients-v2/list-utils";
import { cn } from "@/lib/utils";
import type { ConsultationModality } from "@/types/appointment";
import type {
  DuplicateGroupPatient,
  Patient,
  PatientOverviewData,
} from "@/types/patient";
import { SixVisitDotBreadcrumb } from "./SixVisitDotBreadcrumb";

export type PatientHeaderAction =
  | { type: "book_consult"; modality: ConsultationModality }
  | { type: "edit" }
  | { type: "merge" }
  | { type: "audit_log" }
  | { type: "export_pdf" }
  | { type: "delete" };

export interface PatientIdentityStripProps {
  patient: Patient;
  overview: PatientOverviewData | null;
  token: string;
  onAction: (action: PatientHeaderAction) => void;
  onVisitClick: (appointmentId: string) => void;
}

type PatientWithMrn = Patient & { medical_record_number?: string | null };

interface HealthChip {
  label: string;
  className: string;
}

const MAX_VISIBLE_CHIPS = 3;
const LABEL_MAX = 32;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
}

function truncateLabel(label: string): string {
  if (label.length <= LABEL_MAX) return label;
  return `${label.slice(0, LABEL_MAX)}…`;
}

function ageFromDob(dob: string | null | undefined): number | null {
  if (!dob) return null;
  try {
    const birth = new Date(dob);
    if (Number.isNaN(birth.getTime())) return null;
    const now = new Date();
    let age = now.getFullYear() - birth.getFullYear();
    const hadBirthday =
      now.getMonth() > birth.getMonth() ||
      (now.getMonth() === birth.getMonth() && now.getDate() >= birth.getDate());
    return hadBirthday ? age : age - 1;
  } catch {
    return null;
  }
}

function buildHealthChips(overview: PatientOverviewData | null): HealthChip[] {
  if (!overview) return [];
  const chips: HealthChip[] = [];
  for (const a of overview.allergies) {
    if (a.archived_at) continue;
    chips.push({
      label: truncateLabel(a.allergen),
      className: "border-destructive/40 text-destructive",
    });
  }
  for (const c of overview.chronic_conditions) {
    if (c.archived_at) continue;
    chips.push({
      label: truncateLabel(c.condition),
      className: "border-amber-200 text-amber-800",
    });
  }
  for (const p of overview.active_problems) {
    chips.push({
      label: truncateLabel(p.label),
      className: "border-muted-foreground/40",
    });
  }
  return chips;
}

function Dot() {
  return (
    <span aria-hidden className="mx-1.5 text-muted-foreground/50">
      ·
    </span>
  );
}

function ModalityIcon({ modality }: { modality: ConsultationModality }) {
  const cls = "h-3.5 w-3.5";
  if (modality === "text") return <MessageSquare className={cls} aria-hidden />;
  if (modality === "voice") return <Mic className={cls} aria-hidden />;
  if (modality === "in_clinic") return <Phone className={cls} aria-hidden />;
  return <Video className={cls} aria-hidden />;
}

function modalityToastLabel(modality: ConsultationModality): string {
  if (modality === "text") return "Text";
  if (modality === "voice") return "Voice";
  if (modality === "in_clinic") return "In-clinic";
  return "Video";
}

export function PatientIdentityStrip({
  patient,
  overview,
  token,
  onAction,
  onVisitClick,
}: PatientIdentityStripProps) {
  const [mergeGroup, setMergeGroup] = useState<DuplicateGroupPatient[] | null>(null);
  const [mergeBusy, setMergeBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 3500);
  }, []);

  const patientMrn =
    (patient as PatientWithMrn).medical_record_number ??
    (overview?.patient as PatientWithMrn | undefined)?.medical_record_number ??
    null;

  const age = ageFromDob(patient.date_of_birth);
  const demographics = formatDemographics(age, patient.gender);
  const maskedPhone = patient.phone ? maskPhoneDisplay(patient.phone) : null;

  const healthChips = useMemo(() => buildHealthChips(overview), [overview]);
  const visibleChips = healthChips.slice(0, MAX_VISIBLE_CHIPS);
  const overflowChips = healthChips.slice(MAX_VISIBLE_CHIPS);

  const bookOptions = useMemo(
    () => [
      {
        value: "voice" as const,
        label: "Voice",
        icon: <Mic className="h-3.5 w-3.5" aria-hidden />,
      },
      {
        value: "text" as const,
        label: "Text",
        icon: <MessageSquare className="h-3.5 w-3.5" aria-hidden />,
        disabled: !patient.phone,
        disabledReason: "Patient phone required for text consult",
      },
      {
        value: "in_clinic" as const,
        label: "In-clinic",
        icon: <Phone className="h-3.5 w-3.5" aria-hidden />,
      },
    ],
    [patient.phone],
  );

  const handleMergeOpen = async () => {
    setMergeBusy(true);
    try {
      const groups = await getPossibleDuplicates(token);
      const group = groups.find((g) => g.some((p) => p.id === patient.id));
      if (!group || group.length < 2) {
        showToast("No duplicate records found for this patient.");
      } else {
        setMergeGroup(group);
      }
    } catch {
      showToast("Unable to check for duplicates. Please try again.");
    } finally {
      setMergeBusy(false);
    }
  };

  const handleHeaderAction = (action: PatientHeaderAction) => {
    if (action.type === "book_consult") {
      showToast(`Coming soon: ${modalityToastLabel(action.modality)} consult`);
      return;
    }
    if (action.type === "edit" || action.type === "export_pdf" || action.type === "delete") {
      showToast("Coming soon");
      return;
    }
    if (action.type === "merge") {
      void handleMergeOpen();
      return;
    }
    onAction(action);
  };

  return (
  <>
      <header className="border-b border-border bg-background px-4 py-3 lg:px-6">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium text-muted-foreground"
                aria-hidden
              >
                {initials(patient.name)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <h1 className="truncate text-xl font-semibold text-foreground">
                    {patient.name}
                  </h1>
                  {visibleChips.length > 0 ? (
                    <div className="flex flex-wrap items-center gap-1">
                      {visibleChips.map((chip, i) => (
                        <Badge
                          key={`${chip.label}-${i}`}
                          variant="outline"
                          className={cn("text-xs font-normal", chip.className)}
                        >
                          {chip.label}
                        </Badge>
                      ))}
                      {overflowChips.length > 0 ? (
                        <TooltipProvider delayDuration={200}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge
                                variant="outline"
                                className="cursor-default text-xs font-normal"
                              >
                                +{overflowChips.length} more
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              <ul className="list-inside list-disc text-left">
                                {overflowChips.map((chip, i) => (
                                  <li key={`${chip.label}-ov-${i}`}>{chip.label}</li>
                                ))}
                              </ul>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <SplitStartButton
                primary="video"
                options={bookOptions}
                label="Book consult"
                primaryIcon={<ModalityIcon modality="video" />}
                onAction={(modality) => {
                  trackPatientsV2SplitStartButtonUsed(modality);
                  handleHeaderAction({ type: "book_consult", modality });
                }}
              />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="ghost" size="icon" aria-label="More actions">
                    <MoreVertical className="h-4 w-4" aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onClick={() => handleHeaderAction({ type: "edit" })}>
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={mergeBusy}
                    onClick={() => handleHeaderAction({ type: "merge" })}
                  >
                    {mergeBusy ? "Checking…" : "Merge"}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleHeaderAction({ type: "audit_log" })}>
                    Audit log
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => handleHeaderAction({ type: "export_pdf" })}>
                    Export PDF
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => handleHeaderAction({ type: "delete" })}
                  >
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pl-[52px]">
            <p className="flex min-w-0 flex-wrap items-center text-xs text-muted-foreground">
              {demographics ? (
                <>
                  <span>{demographics}</span>
                  <Dot />
                </>
              ) : null}
              <span>MRN: {patientMrn ?? "—"}</span>
              {maskedPhone ? (
                <>
                  <Dot />
                  <span>Phone: {maskedPhone}</span>
                </>
              ) : null}
            </p>
            <SixVisitDotBreadcrumb
              visits={overview?.six_visit_strip ?? []}
              onVisitClick={onVisitClick}
            />
          </div>
        </div>
      </header>

      {toast ? (
        <div
          role="status"
          className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-md bg-foreground px-4 py-2 text-sm text-background shadow-lg"
        >
          {toast}
        </div>
      ) : null}

      {mergeGroup ? (
        <MergePatientsModal
          group={mergeGroup}
          onClose={() => setMergeGroup(null)}
          onSuccess={() => {
            setMergeGroup(null);
            showToast("Patients merged.");
          }}
        />
      ) : null}
    </>
  );
}
