/**
 * rxl-25 — same-day revise chrome. Version bumps on re-issue, never on
 * autosave. Strip + reason dialog only; PDF footer is rxl-26.
 */

import {
  issuedInstantIso,
  isIssuedOnClinicDay,
  isSupersededNote,
  type RxLoadClock,
} from "@/components/cockpit/rx/rxLoadDecision";
import {
  REVISION_REASONS,
  type PrescriptionWithRelations,
  type RevisionReason,
} from "@/types/prescription";

export const REVISION_REASON_LABELS: Record<RevisionReason, string> = {
  treatment_change: "Treatment change",
  item_added: "Item added",
  other: "Other",
};

export type RxReviseLeaveAction = "send" | "print" | "finish";

export type RxNoteChromeKind = "none" | "revise" | "superseded";

function nonEmpty(value: string | null | undefined): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  return value;
}

export function isIssuedNote(
  rx: Pick<PrescriptionWithRelations, "attested_at" | "issued_at">,
): boolean {
  return issuedInstantIso(rx) != null;
}

export function nextRevisionVersion(
  rx: Pick<PrescriptionWithRelations, "version">,
): number {
  return (rx.version ?? 1) + 1;
}

export function formatIssuedTime(iso: string, timezone: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "";
  const formatted = new Intl.DateTimeFormat("en-IN", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(ms));
  return formatted.replace(/\s*(am|pm)$/i, (match) => match.toUpperCase());
}

export function reviseStripCopy(
  rx: Pick<
    PrescriptionWithRelations,
    "issued_at" | "attested_at" | "version"
  >,
  timezone: string,
): string {
  const iso = issuedInstantIso(rx);
  const time = iso ? formatIssuedTime(iso, timezone) : "";
  if (!time) return "The next print or send replaces that slip.";
  return `Issued ${time}. The next print or send replaces that slip.`;
}

export function reviseDialogReplacesCopy(
  rx:
    | Pick<
        PrescriptionWithRelations,
        "issued_at" | "attested_at" | "version"
      >
    | null
    | undefined,
  timezone: string,
): string {
  if (!rx) return "Replaces the issued slip.";
  const iso = issuedInstantIso(rx);
  const time = iso ? formatIssuedTime(iso, timezone) : "";
  if (!time) return "Replaces the issued slip.";
  return `Replaces the one issued at ${time}.`;
}

export function resolveRxNoteChrome(
  rx: PrescriptionWithRelations | null | undefined,
  clock: RxLoadClock,
): RxNoteChromeKind {
  if (!rx) return "none";
  if (isSupersededNote(rx)) return "superseded";
  if (!isIssuedNote(rx)) return "none";
  if (!isIssuedOnClinicDay(rx, clock)) return "none";
  return "revise";
}

/**
 * Clone before Send / Print / Finish when this row is already issued.
 * A revision just created for this leave (`skipId`) is delivered as-is.
 * A later edit of an existing revision only clones when the form is dirty
 * so Print after Send does not mint Version 3.
 */
export function needsReissue(
  rx: PrescriptionWithRelations | null | undefined,
  options: { isDirty: boolean; skipId?: string | null },
): boolean {
  if (!rx) return false;
  if (isSupersededNote(rx)) return false;
  if (!isIssuedNote(rx)) return false;
  if (options.skipId && options.skipId === rx.id) return false;
  if (nonEmpty(rx.supersedes_id)) return options.isDirty;
  return true;
}

export function sourceWasSent(
  rx: Pick<PrescriptionWithRelations, "sent_to_patient_at">,
): boolean {
  return nonEmpty(rx.sent_to_patient_at) != null;
}

export function sourceWasPrinted(
  rx: Pick<PrescriptionWithRelations, "printed_at">,
): boolean {
  return nonEmpty(rx.printed_at) != null;
}

export function isRevisionReason(value: string): value is RevisionReason {
  return (REVISION_REASONS as readonly string[]).includes(value);
}
