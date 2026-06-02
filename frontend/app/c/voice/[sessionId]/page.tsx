"use client";

/**
 * Patient-facing voice consultation route (Plan 05 · Task 24).
 *
 * URL shape: `/c/voice/[sessionId]?t=<HMAC-consultation-token>`
 *
 * Flow (task-voice-A6):
 *   1. Read `sessionId` + `?t=` from the URL.
 *   2. `precall` — `<VoiceConsultPreCall>` (mic + speaker check; no tokens).
 *   3. On Join / Skip → `connecting` — exchange HMAC for Twilio token +
 *      companion JWT; strip `?t=` from the URL.
 *   4. `scheduled` → holding screen, poll every 30s for `live`.
 *   5. `live` → `<VoiceConsultRoom>`.
 *   6. Terminal statuses → end notice.
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
import { formatDateTime } from "@/lib/format-date";
import VoiceConsultRoom from "@/components/consultation/VoiceConsultRoom";
import VoiceConsultPreLobby from "@/components/consultation/VoiceConsultPreLobby";
import { resolveClinicBranding } from "@/lib/clinic/branding";
import {
  buildVoiceRejoinCache,
  useVoiceRejoinCache,
  type VoiceRejoinCache,
} from "@/hooks/useVoiceRejoinCache";

const SCHEDULED_POLL_MS = 30_000;

type Phase =
  | "init"
  | "precall"
  | "connecting"
  | "error"
  | "holding"
  | "in-call"
  | "ended";

type CompanionState =
  | { status: "ok"; data: TextConsultTokenExchangeData }
  | {
      status: "unavailable";
      error: { message: string; statusCode?: number };
    };

interface PageState {
  phase: Phase;
  errorMessage?: string;
  voice?: VoiceConsultTokenExchangeData;
  companion?: CompanionState;
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
  return formatDateTime(iso, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function PatientVoiceConsultPage() {
  const params = useParams<{ sessionId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();

  const sessionId = (params?.sessionId ?? "").toString();
  const initialUrlToken = searchParams?.get("t") ?? "";
  const urlTokenRef = useRef<string>(initialUrlToken);

  const [state, setState] = useState<PageState>({ phase: "init" });
  const [rejoinedFromCache, setRejoinedFromCache] = useState(false);
  const rejoinCache = useVoiceRejoinCache(sessionId);

  /** Lobby metadata for precall (practice + schedule); no Twilio token used here. */
  const [precallLobby, setPrecallLobby] = useState<{
    practiceName?: string;
    scheduledStartAt?: string;
  } | null>(null);

  const lastLoggedFailureRef = useRef<string | null>(null);

  const restoreFromRejoinCache = useCallback(
    (cached: VoiceRejoinCache): boolean => {
      if (!cached.twilioAccessToken || !cached.roomName) return false;

      if (cached.hmacToken) {
        urlTokenRef.current = cached.hmacToken;
      }

      const voice: VoiceConsultTokenExchangeData = {
        token: cached.twilioAccessToken,
        roomName: cached.roomName,
        expiresAt: null,
        sessionStatus: cached.sessionStatus ?? "live",
        scheduledStartAt: "",
        expectedEndAt: "",
      };

      let companion: CompanionState | undefined;
      if (cached.supabaseJwt && cached.companionCurrentUserId) {
        companion = {
          status: "ok",
          data: {
            token: cached.supabaseJwt,
            expiresAt: null,
            currentUserId: cached.companionCurrentUserId,
            sessionStatus: cached.sessionStatus ?? "live",
            scheduledStartAt: "",
            expectedEndAt: "",
          },
        };
      } else {
        companion = {
          status: "unavailable",
          error: { message: "Companion data not cached on rejoin" },
        };
      }

      setRejoinedFromCache(true);
      if (voice.sessionStatus === "live") {
        setState({ phase: "in-call", voice, companion });
      } else if (voice.sessionStatus === "scheduled") {
        setState({ phase: "holding", voice, companion });
      } else {
        setState({ phase: "ended", voice });
      }
      return true;
    },
    [],
  );

  const writeRejoinCache = useCallback(
    (
      voice: VoiceConsultTokenExchangeData,
      companion: CompanionState | null,
    ) => {
      if (!voice.token) return;
      const snapshot = buildVoiceRejoinCache({
        sessionId,
        role: "patient",
        twilioAccessToken: voice.token,
        roomName: voice.roomName,
        hmacToken: urlTokenRef.current || undefined,
        supabaseJwt:
          companion?.status === "ok" ? companion.data.token ?? undefined : undefined,
        companionCurrentUserId:
          companion?.status === "ok"
            ? companion.data.currentUserId
            : undefined,
        sessionStatus: voice.sessionStatus,
      });
      if (snapshot) rejoinCache.write(snapshot);
    },
    [rejoinCache, sessionId],
  );

  useEffect(() => {
    if (!sessionId) {
      setState({
        phase: "error",
        errorMessage:
          "This link is invalid or expired. Please ask your doctor to send a new one.",
      });
      return;
    }

    const cached = rejoinCache.tryAutoRejoin();
    if (cached && restoreFromRejoinCache(cached)) {
      return;
    }

    if (!urlTokenRef.current) {
      setState({
        phase: "error",
        errorMessage:
          "This link is invalid or expired. Please ask your doctor to send a new one.",
      });
      return;
    }
    setState({ phase: "precall" });
  }, [sessionId, rejoinCache, restoreFromRejoinCache]);

  // task-voice-B2 — lobby branding + countdown need schedule metadata without
  // entering the in-call path. Text-token exchange returns the same fields as
  // the companion channel (practiceName, scheduledStartAt) and matches the
  // video join-page pattern; voice Twilio tokens are still minted only on Join.
  useEffect(() => {
    if (state.phase !== "precall" || !sessionId || !urlTokenRef.current) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await requestTextSessionToken(sessionId, urlTokenRef.current);
        if (cancelled) return;
        setPrecallLobby({
          practiceName: res.data.practiceName,
          scheduledStartAt: res.data.scheduledStartAt,
        });
      } catch {
        if (!cancelled) setPrecallLobby(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [state.phase, sessionId]);

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

  const exchangeCompanion = useCallback(async (): Promise<CompanionState | null> => {
    const token = urlTokenRef.current;
    if (!sessionId || !token) return null;
    try {
      const res = await requestTextSessionToken(sessionId, token);
      lastLoggedFailureRef.current = null;
      return { status: "ok", data: res.data };
    } catch (err) {
      const statusCode = (err as { status?: number }).status;
      const message = err instanceof Error ? err.message : "Unknown error";
      const signature = `${statusCode ?? "noStatus"}:${message}`;
      if (lastLoggedFailureRef.current !== signature) {
        lastLoggedFailureRef.current = signature;
        // eslint-disable-next-line no-console
        console.warn("[companion] exchange failed", { statusCode, message });
      }
      return { status: "unavailable", error: { message, statusCode } };
    }
  }, [sessionId]);

  const routeAfterExchange = useCallback(
    (voice: VoiceConsultTokenExchangeData, companion: CompanionState | null) => {
      if (voice.sessionStatus === "live") {
        setState({ phase: "in-call", voice, companion: companion ?? undefined });
      } else if (voice.sessionStatus === "scheduled") {
        setState({ phase: "holding", voice, companion: companion ?? undefined });
      } else {
        setState({ phase: "ended", voice });
      }
    },
    [],
  );

  const proceedToCall = useCallback(() => {
    setState({ phase: "connecting" });
    void (async () => {
      const [voice, companion] = await Promise.all([
        exchangeVoice(),
        exchangeCompanion(),
      ]);
      if (!voice) return;

      writeRejoinCache(voice, companion);

      try {
        router.replace(`/c/voice/${sessionId}`);
      } catch {
        /* best-effort URL hygiene */
      }

      routeAfterExchange(voice, companion);
    })();
  }, [exchangeVoice, exchangeCompanion, router, sessionId, routeAfterExchange, writeRejoinCache]);

  useEffect(() => {
    if (state.phase !== "holding") return;
    const interval = setInterval(() => {
      void (async () => {
        const voice = await exchangeVoice();
        if (!voice) return;
        if (voice.sessionStatus === "live") {
          const companion = await exchangeCompanion();
          setState({ phase: "in-call", voice, companion: companion ?? undefined });
        } else if (voice.sessionStatus !== "scheduled") {
          setState({ phase: "ended", voice });
        } else {
          setState((prev) => ({ ...prev, voice, phase: "holding" }));
        }
      })();
    }, SCHEDULED_POLL_MS);
    return () => clearInterval(interval);
  }, [state.phase, exchangeVoice, exchangeCompanion]);

  const handlePatientTokenRefresh = useCallback(async (): Promise<string> => {
    const result = await exchangeCompanion();
    if (!result || result.status !== "ok" || !result.data.token) {
      throw new Error("Unable to refresh companion chat token");
    }
    setState((prev) =>
      prev.phase === "in-call" && prev.voice
        ? { ...prev, companion: result }
        : prev,
    );
    return result.data.token;
  }, [exchangeCompanion]);

  const handleCompanionRetry = useCallback(async (): Promise<void> => {
    const result = await exchangeCompanion();
    if (!result) return;
    setState((prev) =>
      prev.voice && prev.phase === "in-call"
        ? { ...prev, companion: result }
        : prev,
    );
  }, [exchangeCompanion]);

  const handleDisconnect = useCallback(() => {
    rejoinCache.clear();
    setState((prev) =>
      prev.voice
        ? { phase: "ended", voice: { ...prev.voice, sessionStatus: "ended" } }
        : prev,
    );
  }, [rejoinCache]);

  if (state.phase === "init" || state.phase === "connecting") {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-gray-50 px-4">
        <p className="text-sm text-gray-600">
          {state.phase === "connecting"
            ? "Connecting to your consult…"
            : "Loading…"}
        </p>
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

  if (state.phase === "precall") {
    const branding = resolveClinicBranding({
      practiceName: precallLobby?.practiceName,
    });
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-gray-50 px-4 py-8">
        <VoiceConsultPreLobby
          role="patient"
          branding={branding}
          scheduledStartAt={precallLobby?.scheduledStartAt}
          counterpartyLabel="your doctor"
          onJoin={proceedToCall}
          onSkip={proceedToCall}
        />
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

  if (state.phase === "in-call" && state.voice?.token) {
    const companionProp =
      state.companion?.status === "ok" &&
      state.companion.data.token &&
      state.companion.data.currentUserId
        ? {
            sessionId,
            patientAccessToken: state.companion.data.token,
            patientCurrentUserId: state.companion.data.currentUserId,
            onPatientTokenRefresh: handlePatientTokenRefresh,
            onCompanionRetry: handleCompanionRetry,
          }
        : state.companion?.status === "unavailable"
          ? {
              sessionId,
              onCompanionRetry: handleCompanionRetry,
            }
          : undefined;

    const recordingToken =
      state.companion?.status === "ok" && state.companion.data.token
        ? state.companion.data.token
        : undefined;

    return (
      <main className="min-h-[100dvh] bg-gray-50 p-3 sm:p-6">
        <div className="mx-auto max-w-3xl">
          <VoiceConsultRoom
            accessToken={state.voice.token}
            roomName={state.voice.roomName}
            role="patient"
            practiceName={state.voice.practiceName}
            companion={companionProp}
            onDisconnect={handleDisconnect}
            recordingSessionId={recordingToken ? sessionId : undefined}
            recordingToken={recordingToken}
            rejoined={rejoinedFromCache}
          />
        </div>
      </main>
    );
  }

  return null;
}
