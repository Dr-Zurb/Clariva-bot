"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Building2,
  Calendar,
  Copy,
  Globe,
  MessageSquare,
  Mic,
  Phone,
  Video,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { PatientListColumnId } from "@/lib/patients-v2/list-preferences";
import {
  copyToClipboard,
  formatRelativeDate,
  formatTableDemographics,
  maskPhoneDisplay,
} from "@/lib/patients-v2/list-utils";
import { cn } from "@/lib/utils";
import type { PatientListSortId, PatientSummary } from "@/types/patient";
import type { ConsultationModality } from "@/types/appointment";

export interface PatientsTableColumn {
  id: PatientListColumnId | "name";
  label: string;
  sortKey?: PatientListSortId;
  optional: boolean;
  defaultVisible: boolean;
  cell: (patient: PatientSummary, ctx: CellContext) => React.ReactNode;
  headerClass?: string;
  cellClass?: string;
}

export interface CellContext {
  showRiskPills: boolean;
  onCopyMrn?: (message: string) => void;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
}

function ModalityIcon({
  modality,
  className,
}: {
  modality: string | null | undefined;
  className?: string;
}) {
  const cls = cn("h-3.5 w-3.5 shrink-0 text-muted-foreground", className);
  const m = modality as ConsultationModality | undefined;
  if (m === "text") return <MessageSquare className={cls} aria-hidden />;
  if (m === "voice") return <Mic className={cls} aria-hidden />;
  if (m === "in_clinic") return <Phone className={cls} aria-hidden />;
  return <Video className={cls} aria-hidden />;
}

function RiskPills({ patient }: { patient: PatientSummary }) {
  const pills: React.ReactNode[] = [];
  if (patient.has_allergies) {
    pills.push(
      <Badge key="allergy" variant="destructive" className="text-[10px] px-1.5 py-0">
        Allergy
      </Badge>,
    );
  }
  if ((patient.open_episodes_count ?? 0) > 0) {
    pills.push(
      <Badge key="episodes" variant="secondary" className="text-[10px] px-1.5 py-0">
        Open episode
      </Badge>,
    );
  }
  if (patient.overdue_followup) {
    pills.push(
      <Badge key="followup" variant="outline" className="text-[10px] px-1.5 py-0 border-warning text-warning">
        Overdue F/U
      </Badge>,
    );
  }
  if (pills.length === 0) return null;
  return <div className="mt-0.5 flex flex-wrap gap-1">{pills}</div>;
}

export function avatarCell(patient: PatientSummary): React.ReactNode {
  return (
    <div
      className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground"
      aria-hidden
    >
      {initials(patient.name)}
    </div>
  );
}

export function nameAndRiskPillsCell(
  patient: PatientSummary,
  ctx: CellContext,
): React.ReactNode {
  return (
    <div className="min-w-[10rem]">
      <Link
        href={`/dashboard/patients-v2/${patient.id}`}
        className="font-medium text-foreground hover:text-primary hover:underline"
      >
        {patient.name}
      </Link>
      {ctx.showRiskPills ? <RiskPills patient={patient} /> : null}
    </div>
  );
}

export function demographicsCell(patient: PatientSummary): React.ReactNode {
  return (
    <span className="text-muted-foreground">
      {formatTableDemographics(patient.age, patient.gender)}
    </span>
  );
}

export function mrnCell(patient: PatientSummary, ctx: CellContext): React.ReactNode {
  const mrn = patient.medical_record_number;
  if (!mrn) return <span className="text-muted-foreground">—</span>;
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 text-sm hover:text-primary"
      title="Click to copy"
      onClick={async (e) => {
        e.stopPropagation();
        const ok = await copyToClipboard(mrn);
        if (ok) ctx.onCopyMrn?.("Copied MRN");
      }}
    >
      {mrn}
      <Copy className="h-3 w-3 opacity-60" aria-hidden />
    </button>
  );
}

export function PhoneCellInner({ patient }: { patient: PatientSummary }) {
  const [revealed, setRevealed] = useState(false);
  const display = revealed ? patient.phone : maskPhoneDisplay(patient.phone);

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        className="text-sm text-muted-foreground hover:text-foreground"
        onClick={(e) => {
          e.stopPropagation();
          setRevealed(true);
          window.setTimeout(() => setRevealed(false), 5000);
        }}
      >
        {display}
      </button>
      <a
        href={`tel:${patient.phone.replace(/\s/g, "")}`}
        className="text-primary hover:text-primary/80"
        aria-label="Call patient"
        onClick={(e) => e.stopPropagation()}
      >
        <Phone className="h-3.5 w-3.5" />
      </a>
    </div>
  );
}


