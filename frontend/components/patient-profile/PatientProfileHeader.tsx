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
import { SplitStartButton } from "@/components/patient-profile/SplitStartButton";
import {
  Check,
  CheckCircle,
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
import { formatDateTime, formatTime } from "@/lib/format-date";
import {
  appendCockpitOriginFromSearchParams,
  readCockpitOriginFromSearchParams,
  resolveBackTarget,
} from "@/lib/cockpit/back-target";
import { RunningBehindBadge } from "@/components/consultation/cockpit/RunningBehindBadge";
import { CockpitQueueRail } from "./PatientProfileQueueRail";

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
    age != null ? (age < 1 ? "< 1 y" : `${age} y`) : null;
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

/** Row-2 segment separator rendered as · with balanced spacing. */
function Dot() {
  return (
    <span aria-hidden className="mx-1.5 text-muted-foreground/50">
      ·
    </span>
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
  finishBusy,
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
  const mrn = (appointment as any).medical_record_number as string | null | undefined;

  const demographics = formatDemographics(patientAge, patientSex);

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
    const startOptions = [
      {
        value: "text" as const,
        label: "Text",
        icon: <MessageSquare className="h-3.5 w-3.5" aria-hidden />,
        disabled: !hasPatientPhone,
        disabledReason: "Patient phone required for text consult",
        booked: bookedModality === "text",
      },
      {
        value: "voice" as const,
        label: "Voice",
        icon: <Mic className="h-3.5 w-3.5" aria-hidden />,
        booked: bookedModality === "voice",
      },
      {
        value: "video" as const,
        label: "Video",
        icon: <Video className="h-3.5 w-3.5" aria-hidden />,
        booked: bookedModality === "video",
      },
    ];
    primaryCta = (
      <SplitStartButton
        primary={bookedModality}
        options={startOptions}
        onAction={onStartConsult}
        primaryIcon={<ModalityIcon modality={bookedModality} />}
      />
    );
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
  } else if (state === "live") {
    // mark-no-show for text/in_clinic moves to the kebab menu (cs-02)
    primaryCta = null;
  } else if (state === "wrap_up") {
    primaryCta = (
      <Button
        type="button"
        variant="default"
        size="sm"
        onClick={handlePrimaryClick}
        disabled={finishBusy}
        className="gap-1.5"
      >
        <CheckCircle className="h-3.5 w-3.5" aria-hidden />
        {/* wrap_up ⇒ primaryCtaFor is always non-null */}
        {finishBusy ? "Finishing…" : cta!.label}
      </Button>
    );
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
  // Row-2 tooltip content — full unabbreviated metadata string
  // ---------------------------------------------------------------------------

  const row2TooltipText = [
    mrn && appointment.patient_id ? mrn : null,
    appointment.patient_phone || null,
    modalityLabel(appointment.consultation_type),
    formatTime(appointment.appointment_date),
    opdEventType === 'token' && typeof opdTokenNumber === 'number' ? `Token #${opdTokenNumber}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

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
          "border-b border-border bg-background/80 backdrop-blur",
          "px-4 py-2 lg:px-6",
          "relative min-h-14 flex flex-col justify-center",
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
          // ── Active states: two-row identity block ──
          <div className="flex flex-col gap-0.5">
            {/*
              Row 1 — primary: name + demographics chip + CTA.
              Always `flex justify-between` — the centerSlot is NO LONGER in
              this row. Instead it is rendered as an absolutely-positioned
              overlay on the `<header>` (see below), so it is always
              pixel-perfectly centred in the header band regardless of the
              height of the two-row block. The previous grid approach centred
              the icons horizontally but left them in Row 1 of a two-row block,
              which placed them in the upper half of the header when the two-row
              block was nearly as tall as the header — ppr-11 follow-up QA
              confirmed the icons appeared too close to the upper border.
            */}
            <div className="flex w-full items-center justify-between gap-4">
              {/* Left: back arrow + patient name + demographics */}
              <div className="flex min-w-0 items-center gap-2">
                <BackLink />

                <h1 className="truncate text-base font-semibold leading-none text-foreground">
                  {appointment.patient_name}
                </h1>

                {demographics && (
                  <span className="ml-2 shrink-0 text-sm font-medium text-muted-foreground">
                    {demographics}
                  </span>
                )}
              </div>

              {/* Right cluster: running-behind indicator + state CTA + layout menu + kebab */}
              <div className="flex shrink-0 items-center gap-2 ml-auto">
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

            {/* Row 2 — secondary metadata strip */}
            {/* The Tooltip surfaces the full unabbreviated string when row 2 is
                truncated at compressed breakpoints. tabIndex={0} makes it
                keyboard-focusable for a11y. */}
            <TooltipProvider delayDuration={400}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <p
                    tabIndex={0}
                    className={cn(
                      "flex min-w-0 items-center overflow-hidden",
                      "text-xs text-muted-foreground",
                      "focus:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:rounded",
                    )}
                  >
                    {/* MRN — all breakpoints; links to patient chart when patient_id present */}
                    {appointment.patient_id && mrn && (
                      <Link
                        href={`/dashboard/patients-v2/${appointment.patient_id}`}
                        className="shrink-0 hover:text-foreground hover:underline focus:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded"
                        title="View patient chart"
                      >
                        {mrn}
                      </Link>
                    )}

                    {/* Phone — md+ only; tel: link for one-tap calling */}
                    {appointment.patient_phone && (
                      <span className="hidden md:contents">
                        <Dot />
                        <a
                          href={`tel:${appointment.patient_phone}`}
                          className="shrink-0 tabular-nums hover:text-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded"
                        >
                          {appointment.patient_phone}
                        </a>
                      </span>
                    )}

                    {/* Modality — md+ (icon-only below lg, icon + label at lg+) */}
                    <span className="hidden md:contents">
                      <Dot />
                      <span className="inline-flex shrink-0 items-center gap-0.5">
                        <ModalityIcon modality={appointment.consultation_type} />
                        <span className="hidden lg:inline">
                          {modalityLabel(appointment.consultation_type)}
                        </span>
                      </span>
                    </span>

                    {/* Scheduled time — md+ */}
                    <span className="hidden md:contents">
                      <Dot />
                      <span className="shrink-0 tabular-nums">
                        {formatTime(appointment.appointment_date)}
                      </span>
                    </span>

                    {/* OPD token — all breakpoints; only for 'token' event type.
                        'group' events have no meaningful per-patient token — suppress the chip.
                        typeof guard defends against opd_token_number === 0 being falsy. */}
                    {opdEventType === 'token' && typeof opdTokenNumber === 'number' && (
                      <>
                        <Dot />
                        <span className="shrink-0 text-xs font-medium text-muted-foreground">
                          Token #{opdTokenNumber}
                        </span>
                      </>
                    )}

                    {/* Lobby resend notice — status feedback after re-send attempt */}
                    {resendNotice && (
                      <span
                        role="status"
                        aria-live="polite"
                        className="ml-2 hidden lg:inline truncate text-warning"
                      >
                        {resendNotice}
                      </span>
                    )}
                  </p>
                </TooltipTrigger>
                <TooltipContent>{row2TooltipText}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        )}

      </header>

      {/* Queue rail — sticky strip docked directly below this header (pf-08) */}
      <CockpitQueueRail
        currentAppointmentId={appointment.id}
        state={state}
        token={token}
      />

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
  const rows: { label: string; value: string | null | undefined }[] = [
    { label: "Appointment ID", value: appointment.id },
    { label: "Modality", value: modalityLabel(appointment.consultation_type) },
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
