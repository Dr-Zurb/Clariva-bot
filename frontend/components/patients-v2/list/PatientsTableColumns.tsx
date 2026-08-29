"use client";

import Link from "next/link";
import {
  Building2,
  Calendar,
  Copy,
  Globe,
  MessageSquare,
  Mic,
  Phone,
  Video,
  X,
} from "lucide-react";
import { PatientQuickPeek } from "@/components/patients-v2/list/PatientQuickPeek";
import { prefetchPatientQuickPeek } from "@/components/patients-v2/list/patientQuickPeekCache";
import { Badge } from "@/components/ui/badge";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import type { PatientListColumnId } from "@/lib/patients-v2/list-preferences";
import {
  copyToClipboard,
  formatPatientDisplayName,
  formatRelativeDate,
  formatTableDemographics,
} from "@/lib/patients-v2/list-utils";
import { coercePatientTags } from "@/lib/patients-v2/patient-tags";
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
  /** Auth token for name-hover quick peek. */
  token?: string;
  onCopyMrn?: (message: string) => void;
  onCopyPhone?: (message: string) => void;
  /** Click patient_tag badge → filter list by that tag. */
  onFilterByTag?: (tag: string) => void;
  /** × on badge → remove that tag from this patient only. */
  onRemoveTag?: (patientId: string, tag: string) => void;
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
  // Care-package "open episode" omitted — billing concept, not a doctor list signal.
  if (patient.overdue_followup) {
    pills.push(
      <Badge key="followup" variant="outline" className="text-[10px] px-1.5 py-0 border-warning text-warning">
        Overdue F/U
      </Badge>,
    );
  }
  if (pills.length === 0) return null;
  // Inline, no wrap — keeps list row height uniform with tag-free rows.
  return <div className="flex shrink-0 items-center gap-1">{pills}</div>;
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
  const tags = coercePatientTags(patient.patient_tags, patient.patient_tag);
  const visible = tags.slice(0, 2);
  const extra = tags.length - visible.length;
  const token = ctx.token;
  return (
    <div className="flex min-w-[10rem] max-w-full items-center gap-1.5">
      {token ? (
        <HoverCard openDelay={100} closeDelay={100}>
          <HoverCardTrigger asChild>
            <Link
              href={`/dashboard/patients-v2/${patient.id}`}
              className="min-w-0 truncate font-medium text-foreground hover:text-primary hover:underline"
              onPointerEnter={() => {
                void prefetchPatientQuickPeek(token, patient.id);
              }}
            >
              {formatPatientDisplayName(patient.name)}
            </Link>
          </HoverCardTrigger>
          <HoverCardContent
            side="bottom"
            align="start"
            sideOffset={8}
            collisionPadding={24}
            className="w-96 max-w-[min(24rem,calc(100vw-3rem))]"
          >
            <PatientQuickPeek patientId={patient.id} token={token} />
          </HoverCardContent>
        </HoverCard>
      ) : (
        <Link
          href={`/dashboard/patients-v2/${patient.id}`}
          className="min-w-0 truncate font-medium text-foreground hover:text-primary hover:underline"
        >
          {formatPatientDisplayName(patient.name)}
        </Link>
      )}
      {visible.map((tag) => (
        <span
          key={tag}
          className="inline-flex h-5 max-w-[8rem] shrink-0 items-center rounded-md bg-secondary text-secondary-foreground"
        >
          <button
            type="button"
            className="min-w-0 truncate py-0 pl-1.5 pr-0.5 text-[10px] font-medium leading-none hover:underline"
            title={`Filter by tag ${tag}`}
            onClick={(e) => {
              e.stopPropagation();
              ctx.onFilterByTag?.(tag);
            }}
          >
            {tag}
          </button>
          {ctx.onRemoveTag ? (
            <button
              type="button"
              className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-r-md text-muted-foreground hover:bg-muted hover:text-foreground"
              title={`Remove tag ${tag}`}
              aria-label={`Remove tag ${tag}`}
              onClick={(e) => {
                e.stopPropagation();
                ctx.onRemoveTag?.(patient.id, tag);
              }}
            >
              <X className="h-3 w-3" strokeWidth={2.5} aria-hidden />
            </button>
          ) : null}
        </span>
      ))}
      {extra > 0 ? (
        <span
          className="shrink-0 text-[10px] text-muted-foreground"
          title={tags.slice(2).join(", ")}
        >
          +{extra}
        </span>
      ) : null}
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

/** Full phone on doctor Patients list — click to copy (no tel: link). */
export function PhoneCellInner({
  patient,
  ctx,
}: {
  patient: PatientSummary;
  ctx: CellContext;
}) {
  const phone = patient.phone;
  if (!phone) return <span className="text-muted-foreground">—</span>;
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 text-sm tabular-nums hover:text-primary"
      title="Click to copy"
      onClick={async (e) => {
        e.stopPropagation();
        const ok = await copyToClipboard(phone);
        if (ok) ctx.onCopyPhone?.("Copied phone");
      }}
    >
      {phone}
      <Copy className="h-3 w-3 opacity-60" aria-hidden />
    </button>
  );
}

export function phoneCell(patient: PatientSummary, ctx: CellContext): React.ReactNode {
  return <PhoneCellInner patient={patient} ctx={ctx} />;
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
    cell: (p, ctx) => phoneCell(p, ctx),
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
    id: "source-channel",
    label: "Source",
    optional: true,
    defaultVisible: false,
    cell: (p) => sourceChannelCell(p),
  },
];
