"use client";

import { useCallback, useRef, useState, type Ref } from "react";
import {
  Calendar,
  Clock,
  MessageSquare,
  Mic,
  RefreshCw,
  User,
  Video,
} from "lucide-react";

import ConsultationLauncher, {
  type ConsultationLauncherHandle,
} from "@/components/consultation/ConsultationLauncher";
import { postAppointmentCheckIn, resendConsultationLink } from "@/lib/api";
import { IN_CLINIC_APPOINTMENT_UPDATED_EVENT } from "@/lib/patient-profile/state";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  formatDate as formatDatePinned,
  formatTime as formatTimePinned,
} from "@/lib/format-date";
import { cn } from "@/lib/utils";
import type { Appointment } from "@/types/appointment";

// ---------------------------------------------------------------------------
// Public surface
// ---------------------------------------------------------------------------

export interface ReadyCardProps {
  appointment: Appointment;
  /** Doctor JWT forwarded to `ConsultationLauncher` + the resend endpoint. */
  token: string;
  /**
   * When `true`, overlays a "Waiting for patient" lobby banner with a
   * [Resend link] CTA above the launcher. Controlled by the parent
   * (`ConsultationCockpit`) based on the derived `CockpitState`.
   *
   * The resend call hits `POST /consultation/:sessionId/resend-link`
   * (force semantics — the backend bypasses its de-dup window for
   * explicit doctor-triggered actions).
   */
  showLobbyBanner?: boolean;
  /**
   * Forwarded to `ConsultationLauncher` so `ConsultationCockpit` can call
   * `launcherRef.current.start(modality)` from the header CTA without
   * needing `document.querySelector` (task-cockpit-fix-4 / K-H2 lock).
   */
  launcherRef?: Ref<ConsultationLauncherHandle>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  return formatDatePinned(iso, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(iso: string): string {
  return formatTimePinned(iso);
}

/** Returns elapsed whole minutes since `iso`. */
function minutesAgo(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000));
}

function modalityLabel(type: Appointment["consultation_type"]): string {
  if (type === "text") return "Text consultation";
  if (type === "voice") return "Voice consultation";
  if (type === "in_clinic") return "In-clinic visit";
  return "Video consultation";
}

function modalityTitle(type: Appointment["consultation_type"]): string {
  if (type === "text") return "Text consult";
  if (type === "voice") return "Voice consult";
  if (type === "in_clinic") return "In-clinic visit";
  return "Video consult";
}

function ModalityIcon({
  type,
  className,
}: {
  type: Appointment["consultation_type"];
  className?: string;
}): React.ReactElement {
  const cls = cn("h-3.5 w-3.5", className);
  if (type === "text") return <MessageSquare className={cls} aria-hidden />;
  if (type === "voice") return <Mic className={cls} aria-hidden />;
  if (type === "in_clinic") return <User className={cls} aria-hidden />;
  return <Video className={cls} aria-hidden />;
}

function ModalityHeroIcon({
  type,
}: {
  type: Appointment["consultation_type"];
}): React.ReactElement {
  const cls = "h-7 w-7";
  if (type === "text") return <MessageSquare className={cls} aria-hidden />;
  if (type === "voice") return <Mic className={cls} aria-hidden />;
  if (type === "in_clinic") return <User className={cls} aria-hidden />;
  return <Video className={cls} aria-hidden />;
}

/** Soft tint for the hero tile — stays on design tokens, modality-aware. */
function modalityHeroClass(type: Appointment["consultation_type"]): string {
  if (type === "voice") {
    return "border-sky-200/80 bg-sky-50 text-sky-700";
  }
  if (type === "text") {
    return "border-emerald-200/80 bg-emerald-50 text-emerald-700";
  }
  if (type === "in_clinic") {
    return "border-border bg-muted text-foreground";
  }
  return "border-primary/20 bg-primary/5 text-primary";
}

