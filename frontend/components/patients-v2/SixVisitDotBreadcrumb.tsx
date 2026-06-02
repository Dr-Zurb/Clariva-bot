"use client";

import {
  MessageSquare,
  Mic,
  Phone,
  Video,
} from "lucide-react";
import type { AppointmentStatus, ConsultationModality } from "@/types/appointment";
import type { PatientSixVisitStripEntry } from "@/types/patient";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { formatRelativeDate } from "@/lib/patients-v2/list-utils";

const STRIP_SIZE = 6;

export interface SixVisitDotBreadcrumbProps {
  visits: PatientSixVisitStripEntry[];
  onVisitClick: (appointmentId: string) => void;
}

function statusDotClass(status: AppointmentStatus): string {
  if (status === "completed") return "bg-success";
  if (status === "confirmed" || (status as string) === "in_progress") return "bg-primary";
  if (status === "cancelled") return "bg-muted-foreground/40";
  if (status === "no_show") return "bg-destructive";
  return "bg-muted";
}

function modalityLabel(modality: ConsultationModality): string {
  if (modality === "text") return "Text";
  if (modality === "voice") return "Voice";
  if (modality === "in_clinic") return "In-clinic";
  return "Video";
}

function ModalityGlyph({
  modality,
  className,
}: {
  modality: ConsultationModality;
  className?: string;
}) {
  const cls = cn("h-2 w-2 text-white", className);
  if (modality === "text") return <MessageSquare className={cls} aria-hidden />;
  if (modality === "voice") return <Mic className={cls} aria-hidden />;
  if (modality === "in_clinic") return <Phone className={cls} aria-hidden />;
  return <Video className={cls} aria-hidden />;
}

function truncateComplaint(text: string | null, max = 80): string {
  if (!text?.trim()) return "—";
  const t = text.trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

function VisitDot({
  visit,
  onVisitClick,
}: {
  visit: PatientSixVisitStripEntry;
  onVisitClick: (appointmentId: string) => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={cn(
            "relative flex h-3 w-3 shrink-0 items-center justify-center rounded-full",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            statusDotClass(visit.status),
          )}
          aria-label={`Visit ${formatRelativeDate(visit.occurred_at)}`}
          onClick={() => onVisitClick(visit.appointment_id)}
        >
          <ModalityGlyph modality={visit.modality} />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs text-left">
        <p>{formatRelativeDate(visit.occurred_at)}</p>
        <p>
          {modalityLabel(visit.modality)} · {visit.status.replace("_", " ")}
        </p>
        <p className="text-primary-foreground/80">
          {truncateComplaint(visit.chief_complaint)}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}

function PlaceholderDot() {
  return (
    <span
      className="h-3 w-3 shrink-0 rounded-full border border-muted-foreground/30 bg-transparent"
      aria-hidden
    />
  );
}

export function SixVisitDotBreadcrumb({
  visits,
  onVisitClick,
}: SixVisitDotBreadcrumbProps) {
  const filled = visits.slice(0, STRIP_SIZE);
  const placeholders = Math.max(0, STRIP_SIZE - filled.length);

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex items-center gap-1.5" role="list" aria-label="Recent visits">
        {filled.map((visit) => (
          <VisitDot key={visit.appointment_id} visit={visit} onVisitClick={onVisitClick} />
        ))}
        {Array.from({ length: placeholders }).map((_, i) => (
          <PlaceholderDot key={`ph-${i}`} />
        ))}
      </div>
    </TooltipProvider>
  );
}
