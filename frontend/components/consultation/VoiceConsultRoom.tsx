"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  connect,
  createLocalAudioTrack,
  type LocalAudioTrack,
  type LocalParticipant,
  type Room,
  type RemoteParticipant,
  type RemoteAudioTrack,
} from "twilio-video";
import TextConsultRoom, { type IncomingMessageMeta } from "./TextConsultRoom";
import EndCallConfirmModal from "./EndCallConfirmModal";
import VoicePostCallSplash from "./VoicePostCallSplash";
import CallPostCallSummary from "./CallPostCallSummary";
import {
  classifyDisconnect,
  type DisconnectReason,
} from "@/lib/voice/classify-disconnect";
import CallerCardHeader, {
  type CallerCardHeaderLayout,
  type CallerCardHeaderStatus,
} from "./CallerCardHeader";
import MicMeterBar from "./MicMeterBar";
import RecordingPausedIndicator from "./RecordingPausedIndicator";
import RecordingControls from "./RecordingControls";
import { createClient } from "@/lib/supabase/client";
import { useRecordingState } from "@/hooks/useRecordingState";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Check, MoreHorizontal } from "lucide-react";
import {
  pauseRecording,
  postConsultationHoldChanged,
  postConsultationMuteChanged,
  postConsultationVoiceQuality,
  resumeRecording,
} from "@/lib/api";
import {
  createVoiceQualityReporter,
  type VoiceQualityReporter,
} from "@/lib/voice/quality-reporter";
import { formatCallDurationSeconds } from "@/hooks/useCallDuration";
import {
  inferRouteFromDeviceId,
  useAudioOutputDevice,
} from "@/hooks/useAudioOutputDevice";
import { useProximityWakeLock } from "@/hooks/useProximityWakeLock";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import AudioOutputPicker from "@/components/consultation/AudioOutputPicker";
import SpeakerEarpieceToggle from "@/components/consultation/SpeakerEarpieceToggle";
import { useVideoCallStats } from "@/hooks/useVideoCallStats";
import ReconnectionBanner from "./ReconnectionBanner";
import HoldCallBanner from "./HoldCallBanner";
import VolumeSlider from "./VolumeSlider";
import {
  createBoostedAudioRouter,
  type BoostedAudioRouter,
} from "@/lib/audio/gain-node";
import {
  isPatientTwilioIdentity,
  playPatientJoinedChime,
} from "@/lib/audio/ringtone";
import {
  applyNoiseSuppressionPreference,
  buildNoiseCancellationOptions,
  isNoiseSuppressionAvailable,
} from "@/lib/audio/noise-suppression";
import { useNoiseSuppressionPreference } from "@/hooks/useNoiseSuppressionPreference";
import { useTwilioReconnectState } from "@/hooks/useTwilioReconnectState";
import { useVoiceCallHoldState } from "@/hooks/useVoiceCallHoldState";
import MultiTabKickBanner from "./MultiTabKickBanner";
import NewOutputToast from "./NewOutputToast";
import {
  useTabPresenceClaim,
  type TabPresenceRole,
} from "@/hooks/useTabPresenceClaim";
import { useCallMediaSession } from "@/hooks/useCallMediaSession";
import { IOSPWABanner } from "./IOSPWABanner";

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
 * **Reconnect/disconnect:** Twilio's built-in reconnect window (~30s)
 * is surfaced via `useTwilioReconnectState` + `<ReconnectionBanner>`
 * (voice B1 / video B4). Terminal disconnects still route through
 * `classifyDisconnect` + `<VoicePostCallSplash>` (voice A9).
 *
 * **Wake Lock / proximity (voice-C8):** `useProximityWakeLock` keeps the
 * screen awake on Chrome Android during a call and releases the lock when
 * the proximity sensor reports the phone is at the ear (earpiece only).
 * Other platforms degrade silently.
 *
 * **Principle 8 LOCKED:** "audio-only web call, not a phone call" —
 * the UI never shows a phone handset, dial pad, or phone-number
 * element. `<VoiceConsultRoom>` is the visible realization of that
 * copy contract.
 *
 * @see docs/Work/Daily-plans/April 2026/19-04-2026/Tasks/task-24-voice-consult-room-frontend.md
 * @see docs/Work/Daily-plans/April 2026/19-04-2026/Tasks/task-24c-voice-consult-room-companion-chat-mount.md
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
   * voice-A9 — fired once when the disconnect reason is classified.
   * B5 (post-call summary) consumes this to render the reason subline
   * even after the splash is dismissed.
   */
  onDisconnectReason?: (reason: DisconnectReason) => void;
  /**
   * voice-A9 — optional rejoin/restart handlers for the post-call splash.
   * Default: `window.location.reload()` (re-runs HMAC exchange on patient
   * join pages).
   */
  onRejoin?: () => void;
  onRestart?: () => void;
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
    /**
     * voice-0C — patient-side companion-retry hook. Called when the
     * patient clicks the "Retry" button inside the inline "Chat
     * unavailable" tile (rendered when `chatAuth.status === 'unavailable'`).
     * The page (parent) is the only thing that holds the HMAC `?t=`
     * + sessionId in scope, so the retry round-trip lives there.
     *
     * Contract: the parent re-runs `requestTextSessionToken(...)` and
     * updates the `companion` prop in-place with the new creds (or
     * leaves it as-is on failure). Once the prop reference changes,
     * the room's `chatAuth` `useEffect` re-resolves (`unavailable` →
     * `ready`). This callback should NEVER throw — surface failures
     * by leaving the prop unchanged so the unavailable tile remains
     * visible. Resolving (whether success or quiet-failure) just
     * tells the tile to clear its in-flight spinner.
     *
     * Optional. Tile renders a disabled "Coming soon" Retry button
     * when omitted (doctor-side mounts, where Supabase session
     * refresh is the right primitive instead).
     */
    onCompanionRetry?: () => Promise<void>;
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
  /**
   * task-cockpit-fix-5 — fired when the first remote participant enters
   * the Twilio room (patient joined). Mirrors the VideoRoom callback so
   * the launcher can show/hide `<PatientJoinLink>` for voice consults too.
   */
  onRemoteJoined?: () => void;
  /**
   * task-cockpit-fix-5 — fired when the last remote participant leaves
   * the Twilio room (patient dropped).
   */
  onRemoteLeft?: () => void;
  /**
   * task-cockpit-fix-3 — cockpit compact mode. In "cockpit", the
   * recording controls move to a `More ▾` overflow menu and the
   * companion canvas is suppressed by default. Default: "default"
   * (existing behaviour preserved byte-for-byte).
   *
   * `readonly` — Plan 07 history viewer: no live duration tick;
   * render a static "Duration: mm:ss" when session timestamps are
   * supplied.
   */
  mode?: "default" | "cockpit" | "readonly";
  /**
   * voice-A1 / voice-A8 — practice label for the header chip
   * (patient-side typically receives this from the token exchange).
   */
  practiceName?: string;
  /**
   * voice-A8 — counterparty display name (patient on doctor side;
   * doctor on patient side). Never falls back to phone/email.
   */
  counterpartyName?: string;
  /** voice-A8 — optional counterparty avatar (`doctor_settings.avatar_url`, etc.). */
  counterpartyAvatarUrl?: string;
  /**
   * voice-A7 — label for mute-changed system rows ("Dr. Sharma").
   * Defaults to "Doctor" on doctor mounts and "Patient" on patient mounts.
   */
  localActorName?: string;
  /**
   * Plan 07 readonly replay — session bounds for a static duration
   * label. Ignored unless `mode === 'readonly'`.
   */
  sessionStartedAt?: string | Date | null;
  sessionEndedAt?: string | Date | null;
  /**
   * Cockpit Rx-redesign — destructive secondary action shown immediately
   * before "End call" in the doctor-side in-call control bar. Renders as
   * a small ghost-destructive button with a 2-step confirm to guard
   * against accidental clicks ("Mark no-show" → "Confirm no-show?").
   * Patient-side mounts and `mode==='default'` (legacy non-cockpit) mounts
   * never receive this prop, so the button is invisible there.
   * Wired from ConsultationCockpit → ConsultationLauncher → here in the
   * `live` state only.
   */
  onMarkNoShow?: () => void | Promise<void>;
  /**
   * task-voice-C5 — parent set when restoring from sessionStorage crash-
   * recovery cache. Renders a brief "Reconnected — welcome back" banner.
   */
  rejoined?: boolean;
}

