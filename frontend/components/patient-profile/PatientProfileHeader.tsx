"use client";

/**
 * CockpitHeader (Cockpit polish batch · Lane ε · cp-09)
 *
 * Restructured into a two-row patient identity block:
 *
 *   ┌─────────────────────────────────────────────────────────────────────────────────┐
 *   │ [← Back]  Ravi Sharma   42 y / M                                        [CTA]  │  Row 1
 *   │           MRN-00123 · +91 98765 43210 · Video · 10:30 · #4                     │  Row 2
 *   └─────────────────────────────────────────────────────────────────────────────────┘
 *
 * Terminal state (cancelled / no-show) collapses to a single subdued row — no
 * demographics, no row 2:
 *
 *   ┌────────────────────────────────────────────────┐
 *   │ [← Back]  Ravi Sharma  [No-show]  [Reschedule] │
 *   └────────────────────────────────────────────────┘
 *
 * Responsive behaviour:
 *   lg+  Full two-row layout; row 2 shows all segments; modality icon + label.
 *   md   Two rows; row 2 truncates with tooltip; modality icon-only (no label).
 *   <md  Two rows; row 2 = MRN + OPD-token only.
 *
 * Sticky positioning: top-0 inside main's scroll container, z-30 (below the
 * global header at z-40).
 *
 * cp-04 clean-up: the stub follow-up-Rx handler branch in handlePrimaryClick
 * and the dead `onFollowupRx` call have been removed. The prop is kept (marked @deprecated)
 * to avoid simultaneous call-site updates.
 */

import { useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Check,
  Copy,
  MessageSquare,
  Mic,
  MoreHorizontal,
  Phone,
  RefreshCw,
  UserX,
  Video,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  primaryCtaFor,
  type CockpitState,
} from "@/lib/patient-profile/state";
import type {
  Appointment,
  AppointmentStatus,
  ConsultationModality,
} from "@/types/appointment";
import { resendConsultationLink } from "@/lib/api";
import { formatLocalIsoDate } from "@/lib/dates";
import { formatDateTime, formatTime } from "@/lib/format-date";
import {
  appendCockpitOriginFromSearchParams,
  readCockpitOriginFromSearchParams,
  resolveBackTarget,
} from "@/lib/cockpit/back-target";
import { RunningBehindBadge } from "@/components/consultation/cockpit/RunningBehindBadge";
import {
  CockpitQueueRail,
  pipelineTokenLabel,
} from "./PatientProfileQueueRail";

// ---------------------------------------------------------------------------
// Status badge token mapping (A1 semantic colors)
// ---------------------------------------------------------------------------

const STATUS_CLASSES: Record<AppointmentStatus, string> = {
  confirmed: "border-transparent bg-success/15 text-success",
  pending: "border-transparent bg-warning/20 text-warning-foreground",
  cancelled: "border-transparent bg-muted text-muted-foreground",
  completed: "border-transparent bg-info/15 text-info",
  no_show: "border-transparent bg-destructive/15 text-destructive",
};

// ---------------------------------------------------------------------------
// Demographics formatter (exported for unit testing in cp-09)
// ---------------------------------------------------------------------------

/**
 * Produces a compact "42 y / M" demographic chip string.
 * Returns null when both inputs are absent (chip stays hidden — row 1 stays balanced).
 *
 * Edge cases:
 *   age=0  → "0 y"
 *   age<1  → "< 1 y"
 *   sex only → first char uppercased ("M", "F", "O", …)
 */
export function formatDemographics(
  age: number | null | undefined,
  sex: string | null | undefined,
): string | null {
  const ageStr =
    age != null ? (age === 0 ? "0 y" : age < 1 ? "< 1 y" : `${age} y`) : null;
  const sexStr = sex ? sex[0].toUpperCase() : null;
  if (!ageStr && !sexStr) return null;
  if (ageStr && sexStr) return `${ageStr} / ${sexStr}`;
  return ageStr ?? (sexStr as string);
}

// ---------------------------------------------------------------------------
// CP-D5: Mark-no-show visibility predicate
// ---------------------------------------------------------------------------

/**
 * CP-D5: Mark-no-show is reachable in pre-call only when the appointment
 * is overdue or imminent. Hides the affordance for early arrivals so the
 * doctor doesn't pre-empt a patient who's running 30 min ahead of schedule.
 *
 * Returns true when:
 *  - OPD queue mode + appointment is in the active bucket (always overdue-ish), OR
 *  - scheduled appointment time is within 5 min of now() or in the past.
 */
