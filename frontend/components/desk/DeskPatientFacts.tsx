import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { DeskPatientCard } from "@/lib/desk/api";
import { formatDeskDate } from "@/lib/desk/format";
import { formatDeskGuardian } from "@/lib/desk/guardian";
import { formatDeskPhone } from "@/lib/desk/phone";

export function DeskPatientFacts({
  patient,
  timezone,
  size = "row",
  archived = false,
}: {
  patient: DeskPatientCard;
  timezone: string;
  size?: "row" | "hero";
  archived?: boolean;
}) {
  const hasLast = Boolean(patient.last_appointment_date);
  const hasNext = Boolean(patient.next_appointment_date);
  const last = hasLast
    ? formatDeskDate(patient.last_appointment_date!, timezone)
    : null;
  const next = hasNext
    ? formatDeskDate(patient.next_appointment_date!, timezone)
    : null;
  const mobile = formatDeskPhone(patient.phone);
  const altMobile = formatDeskPhone(patient.alt_phone ?? "");
  const guardian = formatDeskGuardian(
    patient.guardian_name,
    patient.guardian_relation,
    patient.gender
  );
  const ageLabel =
    patient.age != null && patient.age >= 0
      ? patient.age === 0
        ? "<1y"
        : `${patient.age}y`
      : null;
  const genderLabel = patient.gender?.trim()
    ? patient.gender.trim().charAt(0).toUpperCase() + patient.gender.trim().slice(1)
    : null;

  return (
    <div className="flex gap-3">
      <span
        className={cn(
          "w-1 shrink-0 rounded-full",
          size === "hero" ? "bg-primary" : "bg-primary/50"
        )}
        aria-hidden
      />
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p
            className={cn(
              "truncate font-semibold text-foreground",
              size === "hero" ? "text-lg" : "text-sm"
            )}
          >
            {patient.name}
          </p>
          {archived ? (
            <Badge variant="secondary" className="uppercase tracking-wide">
              Archived
            </Badge>
          ) : null}
        </div>
        {guardian ? (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{guardian}</p>
        ) : null}
        {patient.address?.trim() ? (
          <p className="mt-0.5 whitespace-pre-line text-xs text-muted-foreground">
            {patient.address.trim()}
          </p>
        ) : null}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
          <span className="tabular-nums">
            {mobile || "No mobile"}
            {altMobile ? ` · ${altMobile}` : ""}
          </span>
          <span aria-hidden>·</span>
          <Badge variant="info">{patient.medical_record_number ?? "MRN pending"}</Badge>
          {ageLabel ? (
            <>
              <span aria-hidden>·</span>
              <span className="tabular-nums">{ageLabel}</span>
            </>
          ) : null}
          {genderLabel ? (
            <>
              <span aria-hidden>·</span>
              <span>{genderLabel}</span>
            </>
          ) : null}
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">
          {hasLast ? `Last visit ${last}` : null}
          {hasLast && hasNext ? " · " : null}
          {hasNext ? `Next ${next}` : null}
          {!hasLast && !hasNext ? "No visits yet" : null}
        </p>
      </div>
    </div>
  );
}
