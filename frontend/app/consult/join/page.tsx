"use client";

/**
 * Patient join page for video consultations.
 *
 * URL shape: `/consult/join?token=<HMAC-consultation-token>`
 *
 * Flow (post voice-0B):
 *   1. Read `?token=` (HMAC) from the URL.
 *   2. If the doctor has not started, show the **lobby** (crc-04 / crc-10):
 *      device check + heartbeat + poll. Completing the check does not
 *      create a Twilio room. When the doctor starts, a patient who was
 *      already in the lobby auto-connects (skips a second Continue).
 *      Late openers still get the post-Start pre-call gate.
 *   3. In parallel with Step 2 settling, exchange the same HMAC for a
 *      Supabase JWT for the **companion chat** via
 *      `POST /api/v1/consultation/:sessionId/text-token`. Failure here
 *      MUST NOT block the video call — the page mounts `<VideoRoom>`
 *      with `companion={{ sessionId }}` so the room renders the inline
 *      "Chat unavailable" tile (graceful degrade — Plan 06 Decision 9 /
 *      voice-0B).
 *   4. Mount `<VideoRoom>` with the Twilio token, companion creds (when
 *      both succeeded), and recording-token wiring (Plan 02 Task 28
 *      parity with the voice page).
 *
 * Public; no auth. The HMAC IS the proof of authority.
 *
 * @see e-task-7 — original Twilio video patient join.
 * @see docs/Work/Daily-plans/April 2026/28-04-2026/Tasks/task-voice-0B-patient-video-companion-wiring.md
 */

import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import {
  getConsultationTokenForPatient,
  getOpdSessionSnapshot,
  postLobbyHeartbeat,
  requestTextSessionToken,
  type GetConsultationTokenData,
  type TextConsultTokenExchangeData,
} from "@/lib/api";
import type { PatientOpdSnapshot } from "@/types/opd-session";
import VideoRoom from "@/components/consultation/VideoRoom";
import VideoConsultPreCall from "@/components/consultation/VideoConsultPreCall";
import VideoConsultLobbyHeader from "@/components/consultation/VideoConsultLobbyHeader";
import VideoConsultLobbyCountdown from "@/components/consultation/VideoConsultLobbyCountdown";
import CellularDataWarning from "@/components/consultation/CellularDataWarning";
import PatientVideoWaitingRoom from "@/components/consultation/PatientVideoWaitingRoom";
import { shouldSkipVideoPrecallGate } from "@/lib/consultation/video-lobby-precall";
import { requestPatientPhoneFullscreen } from "@/lib/call/patient-mobile-chrome";
import { lobbyPresenceChannelEnabled } from "@/lib/consultation/lobby-reconnect";
import { useLobbyPresenceChannel } from "@/hooks/useLobbyPresenceChannel";
import {
  LobbyReconnectNotice,
  useLobbyReconnect,
} from "@/hooks/useLobbyReconnect";
import {
  findLatestRejoinCandidate,
  decodeJwtExp,
  computeMinExpiryEpochMs,
  useCallRejoinCache,
  type CallRejoinSnapshot,
} from "@/hooks/useCallRejoinCache";
import {
  formatAppointmentTimeEnGB,
  resolveClinicBranding,
} from "@/lib/clinic/branding";

interface VideoData {
  accessToken: string;
  roomName: string;
  /**
   * `consultation_sessions.id`. Optional in the API type (deploy-window
   * defensive typing) but required in practice for companion-chat
   * mounting; if missing we silently degrade to video-only with no
   * companion chat at all (rather than crashing).
   */
  sessionId?: string;
}

/**
 * voice-0C — companion exchange outcome on the video page.
 *
 * Tri-state instead of `TextConsultTokenExchangeData | null` so the
 * room knows the difference between "haven't tried yet" and "tried
 * and failed". `unavailable` triggers the inline "Chat unavailable"
 * tile + retry button inside `<VideoRoom>`.
 */
type CompanionState =
  | { status: "ok"; data: TextConsultTokenExchangeData }
  | {
      status: "unavailable";
      error: { message: string; statusCode?: number };
    };

function ConsultJoinContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialUrlToken = searchParams?.get("token") ?? "";

  // Stash the HMAC in a ref so we can re-use it for token refresh
  // without keeping it in the URL bar. Mirrors the voice page hygiene.
  const urlTokenRef = useRef<string>(initialUrlToken);

  const [status, setStatus] = useState<
    "loading" | "lobby" | "ready" | "error" | "ended"
  >("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [videoData, setVideoData] = useState<VideoData | null>(null);
  const [companion, setCompanion] = useState<CompanionState | null>(null);
  const [lobbyScheduledAt, setLobbyScheduledAt] = useState<string | null>(null);
  const [lobbySnapshot, setLobbySnapshot] = useState<PatientOpdSnapshot | null>(
    null
  );

  // task-video-A7 — pre-call gate. The patient sees the camera + mic
  // check screen first; on Continue / Skip mic the page transitions
  // to `'live'` and mounts `<VideoRoom>` with the chosen device IDs.
  // Doctor side has its own join flow and never goes through this
  // page, so this state slot is patient-only.
  const [step, setStep] = useState<"precall" | "live">("precall");
  const [chosenCameraId, setChosenCameraId] = useState<string | null>(null);
  const [chosenMicId, setChosenMicId] = useState<string | null>(null);
  const [skipAudio, setSkipAudio] = useState(false);
  /** crc-10 — patient completed the device check while still in lobby. */
  const [lobbyCheckDone, setLobbyCheckDone] = useState(false);
  const arrivedViaLobbyRef = useRef(false);
  const statusRef = useRef(status);
  statusRef.current = status;

  // ------------------------------------------------------------------------
  // Sub-batch E · task-video-E4 — crash-recovery rejoin.
  //
  // `rejoinedFromCache` is the prop we forward into `<VideoRoom>` so it
  // mounts the "Reconnected — welcome back" banner (auto-dismiss in 3s).
  // It's only set on the cache-hit branch — the normal first-load path
  // leaves it false and the banner stays unmounted.
  //
  // `useCallRejoinCache(videoData?.sessionId)` binds the write/clear
  // helpers to the resolved sessionId. We use `findLatestRejoinCandidate`
  // (not the bound hook) for the INITIAL discovery because at first
  // mount we don't know the sessionId yet — the URL has been stripped
  // post-prior-exchange (security hygiene).
  // ------------------------------------------------------------------------
  const [rejoinedFromCache, setRejoinedFromCache] = useState(false);
  const rejoinCache = useCallRejoinCache(videoData?.sessionId);

  // voice-0C — gate `console.warn` so we log once per *new* failure
  // event, not on every retry click. Tracks the last failure
  // signature; reset on success so a fresh failure logs again.
  const lastLoggedFailureRef = useRef<string | null>(null);

  /**
   * Clean-end teardown shared between explicit "Leave" (handled by
   * `<VideoRoom>` then bubbled through `onDisconnect`) and natural Twilio
   * disconnects. Clearing the rejoin cache here is critical: if we don't,
   * a reload AFTER an end-of-call would try to auto-rejoin a finished
   * session — bad UX (silent reconnect with no doctor on the other side).
   *
   * The kick path (E3) deliberately does NOT call `onDisconnect`, so the
   * cache STAYS on kick — but the kicked-flag set by E3 will block the
   * cache from being used on a future reload anyway. Cache + flag both
   * persist in sessionStorage; on a clean call end only the cache is
   * cleared (the flag was already absent).
   */
  const handleDisconnect = useCallback(() => {
    setStatus("ended");
    rejoinCache.clear();
  }, [rejoinCache]);

  // task-video-A7 — Continue from the pre-call check. Captures the
  // user's chosen camera + mic; transitions to the live `<VideoRoom>`
  // mount which threads them into Twilio's `createLocalTracks`.
  const handlePreCallContinue = useCallback(
    ({
      cameraId,
      micId,
    }: {
      cameraId: string | null;
      micId: string | null;
    }) => {
      requestPatientPhoneFullscreen();
      setChosenCameraId(cameraId);
      setChosenMicId(micId);
      setSkipAudio(false);
      setStep("live");
    },
    []
  );

  // task-video-A7 — Skip mic check (used when the user denied mic
  // permission, or wants to join camera-only). Forces `skipAudio`
  // regardless of the mic dropdown selection.
  const handlePreCallSkipMic = useCallback(
    ({ cameraId }: { cameraId: string | null }) => {
      requestPatientPhoneFullscreen();
      setChosenCameraId(cameraId);
      setChosenMicId(null);
      setSkipAudio(true);
      setStep("live");
    },
    []
  );

  // crc-10 — same device cache as the post-Start gate, but stay in
  // the lobby (no Twilio room yet). Skip-mic is a completed check.
  const handleLobbyPreCallContinue = useCallback(
    ({
      cameraId,
      micId,
    }: {
      cameraId: string | null;
      micId: string | null;
    }) => {
      requestPatientPhoneFullscreen();
      setChosenCameraId(cameraId);
      setChosenMicId(micId);
      setSkipAudio(false);
      setLobbyCheckDone(true);
    },
    []
  );

  const handleLobbyPreCallSkipMic = useCallback(
    ({ cameraId }: { cameraId: string | null }) => {
      requestPatientPhoneFullscreen();
      setChosenCameraId(cameraId);
      setChosenMicId(null);
      setSkipAudio(true);
      setLobbyCheckDone(true);
    },
    []
  );

  // voice-0C — companion text-token exchange.
  //
  // Returns a discriminated `CompanionState` instead of swallowing the
  // error to `null`. Failures NEVER block the video call — the page
  // hands `<VideoRoom>` a `companion={{ sessionId, onCompanionRetry }}`
  // shape on failure, which surfaces the inline "Chat unavailable"
  // tile + retry button. Logs each new failure signature once via
  // `console.warn` (gated by `lastLoggedFailureRef` to avoid spamming
  // the console on retry clicks against a still-down backend).
  const exchangeCompanion = useCallback(
    async (sessionId: string): Promise<CompanionState | null> => {
      const token = urlTokenRef.current;
      if (!token) return null;
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
    },
    []
  );

  // crc-17 — heartbeat + snapshot + token poll. Throws on heartbeat or
  // token failure so the reconnect hook can back off. Does not touch
  // lobbyCheckDone (p3 device check must survive a drop).
  const lobbyTick = useCallback(async () => {
    const token = urlTokenRef.current || initialUrlToken;
    if (!token) throw new Error("missing_token");
    await postLobbyHeartbeat(token);
    try {
      const snap = await getOpdSessionSnapshot(token);
      setLobbySnapshot(snap.data.snapshot);
    } catch {
      /* snapshot is advisory — last known wait copy stays */
    }
    const res = await getConsultationTokenForPatient(token);
    if (statusRef.current !== "lobby") return;
    if (res.data.status !== "lobby" && "token" in res.data) {
      const live = res.data;
      const companionResult = live.sessionId
        ? await exchangeCompanion(live.sessionId)
        : null;
      if (statusRef.current !== "lobby") return;
      setVideoData({
        accessToken: live.token,
        roomName: live.roomName,
        sessionId: live.sessionId,
      });
      setCompanion(companionResult);
      if (
        shouldSkipVideoPrecallGate({
          arrivedViaLobby: arrivedViaLobbyRef.current,
        })
      ) {
        setStep("live");
      }
      setStatus("ready");
      try {
        router.replace("/consult/join");
      } catch {
        /* best-effort */
      }
    }
  }, [initialUrlToken, exchangeCompanion, router]);

  const inLobby = status === "lobby";
  const { reconnecting, isOnline } = useLobbyReconnect({
    enabled: inLobby,
    onTick: lobbyTick,
  });

  useLobbyPresenceChannel({
    consultationToken: urlTokenRef.current || initialUrlToken,
    enabled: lobbyPresenceChannelEnabled(inLobby, isOnline),
  });

  // Patient-side companion-token refresh hook. `<VideoRoom>` calls this
  // when its in-room Supabase JWT is about to expire (or after a 401
  // from a Realtime / REST call). Mirrors the voice page hook.
  const handlePatientTokenRefresh = useCallback(async (): Promise<string> => {
    const sessionId = videoData?.sessionId;
    if (!sessionId) {
      throw new Error("Missing sessionId for companion token refresh");
    }
    const result = await exchangeCompanion(sessionId);
    if (!result || result.status !== "ok" || !result.data.token) {
      throw new Error("Unable to refresh companion chat token");
    }
    setCompanion(result);
    return result.data.token;
  }, [videoData?.sessionId, exchangeCompanion]);

  // voice-0C — retry hook for the inline "Chat unavailable" tile.
  // Re-runs the exchange and updates `companion` state. Contract
  // requires this to NEVER throw — failures are surfaced by leaving
  // `companion` at `unavailable`. `<VideoRoom>` observes the prop
  // reference change and re-resolves `chatAuth`.
  const handleCompanionRetry = useCallback(async (): Promise<void> => {
    const sessionId = videoData?.sessionId;
    if (!sessionId) return;
    const result = await exchangeCompanion(sessionId);
    if (!result) return;
    setCompanion(result);
  }, [videoData?.sessionId, exchangeCompanion]);

  useEffect(() => {
    let cancelled = false;

    // ----------------------------------------------------------------
    // Sub-batch E · task-video-E4 — crash-recovery rejoin: cache check.
    //
    // Runs BEFORE the URL-token validation so a cached snapshot can
    // rescue a reload-after-strip (URL stripped via `router.replace`
    // post-prior-exchange → `initialUrlToken` is "" on this remount).
    //
    // Decision tree:
    //   - kicked       → E3 takes precedence; consume the flag, fall
    //                     through to the URL flow (which will likely
    //                     show the "Take over" overlay if the user
    //                     reloads after a kick).
    //   - stale/absent → fall through to the URL flow (the user must
    //                     have arrived via a fresh link).
    //   - ok           → restore directly from cache; skip URL exchange,
    //                     companion exchange, and the pre-call lobby.
    //                     Mount `<VideoRoom>` immediately with the
    //                     `rejoined` banner.
    // ----------------------------------------------------------------
    const candidate = findLatestRejoinCandidate();
    if (
      candidate &&
      candidate.role === "patient" &&
      candidate.modality === "video"
    ) {
      // Hard requirements for a video rejoin: Twilio access token + room
      // name. Without them we can't connect; treat as a stale entry.
      if (candidate.twilioAccessToken && candidate.roomName) {
        // E3 kick check is per-sessionId; we know the sessionId now.
        // If this tab was kicked, fall through to URL flow.
        const wasKicked =
          typeof window !== "undefined" &&
          window.sessionStorage.getItem(
            `tab-was-kicked-${candidate.sessionId}`
          ) === "1";

        if (!wasKicked) {
          setVideoData({
            accessToken: candidate.twilioAccessToken,
            roomName: candidate.roomName,
            sessionId: candidate.sessionId,
          });
          // Restore the companion creds if they were cached too. Without
          // them the room renders the inline "Chat unavailable" tile,
          // same graceful-degrade path as a first-time exchange failure.
          if (candidate.supabaseJwt && candidate.companionCurrentUserId) {
            // Synthesize a minimal `TextConsultTokenExchangeData`. The
            // chat companion only reads `token` + `currentUserId` for
            // actual chat operations on the rejoin path; the lobby
            // metadata (`practiceName` / `scheduledStartAt` /
            // `expectedEndAt`) is display-only and was consumed during
            // the original lobby render — irrelevant once we're live.
            // `sessionStatus: 'live'` is the only value that makes
            // sense here (we wouldn't have minted tokens for a non-live
            // session). `expiresAt: null` and empty date strings are
            // best-effort placeholders; the chat code path is
            // null-tolerant on these (verified during E.4 audit of
            // exchange consumers).
            setCompanion({
              status: "ok",
              data: {
                token: candidate.supabaseJwt,
                expiresAt: null,
                currentUserId: candidate.companionCurrentUserId,
                sessionStatus: "live",
                scheduledStartAt: "",
                expectedEndAt: "",
              },
            });
          } else {
            setCompanion({
              status: "unavailable",
              error: { message: "Companion data not cached on rejoin" },
            });
          }
          // Restore device choices so the room can re-acquire the same
          // camera + mic without forcing the user back through the
          // pre-call lobby.
          setChosenCameraId(candidate.cameraDeviceId ?? null);
          setChosenMicId(candidate.micDeviceId ?? null);
          // Per spec: "Reuse cached Twilio access token to reconnect
          // to the same room. Re-acquire camera + mic with cached
          // deviceId. Skip pre-call." — jump straight to live mount.
          setStep("live");
          setRejoinedFromCache(true);
          setStatus("ready");
          // URL hygiene parity — if the user arrived via the original
          // `?token=` URL but we DIDN'T need it (cache was fresh), still
          // strip it so a screenshot doesn't leak the HMAC.
          try {
            router.replace("/consult/join");
          } catch {
            /* best-effort */
          }
          return;
        }
      }
    }

    if (!initialUrlToken || initialUrlToken.length < 10) {
      setStatus("error");
      setErrorMessage(
        "Invalid or missing link. Please use the link shared by your doctor."
      );
      return;
    }

    const enterLiveFromToken = async (
      video: Extract<GetConsultationTokenData, { token: string }>
    ) => {
      const companionResult = video.sessionId
        ? await exchangeCompanion(video.sessionId)
        : null;
      if (cancelled) return;

      setVideoData({
        accessToken: video.token,
        roomName: video.roomName,
        sessionId: video.sessionId,
      });
      setCompanion(companionResult);
      setStatus("ready");

      if (video.sessionId) {
        const twilioExp = decodeJwtExp(video.token);
        const supabaseExp =
          companionResult?.status === "ok"
            ? decodeJwtExp(companionResult.data.token ?? undefined)
            : undefined;
        const hmacExpFallbackSeconds = Math.floor(
          (Date.now() + 24 * 60 * 60 * 1000) / 1000
        );
        const expiresAt = computeMinExpiryEpochMs({
          hmacExp: hmacExpFallbackSeconds,
          twilioExp,
          supabaseExp,
        });
        if (expiresAt && expiresAt > Date.now()) {
          const snapshot: CallRejoinSnapshot = {
            sessionId: video.sessionId,
            modality: "video",
            role: "patient",
            hmacToken: urlTokenRef.current || undefined,
            twilioAccessToken: video.token,
            roomName: video.roomName,
            supabaseJwt:
              companionResult?.status === "ok"
                ? (companionResult.data.token ?? undefined)
                : undefined,
            companionCurrentUserId:
              companionResult?.status === "ok"
                ? companionResult.data.currentUserId
                : undefined,
            cameraDeviceId: chosenCameraId ?? undefined,
            micDeviceId: chosenMicId ?? undefined,
            cachedAt: Date.now(),
            expiresAt,
          };
          try {
            window.sessionStorage.setItem(
              `call-rejoin-${snapshot.sessionId}`,
              JSON.stringify(snapshot)
            );
          } catch {
            /* best-effort */
          }
        }
      }

      try {
        router.replace("/consult/join");
      } catch {
        /* best-effort */
      }
    };

    void (async () => {
      try {
        const res = await getConsultationTokenForPatient(initialUrlToken);
        const data = res.data;
        if (cancelled) return;

        if (data.status === "lobby") {
          arrivedViaLobbyRef.current = true;
          setLobbyScheduledAt(data.scheduledStartAt);
          setStatus("lobby");
          void postLobbyHeartbeat(initialUrlToken).catch(() => undefined);
          return;
        }

        await enterLiveFromToken(data);
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : "Request failed";
        setStatus("error");
        if (msg.toLowerCase().includes("expired")) {
          setErrorMessage(
            "This link has expired. Please ask your doctor for a new link."
          );
        } else if (msg.toLowerCase().includes("join window")) {
          setErrorMessage(msg);
        } else if (msg && msg !== "Request failed") {
          setErrorMessage(msg);
        } else {
          setErrorMessage(
            "Link expired or invalid. Please use the link shared by your doctor."
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialUrlToken]);

  if (status === "loading") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-4">
        <p className="text-gray-600">Connecting to your video consultation…</p>
      </div>
    );
  }

  if (status === "lobby") {
    return (
      <>
        <LobbyReconnectNotice show={reconnecting} />
        <PatientVideoWaitingRoom
          scheduledStartAt={lobbyScheduledAt}
          deviceCheckDone={lobbyCheckDone}
          snapshot={lobbySnapshot}
          onContinue={handleLobbyPreCallContinue}
          onSkipMic={handleLobbyPreCallSkipMic}
        />
      </>
    );
  }

  if (status === "error") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-4">
        <div className="w-full max-w-md rounded-lg border border-red-200 bg-red-50 p-6 text-center">
          <h1 className="text-lg font-semibold text-red-800">Unable to join</h1>
          <p className="mt-2 text-sm text-red-700">{errorMessage}</p>
        </div>
      </div>
    );
  }

  if (status === "ended") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-4">
        <div className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-xl font-semibold text-gray-900">Call ended</h1>
          <p className="mt-2 text-gray-600">
            You have left the video consultation. You can safely close this tab.
          </p>
        </div>
      </div>
    );
  }

  if (!videoData) return null;

  // task-video-A7 — pre-call gate. Mount the camera + mic check
  // BEFORE wiring `<VideoRoom>` so the patient can verify devices
  // before being live with the doctor. Companion data is already
  // resolved at this point (sequential exchange in the effect
  // above) so we can transition to `'live'` instantly on Continue
  // without waiting on a fresh exchange.
  //
  // task-video-B1 — wraps A7 in clinic-branded lobby chrome.
  // `companion.data` (when status='ok') carries `practiceName` +
  // `scheduledStartAt` from the backend's
  // `exchangeTextConsultTokenHandler` — see
  // `consultation-controller.ts` §practiceName lookup. When the
  // companion exchange failed (`status='unavailable'`) or never ran
  // (no sessionId), we still render the chrome with a generic
  // fallback ("Your clinic" + waiting state) rather than dropping
  // the lobby entirely — the patient still gets reassuring copy.
  if (step === "precall") {
    const lobbyData = companion?.status === "ok" ? companion.data : null;
    const branding = resolveClinicBranding({
      practiceName: lobbyData?.practiceName,
    });
    const appointmentTime = formatAppointmentTimeEnGB(
      lobbyData?.scheduledStartAt
    );
    // Patient-side counterparty copy. The backend doesn't yet
    // surface the doctor's display name to the patient (no
    // `doctor_full_name` column in `doctor_settings` — verified
    // against the schema; see branding.ts file-level note).
    // Generic copy works without the name; when voice B2 / a
    // future task adds the doctor name to the exchange payload,
    // pass it here and the countdown will render it inline.
    const counterpartyLabel = "your doctor";
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="mx-auto flex max-w-2xl flex-col gap-4">
          <h1 className="text-center text-xl font-semibold text-gray-900">
            Video Consultation
          </h1>
          <VideoConsultLobbyHeader
            branding={branding}
            appointmentTime={appointmentTime}
          />
          <VideoConsultLobbyCountdown
            scheduledStartAt={lobbyData?.scheduledStartAt}
            counterpartyLabel={counterpartyLabel}
          />
          <VideoConsultPreCall
            onContinue={handlePreCallContinue}
            onSkipMic={handlePreCallSkipMic}
          />
        </div>
        {/* Sub-batch E · task-video-E7 — one-time cellular-data warning.
            Self-gates: renders nothing when (a) `navigator.connection`
            is unsupported (Safari + most desktops), (b) detected
            connection isn't cellular, or (c) the
            `video-cellular-warning-shown` localStorage flag is already
            set. Sits OUTSIDE the centered column so the modal scrim
            covers the entire pre-call viewport. */}
        <CellularDataWarning />
      </div>
    );
  }

  // voice-0B / voice-0C — companion prop matrix:
  //   - Both video + chat OK: full companion creds → room renders chat
  //     panel.
  //   - Video OK, chat exchange failed but we have a sessionId: pass
  //     `companion={{ sessionId, onCompanionRetry }}` → room's
  //     `chatAuth` resolves to `unavailable`, the inline "Chat
  //     unavailable" tile renders with a functional Retry button
  //     (voice-0C). Click → `handleCompanionRetry` → re-exchange →
  //     prop reference changes → tile clears or stays.
  //   - Video OK but no sessionId at all (pre-deploy backend window):
  //     omit companion entirely → legacy single-pane video, no tile.
  const companionProp = videoData.sessionId
    ? companion?.status === "ok" &&
      companion.data.token &&
      companion.data.currentUserId
      ? {
          sessionId: videoData.sessionId,
          patientAccessToken: companion.data.token,
          patientCurrentUserId: companion.data.currentUserId,
          onPatientTokenRefresh: handlePatientTokenRefresh,
          onCompanionRetry: handleCompanionRetry,
        }
      : {
          sessionId: videoData.sessionId,
          onCompanionRetry: handleCompanionRetry,
        }
    : undefined;
  // `TextConsultTokenExchangeData.token` is `string | null` (null
  // once the session ends/cancels); coerce to `undefined` so the
  // recording props match `<VideoRoom>`'s `string | undefined`.
  const recordingToken =
    companion?.status === "ok" && companion.data.token
      ? companion.data.token
      : undefined;

  // Bounded `100dvh` flex column (not `min-h-screen`): the room's Speaker
  // stage anchors both tiles `absolute inset-0`, so it needs a real height
  // to fill or it collapses to a sliver. `dvh` over `vh` so the mobile
  // browser's collapsing URL bar doesn't push the control strip off-screen.
  // Phone: edge-to-edge, no page chrome — the doctor's face IS the page and
  // the patient already knows why they're here. Tablet / desktop (`md:`)
  // uses the same card + stage chrome as the doctor Consult column.
  return (
    <div className="flex h-[100dvh] flex-col bg-background p-0 md:bg-muted md:p-3">
      <div className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col overflow-hidden md:rounded-xl md:border md:bg-card md:shadow-sm">
        <VideoRoom
          accessToken={videoData.accessToken}
          roomName={videoData.roomName}
          onDisconnect={handleDisconnect}
          role="patient"
          companion={companionProp}
          /*
           * Plan 02 · Task 28 — patient-side mount of the
           * `<RecordingPausedIndicator>` banner. Mirrors voice page;
           * the companion Supabase JWT doubles as the recording-API
           * caller-auth token (`authenticateToken` accepts any valid
           * Supabase session). Skipped silently when companion failed.
           */
          recordingSessionId={
            recordingToken && videoData.sessionId
              ? videoData.sessionId
              : undefined
          }
          recordingToken={recordingToken}
          /*
           * task-video-A7 — pre-call device choices. `null` for
           * either ID means "let Twilio pick the default";
           * `skipAudio` is set when the user clicked "Skip mic check"
           * on the pre-call screen.
           */
          chosenCameraId={chosenCameraId}
          chosenMicId={chosenMicId}
          skipAudio={skipAudio}
          /*
           * Sub-batch E · task-video-E4 — crash-recovery rejoin banner.
           * True only on the cache-restore branch above; the banner
           * inside `<VideoRoom>` self-dismisses in 3s.
           */
          rejoined={rejoinedFromCache}
        />
      </div>
    </div>
  );
}

/**
 * Patient join page for video consultations.
 * Public; no auth. Token from ?token= in URL.
 * @see e-task-7
 */
export default function ConsultJoinPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-gray-50">
          <p className="text-gray-600">Loading…</p>
        </div>
      }
    >
      <ConsultJoinContent />
    </Suspense>
  );
}