export function shouldOfferMarkNoShowInReady(
  appt: Pick<Appointment, "appointment_date">,
  isOpdQueueMode: boolean,
  now: Date = new Date(),
): boolean {
  if (isOpdQueueMode) return true;
  if (!appt.appointment_date) return true; // defensive: show for legacy/missing data
  try {
    const apptTime = new Date(appt.appointment_date);
    if (isNaN(apptTime.getTime())) return true; // malformed date → show
    return apptTime <= new Date(now.getTime() + 5 * 60 * 1000);
  } catch {
    return true;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatAppointmentDate(iso: string): string {
  return formatDateTime(iso);
}

function appointmentMrn(appointment: Appointment): string | null {
  const legacy = (appointment as { medical_record_number?: string | null })
    .medical_record_number;
  const mrn = appointment.patient_mrn || legacy || null;
  return mrn && mrn.trim() ? mrn : null;
}

function modalityLabel(type: ConsultationModality | null | undefined): string {
  if (type === "text") return "Text";
  if (type === "voice") return "Voice";
  if (type === "in_clinic") return "In-clinic";
  return "Video";
}

function ModalityIcon({
  modality,
  className,
}: {
  modality: ConsultationModality | null | undefined;
  className?: string;
}): React.ReactElement {
  const cls = cn("h-3 w-3", className);
  if (modality === "text") return <MessageSquare className={cls} aria-hidden />;
  if (modality === "voice") return <Mic className={cls} aria-hidden />;
  if (modality === "in_clinic") return <Phone className={cls} aria-hidden />;
  return <Video className={cls} aria-hidden />;
}

function hashToken(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return `#${value}`;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    return `#${value.trim()}`;
  }
  return null;
}

function IdentityTitle({
  appointment,
  demographics,
  copiedPhone,
  onCopyPhone,
  displayToken = null,
}: {
  appointment: Appointment;
  demographics: string | null;
  copiedPhone: boolean;
  onCopyPhone: () => void;
  /** `#N` from the appointment or the same label the neighbor chips use. */
  displayToken?: string | null;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const tokenLabel = displayToken ?? hashToken(appointment.opd_token_number);
  const guardian = [appointment.patient_guardian_name, appointment.patient_guardian_relation]
    .filter((part) => part && part.trim())
    .join(" · ");
  const mrn = appointmentMrn(appointment);
  const scheduled = appointment.appointment_date
    ? formatTime(appointment.appointment_date)
    : null;
  const phone = appointment.patient_phone?.trim() || null;
  const hasDetails = Boolean(phone || guardian || mrn || scheduled);

  const closeIfUnpinned = () => {
    if (!pinned) setOpen(false);
  };

  const title = (
    <span className="inline-flex min-w-0 max-w-full items-baseline gap-2 rounded-md bg-primary/5 px-2.5 py-1">
      {tokenLabel ? (
        <span
          data-testid="cockpit-identity-token"
          className="shrink-0 text-lg font-semibold tabular-nums leading-none text-foreground"
        >
          {tokenLabel}
        </span>
      ) : null}
      <span className="truncate text-lg font-semibold leading-none text-foreground">
        {appointment.patient_name}
      </span>
      {demographics ? (
        <span className="shrink-0 text-sm font-medium text-muted-foreground">
          {demographics}
        </span>
      ) : null}
    </span>
  );

  if (!hasDetails) {
    return (
      <h1
        data-testid="cockpit-identity-title"
        className="min-w-0 max-w-full truncate"
      >
        {title}
      </h1>
    );
  }

  return (
    <h1 className="min-w-0 max-w-full">
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setPinned(false);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="cockpit-identity-title"
          aria-label={`Patient details for ${appointment.patient_name}`}
          className="min-w-0 max-w-full rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={closeIfUnpinned}
          onClick={() => {
            setPinned(true);
            setOpen(true);
          }}
        >
          {title}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="center"
        className="w-64 p-3"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={closeIfUnpinned}
      >
        <dl className="space-y-2" data-testid="cockpit-identity-popover">
          {phone ? (
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <dt className="text-xs text-muted-foreground">Phone</dt>
                <dd className="truncate text-sm font-medium">{phone}</dd>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 w-7 shrink-0 p-0"
                aria-label={copiedPhone ? "Phone copied" : "Copy phone"}
                onClick={onCopyPhone}
              >
                {copiedPhone ? (
                  <Check className="h-3.5 w-3.5" aria-hidden />
                ) : (
                  <Copy className="h-3.5 w-3.5" aria-hidden />
                )}
              </Button>
            </div>
          ) : null}
          {guardian ? (
            <div>
              <dt className="text-xs text-muted-foreground">Relative</dt>
              <dd className="text-sm font-medium">{guardian}</dd>
            </div>
          ) : null}
          {mrn ? (
            <div>
              <dt className="text-xs text-muted-foreground">MRN</dt>
              <dd className="text-sm font-medium">{mrn}</dd>
            </div>
          ) : null}
          {scheduled ? (
            <div>
              <dt className="text-xs text-muted-foreground">Scheduled</dt>
              <dd className="text-sm font-medium">{scheduled}</dd>
            </div>
          ) : null}
        </dl>
      </PopoverContent>
    </Popover>
    </h1>
  );
}

/** Context-aware back link — reads `?from=` set by the originating surface. */
function BackLink() {
  const searchParams = useSearchParams();
  const { origin, patientId, opdDate } =
    readCockpitOriginFromSearchParams(searchParams);
  const target = resolveBackTarget(origin, patientId, opdDate);

  return (
    <Link
      href={target.href}
      className={cn(
        "shrink-0 text-sm font-medium text-primary leading-none",
        "hover:text-primary/80 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded",
      )}
      aria-label={`Back to ${target.label}`}
    >
      ←
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Public surface
// ---------------------------------------------------------------------------

export interface CockpitHeaderProps {
  appointment: Appointment;
  state: CockpitState;
  token: string;
  /**
   * Called when the doctor starts the consultation (ready → lobby/live).
   * The modality is either the booked modality (main button) or a user-picked
   * modality from the split-button chevron dropdown.
   */
  onStartConsult: (modality: ConsultationModality) => void;
  /**
   * @deprecated Removed by cp-04. The in-header follow-up prescription stub is gone.
   * Kept in the interface to avoid simultaneous call-site updates; will be
   * swept in a follow-up pass once all consumers are confirmed clean.
   */
  onFollowupRx?: () => void;
  /** Called when Reschedule is selected (terminal primary CTA or kebab item). */
  onReschedule: () => void;
  /** Called when Cancel appointment is selected from the kebab. */
  onCancelAppointment: () => void;
  /**
   * Called when the doctor activates "Done with patient" (wrap_up CTA).
   * POSTs /v1/appointments/:id/wrap-up directly — the legacy WrapUpDialog
   * is gone. The cockpit transitions to `ended` and NextPatientCountdown
   * takes over.
   */
  onFinishVisit?: () => void | Promise<void>;
  /**
   * Whether a finish-visit POST is currently in flight. Disables the
   * wrap_up CTA to prevent duplicate requests.
   */
  finishBusy?: boolean;
  /** Whether an in-clinic "Start visit" check-in is in flight. */
  startBusy?: boolean;
  /**
   * ISO datetime of the next scheduled slot. Forwarded to RunningBehindBadge.
   * Badge is hidden when absent.
   */
  nextSlotAt?: string | null;
  /**
   * Called after the doctor confirms "Mark no-show". Parent performs the API
   * call. Shown in `lobby` and `live` (text & in-clinic) states.
   */
  onMarkNoShow?: () => void | Promise<void>;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CockpitHeader({
  appointment,
  state,
  token,
  onStartConsult,
  // onFollowupRx intentionally omitted — removed by cp-04 with the stub header action.
  onReschedule,
  onCancelAppointment,
  onMarkNoShow,
  onFinishVisit,
  finishBusy: _finishBusy,
  startBusy: _startBusy,
  nextSlotAt,
}: CockpitHeaderProps) {
  const [visitDetailsOpen, setVisitDetailsOpen] = useState(false);
  const [copiedPhone, setCopiedPhone] = useState(false);
  const [resendBusy, setResendBusy] = useState(false);
  const [resendNotice, setResendNotice] = useState<string | null>(null);
  const resendTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // CS-04: read from the properly-typed fields landed by CS-03.
  // `opd_queue_event_type` is the JOIN-derived field from opd_queue_entries
  // (projected from row presence — see backend `enrichRowWithDemographics`);
  // distinct from the appointments-table `opd_event_type` column (migration 031).
  //
  // Hoisted above `canMarkNoShow` (was below pre-2026-05-10) — the predicate
  // reads `isOpdQueueMode`, so the previous declaration order produced a
  // ReferenceError TDZ at runtime once the appointment-fetch path actually
  // returned data (the backend `getAppointmentById` 4xx regression had been
  // masking it by short-circuiting before the cockpit rendered).
  const opdEventType = appointment.opd_queue_event_type;
  const opdTokenNumber = appointment.opd_token_number;
  const isOpdQueueMode = opdEventType != null;

  // CS-02: canMarkNoShow — predicate forwarded to the kebab item's disabled prop.
  // In ready state, gate on the appointment timing (same predicate as cp-05).
  // In lobby / live states, always available — doctor is already in session.
  const canMarkNoShow =
    state === "lobby" ||
    state === "live" ||
    (state === "ready" && shouldOfferMarkNoShowInReady(appointment, isOpdQueueMode));

  const cta = primaryCtaFor(state, appointment.consultation_type);
  const bookedModality: ConsultationModality =
    appointment.consultation_type ?? "video";
  const hasPatientPhone = !!appointment.patient_phone;
  const hasSession = !!appointment.consultation_session;
  const isCompleted = appointment.status === "completed";

  // CP-D6: backend ships in cp-07 / types in cp-08
  const patientAge = appointment.patient_age;
  const patientSex = appointment.patient_sex;
  const demographics = formatDemographics(patientAge, patientSex);
  const visitDate = appointment.appointment_date
    ? formatLocalIsoDate(new Date(appointment.appointment_date))
    : null;

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleResend = async () => {
    const sessionId = appointment.consultation_session?.id;
    if (!sessionId || resendBusy) return;
    setResendBusy(true);
    try {
      const res = await resendConsultationLink(token, sessionId);
      setResendNotice(
        res.data.sent
          ? "Join link resent to the patient."
          : `Couldn't resend link${res.data.reason ? ` — ${res.data.reason}` : "."}`,
      );
    } catch (err) {
      setResendNotice(
        err instanceof Error ? err.message : "Failed to resend join link",
      );
    } finally {
      setResendBusy(false);
      if (resendTimer.current) clearTimeout(resendTimer.current);
      resendTimer.current = setTimeout(() => setResendNotice(null), 4_500);
    }
  };

  const handleCopyPhone = async () => {
    if (!appointment.patient_phone) return;
    try {
      await navigator.clipboard.writeText(appointment.patient_phone);
      setCopiedPhone(true);
      setTimeout(() => setCopiedPhone(false), 2_000);
    } catch {
      // Clipboard API unavailable — silent fail
    }
  };

  const handlePrimaryClick = () => {
    if (!cta) return;
    switch (cta.action) {
      case "start":
        onStartConsult(bookedModality);
        break;
      case "resend":
        void handleResend();
        break;
      case "wrap-up":
        // No dialog — directly calls the cockpit's finish-visit handler
        // which POSTs /v1/appointments/:id/wrap-up.
        void onFinishVisit?.();
        break;
      case "reschedule":
        onReschedule();
        break;
      // "end" is owned by VideoRoom / VoiceConsultRoom, not the header CTA.
    }
  };

  // ---------------------------------------------------------------------------
  // Primary CTA for row 1 (non-terminal states)
  // ---------------------------------------------------------------------------

  let primaryCta: React.ReactNode = null;

  if (state === "ready") {
    // Start consult / Start visit were removed — Done on the footer
    // is the only commit path, same as a live visit.
    primaryCta = null;
  } else if (state === "lobby") {
    primaryCta = (
      <Button
        type="button"
        variant="default"
        size="sm"
        onClick={handlePrimaryClick}
        disabled={resendBusy}
        className="gap-1.5"
      >
        {resendBusy && (
          <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden />
        )}
        {/* lobby ⇒ primaryCtaFor is always non-null */}
        {cta!.label}
      </Button>
    );
  } else if (state === "live" || state === "wrap_up") {
    // Finish lives on the footer Done button.
    primaryCta = null;
  } else if (state === "ended") {
    // cp-04: ended state shows no primary action in the header — Completed badge only.
    // Show a subdued "Completed" status pill; the NextPatientCountdown in the
    // cockpit body is where the doctor's attention belongs at this point.
    primaryCta = (
      <Badge variant="outline" className={cn("shrink-0", STATUS_CLASSES.completed)}>
        Completed
      </Badge>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <>
      {/* Sticky header band.
          cs-07: Sticky on `<lg` (page-scroll layout). On `lg+` the cockpit
          shell is a fixed-height flex container whose columns scroll
          independently, so the page itself doesn't scroll — the header
          drops back into normal flow via `lg:static`. */}
      <header
        className={cn(
          "sticky top-0 lg:static z-30",
          "px-4 py-1.5 lg:px-6",
          "relative min-h-10 flex flex-col justify-center",
        )}
      >
        {state === "terminal" ? (
          // ── Terminal: single subdued row — no demographics, no row 2 ──
          <div className="flex min-w-0 items-center gap-2">
            <BackLink />
            <span className="truncate text-sm font-semibold text-muted-foreground">
              {appointment.patient_name}
            </span>
            <Badge
              variant="outline"
              className={cn("shrink-0", STATUS_CLASSES[appointment.status])}
            >
              {appointment.status === "no_show" ? "No-show" : "Cancelled"}
            </Badge>
            <div className="ml-auto flex shrink-0 items-center gap-2">
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={handlePrimaryClick}
                className="gap-1.5"
              >
                {/* terminal ⇒ primaryCtaFor is always non-null */}
                {cta!.label}
              </Button>
              <KebabMenu
                appointment={appointment}
                state={state}
                isCompleted={isCompleted}
                hasPatientPhone={hasPatientPhone}
                hasSession={hasSession}
                copiedPhone={copiedPhone}
                onCancelAppointment={onCancelAppointment}
                onReschedule={onReschedule}
                onCopyPhone={() => void handleCopyPhone()}
                onVisitDetails={() => setVisitDetailsOpen(true)}
              />
            </div>
          </div>
        ) : (
          <div className="flex w-full items-center gap-2">
            <BackLink />

            <CockpitQueueRail
              currentAppointmentId={appointment.id}
              state={state}
              token={token}
              visitDate={visitDate}
              variant="inline"
              nowSlot={({ now, source }) => (
                <IdentityTitle
                  appointment={appointment}
                  demographics={demographics}
                  copiedPhone={copiedPhone}
                  onCopyPhone={() => void handleCopyPhone()}
                  displayToken={now ? pipelineTokenLabel(now, source) : null}
                />
              )}
            />

            {resendNotice ? (
              <span
                role="status"
                aria-live="polite"
                className="hidden min-w-0 truncate text-xs text-warning lg:inline"
              >
                {resendNotice}
              </span>
            ) : null}

            <div className="ml-auto flex shrink-0 items-center gap-2">
              <RunningBehindBadge nextSlotAt={nextSlotAt} />
              {primaryCta}
              <KebabMenu
                appointment={appointment}
                state={state}
                isCompleted={isCompleted}
                hasPatientPhone={hasPatientPhone}
                hasSession={hasSession}
                copiedPhone={copiedPhone}
                onCancelAppointment={onCancelAppointment}
                onReschedule={onReschedule}
                onCopyPhone={() => void handleCopyPhone()}
                onVisitDetails={() => setVisitDetailsOpen(true)}
                onMarkNoShow={onMarkNoShow}
                canMarkNoShow={canMarkNoShow}
              />
            </div>
          </div>
        )}

      </header>

      {/* Visit details dialog */}
      <Dialog open={visitDetailsOpen} onOpenChange={setVisitDetailsOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Visit details</DialogTitle>
          </DialogHeader>
          <VisitDetailsBody appointment={appointment} />
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// Kebab menu
// ---------------------------------------------------------------------------

interface KebabMenuProps {
  appointment: Appointment;
  state: CockpitState;
  isCompleted: boolean;
  hasPatientPhone: boolean;
  hasSession: boolean;
  copiedPhone: boolean;
  onCancelAppointment: () => void;
  onReschedule: () => void;
  onCopyPhone: () => void;
  onVisitDetails: () => void;
  /** When provided, a "Mark no-show" item is shown before Cancel. */
  onMarkNoShow?: () => void | Promise<void>;
  /** Controls whether the Mark no-show item is interactive. Defaults to false. */
  canMarkNoShow?: boolean;
}

function KebabMenu({
  appointment,
  state,
  isCompleted: _isCompleted,
  hasPatientPhone,
  hasSession,
  copiedPhone,
  onCancelAppointment,
  onReschedule,
  onCopyPhone,
  onVisitDetails,
  onMarkNoShow,
  canMarkNoShow = false,
}: KebabMenuProps) {
  const searchParams = useSearchParams();
  const showCancel = state === "ready" || state === "lobby";
  // Reschedule is always available except terminal (where it's the primary CTA)
  const showReschedule = state !== "terminal";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 w-8 p-0"
          aria-label="More options"
        >
          <MoreHorizontal className="h-4 w-4" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {onMarkNoShow && (
          <DropdownMenuItem
            onClick={() => void onMarkNoShow()}
            disabled={!canMarkNoShow}
            aria-keyshortcuts="m"
            className="gap-2"
          >
            <UserX className="h-4 w-4" aria-hidden />
            Mark no-show
            <span className="ml-auto text-xs text-muted-foreground">m</span>
          </DropdownMenuItem>
        )}

        {showCancel && (
          <DropdownMenuItem
            onClick={onCancelAppointment}
            className="gap-2 text-destructive focus:text-destructive"
          >
            <X className="h-4 w-4" aria-hidden />
            Cancel appointment
          </DropdownMenuItem>
        )}

        {showReschedule && (
          <DropdownMenuItem onClick={onReschedule} className="gap-2">
            <RefreshCw className="h-4 w-4" aria-hidden />
            Reschedule
          </DropdownMenuItem>
        )}

        {(showCancel || showReschedule) && <DropdownMenuSeparator />}

        {hasPatientPhone && (
          <DropdownMenuItem onClick={onCopyPhone} className="gap-2">
            {copiedPhone ? (
              <Check className="h-4 w-4 text-success" aria-hidden />
            ) : (
              <Copy className="h-4 w-4" aria-hidden />
            )}
            {copiedPhone ? "Copied!" : "Copy patient phone"}
          </DropdownMenuItem>
        )}

        {hasSession && (
          <DropdownMenuItem asChild className="gap-2">
            <Link
              href={appendCockpitOriginFromSearchParams(
                `/dashboard/appointments/${appointment.id}/chat-history`,
                searchParams,
              )}
              className="flex items-center gap-2"
            >
              <MessageSquare className="h-4 w-4" aria-hidden />
              View conversation
            </Link>
          </DropdownMenuItem>
        )}

        <DropdownMenuItem onClick={onVisitDetails} className="gap-2">
          <Phone className="h-4 w-4" aria-hidden />
          View visit details
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ---------------------------------------------------------------------------
// Visit details dialog body
// ---------------------------------------------------------------------------

function VisitDetailsBody({ appointment }: { appointment: Appointment }) {
  const mrn = appointmentMrn(appointment);
  const tokenNumber =
    appointment.opd_queue_event_type === "token" &&
    typeof appointment.opd_token_number === "number"
      ? `#${appointment.opd_token_number}`
      : null;
  const rows: { label: string; value: string | null | undefined }[] = [
    { label: "Appointment ID", value: appointment.id },
    { label: "MRN", value: mrn || "—" },
    { label: "Modality", value: modalityLabel(appointment.consultation_type) },
    {
      label: "Scheduled",
      value: appointment.appointment_date
        ? formatTime(appointment.appointment_date)
        : "—",
    },
    { label: "Token", value: tokenNumber },
    { label: "Patient phone", value: appointment.patient_phone || "—" },
    { label: "Notes", value: appointment.notes || "—" },
    {
      label: "Booked at",
      value: formatAppointmentDate(appointment.created_at),
    },
    {
      label: "Last updated",
      value: formatAppointmentDate(appointment.updated_at),
    },
  ];

  return (
    <dl className="mt-2 space-y-3">
      {rows.map(({ label, value }) => (
        <div key={label} className="flex justify-between gap-3">
          <dt className="shrink-0 text-sm text-muted-foreground">{label}</dt>
          <dd className="text-right text-sm font-medium text-foreground break-all">
            {value ?? "—"}
          </dd>
        </div>
      ))}
    </dl>
  );
}
