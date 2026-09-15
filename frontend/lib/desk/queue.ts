import type { Appointment } from "@/types/appointment";
import { formatDeskAgeYears } from "@/lib/desk/age";

export type DeskQueueFilter = "all" | "waiting" | "arrived" | "seen";

/** Date-scoped chips plus the Labs pending mode (not a status bucket). */
export type DeskQueueMode = DeskQueueFilter | "labs_pending";

export function isOpenDeskAppointment(
  row: Pick<Appointment, "status">
): boolean {
  return row.status !== "cancelled";
}

/** Pending / confirmed / completed count as already on the session day. */
export function isDeskSameDayLockVisit(
  row: Pick<Appointment, "status">
): boolean {
  return (
    row.status === "pending" ||
    row.status === "confirmed" ||
    row.status === "completed"
  );
}

export function findDeskSameDayVisit(
  rows: Array<Pick<Appointment, "id" | "patient_id" | "status">>,
  patientId: string
): (typeof rows)[number] | null {
  return (
    rows.find(
      (row) => row.patient_id === patientId && isDeskSameDayLockVisit(row)
    ) ?? null
  );
}

export function hasDeskArrived(
  row: Pick<Appointment, "patient_checked_in_at">
): boolean {
  return Boolean(row.patient_checked_in_at);
}

/** Waiting / booked only — hide on arrived, seen, no-show. */
export function canDeskCancelVisit(
  row: Pick<Appointment, "status" | "patient_checked_in_at">
): boolean {
  if (row.status !== "pending" && row.status !== "confirmed") return false;
  return !hasDeskArrived(row);
}

export const canDeskMoveVisit = canDeskCancelVisit;

/** Arrived, not seen — Left + optional till return. */
export function canDeskLeaveVisit(
  row: Pick<Appointment, "status" | "patient_checked_in_at">
): boolean {
  if (row.status !== "pending" && row.status !== "confirmed") return false;
  return hasDeskArrived(row);
}

/** Same gate as Check-in reopen: arrived or seen, not cancelled / no-show. */
export function canDeskOpenVisitPrep(
  row: Pick<Appointment, "status" | "patient_checked_in_at">
): boolean {
  if (row.status === "cancelled" || row.status === "no_show") return false;
  const bucket = deskQueueBucket(row);
  return bucket === "arrived" || bucket === "seen";
}

/** Lab-only list: upload on any non-cancelled visit that still has orders. */
export function canDeskOpenLabUpload(
  row: Pick<Appointment, "status">
): boolean {
  return row.status !== "cancelled" && row.status !== "no_show";
}

export function deskQueueBucket(
  row: Pick<Appointment, "status" | "patient_checked_in_at">
): Exclude<DeskQueueFilter, "all"> {
  if (row.status === "completed") return "seen";
  if (hasDeskArrived(row)) return "arrived";
  return "waiting";
}

export function deskQueueBarClass(
  bucket: Exclude<DeskQueueFilter, "all">
): string {
  if (bucket === "seen") return "bg-green-500";
  if (bucket === "arrived") return "bg-primary";
  return "bg-muted-foreground/40";
}

export function formatDeskDaysPending(days: number): string {
  return days === 1 ? "1 day pending" : `${days} days pending`;
}

export function deskLabWaitingTone(
  days: number
): "info" | "warning" | "destructive" {
  if (days >= 7) return "destructive";
  if (days >= 3) return "warning";
  return "info";
}

export function deskLabWaitingBarClass(days: number): string {
  if (days >= 7) return "bg-destructive";
  if (days >= 3) return "bg-warning";
  return "bg-primary";
}

export function formatDeskAgeSex(
  age: number | null | undefined,
  sex: string | null | undefined
): string {
  const years = formatDeskAgeYears(age);
  const initial = sex?.trim() ? sex.trim().charAt(0).toUpperCase() : "—";
  if (years === "—" && initial === "—") return "—";
  return `${years}/${initial}`;
}

export function deskOriginLabel(
  origin: Appointment["booking_origin"] | undefined
): string {
  if (origin === "walk_in") return "Walk-in";
  if (origin === "booked") return "Booked";
  if (origin === "overflow") return "Overflow";
  if (origin === "return_after_completed") return "Return";
  if (origin === "rebooked") return "Rebooked";
  return "—";
}

export function deskStatusLabel(
  row: Pick<Appointment, "status" | "patient_checked_in_at">
): string {
  if (row.status === "no_show") return "No-show";
  const bucket = deskQueueBucket(row);
  if (bucket === "seen") return "Seen";
  if (bucket === "arrived") return "Arrived";
  return "Waiting";
}

