"use client";

/**
 * EndedConsultBody — placeholder body leaf for the review template
 * (ecb-01, 2026-05-27).
 *
 * Background:
 *   csl-01 (2026-05-26) hid the redundant column-shell headers in the
 *   middle column. That fix exposed a long-standing void: when an
 *   appointment is `ended` (status=completed) or `terminal` (status in
 *   {cancelled, no_show}), `mapStateToTemplate` returns `'review'` and
 *   `makeMiddleColumn` omitted the body leaf entirely. The middle column
 *   then rendered only Assessment + Plan-bottom with a meaningless gap
 *   between the (now-hidden) "Consult" column header and the sticky
 *   Assessment strip. csl-01 captured the gap as a follow-up; this is
 *   the follow-up.
 *
 * Scope (DL-1):
 *   Compact, informational strip — no transcript playback, no recording
 *   surface, no extra tabs. Mirrors the AssessmentStrip's rhythm
 *   (~64px tall, horizontal, bg-card, semantic tokens only). Larger
 *   surfaces (full transcript replay, summary tabs, recording player)
 *   are explicit follow-ups in `docs/Work/capture/inbox.md`.
 *
 * Branches (DL-3):
 *   - `terminal` + appointmentStatus='cancelled'  → "Appointment cancelled"
 *   - `terminal` + appointmentStatus='no_show'    → "Patient did not attend"
 *   - `ended`    + session present                → "{Modality} consultation ended · at HH:MM · N min"
 *   - `ended`    + no session                     → "Visit completed · no consultation recorded"
 *
 * Telemetry (DL-5):
 *   One-shot per browser session via `__cockpitV2REndedConsultBodyLanded`.
 *   Payload narrows to `{ appointmentId, mode, modality }`.
 *
 * Visual tokens (DL-4):
 *   Only semantic tokens — `bg-card`, `text-foreground`, `text-muted-foreground`,
 *   `border-border`, `text-destructive`, `text-warning`. No ad-hoc colors.
 *
 * @see frontend/lib/patient-profile/templates.tsx (makeMiddleColumn)
 * @see frontend/lib/patient-profile/state.ts       (mapStateToTemplate)
 * @see docs/Work/Daily-plans/May 2026/27-05-2026/cockpit-ended-consult-body/Tasks/task-ecb-01-ended-consult-body.md
 */

import { useEffect, useMemo } from "react";
import {
  CheckCircle2,
  MessageSquare,
  Phone,
  UserX,
  Video,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { formatTime } from "@/lib/format-date";
import { trackCockpitV2REndedConsultBodyLanded } from "@/lib/patient-profile/telemetry";
import type {
  CockpitAppointmentStatus,
  CockpitConsultationModality,
  CockpitState,
} from "@/lib/patient-profile/state";

export type EndedConsultMode =
  | "completed-with-session"
  | "completed-no-session"
  | "cancelled"
  | "no-show";

type ModalityValue = Exclude<CockpitConsultationModality, "in_clinic">;

export interface EndedConsultBodyProps {
  /** The cockpit state — only `'ended'` or `'terminal'` are valid here. */
  state: CockpitState;
  /** Raw appointment.status — drives the terminal-state copy split. */
  appointmentStatus: CockpitAppointmentStatus;
  /** Session modality if a session existed; null for completed-no-session. */
  modality: ModalityValue | null;
  /** ISO timestamp of `consultation_session.actual_started_at`. */
  startedAt: string | null;
  /** ISO timestamp of `consultation_session.actual_ended_at`. */
  endedAt: string | null;
  /**
   * `appointment.consultation_duration_seconds` (server-computed). Falls
   * back to `endedAt - startedAt` arithmetic when null/zero so the meta
   * line stays useful for legacy rows where the column wasn't populated.
   */
  durationSeconds: number | null;
  /** Production mount only; omitted in unit tests so telemetry stays quiet. */
  appointmentId?: string;
}

const MODALITY_ICON: Record<ModalityValue, LucideIcon> = {
  text: MessageSquare,
  voice: Phone,
  video: Video,
};

const MODALITY_LABEL: Record<ModalityValue, string> = {
  text: "Text",
  voice: "Voice",
  video: "Video",
};

function deriveMode(
  state: CockpitState,
  appointmentStatus: CockpitAppointmentStatus,
  modality: ModalityValue | null,
  endedAt: string | null,
): EndedConsultMode {
  if (state === "terminal") {
    return appointmentStatus === "cancelled" ? "cancelled" : "no-show";
  }
  // For 'ended' (and any other non-terminal — defensive): treat as
  // "completed with session" only when we have BOTH a modality and an
  // end timestamp. Otherwise fall back to the no-session copy so the
  // strip never claims a phantom session.
  if (modality && endedAt) return "completed-with-session";
  return "completed-no-session";
}

function formatDuration(
  seconds: number | null,
  startedAt: string | null,
  endedAt: string | null,
): string | null {
  // Server-computed duration is the canonical source.
  if (typeof seconds === "number" && Number.isFinite(seconds) && seconds > 0) {
    const minutes = Math.round(seconds / 60);
    return minutes < 1 ? "<1 min" : `${minutes} min`;
  }
  // Fallback: derive from start + end timestamps.
  if (startedAt && endedAt) {
    const startMs = new Date(startedAt).getTime();
    const endMs = new Date(endedAt).getTime();
    if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs) {
      const minutes = Math.round((endMs - startMs) / 60_000);
      return minutes < 1 ? "<1 min" : `${minutes} min`;
    }
  }
  return null;
}

