"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  startConsultation,
  getConsultationToken,
  startVoiceConsultation,
  resendConsultationLink,
} from "@/lib/api";
import type { Appointment, ConsultationModality } from "@/types/appointment";
import VideoRoom from "./VideoRoom";
import VoiceConsultRoom from "./VoiceConsultRoom";
import PatientJoinLink from "./PatientJoinLink";
import LiveConsultPanel from "./LiveConsultPanel";
import ModalityChangeLauncher from "./ModalityChangeLauncher";

/**
 * Top-level surface on the appointment detail page that lands the
 * multi-modality consultation flow.
 *
 * Plan 03 · Task 20:
 *   - Renders all three modality buttons inline (Decision 7 in master plan).
 *   - The button matching `appointment.consultation_type` is the **primary**
 *     CTA; the other two are disabled with a "Coming soon" tooltip in v1.
 *     Plan 09 enables them for mid-consult modality switching.
 *   - For booked = video, primary click runs today's `startConsultation()`
 *     flow verbatim (token fetch → mount `<VideoRoom>` inside
 *     `<LiveConsultPanel>` → display `<PatientJoinLink>` alongside).
 *   - For booked = text or voice, primary click shows a transient inline
 *     "Coming soon" notice — no nav, no failed network calls. Plans 04 / 05
 *     swap that for a real `consultation-session-service.createSession()` call
 *     when their respective room components ship.
 *
 * Owns ALL session lifecycle state. `<LiveConsultPanel>` is intentionally pure
 * composition so the same panel works identically across modalities once
 * Plans 04 / 05 land their rooms.
 *
 * @see docs/Development/Daily-plans/April 2026/19-04-2026/Tasks/task-20-consultation-launcher-and-live-panel.md
 * @see docs/Development/Daily-plans/April 2026/19-04-2026/Plans/plan-03-doctor-modality-launcher.md
 * @see docs/Development/Daily-plans/April 2026/19-04-2026/Plans/plan-multi-modality-consultations.md (Decision 7 LOCKED)
 */
export interface ConsultationLauncherProps {
  appointment: Appointment;
  /** Doctor JWT — passed into session-create / token-fetch helpers and
   *  forwarded to `<LiveConsultPanel>` for forward-compatibility with
   *  Plans 04 / 05 / 07. */
  token: string;
}

/**
 * In-memory live-session record owned by the launcher. Shape is shared
 * across `video` and `voice` modalities — the two backends return the
 * same `StartConsultationResult` envelope (doctor token + room name +
 * patient join URL + optional companion text-channel triplet). The
 * launcher discriminates on `bookedModality` at render time to pick
 * `<VideoRoom>` vs `<VoiceConsultRoom>`.
 */
interface LiveSession {
  doctorToken: string;
  roomName: string;
  patientJoinUrl: string;
  /**
   * Plan 06 · Task 36 — companion text channel URL + HMAC token + JWT
   * expiry. Populated on a fresh `startConsultation` response; undefined
   * on the rejoin path (existing room) because the backend's facade
   * short-circuits on an existing session row and does NOT re-provision
   * the companion channel. Tasks 38 + 24c consume this to mount
   * `<TextConsultRoom>` inside `<VideoRoom>` / `<VoiceConsultRoom>`; in
   * this task it's pure data plumbing — no UI is rendered off it yet.
   */
  companion?: {
    sessionId: string;
    patientJoinUrl: string | null;
    patientToken: string | null;
    expiresAt: string;
  };
}

type ButtonModality = "text" | "voice" | "video";
const BUTTON_MODALITIES: readonly ButtonModality[] = ["text", "voice", "video"];

const MODALITY_META: Record<
  ButtonModality,
  { icon: string; label: string; bookedLabel: string }
> = {
  text:  { icon: "💬", label: "Text Consultation",  bookedLabel: "Text"  },
  voice: { icon: "🎙", label: "Voice Consultation", bookedLabel: "Voice" },
  video: { icon: "🎥", label: "Video Consultation", bookedLabel: "Video" },
};

/**
 * Resolve the booked modality, defaulting to 'video' when the column is null
 * or holds a non-tele value (e.g. 'in_clinic'). 'in_clinic' is rendered as
 * video in v1 because the CTA layout is identical and there is no in-clinic
 * tele-room to mount; clinical write-up surfaces remain available below the
 * launcher (in `<AppointmentConsultationActions>`).
 */
function resolveBookedModality(
  consultationType: ConsultationModality | null | undefined,
): ButtonModality {
  if (consultationType === "text" || consultationType === "voice" || consultationType === "video") {
    return consultationType;
  }
  return "video";
}

