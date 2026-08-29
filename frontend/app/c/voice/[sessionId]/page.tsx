"use client";

/**
 * Patient-facing voice consultation route (Plan 05 · Task 24).
 *
 * URL shape: `/c/voice/[sessionId]?t=<HMAC-consultation-token>`
 *
 * Flow (task-voice-A6 + crc-12):
 *   1. Read `sessionId` + `?t=` from the URL.
 *   2. Probe session status via text-token (no Twilio).
 *      `scheduled` → holding lobby with `<VoiceConsultPreCall>`.
 *      Completing the check does not mint a voice token (CRC-D1).
 *      `live` → late-opener `<VoiceConsultPreLobby>` gate.
 *   3. On live (Join / Skip, or auto-connect from holding) → `connecting`
 *      — exchange HMAC for Twilio token + companion JWT; strip `?t=`.
 *   4. `live` → `<VoiceConsultRoom>`.
 *   5. Terminal statuses → end notice.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import {
  getOpdSessionSnapshot,
  postLobbyHeartbeat,
  requestVoiceSessionToken,
  requestTextSessionToken,
  type VoiceConsultTokenExchangeData,
  type TextConsultSessionStatus,
  type TextConsultTokenExchangeData,
} from "@/lib/api";
import VoiceConsultRoom from "@/components/consultation/VoiceConsultRoom";
import VoiceConsultPreLobby from "@/components/consultation/VoiceConsultPreLobby";
import LobbyWaitContext from "@/components/consultation/LobbyWaitContext";
import { resolveClinicBranding } from "@/lib/clinic/branding";
import { lobbyPresenceChannelEnabled } from "@/lib/consultation/lobby-reconnect";
import { useLobbyPresenceChannel } from "@/hooks/useLobbyPresenceChannel";
import {
  LobbyReconnectNotice,
  useLobbyReconnect,
} from "@/hooks/useLobbyReconnect";
import {
  shouldMintVoiceTwilio,
  shouldSkipVoicePrecallGate,
  voicePhaseFromSessionStatus,
} from "@/lib/consultation/voice-lobby-precall";
import type { PatientOpdSnapshot } from "@/types/opd-session";
import {
  buildVoiceRejoinCache,
  useVoiceRejoinCache,
  type VoiceRejoinCache,
} from "@/hooks/useVoiceRejoinCache";

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

function voiceStubFromText(
  data: TextConsultTokenExchangeData
): VoiceConsultTokenExchangeData {
  return {
    token: null,
    roomName: "",
    expiresAt: null,
    sessionStatus: data.sessionStatus,
    scheduledStartAt: data.scheduledStartAt,
    expectedEndAt: data.expectedEndAt,
    practiceName: data.practiceName,
  };
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
  const [lobbyCheckDone, setLobbyCheckDone] = useState(false);
  const [lobbySnapshot, setLobbySnapshot] = useState<PatientOpdSnapshot | null>(
    null
  );
  const arrivedViaLobbyRef = useRef(false);
  const connectingRef = useRef(false);

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
    []
  );

  const writeRejoinCache = useCallback(
    (
      voice: VoiceConsultTokenExchangeData,
      companion: CompanionState | null
    ) => {
      if (!voice.token) return;
      const snapshot = buildVoiceRejoinCache({
        sessionId,
        role: "patient",
        twilioAccessToken: voice.token,
        roomName: voice.roomName,
        hmacToken: urlTokenRef.current || undefined,
        supabaseJwt:
          companion?.status === "ok"
            ? (companion.data.token ?? undefined)
            : undefined,
        companionCurrentUserId:
          companion?.status === "ok" ? companion.data.currentUserId : undefined,
        sessionStatus: voice.sessionStatus,
      });
      if (snapshot) rejoinCache.write(snapshot);
    },
    [rejoinCache, sessionId]
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

    let cancelled = false;
    void (async () => {
      try {
        const res = await requestTextSessionToken(
          sessionId,
          urlTokenRef.current
        );
        if (cancelled) return;
        setPrecallLobby({
          practiceName: res.data.practiceName,
          scheduledStartAt: res.data.scheduledStartAt,
        });
        const entry = voicePhaseFromSessionStatus(res.data.sessionStatus);
        if (entry === "holding") {
          arrivedViaLobbyRef.current = true;
          setState({
            phase: "holding",
            voice: voiceStubFromText(res.data),
          });
        } else if (entry === "precall") {
          setState({ phase: "precall" });
        } else {
          setState({
            phase: "ended",
            voice: voiceStubFromText(res.data),
          });
        }
      } catch {
        if (!cancelled) setState({ phase: "precall" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, rejoinCache, restoreFromRejoinCache]);

  const exchangeVoice =
    useCallback(async (): Promise<VoiceConsultTokenExchangeData | null> => {
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

  const exchangeCompanion =
    useCallback(async (): Promise<CompanionState | null> => {
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
    (
      voice: VoiceConsultTokenExchangeData,
      companion: CompanionState | null
    ) => {
      if (voice.sessionStatus === "live") {
        setState({
          phase: "in-call",
          voice,
          companion: companion ?? undefined,
        });
      } else if (voice.sessionStatus === "scheduled") {
        connectingRef.current = false;
        arrivedViaLobbyRef.current = true;
        setState({
          phase: "holding",
          voice,
          companion: companion ?? undefined,
        });
      } else {
        connectingRef.current = false;
        setState({ phase: "ended", voice });
      }
    },
    []
  );

  const proceedToCall = useCallback(() => {
    if (connectingRef.current) return;
    connectingRef.current = true;
    setState({ phase: "connecting" });
    void (async () => {
      const [voice, companion] = await Promise.all([
        exchangeVoice(),
        exchangeCompanion(),
      ]);
      if (!voice) {
        connectingRef.current = false;
        return;
      }

      writeRejoinCache(voice, companion);

      try {
        router.replace(`/c/voice/${sessionId}`);
      } catch {
        /* best-effort URL hygiene */
      }

      routeAfterExchange(voice, companion);
    })();
  }, [
    exchangeVoice,
    exchangeCompanion,
    router,
    sessionId,
    routeAfterExchange,
    writeRejoinCache,
  ]);

  const phaseRef = useRef(state.phase);
  phaseRef.current = state.phase;

  // crc-17 — heartbeat always; holding poll piggybacks so recovery
  // pulls the patient in if the doctor started while they were offline.
  // Does not touch lobbyCheckDone.
  const lobbyTick = useCallback(async () => {
    const tok = urlTokenRef.current.trim();
    if (!tok) throw new Error("missing_token");
    await postLobbyHeartbeat(tok);
    if (phaseRef.current !== "holding") return;
    try {
      const snap = await getOpdSessionSnapshot(tok);
      setLobbySnapshot(snap.data.snapshot);
    } catch {
      /* snapshot is advisory */
    }
    const companion = await exchangeCompanion();
    if (!companion || companion.status !== "ok") return;
    const status = companion.data.sessionStatus;
    if (shouldMintVoiceTwilio(status)) {
      if (
        shouldSkipVoicePrecallGate({
          arrivedViaLobby: arrivedViaLobbyRef.current,
        })
      ) {
        proceedToCall();
      } else {
        setState({ phase: "precall" });
      }
      return;
    }
    if (status !== "scheduled") {
      setState({
        phase: "ended",
        voice: voiceStubFromText(companion.data),
      });
      return;
    }
    setPrecallLobby({
      practiceName: companion.data.practiceName,
      scheduledStartAt: companion.data.scheduledStartAt,
    });
    setState((prev) => ({
      ...prev,
      phase: "holding",
      voice: voiceStubFromText(companion.data),
    }));
  }, [exchangeCompanion, proceedToCall]);

  const inVoiceLobby = state.phase === "precall" || state.phase === "holding";
  const { reconnecting, isOnline } = useLobbyReconnect({
    enabled: inVoiceLobby,
    onTick: lobbyTick,
  });

  useLobbyPresenceChannel({
    consultationToken: urlTokenRef.current,
    enabled: lobbyPresenceChannelEnabled(inVoiceLobby, isOnline),
  });

  const handlePatientTokenRefresh = useCallback(async (): Promise<string> => {
    const result = await exchangeCompanion();
    if (!result || result.status !== "ok" || !result.data.token) {
      throw new Error("Unable to refresh companion chat token");
    }
    setState((prev) =>
      prev.phase === "in-call" && prev.voice
        ? { ...prev, companion: result }
        : prev
    );
    return result.data.token;
  }, [exchangeCompanion]);

  const handleCompanionRetry = useCallback(async (): Promise<void> => {
    const result = await exchangeCompanion();
    if (!result) return;
    setState((prev) =>
      prev.voice && prev.phase === "in-call"
        ? { ...prev, companion: result }
        : prev
    );
  }, [exchangeCompanion]);

  const handleDisconnect = useCallback(() => {
    rejoinCache.clear();
    setState((prev) =>
      prev.voice
        ? { phase: "ended", voice: { ...prev.voice, sessionStatus: "ended" } }
        : prev
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
      <>
        <LobbyReconnectNotice show={reconnecting} />
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
      </>
    );
  }

  if (state.phase === "holding") {
    const branding = resolveClinicBranding({
      practiceName: state.voice?.practiceName ?? precallLobby?.practiceName,
    });
    return (
      <>
        <LobbyReconnectNotice show={reconnecting} />
        <main className="flex min-h-[100dvh] items-center justify-center bg-gray-50 px-4 py-8">
          <VoiceConsultPreLobby
            role="patient"
            branding={branding}
            scheduledStartAt={
              state.voice?.scheduledStartAt ?? precallLobby?.scheduledStartAt
            }
            counterpartyLabel="your doctor"
            holdingMode
            deviceCheckDone={lobbyCheckDone}
            contextSlot={<LobbyWaitContext snapshot={lobbySnapshot} />}
            onJoin={() => setLobbyCheckDone(true)}
            onSkip={() => setLobbyCheckDone(true)}
          />
        </main>
      </>
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