export function phoneCell(patient: PatientSummary): React.ReactNode {
  return <PhoneCellInner patient={patient} />;
}

export function lastVisitCell(patient: PatientSummary): React.ReactNode {
  if (!patient.last_appointment_date) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <div className="flex items-center gap-1.5 text-sm">
      <ModalityIcon modality={patient.last_visit_modality} />
      <span>{formatRelativeDate(patient.last_appointment_date)}</span>
    </div>
  );
}

function appointmentStatusLabel(status: string | null | undefined): string {
  if (!status) return "";
  const s = status.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function nextVisitCell(patient: PatientSummary): React.ReactNode {
  if (!patient.next_appointment_date) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <div className="flex flex-col gap-0.5 text-sm">
      <div className="flex items-center gap-1.5">
        <Calendar className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <span>{formatRelativeDate(patient.next_appointment_date)}</span>
      </div>
      {patient.next_appointment_status ? (
        <Badge variant="outline" className="w-fit text-[10px]">
          {appointmentStatusLabel(patient.next_appointment_status)}
        </Badge>
      ) : null}
    </div>
  );
}

export function openEpisodesCell(patient: PatientSummary): React.ReactNode {
  const count = patient.open_episodes_count ?? 0;
  if (count === 0) return <span className="text-muted-foreground">0</span>;
  return (
    <Link
      href={`/dashboard/patients-v2?segment=has-open-episodes&q=${encodeURIComponent(patient.name)}`}
      className="font-medium text-primary hover:underline"
      onClick={(e) => e.stopPropagation()}
    >
      {count}
    </Link>
  );
}

function SourceIcon({ platform }: { platform: string | null | undefined }) {
  const p = (platform ?? "").toLowerCase();
  if (p.includes("whatsapp")) return <MessageSquare className="h-3.5 w-3.5" aria-hidden />;
  if (p.includes("instagram")) return <Globe className="h-3.5 w-3.5" aria-hidden />;
  if (p.includes("web")) return <Globe className="h-3.5 w-3.5" aria-hidden />;
  return <Building2 className="h-3.5 w-3.5" aria-hidden />;
}

export function sourceChannelCell(patient: PatientSummary): React.ReactNode {
  const label = patient.platform ?? patient.platform_external_id;
  if (!label) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex items-center gap-1.5 text-sm capitalize">
      <SourceIcon platform={patient.platform} />
      <span className="truncate max-w-[8rem]">{label}</span>
    </div>
  );
}

/** Always-on name column + optional columns aligned with list-preferences ids. */
export const PATIENTS_TABLE_COLUMNS: ReadonlyArray<PatientsTableColumn> = [
  {
    id: "avatar",
    label: "",
    optional: true,
    defaultVisible: true,
    cell: (p) => avatarCell(p),
    cellClass: "w-10",
  },
  {
    id: "name",
    label: "Name",
    sortKey: "name-asc",
    optional: false,
    defaultVisible: true,
    cell: (p, ctx) => nameAndRiskPillsCell(p, ctx),
  },
  {
    id: "demographics",
    label: "Demographics",
    optional: true,
    defaultVisible: true,
    cell: (p) => demographicsCell(p),
  },
  {
    id: "mrn",
    label: "MRN",
    optional: true,
    defaultVisible: true,
    cell: (p, ctx) => mrnCell(p, ctx),
  },
  {
    id: "phone",
    label: "Phone",
    optional: true,
    defaultVisible: true,
    cell: (p) => phoneCell(p),
  },
  {
    id: "last-visit",
    label: "Last visit",
    sortKey: "last-visit-desc",
    optional: true,
    defaultVisible: true,
    cell: (p) => lastVisitCell(p),
  },
  {
    id: "next-visit",
    label: "Next visit",
    optional: true,
    defaultVisible: false,
    cell: (p) => nextVisitCell(p),
  },
  {
    id: "open-episodes",
    label: "Open episodes",
    optional: true,
    defaultVisible: false,
    cell: (p) => openEpisodesCell(p),
  },
  {
    id: "source-channel",
    label: "Source",
    optional: true,
    defaultVisible: false,
    cell: (p) => sourceChannelCell(p),
  },
];