type Status = "connecting" | "connected" | "disconnected" | "error";

const DEFAULT_PATIENT_GRACE_MS = 20_000;

// Sub-batch B · task-voice-B4 — remote-audio volume + boost (shared with video B9).
const VOLUME_STORAGE_KEY = "voice-volume-percent";
const DEFAULT_VOLUME_PERCENT = 100;

function mediaStreamFromLocalAudioTrack(
  track: LocalAudioTrack | null,
): MediaStream | null {
  if (!track) return null;
  const mediaStreamTrack = track.mediaStreamTrack;
  if (!mediaStreamTrack || mediaStreamTrack.readyState === "ended") {
    return null;
  }
  return new MediaStream([mediaStreamTrack]);
}

function resolveStaticSessionDuration(
  startedAt?: string | Date | null,
  endedAt?: string | Date | null,
): string {
  if (!startedAt || !endedAt) return "";
  const start =
    startedAt instanceof Date ? startedAt : new Date(startedAt);
  const end = endedAt instanceof Date ? endedAt : new Date(endedAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return "";
  }
  const seconds = Math.max(
    0,
    Math.floor((end.getTime() - start.getTime()) / 1000),
  );
  return formatCallDurationSeconds(seconds);
}

// ----------------------------------------------------------------------------
// Component
// ----------------------------------------------------------------------------