interface Layout {
  Icon: LucideIcon;
  iconClass: string;
  ariaLabel: string;
  title: string;
  subtitle: string;
}

function layoutFor(
  mode: EndedConsultMode,
  modality: ModalityValue | null,
  endedAt: string | null,
  durationLabel: string | null,
): Layout {
  switch (mode) {
    case "cancelled":
      return {
        Icon: XCircle,
        iconClass: "text-destructive",
        ariaLabel: "Appointment cancelled",
        title: "Appointment cancelled",
        subtitle: "This visit was cancelled before it took place.",
      };
    case "no-show":
      return {
        Icon: UserX,
        iconClass: "text-warning",
        ariaLabel: "Patient did not attend",
        title: "Patient did not attend",
        subtitle: "Reschedule from the header menu.",
      };
    case "completed-no-session":
      return {
        Icon: CheckCircle2,
        iconClass: "text-muted-foreground",
        ariaLabel: "Visit completed",
        title: "Visit completed",
        subtitle: "No consultation recorded for this visit.",
      };
    case "completed-with-session": {
      const m = modality as ModalityValue;
      const endedAtLabel = endedAt ? formatTime(endedAt) : null;
      const metaParts: string[] = [];
      if (endedAtLabel) metaParts.push(`at ${endedAtLabel}`);
      if (durationLabel) metaParts.push(durationLabel);
      return {
        Icon: MODALITY_ICON[m],
        iconClass: "text-foreground",
        ariaLabel: `${MODALITY_LABEL[m]} consultation ended`,
        title: `${MODALITY_LABEL[m]} consultation ended`,
        subtitle:
          metaParts.length > 0
            ? metaParts.join(" · ")
            : "Consultation summary available below.",
      };
    }
  }
}

export function EndedConsultBody({
  state,
  appointmentStatus,
  modality,
  startedAt,
  endedAt,
  durationSeconds,
  appointmentId,
}: EndedConsultBodyProps) {
  const mode = useMemo(
    () => deriveMode(state, appointmentStatus, modality, endedAt),
    [state, appointmentStatus, modality, endedAt],
  );

  const durationLabel = useMemo(
    () => formatDuration(durationSeconds, startedAt, endedAt),
    [durationSeconds, startedAt, endedAt],
  );

  const { Icon, iconClass, ariaLabel, title, subtitle } = layoutFor(
    mode,
    modality,
    endedAt,
    durationLabel,
  );

  useEffect(() => {
    if (!appointmentId) return;
    trackCockpitV2REndedConsultBodyLanded({
      appointmentId,
      mode,
      modality: modality ?? "n/a",
    });
    // Telemetry is one-shot per session; intentionally fire-on-mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      role="region"
      aria-label={ariaLabel}
      className="flex h-full min-h-[64px] w-full shrink-0 items-center gap-3 border-b border-t bg-card px-4 py-2"
    >
      <Icon
        className={`h-5 w-5 shrink-0 ${iconClass}`}
        aria-hidden
      />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="truncate text-sm font-medium text-foreground">
          {title}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {subtitle}
        </p>
      </div>
    </div>
  );
}
