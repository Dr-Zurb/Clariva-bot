"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  connect,
  createLocalAudioTrack,
  type LocalAudioTrack,
  type Room,
  type RemoteParticipant,
  type RemoteAudioTrack,
} from "twilio-video";
import TextConsultRoom, { type IncomingMessageMeta } from "./TextConsultRoom";
import RecordingPausedIndicator from "./RecordingPausedIndicator";
import RecordingControls from "./RecordingControls";
import { createClient } from "@/lib/supabase/client";
import { useRecordingState } from "@/hooks/useRecordingState";

/**
 * Plan 05 · Task 24 + Task 24c · Decision 9 LOCKED — the voice
 * consult room for both doctor and patient. It is an **audio-only**
 * Twilio Video session:
 *   - `createLocalAudioTrack()` publishes ONLY a microphone track; no
 *     camera track is ever requested (so browsers skip the camera
 *     permission prompt entirely). Defense-in-depth against the
 *     backend's audio-only Recording Rules (Task 23).
 *   - Remote video tracks are ignored; remote audio is attached to a
 *     hidden `<audio>` element.
 *
 * **Companion chat folded in (Task 24c):** when a `companion` prop is
 * supplied the main canvas renders `<TextConsultRoom layout='canvas'>`
 * instead of a traditional "no video" voice-only placeholder. The
 * slim top header shows a downsized pulsing voice indicator (connection
 * + remote speaking state), participant label, and mute/end buttons.
 *
 * **Reconnect/disconnect:** we lean on Twilio's built-in reconnect
 * (default 30s window). The component only surfaces terminal
 * disconnect states; transient ICE reconnects bubble up via the
 * `connecting` state indicator.
 *
 * **Wake Lock:** when the platform exposes `navigator.wakeLock`, we
 * request a `'screen'` lock while connected so the patient's phone
 * doesn't lock mid-call. Best-effort; silently noop on unsupported
 * platforms.
 *
 * **Principle 8 LOCKED:** "audio-only web call, not a phone call" —
 * the UI never shows a phone handset, dial pad, or phone-number
 * element. `<VoiceConsultRoom>` is the visible realization of that
 * copy contract.
 *
 * @see docs/Development/Daily-plans/April 2026/19-04-2026/Tasks/task-24-voice-consult-room-frontend.md
 * @see docs/Development/Daily-plans/April 2026/19-04-2026/Tasks/task-24c-voice-consult-room-companion-chat-mount.md
 */
export interface VoiceConsultRoomProps {
  accessToken: string;
  roomName: string;
  /** Role of the local participant — controls counterparty label. */
  role?: "doctor" | "patient";
  /**
   * Callback invoked after the local participant leaves the call. The
   * parent (`<ConsultationLauncher>` on doctor side, the patient route
   * on patient side) typically uses this to trigger a router refresh
   * or navigate to a post-call surface.
   */
  onDisconnect?: () => void;
  /**
   * Task 24c — companion chat mount. When present the main canvas
   * renders `<TextConsultRoom layout='canvas'>`. Undefined when the
   * launcher hasn't provisioned the channel OR on the idempotent
   * rejoin path (see backend `StartConsultationResult.companion`
   * doc for the trade-off). UI gracefully falls back to a voice-only
   * panel in that case.
   */
  companion?: {
    /** `consultation_sessions.id` — the chat channel UUID. */
    sessionId: string;
    /**
     * Patient-side only: Supabase JWT for the companion text channel
     * (already exchanged from the HMAC `?t=` by the patient route).
     * Undefined on doctor side — the doctor's dashboard Supabase
     * session is fetched via `@/lib/supabase/client` at mount time.
     */
    patientAccessToken?: string;
    /** Patient-side only: `currentUserId` from the text-token exchange. */
    patientCurrentUserId?: string;
    /** Patient-side only: JWT refresh hook (text-token re-exchange). */
    onPatientTokenRefresh?: () => Promise<string>;
  };
  /**
   * Task 24 · doctor-side "patient hasn't joined" surface — when true
   * (no remote participant after a grace period), the header shows the
   * "Resend link" affordance. Parent owns the resend wiring because
   * only the launcher has `sessionId` + the auth Bearer token; this
   * component just asks.
   */
  onResendLink?: () => Promise<{ sent: boolean }>;
  /**
   * How long (ms) to wait after `connected` before showing the
   * "patient hasn't joined" surface. Defaults to 20s — short enough
   * that the doctor notices quickly, long enough to avoid a false
   * positive while the patient is still exchanging tokens.
   */
  patientGraceMs?: number;
  /**
   * Plan 07 · Task 28 — opts the room into the recording pause/resume
   * UI. Both must be present:
   *   - `recordingSessionId`: the `consultation_sessions.id` — identical
   *     to `companion?.sessionId` on sessions that have a companion
   *     chat; we accept it as a separate prop because a voice session
   *     without a companion chat still has recording rules worth
   *     pausing.
   *   - `recordingToken`: the Supabase JWT used by the pause/resume
   *     REST endpoints. Doctor side = dashboard session JWT; patient
   *     side = the same JWT the companion chat uses.
   * When either is missing the recording UI is silently skipped
   * (voice-only sessions that don't record fall into this bucket).
   */
  recordingSessionId?: string;
  recordingToken?: string;
}