/** Same # the doctor sees: queue token, else slot-mode day position. */
export function deskOpdNumber(
  row: Pick<
    Appointment,
    "id" | "opd_token_number" | "appointment_date" | "created_at"
  >,
  dayRows: Array<
    Pick<
      Appointment,
      "id" | "opd_token_number" | "appointment_date" | "created_at"
    >
  >
): number | null {
  const token = row.opd_token_number;
  if (token != null) {
    const shared = dayRows.filter((item) => item.opd_token_number === token);
    if (shared.length <= 1) return token;
  }
  const ordered = [...dayRows].sort((a, b) => {
    const ta = new Date(a.appointment_date).getTime();
    const tb = new Date(b.appointment_date).getTime();
    if (ta !== tb) return ta - tb;
    const ca = a.created_at ? new Date(a.created_at).getTime() : 0;
    const cb = b.created_at ? new Date(b.created_at).getTime() : 0;
    if (ca !== cb) return ca - cb;
    return a.id.localeCompare(b.id);
  });
  const idx = ordered.findIndex((item) => item.id === row.id);
  return idx >= 0 ? idx + 1 : null;
}

export function formatDeskOpdNumber(n: number | null): string {
  if (n == null) return "—";
  return `#${String(n).padStart(2, "0")}`;
}

/** Next queue token if this walk-in is inserted after the current day list. */
export function nextDeskQueueToken(
  dayRows: Array<Pick<Appointment, "opd_token_number">>
): number {
  let max = dayRows.length;
  for (const row of dayRows) {
    if (row.opd_token_number != null && row.opd_token_number > max) {
      max = row.opd_token_number;
    }
  }
  return max + 1;
}

export const DESK_QUEUE_GRID =
  "4px 36px 72px 80px minmax(110px, 1.2fr) 64px minmax(100px, 1fr) 110px 80px 88px 56px minmax(92px, 0.7fr) 132px";

export const DESK_MATCH_GRID =
  "4px 80px minmax(110px, 1.4fr) 64px minmax(100px, 1.1fr) 110px 108px";

export const DESK_MATCH_HEADER = [
  { key: "bar", label: "", srOnly: true },
  { key: "mrn", label: "MRN" },
  { key: "patient", label: "Name" },
  { key: "ageSex", label: "Age" },
  { key: "relative", label: "Relative" },
  { key: "phone", label: "Mobile" },
  { key: "last", label: "Last visit" },
] as const;

export const DESK_LABS_GRID =
  "4px 68px 80px minmax(200px, 1.6fr) 56px 104px minmax(160px, 2fr) 120px 124px";

export const DESK_LABS_HEADER = [
  { key: "bar", label: "", srOnly: true },
  { key: "date", label: "Visit", srOnly: false },
  { key: "mrn", label: "MRN", srOnly: false },
  { key: "patient", label: "Patient", srOnly: false },
  { key: "ageSex", label: "Age/Sex", srOnly: false },
  { key: "phone", label: "Phone", srOnly: false },
  { key: "tests", label: "Tests", srOnly: false },
  { key: "waiting", label: "Report", srOnly: false },
  { key: "actions", label: "Actions", srOnly: true },
] as const;

export const DESK_QUEUE_HEADER = [
  { key: "bar", label: "", srOnly: true },
  { key: "token", label: "#", srOnly: false },
  { key: "time", label: "Time", srOnly: false },
  { key: "mrn", label: "MRN", srOnly: false },
  { key: "patient", label: "Patient", srOnly: false },
  { key: "ageSex", label: "Age/Sex", srOnly: false },
  { key: "relative", label: "Relative", srOnly: false },
  { key: "phone", label: "Phone", srOnly: false },
  { key: "origin", label: "Origin", srOnly: false },
  { key: "status", label: "Status", srOnly: false },
  { key: "prep", label: "Prep", srOnly: false },
  { key: "payment", label: "Payment", srOnly: false },
  { key: "actions", label: "Actions", srOnly: true },
] as const;

export function matchesDeskQueueSearch(
  row: Pick<
    Appointment,
    | "patient_name"
    | "patient_phone"
    | "opd_token_number"
    | "patient_mrn"
    | "patient_guardian_name"
  >,
  raw: string
): boolean {
  const needle = raw.trim().toLowerCase();
  if (!needle) return true;
  if (row.patient_name.toLowerCase().includes(needle)) return true;
  if ((row.patient_guardian_name ?? "").toLowerCase().includes(needle))
    return true;
  if ((row.patient_mrn ?? "").toLowerCase().includes(needle)) return true;
  const digits = needle.replace(/\D/g, "");
  if (digits.length >= 2) {
    const phone = (row.patient_phone ?? "").replace(/\D/g, "");
    if (phone.includes(digits)) return true;
    if (
      row.opd_token_number != null &&
      String(row.opd_token_number).includes(digits)
    ) {
      return true;
    }
  }
  if (needle.startsWith("#") && row.opd_token_number != null) {
    return String(row.opd_token_number) === needle.slice(1);
  }
  return false;
}

export function countDeskQueue(
  rows: Array<Pick<Appointment, "status" | "patient_checked_in_at">>
): Record<DeskQueueFilter, number> {
  let waiting = 0;
  let arrived = 0;
  let seen = 0;
  for (const row of rows) {
    const bucket = deskQueueBucket(row);
    if (bucket === "waiting") waiting += 1;
    else if (bucket === "arrived") arrived += 1;
    else seen += 1;
  }
  return { all: rows.length, waiting, arrived, seen };
}