export default function ConsultationLauncher({
  appointment,
  token,
}: ConsultationLauncherProps) {
  const router = useRouter();
  const bookedModality = useMemo(
    () => resolveBookedModality(appointment.consultation_type ?? null),
    [appointment.consultation_type],
  );

  const [liveSession, setLiveSession] = useState<LiveSession | null>(null);
  const [sessionId, setSessionId]     = useState<string | null>(null);
  const [starting, setStarting]         = useState(false);
  const [startError, setStartError]     = useState<string | null>(null);
  const [comingSoon, setComingSoon]     = useState<string | null>(null);
  const [resendBusy, setResendBusy]     = useState(false);
  const [resendNotice, setResendNotice] = useState<string | null>(null);
  const comingSoonTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resendNoticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Post-Task-35: the persistent "has a consultation been started?" flag is
  // `consultation_session.provider_session_id` on the enriched appointment
  // response (replaces the dropped `consultation_room_sid` column).
  const existingProviderSessionId =
    appointment.consultation_session?.provider_session_id ?? null;
  const canStartConsultation =
    (appointment.status === "pending" || appointment.status === "confirmed") &&
    !existingProviderSessionId;

  // Re-hydrate the in-memory session on page refresh when a Twilio room
  // already exists for this appointment. Mirrors the legacy effect that
  // previously lived in `<AppointmentConsultationActions>` so the doctor can
  // re-join without clicking Start again.
  useEffect(() => {
    if (bookedModality !== "video" && bookedModality !== "voice") return;
    if (!existingProviderSessionId) return;
    if (liveSession) return;
    if (appointment.status !== "pending" && appointment.status !== "confirmed") return;

    let cancelled = false;
    const fetchToken = async () => {
      try {
        // `startConsultation` / `startVoiceConsultation` are BOTH
        // idempotent on the backend — they short-circuit to the
        // existing room when one already exists. This means we can
        // reuse them as the re-hydrate path on page refresh.
        const res = bookedModality === "voice"
          ? await startVoiceConsultation(token, appointment.id)
          : await startConsultation(token, appointment.id);
        if (cancelled) return;
        setLiveSession({
          doctorToken:    res.data.doctorToken,
          roomName:       res.data.roomName,
          patientJoinUrl: res.data.patientJoinUrl,
          companion:      res.data.companion,
        });
        setSessionId(res.data.companion?.sessionId ?? null);
      } catch {
        // Fallback path only exists for video today — `getConsultationToken`
        // is the legacy single-token endpoint. Voice has no equivalent
        // shortcut; its `start-voice` call IS the rejoin path.
        if (bookedModality === "video") {
          try {
            const tokenRes = await getConsultationToken(token, appointment.id);
            if (cancelled) return;
            setLiveSession({
              doctorToken:    tokenRes.data.token,
              roomName:       tokenRes.data.roomName,
              patientJoinUrl: "",
              // No companion on the `/token` rejoin path — only `POST /start`
              // can surface it (and only on the fresh-create branch).
            });
          } catch {
            // Swallow — doctor will see Start button instead. Matches legacy behaviour.
          }
        }
      }
    };
    void fetchToken();
    return () => {
      cancelled = true;
    };
  }, [
    bookedModality,
    existingProviderSessionId,
    appointment.id,
    appointment.status,
    liveSession,
    token,
  ]);

  useEffect(() => {
    return () => {
      if (comingSoonTimer.current) {
        clearTimeout(comingSoonTimer.current);
      }
      if (resendNoticeTimer.current) {
        clearTimeout(resendNoticeTimer.current);
      }
    };
  }, []);

  const flashComingSoon = (message: string) => {
    setComingSoon(message);
    if (comingSoonTimer.current) {
      clearTimeout(comingSoonTimer.current);
    }
    comingSoonTimer.current = setTimeout(() => setComingSoon(null), 3500);
  };

  const handleStartVideo = async () => {
    setStartError(null);
    setStarting(true);
    try {
      const res = await startConsultation(token, appointment.id);
      setLiveSession({
        doctorToken:    res.data.doctorToken,
        roomName:       res.data.roomName,
        patientJoinUrl: res.data.patientJoinUrl,
        companion:      res.data.companion,
      });
      setSessionId(res.data.companion?.sessionId ?? null);
    } catch (err) {
      setStartError(err instanceof Error ? err.message : "Failed to start consultation");
    } finally {
      setStarting(false);
    }
  };

  const handleStartVoice = async () => {
    setStartError(null);
    setStarting(true);
    try {
      const res = await startVoiceConsultation(token, appointment.id);
      setLiveSession({
        doctorToken:    res.data.doctorToken,
        roomName:       res.data.roomName,
        patientJoinUrl: res.data.patientJoinUrl,
        companion:      res.data.companion,
      });
      setSessionId(res.data.companion?.sessionId ?? null);
    } catch (err) {
      setStartError(err instanceof Error ? err.message : "Failed to start voice consultation");
    } finally {
      setStarting(false);
    }
  };

  const handleDisconnect = () => {
    setTimeout(() => router.refresh(), 150);
  };

  /**
   * Doctor-triggered "resend link" — wired from the
   * patient-hasn't-joined affordance inside `<VoiceConsultRoom>`.
   * Calls the `/resend-link` endpoint with `force=true` semantics
   * on the backend (dedup window is bypassed for explicit doctor
   * actions).
   */
  const handleResendLink = async (): Promise<{ sent: boolean }> => {
    if (!sessionId || resendBusy) return { sent: false };
    setResendBusy(true);
    let sent = false;
    try {
      const res = await resendConsultationLink(token, sessionId);
      sent = res.data.sent;
      setResendNotice(
        sent
          ? "Join link resent to the patient."
          : `Couldn't resend link${res.data.reason ? ` — ${res.data.reason}` : "."}`,
      );
    } catch (err) {
      setResendNotice(
        err instanceof Error ? err.message : "Failed to resend join link",
      );
    } finally {
      setResendBusy(false);
      if (resendNoticeTimer.current) {
        clearTimeout(resendNoticeTimer.current);
      }
      resendNoticeTimer.current = setTimeout(() => setResendNotice(null), 4500);
    }
    return { sent };
  };

  const handlePrimaryClick = (m: ButtonModality) => {
    if (m === "video") {
      void handleStartVideo();
      return;
    }
    if (m === "voice") {
      void handleStartVoice();
      return;
    }
    flashComingSoon(
      "Text consultations launch alongside text — your patients will see this option once it's live.",
    );
  };

  const handleSecondaryClick = () => {
    flashComingSoon("Coming soon");
  };

  // Show the live panel for the booked modality the moment a Twilio
  // session exists for video or voice. Text stays "Coming soon" in this
  // launcher — Plan 04 wires its own surface.
  const sessionLive =
    (bookedModality === "video" || bookedModality === "voice") && !!liveSession;

  return (
    <section
      aria-label="Consultation launcher"
      className="space-y-4"
    >
      {/* Header strip — modality label only. The page above already shows
          appointment date / time and status; we keep this strip compact to
          avoid duplicating that header. Reschedule / cancel actions are
          intentionally out of scope per task-20. */}
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-gray-200 pb-3">
        <h2 className="text-lg font-semibold text-gray-900">Consultation</h2>
        <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
          Booked as: {MODALITY_META[bookedModality].bookedLabel}
        </span>
      </header>

      {/* Modality buttons row — 3-column grid that stacks on narrow screens. */}
      <div
        role="group"
        aria-label="Choose consultation modality"
        className="grid grid-cols-1 gap-3 sm:grid-cols-3"
      >
        {BUTTON_MODALITIES.map((m) => {
          const isPrimary = m === bookedModality;
          const meta = MODALITY_META[m];

          // Disable when:
          //  - secondary modality (always disabled in v1; Plan 09 enables)
          //  - primary video and the room is already started (no double-start)
          //  - primary video and not in a startable status (e.g. completed)
          const disabledReason = !isPrimary
            ? "Coming soon — modality switching ships in Plan 09"
            : m === "video" || m === "voice"
              ? liveSession
                ? "Consultation already started"
                : !canStartConsultation
                  ? appointment.status === "completed"
                    ? "Consultation already completed"
                    : appointment.status === "cancelled"
                      ? "Appointment cancelled"
                      : "Cannot start in this state"
                  : starting
                    ? "Starting…"
                    : null
              : null; // text primary: enabled, but click → "Coming soon"

          const isDisabled = disabledReason !== null;

          return (
            <button
              key={m}
              type="button"
              onClick={isPrimary ? () => handlePrimaryClick(m) : handleSecondaryClick}
              disabled={isDisabled}
              title={disabledReason ?? meta.label}
              aria-pressed={isPrimary && sessionLive}
              className={
                isPrimary
                  ? "flex items-center justify-center gap-2 rounded-md bg-green-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-green-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  : "flex items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              }
            >
              <span aria-hidden="true">{meta.icon}</span>
              <span>
                {isPrimary && (m === "video" || m === "voice") && starting
                  ? "Starting…"
                  : meta.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Transient announcements: start error + "Coming soon" notice. */}
      {startError && (
        <p role="alert" className="text-sm text-red-600">
          {startError}
        </p>
      )}
      {comingSoon && (
        <p
          role="status"
          aria-live="polite"
          className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
        >
          {comingSoon}
        </p>
      )}

      {/* Live panel — only mounted once a session exists. Empty state is the
          modality buttons row above; the panel is the post-Start surface. */}
      {sessionLive && liveSession && (
        <LiveConsultPanel
          appointment={appointment}
          token={token}
          modality={bookedModality}
          // Plan 05 · Task 24 — the voice branch pipes a real
          // `consultation_sessions.id` through (sourced from the
          // companion triplet on the `/start-voice` response). Video
          // still keys off the Twilio room SID in v1; Plan 01's facade
          // migration will unify the two.
          sessionId={bookedModality === "voice" ? sessionId : null}
          // Plan 09 · Task 54 — doctor-side mid-consult modality
          // switcher. Gated on `sessionId` presence because the
          // launcher's `GET /state` call is session-scoped; video
          // rejoin paths without a companion sessionId fall back to
          // the pre-Task-54 (no launcher) behaviour until Plan 01's
          // facade migration plumbs sessionId through video as well.
          modalitySwitchSlot={
            sessionId ? (
              <ModalityChangeLauncher
                sessionId={sessionId}
                token={token}
                userRole="doctor"
                patientDisplayName={appointment.patient_name ?? undefined}
              />
            ) : null
          }
          roomSlot={
            <div>
              {bookedModality === "voice" ? (
                <>
                  <h3 className="mb-3 text-base font-semibold text-gray-900">
                    Voice call
                  </h3>
                  {resendNotice && (
                    <p
                      role="status"
                      aria-live="polite"
                      className="mb-3 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800"
                    >
                      {resendNotice}
                    </p>
                  )}
                  <VoiceConsultRoom
                    accessToken={liveSession.doctorToken}
                    roomName={liveSession.roomName}
                    role="doctor"
                    onDisconnect={handleDisconnect}
                    onResendLink={handleResendLink}
                    /*
                     * Plan 05 · Task 24c — companion text channel is
                     * mandatory on the voice fresh-create path (Plan 06
                     * provisions it inside the session service). On
                     * the idempotent rejoin path the backend
                     * short-circuits before re-provisioning, so
                     * `companion` is undefined and `<VoiceConsultRoom>`
                     * falls back to its voice-only canvas.
                     */
                    companion={
                      liveSession.companion
                        ? { sessionId: liveSession.companion.sessionId }
                        : undefined
                    }
                    /*
                     * Plan 02 · Task 28 — opts into the pause/resume
                     * recording UI. `sessionId` is populated by both
                     * the fresh-create and `/token` rejoin paths
                     * (tracked in local state above); `token` is the
                     * doctor's Supabase JWT. Together they satisfy
                     * `<VoiceConsultRoom>`'s `recordingSessionId` +
                     * `recordingToken` opt-in.
                     */
                    recordingSessionId={sessionId ?? undefined}
                    recordingToken={token}
                  />
                </>
              ) : (
                <>
                  <h3 className="mb-3 text-base font-semibold text-gray-900">
                    Video call
                  </h3>
                  <VideoRoom
                    accessToken={liveSession.doctorToken}
                    roomName={liveSession.roomName}
                    onDisconnect={handleDisconnect}
                    role="doctor"
                    /*
                     * Plan 06 · Task 38 — thread the companion text channel
                     * into `<VideoRoom>` so it mounts the always-on chat
                     * side panel (desktop) / tab switcher (mobile).
                     *
                     * Undefined on the idempotent rejoin path (see
                     * `LiveSession.companion` doc for why) → `<VideoRoom>`
                     * falls back to the legacy single-pane video layout.
                     */
                    companion={
                      liveSession.companion
                        ? {
                            sessionId: liveSession.companion.sessionId,
                            patientToken: liveSession.companion.patientToken ?? undefined,
                          }
                        : undefined
                    }
                    /*
                     * Plan 02 · Task 28 — opts into the pause/resume
                     * recording UI. `sessionId` is the
                     * `consultation_sessions.id`; `token` is the
                     * doctor's Supabase JWT. Patient-side videos go
                     * through the patient page and pass their own
                     * `recordingSessionId` + `recordingToken`.
                     */
                    recordingSessionId={sessionId ?? undefined}
                    recordingToken={token}
                  />
                </>
              )}
              <div className="mt-4">
                <h3 className="mb-2 text-base font-semibold text-gray-900">
                  Patient join link
                </h3>
                <PatientJoinLink patientJoinUrl={liveSession.patientJoinUrl} />
              </div>
            </div>
          }
        />
      )}
    </section>
  );
}