export default function VoiceConsultRoom({
  accessToken,
  roomName,
  role,
  onDisconnect,
  onDisconnectReason,
  onRejoin,
  onRestart,
  companion,
  onResendLink,
  patientGraceMs = DEFAULT_PATIENT_GRACE_MS,
  recordingSessionId,
  recordingToken,
  onRemoteJoined,
  onRemoteLeft,
  mode = "default",
  onMarkNoShow,
  practiceName,
  counterpartyName,
  counterpartyAvatarUrl,
  localActorName,
  sessionStartedAt,
  sessionEndedAt,
  rejoined = false,
}: VoiceConsultRoomProps) {
  const isCockpit = mode === "cockpit";
  const isReadonly = mode === "readonly";
  const isDesktopLayout = useMediaQuery("(min-width: 768px)", true);
  const audioOutput = useAudioOutputDevice();
  const noiseSuppression = useNoiseSuppressionPreference();
  const noiseSuppressionAvailable = isNoiseSuppressionAvailable();
  // Snapshot used to seed `createLocalAudioTrack` — keeps the
  // `useEffect` that opens the Twilio room from re-running on every
  // toggle flip (mid-call changes are handled via
  // `applyNoiseSuppressionPreference` on the live track instead).
  const noiseSuppressionInitialRef = useRef(noiseSuppression.enabled);
  const [showInCallChat, setShowInCallChat] = useState(false);
  const [status, setStatus] = useState<Status>("connecting");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [localMicStream, setLocalMicStream] = useState<MediaStream | null>(null);
  const [remoteSpeaking, setRemoteSpeaking] = useState(false);
  const [remoteJoined, setRemoteJoined] = useState(false);
  const [endConfirmOpen, setEndConfirmOpen] = useState(false);
  const [showPatientPendingBanner, setShowPatientPendingBanner] =
    useState(false);
  // voice-A1 — anchor for the live mm:ss timer. Set once on the first
  // Twilio `room.connected`; never reset across reconnect / hold so the
  // chip keeps counting (matches VideoRoom + useCallDuration doctrine).
  const [connectedAt, setConnectedAt] = useState<Date | null>(null);
  const staticDurationSeconds = isReadonly
    ? resolveStaticSessionDuration(sessionStartedAt, sessionEndedAt)
    : "";
  const staticDurationLabel = staticDurationSeconds
    ? `Duration: ${staticDurationSeconds}`
    : undefined;
  const [resendState, setResendState] = useState<
    | { phase: "idle" }
    | { phase: "sending" }
    | { phase: "success"; at: number }
    | { phase: "failure"; message: string }
  >({ phase: "idle" });

  // task-cockpit-fix-5 — notify parent when remote participant presence changes
  // so the launcher can show/hide <PatientJoinLink> for voice consults.
  useEffect(() => {
    if (remoteJoined) {
      onRemoteJoined?.();
    } else {
      onRemoteLeft?.();
    }
  }, [remoteJoined, onRemoteJoined, onRemoteLeft]);

  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const [volumePercent, setVolumePercent] = useState<number>(
    DEFAULT_VOLUME_PERCENT,
  );
  const audioRouterRef = useRef<BoostedAudioRouter | null>(null);
  const volumePercentRef = useRef<number>(DEFAULT_VOLUME_PERCENT);
  const audioElementBoundRef = useRef(false);
  const { registerSinkElement } = audioOutput;
  useEffect(() => {
    return registerSinkElement(remoteAudioRef.current);
  }, [registerSinkElement, status]);

  // Restore persisted volume on mount (SSR-safe).
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem(VOLUME_STORAGE_KEY);
      if (stored == null) return;
      const parsed = Number(stored);
      if (!Number.isFinite(parsed)) return;
      const clamped = Math.max(0, Math.min(150, Math.round(parsed)));
      setVolumePercent(clamped);
      volumePercentRef.current = clamped;
    } catch {
      // silent fallback to default
    }
  }, []);

  // Persist + apply volume on every change.
  useEffect(() => {
    volumePercentRef.current = volumePercent;
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(
          VOLUME_STORAGE_KEY,
          String(volumePercent),
        );
      } catch {
        // best-effort — private browsing / quota errors
      }
    }
    audioRouterRef.current?.setVolume(volumePercent);
  }, [volumePercent]);

  const handleVolumeChange = useCallback((next: number) => {
    setVolumePercent(next);
  }, []);

  const disposeAudioRouter = useCallback(() => {
    if (audioRouterRef.current) {
      audioRouterRef.current.dispose();
      audioRouterRef.current = null;
      audioElementBoundRef.current = false;
    }
  }, []);
  const roomRef = useRef<Room | null>(null);
  // voice-A4 — reactive handles for network-quality + stats hooks.
  const [roomState, setRoomState] = useState<Room | null>(null);
  const [localParticipant, setLocalParticipant] =
    useState<LocalParticipant | null>(null);
  const [networkStatsOpen, setNetworkStatsOpen] = useState(false);
  const callStats = useVideoCallStats(roomState, {
    enabled: networkStatsOpen,
  });
  const localTrackRef = useRef<LocalAudioTrack | null>(null);
  const onDisconnectRef = useRef(onDisconnect);
  onDisconnectRef.current = onDisconnect;
  const hasNotifiedDisconnectRef = useRef(false);
  const hasDisconnectedRef = useRef(false);

  // voice-A9 — disconnect-reason classifier inputs (mirrors VideoRoom B5).
  const ourLocalEndCalledRef = useRef(false);
  const lastTwilioErrorRef = useRef<{ code?: number; message?: string } | null>(
    null,
  );
  const remoteEndedFirstRef = useRef(false);
  const onDisconnectReasonRef = useRef(onDisconnectReason);
  onDisconnectReasonRef.current = onDisconnectReason;
  const [disconnectReason, setDisconnectReason] =
    useState<DisconnectReason | null>(null);
  const [splashDismissed, setSplashDismissed] = useState(false);
  /** voice-B5 — after A9 splash dismisses, show post-call summary until Done. */
  const [summaryDismissed, setSummaryDismissed] = useState(false);

  const publishDisconnectReason = useCallback((reason: DisconnectReason) => {
    setDisconnectReason(reason);
    onDisconnectReasonRef.current?.(reason);
  }, []);

  // --------------------------------------------------------------------------
  // Cockpit Rx-redesign — "Mark no-show" 2-step confirm + busy state.
  // Symmetric with VideoRoom; first click arms a confirm step that auto-
  // cancels after 4s, second click invokes `onMarkNoShow`. Button is
  // rendered only when the prop is supplied (cockpit mount + doctor role).
  // --------------------------------------------------------------------------
  const [noShowStep, setNoShowStep] = useState<"idle" | "confirm">("idle");
  const [noShowBusy, setNoShowBusy] = useState(false);
  const noShowConfirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const handleMarkNoShowClick = useCallback(() => {
    if (!onMarkNoShow) return;
    if (noShowStep === "idle") {
      setNoShowStep("confirm");
      if (noShowConfirmTimerRef.current) {
        clearTimeout(noShowConfirmTimerRef.current);
      }
      noShowConfirmTimerRef.current = setTimeout(
        () => setNoShowStep("idle"),
        4_000,
      );
      return;
    }
    if (noShowConfirmTimerRef.current) {
      clearTimeout(noShowConfirmTimerRef.current);
      noShowConfirmTimerRef.current = null;
    }
    setNoShowBusy(true);
    void Promise.resolve(onMarkNoShow()).finally(() => {
      setNoShowBusy(false);
      setNoShowStep("idle");
    });
  }, [onMarkNoShow, noShowStep]);
  useEffect(() => {
    return () => {
      if (noShowConfirmTimerRef.current) {
        clearTimeout(noShowConfirmTimerRef.current);
      }
    };
  }, []);

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

  // voice-0C — retry-button in-flight state for the inline "Chat
  // unavailable" tile. Prevents double-clicks while the parent's
  // `onCompanionRetry` round-trip is in progress. Reset by a `finally`
  // block in the click handler so a thrown callback (which the
  // contract forbids, but defense-in-depth) doesn't leave the
  // button stuck spinning.
  const [chatRetryPending, setChatRetryPending] = useState(false);
  const handleCompanionRetry = useCallback(async () => {
    if (!companion?.onCompanionRetry) return;
    setChatRetryPending(true);
    try {
      await companion.onCompanionRetry();
    } finally {
      setChatRetryPending(false);
    }
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

  const callHold = useVoiceCallHoldState();
  const holdMicSnapshotRef = useRef<boolean>(false);

  const setRemoteOutputMuted = useCallback((muted: boolean) => {
    const el = remoteAudioRef.current;
    if (el) el.muted = muted;
  }, []);

  const applyHoldMediaLock = useCallback(() => {
    const track = localTrackRef.current;
    holdMicSnapshotRef.current = muted;
    if (track) {
      track.disable();
    }
    setMuted(true);
    setLocalMicStream(null);
    setRemoteOutputMuted(true);
  }, [muted, setRemoteOutputMuted]);

  const releaseHoldMediaLock = useCallback(
    (restoreMicMuted: boolean) => {
      const track = localTrackRef.current;
      if (track) {
        if (restoreMicMuted) {
          track.disable();
        } else {
          track.enable();
        }
      }
      setMuted(restoreMicMuted);
      setLocalMicStream(
        restoreMicMuted || !track
          ? null
          : mediaStreamFromLocalAudioTrack(track),
      );
      setRemoteOutputMuted(false);
    },
    [setRemoteOutputMuted],
  );

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

      if (
        msg.systemEvent === "hold_changed" &&
        chatAuth.status === "ready" &&
        msg.metadata
      ) {
        const actorId =
          typeof msg.metadata.actor_id === "string"
            ? msg.metadata.actor_id
            : null;
        const onHold = msg.metadata.on_hold === true;
        const isSelf =
          actorId !== null && actorId === chatAuth.currentUserId;

        if (onHold && !isSelf) {
          applyHoldMediaLock();
        } else if (!onHold && !isSelf) {
          releaseHoldMediaLock(holdMicSnapshotRef.current);
        }
        callHold.applyHoldChangedMessage(
          msg.metadata,
          chatAuth.currentUserId,
        );
      }
    },
    [
      applyRecordingSystemMessage,
      applyHoldMediaLock,
      releaseHoldMediaLock,
      callHold,
      chatAuth,
    ],
  );

  // --------------------------------------------------------------------------
  // Twilio connection (audio-only)
  // --------------------------------------------------------------------------

  useEffect(() => {
    if (hasDisconnectedRef.current) return;

    let room: Room | null = null;
    let localTrack: LocalAudioTrack | null = null;

    const wireRemoteAudioTrack = (track: RemoteAudioTrack) => {
      const audioEl = remoteAudioRef.current;
      if (!audioEl) return;
      track.attach(audioEl);
      if (audioElementBoundRef.current && audioRouterRef.current) {
        audioRouterRef.current.setVolume(volumePercentRef.current);
        return;
      }
      audioRouterRef.current = createBoostedAudioRouter(audioEl);
      audioRouterRef.current.setVolume(volumePercentRef.current);
      audioElementBoundRef.current = true;
    };

    const teardown = async () => {
      if (audioRouterRef.current) {
        audioRouterRef.current.dispose();
        audioRouterRef.current = null;
        audioElementBoundRef.current = false;
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
      setRoomState(null);
      setLocalParticipant(null);
      setNetworkStatsOpen(false);
      setLocalMicStream(null);
    };

    const attachRemoteAudio = (participant: RemoteParticipant) => {
      participant.audioTracks.forEach((publication) => {
        if (publication.track) {
          wireRemoteAudioTrack(publication.track);
        }
      });
      participant.on("trackSubscribed", (track) => {
        if (track.kind === "audio") {
          wireRemoteAudioTrack(track as RemoteAudioTrack);
        }
      });
    };

    const onRemoteParticipantConnected = (participant: RemoteParticipant) => {
      setRemoteJoined(true);
      attachRemoteAudio(participant);
      // voice-C1 — doctor hears a soft ding when the patient joins (not on reconnect within 5s).
      if (role === "doctor" && isPatientTwilioIdentity(participant.identity)) {
        playPatientJoinedChime();
      }
    };

    const connectRoom = async () => {
      try {
        // voice-C9 — opt the local track into Twilio's first-party
        // noise-cancellation hook. Returns `undefined` when the
        // operator hasn't staged a Krisp/RNNoise bundle, in which case
        // we fall back to a vanilla mic track (call still works — see
        // task acceptance "Krisp plugin failure handled gracefully").
        const noiseCancellationOptions = buildNoiseCancellationOptions();
        localTrack = noiseCancellationOptions
          ? await createLocalAudioTrack({ noiseCancellationOptions })
          : await createLocalAudioTrack();
        // Apply the user's preference once — `noiseCancellation`
        // defaults to enabled when the option is present, but doctors
        // / patients who turned the toggle OFF should not hear it
        // engage on call start.
        void applyNoiseSuppressionPreference(
          localTrack,
          noiseSuppressionInitialRef.current,
        );
        localTrackRef.current = localTrack;
        setLocalMicStream(mediaStreamFromLocalAudioTrack(localTrack));

        room = await connect(accessToken, {
          name: roomName,
          audio: true,
          video: false,
          tracks: [localTrack],
          // voice-A4 — enables `networkQualityLevel` on localParticipant.
          networkQuality: { local: 1, remote: 1 },
        });
        roomRef.current = room;
        setRoomState(room);
        setLocalParticipant(room.localParticipant);
        setStatus("connected");
        setConnectedAt((prev) => prev ?? new Date());

        if (room.participants.size > 0) {
          room.participants.forEach(onRemoteParticipantConnected);
        }

        room.on("participantConnected", onRemoteParticipantConnected);
        room.on("participantDisconnected", () => {
          remoteEndedFirstRef.current = true;
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

        room.on("disconnected", (_room, error) => {
          hasDisconnectedRef.current = true;
          if (error && typeof error === "object") {
            const errCode = (error as { code?: number }).code;
            const errMessage = (error as { message?: string }).message;
            lastTwilioErrorRef.current = {
              code: typeof errCode === "number" ? errCode : undefined,
              message: typeof errMessage === "string" ? errMessage : undefined,
            };
          }
          publishDisconnectReason(
            classifyDisconnect({
              twilioError: lastTwilioErrorRef.current,
              ourLocalEndCalled: ourLocalEndCalledRef.current,
              remoteEndedFirst: remoteEndedFirstRef.current,
            }),
          );
          setRoomState(null);
          setLocalParticipant(null);
          setNetworkStatsOpen(false);
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
  }, [accessToken, roomName, publishDisconnectReason]);

  // voice-C9 — mid-call noise-suppression toggle. Twilio's
  // `noiseCancellation` processor supports live enable/disable without
  // re-publishing the track, so we just call into it whenever the
  // persisted preference flips (in this tab OR cross-tab via the
  // `storage` event the hook observes). Safe no-op when the track was
  // created without the processor (graceful-degrade path).
  useEffect(() => {
    if (status !== "connected") return;
    void applyNoiseSuppressionPreference(
      localTrackRef.current,
      noiseSuppression.enabled,
    );
  }, [noiseSuppression.enabled, status]);

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
  // Sub-batch C · task-voice-C2 — QoS health metrics reporter.
  //
  // Mounts once we have BOTH a live Twilio room AND a resolved bearer
  // token. Resolution rules mirror the post-call-summary fetch path:
  //   - sessionId: companion.sessionId ?? recordingSessionId
  //   - bearer:    recordingToken ?? chatAuth.accessToken (when ready)
  //
  // The reporter samples on a 10s-then-30s cadence and flushes every
  // 60s + on dispose. The poster swallows network errors itself; the
  // reporter's flush loop additionally retries on the next interval
  // (subject to its high-watermark cap).
  //
  // Skipped silently in `mode='readonly'` (Plan 07 history viewer
  // doesn't open a Twilio room) and when no bearer/sessionId are
  // available (voice-only mounts without recording or companion auth
  // — rare edge; QoS is fire-and-forget so missing samples are
  // acceptable).
  //
  // @see frontend/lib/voice/quality-reporter.ts
  // @see backend/src/services/voice-call-quality-service.ts
  // @see docs/Work/Daily-plans/April 2026/28-04-2026/Tasks/voice/task-voice-C2-qos-health-metrics.md
  // --------------------------------------------------------------------------
  const chatAuthAccessToken =
    chatAuth.status === "ready" ? chatAuth.accessToken : null;
  useEffect(() => {
    if (isReadonly) return;
    if (!roomState) return;
    const sid = companion?.sessionId ?? recordingSessionId ?? null;
    if (!sid) return;
    const bearer = recordingToken ?? chatAuthAccessToken ?? null;
    if (!bearer) return;
    const resolvedRole: "doctor" | "patient" =
      role === "patient" ? "patient" : "doctor";

    // Capture into closures so the poster always uses the
    // initial-mount values (token rotation mid-call would be its own
    // follow-up; for v1 the bearer is stable across the call lifespan).
    const capturedBearer = bearer;
    const capturedSessionId = sid;
    let reporter: VoiceQualityReporter | null = null;
    try {
      reporter = createVoiceQualityReporter({
        room: roomState,
        sessionId: capturedSessionId,
        role: resolvedRole,
        poster: (samples) =>
          postConsultationVoiceQuality(
            capturedBearer,
            capturedSessionId,
            samples,
          ),
      });
    } catch (err) {
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          "Failed to start voice QoS reporter:",
          err instanceof Error ? err.message : err,
        );
      }
      return;
    }

    return () => {
      try {
        reporter?.dispose();
      } catch {
        // Disposal must never throw — best-effort.
      }
    };
    // Lifecycle is bound to (roomState, role, bearer, sid). We don't
    // re-mount on companion / recordingToken object identity changes
    // alone — the resolved primitive bearer + sid above carry the
    // signal that matters.
  }, [
    roomState,
    role,
    recordingSessionId,
    companion?.sessionId,
    recordingToken,
    chatAuthAccessToken,
    isReadonly,
  ]);

  // --------------------------------------------------------------------------
  // Controls
  // --------------------------------------------------------------------------

  const emitMuteChangedBanner = useCallback(
    (nextMuted: boolean) => {
      if (!companion?.sessionId || chatAuth.status !== "ready") return;
      const actorName =
        localActorName?.trim() ||
        (role === "patient" ? "Patient" : "Doctor");
      postConsultationMuteChanged(
        chatAuth.accessToken,
        companion.sessionId,
        { muted: nextMuted, actorName },
      ).catch((err) => {
        if (process.env.NODE_ENV !== "production") {
          console.warn(
            "Failed to post mute_changed banner:",
            err instanceof Error ? err.message : err,
          );
        }
      });
    },
    [companion, chatAuth, role, localActorName],
  );

  const emitHoldChangedBanner = useCallback(
    (onHold: boolean) => {
      if (!companion?.sessionId || chatAuth.status !== "ready") return;
      const actorName =
        localActorName?.trim() ||
        (role === "patient" ? "Patient" : "Doctor");
      postConsultationHoldChanged(
        chatAuth.accessToken,
        companion.sessionId,
        { onHold, actorName },
      ).catch((err) => {
        if (process.env.NODE_ENV !== "production") {
          console.warn(
            "Failed to post hold_changed banner:",
            err instanceof Error ? err.message : err,
          );
        }
      });
    },
    [companion, chatAuth, role, localActorName],
  );

  const handleToggleHold = useCallback(() => {
    if (!callHold.canToggleHold) return;
    const track = localTrackRef.current;
    if (!track) return;

    if (callHold.holdState === "live") {
      const snapshot = callHold.beginSelfHold({ micMutedBefore: muted });
      holdMicSnapshotRef.current = snapshot.micMutedBefore;
      applyHoldMediaLock();
      emitHoldChangedBanner(true);
      return;
    }

    if (callHold.holdState === "hold-by-self") {
      const snapshot = callHold.endSelfHold();
      if (!snapshot) return;
      releaseHoldMediaLock(snapshot.micMutedBefore);
      emitHoldChangedBanner(false);
    }
  }, [
    callHold,
    muted,
    applyHoldMediaLock,
    releaseHoldMediaLock,
    emitHoldChangedBanner,
  ]);

  const toggleMute = useCallback(() => {
    if (callHold.isOnHold) return;
    const track = localTrackRef.current;
    if (!track) return;
    const nextMuted = !muted;
    if (muted) {
      track.enable();
      setMuted(false);
    } else {
      track.disable();
      setMuted(true);
    }
    emitMuteChangedBanner(nextMuted);
  }, [muted, emitMuteChangedBanner, callHold.isOnHold]);

  const handleLeave = useCallback(() => {
    hasDisconnectedRef.current = true;
    ourLocalEndCalledRef.current = true;
    disposeAudioRouter();
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
    setLocalMicStream(null);
    if (room) {
      room.removeAllListeners();
      room.disconnect();
      roomRef.current = null;
    }
    publishDisconnectReason(
      classifyDisconnect({
        twilioError: lastTwilioErrorRef.current,
        ourLocalEndCalled: ourLocalEndCalledRef.current,
        remoteEndedFirst: remoteEndedFirstRef.current,
      }),
    );
    setRoomState(null);
    setLocalParticipant(null);
    setNetworkStatsOpen(false);
    setStatus("disconnected");
    if (!hasNotifiedDisconnectRef.current) {
      hasNotifiedDisconnectRef.current = true;
      onDisconnectRef.current?.();
    }
  }, [publishDisconnectReason, disposeAudioRouter]);

  const handleLeaveClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      if (event.shiftKey) {
        handleLeave();
        return;
      }
      setEndConfirmOpen(true);
    },
    [handleLeave],
  );

  const handleEndConfirmCancel = useCallback(() => {
    setEndConfirmOpen(false);
  }, []);

  const handleEndConfirmConfirm = useCallback(() => {
    setEndConfirmOpen(false);
    handleLeave();
  }, [handleLeave]);

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

  // voice-B1 — reconnection UX (hook + banner shipped by video B4).
  const handleReconnectRejoin = useCallback(() => {
    if (onRejoin) {
      onRejoin();
      return;
    }
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  }, [onRejoin]);
  const reconnect = useTwilioReconnectState({
    room: roomState,
    onRejoinRequested: handleReconnectRejoin,
  });

  // --------------------------------------------------------------------------
  // Sub-batch C · task-voice-C4 — multi-tab kick / multi-monitor warn.
  // Shared hook + banner from video E3; voice-specific teardown below.
  // --------------------------------------------------------------------------
  const effectiveSessionId =
    recordingSessionId ?? companion?.sessionId ?? null;
  const effectiveRole: TabPresenceRole | null = role ?? null;
  const tabPresence = useTabPresenceClaim(
    isReadonly ? null : effectiveSessionId,
    isReadonly ? null : effectiveRole,
  );

  const inCallActive =
    status === "connected" &&
    !isReadonly &&
    tabPresence.status !== "kicked";

  // Sub-batch C · task-voice-C6 + C10 — MediaSession, persistent foreground
  // notification (video F3 foundation), hardware volume keys. Decision §14:
  // `pause` = mute mic, NOT hold.
  const callMediaSession = useCallMediaSession({
    sessionId: effectiveSessionId ?? "",
    callerName: role === "patient" ? "Doctor" : "Patient",
    modality: "voice",
    isMuted: muted,
    isOnHold: callHold.isOnHold,
    onPause: toggleMute,
    onPlay: toggleMute,
    onStop: handleEndConfirmConfirm,
    enabled: inCallActive,
  });

  // voice-C8 — proximity-driven screen blanking on Chrome Android (earpiece).
  const audioRoute = useMemo(
    () =>
      inferRouteFromDeviceId(
        audioOutput.current?.deviceId ?? null,
        audioOutput.devices,
      ),
    [audioOutput.current?.deviceId, audioOutput.devices],
  );
  useProximityWakeLock(inCallActive, audioRoute === "earpiece");

  const handleNewOutputSwitch = useCallback(
    (deviceId: string) => {
      void audioOutput.setOutput(deviceId);
      audioOutput.dismissNewDevice();
    },
    [audioOutput],
  );

  const tabKickHandledRef = useRef(false);

  useEffect(() => {
    if (tabPresence.status !== "kicked") return;
    if (tabKickHandledRef.current) return;
    tabKickHandledRef.current = true;

    hasDisconnectedRef.current = true;

    const track = localTrackRef.current;
    if (track) {
      try {
        track.disable();
        track.stop();
      } catch {
        /* noop */
      }
      localTrackRef.current = null;
      setLocalMicStream(null);
    }

    setRemoteOutputMuted(true);

    const room = roomRef.current;
    if (room) {
      try {
        room.removeAllListeners();
      } catch {
        /* noop */
      }
      try {
        room.disconnect();
      } catch {
        /* noop */
      }
      roomRef.current = null;
      setRoomState(null);
      setLocalParticipant(null);
      setNetworkStatsOpen(false);
    }

    // Deliberately skip `onDisconnect` + `setStatus('disconnected')` so the
    // kick overlay remains the canonical surface (see VideoRoom E3 contract).
  }, [setRemoteOutputMuted, tabPresence.status]);

  const handleTabKickTakeOver = useCallback(() => {
    tabPresence.takeOver();
    if (typeof window === "undefined") return;
    window.setTimeout(() => {
      window.location.reload();
    }, 200);
  }, [tabPresence]);

  const [showRejoinBanner, setShowRejoinBanner] = useState(rejoined);

  useEffect(() => {
    if (!rejoined) return;
    setShowRejoinBanner(true);
    const handle = window.setTimeout(() => {
      setShowRejoinBanner(false);
    }, 3000);
    return () => window.clearTimeout(handle);
  }, [rejoined]);

  const reconnectionBanner = !isReadonly ? (
    <div
      className={
        reconnect.status !== "live"
          ? "relative min-h-[2.5rem] shrink-0"
          : undefined
      }
    >
      <ReconnectionBanner
        status={reconnect.status}
        countdownSeconds={reconnect.countdownSeconds}
        onTryNow={reconnect.tryNow}
        onRejoin={reconnect.rejoinNow}
        autoFocusAction={reconnect.status === "failed"}
      />
    </div>
  ) : null;

  // --------------------------------------------------------------------------
  // Render helpers
  // --------------------------------------------------------------------------

  const remoteLabel = role === "patient" ? "Doctor" : "Patient";
  const isPatientRole = role === "patient";

  const callerCardCounterparty = useMemo(
    () => ({
      name:
        counterpartyName?.trim() ||
        (isPatientRole ? "Your doctor" : "Patient"),
      role: isPatientRole ? ("doctor" as const) : ("patient" as const),
      avatarUrl: counterpartyAvatarUrl,
      practiceName: isPatientRole ? practiceName : undefined,
    }),
    [
      counterpartyName,
      counterpartyAvatarUrl,
      isPatientRole,
      practiceName,
    ],
  );

  const callerCardStatus: CallerCardHeaderStatus = isReadonly
    ? "ended"
    : reconnect.status !== "live"
      ? "reconnecting"
      : callHold.isOnHold
        ? "hold"
        : status === "connecting"
          ? "connecting"
          : "live";

  const effectiveShowCompanion = !isCockpit || showInCallChat;
  const showCallerCardInHeader =
    isReadonly || Boolean(companion && effectiveShowCompanion);
  const callerCardLayout: CallerCardHeaderLayout = showCallerCardInHeader
    ? isDesktopLayout
      ? "panel"
      : "standalone"
    : "canvas";

  const formatStatMs = (n: number | null) =>
    n == null ? "—" : `${n}ms`;
  const formatStatLoss = (n: number | null) =>
    n == null ? "—" : `${n}%`;
  const networkStatsTooltip = (
    <p className="font-mono leading-relaxed text-gray-800">
      RTT {formatStatMs(callStats.rttMs)} · Jitter{" "}
      {formatStatMs(callStats.jitterMs)} · Loss{" "}
      {formatStatLoss(callStats.packetLossPct)}
    </p>
  );

  const callerCardProps = {
    counterparty: callerCardCounterparty,
    connectedAt,
    room: roomState,
    status: callerCardStatus,
    layout: callerCardLayout,
    staticDurationLabel,
    networkStatsTooltip,
    onNetworkStatsOpenChange: setNetworkStatsOpen,
  };

  if (status === "error") {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <p className="font-medium text-red-800">Voice connection failed</p>
        <p className="mt-1 text-sm text-red-700">{errorMessage}</p>
      </div>
    );
  }

  if (status === "disconnected") {
    if (isReadonly) {
      return (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 text-center">
          <p className="font-medium text-gray-800">Call ended</p>
        </div>
      );
    }
    if (splashDismissed) {
      const postCallSessionId =
        recordingSessionId ?? companion?.sessionId ?? undefined;
      const postCallBearer =
        recordingToken ??
        (chatAuth.status === "ready" ? chatAuth.accessToken : undefined);
      if (
        !summaryDismissed &&
        postCallSessionId &&
        postCallBearer
      ) {
        return (
          <CallPostCallSummary
            sessionId={postCallSessionId}
            bearerJwt={postCallBearer}
            mountContext="post-call"
            disconnectReason={disconnectReason ?? undefined}
            onClose={() => setSummaryDismissed(true)}
          />
        );
      }
      return (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 text-center">
          <p className="font-medium text-gray-800">Call ended</p>
          <p className="mt-1 text-sm text-gray-600">
            You have left the voice consultation.
          </p>
        </div>
      );
    }
    const handleSplashRejoin = () => {
      if (onRejoin) {
        onRejoin();
        return;
      }
      if (typeof window !== "undefined") {
        window.location.reload();
      }
    };
    const handleSplashRestart = () => {
      if (onRestart) {
        onRestart();
        return;
      }
      if (typeof window !== "undefined") {
        window.location.reload();
      }
    };
    return (
      <VoicePostCallSplash
        reason={disconnectReason ?? "unknown"}
        role={role === "patient" ? "patient" : "doctor"}
        actorLabel={remoteLabel}
        onDismiss={() => setSplashDismissed(true)}
        onRejoin={handleSplashRejoin}
        onRestart={handleSplashRestart}
      />
    );
  }

  const header = (
    <header
      className="border-b border-gray-200 bg-white"
      aria-label="Voice consultation header"
    >
      {showCallerCardInHeader ? (
        <>
          <CallerCardHeader
            {...callerCardProps}
            layout={callerCardLayout}
            className={
              callerCardLayout === "panel"
                ? "sticky top-0 z-10 border-0 shadow-none"
                : undefined
            }
          />
          {reconnectionBanner}
        </>
      ) : null}
      <div className="flex items-center justify-end gap-2 px-3 py-2">
        {/* controls — caller identity lives in CallerCardHeader (voice-A8) */}
        <span className="sr-only">
          {remoteJoined
            ? `${remoteLabel} on the line`
            : `Waiting for ${remoteLabel.toLowerCase()}…`}
        </span>
        {/* task-cockpit-fix-3: In cockpit mode, show compact recording pill instead of full controls.
            Full RecordingControls accessible via More ▾. */}
        {recordingEnabled && recordingSessionId && recordingToken ? (
          isCockpit ? (
            recordingState.loading ? null : recordingState.paused ? (
              <div className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                <span aria-hidden>⏸</span>
                <span>Paused</span>
              </div>
            ) : (
              <div className="inline-flex items-center gap-1 rounded-full border border-red-300 bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700">
                <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-red-600" aria-hidden />
                <span>REC</span>
              </div>
            )
          ) : (
            <RecordingControls
              sessionId={recordingSessionId}
              token={recordingToken}
              currentUserRole={role === "patient" ? "patient" : "doctor"}
              state={recordingState}
            />
          )
        ) : null}
        
        {!isReadonly ? (
          <MicMeterBar
            stream={muted ? null : localMicStream}
            mode="vertical-tiny"
            className="flex-shrink-0"
          />
        ) : null}
        {!isReadonly ? (
          isDesktopLayout ? (
            <AudioOutputPicker
              audioOutput={audioOutput}
              className="hidden min-w-[140px] max-w-[200px] sm:block [&_select]:py-1 [&_select]:text-xs"
            />
          ) : (
            <SpeakerEarpieceToggle
              audioOutput={audioOutput}
              className="[&_button]:px-2 [&_button]:py-1 [&_button]:text-xs [&_span:first-child]:hidden"
            />
          )
        ) : null}
        {!isReadonly ? (
          <VolumeSlider
            value={volumePercent}
            onChange={handleVolumeChange}
            disabled={audioRouterRef.current == null || callHold.isOnHold}
            ariaLabel={`${remoteLabel}'s volume`}
          />
        ) : null}
        <button
          type="button"
          onClick={handleToggleHold}
          disabled={!callHold.canToggleHold}
          aria-pressed={callHold.isOnHold}
          title={
            callHold.holdState === "hold-by-other"
              ? "Only the other party can resume the call"
              : callHold.isOnHold
                ? "Resume the call"
                : "Put the call on hold"
          }
          className={
            "rounded-md px-2.5 py-1 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50 " +
            (callHold.isOnHold
              ? "bg-amber-100 text-amber-900 ring-1 ring-amber-300"
              : "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50")
          }
        >
          {callHold.holdState === "hold-by-self" ? "Resume" : "Hold"}
        </button>
        <button
          type="button"
          onClick={toggleMute}
          disabled={callHold.isOnHold}
          aria-pressed={muted}
          className={
            "rounded-md px-2.5 py-1 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50 " +
            (muted
              ? "bg-amber-100 text-amber-900 ring-1 ring-amber-300"
              : "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50")
          }
        >
          {muted ? "Unmute" : "Mute"}
        </button>
        {/* voice-C9 — per-call noise-suppression toggle. Hidden when
            the operator hasn't staged the Krisp/RNNoise bundle so the
            doctor doesn't see a non-functional control. Flipping
            updates `localStorage` immediately + drives the
            mid-call enable/disable effect above. */}
        {!isReadonly && noiseSuppressionAvailable ? (
          <button
            type="button"
            onClick={noiseSuppression.toggle}
            aria-pressed={noiseSuppression.enabled}
            title={
              noiseSuppression.enabled
                ? "Background noise suppression is on. Click to turn off."
                : "Background noise suppression is off. Click to turn on."
            }
            className={
              "rounded-md px-2.5 py-1 text-xs font-medium " +
              (noiseSuppression.enabled
                ? "bg-emerald-100 text-emerald-900 ring-1 ring-emerald-300"
                : "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50")
            }
            data-testid="incall-noise-suppression-toggle"
          >
            {noiseSuppression.enabled ? "Noise: on" : "Noise: off"}
          </button>
        ) : null}
        {/*
         * Cockpit Rx-redesign — "Mark no-show" destructive ghost button.
         *
         * Sits immediately before "End call" so the destructive cluster
         * is grouped (industry precedent: Zoom / Meet keep terminal
         * actions together). Two-step confirm matches the VideoRoom
         * pattern; rendered only when `onMarkNoShow` is supplied
         * (cockpit + doctor role).
         */}
        {onMarkNoShow ? (
          <button
            type="button"
            onClick={handleMarkNoShowClick}
            disabled={noShowBusy}
            title={
              noShowStep === "confirm"
                ? "Click again to confirm no-show"
                : "Mark this patient as a no-show"
            }
            aria-label={
              noShowStep === "confirm"
                ? "Confirm marking patient as no-show"
                : "Mark patient as no-show"
            }
            className={
              noShowStep === "confirm"
                ? "rounded-md border border-red-600 bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-60"
                : "rounded-md border border-red-300 bg-white px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-60"
            }
          >
            {noShowBusy
              ? "Marking…"
              : noShowStep === "confirm"
                ? "Confirm no-show?"
                : "Mark no-show"}
          </button>
        ) : null}
        <button
          type="button"
          onClick={handleLeaveClick}
          title="Shift-click to skip the confirmation"
          className="rounded-md bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700"
        >
          End call
        </button>
        {/* task-cockpit-fix-3: More ▾ overflow menu in cockpit mode */}
        {isCockpit && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="More room controls"
                className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white p-1 text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                <MoreHorizontal className="h-3.5 w-3.5" aria-hidden />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {/* Recording */}
              {recordingEnabled && recordingSessionId && recordingToken &&
              role !== "patient" ? (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>Recording</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {recordingState.paused ? (
                      <DropdownMenuItem
                        onClick={() => {
                          if (recordingToken && recordingSessionId) {
                            resumeRecording(recordingToken, recordingSessionId).catch(
                              () => {},
                            );
                          }
                        }}
                      >
                        Resume recording
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem
                        onClick={() => {
                          const reason = window.prompt(
                            "Reason for pausing recording (5–200 characters):",
                          );
                          if (
                            reason &&
                            reason.trim().length >= 5 &&
                            recordingToken &&
                            recordingSessionId
                          ) {
                            pauseRecording(
                              recordingToken,
                              recordingSessionId,
                              reason.trim(),
                            ).catch(() => {});
                          }
                        }}
                      >
                        Pause recording
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              ) : null}
              <DropdownMenuSeparator />
              {/* Show in-call chat */}
              <DropdownMenuItem onClick={() => setShowInCallChat((v) => !v)}>
                {showInCallChat ? (
                  <Check className="mr-2 h-4 w-4" />
                ) : (
                  <span className="mr-2 inline-block w-4" />
                )}
                Show in-call chat
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
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
  // task-cockpit-fix-3: in cockpit mode, the companion canvas is suppressed
  // by default (showInCallChat = false). "Show in-call chat" in More ▾ re-enables it.
  // --------------------------------------------------------------------------

  const holdBanner =
    !isReadonly && callHold.isOnHold ? (
      <HoldCallBanner
        holdState={callHold.holdState}
        actorName={callHold.remoteHoldActorName ?? undefined}
        onResume={
          callHold.holdState === "hold-by-self" ? handleToggleHold : undefined
        }
      />
    ) : null;

  const canvas = (() => {
    if (companion && effectiveShowCompanion) {
      if (chatAuth.status === "ready") {
        return (
          <div className="relative flex min-h-0 flex-1 flex-col">
            {holdBanner}
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
          </div>
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
        // voice-0C — graceful degrade. Reassuring copy ("call is still
        // connected" — the call ISN'T affected by chat trouble); inline
        // Retry button when the parent supplied an `onCompanionRetry`
        // callback (patient flow); disabled placeholder otherwise
        // (doctor flow has Supabase-session refresh as the right
        // primitive instead — refreshing the dashboard is the doctor
        // recovery path).
        const canRetry = Boolean(companion.onCompanionRetry);
        return (
          <div
            className="flex h-full min-h-[320px] flex-col items-center justify-center gap-2 p-4 text-center text-sm text-gray-500"
            data-companion-tile="unavailable"
          >
            <p className="font-medium text-gray-700">Chat unavailable</p>
            <p className="text-xs">Your call is still connected.</p>
            {chatAuth.reason ? (
              <p className="text-[11px] text-gray-400">{chatAuth.reason}</p>
            ) : null}
            <button
              type="button"
              onClick={canRetry ? handleCompanionRetry : undefined}
              disabled={!canRetry || chatRetryPending}
              aria-disabled={!canRetry || chatRetryPending}
              title={
                canRetry
                  ? "Try to reconnect the chat channel."
                  : "Refresh the page to retry."
              }
              className={
                "mt-1 w-fit rounded-md border px-3 py-1 text-xs " +
                (canRetry && !chatRetryPending
                  ? "border-blue-500 text-blue-700 hover:bg-blue-50"
                  : "border-gray-300 text-gray-400")
              }
            >
              {chatRetryPending ? "Retrying…" : "Retry"}
            </button>
          </div>
        );
      }
    }
    // Voice-only fallback (no companion). Large pulsing indicator
    // fills the canvas; Principle 8 LOCKED — no phone iconography.
    return (
      <div className="relative flex h-full min-h-[320px] flex-col items-center justify-center gap-4 p-6 text-center">
        {holdBanner}
        {!showCallerCardInHeader ? (
          <div className="absolute inset-x-0 top-3 z-10 px-3">
            <CallerCardHeader {...callerCardProps} layout="canvas" />
            {reconnectionBanner}
          </div>
        ) : null}
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
      className="relative flex h-full min-h-[320px] w-full flex-col overflow-hidden rounded-lg border border-gray-200 bg-white"
      data-voice-room="true"
      data-has-companion={companion ? "true" : "false"}
    >
      {header}
      {recordingBanner}
      {pendingBanner}
      {showRejoinBanner && tabPresence.status !== "kicked" ? (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none absolute left-1/2 top-3 z-30 -translate-x-1/2"
        >
          <div className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-emerald-100/95 px-3 py-1 text-xs font-medium text-emerald-900 shadow-sm ring-1 ring-emerald-300/60 backdrop-blur">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-3.5 w-3.5 shrink-0"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 1 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z"
                clipRule="evenodd"
              />
            </svg>
            <span>Reconnected — welcome back</span>
          </div>
        </div>
      ) : null}
      {inCallActive && audioOutput.newDeviceJustConnected ? (
        <NewOutputToast
          device={audioOutput.newDeviceJustConnected}
          onSwitch={handleNewOutputSwitch}
          onDismiss={audioOutput.dismissNewDevice}
        />
      ) : null}
      {inCallActive ? (
        <div className="shrink-0 px-3 pb-2">
          <IOSPWABanner
            isIOSPWA={callMediaSession.isIOSPWA}
            hidden={callHold.isOnHold}
          />
        </div>
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col">{canvas}</div>
      {!isReadonly && effectiveRole != null ? (
        <MultiTabKickBanner
          status={tabPresence.status}
          otherTabsCount={tabPresence.otherTabsCount}
          role={effectiveRole}
          onTakeOver={handleTabKickTakeOver}
          mediaMode="audio"
        />
      ) : null}
      {/* Hidden audio sink. Must stay in the DOM while connected so
          `track.attach()` has a target; `autoPlay + playsInline` keeps
          iOS Safari from refusing to start audio. */}
      <audio
        ref={remoteAudioRef}
        autoPlay
        playsInline
        aria-hidden
        data-voice-remote-audio="true"
        className="hidden"
      />
      <EndCallConfirmModal
        isOpen={endConfirmOpen}
        onCancel={handleEndConfirmCancel}
        onConfirm={handleEndConfirmConfirm}
      />
    </div>
  );
}
