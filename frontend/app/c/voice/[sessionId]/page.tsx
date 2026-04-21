"use client";

/**
 * Patient-facing voice consultation route (Plan 05 · Task 24).
 *
 * URL shape: `/c/voice/[sessionId]?t=<HMAC-consultation-token>`
 *
 * Flow:
 *   1. Read `sessionId` + `?t=` from the URL.
 *   2. Exchange the HMAC for a Twilio access token via
 *      `POST /api/v1/consultation/:sessionId/voice-token`.
 *   3. Strip `?t=` from the URL (same hygiene as `/c/text/*`).
 *   4. If `sessionStatus === 'scheduled'` → holding screen, poll every
 *      30s for the flip to `'live'`.
 *   5. If `sessionStatus === 'live'` → run the **microphone permission
 *      prelude** (see note below), then mount `<VoiceConsultRoom>`.
 *   6. If `sessionStatus in ('ended', 'cancelled', 'no_show')` → end
 *      notice. Plan 07 will surface a transcript/recording link here.
 *
 * **Mic prelude (Principle 8 LOCKED):** before the Twilio connection
 * we explicitly call `navigator.mediaDevices.getUserMedia({ audio:
 * true })` and surface an inline "We need your microphone to run the
 * audio consultation" screen. Doing this early avoids the
 * Twilio-triggered prompt materializing inside the room (which looks
 * jarring) and lets us give the patient a friendly copy block before
 * any connection attempt.
 *
 * **Token doubles for companion chat:** the HMAC the patient lands
 * with is derived from `appointmentId` — so it's also valid for the
 * companion text channel. We call the text-token exchange in the
 * background to obtain a Supabase JWT + `currentUserId`, which are
 * threaded into `<VoiceConsultRoom companion={...}>`. If that exchange
 * fails the voice call still runs, just without the side-chat.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import {
  requestVoiceSessionToken,
  requestTextSessionToken,
  type VoiceConsultTokenExchangeData,
  type TextConsultSessionStatus,
  type TextConsultTokenExchangeData,
} from "@/lib/api";
import VoiceConsultRoom from "@/components/consultation/VoiceConsultRoom";

const SCHEDULED_POLL_MS = 30_000;

type MicStatus = "idle" | "requesting" | "granted" | "denied";

type Phase = "loading" | "error" | "holding" | "mic_prelude" | "live" | "ended";

interface PageState {
  phase: Phase;
  errorMessage?: string;
  voice?: VoiceConsultTokenExchangeData;
  companion?: TextConsultTokenExchangeData;
}

function endStateMessage(status: TextConsultSessionStatus): string {
  switch (status) {
    case "ended":
      return "This consult has ended. Your doctor will share next steps with you separately.";
    case "cancelled":
      return "This consult was cancelled. Please contact the clinic to reschedule.";
    case "no_show":
      return "This consult was marked as a no-show. Please contact the clinic to reschedule.";
    default:
      return "This consult is no longer active.";
  }
}

function formatScheduledTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString([], {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function PatientVoiceConsultPage() {
  const params = useParams<{ sessionId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();

  const sessionId = (params?.sessionId ?? "").toString();
  const initialUrlToken = searchParams?.get("t") ?? "";
  const urlTokenRef = useRef<string>(initialUrlToken);

  const [state, setState] = useState<PageState>({ phase: "loading" });
  const [micStatus, setMicStatus] = useState<MicStatus>("idle");
  const [micError, setMicError] = useState<string | null>(null);

  const exchangeVoice = useCallback(async (): Promise<VoiceConsultTokenExchangeData | null> => {
    const token = urlTokenRef.current;
    if (!sessionId || !token) {
      setState({
        phase: "error",
        errorMessage:
          "This link is invalid or expired. Please ask your doctor to send a new one.",
      });
      return null;
    }
    try {
      const res = await requestVoiceSessionToken(sessionId, token);
      return res.data;
    } catch (err) {
      const status = (err as { status?: number }).status;
      const message =
        status === 401
          ? "This link is invalid or expired. Please ask your doctor to send a new one."
          : status === 404
            ? "We couldn’t find this consult. Please ask your doctor to send a new link."
            : "Something went wrong opening the consult. Please try again in a moment.";
      setState({ phase: "error", errorMessage: message });
      return null;
    }
  }, [sessionId]);

  // Best-effort companion text-token exchange. Failures here never
  // block the voice call — the `<VoiceConsultRoom>` gracefully
  // renders a voice-only canvas when `companion` is undefined.
  const exchangeCompanion = useCallback(async (): Promise<TextConsultTokenExchangeData | null> => {
    const token = urlTokenRef.current;
    if (!sessionId || !token) return null;
    try {
      const res = await requestTextSessionToken(sessionId, token);
      return res.data;
    } catch {
      return null;
    }
  }, [sessionId]);

  // Mount: do the exchanges + strip the token from the URL.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [voice, companion] = await Promise.all([
        exchangeVoice(),
        exchangeCompanion(),
      ]);
      if (cancelled || !voice) return;

      try {
        router.replace(`/c/voice/${sessionId}`);
      } catch {
        // best-effort
      }

      if (voice.sessionStatus === "live") {
        setState({ phase: "mic_prelude", voice, companion: companion ?? undefined });
      } else if (voice.sessionStatus === "scheduled") {
        setState({ phase: "holding", voice, companion: companion ?? undefined });
      } else {
        setState({ phase: "ended", voice });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // Holding-screen poll.
  useEffect(() => {
    if (state.phase !== "holding") return;
    const interval = setInterval(() => {
      void (async () => {
        const voice = await exchangeVoice();
        if (!voice) return;
        if (voice.sessionStatus === "live") {
          const companion = await exchangeCompanion();
          setState({ phase: "mic_prelude", voice, companion: companion ?? undefined });
        } else if (voice.sessionStatus !== "scheduled") {
          setState({ phase: "ended", voice });
        } else {
          setState((prev) => ({ ...prev, voice, phase: "holding" }));
        }
      })();
    }, SCHEDULED_POLL_MS);
    return () => clearInterval(interval);
  }, [state.phase, exchangeVoice, exchangeCompanion]);

  const handleRequestMic = useCallback(async () => {
    setMicStatus("requesting");
    setMicError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Immediately stop the prelude tracks — Twilio will acquire
      // fresh ones on `connect()`. We only wanted the permission
      // grant, not a long-lived mic capture.
      stream.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {
          /* noop */
        }
      });
      setMicStatus("granted");
      setState((prev) =>
        prev.phase === "mic_prelude" && prev.voice
          ? { ...prev, phase: "live" }
          : prev,
      );
    } catch (err) {
      setMicStatus("denied");
      setMicError(
        err instanceof Error
          ? err.message
          : "Microphone permission was denied.",
      );
    }
  }, []);

  const handlePatientTokenRefresh = useCallback(async (): Promise<string> => {
    const data = await exchangeCompanion();
    if (!data || !data.token) {
      throw new Error("Unable to refresh companion chat token");
    }
    setState((prev) =>
      prev.phase === "live" && prev.voice
        ? { ...prev, companion: data }
        : prev,
    );
    return data.token;
  }, [exchangeCompanion]);

  const handleDisconnect = useCallback(() => {
    setState((prev) =>
      prev.voice
        ? { phase: "ended", voice: { ...prev.voice, sessionStatus: "ended" } }
        : prev,
    );
  }, []);

  // --------------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------------

  if (state.phase === "loading") {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-gray-50 px-4">
        <p className="text-sm text-gray-600">Opening your consult…</p>
      </main>
    );
  }

  if (state.phase === "error") {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-gray-50 px-4">
        <div className="max-w-sm rounded-lg border border-red-200 bg-white p-6 text-center shadow-sm">
          <h1 className="text-base font-semibold text-gray-900">
            Can’t open this consult
          </h1>
          <p className="mt-2 text-sm text-gray-600">{state.errorMessage}</p>
        </div>
      </main>
    );
  }

  if (state.phase === "holding" && state.voice) {
    const startTimeLabel = formatScheduledTime(state.voice.scheduledStartAt);
    const practice = state.voice.practiceName?.trim();
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-gray-50 px-4">
        <div className="max-w-sm rounded-lg border border-gray-200 bg-white p-6 text-center shadow-sm">
          <p className="text-xs uppercase tracking-wide text-gray-500">
            {practice ? practice : "Your consult"}
          </p>
          <h1 className="mt-1 text-base font-semibold text-gray-900">
            Your voice consult starts at {startTimeLabel}
          </h1>
          <p className="mt-3 text-sm text-gray-600">
            We’ll open the audio call as soon as the doctor begins the session.
            You can keep this page open.
          </p>
          <p className="mt-4 inline-flex items-center gap-2 text-xs text-gray-500">
            <span
              className="inline-block h-2 w-2 animate-pulse rounded-full bg-amber-500"
              aria-hidden
            />
            Waiting for the doctor…
          </p>
        </div>
      </main>
    );
  }

  if (state.phase === "ended" && state.voice) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-gray-50 px-4">
        <div className="max-w-sm rounded-lg border border-gray-200 bg-white p-6 text-center shadow-sm">
          <h1 className="text-base font-semibold text-gray-900">
            Consult complete
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            {endStateMessage(state.voice.sessionStatus)}
          </p>
          <p className="mt-3 text-xs text-gray-400">
            Recording / transcript view coming soon.
          </p>
        </div>
      </main>
    );
  }

  if (state.phase === "mic_prelude" && state.voice) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-gray-50 px-4">
        <div className="max-w-sm rounded-lg border border-gray-200 bg-white p-6 text-center shadow-sm">
          <h1 className="text-base font-semibold text-gray-900">
            Enable your microphone
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            This is an <strong>audio-only web call</strong> — no phone number
            is dialed, and your camera stays off. We just need your microphone.
          </p>
          <button
            type="button"
            onClick={handleRequestMic}
            disabled={micStatus === "requesting"}
            className="mt-4 inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-60"
          >
            {micStatus === "requesting"
              ? "Requesting…"
              : "Allow microphone"}
          </button>
          {micStatus === "denied" ? (
            <p
              role="alert"
              className="mt-3 text-xs text-red-600"
              aria-live="polite"
            >
              {micError ??
                "Microphone access was blocked. Open your browser's site settings to allow the microphone, then reload this page."}
            </p>
          ) : null}
          <p className="mt-4 text-[11px] text-gray-400">
            We never record video. Your audio may be recorded for quality &
            clinical notes only if you consented at booking.
          </p>
        </div>
      </main>
    );
  }

  if (state.phase === "live" && state.voice && state.voice.token) {
    const companionProp = state.companion?.token && state.companion?.currentUserId
      ? {
          sessionId,
          patientAccessToken: state.companion.token,
          patientCurrentUserId: state.companion.currentUserId,
          onPatientTokenRefresh: handlePatientTokenRefresh,
        }
      : undefined;

    return (
      <main className="min-h-[100dvh] bg-gray-50 p-3 sm:p-6">
        <div className="mx-auto max-w-3xl">
          <VoiceConsultRoom
            accessToken={state.voice.token}
            roomName={state.voice.roomName}
            role="patient"
            companion={companionProp}
            onDisconnect={handleDisconnect}
            /*
             * Plan 02 · Task 28 — patient-side mount of the
             * `<RecordingPausedIndicator>` banner. We reuse the
             * companion Supabase JWT (minted by `/text-token`) as
             * the recording-API auth token since `authenticateToken`
             * accepts any valid Supabase session. `<RecordingControls>`
             * renders nothing for `role === 'patient'` — the hook
             * just listens to system messages + the initial
             * `GET /recording/state` snapshot.
             */
            recordingSessionId={state.companion?.token ? sessionId : undefined}
            recordingToken={state.companion?.token ?? undefined}
          />
        </div>
      </main>
    );
  }

  return null;
}