type Status =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "error";

const DEFAULT_PATIENT_GRACE_MS = 20_000;

// ----------------------------------------------------------------------------
// Wake-Lock helper — best-effort, silent on unsupported platforms.
// ----------------------------------------------------------------------------

interface WakeLockSentinel {
  release: () => Promise<void>;
  addEventListener?: (evt: "release", cb: () => void) => void;
}

async function requestWakeLock(): Promise<WakeLockSentinel | null> {
  try {
    const nav = navigator as unknown as {
      wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinel> };
    };
    if (!nav.wakeLock?.request) return null;
    return await nav.wakeLock.request("screen");
  } catch {
    return null;
  }
}

// ----------------------------------------------------------------------------
// Component
// ----------------------------------------------------------------------------

export default function VoiceConsultRoom({
  accessToken,
  roomName,
  role,
  onDisconnect,
  companion,
  onResendLink,
  patientGraceMs = DEFAULT_PATIENT_GRACE_MS,
  recordingSessionId,
  recordingToken,
}: VoiceConsultRoomProps) {
  const [status, setStatus] = useState<Status>("connecting");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [remoteSpeaking, setRemoteSpeaking] = useState(false);
  const [remoteJoined, setRemoteJoined] = useState(false);
  const [showPatientPendingBanner, setShowPatientPendingBanner] =
    useState(false);
  const [resendState, setResendState] = useState<
    | { phase: "idle" }
    | { phase: "sending" }
    | { phase: "success"; at: number }
    | { phase: "failure"; message: string }
  >({ phase: "idle" });

  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const roomRef = useRef<Room | null>(null);
  const localTrackRef = useRef<LocalAudioTrack | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const onDisconnectRef = useRef(onDisconnect);
  onDisconnectRef.current = onDisconnect;
  const hasNotifiedDisconnectRef = useRef(false);
  const hasDisconnectedRef = useRef(false);

  // --------------------------------------------------------------------------
  // Doctor-side Supabase session → companion chat auth (parallels VideoRoom)
  // --------------------------------------------------------------------------

  const [chatAuth, setChatAuth] = useState<
    | { status: "idle" }
    | { status: "pending" }
    | { status: "ready"; accessToken: string; currentUserId: string }
    | { status: "unavailable"; reason: string }
  >({ status: "idle" });

  useEffect(() => {
    if (!companion) {
      setChatAuth({ status: "idle" });
      return;
    }

    // Patient-side: the parent page already exchanged the HMAC for a
    // Supabase JWT; we just thread it through. No Supabase-client
    // fetch needed.
    if (companion.patientAccessToken && companion.patientCurrentUserId) {
      setChatAuth({
        status: "ready",
        accessToken: companion.patientAccessToken,
        currentUserId: companion.patientCurrentUserId,
      });
      return;
    }

    // Doctor-side: fetch the doctor's dashboard Supabase session.
    let cancelled = false;
    setChatAuth({ status: "pending" });
    (async () => {
      try {
        const sb = createClient();
        const { data, error } = await sb.auth.getSession();
        if (cancelled) return;
        if (error || !data.session) {
          setChatAuth({
            status: "unavailable",
            reason: "No active Supabase session on this device.",
          });
          return;
        }
        setChatAuth({
          status: "ready",
          accessToken: data.session.access_token,
          currentUserId: data.session.user.id,
        });
      } catch {
        if (cancelled) return;
        setChatAuth({
          status: "unavailable",
          reason: "Couldn't reach Supabase to load the companion chat.",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companion]);

  const handleChatTokenRefresh = useCallback(async (): Promise<string> => {
    // Patient-side refresh → delegate to the parent's HMAC re-exchange.
    if (companion?.onPatientTokenRefresh) {
      const token = await companion.onPatientTokenRefresh();
      setChatAuth((prev) =>
        prev.status === "ready" ? { ...prev, accessToken: token } : prev,
      );
      return token;
    }
    const sb = createClient();
    const { data, error } = await sb.auth.refreshSession();
    if (error || !data.session) {
      throw new Error("Unable to refresh doctor dashboard session");
    }
    setChatAuth({
      status: "ready",
      accessToken: data.session.access_token,
      currentUserId: data.session.user.id,
    });
    return data.session.access_token;
  }, [companion]);

  // --------------------------------------------------------------------------
  // Plan 07 · Task 28 — recording pause/resume state (Decision 4 LOCKED).
  // --------------------------------------------------------------------------

  const recordingEnabled = Boolean(recordingSessionId && recordingToken);
  const {
    state: recordingState,
    applyIncomingMessage: applyRecordingSystemMessage,
  } = useRecordingState({
    sessionId: recordingSessionId ?? null,
    token:     recordingToken ?? null,
    enabled:   recordingEnabled,
  });

  const handleIncomingChatMessage = useCallback(
    (msg: IncomingMessageMeta) => {
      // Canvas layout is always-visible (single pane), so we don't
      // maintain an unread-count badge here. We DO, however, forward
      // system-event messages into the recording-state hook so the
      // pause/resume banner stays in sync without opening a second
      // Realtime subscription (task-28 Notes #4).
      applyRecordingSystemMessage({
        systemEvent: msg.systemEvent ?? null,
        body:        msg.body,
        senderRole:  msg.senderRole,
      });
    },
    [applyRecordingSystemMessage],
  );

  // --------------------------------------------------------------------------
  // Twilio connection (audio-only)
  // --------------------------------------------------------------------------

  useEffect(() => {
    if (hasDisconnectedRef.current) return;

    let room: Room | null = null;
    let localTrack: LocalAudioTrack | null = null;

    const teardown = async () => {
      if (wakeLockRef.current) {
        try {
          await wakeLockRef.current.release();
        } catch {
          /* noop */
        }
        wakeLockRef.current = null;
      }
      if (room) {
        room.removeAllListeners();
        room.disconnect();
        room = null;
      }
      if (localTrack) {
        try {
          localTrack.stop();
        } catch {
          /* noop */
        }
        localTrack = null;
      }
      localTrackRef.current = null;
      roomRef.current = null;
    };

    const attachRemoteAudio = (participant: RemoteParticipant) => {
      const attach = (track: RemoteAudioTrack) => {
        if (remoteAudioRef.current) {
          track.attach(remoteAudioRef.current);
        }
      };
      participant.audioTracks.forEach((publication) => {
        if (publication.track) attach(publication.track);
      });
      participant.on("trackSubscribed", (track) => {
        if (track.kind === "audio") {
          attach(track as RemoteAudioTrack);
        }
      });
    };

    const connectRoom = async () => {
      try {
        localTrack = await createLocalAudioTrack();
        localTrackRef.current = localTrack;

        room = await connect(accessToken, {
          name: roomName,
          audio: true,
          video: false,
          tracks: [localTrack],
        });
        roomRef.current = room;
        setStatus("connected");

        wakeLockRef.current = await requestWakeLock();

        if (room.participants.size > 0) {
          setRemoteJoined(true);
          room.participants.forEach(attachRemoteAudio);
        }

        room.on("participantConnected", (participant) => {
          setRemoteJoined(true);
          attachRemoteAudio(participant);
        });
        room.on("participantDisconnected", () => {
          if (room && room.participants.size === 0) {
            setRemoteJoined(false);
          }
        });

        // Speaking indicator — poll `dominantSpeaker` / track audio
        // levels lightly. Twilio exposes `isSpeaking` on RemoteAudioTrack
        // when dominant-speaker is enabled; we fall back to a simple
        // activity heuristic if the feature isn't wired server-side.
        room.on("dominantSpeakerChanged", (participant) => {
          setRemoteSpeaking(!!participant);
        });

        room.on("reconnecting", () => setStatus("reconnecting"));
        room.on("reconnected", () => setStatus("connected"));

        room.on("disconnected", () => {
          hasDisconnectedRef.current = true;
          setStatus("disconnected");
          if (!hasNotifiedDisconnectRef.current) {
            hasNotifiedDisconnectRef.current = true;
            onDisconnectRef.current?.();
          }
        });
      } catch (err) {
        setStatus("error");
        setErrorMessage(
          err instanceof Error ? err.message : "Failed to connect",
        );
      }
    };

    void connectRoom();
    return () => {
      void teardown();
    };
  }, [accessToken, roomName]);

  // Kick off the "patient hasn't joined" banner after the grace period.
  useEffect(() => {
    if (status !== "connected") {
      setShowPatientPendingBanner(false);
      return;
    }
    if (remoteJoined) {
      setShowPatientPendingBanner(false);
      return;
    }
    const timer = setTimeout(() => {
      if (!remoteJoined) setShowPatientPendingBanner(true);
    }, patientGraceMs);
    return () => clearTimeout(timer);
  }, [status, remoteJoined, patientGraceMs]);

  // --------------------------------------------------------------------------
  // Controls
  // --------------------------------------------------------------------------

  const toggleMute = useCallback(() => {
    const track = localTrackRef.current;
    if (!track) return;
    if (muted) {
      track.enable();
      setMuted(false);
    } else {
      track.disable();
      setMuted(true);
    }
  }, [muted]);

  const handleLeave = useCallback(() => {
    hasDisconnectedRef.current = true;
    const room = roomRef.current;
    const track = localTrackRef.current;
    if (track) {
      try {
        track.stop();
      } catch {
        /* noop */
      }
    }
    localTrackRef.current = null;
    if (room) {
      room.removeAllListeners();
      room.disconnect();
      roomRef.current = null;
    }
    setStatus("disconnected");
    if (!hasNotifiedDisconnectRef.current) {
      hasNotifiedDisconnectRef.current = true;
      onDisconnectRef.current?.();
    }
  }, []);

  const handleResendLink = useCallback(async () => {
    if (!onResendLink) return;
    setResendState({ phase: "sending" });
    try {
      const result = await onResendLink();
      setResendState({
        phase: result.sent ? "success" : "failure",
        ...(result.sent
          ? { at: Date.now() }
          : { message: "No channel accepted the resend. Please try again." }),
      } as never);
    } catch (err) {
      setResendState({
        phase: "failure",
        message: err instanceof Error ? err.message : "Resend failed",
      });
    }
  }, [onResendLink]);

  // --------------------------------------------------------------------------
  // Render helpers
  // --------------------------------------------------------------------------

  const remoteLabel = role === "patient" ? "Doctor" : "Patient";

  if (status === "error") {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <p className="font-medium text-red-800">Voice connection failed</p>
        <p className="mt-1 text-sm text-red-700">{errorMessage}</p>
      </div>
    );
  }

  if (status === "disconnected") {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 text-center">
        <p className="font-medium text-gray-800">Call ended</p>
        <p className="mt-1 text-sm text-gray-600">
          You have left the voice consultation.
        </p>
      </div>
    );
  }

  // Slim header with downsized voice indicator (Task 24c layout spec).
  const header = (
    <header
      className="flex items-center justify-between gap-3 border-b border-gray-200 bg-white px-3 py-2"
      aria-label="Voice consultation header"
    >
      <div className="flex min-w-0 items-center gap-2">
        <span
          aria-hidden
          className={
            "inline-flex h-2.5 w-2.5 flex-shrink-0 rounded-full " +
            (status === "connecting" || status === "reconnecting"
              ? "animate-pulse bg-amber-500"
              : remoteSpeaking
                ? "animate-pulse bg-emerald-500"
                : remoteJoined
                  ? "bg-emerald-400"
                  : "bg-gray-300")
          }
        />
        <p className="truncate text-sm font-medium text-gray-900">
          {status === "connecting"
            ? "Connecting…"
            : status === "reconnecting"
              ? "Reconnecting…"
              : remoteJoined
                ? `${remoteLabel} on the line`
                : `Waiting for ${remoteLabel.toLowerCase()}…`}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {recordingEnabled && recordingSessionId && recordingToken ? (
          <RecordingControls
            sessionId={recordingSessionId}
            token={recordingToken}
            currentUserRole={role === "patient" ? "patient" : "doctor"}
            state={recordingState}
          />
        ) : null}
        <button
          type="button"
          onClick={toggleMute}
          aria-pressed={muted}
          className={
            "rounded-md px-2.5 py-1 text-xs font-medium " +
            (muted
              ? "bg-amber-100 text-amber-900 ring-1 ring-amber-300"
              : "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50")
          }
        >
          {muted ? "Unmute" : "Mute"}
        </button>
        <button
          type="button"
          onClick={handleLeave}
          className="rounded-md bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700"
        >
          End call
        </button>
      </div>
    </header>
  );

  // --------------------------------------------------------------------------
  // Plan 07 · Task 28 — "Recording paused" banner visible to both sides.
  // --------------------------------------------------------------------------

  const recordingBanner = recordingEnabled ? (
    <RecordingPausedIndicator
      state={recordingState}
      currentUserRole={role === "patient" ? "patient" : "doctor"}
      className="mx-3 mt-2 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800"
    />
  ) : null;

  // --------------------------------------------------------------------------
  // "Patient hasn't joined" banner + resend surface
  // --------------------------------------------------------------------------

  const pendingBanner =
    showPatientPendingBanner && !remoteJoined && role !== "patient" ? (
      <div
        role="status"
        aria-live="polite"
        className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
      >
        <span>{remoteLabel} hasn&apos;t joined yet.</span>
        {onResendLink ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleResendLink}
              disabled={resendState.phase === "sending"}
              className="rounded-md border border-amber-300 bg-white px-2 py-0.5 text-[11px] font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-60"
            >
              {resendState.phase === "sending" ? "Resending…" : "Resend link"}
            </button>
            {resendState.phase === "success" ? (
              <span className="text-[11px] text-emerald-700">
                Sent ✓
              </span>
            ) : null}
            {resendState.phase === "failure" ? (
              <span className="text-[11px] text-red-700">
                {resendState.message}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    ) : null;

  // --------------------------------------------------------------------------
  // Canvas — companion chat OR voice-only placeholder
  // --------------------------------------------------------------------------

  const canvas = (() => {
    if (companion) {
      if (chatAuth.status === "ready") {
        return (
          <TextConsultRoom
            sessionId={companion.sessionId}
            currentUserId={chatAuth.currentUserId}
            currentUserRole={role === "patient" ? "patient" : "doctor"}
            accessToken={chatAuth.accessToken}
            sessionStatus="live"
            layout="canvas"
            onIncomingMessage={handleIncomingChatMessage}
            onRequestTokenRefresh={handleChatTokenRefresh}
          />
        );
      }
      if (chatAuth.status === "pending") {
        return (
          <div className="flex h-full min-h-[320px] flex-col items-center justify-center p-4 text-sm text-gray-500">
            Opening chat…
          </div>
        );
      }
      if (chatAuth.status === "unavailable") {
        return (
          <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-2 p-4 text-center text-sm text-gray-500">
            <p className="font-medium text-gray-700">Chat unavailable</p>
            <p className="text-xs">{chatAuth.reason}</p>
          </div>
        );
      }
    }
    // Voice-only fallback (no companion). Large pulsing indicator
    // fills the canvas; Principle 8 LOCKED — no phone iconography.
    return (
      <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-4 p-6 text-center">
        <div
          aria-hidden
          className={
            "h-24 w-24 rounded-full " +
            (remoteJoined
              ? "animate-pulse bg-emerald-500/80"
              : "animate-pulse bg-gray-300")
          }
        />
        <p className="text-sm font-medium text-gray-700">
          {remoteJoined
            ? "Audio connected"
            : status === "connecting"
              ? "Getting the room ready…"
              : `Waiting for the ${remoteLabel.toLowerCase()} to join…`}
        </p>
        <p className="max-w-sm text-xs text-gray-500">
          This is an audio-only web call — your camera is never activated.
        </p>
      </div>
    );
  })();

  return (
    <div
      className="flex h-full min-h-[320px] w-full flex-col overflow-hidden rounded-lg border border-gray-200 bg-white"
      data-voice-room="true"
      data-has-companion={companion ? "true" : "false"}
    >
      {header}
      {recordingBanner}
      {pendingBanner}
      <div className="flex min-h-0 flex-1 flex-col">{canvas}</div>
      {/* Hidden audio sink. Must stay in the DOM while connected so
          `track.attach()` has a target; `autoPlay + playsInline` keeps
          iOS Safari from refusing to start audio. */}
      <audio
        ref={remoteAudioRef}
        autoPlay
        playsInline
        aria-hidden
        className="hidden"
      />
    </div>
  );
}
