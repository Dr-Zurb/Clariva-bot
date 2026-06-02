"use client";

import { useRef, useState, type Ref } from "react";
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
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { resendConsultationLink } from "@/lib/api";
import {
  formatDate as formatDatePinned,
  formatTime as formatTimePinned,
} from "@/lib/format-date";
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

function ModalityIcon({
  type,
}: {
  type: Appointment["consultation_type"];
}): React.ReactElement {
  if (type === "text")
    return <MessageSquare className="h-3.5 w-3.5" aria-hidden />;
  if (type === "voice") return <Mic className="h-3.5 w-3.5" aria-hidden />;
  if (type === "in_clinic") return <User className="h-3.5 w-3.5" aria-hidden />;
  return <Video className="h-3.5 w-3.5" aria-hidden />;
}

/** Label for the primary "Start consult" CTA, keyed on appointment modality. */
function startCtaLabel(type: Appointment["consultation_type"]): string {
  if (type === "video") return "Start video consult";
  if (type === "voice") return "Start voice call";
  if (type === "text") return "Start chat";
  return "Mark patient called"; // in_clinic
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
 * cs-10 — slimmed to a single primary CTA + a "Switch modality" text link:
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

  const sessionId = appointment.consultation_session?.id ?? null;
  const sessionCreatedAt = appointment.consultation_session?.actual_started_at ?? null;
  const isInClinic = appointment.consultation_type === "in_clinic";

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
    setStarting(true);
    callLauncherStart(launcherRef, toTeleModality(appointment.consultation_type));
  };

  const handleSwitchTo = (modality: "text" | "voice" | "video") => {
    callLauncherStart(launcherRef, modality);
  };

  const currentModality = appointment.consultation_type;

  return (
    <div className="space-y-3">
      {/* Lobby banner — only mounted when parent signals lobby state.
          Mark no-show is intentionally absent (cs-10): it lives in the
          kebab menu (cs-02) and the `m` hotkey. */}
      {showLobbyBanner && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-start justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3"
        >
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-amber-900">
              Waiting for patient
            </p>
            {sessionCreatedAt && (
              <p className="mt-0.5 text-xs text-amber-700">
                Join link sent {minutesAgo(sessionCreatedAt)} min ago.
              </p>
            )}
            {resendNotice && (
              <p className="mt-1 text-xs text-amber-800">{resendNotice}</p>
            )}
          </div>

          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <button
              type="button"
              onClick={() => void handleResend()}
              disabled={resendBusy || !sessionId}
              className="inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-800 transition hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
              {resendBusy ? "Sending…" : "Resend link"}
            </button>
          </div>
        </div>
      )}

      {/* Main ready card — header + scheduling summary + slimmed CTA. */}
      <div className="rounded-lg border border-border bg-card p-6">
        <h2 className="mb-3 text-base font-semibold text-foreground">
          {isInClinic
            ? "In-clinic visit — start when patient arrives."
            : "Ready to start"}
        </h2>

        {/* Scheduling summary */}
        <div className="mb-5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5" aria-hidden />
            {formatDate(appointment.appointment_date)}
          </span>
          <span className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" aria-hidden />
            {formatTime(appointment.appointment_date)}
          </span>
          <span className="flex items-center gap-1.5">
            <ModalityIcon type={appointment.consultation_type} />
            {modalityLabel(appointment.consultation_type)}
          </span>
        </div>

        {/* Primary CTA — single dominant action. */}
        <Button
          size="lg"
          className="w-full"
          disabled={starting}
          onClick={handleStartConsult}
        >
          {starting ? "Starting…" : startCtaLabel(appointment.consultation_type)}
        </Button>

        {/* Switch modality — text link below the primary button.
            Hidden for in-clinic (no tele-modality to switch to). */}
        {!isInClinic && (
          <div className="mt-3 flex justify-center">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="text-sm text-muted-foreground hover:underline focus:outline-none"
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

        {/* ConsultationLauncher — mounts with hidePrecallUI so its session-
            lifecycle effects (rehydration, live-room rendering) run while its
            own 3-button grid is suppressed. The primary CTA above drives
            `start()` via the forwarded ref. */}
        <ConsultationLauncher
          ref={launcherRef}
          appointment={appointment}
          token={token}
          hidePrecallUI
        />
      </div>
    </div>
  );
}