/** Label for the primary "Start consult" CTA, keyed on appointment modality. */
function startCtaLabel(type: Appointment["consultation_type"]): string {
  if (type === "video") return "Start video consult";
  if (type === "voice") return "Start voice call";
  if (type === "text") return "Start chat";
  return "Start visit"; // in_clinic
}

/**
 * Map `consultation_type` to the modality arg accepted by
 * `ConsultationLauncherHandle.start()`. In-clinic defaults to `video`
 * (matches the launcher's own `resolveBookedModality` helper).
 */
function toTeleModality(
  type: Appointment["consultation_type"],
): "text" | "voice" | "video" {
  if (type === "text" || type === "voice" || type === "video") return type;
  return "video";
}

/** Imperatively call `start()` on a forwarded ref safely. */
function callLauncherStart(
  ref: Ref<ConsultationLauncherHandle> | undefined,
  modality: "text" | "voice" | "video",
) {
  if (ref && typeof ref === "object" && "current" in ref) {
    ref.current?.start(modality);
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Center-pane card for the `ready` and `lobby` cockpit states.
 *
 * cs-10 — slimmed to a single primary CTA + a "Switch modality" control:
 *
 *   - `ready`  — "Start [modality] consult" button + optional "Switch
 *                modality" dropdown. `ConsultationLauncher` is mounted with
 *                `hidePrecallUI` to suppress its own 3-button grid while
 *                still running its session-lifecycle effects.
 *   - `lobby`  — same card, plus a top banner: "Waiting for patient — they
 *                were sent the join link X min ago. [Resend link]".
 *
 * "Mark no-show" has been removed from this card — it lives in the kebab
 * menu (cs-02) and is bound to the `m` hotkey. No `onMarkNoShow` prop.
 *
 * `ConsultationLauncher` is mounted inside this card. Do NOT add a
 * `key` prop keyed on state — that would defeat the launcher's
 * rehydrate-on-refresh effects (see `cockpit-state.ts` Note #2).
 */
export default function ReadyCard({
  appointment,
  token,
  showLobbyBanner = false,
  launcherRef,
}: ReadyCardProps) {
  const [resendBusy, setResendBusy] = useState(false);
  const [resendNotice, setResendNotice] = useState<string | null>(null);
  const resendTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  /** True once ConsultationLauncher has an in-memory live session. */
  const [sessionLive, setSessionLive] = useState(false);

  const handleLauncherStartError = useCallback((message: string | null) => {
    setStartError(message);
    if (message) setStarting(false);
  }, []);

  const sessionId = appointment.consultation_session?.id ?? null;
  const sessionCreatedAt = appointment.consultation_session?.actual_started_at ?? null;
  const isInClinic = appointment.consultation_type === "in_clinic";
  const consultType = appointment.consultation_type;

  const handleResend = async () => {
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

  const handleStartConsult = () => {
    setStartError(null);
    if (isInClinic) {
      setStarting(true);
      void postAppointmentCheckIn(token, appointment.id)
        .then((res) => {
          window.dispatchEvent(
            new CustomEvent(IN_CLINIC_APPOINTMENT_UPDATED_EVENT, {
              detail: res.data.appointment,
            }),
          );
        })
        .catch((err: unknown) => {
          setStartError(
            err instanceof Error ? err.message : "Failed to start visit",
          );
        })
        .finally(() => {
          setStarting(false);
        });
      return;
    }
    setStarting(true);
    callLauncherStart(launcherRef, toTeleModality(appointment.consultation_type));
  };

  const handleSwitchTo = (modality: "text" | "voice" | "video") => {
    callLauncherStart(launcherRef, modality);
  };

  const currentModality = appointment.consultation_type;

  // Keep ConsultationLauncher mounted in one stable slot — switching trees
  // on live would remount it and wipe the in-memory Twilio session.
  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col bg-card",
        sessionLive ? "" : "items-center justify-center px-4 py-6",
      )}
    >
      <div
        className={cn(
          sessionLive
            ? "min-h-0 flex-1"
            : "w-full max-w-md space-y-3",
        )}
      >
        {!sessionLive && showLobbyBanner && (
          <div
            role="status"
            aria-live="polite"
            className="flex items-start justify-between gap-3 rounded-2xl border border-amber-200/90 bg-amber-50 px-4 py-3 shadow-sm"
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-900">
                  Lobby
                </span>
                <p className="text-sm font-semibold text-amber-950">
                  Waiting for patient
                </p>
              </div>
              {sessionCreatedAt && (
                <p className="mt-1 text-xs text-amber-800">
                  Join link sent {minutesAgo(sessionCreatedAt)} min ago.
                </p>
              )}
              {resendNotice && (
                <p className="mt-1 text-xs text-amber-900">
                  {resendNotice}
                </p>
              )}
            </div>

            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <button
                type="button"
                onClick={() => void handleResend()}
                disabled={resendBusy || !sessionId}
                className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-900 shadow-sm transition hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                {resendBusy ? "Sending…" : "Resend link"}
              </button>
            </div>
          </div>
        )}

        {!sessionLive && (
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <div className="flex flex-col items-center gap-3 border-b border-border/60 bg-gradient-to-b from-muted/40 to-card px-6 pb-5 pt-6">
              <div className="flex w-full items-center justify-between gap-2">
                <span
                  className={cn(
                    "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
                    showLobbyBanner
                      ? "bg-amber-100 text-amber-900"
                      : "bg-emerald-100 text-emerald-900",
                  )}
                >
                  {showLobbyBanner ? "Waiting" : "Ready"}
                </span>
                <span className="text-xs text-muted-foreground">
                  {modalityLabel(consultType)}
                </span>
              </div>

              <div
                className={cn(
                  "flex h-16 w-16 items-center justify-center rounded-2xl border shadow-sm",
                  modalityHeroClass(consultType),
                )}
              >
                <ModalityHeroIcon type={consultType} />
              </div>

              <div className="text-center">
                <h2 className="text-lg font-semibold tracking-tight text-foreground">
                  {isInClinic
                    ? "In-clinic visit — start when patient arrives."
                    : modalityTitle(consultType)}
                </h2>
                {!isInClinic && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    Ready to start
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-4 px-6 py-5">
              <div className="flex flex-wrap justify-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground">
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                  {formatDate(appointment.appointment_date)}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                  {formatTime(appointment.appointment_date)}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground">
                  <ModalityIcon
                    type={appointment.consultation_type}
                    className="text-muted-foreground"
                  />
                  {modalityLabel(appointment.consultation_type)}
                </span>
              </div>

              <Button
                size="lg"
                className="h-11 w-full gap-2 text-sm font-semibold shadow-sm"
                disabled={starting}
                onClick={handleStartConsult}
              >
                <ModalityIcon type={consultType} className="h-4 w-4" />
                {starting ? "Starting…" : startCtaLabel(appointment.consultation_type)}
              </Button>
              {startError && (
                <p role="alert" className="text-center text-sm text-red-600">
                  {startError}
                </p>
              )}

              {!isInClinic && (
                <div className="mt-0 flex justify-center">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        Switch modality
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="center">
                      {currentModality !== "video" && (
                        <DropdownMenuItem onSelect={() => handleSwitchTo("video")}>
                          Switch to video
                        </DropdownMenuItem>
                      )}
                      {currentModality !== "voice" && (
                        <DropdownMenuItem onSelect={() => handleSwitchTo("voice")}>
                          Switch to voice
                        </DropdownMenuItem>
                      )}
                      {currentModality !== "text" && (
                        <DropdownMenuItem onSelect={() => handleSwitchTo("text")}>
                          Switch to chat
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tele only — in-clinic never provisions Twilio. */}
        {!isInClinic && (
          <ConsultationLauncher
            ref={launcherRef}
            appointment={appointment}
            token={token}
            hidePrecallUI
            onLiveChange={setSessionLive}
            onStartError={handleLauncherStartError}
          />
        )}
      </div>
    </div>
  );
}
