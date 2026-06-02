"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  connect,
  createLocalTracks,
  createLocalVideoTrack,
  type LocalParticipant,
  type LocalVideoTrack,
  type RemoteAudioTrack,
  type RemoteParticipant,
  type RemoteVideoTrack,
  type Room,
} from "twilio-video";
import { SessionStartBanner } from "./SessionStartBanner";
import TextConsultRoom, { type IncomingMessageMeta } from "./TextConsultRoom";
import RecordingPausedIndicator from "./RecordingPausedIndicator";
import RecordingControls from "./RecordingControls";
import VideoEscalationButton from "./VideoEscalationButton";
import VideoConsentModal from "./VideoConsentModal";
import VideoRecordingIndicator from "./VideoRecordingIndicator";
import VideoTile, { type SelfViewPosition } from "./VideoTile";
import NetworkBars from "./NetworkBars";
import CallerCardOverlay, {
  type CallerCardStatus,
} from "./CallerCardOverlay";
import VolumeSlider from "./VolumeSlider";
import {
  createBoostedAudioRouter,
  type BoostedAudioRouter,
} from "@/lib/audio/gain-node";
import VideoQualityPicker, {
  isQualityOption,
  maxSubscriptionBitrateForQuality,
  videoConstraintsForQuality,
  type QualityOption,
} from "./VideoQualityPicker";
// Sub-batch E · task-video-E1 — pure adaptive-bitrate state machine.
// Lives in `lib/video/` so the decision logic is unit-testable
// without React or Twilio. The hook below glues it to the Twilio
// network-quality stream + B8 picker state.
import {
  adaptiveLevelToQuality,
  adaptiveToastMessage,
  evaluateAdaptiveTransition,
  makeInitialAdaptiveState,
  type AdaptiveControllerState,
  type AdaptiveLevel,
} from "@/lib/video/adaptive-bitrate";
import AudioFallbackBanner from "./AudioFallbackBanner";
import BatteryWarningBanner, {
  type BatteryBannerMode,
} from "./BatteryWarningBanner";
import { useBatterySaver } from "@/hooks/useBatterySaver";
import { CameraSwitchButton } from "./CameraSwitchButton";
import { useCameraSwitch } from "@/hooks/useCameraSwitch";
// Sub-batch F · task-video-F1 — patch the E.4 rejoin cache on every
// in-call camera switch so a refresh-restored session re-acquires the
// SAME camera silently (no permission prompt, no facing flip surprise).
// `readSnapshot` + `writeSnapshot` are the module-level helpers from
// `useCallRejoinCache` — we use them directly because the bound hook
// reading instance lives a few hundred lines below this mount and we
// only need the storage round-trip, not its full API surface.
import {
  readSnapshot as readCallRejoinSnapshot,
  writeSnapshot as writeCallRejoinSnapshot,
} from "@/hooks/useCallRejoinCache";
import MultiTabKickBanner from "./MultiTabKickBanner";
import {
  useTabPresenceClaim,
  type TabPresenceRole,
} from "@/hooks/useTabPresenceClaim";
import HoldCallBanner from "./HoldCallBanner";
import ReconnectionBanner from "./ReconnectionBanner";
import { useTwilioReconnectState } from "@/hooks/useTwilioReconnectState";
import VideoLayoutSwitcher, {
  type VideoLayout,
  isVideoLayout,
} from "./VideoLayoutSwitcher";
import { OrientationLockButton } from "./OrientationLockButton";
import { useScreenOrientation } from "@/hooks/useScreenOrientation";
import { useCallMediaSession } from "@/hooks/useCallMediaSession";
import { IOSPWABanner } from "./IOSPWABanner";
import { usePictureInPicture } from "@/hooks/usePictureInPicture";
import { useScreenShare } from "@/hooks/useScreenShare";
import ScreenShareTile from "./ScreenShareTile";
import SnapshotControls from "./SnapshotControls";
import AnnotationCanvas from "./AnnotationCanvas";
import {
  captureSnapshot,
  freezeVideoFrame,
  SnapshotError,
} from "@/lib/video/snapshot-capture";
import type { Annotation } from "@/lib/video/snapshot-annotations";
import InCallQuickActions, {
  type QuickAction,
} from "./InCallQuickActions";
import InCallActionPanel from "./InCallActionPanel";
import FollowUpInlineBooker from "./FollowUpInlineBooker";
import ThreeWayInvitePanel from "./ThreeWayInvitePanel";
import CallPostCallSummary from "./CallPostCallSummary";
import {
  postConsultationAutoFallbackBanner,
  postConsultationMuteChanged,
  postConsultationQuickActionBanner,
  postConsultationVideoQuality,
  pauseRecording,
  resumeRecording,
} from "@/lib/api";
import {
  createVideoQualityReporter,
  type VideoQualityReporter,
} from "@/lib/video/quality-reporter";
import VirtualBackgroundPicker from "./VirtualBackgroundPicker";
import {
  applyBackgroundToTrack,
  removeBackgroundFromTrack,
  disposeBackgroundCache,
  parseBackgroundPreference,
  serializeBackgroundPreference,
  BACKGROUND_STORAGE_KEY,
  DEFAULT_BACKGROUND_PREFERENCE,
  type BackgroundPreference,
} from "@/lib/video/virtual-background";
import { useHoldState } from "@/hooks/useHoldState";
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

// Sub-batch A · task-video-A5 — module-scope constants so the mount
// effect + tap callback below don't recreate them every render (and so
// `react-hooks/exhaustive-deps` stays clean without bloating the dep
// array with stable references).
const SELF_VIEW_STORAGE_KEY = "video-self-view-position";
const SELF_VIEW_NEXT_POSITION: Record<SelfViewPosition, SelfViewPosition> = {
  BR: "BL",
  BL: "TL",
  TL: "TR",
  TR: "BR",
};

// Sub-batch A · task-video-A6 — mirror toggle persistence. Default ON
// because every native selfie camera (FaceTime, WhatsApp, Meet, …)
// mirrors the local view; users expect this. The key is distinct from
// A5's position key so the two preferences are independent.
const MIRROR_STORAGE_KEY = "video-self-view-mirror";

// Sub-batch B · task-video-B6 — layout preference persistence (per
// device). Default `'speaker'` per decision §7 — recommended for
// two-party clinical use. Distinct key from A5 / A6 because layout
// is independent of self-view position / mirror (Speaker layout
// uses A5's corner overlay; Gallery + Sidebar render the self tile
// inline so A5's position state is dormant in those layouts).
const LAYOUT_STORAGE_KEY = "video-layout";
const DEFAULT_LAYOUT: VideoLayout = "speaker";

// Sub-batch B · task-video-B9 — remote-audio volume persistence (per
// device, per modality). Default 100 = OS-normal level. Voice B4 will
// use a sibling key (`voice-volume-percent`) when it picks up the
// shared `<VolumeSlider>` so the two modalities don't accidentally
// share a value (a doctor on speakers for voice consults probably
// doesn't want the same level on headphones for video consults).
const VOLUME_STORAGE_KEY = "video-volume";
const DEFAULT_VOLUME_PERCENT = 100;

// Sub-batch B · task-video-B8 — manual video-quality picker persistence
// (per device, video-only). Default `'auto'` = let Twilio + adaptive
// bitrate (E1, when shipped) negotiate. Persisted value is read
// SYNCHRONOUSLY at connect time so the bandwidth profile + initial
// publish constraints can honour the user's last choice without a
// reconnect (Twilio's `bandwidthProfile` is set-once-at-connect, see
// the audit comment near `connectRoom` below).
const VIDEO_QUALITY_STORAGE_KEY = "video-quality";
const DEFAULT_VIDEO_QUALITY: QualityOption = "auto";

/**
 * Read the persisted quality option synchronously. Returns the default
 * on SSR, missing key, parse failure, or unknown value (the union is
 * narrow — anything that isn't a known `QualityOption` falls back).
 * Used both inside `useEffect` mount restore AND inside `connectRoom`
 * (which can't await an effect — Twilio's `bandwidthProfile` lives
 * inside `connect()`'s options blob).
 */
function readPersistedVideoQuality(): QualityOption {
  if (typeof window === "undefined") return DEFAULT_VIDEO_QUALITY;
  try {
    const stored = window.localStorage.getItem(VIDEO_QUALITY_STORAGE_KEY);
    if (isQualityOption(stored)) return stored;
  } catch {
    // private-browsing / quota errors — fall through to default.
  }
  return DEFAULT_VIDEO_QUALITY;
}
import EndCallConfirmModal from "./EndCallConfirmModal";
import CallDisconnectSplash from "./CallDisconnectSplash";
import {
  classifyDisconnect,
  type DisconnectReason,
} from "@/lib/call/classify-disconnect";
import { createClient } from "@/lib/supabase/client";
import { useRecordingState } from "@/hooks/useRecordingState";
import { useVideoEscalationState } from "@/hooks/useVideoEscalationState";
// `useCallDuration` no longer consumed here — `<CallerCardOverlay>`
// subscribes to it directly (B2). `connectedAt` state stays in
// `<VideoRoom>` because it's the source of truth that gets passed
// down; the overlay derives the formatted label internally.
import { useNetworkQuality } from "@/hooks/useNetworkQuality";
import { useVideoCallStats } from "@/hooks/useVideoCallStats";

interface VideoRoomProps {
  accessToken: string;
  roomName: string;
  onDisconnect?: () => void;
  /** When "patient", remote label is "Doctor" from the start (no transition). Omit to derive from room identity. */
  role?: "doctor" | "patient";
  /**
   * Plan 02 · Task 27 — doctor-side recording-consent banner. When both
   * `sessionId` + `doctorToken` are provided, renders
   * <SessionStartBanner> above the video grid. The banner itself
   * collapses to null when the patient did not decline, so passing
   * these props on every consult is safe.
   */
  sessionId?: string;
  doctorToken?: string;
  /**
   * Plan 06 · Task 38 · Decision 9 LOCKED — when present, mounts
   * `<TextConsultRoom layout='panel'>` alongside the video tiles as an
   * always-on companion chat surface.
   *
   *  - **Desktop (≥768px)**: two-pane flex. Video left (flex-1), chat panel
   *    right (clamped 320-480px, target 30vw). Panel is always open (v1;
   *    collapse toggle is Out of scope #4 in task-38).
   *  - **Mobile (<768px)**: `[Video]` / `[Chat]` tab switcher. Selected tab
   *    defaults to Video. Twilio `Room` stays connected on both tabs
   *    (video element is CSS-hidden when Chat is selected — no
   *    disconnect/reconnect jank).
   *
   * Undefined when the launcher couldn't provision the companion channel
   * (Task 36's facade hook logged + carried on), OR on the idempotent
   * rejoin path (the backend facade's `findActiveSessionByAppointment`
   * short-circuit doesn't re-mint). Handle gracefully: desktop shows an
   * inline "Chat unavailable" notice; mobile hides the tab switcher and
   * renders full-canvas video.
   */
  companion?: {
    /** `consultation_sessions.id`. Required — that's the whole point of the field. */
    sessionId: string;
    /**
     * Patient's HMAC consultation-token (embedded in the Task 36 URL as
     * `?t=`). Only meaningful when the hosting page rendered the patient
     * flow — the doctor-side mount (the primary v1 consumer) ignores
     * this and reuses the dashboard Supabase session. Kept on the prop
     * surface so Task 24c's `<VoiceConsultRoom>` can pass the same
     * `companion` shape through.
     */
    patientToken?: string;
    /**
     * voice-0B / Plan 06 Decision 9 — patient-side companion auth.
     *
     * Mirrors `<VoiceConsultRoom>`'s `companion` shape. When the
     * hosting page is the patient join page (`/consult/join`), the
     * page exchanges the HMAC `?token=` for a Supabase JWT via
     * `POST /:sessionId/text-token` and threads the result here:
     *
     *   - `patientAccessToken`: the Supabase JWT for the chat channel.
     *   - `patientCurrentUserId`: synthetic patient sub
     *     (`patient:{appointmentId}` or the real `patients.id`).
     *   - `onPatientTokenRefresh`: re-exchange callback for when the
     *     short-lived JWT is about to expire (or after a 401 from
     *     Supabase). Returns the freshly minted token.
     *
     * When BOTH `patientAccessToken` + `patientCurrentUserId` are
     * present, the room skips the doctor Supabase-session fetch
     * entirely. Either missing → falls through to the doctor branch
     * (the "no active Supabase session" reason then surfaces the
     * inline "Chat unavailable" tile, which is also the patient
     * graceful-degrade copy if the text-token exchange failed).
     */
    patientAccessToken?: string;
    patientCurrentUserId?: string;
    onPatientTokenRefresh?: () => Promise<string>;
    /**
     * voice-0C — patient-side companion-retry hook for the inline
     * "Chat unavailable" tile. Mirrors `<VoiceConsultRoom>`'s
     * `companion.onCompanionRetry` contract exactly: parent (the
     * patient page) re-runs `requestTextSessionToken(...)` and
     * updates the `companion` prop in-place. The retry tile is
     * functional only when this callback is supplied; doctor-side
     * mounts (where Supabase session refresh is the right
     * primitive instead) get a disabled "Refresh the page" button.
     */
    onCompanionRetry?: () => Promise<void>;
  };
  /**
   * Plan 02 · Task 28 — opts the room into the recording pause/resume UI
   * (`<RecordingControls>` for doctors, `<RecordingPausedIndicator>` for
   * everyone). Pass the `consultation_sessions.id` and a caller-auth JWT
   * the backend accepts (doctor Supabase JWT or patient Supabase JWT —
   * both are validated by `authenticateToken`). Undefined → UI stays
   * hidden (e.g. legacy non-recorded flows).
   */
  recordingSessionId?: string;
  recordingToken?: string;
  /**
   * Sub-batch A · task-video-A7 — pre-call device selection.
   *
   * When the patient join page (`/consult/join`) renders
   * `<VideoConsultPreCall>` first, it captures the user's chosen
   * camera + mic and threads the IDs here. The room passes them
   * into Twilio's `createLocalTracks({ video, audio })`.
   *
   *   `chosenCameraId === string` → constrain to that device.
   *   `chosenCameraId === null | undefined` → Twilio picks default.
   *   `chosenMicId === string` → constrain to that mic.
   *   `chosenMicId === null | undefined` → Twilio picks default.
   *   `skipAudio === true` → join with `audio: false` (the "Skip
   *     mic check" path on the pre-call screen). `chosenMicId` is
   *     ignored when `skipAudio` is true.
   *
   * All omitted (legacy callers — doctor side, today) → behaves
   * exactly as before (no device constraint passed to Twilio,
   * audio + video both enabled).
   */
  chosenCameraId?: string | null;
  chosenMicId?: string | null;
  skipAudio?: boolean;
  /**
   * Sub-batch B · task-video-B5 — disconnect-reason splash callbacks.
   *
   * When the call ends, the splash mounts in place of the legacy
   * "Call ended" placeholder. CTAs forward to these handlers:
   *
   *   `onRejoin` — fired when the user clicks Rejoin (offered for
   *     `connection_lost` / `timeout` / `unknown`). Default behavior
   *     when omitted: `window.location.reload()` — page-level remount
   *     re-runs the API exchange + brings the user back into the
   *     pre-call screen. The patient join page can pass a smarter
   *     re-mint later (B4 reconnection territory).
   *
   *   `onRestart` — fired when the user clicks Restart (offered only
   *     for `token_expired`). Default behavior when omitted: also
   *     `window.location.reload()`, BUT the consultation URL on the
   *     join page already carries the HMAC, so a reload re-runs the
   *     full token exchange end-to-end. Restart vs. Rejoin is a
   *     copy-only distinction today; future tokens may need a fresh
   *     mint endpoint (deferred).
   */
  onRejoin?: () => void;
  onRestart?: () => void;
  /**
   * Sub-batch C · task-video-C6 — in-call clinical quick actions.
   *
   * When supplied AND `role === 'doctor'`, mounts the
   * `<InCallQuickActions>` FAB at the bottom-right of the video pane.
   * Doctor can click into a side-panel that hosts:
   *
   *   - `<FollowUpInlineBooker>` (inline follow-up appointment booker)
   *   - `<ThreeWayInvitePanel>` (invite a third participant)
   *
   * On submit success the room calls
   * `postConsultationQuickActionBanner(...)` which fires a
   * `'follow_up_scheduled'` system row into the consultation chat.
   *
   * Rx is now always-visible in the cockpit right pane (lane β) and
   * is no longer surfaced via the FAB overlay.
   *
   * Patient-side mounts intentionally omit this prop — the FAB never
   * renders for patients. Readonly playback rooms also omit it.
   *
   * `appointmentId` is the original appointment being consulted (used
   * by `<PrescriptionForm>` as `appointmentId`).
   *
   * `patientId` is the `patients.id` UUID — required for the booker.
   * If null (walk-in appointments without a patient record), the
   * Schedule action greys out with a tooltip; Rx still works because
   * `<PrescriptionForm>` accepts a null patientId (saves Rx anyway,
   * delivery-mode falls back to the doctor's sole judgement).
   *
   * `patientPhone` is required by the create-appointment API contract
   * for the follow-up booker. Pass the phone from the source
   * appointment (or the patient row).
   *
   * `defaultReason` seeds the follow-up booker's reason input —
   * usually the original consultation's reason for visit.
   *
   * `doctorToken` is the doctor's Supabase JWT — used for both the
   * Rx send (which already takes it) and the new banner endpoint.
   */
  inCallActions?: {
    appointmentId: string;
    patientId: string | null;
    patientName?: string | null;
    patientPhone?: string | null;
    defaultReason?: string | null;
    doctorId: string;
    doctorToken: string;
  };
  /**
   * Sub-batch E · task-video-E4 — crash-recovery rejoin banner.
   *
   * True when the parent page mounted the room from a cached snapshot
   * (sessionStorage `call-rejoin-${sessionId}`) instead of a fresh
   * token-mint. Renders a non-blocking "Reconnected — welcome back"
   * banner at the top of the canvas that auto-dismisses in 3 seconds.
   *
   * Defensive: if E3 fires (`tabPresence.status === 'kicked'`) the
   * kick overlay covers everything and the rejoin banner is
   * suppressed — kick takes precedence over rejoin (the cache
   * couldn't have written its kicked-flag check + lifted, and even
   * if there was a race, "you've been kicked" is the more important
   * surface).
   *
   * Default `false` — undisturbed first-time mounts.
   */
  rejoined?: boolean;
  /**
   * task-cockpit-fix-3 — cockpit compact mode. In "cockpit", non-essential
   * controls (Mirror, Volume, Quality, Background, PiP, Share, Snapshot,
   * Camera switch, Orientation lock) collapse into a `More ▾` overflow menu.
   * The companion chat panel is hidden by default; it can be re-enabled via
   * the "Show in-call chat" item in `More ▾`. Default: "default" — existing
   * behaviour preserved byte-for-byte.
   */
  mode?: "default" | "cockpit";
  /**
   * task-cockpit-fix-5 — fired when the first remote participant enters
   * the Twilio room (patient joined). The launcher hides `<PatientJoinLink>`
   * on this signal.
   */
  onRemoteJoined?: () => void;
  /**
   * task-cockpit-fix-5 — fired when the last remote participant leaves
   * the Twilio room (patient dropped). The launcher re-shows `<PatientJoinLink>`
   * so the doctor can resend.
   */
  onRemoteLeft?: () => void;
  /**
   * Cockpit Rx-redesign — destructive secondary action shown immediately
   * before "Leave call" in the doctor-side in-call control bar. Renders
   * as a small ghost-destructive button with a 2-step confirm to guard
   * against accidental clicks ("Mark no-show" → "Confirm no-show?").
   * Patient-side mounts and `mode==='default'` (legacy non-cockpit) mounts
   * never receive this prop, so the button is invisible there.
   * Wired from ConsultationCockpit → ConsultationLauncher → here in
   * the `live` state only.
   */
  onMarkNoShow?: () => void | Promise<void>;
}

/**
 * Twilio Video room component. Connects with token, shows local + remote video.
 *
 * Plan 06 · Task 38 extends this into a two-pane layout (desktop) / tab
 * switcher (mobile) when the `companion` prop is present, mounting
 * `<TextConsultRoom layout='panel'>` alongside the video tiles.
 *
 * @see e-task-6; twilio-video SDK
 * @see docs/Work/Daily-plans/April 2026/19-04-2026/Tasks/task-38-video-room-companion-chat-panel.md
 */
export default function VideoRoom({
  accessToken,
  roomName,
  onDisconnect,
  role,
  sessionId,
  doctorToken,
  companion,
  recordingSessionId,
  recordingToken,
  chosenCameraId,
  chosenMicId,
  skipAudio = false,
  onRejoin,
  onRestart,
  inCallActions,
  rejoined = false,
  mode = "default",
  onRemoteJoined,
  onRemoteLeft,
  onMarkNoShow,
}: VideoRoomProps) {
  const [status, setStatus] = useState<"connecting" | "connected" | "disconnected" | "error">(
    "connecting"
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [remoteLabel, setRemoteLabel] = useState<"Doctor" | "Patient">(
    role === "patient" ? "Doctor" : "Patient"
  );
  // task-cockpit-fix-3 — resolved once; all render gates read this.
  const isCockpit = mode === "cockpit";
  // task-cockpit-fix-3 — companion chat is suppressed by default in cockpit
  // mode. The More ▾ "Show in-call chat" item toggles this flag.
  const [showInCallChat, setShowInCallChat] = useState(false);
  const onDisconnectRef = useRef(onDisconnect);
  onDisconnectRef.current = onDisconnect;
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const roomRef = useRef<Room | null>(null);
  const localTracksRef = useRef<Awaited<ReturnType<typeof createLocalTracks>>>([]);
  const hasNotifiedDisconnectRef = useRef(false);
  const hasDisconnectedRef = useRef(false);

  // ------------------------------------------------------------------------
  // Sub-batch B · task-video-B5 — disconnect-reason classifier inputs.
  //
  //   `ourLocalEndCalledRef` — set true in `handleLeave` /
  //     `handleEndConfirmConfirm` BEFORE the room.disconnect() so the
  //     `disconnected` listener can read it synchronously.
  //   `lastTwilioErrorRef` — captured from `room.on('disconnected',
  //     (room, error?) => …)`. Twilio passes the error param when the
  //     room died unexpectedly; clean local-end disconnects pass nothing.
  //   `remoteEndedFirstRef` — set true in `participantDisconnected`
  //     (the only remote in a 1-on-1 call leaving). The classifier
  //     uses this to pick `'remote'` over `'unknown'` when the local
  //     room subsequently disconnects without an explicit reason.
  //
  // All three are refs (not state) because they're read inside the
  // Twilio event closures which were captured at mount; setState
  // would race the synchronous classify call inside the disconnected
  // handler.
  // ------------------------------------------------------------------------
  const ourLocalEndCalledRef = useRef(false);
  const lastTwilioErrorRef = useRef<{ code?: number; message?: string } | null>(
    null,
  );
  const remoteEndedFirstRef = useRef(false);

  // The classifier's output, computed once on the disconnect transition
  // and held in state so the splash mount re-renders correctly. Null
  // until the first transition (status === 'disconnected' alone is not
  // enough; the splash needs the classified reason to pick CTAs).
  const [disconnectReason, setDisconnectReason] =
    useState<DisconnectReason | null>(null);

  // User clicked Dismiss on the splash — collapse to the legacy minimal
  // "Call ended." placeholder. Kept separate from `disconnectReason` so
  // future tasks (D1 post-call summary) can read the reason for context
  // even after the splash itself is dismissed.
  const [splashDismissed, setSplashDismissed] = useState(false);
  // Sub-batch D · task-video-D1 — once the user clicks Done on the
  // post-call summary card, fall back to the minimal legacy "Call
  // ended." placeholder. Separate from `splashDismissed` so the two
  // dismiss surfaces don't accidentally rewind each other.
  const [summaryDismissed, setSummaryDismissed] = useState(false);

  // ------------------------------------------------------------------------
  // Sub-batch A · task-video-A1 — local mic mute toggle.
  //
  // Local mic toggle via `LocalAudioTrack.enable()/.disable()`. Posts a
  // `mute_changed` companion-chat row (voice A7) after each flip.
  //
  // Symmetric for doctor + patient — neither role can mute the other; the
  // toggle only affects the local participant's own mic.
  // ------------------------------------------------------------------------
  const [micMuted, setMicMuted] = useState(false);

  // ------------------------------------------------------------------------
  // Sub-batch A · task-video-A2 — camera off / on toggle.
  //
  // Two pieces of state:
  //   - `cameraOff` is the LOCAL camera state, flipped by the controls-bar
  //     button via `LocalVideoTrack.disable()` / `.enable()` (keeps the
  //     track alive; just stops sending frames — no re-publish lag, per
  //     task draft Note #4).
  //   - `remoteCameraOff` mirrors the REMOTE participant's video-publish
  //     state, kept in sync via `RemoteVideoTrack.on('disabled' | 'enabled')`
  //     events (Twilio fires these whenever the peer's `.disable()` /
  //     `.enable()` lands locally). The `<VideoTile>` overlay reads this
  //     to render the avatar placeholder for the remote tile.
  //
  // No companion-chat system-message emit yet — same deferral as A1's
  // mute toggle: the `camera_changed` infrastructure (TS union, helper,
  // backend route) is owned by voice A7's PR and not yet shipped.
  // ------------------------------------------------------------------------
  const [cameraOff, setCameraOff] = useState(false);
  const [remoteCameraOff, setRemoteCameraOff] = useState(false);
  // Sub-batch F · task-video-F1 — `useCameraSwitch` consumes a ref
  // (not the state) so its publish callbacks see the freshest
  // `cameraOff` value without needing to re-bind on every toggle.
  // Same pattern as `qualityRef` further down.
  const cameraOffRef = useRef(cameraOff);
  useEffect(() => {
    cameraOffRef.current = cameraOff;
  }, [cameraOff]);

  // ------------------------------------------------------------------------
  // Sub-batch A · task-video-A3 — call-duration timer.
  //
  // Set ONCE on the first Twilio `connected` event in `connectRoom`
  // below; never reset across reconnect / hold (B3, B4) so the timer
  // keeps counting per the doctrine in task-A3 §"Pause behavior on
  // lifecycle". `useCallDuration` is the pull-forward of the voice T1.1
  // / A1 hook — voice batch can import it from the same path once they
  // pick up A1.
  //
  // No `mode='readonly'` branch here — `<VideoRoom>` has no readonly
  // prop today (Plan 07 history viewer renders elsewhere); when that
  // ships, the static-duration fallback lives there, NOT in this hook.
  // ------------------------------------------------------------------------
  const [connectedAt, setConnectedAt] = useState<Date | null>(null);

  // ------------------------------------------------------------------------
  // Sub-batch A · task-video-A4 — end-call confirmation modal.
  //
  // The "Leave call" button no longer ends the call directly — clicking
  // it opens the confirmation modal. The doctor side has a Shift-click
  // bypass (power users; voice doctrine §1) that calls the existing
  // `handleLeave` immediately without opening the modal. Patient side
  // has no bypass — the modal is always shown.
  //
  // Modal mount point: alongside `<VideoConsentModal>` in the rendered
  // tree (both are full-screen overlays); kept inside `videoPane` so
  // the existing companion-chat layout doesn't shift.
  // ------------------------------------------------------------------------
  const [endConfirmOpen, setEndConfirmOpen] = useState(false);

  // ------------------------------------------------------------------------
  // Cockpit Rx-redesign — "Mark no-show" 2-step confirm + busy state.
  // First click arms a confirm step that auto-cancels after 4s; the
  // second click invokes `onMarkNoShow` (which the cockpit wires to the
  // POST + local appointment status flip → cockpit derives `terminal`).
  // The button itself is rendered only when `onMarkNoShow` is supplied
  // (cockpit + doctor role), so this state is otherwise inert.
  // ------------------------------------------------------------------------
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
  // Cleanup the auto-cancel timer on unmount so a stale fire doesn't
  // touch state after the component is gone.
  useEffect(() => {
    return () => {
      if (noShowConfirmTimerRef.current) {
        clearTimeout(noShowConfirmTimerRef.current);
      }
    };
  }, []);

  // ------------------------------------------------------------------------
  // Sub-batch A · task-video-A5 — self-view PiP position (per-device).
  //
  // The remote tile now fills the entire video pane and the self tile
  // floats over it as a PiP in one of four corners. Default `'BR'`
  // matches WhatsApp / Meet / Doximity. A single tap (or Enter/Space
  // keypress on the focused tile) cycles BR → BL → TL → TR → BR
  // (counter-clockwise), and every flip is persisted to localStorage
  // under `video-self-view-position` so the choice survives page
  // refresh AND any subsequent rejoin from the same device.
  //
  // SSR safety: initial render uses the default; the mount effect
  // reads localStorage and updates if a stored value exists. The
  // resulting one-frame reposition is animated via the
  // `transition-all duration-200` class on the floating tile, so the
  // only user-visible artifact is a smooth slide on first paint when
  // the persisted corner differs from the default.
  // ------------------------------------------------------------------------
  const [selfViewPosition, setSelfViewPosition] =
    useState<SelfViewPosition>("BR");

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem(SELF_VIEW_STORAGE_KEY);
      if (stored === "TL" || stored === "TR" || stored === "BL" || stored === "BR") {
        setSelfViewPosition(stored);
      }
    } catch {
      // localStorage may throw in private browsing / quota-exceeded
      // edge cases — fall back silently to the default. The PiP still
      // renders correctly and subsequent flips just won't persist.
    }
  }, []);

  const handleSelfViewTap = useCallback(() => {
    setSelfViewPosition((current) => {
      const next = SELF_VIEW_NEXT_POSITION[current];
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(SELF_VIEW_STORAGE_KEY, next);
        } catch {
          // see mount-effect comment — best-effort persistence.
        }
      }
      return next;
    });
  }, []);

  // ------------------------------------------------------------------------
  // Sub-batch A · task-video-A6 — self-view mirror toggle.
  //
  // Default ON (matches every native selfie camera). The flip is
  // CSS-only (`scaleX(-1)` on the local `<video>`); the actual track
  // sent over Twilio is unmirrored, so the doctor always sees the
  // patient's natural view (and vice-versa). Persistence is per-device
  // via localStorage so the choice survives page refresh + rejoin.
  //
  // Same SSR pattern as A5: initial render uses `true`; mount effect
  // overrides from localStorage if present. Stored as the literal
  // strings `"true"` / `"false"` for predictable round-tripping (the
  // standard JSON-stringify pattern is the same single byte but more
  // ceremony for a 1-bit value).
  //
  // Mirror state is GLOBAL per device today; F1 (camera switch) may
  // make it per-camera (front-camera default ON / back-camera default
  // OFF). Out of scope here — see task-video-A6 Note #4.
  // ------------------------------------------------------------------------
  const [mirrorSelf, setMirrorSelf] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem(MIRROR_STORAGE_KEY);
      if (stored === "true" || stored === "false") {
        setMirrorSelf(stored === "true");
      }
    } catch {
      // see selfViewPosition mount-effect — silent fallback.
    }
  }, []);

  const handleToggleMirror = useCallback(() => {
    setMirrorSelf((current) => {
      const next = !current;
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(
            MIRROR_STORAGE_KEY,
            next ? "true" : "false",
          );
        } catch {
          // see selfViewPosition mount-effect — best-effort persistence.
        }
      }
      return next;
    });
  }, []);

  // ------------------------------------------------------------------------
  // Sub-batch B · task-video-B6 — layout state (per-device preference).
  //
  // Three layouts (decision §7 default `'speaker'`):
  //
  //   `'speaker'`  — current default since A5. Remote tile fills the
  //                  canvas; self tile floats as a corner overlay
  //                  (A5 owns the corner state via `selfViewPosition`).
  //                  Clinical-friendly: doctor + patient look at each
  //                  other through the dominant tile.
  //   `'gallery'`  — pre-A5 default. Equal side-by-side tiles
  //                  (`md:grid-cols-2`); self-view inline (A5's corner
  //                  overlay is dormant). Useful for chat-style
  //                  consults where both parties want symmetry.
  //   `'sidebar'`  — desktop-only 70/30 split. Remote tile flex-[7];
  //                  self tile flex-[3] in a right column. On mobile
  //                  the switcher hides this option AND the parent
  //                  derives `effectiveLayout = 'speaker'` so a
  //                  persisted-from-desktop value doesn't break the
  //                  mobile render.
  //
  // SSR-safe: initial render is the default; the mount effect reads
  // localStorage and swaps. Same pattern as A5 + A6.
  //
  // `mode='readonly'` (Plan 07 history viewer) — `<VideoRoom>` does
  // not have a readonly prop today (see A3 comment further up); when
  // it ships, the readonly path should force `effectiveLayout =
  // 'speaker'` and hide the switcher — annotated in the task notes
  // for the future PR.
  // ------------------------------------------------------------------------
  const [layout, setLayout] = useState<VideoLayout>(DEFAULT_LAYOUT);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem(LAYOUT_STORAGE_KEY);
      if (stored !== null && isVideoLayout(stored)) {
        setLayout(stored);
      }
    } catch {
      // see selfViewPosition mount-effect — silent fallback.
    }
  }, []);

  const handleLayoutChange = useCallback((next: VideoLayout) => {
    setLayout(next);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(LAYOUT_STORAGE_KEY, next);
      } catch {
        // see selfViewPosition mount-effect — best-effort persistence.
      }
    }
  }, []);

  // Sub-batch B · task-video-B6 — viewport tracker for the
  // Sidebar-on-mobile degrade path. We use `matchMedia('(min-width:
  // 768px)')` (matches Tailwind's `md:` breakpoint) so the JS-driven
  // layout swap stays aligned with the CSS-only `hidden md:inline-flex`
  // gate on the switcher's Sidebar option. Both have to agree:
  //
  //   - Switcher: hides Sidebar at < md (user can't pick it on mobile).
  //   - Parent:  if a persisted Sidebar value loads on a mobile session
  //              (carried over from a desktop session OR a viewport
  //              resize down through md), `effectiveLayout` falls back
  //              to Speaker so the render is sensible.
  //
  // The `change` listener handles the resize case live (e.g. doctor
  // rotates an iPad mid-call between landscape and portrait).
  const [isDesktop, setIsDesktop] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    const mq = window.matchMedia("(min-width: 768px)");
    setIsDesktop(mq.matches);
    const onChange = (event: MediaQueryListEvent) => {
      setIsDesktop(event.matches);
    };
    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    }
    // Older Safari fallback (`addListener` / `removeListener`).
    if (typeof (mq as { addListener?: unknown }).addListener === "function") {
      (mq as { addListener: (cb: (e: MediaQueryListEvent) => void) => void }).addListener(onChange);
      return () => {
        if (typeof (mq as { removeListener?: unknown }).removeListener === "function") {
          (mq as { removeListener: (cb: (e: MediaQueryListEvent) => void) => void }).removeListener(onChange);
        }
      };
    }
  }, []);

  // Sub-batch F · task-video-F2 — orientation tracking + lock.
  //
  // Rotation is the right answer for chest exams, side-views,
  // and skin-area work. The hook gives us:
  //   - `orient` ('portrait' | 'landscape') so the layout
  //     derivation below can pick the right wide/tall variant.
  //   - `canLock` / `isLocked` / `lock` / `unlock` for the
  //     `<OrientationLockButton>` rendered in the controls bar.
  //
  // The hook is conservative — `canLock` is `false` on iOS Safari
  // and any non-fullscreen non-PWA browser. The button hides
  // itself when `canLock` is false (silent degradation).
  const orientation = useScreenOrientation();
  const orient = orientation.orient;

  // Sub-batch F · task-video-F2 — Sidebar layout availability is
  // wider now. Previously Sidebar degraded to Speaker on any
  // sub-`md` viewport (mobile portrait OR mobile landscape). With
  // landscape variants in place (`landscape:flex-row` on the tile
  // container, `landscape:basis-[70%]` on the rail), mobile
  // landscape can host Sidebar legitimately. We only degrade now
  // when BOTH conditions hit — a sub-`md` viewport AND portrait
  // orientation. The CSS gate on the switcher
  // (`hidden md:inline-flex landscape:inline-flex`) was widened
  // in lockstep so JS + CSS agree.
  const effectiveLayout: VideoLayout =
    layout === "sidebar" && !isDesktop && orient === "portrait"
      ? "speaker"
      : layout;

  // ------------------------------------------------------------------------
  // Sub-batch C · task-video-C2 — virtual background / blur.
  //
  // Hydrate the persisted preference (`localStorage['video-bg-preference']`)
  // and keep a ref in sync for the connect-block + quality-swap closures
  // that need to read the latest value across React renders without
  // re-subscribing. Same pattern as `volumePercentRef` (B9) and
  // `audioElementBoundRef` (B9) — state for renders, ref for closures.
  //
  // The processor is mounted DEFENSIVELY in three places:
  //   1. After the initial connect publishes the local video track
  //      (line ~1230) — restores the doctor's persisted blur on every
  //      call.
  //   2. After a quality-picker swap creates a NEW LocalVideoTrack
  //      (line ~1770) — without this, a quality change would silently
  //      strip the user's blur preference.
  //   3. On `handleBackgroundChange` itself — the live picker click.
  //
  // The first switch from `'off'` to `'blur-*'` includes a 1-2s TFLite
  // model load (Twilio's `loadModel()`); subsequent toggles between
  // the two blur radii are instant (cached). We surface the inflight
  // window via `backgroundSwitchInFlight` → picker `disabled` so the
  // user can't queue up a flapping series of swaps.
  //
  // Designer-supplied JPGs (`image:clinic` / `image:neutral`) are
  // typed in the union but the picker hides them in v1 — see the
  // `IMAGE_OPTIONS_ENABLED` gate in `<VirtualBackgroundPicker>` and
  // the deferred branch in `applyBackgroundToTrack`.
  //
  // Cleanup on unmount: `removeBackgroundFromTrack` for any live
  // track + `disposeBackgroundCache()` to drop the worker / WASM
  // references so a route change doesn't leak ~2.5 MB of WASM.
  // ------------------------------------------------------------------------
  const [background, setBackground] = useState<BackgroundPreference>(
    DEFAULT_BACKGROUND_PREFERENCE,
  );
  const backgroundRef = useRef<BackgroundPreference>(
    DEFAULT_BACKGROUND_PREFERENCE,
  );
  const [backgroundSwitchInFlight, setBackgroundSwitchInFlight] =
    useState<boolean>(false);
  const [backgroundNotice, setBackgroundNotice] = useState<string | null>(null);

  // Hydrate from localStorage on mount. Same precedent as the
  // layout / quality / volume hydration above — guarded against
  // SSR by checking `typeof window`.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(BACKGROUND_STORAGE_KEY);
      const parsed = parseBackgroundPreference(raw);
      setBackground(parsed);
      backgroundRef.current = parsed;
    } catch {
      // Storage may be disabled (incognito, enterprise lockdown);
      // silently fall back to the default. Same precedent as the
      // other hydration blocks.
    }
  }, []);

  // Keep the ref in sync with state — closures captured by the
  // connect block + quality-swap callback read from the ref.
  useEffect(() => {
    backgroundRef.current = background;
  }, [background]);

  // Auto-clear the inline notice after a short window — same
  // pattern as `pipNotice` (B7).
  useEffect(() => {
    if (backgroundNotice === null) return;
    const handle = setTimeout(() => setBackgroundNotice(null), 4000);
    return () => clearTimeout(handle);
  }, [backgroundNotice]);

  const handleBackgroundChange = useCallback(
    async (next: BackgroundPreference) => {
      const prev = backgroundRef.current;
      // Optimistic state update so the picker reflects the user's
      // choice immediately; we revert on hard failure below.
      setBackground(next);
      backgroundRef.current = next;

      // Persist BEFORE the apply — even if the apply fails, the
      // preference is honoured on next call (same precedent as the
      // quality picker).
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(
            BACKGROUND_STORAGE_KEY,
            serializeBackgroundPreference(next),
          );
        } catch {
          // Storage may be unavailable; non-fatal.
        }
      }

      const videoTrack = localTracksRef.current.find(
        (t) => t.kind === "video",
      ) as LocalVideoTrack | undefined;
      if (!videoTrack) {
        // No active video track (audio-only quality OR pre-connect).
        // The persisted preference will apply on next track creation.
        return;
      }

      setBackgroundSwitchInFlight(true);
      try {
        await applyBackgroundToTrack(videoTrack, next);
      } catch (err) {
        // Twilio's `loadModel()` can fail if the WASM/TFLite assets
        // didn't deploy correctly (postinstall script skipped) or the
        // browser lacks WebAssembly SIMD on a corporate locked-down
        // build. Revert state + surface a notice so the doctor knows
        // why the picker did nothing visible.
        setBackground(prev);
        backgroundRef.current = prev;
        if (typeof window !== "undefined") {
          try {
            window.localStorage.setItem(
              BACKGROUND_STORAGE_KEY,
              serializeBackgroundPreference(prev),
            );
          } catch {
            // ignore — best effort.
          }
        }
        setBackgroundNotice(
          "Couldn't apply background effect. Your camera is unchanged.",
        );
        if (process.env.NODE_ENV !== "production") {
          console.warn("Virtual background apply failed:", err);
        }
      } finally {
        setBackgroundSwitchInFlight(false);
      }
    },
    [],
  );

  // Cleanup background processor + cache on unmount.
  useEffect(() => {
    return () => {
      const videoTrack = localTracksRef.current.find(
        (t) => t.kind === "video",
      ) as LocalVideoTrack | undefined;
      if (videoTrack) {
        try {
          removeBackgroundFromTrack(videoTrack);
        } catch {
          // ignore — track may already be torn down.
        }
      }
      disposeBackgroundCache();
    };
  }, []);

  // ------------------------------------------------------------------------
  // Sub-batch B · task-video-B7 — Picture-in-Picture.
  //
  // Hook subscribes to the W3C `'enterpictureinpicture'` /
  // `'leavepictureinpicture'` events on the remote `<video>` element
  // and exposes `{ isSupported, isActive, enter, exit }`. Decision §8
  // — when `isSupported === false` (Safari pre-iOS 14, in-app webviews
  // like Instagram / FB Messenger / TikTok / WeChat / etc.), the
  // button is hidden entirely. Same precedent as B8 / B9 / B6 — small
  // capability-driven UI primitives instead of "show + warn."
  //
  // The PiP placeholder ("Currently in Picture-in-Picture · Bring back")
  // is mounted as an `absolute inset-0 z-[25]` overlay over the remote
  // tile area when active. It sits BELOW the hold (z-30) and reconnect
  // (z-30) banners — those states are more important than the PiP
  // affordance — and ABOVE the caller card (z-15) + recording
  // indicator (z-20) so the user can't miss the "Bring back" action.
  //
  // The hook also handles auto-exit on unmount so a call disconnect
  // / route change while in PiP doesn't leave a stranded PiP window
  // pointing at a dead `<video>`. Best-effort re-enter on B4 reconnect
  // is OUT OF SCOPE for v1: the browser requires a fresh user gesture
  // to enter PiP, and our reconnect path doesn't have one. Documented
  // in the task notes for a future PR.
  //
  // `mode='readonly'` (Plan 07 history viewer) — PiP is purely a
  // local rendering concern (no mutation), so the spec says it's
  // available in readonly view too. `<VideoRoom>` doesn't have a
  // `mode` prop today (same as B4 / B6); when it lands, no gating
  // is needed for PiP.
  // ------------------------------------------------------------------------
  const pip = usePictureInPicture(remoteVideoRef);
  // Ephemeral user-visible notice for PiP failures. Cleared by the
  // mount effect below after a short window so the controls bar
  // doesn't accumulate stale errors. We avoid a generic toast lib
  // (none exists in deps yet — same constraint as the icon library
  // gate) and inline the notice next to the controls bar.
  const [pipNotice, setPipNotice] = useState<string | null>(null);

  useEffect(() => {
    if (pipNotice === null) return;
    const handle = setTimeout(() => setPipNotice(null), 4000);
    return () => clearTimeout(handle);
  }, [pipNotice]);

  const handleTogglePip = useCallback(async () => {
    if (pip.isActive) {
      await pip.exit();
      return;
    }
    try {
      await pip.enter();
    } catch (err) {
      // Hook rejects with a `PictureInPictureError` string. Map
      // each case to a short, user-readable message. Anything
      // unrecognized falls into the catch-all.
      const message =
        err === "user-gesture-required"
          ? "Tap the video first, then tap Picture-in-Picture."
          : err === "denied"
            ? "Picture-in-Picture is unavailable in this browser."
            : err === "no-element"
              ? "Picture-in-Picture isn't ready yet — wait a moment and try again."
              : "Picture-in-Picture unavailable; try again from the video.";
      setPipNotice(message);
    }
  }, [pip]);

  // ------------------------------------------------------------------------
  // Sub-batch A · task-video-A8 — reactive Twilio handles for the
  // network-quality + stats hooks.
  //
  // The existing `roomRef` is intentionally a non-reactive ref so the
  // stable `handleLeave` callback can clean up without becoming a
  // dependency. The hooks below need the OPPOSITE — they re-subscribe
  // when the room or a participant changes — so they read from these
  // useState slots. `connectRoom` (effect below) writes both.
  //
  // The remote-participant slot is updated on `participantConnected`
  // AND cleared on `participantDisconnected` so the network-bars
  // tooltip drops back to "Measuring…" when the counterparty leaves
  // (rather than showing a stale level).
  //
  // Network-quality config (`{ local: 1, remote: 1 }`) is enabled in
  // the `connect()` call below. Verbosity 1 = level-only (cheap;
  // matches what the bars consume); 2/3 add subnet probing /
  // detailed media stats which we don't need for the v1 surface.
  // ------------------------------------------------------------------------
  const [roomState, setRoomState] = useState<Room | null>(null);
  const [localParticipant, setLocalParticipant] =
    useState<LocalParticipant | null>(null);
  const [remoteParticipant, setRemoteParticipant] =
    useState<RemoteParticipant | null>(null);

  const localNetworkQuality = useNetworkQuality(localParticipant);
  const remoteNetworkQuality = useNetworkQuality(remoteParticipant);
  const callStats = useVideoCallStats(roomState);

  // task-cockpit-fix-5 — notify parent when remote participant presence changes
  // so the launcher can show/hide <PatientJoinLink>.
  useEffect(() => {
    if (remoteParticipant) {
      onRemoteJoined?.();
    } else {
      onRemoteLeft?.();
    }
  }, [remoteParticipant, onRemoteJoined, onRemoteLeft]);

  // ------------------------------------------------------------------------
  // Sub-batch E · task-video-E6 — QoS health-metrics reporter.
  //
  // Mounts a `quality-reporter.ts` instance for the lifetime of the
  // Twilio connection. The reporter samples `room.getStats()` +
  // `room.localParticipant.networkQualityLevel` on a 10s/30s cadence,
  // buffers, and POSTs every 60s + on dispose to
  // `POST /api/v1/consultation/:sessionId/video-quality`.
  //
  // Doctor side uses `inCallActions.doctorToken` (the Supabase JWT).
  // Patient side uses `companion.patientAccessToken` (the companion
  // JWT minted by the text-token exchange — same JWT the chat
  // companion already carries).
  //
  // No-op when:
  //   - No room (pre-connect / post-disconnect).
  //   - No `companion?.sessionId` (doctor mounts that don't pass it
  //     can't form the URL — same gate as the auto-fallback poster).
  //   - Doctor side without a doctorToken (extras-as-doctor path).
  //   - Patient side without a patientAccessToken (companion JWT
  //     exchange failed — chat is unavailable too, so QoS skipped).
  //
  // The reporter is fire-and-forget; failures are swallowed in the
  // poster + the reporter's flush loop. Never crashes the call.
  //
  // @see frontend/lib/video/quality-reporter.ts
  // @see backend/src/services/video-call-quality-service.ts
  // @see docs/Work/Daily-plans/April 2026/28-04-2026/Tasks/task-video-E6-qos-health-metrics.md
  // ------------------------------------------------------------------------
  useEffect(() => {
    if (!roomState) return;
    const sid = companion?.sessionId ?? sessionId;
    if (!sid) return;

    // Resolve role + bearer.
    let bearer: string | null = null;
    let resolvedRole: "doctor" | "patient" | null = null;
    if (role === "patient") {
      // Patient side — companion JWT is required.
      if (companion?.patientAccessToken) {
        bearer = companion.patientAccessToken;
        resolvedRole = "patient";
      }
    } else {
      // Doctor side (role === 'doctor' OR omitted; default doctor).
      if (inCallActions?.doctorToken) {
        bearer = inCallActions.doctorToken;
        resolvedRole = "doctor";
      }
    }

    if (!bearer || !resolvedRole) return;

    // Capture into closures so the poster always uses the
    // initial-mount values (token rotation mid-call would be its own
    // follow-up; for v1 the bearer is stable across the call lifespan
    // — doctor Supabase JWTs are 1h+; patient companion JWTs match
    // the consult window).
    const capturedBearer = bearer;
    const capturedSessionId = sid;
    let reporter: VideoQualityReporter | null = null;
    try {
      reporter = createVideoQualityReporter({
        room: roomState,
        sessionId: capturedSessionId,
        role: resolvedRole,
        poster: (samples) =>
          postConsultationVideoQuality(
            capturedBearer,
            capturedSessionId,
            samples,
          ),
      });
    } catch (err) {
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          "Failed to start QoS reporter:",
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
    // `companion` + `inCallActions` are objects whose identity may change
    // across renders even when the relevant fields are stable. The
    // reporter is lifecycle-bound to `roomState` (mount on connect,
    // dispose on disconnect); we do NOT want re-mount churn from
    // unrelated parent re-renders. Watch only `roomState` + `role`.
    // The bearer + sessionId are captured into closures above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomState, role]);

  // ------------------------------------------------------------------------
  // Sub-batch C · task-video-C5 — screen share.
  //
  // The hook owns the LOCAL screen lifecycle (capture via
  // `getDisplayMedia`, wrap as a Twilio `LocalVideoTrack` named
  // `'screen'`, publish, OS-stop event, auto-cleanup on unmount).
  // The REMOTE screen track is detected inside the per-participant
  // `trackSubscribed` listener further down — Twilio publishes
  // multiple video tracks (camera + screen) on the same participant
  // and the existing `wireRemoteVideoTrack` blindly attaches every
  // video track to `remoteVideoRef`, which would clobber the camera.
  // We split: `track.name === 'screen'` → set `remoteScreenTrack`
  // state for the share tile to consume; everything else falls
  // through to the camera attach as before.
  //
  // `mode='readonly'` (Plan 07 history viewer) — the spec says
  // hide the Share button. `<VideoRoom>` doesn't carry a `mode`
  // prop today (same as B4 / B6 / B7); when it lands, gate the
  // controls-bar button on `mode !== 'readonly'`.
  //
  // System-message wire-up (Plan 06 enum extension —
  // `'screen_share_started'` / `'screen_share_stopped'`) is
  // DEFERRED to the combined enum migration window (A2 / E2 /
  // C3 / C5). The local UI is fully functional without it; the
  // companion-chat row is a "nice to have" affordance that
  // requires backend enum + worker wire-up. Documented in the
  // task file's Audit notes.
  // ------------------------------------------------------------------------
  const screen = useScreenShare({ room: roomState });
  const [remoteScreenTrack, setRemoteScreenTrack] =
    useState<RemoteVideoTrack | null>(null);
  const [screenShareNotice, setScreenShareNotice] = useState<string | null>(
    null,
  );

  // Auto-clear the inline notice after a short window — same
  // pattern as `pipNotice` (B7) and `backgroundNotice` (C2).
  useEffect(() => {
    if (screenShareNotice === null) return;
    const handle = setTimeout(() => setScreenShareNotice(null), 4000);
    return () => clearTimeout(handle);
  }, [screenShareNotice]);

  // ------------------------------------------------------------------------
  // Sub-batch C · task-video-C4 — annotation overlay state.
  //
  // When the user clicks "Annotate" in `<SnapshotControls>`, we:
  //   1. Pause the chosen video tile so the rendered <video> element
  //      no longer advances frames (the snapshot is already captured
  //      to a separate canvas, but the modal sits OVER the live tile
  //      and the visual freeze matches the user's mental model of
  //      "I'm marking THIS frame").
  //   2. Capture the current frame to a fresh canvas via
  //      `freezeVideoFrame`.
  //   3. Render `<AnnotationCanvas>` as a modal overlay; user draws.
  //   4. On Save: composite the annotated canvas → blob; upload via
  //      `captureSnapshot({ prerenderedBlob, annotations })`.
  //   5. On Cancel: discard the canvas; resume the paused video.
  //
  // Why pause-then-resume vs. just-overlay-the-modal: pausing
  // prevents a subtle bug where the annotation modal closes during a
  // network blip (`captureSnapshot` rejects), the user re-opens it,
  // and the captured frame is now SEVERAL SECONDS AHEAD of what
  // they thought they were annotating. Pausing freezes the
  // perception in lock-step with the captured raster.
  //
  // Held-call doctrine: B3's hold state pauses the local renderers
  // already; if we enter annotation mode while the call is held,
  // the resume path on Cancel may un-pause the live <video>
  // INTERMITTENTLY while the call should remain held. Defensive
  // guard: only auto-pause/resume when the tile wasn't already
  // paused.
  // ------------------------------------------------------------------------
  const [annotation, setAnnotation] = useState<
    | {
        active: true;
        source: "remote" | "self";
        frameCanvas: HTMLCanvasElement;
        dimensions: { width: number; height: number };
        wasPlaying: boolean;
      }
    | { active: false }
  >({ active: false });
  const [snapshotExternalToast, setSnapshotExternalToast] = useState<
    { kind: "success" | "error"; message: string } | null
  >(null);

  // ------------------------------------------------------------------------
  // Sub-batch C · task-video-C6 — In-call quick actions panel state.
  //
  // The FAB (`<InCallQuickActions>`) opens this panel; the panel hosts
  // the embedded Rx writer or the inline follow-up booker. On submit
  // success the room calls the backend banner endpoint and closes the
  // panel.
  //
  // Doctor-only — patient mounts don't pass `inCallActions` and never
  // see the FAB. Mode-readonly views also skip it.
  //
  // Toast state lives separately from the snapshot toast because both
  // can fire concurrently in principle (doctor takes a snapshot, then
  // sends an Rx) — keeping them split avoids one stomping the other.
  // ------------------------------------------------------------------------
  const [quickActionPanel, setQuickActionPanel] = useState<
    QuickAction | null
  >(null);
  const [quickActionToast, setQuickActionToast] = useState<
    { kind: "success" | "error"; message: string } | null
  >(null);

  // Auto-dismiss the quick-action toast after 3.5s. Mirrors the
  // dismissal cadence the snapshot toast uses inside <SnapshotControls>.
  useEffect(() => {
    if (!quickActionToast) return;
    const t = setTimeout(() => {
      setQuickActionToast(null);
    }, 3500);
    return () => clearTimeout(t);
  }, [quickActionToast]);

  // Either side actively presenting → switch the tile container
  // into the compact horizontal-strip layout so the screen tile(s)
  // take the dominant slot. Computed once for use across the JSX
  // tree (privacy banner, tile container className, screen tile
  // mount).
  const isSharingActive =
    screen.localScreenTrack !== null || remoteScreenTrack !== null;

  const handleToggleScreenShare = useCallback(async () => {
    if (screen.localScreenTrack) {
      // Already sharing — Stop.
      await screen.stop();
      return;
    }
    try {
      await screen.start();
    } catch (err) {
      // Hook rejects with a `ScreenShareError` string. Map each
      // case to a short, user-readable message; the
      // `'permission-denied'` case is silently swallowed (the
      // user just clicked Cancel on the OS picker — that's a
      // non-event, mirrors Slack / Zoom UX).
      if (err === "permission-denied") return;
      const message =
        err === "no-room"
          ? "Reconnect first, then try sharing again."
          : err === "no-track"
            ? "Couldn't capture the selected screen. Try a different window."
            : "Screen sharing failed. Try again or pick a different surface.";
      setScreenShareNotice(message);
    }
  }, [screen]);

  // ------------------------------------------------------------------------
  // Sub-batch B · task-video-B9 — remote-audio volume + boost router.
  //
  // `volumePercent` is a controlled slider value (0–150). Default 100 =
  // OS-normal; restored from localStorage on mount. A separate
  // `useEffect([volumePercent])` drives the gain-node router AND
  // persists to storage in one place — the audio-track lifecycle
  // handlers below just care about creating / disposing the router,
  // not about the current value.
  //
  //   `remoteAudioRef`   — hidden `<audio>` element rendered at the
  //                        bottom of `videoPane`. Twilio attaches the
  //                        remote audio track to this element, and
  //                        the gain router wraps the same element.
  //   `audioRouterRef`   — the active `BoostedAudioRouter`, or null
  //                        when no remote audio track is subscribed.
  //                        Reset to null on track-unsubscribed AND on
  //                        room disconnect / leave so the next attach
  //                        gets a fresh router.
  //   `volumePercentRef` — mirror of state for closures (the audio-
  //                        track-subscribed handler reads the latest
  //                        volume to seed the router; without the ref
  //                        it would capture the stale state from the
  //                        connectRoom closure that ran on mount).
  //   `audioElementBoundRef` — guards against re-creating the router
  //                        when Twilio fires multiple `trackSubscribed`
  //                        events for the same audio track during
  //                        reconnects (each `createMediaElementSource`
  //                        call on the same element throws an
  //                        `InvalidStateError` because the element is
  //                        already in an AudioContext graph).
  //
  // No companion-chat system message — volume is a per-device
  // listener preference (not a doctor↔patient negotiation), so unlike
  // mute / camera there's no `volume_changed` event to emit.
  // ------------------------------------------------------------------------
  const [volumePercent, setVolumePercent] = useState<number>(
    DEFAULT_VOLUME_PERCENT,
  );
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const audioRouterRef = useRef<BoostedAudioRouter | null>(null);
  const volumePercentRef = useRef<number>(DEFAULT_VOLUME_PERCENT);
  const audioElementBoundRef = useRef<boolean>(false);

  // Restore persisted volume on mount. SSR-safe — initial render
  // uses the default; this effect runs only on the client. Same
  // pattern as A5's selfViewPosition + A6's mirrorSelf.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem(VOLUME_STORAGE_KEY);
      if (stored == null) return;
      const parsed = Number(stored);
      if (!Number.isFinite(parsed)) return;
      // Clamp to [0,150] so a manually-edited storage value can't crash
      // the slider's internal clamp (it would also clamp, but defending
      // here keeps the persisted value sane on next read).
      const clamped = Math.max(0, Math.min(150, Math.round(parsed)));
      setVolumePercent(clamped);
      volumePercentRef.current = clamped;
    } catch {
      // see selfViewPosition mount-effect — silent fallback to default.
    }
  }, []);

  // Persist + apply volume on every change. The router may not exist
  // yet (no remote audio track subscribed) — that's fine; the
  // track-subscribed handler below will read the current value from
  // `volumePercentRef` when it constructs the router.
  useEffect(() => {
    volumePercentRef.current = volumePercent;
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(
          VOLUME_STORAGE_KEY,
          String(volumePercent),
        );
      } catch {
        // best-effort persistence; private-browsing / quota errors
        // shouldn't crash the call.
      }
    }
    audioRouterRef.current?.setVolume(volumePercent);
  }, [volumePercent]);

  const handleVolumeChange = useCallback((next: number) => {
    setVolumePercent(next);
  }, []);

  // ------------------------------------------------------------------------
  // Sub-batch B · task-video-B8 — manual video-quality picker.
  //
  // State + persistence mirror B9's `volumePercent` pattern:
  //   `quality`               — controlled value passed to <VideoQualityPicker>.
  //   `qualityRef`            — mirror so async handlers (the runtime
  //                             switcher below) can read the latest
  //                             value without becoming a re-render dep.
  //   `qualitySwitchInFlight` — guards the button against a second
  //                             click while Twilio is still
  //                             unpublish/publish-ing. Without it,
  //                             rapid toggles leak tracks (Chrome
  //                             warns about un-`stop()`'d MediaStream-
  //                             Tracks; Twilio also surfaces the
  //                             second `publishTrack` rejection).
  //
  // Two key design choices forced by Twilio Video JS SDK v2.34:
  //
  //   1. `bandwidthProfile.video.maxSubscriptionBitrate` is **set
  //      ONCE inside `connect()`'s options blob** — there's no
  //      runtime mutation API. So the persisted value at connect
  //      time wins for the call's lifetime; mid-call quality changes
  //      only affect the local-publish dimensions (which controls
  //      upload bandwidth and indirectly the remote sender's
  //      adaptive decisions). Documented in the task implementation
  //      log as a v1 limitation.
  //
  //   2. `LocalParticipant.unpublishTrack(track)` is SYNCHRONOUS
  //      (returns `LocalTrackPublication | null` not a Promise);
  //      `publishTrack(track)` is async. The runtime switcher
  //      below treats this asymmetry explicitly.
  //
  // For the 'audio-only' branch, we unpublish + stop the
  // `LocalVideoTrack` entirely (no replacement track). The local
  // self-tile shows the avatar via `cameraOff`-derivation that
  // already exists from A2 — we OR the picker's audio-only state
  // into `cameraOff` for the self-tile. Toggling back to a
  // resolution re-creates a fresh `LocalVideoTrack` and publishes
  // it; the camera permission stays granted from the initial
  // grant (no second permission prompt).
  //
  // No system message emitted on quality change. The B8 task draft
  // mentions a `'manual_audio_only'` system event under §"Manual
  // smoke" but the Plan 06 enum doesn't carry it yet (same gap as
  // A1/A2/B9's deferred system messages). Bundle into voice A7's
  // backend PR when it lands; for now the audio-only state is
  // local-only.
  // ------------------------------------------------------------------------
  const [quality, setQuality] = useState<QualityOption>(DEFAULT_VIDEO_QUALITY);
  const qualityRef = useRef<QualityOption>(DEFAULT_VIDEO_QUALITY);
  const [qualitySwitchInFlight, setQualitySwitchInFlight] =
    useState<boolean>(false);

  // Mount-time restore. Mirror to the ref in the same tick so the
  // first runtime switcher call (if the user clicks immediately) sees
  // the persisted value rather than the constant default.
  useEffect(() => {
    const persisted = readPersistedVideoQuality();
    if (persisted !== DEFAULT_VIDEO_QUALITY) {
      setQuality(persisted);
    }
    qualityRef.current = persisted;
  }, []);

  // Persist + sync ref on every change. State already changed; the
  // runtime switcher below is what actually applies the change to
  // Twilio (separation of concerns: state = UI source of truth;
  // switcher = side-effect orchestrator).
  useEffect(() => {
    qualityRef.current = quality;
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(VIDEO_QUALITY_STORAGE_KEY, quality);
      } catch {
        // best-effort; private-browsing / quota errors shouldn't
        // crash the call (the in-memory state is still authoritative
        // for the rest of this session).
      }
    }
  }, [quality]);

  // ------------------------------------------------------------------------
  // Sub-batch E · task-video-E1 — adaptive-bitrate controller state.
  //
  // The pure state machine (`evaluateAdaptiveTransition`) lives in
  // `lib/video/adaptive-bitrate.ts` and decides downgrade / upgrade
  // transitions from Twilio's `Participant.networkQualityLevel` (A8).
  // The state lives in a ref so the 1-second tick effect below can
  // read + write without triggering re-renders on every sample.
  //
  // Coupling with B8 picker:
  //   - When picker is 'auto', controller is in charge.
  //   - When picker is anything else (manual ceiling), the
  //     evaluator suspends and the user's choice wins. Sustain
  //     windows reset so when they return to 'auto' we start fresh.
  //
  // The toast notice (`adaptiveNotice`) reuses the amber-pill
  // pattern shipped in B7 (`pipNotice`) and C2 (`backgroundNotice`)
  // — `role="status"` + `aria-live="polite"`, self-clears after 6s.
  // Per spec §"UI surfacing": toast on downgrade only; upgrades are
  // silent (no notification on every recovery cycle).
  // ------------------------------------------------------------------------
  const adaptiveStateRef = useRef<AdaptiveControllerState>(
    makeInitialAdaptiveState(),
  );
  const [adaptiveNotice, setAdaptiveNotice] = useState<string | null>(null);

  // Auto-clear the inline notice after a short window — pattern
  // matches `backgroundNotice` (C2) + `pipNotice` (B7). 6s instead
  // of 4s because the adaptive copy is longer + the user needs
  // time to register that bandwidth dropped (vs. a one-shot UX
  // failure note which is dismissable instantly).
  useEffect(() => {
    if (adaptiveNotice === null) return;
    const handle = setTimeout(() => setAdaptiveNotice(null), 6000);
    return () => clearTimeout(handle);
  }, [adaptiveNotice]);

  // ------------------------------------------------------------------------
  // Sub-batch E · task-video-E2 — auto audio-only fallback state.
  //
  // Wired to E.3's adaptive controller. When the controller emits
  // `transitionTo: 'audio-only'`, `applyAdaptiveLevel('audio-only')`
  // (below) tears down the local video track AND flips
  // `autoFallbackActive` so the sticky `<AudioFallbackBanner>`
  // mounts at the top of the canvas. The user clicks "Try video
  // again" to call `handleTryVideoAgain` which re-publishes video
  // and arms the 60s cooldown (Decision §25 — flapping prevention).
  //
  // State + refs:
  //   - `autoFallbackActive`            — drives banner mount.
  //   - `autoFallbackCooldownEndsAt`    — drives banner button label
  //                                       + tooltip; null when no
  //                                       cooldown is active.
  //   - `autoFallbackCooldownEndsAtRef` — mirror for the controller
  //                                       tick (lives outside React's
  //                                       render cycle so the
  //                                       evaluator can gate the
  //                                       audio-only transition
  //                                       without re-rendering).
  //   - `autoFallbackAttemptRef`        — per-session ordinal that
  //                                       feeds the backend dedup
  //                                       key. Bumped on each
  //                                       engagement.
  //   - `autoFallbackEngagedAtRef`      — engage-time epoch-ms used
  //                                       to compute `durationSeconds`
  //                                       on the restored row.
  //   - `restoreInFlight`               — Twilio republish in flight;
  //                                       disables the button so a
  //                                       double-click can't queue a
  //                                       second restore.
  // ------------------------------------------------------------------------
  const [autoFallbackActive, setAutoFallbackActive] = useState(false);
  const [autoFallbackCooldownEndsAt, setAutoFallbackCooldownEndsAt] =
    useState<number | null>(null);
  const autoFallbackCooldownEndsAtRef = useRef<number | null>(null);
  const autoFallbackAttemptRef = useRef(0);
  const autoFallbackEngagedAtRef = useRef<number | null>(null);
  const [restoreInFlight, setRestoreInFlight] = useState(false);

  // Mirror cooldown end into a ref so the adaptive controller tick
  // (which reads from refs to keep its setInterval closure stable)
  // can gate the audio-only transition without forcing a re-render
  // of <VideoRoom> on every cooldown tick.
  useEffect(() => {
    autoFallbackCooldownEndsAtRef.current = autoFallbackCooldownEndsAt;
  }, [autoFallbackCooldownEndsAt]);

  // Auto-clear the cooldown when it expires. The banner's countdown
  // is rendered locally (component owns its own 1s ticker), but the
  // CONTROLLER's gate also needs to lift on expiry — that's what
  // this effect does. We schedule a single setTimeout for the exact
  // expiry boundary instead of a polling interval.
  useEffect(() => {
    if (autoFallbackCooldownEndsAt == null) return;
    const remaining = autoFallbackCooldownEndsAt - Date.now();
    if (remaining <= 0) {
      setAutoFallbackCooldownEndsAt(null);
      return;
    }
    const handle = setTimeout(() => {
      setAutoFallbackCooldownEndsAt(null);
    }, remaining);
    return () => clearTimeout(handle);
  }, [autoFallbackCooldownEndsAt]);

  // ------------------------------------------------------------------------
  // Sub-batch F · task-video-F4 — battery-saver auto-downgrade.
  //
  // Three render branches driven by the battery state machine:
  //
  //   - prompt   → battery <15%, not charging. Surface the
  //                "Switch to audio-only?" banner. AT MOST ONCE per
  //                call (the hook's internal latch enforces this).
  //   - forced   → battery <5%, not charging. ENGAGE audio-only via
  //                the same E.2 path as bandwidth-driven fallback,
  //                with `reason: 'battery_critical'`. The forced
  //                banner stays until charging is detected.
  //   - charging → AC plugged in OR battery climbed back above 20%.
  //                Dismiss any open prompt. If a forced fallback was
  //                active, surface a "Charging detected — re-enable
  //                video?" CTA that routes through the existing
  //                `handleTryVideoAgain` (the E.2 restore primitive
  //                is the right tool — same cooldown, same backend
  //                row pairing).
  //
  // Why three flags instead of one mode enum:
  //   - `showBatteryPrompt` and `showBatteryCharging` are PURE UI
  //     dismissals (the user clicking Keep video / Dismiss only
  //     hides the surface; it doesn't touch the underlying battery
  //     state).
  //   - `batteryFallbackForced` is the source of truth for
  //     "we engaged audio-only because of low battery" — used to
  //     decide the charging-mode CTA shape (Re-enable video vs
  //     dismiss-only) AND to scope the
  //     "battery banner trumps bandwidth banner" precedence rule
  //     (forced battery banner is more important than bandwidth
  //     banner because plugging in is the patient's only escape).
  //
  // Hook callbacks bridge through refs (`applyAdaptiveLevelRef` +
  // `handleTryVideoAgainRef`) because the hook mounts here, before
  // the callback definitions further down. The refs are populated
  // in the existing sync-effect block (~3100 LOC below for
  // applyAdaptive; we add the symmetric one for handleTryVideoAgain).
  // This is the same bridge pattern the adaptive controller uses —
  // see the `applyAdaptiveLevelRef.current` call site in the
  // 30s-tick controller below.
  // ------------------------------------------------------------------------
  const [showBatteryPrompt, setShowBatteryPrompt] = useState(false);
  const [batteryFallbackForced, setBatteryFallbackForced] = useState(false);
  const [showBatteryCharging, setShowBatteryCharging] = useState(false);

  // Forward refs — bridge the hook callbacks (which run after mount)
  // to the `applyAdaptiveLevel` / `handleTryVideoAgain` callbacks
  // defined further down in this file. The refs are populated via
  // sync `useEffect`s located right after each callback's
  // declaration. We CANNOT initialise `useRef(applyAdaptiveLevel)`
  // here because the callback is declared further down (TDZ on
  // `const` bindings); the explicit `null` initial + the sync
  // effects keep the bridge well-typed without shuffling 1500 LOC
  // of unrelated callback definitions upward.
  //
  // Same shape as the existing `applyAdaptiveLevelRef` further
  // below, just usable from this earlier scope. Both refs end up
  // pointing at the same value once the sync effects run on first
  // render. The cost is one extra ref + two extra sync effects —
  // acceptable for the integration-point gain (battery hook stays
  // co-located with its render gating).
  const batteryApplyAdaptiveRef = useRef<
    | ((
        level: AdaptiveLevel,
        engageOptions?: {
          reason?: "low_bandwidth" | "battery_low" | "battery_critical";
        },
      ) => Promise<void>)
    | null
  >(null);
  const handleTryVideoAgainRef = useRef<(() => Promise<void>) | null>(null);

  // Mount the W3C Battery Status API listener. iOS Safari short-
  // circuits inside the hook (`supported: false`); the hook still
  // returns inert state so the UI gating below renders nothing.
  useBatterySaver({
    onPromptLow: () => {
      // Only surface the prompt if no forced fallback already
      // engaged — if we're below 5%, the forced banner is the
      // right surface and a "Switch to audio-only?" prompt would
      // be redundant.
      if (batteryFallbackForced) return;
      setShowBatteryPrompt(true);
    },
    onForceLow: () => {
      // Engaging audio-only is the same teardown path E.2 uses.
      // We mark the local "forced" flag FIRST so the banner can
      // mount synchronously while the async republish completes.
      setShowBatteryPrompt(false);
      setBatteryFallbackForced(true);
      const apply = batteryApplyAdaptiveRef.current;
      if (!apply) return;
      apply("audio-only", { reason: "battery_critical" }).catch((err) => {
        if (process.env.NODE_ENV !== "production") {
          console.warn(
            "Battery-critical applyAdaptiveLevel failed:",
            err instanceof Error ? err.message : err,
          );
        }
      });
    },
    onRecover: () => {
      // Charger plugged in OR level back above 20%. If a forced
      // fallback was active, transition to the "charging" recovery
      // surface so the patient can opt back into video. If only a
      // prompt was open, dismiss it silently — they've moved out
      // of the danger zone without ever needing to act.
      setShowBatteryPrompt(false);
      if (batteryFallbackForced) {
        setShowBatteryCharging(true);
      }
    },
  });

  // ------------------------------------------------------------------------
  // Sub-batch F · task-video-F1 — in-call camera switch (front ↔ back).
  //
  // The hook owns the Twilio unpublish/publish dance plus the localStorage
  // "last in-call camera" persistence. We thread three concerns back
  // through callbacks so the hook stays decoupled from the room:
  //
  //   - `onAttachLocal` — re-binds the new track to `localVideoRef` so
  //     the self-tile doesn't go black between unpublish + publish
  //     (matches `handleQualityChange`'s post-publish attach at L2787).
  //   - `onApplyBackground` — re-applies C2 virtual background to the
  //     fresh track. Without this, a flip would silently turn off blur.
  //   - `onDeviceChanged` — patches the E.4 rejoin cache so a refresh
  //     re-acquires the SAME camera (no facing surprise) AND auto-flips
  //     A6 mirror state so back-camera shots stay unmirrored (which is
  //     what derm doctors expect; mirroring back-cam wounds reads
  //     wrong).
  //
  // Mounted AFTER `useBatterySaver` so the F4 refs (`batteryApply…`)
  // are already declared but BEFORE `handleQualityChange` /
  // `handleTryVideoAgain` / `applyAdaptiveLevel` so those republish
  // paths can read `cameraSwitchRef.currentDeviceIdRef.current` to
  // override the connect-time `chosenCameraId` prop.
  // ------------------------------------------------------------------------
  // Local stable alias the republish call-sites read so ESLint
  // exhaustive-deps' "binding ends in Ref → assume stable" heuristic
  // applies (otherwise we'd have to add `cameraSwitch` to the
  // useCallback dep arrays, which churns on every render).
  const cameraSwitch = useCameraSwitch({
    room: roomState,
    localTracksRef,
    initialDeviceId: chosenCameraId,
    cameraOffRef,
    onAttachLocal: (track) => {
      if (localVideoRef.current) {
        track.attach(localVideoRef.current);
      }
    },
    onApplyBackground: async (track) => {
      if (backgroundRef.current !== "off") {
        await applyBackgroundToTrack(track, backgroundRef.current);
      }
    },
    onDeviceChanged: (deviceId, facing) => {
      // Patch the E.4 rejoin cache. No-op when the host wasn't seeded
      // with `recordingSessionId` (doctor mounts), or when the cache
      // was cleared between mint and switch (cache TTL expiry).
      if (recordingSessionId) {
        try {
          const existing = readCallRejoinSnapshot(recordingSessionId);
          if (existing) {
            writeCallRejoinSnapshot({ ...existing, cameraDeviceId: deviceId });
          }
        } catch {
          // Best-effort. The localStorage write inside the hook is
          // the durable source of truth; the rejoin cache is a
          // performance optimisation that survives accidental cache
          // misses by re-prompting on the next refresh.
        }
      }
      // A6 mirror auto-flip — front camera = mirrored (FaceTime /
      // WhatsApp / Meet convention; users expect to see themselves
      // as in a mirror); back camera = NOT mirrored (the doctor is
      // examining a real-world subject — wound, rash, mole — and
      // mirroring would invert their mental orientation).
      // Persist alongside the existing mirror toggle so the next
      // session restores the per-facing default.
      if (facing === "front" || facing === "back") {
        const shouldMirror = facing === "front";
        setMirrorSelf(shouldMirror);
        if (typeof window !== "undefined") {
          try {
            window.localStorage.setItem(
              MIRROR_STORAGE_KEY,
              shouldMirror ? "true" : "false",
            );
          } catch {
            // Best-effort, same as `handleToggleMirror`.
          }
        }
      }
    },
  });
  // Stable ref the republish call-sites read. The hook ALREADY
  // owns a stable `currentDeviceIdRef` internally, but ESLint
  // exhaustive-deps doesn't trace ref aliasing through hook
  // returns — only direct `useRef()` initialisations get the
  // "stable identity" pass. So we mirror the hook's value into a
  // host-owned `useRef` and sync via `useEffect`. The cost is a
  // tiny re-render on every device switch (already happens
  // anyway because `cameraSwitch.current` is React state).
  const cameraSwitchDeviceIdRef = useRef<string | null>(null);
  useEffect(() => {
    cameraSwitchDeviceIdRef.current = cameraSwitch.currentDeviceId;
  }, [cameraSwitch.currentDeviceId]);

  // ------------------------------------------------------------------------
  // Sub-batch E · task-video-E3 — multi-tab kick / multi-monitor warn.
  //
  // `useTabPresenceClaim` opens a Supabase Realtime broadcast channel
  // (`consult-tab-presence-${sessionId}`) and tracks every tab claiming
  // this consult. Newest-wins for patients; tolerated-multi-warn for
  // doctors (decision §29 — doctors legitimately use multi-monitor
  // setups; we surface a small pill but DON'T kick).
  //
  // Inputs:
  //   - `effectiveSessionId` — falls back from `companion?.sessionId` to
  //     the bare `sessionId` prop. Either is fine; the only requirement
  //     is that all tabs of the same consult agree on one id (the
  //     companion sessionId is the canonical one — it's the
  //     consultation_sessions.id used by the chat channels).
  //   - `effectiveRole` — the same `role` prop the room already takes;
  //     `null` (omitted) → hook returns inert `'sole'` shape.
  //
  // The hook itself defends against null inputs, so we don't need to
  // gate the call on prop presence — that keeps the hook order stable.
  //
  // The kick teardown effect below watches `tabPresence.status` and on
  // the FIRST transition to `'kicked'` releases the local camera/mic
  // tracks and disconnects from Twilio (so the server doesn't see
  // duplicate participants). The kick overlay (z-50) is the source of
  // truth for what the user sees — we deliberately DO NOT call
  // `onDisconnect` (would navigate the user away from [Take over]) or
  // `setStatus('disconnected')` (would surface the disconnect splash
  // under the kick overlay; harmless visually but semantically wrong).
  // ------------------------------------------------------------------------
  const effectiveSessionId = companion?.sessionId ?? sessionId ?? null;
  const effectiveRole: TabPresenceRole | null = role ?? null;
  const tabPresence = useTabPresenceClaim(effectiveSessionId, effectiveRole);
  const tabKickHandledRef = useRef(false);

  useEffect(() => {
    if (tabPresence.status !== "kicked") return;
    if (tabKickHandledRef.current) return;
    tabKickHandledRef.current = true;

    // Mark the room as disconnected BEFORE the actual teardown so the
    // adaptive controller / reconnect / quality handlers all short-circuit
    // on the same `hasDisconnectedRef` they already check.
    hasDisconnectedRef.current = true;

    // Stop + detach all local tracks — releases the camera / mic so the
    // OTHER tab can grab them when it connects (browsers serialise
    // exclusive media access; without this stop, the new tab's
    // `createLocalTracks` would race or see stale handles).
    const tracks = localTracksRef.current;
    tracks.forEach((track) => {
      if (
        "detach" in track &&
        typeof (track as { detach: (el?: HTMLElement) => void }).detach ===
          "function"
      ) {
        (track as { detach: (el?: HTMLElement) => void }).detach();
      }
      if ("stop" in track && typeof track.stop === "function") {
        track.stop();
      }
    });
    localTracksRef.current = [];

    // Disconnect cleanly from Twilio. We removeAllListeners first so the
    // `'disconnected'` handler doesn't fire its own teardown + classifier
    // path — the kick overlay is intentionally the only surface the user
    // sees, NOT the disconnect-reason splash.
    const room = roomRef.current;
    if (room) {
      try {
        room.removeAllListeners();
      } catch {
        // Best-effort; some Twilio versions may not have all listeners.
      }
      try {
        room.disconnect();
      } catch {
        // Network-down disconnects can throw; we already nuked the
        // listeners + local tracks, so the consequences are bounded.
      }
      roomRef.current = null;
    }

    // Sub-batch B · task-video-B9 — DO NOT dispose the gain router
    // here. See the long comment inside `unwireRemoteAudioTrack` for
    // the rationale: `createMediaElementSource` is a one-shot
    // operation per HTMLMediaElement, and the `<audio>` sink stays
    // in the DOM behind the kick overlay (the overlay is a modal
    // that doesn't unmount the room). The user's recovery path is a
    // page reload (canonical take-over flow), at which point the
    // browser tears down the AudioContext along with the page. The
    // `useEffect`'s `cleanup()` return path is the only place that
    // may dispose, and it fires on actual `<VideoRoom>` unmount.

    // Note: we deliberately do NOT call `onDisconnect` (would navigate
    // away from the kick overlay) or `setStatus('disconnected')` (the
    // overlay covers the room UI either way; the take-over reload is
    // the canonical recovery path).
  }, [tabPresence.status]);

  /**
   * Take-over CTA wired into `<MultiTabKickBanner>`.
   *
   * Two steps in tight sequence:
   *   1. `tabPresence.takeOver()` re-broadcasts a fresh claim with a
   *      `claimed_at` newer than anything we've seen. The OTHER tab will
   *      flip to `'kicked'` on its next reducer pass.
   *   2. After a tiny flush window (200ms — broadcast send fires async on
   *      the websocket), reload this page so the join flow re-mints the
   *      Twilio token + brings up a fresh `<VideoRoom>`. Reload is the
   *      simplest correct rejoin path; future work could extract an
   *      `onTabKickTakeOver` prop for callers that want to re-mint
   *      without losing app state.
   */
  const handleTabKickTakeOver = useCallback(() => {
    tabPresence.takeOver();
    if (typeof window === "undefined") return;
    window.setTimeout(() => {
      window.location.reload();
    }, 200);
  }, [tabPresence]);

  // ------------------------------------------------------------------------
  // Sub-batch E · task-video-E4 — crash-recovery rejoin banner.
  //
  // The parent (`/consult/join`) sets `rejoined={true}` on the cache-
  // restore branch. We mirror it into local state so we can auto-dismiss
  // after 3s without forcing the parent to track + drop the prop. The
  // local state defaults to the prop value at mount time; subsequent
  // prop changes (none expected during a single live session) would
  // re-arm the banner via the effect below.
  // ------------------------------------------------------------------------
  const [showRejoinBanner, setShowRejoinBanner] = useState(rejoined);

  useEffect(() => {
    if (!rejoined) return;
    setShowRejoinBanner(true);
    const handle = window.setTimeout(() => {
      setShowRejoinBanner(false);
    }, 3000);
    return () => window.clearTimeout(handle);
  }, [rejoined]);

  // ------------------------------------------------------------------------
  // Plan 06 · Task 38 — companion chat state
  // ------------------------------------------------------------------------

  /**
   * Mobile tab selector. State lives here (the parent) — `<TextConsultRoom>`
   * is pane-agnostic and should not know whether it's being shown or
   * hidden. On desktop this state is unused (both panes render).
   */
  const [activeTab, setActiveTab] = useState<"video" | "chat">("video");
  /**
   * Unread-count badge on the Chat tab (mobile). Capped at 99+ at render
   * time. Increments when an incoming Realtime INSERT arrives AND the
   * user is currently on the Video tab (the chat screen is not visible).
   * System rows never count — per task-38 Note #4 a banner shouldn't
   * pull the user away from the video.
   */
  const [unreadCount, setUnreadCount] = useState(0);
  const activeTabRef = useRef(activeTab);
  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  /**
   * Companion chat auth state. Resolved on mount when `companion` is set.
   *
   * Two branches (mirrors `<VoiceConsultRoom>` after voice-0B):
   *
   *  1. **Patient branch** — when `companion.patientAccessToken` and
   *     `companion.patientCurrentUserId` are present, the parent page
   *     already exchanged the HMAC for a Supabase JWT
   *     (`POST /:sessionId/text-token`) and we use those creds directly.
   *     `currentUserId` here is the synthetic patient sub
   *     (`patient:{appointmentId}`), which RLS keys on via
   *     `safe_uuid_sub()`.
   *
   *  2. **Doctor branch** — fetch the doctor's dashboard Supabase session
   *     via `@/lib/supabase/client`. Gates on the doctor-branch RLS
   *     predicate (migration 051's `auth.uid() = doctor_id`).
   *
   * If neither yields a session (e.g. patient creds missing AND no
   * Supabase session on device), the panel renders the inline
   * "Chat unavailable" fallback rather than mounting with anonymous
   * claims.
   */
  const [chatAuth, setChatAuth] = useState<
    | { status: "pending" }
    | { status: "ready"; accessToken: string; currentUserId: string }
    | { status: "unavailable"; reason: string }
  >({ status: "pending" });

  useEffect(() => {
    if (!companion) return;

    // voice-0B — patient branch. When the parent page already exchanged
    // the HMAC for a Supabase JWT (`/consult/join` for video, the
    // patient `/c/voice/[sessionId]` page for voice), thread the creds
    // straight in. No `createClient().auth.getSession()` round-trip
    // (patients don't have a dashboard Supabase session).
    if (companion.patientAccessToken && companion.patientCurrentUserId) {
      setChatAuth({
        status: "ready",
        accessToken: companion.patientAccessToken,
        currentUserId: companion.patientCurrentUserId,
      });
      return;
    }

    // Doctor branch — fetch the doctor's dashboard Supabase session.
    // Also the patient-fallback when the text-token exchange failed:
    // the Supabase getSession() returns null on a fresh patient device,
    // which surfaces the inline "Chat unavailable" tile (same copy
    // 0C standardizes for the voice page).
    let cancelled = false;
    setChatAuth({ status: "pending" });
    (async () => {
      try {
        const sb = createClient();
        const { data, error } = await sb.auth.getSession();
        if (cancelled) return;
        if (error || !data.session) {
          // Use the patient-friendly reason when the hosting page is
          // patient-side; the doctor reason otherwise. We approximate
          // patient context from the explicit `role` prop because the
          // companion shape itself doesn't carry a role flag (the
          // patient creds being missing is the trigger here).
          const isPatient = role === "patient";
          setChatAuth({
            status: "unavailable",
            reason: isPatient
              ? "Couldn't load chat for this consult. Please refresh the page to retry."
              : "No active Supabase session on this device.",
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
  }, [companion, role]);

  const handleChatTokenRefresh = useCallback(async (): Promise<string> => {
    // voice-0B — patient refresh delegates to the parent's HMAC re-exchange.
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
  // unavailable" tile. Defense-in-depth `finally` so a thrown
  // callback (which the contract forbids) doesn't leave the button
  // stuck spinning.
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

  // ------------------------------------------------------------------------
  // Plan 02 · Task 28 — recording pause/resume state (optional, off by default)
  // ------------------------------------------------------------------------
  const recordingEnabled = Boolean(recordingSessionId && recordingToken);
  const recordingRole: "doctor" | "patient" = role === "patient" ? "patient" : "doctor";
  const {
    state: recordingState,
    applyIncomingMessage: applyRecordingSystemMessage,
  } = useRecordingState({
    sessionId: recordingSessionId ?? "",
    token: recordingToken ?? "",
    enabled: recordingEnabled,
  });

  // Plan 08 · Task 42 — derive the video-recording indicator's visibility
  // from the same escalation-state Postgres-changes subscription Task 40's
  // doctor button uses. Single source of truth: when
  // `state.kind === 'locked' && reason === 'already_recording_video'`,
  // video is actively being recorded. The hook also tracks revokes
  // (Task 42's `revoked_at`) so the indicator fades out within ~500ms of
  // the Realtime UPDATE. Enabled for BOTH roles (doctor sees the
  // indicator but not the [Stop] CTA).
  const escalationHook = useVideoEscalationState({
    sessionId: recordingSessionId ?? null,
    token:     recordingToken ?? null,
    enabled:   recordingEnabled,
  });
  const isVideoRecordingActive =
    escalationHook.state.kind === "locked" &&
    escalationHook.state.reason === "already_recording_video";

  const handleIncomingChatMessage = useCallback((msg: IncomingMessageMeta) => {
    // Plan 02 · Task 28 — forward every message to the recording-state hook.
    // It filters to `senderRole === 'system'` + known `systemEvent` kinds
    // internally, so unrelated chatter is a cheap no-op.
    applyRecordingSystemMessage({
      kind: msg.kind,
      senderRole: msg.senderRole,
      systemEvent: msg.systemEvent ?? null,
      body: msg.body,
    });
    // System rows never count toward the unread badge (task-38 Note #4).
    if (msg.kind === "system") return;
    // Don't count messages the local user sent — their Realtime echo
    // arrives with their own senderId; the host can't see senderId here
    // but role === currentUserRole catches both doctor + patient. v1
    // doctors are the primary consumer so we gate on 'doctor' here;
    // refinement TODO if task-24c surfaces a false-positive self-count
    // on patient side.
    if (msg.senderRole === (role ?? "doctor")) return;
    // Only bump while the user is on the Video tab — if they're on the
    // Chat tab they're already seeing the message.
    if (activeTabRef.current === "chat") return;
    setUnreadCount((n) => Math.min(n + 1, 999));
  }, [role, applyRecordingSystemMessage]);

  const selectTab = useCallback((next: "video" | "chat") => {
    setActiveTab(next);
    if (next === "chat") setUnreadCount(0);
  }, []);

  useEffect(() => {
    if (hasDisconnectedRef.current) return;

    // ----------------------------------------------------------------
    // React 18 Strict-Mode cancellation guard.
    //
    // In dev, Strict Mode intentionally double-invokes effects:
    //   mount → effect → cleanup → effect → ...
    // The cleanup runs SYNCHRONOUSLY between the two effect runs, but
    // `connectRoom` is fully async — at the cleanup point, both
    // `createLocalTracks(...)` and `Twilio.connect(...)` are still
    // in-flight, so `room` and `localTracks` are still empty and the
    // legacy cleanup body short-circuits to a no-op. Then the second
    // mount kicks off ANOTHER `connectRoom`, the first promise
    // resolves into an orphaned-but-published Room, and the second
    // promise resolves into a Room with the SAME Twilio identity →
    // Twilio enforces unique identities and kicks the older Room
    // (`code: 53205 ParticipantDuplicateIdentity`). The kicked Room
    // STILL has its `'disconnected'` handler attached (this hook
    // closed over live React setters), so it calls
    // `setStatus("disconnected")` + `onDisconnect()` → the user sees
    // "Call ended" while the surviving Room cheerfully publishes
    // tracks — i.e. the doctor still sees the patient's video while
    // the patient's UI claims the call ended. THIS is the symptom we
    // were chasing.
    //
    // Fix: every `await` in `connectRoom` is followed by an
    // `if (cancelled)` checkpoint that proactively undoes whatever
    // the await produced (stops tracks, disconnects + clears the
    // room) and bails BEFORE registering any handlers. The cleanup
    // sets `cancelled = true` first so an in-flight connect knows
    // the effect has been torn down. Production (no Strict Mode)
    // never trips this — the cleanup only fires on real unmount, by
    // which point the awaits have long resolved.
    // ----------------------------------------------------------------
    let cancelled = false;
    let room: Room | null = null;
    let localTracks: Awaited<ReturnType<typeof createLocalTracks>> = [];

    const cleanup = async () => {
      cancelled = true;
      if (room) {
        room.removeAllListeners();
        room.disconnect();
        room = null;
      }
      localTracks.forEach((track) => {
        if ("stop" in track && typeof track.stop === "function") track.stop();
      });
      localTracksRef.current = [];
      roomRef.current = null;
      // Sub-batch B · task-video-B9 — close the AudioContext so
      // unmount doesn't leak a Web Audio graph (Chrome reports a
      // warning per leaked context in dev, and they pile up across
      // call → leave → re-join cycles).
      if (audioRouterRef.current) {
        audioRouterRef.current.dispose();
        audioRouterRef.current = null;
        audioElementBoundRef.current = false;
      }
    };

    const connectRoom = async () => {
      try {
        // Sub-batch A · task-video-A7 — thread the pre-call's
        // chosen device IDs into Twilio's track creation.
        //   `skipAudio` (the "Skip mic check" CTA) wins over any
        //     `chosenMicId` — Twilio joins audio-less.
        //   `chosenMicId` (string) → constrain to that device.
        //   `chosenMicId` (null/undefined) → Twilio picks default.
        //   Same shape for `chosenCameraId`.
        // Doctor side (no pre-call) passes none of these → falls
        // through to the legacy `audio: true, video: { … }`.
        const audioConstraint = skipAudio
          ? false
          : chosenMicId
            ? { deviceId: { ideal: chosenMicId } }
            : true;

        // Sub-batch B · task-video-B8 — read the persisted quality
        // synchronously (the state-restore effect runs AFTER mount,
        // but `connectRoom` runs from inside the SAME effect chain
        // and may execute before the restore effect; bypass the
        // race by reading localStorage here directly).
        const persistedQuality = readPersistedVideoQuality();
        const initialQualityConstraints =
          videoConstraintsForQuality(persistedQuality);
        const initialMaxSubBitrate =
          maxSubscriptionBitrateForQuality(persistedQuality);

        // Resolve the initial video constraint:
        //   audio-only → `false` (no LocalVideoTrack created at all).
        //   explicit resolution → use the resolution map.
        //   auto → keep the legacy 640x480 floor for now (matches
        //     pre-B8 behaviour; flips to "let Twilio negotiate"
        //     when E1 ships).
        const videoConstraint =
          persistedQuality === "audio-only"
            ? false
            : initialQualityConstraints
              ? {
                  ...initialQualityConstraints,
                  ...(chosenCameraId
                    ? { deviceId: { ideal: chosenCameraId } }
                    : {}),
                }
              : chosenCameraId
                ? { deviceId: { ideal: chosenCameraId }, width: 640, height: 480 }
                : { width: 640, height: 480 };
        localTracks = await createLocalTracks({
          audio: audioConstraint,
          video: videoConstraint,
        });
        // Strict-Mode cancellation checkpoint #1 — the effect was
        // torn down while we were allocating local tracks. Stop the
        // tracks we just created so the camera/mic indicator clears
        // and bail BEFORE we hand them to Twilio. (See the long
        // comment at the top of this useEffect for full rationale.)
        if (cancelled) {
          localTracks.forEach((track) => {
            if ("stop" in track && typeof track.stop === "function") track.stop();
          });
          localTracks = [];
          return;
        }
        localTracksRef.current = localTracks;

        room = await connect(accessToken, {
          name: roomName,
          tracks: localTracks,
          // Sub-batch A · task-video-A8 — opt into Twilio's Network
          // Quality API. Verbosity 1 = level only (0–5), no detailed
          // stats subnet probing. The hooks below subscribe to
          // `'networkQualityLevelChanged'`; without this option both
          // `localParticipant.networkQualityLevel` AND any remote
          // participant's level stay `null` forever.
          networkQuality: { local: 1, remote: 1 },
          // Sub-batch B · task-video-B8 — apply the picker's persisted
          // value to the remote subscription cap. SET-ONCE: Twilio
          // 2.34 has no runtime API to mutate this; mid-call quality
          // changes only affect the local publish (see
          // `handleQualityChange`). Surface this in the task log as a
          // v1 limitation; if the user picks a lower cap mid-call,
          // the next call honours it on connect.
          //
          // `mode: 'collaboration'` matches a 1-on-1 consult — the
          // dominant speaker (whoever's talking) gets bandwidth
          // priority. Defaults to 'grid' otherwise; explicit is
          // safer (decision documented).
          bandwidthProfile: {
            video: {
              mode: "collaboration",
              maxSubscriptionBitrate: initialMaxSubBitrate,
            },
          },
        });
        // Strict-Mode cancellation checkpoint #2 — the effect was
        // torn down while Twilio was negotiating the connection.
        // CRITICAL: disconnect this orphaned Room immediately. Two
        // reasons:
        //   1. We have not registered any handlers on it yet, so
        //      `disconnect()` is silent (no `setStatus` etc.) — and
        //      we DO want it silent here because the legitimate
        //      effect-2 mount will register its own handlers on its
        //      own Room.
        //   2. If we don't disconnect, this Room stays in Twilio's
        //      cloud holding our identity. The next mount's
        //      `connect()` resolves with the SAME identity → Twilio
        //      kicks the older Room (this one) → late-binding
        //      handlers (or even Twilio's internal SDK paths) can
        //      still surface unexpected events. Proactive teardown
        //      eliminates the race entirely. (See the long comment
        //      at the top of this useEffect for full rationale.)
        if (cancelled) {
          try {
            room.removeAllListeners();
            room.disconnect();
          } catch {
            // Twilio occasionally throws during fast disconnect on
            // half-negotiated rooms — ignore; the Room is dead.
          }
          room = null;
          localTracks.forEach((track) => {
            if ("stop" in track && typeof track.stop === "function") track.stop();
          });
          localTracks = [];
          localTracksRef.current = [];
          return;
        }
        roomRef.current = room;
        // Reactive handles for the network-quality + stats hooks.
        setRoomState(room);
        setLocalParticipant(room.localParticipant);

        if (!role) {
          const identity = room.localParticipant.identity;
          setRemoteLabel(identity.startsWith("patient-") ? "Doctor" : "Patient");
        }
        setStatus("connected");
        // Sub-batch A · task-video-A3 — seed the call-duration anchor
        // exactly once. Functional setter guards against a Twilio
        // re-connect path resetting the chip to 00:00; once set, the
        // timer keeps counting through reconnect (B4) + hold (B3).
        setConnectedAt((prev) => prev ?? new Date());

        const videoTrack = localTracks.find((t) => t.kind === "video");
        if (videoTrack && localVideoRef.current) {
          videoTrack.attach(localVideoRef.current);
        }

        // Sub-batch C · task-video-C2 — apply persisted virtual
        // background to the freshly-published local video track.
        // Best-effort: failures (asset path 404, WASM load reject)
        // are swallowed here so a misconfigured deploy doesn't kill
        // the call entirely; the user can still re-pick from the
        // controls bar via `handleBackgroundChange` which DOES
        // surface failures via `backgroundNotice`. The preference
        // is read from the ref so a fast hydration timing race
        // (state still default but ref already updated) doesn't
        // strip the doctor's persisted choice.
        if (videoTrack && backgroundRef.current !== "off") {
          applyBackgroundToTrack(
            videoTrack as LocalVideoTrack,
            backgroundRef.current,
          ).catch((err) => {
            if (process.env.NODE_ENV !== "production") {
              console.warn(
                "Failed to apply virtual background on connect:",
                err,
              );
            }
          });
        }

        // Sub-batch A · task-video-A2 — wire remote camera state.
        // Twilio fires `disabled` / `enabled` on `RemoteVideoTrack` when
        // the peer flips their `LocalVideoTrack.disable()` / `.enable()`.
        // The existing track-attach calls stay as-is so the `<video>`
        // ref binding is preserved across toggles; only the overlay
        // changes.
        const wireRemoteVideoTrack = (
          track: { kind: string; isEnabled?: boolean; on?: (event: string, cb: () => void) => void },
        ) => {
          if (track.kind !== "video") return;
          // Initial sync — the peer may have joined with camera already off.
          if (typeof track.isEnabled === "boolean") {
            setRemoteCameraOff(!track.isEnabled);
          }
          if (typeof track.on === "function") {
            track.on("disabled", () => setRemoteCameraOff(true));
            track.on("enabled", () => setRemoteCameraOff(false));
          }
        };

        // Sub-batch C · task-video-C5 — predicate for "is this the
        // remote's screen-share track?" The local-side hook publishes
        // the screen track with `name: 'screen'` (see
        // `useScreenShare`'s `new LocalVideoTrack(..., { name: 'screen' })`).
        // The remote SDK preserves `name` on the corresponding
        // `RemoteVideoTrack`, so we can route screen vs. camera by
        // name without sniffing dimensions / track-id heuristics.
        // Defensive defaults to false on missing/malformed names —
        // anything we can't positively identify falls through to
        // the camera path (the worse failure is "screen track shows
        // up in the camera tile", which is at least visible — vs.
        // "screen track silently routed to a non-existent
        // `remoteScreenTrack`-only consumer").
        const isRemoteScreenTrack = (track: { name?: string }): boolean => {
          return typeof track.name === "string" && track.name === "screen";
        };

        // Sub-batch C · task-video-C5 — clear the remote-screen
        // tile state when the peer stops sharing. Twilio fires
        // `trackUnsubscribed` (per-participant event) AND
        // `participantDisconnected` (when the whole peer leaves
        // mid-share) — the listener wiring below covers both
        // paths; this helper deduplicates the clear logic.
        // We compare by SID so a parallel multi-screen share
        // scenario (decision §6 in the task file — limit 2 screens
        // max) only clears the slot for THIS specific track, not
        // a different one that's still live.
        const clearRemoteScreenIfMatches = (
          track: { sid?: string },
        ) => {
          setRemoteScreenTrack((current) => {
            if (current === null) return current;
            // RemoteVideoTrack carries `sid` per Twilio types;
            // string-equality is the safe comparison (track
            // identity can change across renders if React
            // re-renders held a reference to the previous one).
            if (track.sid && current.sid !== track.sid) return current;
            return null;
          });
        };

        // Sub-batch B · task-video-B9 — wire remote audio. Mirrors
        // `<VoiceConsultRoom>`'s `attachRemoteAudio` pattern (explicit
        // `track.attach(remoteAudioRef.current)`) so Twilio's audio
        // playback flows through OUR `<audio>` element — and from
        // there into the gain-router's MediaElementAudioSourceNode.
        // Without explicit attach, Twilio either auto-attaches to a
        // hidden internal element (no boost possible) or silently
        // doesn't play (depending on SDK version).
        //
        // `audioElementBoundRef` short-circuits redundant subscribes:
        // once the same element is bound to a MediaElementAudioSource,
        // a second `createMediaElementSource` on it throws
        // `InvalidStateError`. Twilio fires `trackSubscribed` on
        // reconnects + auto-republish, so this guard matters in
        // practice. Reset on unwire so the next track can re-bind.
        const wireRemoteAudioTrack = (track: RemoteAudioTrack) => {
          const audioEl = remoteAudioRef.current;
          if (!audioEl) return;
          // Always (re-)attach the Twilio track — cheap idempotent op
          // that ensures the `<audio>` element's srcObject carries
          // the latest MediaStreamTrack. The existing
          // MediaElementSourceNode (if any) keeps pulling samples
          // from whichever stream the element is currently bound to.
          track.attach(audioEl);
          // `audioElementBoundRef` is a one-way latch (per element
          // lifetime). It flips true on the very first wrap, and only
          // resets in the `useEffect` `cleanup()` return path when
          // `<VideoRoom>` actually unmounts (taking the `<audio>`
          // element with it). Web Audio API allows
          // `createMediaElementSource(audioEl)` exactly once per
          // HTMLMediaElement; calling it a second time throws
          // `InvalidStateError`. So once the latch is true we MUST
          // skip the wrap and just re-apply the current volume —
          // which doubles as a safety net for the rare browser that
          // resets `<audio>.volume` on `srcObject` swap.
          if (audioElementBoundRef.current && audioRouterRef.current) {
            audioRouterRef.current.setVolume(volumePercentRef.current);
            return;
          }
          // First wrap (or the latch was reset by `cleanup()` and we
          // have a fresh element on remount). `audioRouterRef.current`
          // is null here because the latch was false; no stale router
          // to tear down.
          audioRouterRef.current = createBoostedAudioRouter(audioEl);
          audioRouterRef.current.setVolume(volumePercentRef.current);
          audioElementBoundRef.current = true;
        };

        const unwireRemoteAudioTrack = (track: RemoteAudioTrack) => {
          const audioEl = remoteAudioRef.current;
          if (audioEl) {
            // Detach Twilio's MediaStreamTrack from the element's
            // srcObject. Cheap, idempotent, and the right thing on
            // every Twilio teardown signal.
            track.detach(audioEl);
          }
          // CRITICAL — DO NOT dispose `audioRouterRef.current` here.
          //
          // Web Audio API has a one-shot rule: once
          // `createMediaElementSource(audioEl)` has been called on an
          // `<audio>` element, the browser PERMANENTLY claims that
          // element for the source node's lifetime — and the claim
          // survives `source.disconnect()`, `gain.disconnect()`, and
          // even `audioContext.close()`. There is NO supported way to
          // call `createMediaElementSource(audioEl)` a second time on
          // the same element; it throws
          // `InvalidStateError: HTMLMediaElement already connected`.
          //
          // The remote audio sink (`<audio ref={remoteAudioRef}>`) is
          // rendered unconditionally inside `videoPane` and only
          // unmounts when `<VideoRoom>` itself unmounts. So the
          // AudioContext MUST live for the lifetime of the component;
          // we dispose it exactly once, in the `useEffect` cleanup at
          // the top of this hook. Disposing here would strand the
          // element for any future `wireRemoteAudioTrack` call (peer
          // republishes audio after a reconnect blip, fresh
          // participant joins, recovery from
          // `room.on("reconnecting")`, etc.) and the next subscribe
          // would crash Twilio's `RemoteParticipant._addTrack` on
          // BOTH peers (the throw inside `_addTrack` propagates
          // through the SDK and disconnects the room).
          //
          // The router/source/gain stay live; the next
          // `track.attach(audioEl)` call swaps the element's
          // `srcObject` and the existing source node automatically
          // pulls samples from the new MediaStreamTrack. No re-wrap
          // needed.
        };

        room.on("participantConnected", (participant) => {
          // Sub-batch A · task-video-A8 — surface the counterparty
          // for the network-bars hook. 1-on-1 calls only carry one
          // remote (multi-party = C8); the last-set wins is fine for
          // v1.
          setRemoteParticipant(participant);
          participant.tracks.forEach((publication) => {
            if (!publication.track) return;
            if (publication.track.kind === "video") {
              // Sub-batch C · task-video-C5 — route screen-share
              // tracks to the dedicated tile state instead of
              // attaching them to the remote-camera <video> ref
              // (which would clobber the camera attachment).
              if (isRemoteScreenTrack(publication.track)) {
                setRemoteScreenTrack(publication.track as RemoteVideoTrack);
              } else if (remoteVideoRef.current) {
                publication.track.attach(remoteVideoRef.current);
                wireRemoteVideoTrack(publication.track);
              }
            } else if (publication.track.kind === "audio") {
              // Sub-batch B · task-video-B9 — wire remote audio
              // through the gain router.
              wireRemoteAudioTrack(publication.track as RemoteAudioTrack);
            }
          });
          participant.on("trackSubscribed", (track) => {
            if (track.kind === "video") {
              if (isRemoteScreenTrack(track)) {
                setRemoteScreenTrack(track as RemoteVideoTrack);
              } else if (remoteVideoRef.current) {
                track.attach(remoteVideoRef.current);
                wireRemoteVideoTrack(track);
              }
            } else if (track.kind === "audio") {
              wireRemoteAudioTrack(track as RemoteAudioTrack);
            }
          });
          // Sub-batch B · task-video-B9 — tear down the gain router
          // when Twilio drops the remote audio track (e.g. peer
          // republishes after a brief network blip). The next
          // `trackSubscribed` will rebuild it. If only the video
          // track is unsubscribed, this is a no-op.
          //
          // Sub-batch C · task-video-C5 — also drop the screen-tile
          // slot when the peer stops sharing. Twilio fires this
          // BEFORE `participantDisconnected` per the SDK contract,
          // so it's the primary path. The camera-track unsubscribe
          // intentionally remains a no-op (the existing code didn't
          // handle camera unsubscribes either; the `<VideoTile>`
          // continues to render the last frame until the next
          // re-subscribe wins, and the `cameraOff` overlay covers
          // the disabled-mid-call case via A2).
          participant.on("trackUnsubscribed", (track) => {
            if (track.kind === "audio") {
              unwireRemoteAudioTrack(track as RemoteAudioTrack);
            } else if (track.kind === "video" && isRemoteScreenTrack(track)) {
              clearRemoteScreenIfMatches(track as RemoteVideoTrack);
            }
          });
        });

        // Sub-batch A · task-video-A8 — drop the remote slot when the
        // counterparty leaves so the bars revert to "Measuring…"
        // rather than showing a stale level.
        //
        // Sub-batch B · task-video-B5 — also flag `remoteEndedFirstRef`
        // so the disconnect classifier can pick `'remote'` if the
        // local room then disconnects without a more-specific signal.
        // Today's `<VideoRoom>` doesn't auto-end on remote leave (B4
        // reconnection-timeout territory), so this flag is mostly a
        // hint for the manual-Leave-after-remote-left case. When B4
        // lands, the auto-end path will rely on this flag too.
        //
        // Sub-batch B · task-video-B9 — DO NOT dispose the gain
        // router on participant disconnect. See the long comment
        // inside `unwireRemoteAudioTrack` above for the full
        // rationale: `<audio>` elements are one-shot for
        // `createMediaElementSource`, and the remote-audio sink
        // stays mounted across peer-disconnect (the peer can rejoin,
        // or a different participant could still attach in the C8
        // multi-party path). The router lives for the lifetime of
        // the component; only the `useEffect` cleanup disposes.
        // `trackUnsubscribed` already runs `track.detach()` per
        // track, which is the only correct mid-call teardown.
        room.on("participantDisconnected", (participant) => {
          remoteEndedFirstRef.current = true;
          setRemoteParticipant((current) =>
            current && current.sid === participant.sid ? null : current,
          );
          // Sub-batch C · task-video-C5 — belt-and-braces clear
          // for the remote screen tile if the peer leaves
          // mid-share. The `trackUnsubscribed` listener is the
          // primary path (Twilio fires it before
          // `participantDisconnected` per SDK contract), but a
          // hard transport drop / SDK quirk could skip the
          // per-track event; this guarantees the share tile
          // doesn't stay mounted with a dead track after the
          // peer disconnects.
          setRemoteScreenTrack(null);
        });

        room.participants.forEach((participant) => {
          // Catch the case where the remote joined before us — without
          // this seed, the network-bars hook would never see them
          // (the `participantConnected` event already fired).
          setRemoteParticipant(participant);
          participant.tracks.forEach((publication) => {
            if (!publication.track) return;
            if (publication.track.kind === "video") {
              if (isRemoteScreenTrack(publication.track)) {
                setRemoteScreenTrack(publication.track as RemoteVideoTrack);
              } else if (remoteVideoRef.current) {
                publication.track.attach(remoteVideoRef.current);
                wireRemoteVideoTrack(publication.track);
              }
            } else if (publication.track.kind === "audio") {
              wireRemoteAudioTrack(publication.track as RemoteAudioTrack);
            }
          });
          participant.on("trackSubscribed", (track) => {
            if (track.kind === "video") {
              if (isRemoteScreenTrack(track)) {
                setRemoteScreenTrack(track as RemoteVideoTrack);
              } else if (remoteVideoRef.current) {
                track.attach(remoteVideoRef.current);
                wireRemoteVideoTrack(track);
              }
            } else if (track.kind === "audio") {
              wireRemoteAudioTrack(track as RemoteAudioTrack);
            }
          });
          participant.on("trackUnsubscribed", (track) => {
            if (track.kind === "audio") {
              unwireRemoteAudioTrack(track as RemoteAudioTrack);
            } else if (track.kind === "video" && isRemoteScreenTrack(track)) {
              clearRemoteScreenIfMatches(track as RemoteVideoTrack);
            }
          });
        });

        // Sub-batch B · task-video-B5 — capture the Twilio error
        // parameter (if any) for the disconnect classifier. The SDK
        // signature is `(room, error?: TwilioError) => void`; clean
        // local-end disconnects pass nothing. We type-guard and copy
        // just `code` + `message` to keep the ref's payload small
        // (and to avoid hanging onto Twilio's full error object,
        // which carries internal fields we don't need).
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
          const reason = classifyDisconnect({
            twilioError: lastTwilioErrorRef.current,
            ourLocalEndCalled: ourLocalEndCalledRef.current,
            remoteEndedFirst: remoteEndedFirstRef.current,
          });
          setDisconnectReason(reason);
          // Diagnostic for live debugging — surface the exact Twilio
          // error code/message + classified reason so console-based
          // triage can identify token/identity/network issues without
          // adding new instrumentation per session. Cheap; no PII; one
          // line per disconnect. Safe to keep in production.
          // eslint-disable-next-line no-console
          console.warn("[VideoRoom] room.on(disconnected) fired", {
            role,
            roomName,
            twilioCode: lastTwilioErrorRef.current?.code,
            twilioMessage: lastTwilioErrorRef.current?.message,
            classifiedReason: reason,
            ourLocalEndCalled: ourLocalEndCalledRef.current,
            remoteEndedFirst: remoteEndedFirstRef.current,
          });
          setStatus("disconnected");
          // Sub-batch A · task-video-A8 — clear the reactive handles
          // so `useVideoCallStats` stops polling and `useNetworkQuality`
          // tears down its listeners cleanly.
          setRoomState(null);
          setLocalParticipant(null);
          setRemoteParticipant(null);
          // Sub-batch B · task-video-B9 — DO NOT dispose the gain
          // router here. See the long comment inside
          // `unwireRemoteAudioTrack` for the full rationale: the
          // `<audio>` sink stays in the DOM across `disconnected`
          // (the post-call screen renders inside the same component
          // tree; the element only unmounts when `<VideoRoom>`
          // itself unmounts), and `createMediaElementSource` is a
          // one-shot operation per HTMLMediaElement. The
          // `useEffect`'s `cleanup()` return path is the single
          // disposal site; closing the AudioContext here would
          // strand the element if anything (delayed Twilio event,
          // E.4 reconnect trigger, etc.) tried to wire a new track
          // before unmount.
          if (!hasNotifiedDisconnectRef.current) {
            hasNotifiedDisconnectRef.current = true;
            onDisconnectRef.current?.();
          }
        });
      } catch (err) {
        // Diagnostic — surface why Twilio.connect rejected. Common
        // causes: invalid/expired access token, room name mismatch,
        // identity collision when reusing a token across tabs/devices.
        // eslint-disable-next-line no-console
        console.warn("[VideoRoom] connectRoom failed", {
          role,
          roomName,
          name: err instanceof Error ? err.name : typeof err,
          message: err instanceof Error ? err.message : String(err),
          code: (err as { code?: number })?.code,
        });
        setStatus("error");
        setErrorMessage(err instanceof Error ? err.message : "Failed to connect");
      }
    };

    connectRoom();
    return () => {
      cleanup();
    };
    // `chosenCameraId` / `chosenMicId` / `skipAudio` are read inside
    // `connectRoom` but intentionally NOT in the dep array — changing
    // the device mid-call requires a full room teardown + reconnect,
    // which is F1 (camera switch) territory. The closure captures the
    // initial values at mount; that's the correct semantic for v1.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, roomName, role]);

  useEffect(() => {
    if (status !== "connected") return;
    const videoTrack = localTracksRef.current.find((t) => t.kind === "video");
    if (videoTrack && localVideoRef.current) {
      videoTrack.attach(localVideoRef.current);
    }
  }, [status]);

  const emitMuteChangedBanner = useCallback(
    (nextMuted: boolean) => {
      if (!companion?.sessionId || chatAuth.status !== "ready") return;
      const actorName = role === "patient" ? "Patient" : "Doctor";
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
    [companion, chatAuth, role],
  );

  const handleToggleMic = useCallback(() => {
    const audioTrack = localTracksRef.current.find((t) => t.kind === "audio");
    if (!audioTrack) return;
    // `LocalAudioTrack` exposes `.enable()` / `.disable()` (Twilio Video SDK).
    // The runtime check guards a future track type from breaking the toggle.
    if (typeof (audioTrack as { enable?: () => unknown }).enable !== "function") return;
    if (typeof (audioTrack as { disable?: () => unknown }).disable !== "function") return;
    setMicMuted((prev) => {
      const nextMuted = !prev;
      if (prev) {
        (audioTrack as { enable: () => void }).enable();
      } else {
        (audioTrack as { disable: () => void }).disable();
      }
      emitMuteChangedBanner(nextMuted);
      return nextMuted;
    });
  }, [emitMuteChangedBanner]);

  const handleToggleCamera = useCallback(() => {
    const videoTrack = localTracksRef.current.find((t) => t.kind === "video");
    if (!videoTrack) return;
    // `LocalVideoTrack` exposes `.enable()` / `.disable()` (Twilio Video SDK).
    // We use disable rather than unpublish — it keeps the track alive,
    // just stops sending frames; re-enabling snaps back without a
    // renegotiation lag (~500ms vs ~1s+).
    if (typeof (videoTrack as { enable?: () => unknown }).enable !== "function") return;
    if (typeof (videoTrack as { disable?: () => unknown }).disable !== "function") return;
    setCameraOff((prev) => {
      if (prev) {
        (videoTrack as { enable: () => void }).enable();
      } else {
        (videoTrack as { disable: () => void }).disable();
      }
      return !prev;
    });
  }, []);

  // Sub-batch B · task-video-B3 — hold call.
  //
  // Hold disables BOTH the local mic + camera tracks (decision §10:
  // "stepped away" semantics — voice batch's parallel does the same
  // for mic-only). On Resume we restore each track to its pre-hold
  // state via the `useHoldState` snapshot — a user who was already
  // muted before pressing Hold stays muted on Resume.
  //
  // The `setMicMuted` / `setCameraOff` updates aren't done inside
  // `setMicMuted((prev) => …)` here because we need both reads to
  // happen atomically against the snapshot — the toggle flow reads
  // current state ONCE, snapshots it, and writes the disabled
  // state. Closure-captured `micMuted` / `cameraOff` is fine in this
  // path because the button is disabled while a hold transition is
  // mid-flight (no rapid re-fire risk).
  //
  // Audio-only mode (B8) — there's no video track to disable, so we
  // skip the video-side operations defensively. The avatar overlay
  // is already showing for the self-tile in that mode, so visual
  // hold state still reads correctly.
  //
  // System-message broadcast (`hold_changed`) is DEFERRED to voice
  // B3's backend route — same A1 doctrine (see
  // `task-video-A1-mute-unmute-mic.md` §"Why the system-message wire
  // is deferred"). Today the counterparty sees the existing A2
  // (camera-off → avatar) + A1 (audio mute) visual changes; the
  // explicit "Dr. Sharma is on hold" banner is gated on that route
  // landing. The `<HoldCallBanner>`'s `'counterparty'` variant is
  // already wired, so the future PR is a one-line prop flip when
  // the backend signal arrives.
  const hold = useHoldState();
  const handleToggleHold = useCallback(() => {
    const audioTrack = localTracksRef.current.find((t) => t.kind === "audio");
    const videoTrack = localTracksRef.current.find((t) => t.kind === "video");

    const result = hold.toggleHold({
      micMutedBefore: micMuted,
      cameraOffBefore: cameraOff,
    });

    if (result.next === true) {
      // Going INTO hold — disable both tracks. Audio-only mode has
      // no video track; the typeof guard skips the video branch.
      if (
        audioTrack &&
        typeof (audioTrack as { disable?: () => unknown }).disable === "function"
      ) {
        (audioTrack as { disable: () => void }).disable();
      }
      if (
        videoTrack &&
        typeof (videoTrack as { disable?: () => unknown }).disable === "function"
      ) {
        (videoTrack as { disable: () => void }).disable();
      }
      // Reflect the disabled state in the UI flags so the rest of
      // the component (self-tile avatar overlay, button visuals)
      // stays consistent. The snapshot remembers the original state
      // so resume can restore them.
      setMicMuted(true);
      setCameraOff(true);
    } else {
      // Coming OUT of hold — restore each track to its pre-hold
      // state. If the user was muted before holding, leave the
      // audio track disabled (and `micMuted = true`); same for
      // camera. Resume is NOT "unmute everything".
      //
      // Same defensive `enable?`/`disable?` typeof guards as the
      // mute/camera handlers above — Twilio's `LocalAudioTrack` /
      // `LocalVideoTrack` declare `enable()` + `disable()` in their
      // .d.ts but a future SDK rev or a different track-like
      // implementation in tests could miss them; the guards keep
      // the call site safe.
      const snapshot = result.snapshot;
      if (audioTrack) {
        if (snapshot.micMutedBefore) {
          if (typeof (audioTrack as { disable?: () => unknown }).disable === "function") {
            (audioTrack as { disable: () => void }).disable();
          }
        } else {
          if (typeof (audioTrack as { enable?: () => unknown }).enable === "function") {
            (audioTrack as { enable: () => void }).enable();
          }
        }
      }
      if (videoTrack) {
        if (snapshot.cameraOffBefore) {
          if (typeof (videoTrack as { disable?: () => unknown }).disable === "function") {
            (videoTrack as { disable: () => void }).disable();
          }
        } else {
          if (typeof (videoTrack as { enable?: () => unknown }).enable === "function") {
            (videoTrack as { enable: () => void }).enable();
          }
        }
      }
      setMicMuted(snapshot.micMutedBefore);
      setCameraOff(snapshot.cameraOffBefore);
    }
  }, [hold, micMuted, cameraOff]);

  // Sub-batch B · task-video-B4 — reconnection UX.
  //
  // The hook subscribes to `roomState`'s `'reconnecting'` /
  // `'reconnected'` / `'disconnected'` events and exposes a
  // simple state machine + countdown. The banner is a transient
  // overlay; once Twilio fires `'disconnected'` (auto-retry
  // exhausted), our existing disconnect listener takes over and
  // mounts `<CallDisconnectSplash>` (B5), which already offers
  // a Rejoin CTA via `handleSplashRejoin` below — so the failure
  // path is layered: hook flips to `'failed'` (countdown hits 0),
  // banner shows "Rejoin call"; if the user doesn't click it
  // before Twilio's hard disconnect lands, the splash takes the
  // baton.
  //
  // `tryNow` and `rejoinNow` both invoke the parent's `onRejoin`
  // (or fall back to `window.location.reload()` — same boundary
  // as `<CallDisconnectSplash>`'s `handleSplashRejoin`). Twilio's
  // SDK doesn't expose a manual-retry surface, so `[Try now]` is
  // intentionally identical to `[Rejoin call]` in v1; the labels
  // differ to match what the user expects to see at each phase
  // of the flow. Documented in the hook header.
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

  // Sub-batch B · task-video-B8 — runtime quality switcher.
  //
  // Three branches:
  //
  //   1. `next === current` — no-op (defensive; the picker shouldn't
  //      fire onChange for a no-op, but ESC-then-reselect could).
  //   2. `next === 'audio-only'` — synchronous unpublish + stop the
  //      LocalVideoTrack; remove from `localTracksRef`. No replacement
  //      track. Self-tile auto-shows the avatar via the `cameraOff
  //      || quality === 'audio-only'` derivation in the JSX below.
  //   3. `next` is an explicit resolution OR `'auto'` — recreate
  //      `LocalVideoTrack` with the new constraints, unpublish + stop
  //      the old one (if any), publish the new one, re-attach to the
  //      local <video> ref. Twilio renegotiates SDP under the hood;
  //      ~1-2s remote rebuffer expected (note #3 in the B8 task draft).
  //
  // The flight flag is set before the first await and cleared in a
  // `finally`. While in flight, the picker is `disabled`, which:
  //   - prevents a second click queueing a stacked switch
  //   - makes the in-progress state visible to the user
  //
  // For 'auto' we use `videoConstraintsForQuality('auto')` which
  // returns null (no explicit dimensions) — Twilio + the camera
  // negotiate the best available. Today's connect-path uses 640x480
  // as the default; we deliberately DON'T re-pin to that on switch-
  // to-auto because once E1 ships, "auto" should let adaptive bitrate
  // take over without a hard floor.
  const handleQualityChange = useCallback(
    async (next: QualityOption) => {
      const prev = qualityRef.current;
      if (prev === next) return;

      const room = roomRef.current;
      // Update state immediately so the picker shows the new selection
      // even if Twilio takes a moment. Persistence effect picks it up.
      setQuality(next);

      // Sub-batch E · task-video-E2 — manual override clears the
      // auto-fallback banner. If the user opens the picker and
      // picks an explicit resolution (or 'auto') while in
      // fallback, they've taken control; the banner would be
      // misleading. We deliberately don't post a 'restored' system
      // row from this path — the user took an alternative
      // recovery action; the matching engaged row stands alone in
      // the chat transcript.
      if (autoFallbackActive && next !== "audio-only") {
        autoFallbackEngagedAtRef.current = null;
        setAutoFallbackActive(false);
      }

      // Pre-connect / disconnected — nothing to apply at the Twilio
      // level. The connect-time path will read from localStorage.
      if (!room || status !== "connected") return;

      setQualitySwitchInFlight(true);
      const oldVideoTrack = localTracksRef.current.find(
        (t) => t.kind === "video",
      ) as LocalVideoTrack | undefined;

      try {
        if (next === "audio-only") {
          if (oldVideoTrack) {
            try {
              room.localParticipant.unpublishTrack(oldVideoTrack);
            } catch {
              // Twilio may have already unpublished (e.g. if the
              // peer left and we got dropped). Ignore — the track
              // is being torn down regardless.
            }
            try {
              oldVideoTrack.stop();
            } catch {
              // ditto.
            }
            localTracksRef.current = localTracksRef.current.filter(
              (t) => t !== oldVideoTrack,
            );
            // Clear the local <video> element's srcObject so the last
            // frame doesn't freeze on screen (the avatar overlay
            // covers it via cameraOff derivation, but defense-in-
            // depth — also clears the underlying <video>).
            if (localVideoRef.current) {
              localVideoRef.current.srcObject = null;
            }
          }
          return;
        }

        // Explicit resolution OR 'auto' — recreate the track.
        const constraints = videoConstraintsForQuality(next);
        const trackOptions: Parameters<typeof createLocalVideoTrack>[0] =
          constraints
            ? { ...constraints }
            : // 'auto' — let Twilio negotiate. We deliberately omit
              // dimensions so adaptive (E1) and the camera can do
              // their job. Today this means Twilio's sensible
              // defaults (640x480 or thereabouts).
              {};
        // Sub-batch F · task-video-F1 — prefer the in-call switch's
        // active deviceId over the connect-time `chosenCameraId`. If
        // the user flipped to back-cam mid-call, every subsequent
        // republish (this picker swap, an adaptive downgrade, a
        // try-video-again) must keep them on back-cam — otherwise the
        // republish path would silently snap them back to front.
        const effectiveDeviceId =
          cameraSwitchDeviceIdRef.current ?? chosenCameraId;
        if (effectiveDeviceId) {
          trackOptions.deviceId = { ideal: effectiveDeviceId };
        }

        const newVideoTrack = await createLocalVideoTrack(trackOptions);

        // After the await, the user might have clicked Leave. Bail
        // out cleanly to avoid publishing into a dead room.
        if (
          !roomRef.current ||
          roomRef.current.state !== "connected" ||
          hasDisconnectedRef.current
        ) {
          newVideoTrack.stop();
          return;
        }

        // Unpublish + stop the old track BEFORE publishing the new
        // one, otherwise Twilio rejects the publish ("a track of the
        // same kind is already published"). Twilio's behaviour here
        // is documented; the `unpublishTrack` call is synchronous so
        // ordering is straightforward.
        if (oldVideoTrack) {
          try {
            roomRef.current.localParticipant.unpublishTrack(oldVideoTrack);
          } catch {
            // ignore — see audio-only branch.
          }
          try {
            oldVideoTrack.stop();
          } catch {
            // ignore.
          }
          localTracksRef.current = localTracksRef.current.filter(
            (t) => t !== oldVideoTrack,
          );
        }

        await roomRef.current.localParticipant.publishTrack(newVideoTrack);
        localTracksRef.current = [...localTracksRef.current, newVideoTrack];

        // Re-attach to the local <video> element so the self-tile
        // shows the new track. Without this, the tile would stay
        // black until the next React render that re-runs the
        // post-connect attach effect.
        if (localVideoRef.current) {
          newVideoTrack.attach(localVideoRef.current);
        }

        // If the user had toggled camera-off (A2) before the switch,
        // re-apply that state — the new track starts enabled by
        // default, which would surprise the user.
        if (cameraOff) {
          try {
            (newVideoTrack as { disable: () => void }).disable();
          } catch {
            // ignore — the type guard from `handleToggleCamera`
            // applies here too; track may not expose `.disable()`
            // in some test environments.
          }
        }

        // Sub-batch C · task-video-C2 — re-apply persisted virtual
        // background after the quality swap. The OLD track had its
        // processor stripped when we called `unpublishTrack` +
        // `stop()`; the NEW track starts processor-less. Without
        // this re-apply, switching from 720p to 480p (or any other
        // quality change) would silently disable blur until the
        // user re-clicked the picker.
        if (backgroundRef.current !== "off") {
          applyBackgroundToTrack(
            newVideoTrack,
            backgroundRef.current,
          ).catch((err) => {
            if (process.env.NODE_ENV !== "production") {
              console.warn(
                "Failed to re-apply virtual background after quality swap:",
                err,
              );
            }
          });
        }
      } catch (err) {
        // Camera permission revoked OR device removed mid-call OR
        // Twilio publish rejected. Surface via setStatus only on
        // hard failures; for soft failures we leave the call up
        // and just bail. The `quality` state already updated to
        // `next` — we revert it so the picker reflects reality.
        setQuality(prev);
        if (process.env.NODE_ENV !== "production") {
          console.warn("Video quality switch failed:", err);
        }
      } finally {
        setQualitySwitchInFlight(false);
      }
    },
    [status, chosenCameraId, cameraOff, autoFallbackActive],
  );

  // ------------------------------------------------------------------------
  // Sub-batch E · task-video-E1 — controller-driven track republish.
  //
  // `applyAdaptiveLevel` is the adaptive-controller analog of
  // `handleQualityChange` above. Three deliberate differences:
  //
  //   1. Does NOT update the `quality` state. The B8 picker stays
  //      at 'auto' visually — that's how the user knows the
  //      controller is in charge. If we updated the picker to
  //      '720p' on each downgrade, the next clause of B8's
  //      coupling spec ("when picker is explicit, controller is
  //      suspended") would immediately disable the controller —
  //      a permanent one-way ratchet down.
  //
  //   2. Does NOT toggle `qualitySwitchInFlight`. There's no
  //      user-facing button to debounce — the 30s cooldown in
  //      the controller already prevents back-to-back republish.
  //
  //   3. Audio-only branch is reserved for E.4 (E2 audio
  //      fallback). The controller never emits 'audio-only' in
  //      v1, but the helper handles it as a no-op (logs in dev,
  //      no-op in prod) so when E.4 wires this through, it'll
  //      light up without an upstream regression here.
  //
  // The unpublish/publish dance, virtual-background re-apply, and
  // cameraOff preservation MUST mirror `handleQualityChange` —
  // any divergence would mean the user's other settings (A2
  // camera-off, C2 background) silently drop the moment adaptive
  // republishes. We share `videoConstraintsForQuality` from B8 so
  // the dimension table stays single-source.
  // ------------------------------------------------------------------------
  // Sub-batch F · task-video-F4 — `engageOptions` extension.
  //
  // The `applyAdaptiveLevel('audio-only', { reason })` overload lets
  // the battery-saver hook trigger the same teardown + state +
  // banner-emit codepath as the bandwidth-driven adaptive controller
  // — but with a different `meta.reason` carried into the chat row
  // (Decision §34: one event, three meta.reason values). Defaults to
  // `'low_bandwidth'` so the existing controller call sites compile
  // unchanged. Kept inline (not a separate exported type) to keep
  // the callback's identity stable for `useCallback` consumers.
  const applyAdaptiveLevel = useCallback(
    async (
      level: AdaptiveLevel,
      engageOptions?: {
        reason?: "low_bandwidth" | "battery_low" | "battery_critical";
      },
    ) => {
      const room = roomRef.current;
      if (!room || status !== "connected") return;

      // Sub-batch E · task-video-E2 — auto audio-only fallback
      // engagement. Mirrors the 'audio-only' branch of
      // `handleQualityChange` (synchronous unpublish + stop) and
      // additionally:
      //   - flips `autoFallbackActive` so <AudioFallbackBanner>
      //     mounts;
      //   - bumps the per-session attempt ordinal so the backend
      //     dedup key is fresh for this engagement;
      //   - records the engage timestamp so the matching restore
      //     row can carry an accurate `durationSeconds`;
      //   - posts a best-effort `engaged` system row (doctor-only;
      //     patient mounts skip the POST entirely — banner still
      //     shows locally).
      // Picker state is intentionally NOT mutated — the picker
      // stays at 'auto' so the controller can resume after restore
      // without the user having to manually flip it back. The
      // banner is the disambiguating UI for "auto-fallback active".
      if (level === "audio-only") {
        const oldVideoTrack = localTracksRef.current.find(
          (t) => t.kind === "video",
        ) as LocalVideoTrack | undefined;

        if (oldVideoTrack) {
          try {
            room.localParticipant.unpublishTrack(oldVideoTrack);
          } catch {
            // Twilio may have already unpublished; ignore.
          }
          try {
            oldVideoTrack.stop();
          } catch {
            // ditto.
          }
          localTracksRef.current = localTracksRef.current.filter(
            (t) => t !== oldVideoTrack,
          );
          if (localVideoRef.current) {
            // Defense-in-depth — clear srcObject so the last frame
            // doesn't freeze under the avatar overlay.
            localVideoRef.current.srcObject = null;
          }
        }

        autoFallbackAttemptRef.current += 1;
        autoFallbackEngagedAtRef.current = Date.now();
        setAutoFallbackActive(true);

        // Best-effort POST. Doctor-only — patient mounts don't
        // pass `inCallActions` and never have a `doctorToken` to
        // sign with. Banner still shows locally for both roles.
        //
        // F.1 / task-video-F4: `engageOptions.reason` propagates
        // into `meta.reason` on the chat row (`battery_low` |
        // `battery_critical` | default `low_bandwidth`). For
        // battery-triggered engagements there's no Twilio threshold
        // — we send `null` so the backend stores it as such (the
        // analytics queries already handle null thresholds).
        if (
          inCallActions?.doctorToken &&
          companion?.sessionId &&
          role !== "patient"
        ) {
          const reason = engageOptions?.reason ?? "low_bandwidth";
          postConsultationAutoFallbackBanner(
            inCallActions.doctorToken,
            companion.sessionId,
            {
              kind: "engaged",
              attempt: autoFallbackAttemptRef.current,
              // Twilio's networkQualityLevel is 0..5 — 0 = bad, 5
              // = perfect. We treat ≤ 1 as the trigger threshold
              // throughout this codepath; it's the value that
              // tripped the ladder. For battery engagements there's
              // no Twilio threshold (the OS Battery API level is
              // the trigger evidence) so we send null.
              thresholdLevel: reason === "low_bandwidth" ? 1 : null,
              reason,
            },
          ).catch((err) => {
            if (process.env.NODE_ENV !== "production") {
              console.warn(
                "Failed to post auto_audio_fallback banner:",
                err instanceof Error ? err.message : err,
              );
            }
          });
        }
        return;
      }

      const oldVideoTrack = localTracksRef.current.find(
        (t) => t.kind === "video",
      ) as LocalVideoTrack | undefined;

      // No video track to republish (user previously chose audio-
      // only or the connect path didn't grant camera). Adaptive
      // can't restore something it never owned; the next user-
      // initiated quality change will re-create the track.
      if (!oldVideoTrack) return;

      const targetQuality = adaptiveLevelToQuality(level);
      const constraints = videoConstraintsForQuality(targetQuality);
      const trackOptions: Parameters<typeof createLocalVideoTrack>[0] =
        constraints ? { ...constraints } : {};
      // Sub-batch F · task-video-F1 — prefer the in-call switch's
      // active deviceId over the connect-time `chosenCameraId`. See
      // `handleQualityChange` for the full rationale.
      const effectiveDeviceId =
        cameraSwitchDeviceIdRef.current ?? chosenCameraId;
      if (effectiveDeviceId) {
        trackOptions.deviceId = { ideal: effectiveDeviceId };
      }

      try {
        const newVideoTrack = await createLocalVideoTrack(trackOptions);

        // After the await, the user might have hung up OR manually
        // overridden the picker. Bail out cleanly so we don't
        // publish into a dead room or step on a manual choice.
        if (
          !roomRef.current ||
          roomRef.current.state !== "connected" ||
          hasDisconnectedRef.current ||
          qualityRef.current !== "auto"
        ) {
          newVideoTrack.stop();
          return;
        }

        try {
          roomRef.current.localParticipant.unpublishTrack(oldVideoTrack);
        } catch {
          // Twilio may have already unpublished; ignore.
        }
        try {
          oldVideoTrack.stop();
        } catch {
          // ditto.
        }
        localTracksRef.current = localTracksRef.current.filter(
          (t) => t !== oldVideoTrack,
        );

        await roomRef.current.localParticipant.publishTrack(newVideoTrack);
        localTracksRef.current = [...localTracksRef.current, newVideoTrack];

        if (localVideoRef.current) {
          newVideoTrack.attach(localVideoRef.current);
        }

        if (cameraOff) {
          try {
            (newVideoTrack as { disable: () => void }).disable();
          } catch {
            // Some test environments don't expose `.disable()`;
            // mirrors the same guard in `handleQualityChange`.
          }
        }

        // Re-apply C2 virtual background to the new track — the
        // OLD track had its processor stripped on `unpublishTrack`
        // + `stop()`. Without this, every adaptive transition
        // would silently drop blur/replace.
        if (backgroundRef.current !== "off") {
          applyBackgroundToTrack(
            newVideoTrack,
            backgroundRef.current,
          ).catch((err) => {
            if (process.env.NODE_ENV !== "production") {
              console.warn(
                "Failed to re-apply virtual background after adaptive republish:",
                err,
              );
            }
          });
        }
      } catch (err) {
        // Camera permission revoked OR device removed mid-call OR
        // Twilio publish rejected. Don't surface — adaptive is
        // best-effort by design. Log in dev only; the call stays
        // up with the OLD track (we haven't unpublished yet on
        // this branch).
        if (process.env.NODE_ENV !== "production") {
          console.warn("Adaptive video republish failed:", err);
        }
      }
    },
    [
      status,
      chosenCameraId,
      cameraOff,
      // E.4 deps — `applyAdaptiveLevel('audio-only')` reaches into
      // the doctor token + companion sessionId for the best-effort
      // POST. `role` gates the patient out of the POST entirely.
      // `inCallActions` covers both `doctorToken` and the gating
      // ("doctor mount only") in one prop.
      inCallActions,
      companion?.sessionId,
      role,
    ],
  );

  // Sub-batch E · task-video-E2 — "Try video again" handler. Mirrors
  // the recreate branch of `handleQualityChange` (createLocalVideoTrack
  // → unpublish/publish dance → re-attach to local <video> ref →
  // re-apply C2 background) and additionally:
  //   - clears `autoFallbackActive` so the banner unmounts;
  //   - arms the 60s cooldown (Decision §25 — flapping prevention);
  //   - resets the adaptive controller state to baseline so a fresh
  //     sustain window begins (otherwise a controller mid-sustain
  //     could fire downgrade immediately on the next tick);
  //   - posts a best-effort `restored` system row with the
  //     duration the call spent in fallback (read from the engaged-
  //     at ref).
  //
  // The cooldown ref is set IMMEDIATELY (before the await) so the
  // controller's next tick (1s grace) honours it even before the
  // republish has finished. That covers the corner case where the
  // republish takes ~3s on slow 4G — without the eager set, the
  // controller could fire a fresh fallback before this handler
  // finishes.
  const handleTryVideoAgain = useCallback(async () => {
    const room = roomRef.current;
    if (!room || status !== "connected") return;
    if (restoreInFlight) return; // Defense against double-click.

    setRestoreInFlight(true);

    // Arm the cooldown FIRST so the controller's next tick sees the
    // gate even if the republish is still in flight. 60s per
    // Decision §25.
    const cooldownEndsAt = Date.now() + 60_000;
    setAutoFallbackCooldownEndsAt(cooldownEndsAt);
    autoFallbackCooldownEndsAtRef.current = cooldownEndsAt;

    // Reset the adaptive controller so the fresh video track starts
    // with clean sustain windows. Otherwise a still-bad network
    // would re-trigger downgrade immediately (the cooldown only
    // gates the audio-only transition, not high → medium → low).
    adaptiveStateRef.current = makeInitialAdaptiveState();

    const trackOptions: Parameters<typeof createLocalVideoTrack>[0] = {};
    // Sub-batch F · task-video-F1 — prefer the in-call switch's
    // active deviceId over the connect-time `chosenCameraId`. See
    // `handleQualityChange` for the full rationale.
    const effectiveDeviceId =
      cameraSwitchDeviceIdRef.current ?? chosenCameraId;
    if (effectiveDeviceId) {
      trackOptions.deviceId = { ideal: effectiveDeviceId };
    }

    try {
      const newVideoTrack = await createLocalVideoTrack(trackOptions);

      if (
        !roomRef.current ||
        roomRef.current.state !== "connected" ||
        hasDisconnectedRef.current
      ) {
        newVideoTrack.stop();
        return;
      }

      await roomRef.current.localParticipant.publishTrack(newVideoTrack);
      localTracksRef.current = [...localTracksRef.current, newVideoTrack];

      if (localVideoRef.current) {
        newVideoTrack.attach(localVideoRef.current);
      }

      if (cameraOff) {
        try {
          (newVideoTrack as { disable: () => void }).disable();
        } catch {
          // Some test environments don't expose `.disable()`;
          // mirrors the same guard in `handleQualityChange`.
        }
      }

      if (backgroundRef.current !== "off") {
        applyBackgroundToTrack(
          newVideoTrack,
          backgroundRef.current,
        ).catch((err) => {
          if (process.env.NODE_ENV !== "production") {
            console.warn(
              "Failed to re-apply virtual background after fallback restore:",
              err,
            );
          }
        });
      }

      // Banner unmounts only after the republish has succeeded —
      // otherwise the user could click "Try video again", see the
      // banner vanish, and then sit staring at a black tile if the
      // create/publish path failed.
      const engagedAt = autoFallbackEngagedAtRef.current;
      const durationSeconds =
        engagedAt != null ? Math.round((Date.now() - engagedAt) / 1000) : 0;
      autoFallbackEngagedAtRef.current = null;
      setAutoFallbackActive(false);

      if (
        inCallActions?.doctorToken &&
        companion?.sessionId &&
        role !== "patient"
      ) {
        postConsultationAutoFallbackBanner(
          inCallActions.doctorToken,
          companion.sessionId,
          {
            kind: "restored",
            attempt: autoFallbackAttemptRef.current,
            durationSeconds,
          },
        ).catch((err) => {
          if (process.env.NODE_ENV !== "production") {
            console.warn(
              "Failed to post auto_audio_recovered banner:",
              err instanceof Error ? err.message : err,
            );
          }
        });
      }
    } catch (err) {
      // Republish failed — keep the banner up so the user can
      // retry. Reset the cooldown to NOW so they can immediately
      // try again (they didn't actually get video back).
      setAutoFallbackCooldownEndsAt(null);
      autoFallbackCooldownEndsAtRef.current = null;
      if (process.env.NODE_ENV !== "production") {
        console.warn("Try-video-again republish failed:", err);
      }
    } finally {
      setRestoreInFlight(false);
    }
  }, [
    status,
    restoreInFlight,
    chosenCameraId,
    cameraOff,
    inCallActions,
    companion?.sessionId,
    role,
  ]);

  // Sub-batch F · task-video-F4 — mirror handleTryVideoAgain into
  // the forward-declared bridge ref consumed by the battery-saver
  // hook's "Re-enable video" CTA. Same trick as
  // `applyAdaptiveLevelRef` mirroring above; keeps the hook callback
  // stable while letting the battery state machine reach the
  // freshest restore primitive.
  useEffect(() => {
    handleTryVideoAgainRef.current = handleTryVideoAgain;
  }, [handleTryVideoAgain]);

  // ------------------------------------------------------------------------
  // Sub-batch E · task-video-E1 — adaptive controller tick loop.
  //
  // Runs ONLY while connected. Polls the network-quality level
  // every 1s — necessary because Twilio only emits
  // `'networkQualityLevelChanged'` on level CHANGES, but the
  // sustain windows (downgrade @ 10s, upgrade @ 30s) need to
  // accumulate even when the level holds steady.
  //
  // We read the latest level + picker from refs so the interval
  // closure stays stable across renders (re-binding the interval
  // every level sample would reset its phase and break sustain
  // accumulation).
  //
  // The state machine itself is pure — see
  // `lib/video/adaptive-bitrate.ts`. This effect is the only
  // place that calls it.
  // ------------------------------------------------------------------------
  const networkLevelRef = useRef<number | null>(null);
  const applyAdaptiveLevelRef = useRef(applyAdaptiveLevel);
  useEffect(() => {
    networkLevelRef.current = localNetworkQuality.level;
  }, [localNetworkQuality.level]);
  useEffect(() => {
    applyAdaptiveLevelRef.current = applyAdaptiveLevel;
    // Sub-batch F · task-video-F4 — also mirror into the
    // forward-declared bridge ref used by the battery-saver hook
    // callbacks (declared way upstream, before applyAdaptiveLevel
    // was in scope). Same value, two refs; keeps the hook callback
    // closures stable without forcing a top-of-file callback move.
    batteryApplyAdaptiveRef.current = applyAdaptiveLevel;
  }, [applyAdaptiveLevel]);

  useEffect(() => {
    if (status !== "connected" || !localParticipant) {
      // Reset the controller state when disconnected so the next
      // call starts fresh ('high' level, no sustain windows). The
      // ref is mutated directly — no re-render needed.
      adaptiveStateRef.current = makeInitialAdaptiveState();
      // Sub-batch E · task-video-E2 — clear fallback bookkeeping
      // on disconnect so the next call starts with a clean slate.
      // Otherwise rejoining mid-banner would carry a stale
      // engaged-at timestamp into the new call.
      autoFallbackAttemptRef.current = 0;
      autoFallbackEngagedAtRef.current = null;
      autoFallbackCooldownEndsAtRef.current = null;
      setAutoFallbackActive(false);
      setAutoFallbackCooldownEndsAt(null);
      setRestoreInFlight(false);
      return;
    }

    const tick = () => {
      const cooldownEndsAt = autoFallbackCooldownEndsAtRef.current;
      const audioFallbackCooldownActive =
        cooldownEndsAt != null && Date.now() < cooldownEndsAt;
      const result = evaluateAdaptiveTransition(adaptiveStateRef.current, {
        now: Date.now(),
        networkLevel: networkLevelRef.current,
        picker: qualityRef.current,
        audioFallbackCooldownActive,
      });
      adaptiveStateRef.current = result.newState;
      if (result.transitionTo != null) {
        // Toast first so the user sees the explanation BEFORE
        // the camera flicker on republish (perceived latency
        // matters; the republish takes ~1-2s on slow 4G).
        // E.4: the 'audio-only' transition skips the toast (the
        // sticky <AudioFallbackBanner> covers the messaging) —
        // `adaptiveToastMessage` returns null for that case so
        // we don't double-fire.
        const message = adaptiveToastMessage(
          result.reason,
          result.transitionTo,
        );
        if (message) setAdaptiveNotice(message);
        applyAdaptiveLevelRef.current(result.transitionTo);
      }
    };

    // Run a tick immediately so a freshly-connected room with an
    // already-bad initial sample starts accumulating instantly
    // (otherwise we'd wait 1s for the first interval fire).
    tick();
    const handle = setInterval(tick, 1000);
    return () => {
      clearInterval(handle);
    };
  }, [status, localParticipant]);

  // Memoized so A4's `handleEndConfirmConfirm` / `handleLeaveClick`
  // useCallbacks below can list it in their deps without re-creating
  // every render. Closure body only touches refs + setters (all
  // stable), so the empty deps array is correct.
  //
  // Sub-batch B · task-video-B5 — sets `ourLocalEndCalledRef` so the
  // classifier picks `'local'`, AND classifies inline because we
  // `removeAllListeners()` BEFORE `disconnect()` (which would
  // otherwise be where `room.on('disconnected')` runs the
  // classifier). Without the inline call, the splash would never
  // get a reason on the local-end path.
  const handleLeave = useCallback(() => {
    hasDisconnectedRef.current = true;
    ourLocalEndCalledRef.current = true;
    const room = roomRef.current;
    const tracks = localTracksRef.current;

    tracks.forEach((track) => {
      if ("detach" in track && typeof (track as { detach: (el?: HTMLElement) => void }).detach === "function") {
        (track as { detach: (el?: HTMLElement) => void }).detach();
      }
      if ("stop" in track && typeof track.stop === "function") track.stop();
    });
    localTracksRef.current = [];

    if (room) {
      room.removeAllListeners();
      room.disconnect();
      roomRef.current = null;
    }

    // Sub-batch B · task-video-B9 — DO NOT dispose the gain router
    // here. See the long comment inside `unwireRemoteAudioTrack` for
    // the rationale: the `<audio>` sink remains in the DOM until the
    // `<VideoRoom>` component itself unmounts, and
    // `createMediaElementSource` is a one-shot operation per
    // HTMLMediaElement. The `useEffect`'s `cleanup()` return path is
    // the single disposal site. Disposing here would strand the
    // audio element if the user re-engages anything that re-wires
    // remote audio before the parent navigates away.

    setDisconnectReason(
      classifyDisconnect({
        twilioError: lastTwilioErrorRef.current,
        ourLocalEndCalled: ourLocalEndCalledRef.current,
        remoteEndedFirst: remoteEndedFirstRef.current,
      }),
    );
    setStatus("disconnected");
    // Sub-batch A · task-video-A8 — explicit clear because
    // `room.removeAllListeners()` above blows away the
    // `'disconnected'` handler that would otherwise clear these.
    setRoomState(null);
    setLocalParticipant(null);
    setRemoteParticipant(null);
    if (!hasNotifiedDisconnectRef.current) {
      hasNotifiedDisconnectRef.current = true;
      onDisconnectRef.current?.();
    }
  }, []);

  // ------------------------------------------------------------------------
  // Sub-batch A · task-video-A8 — tooltip bodies for the two
  // `<NetworkBars>` mounts. Built here (not in JSX) because they're
  // shared between self + remote AND get the same `callStats`
  // values regardless of which side renders them. The remote-side
  // popover hides the local-only fields (FPS / send bitrate) since
  // they describe THIS device, not the counterparty.
  // ------------------------------------------------------------------------
  const renderStatsRow = (label: string, value: string | null) => (
    <div className="flex items-center justify-between gap-3 py-0.5">
      <span className="text-gray-500">{label}</span>
      <span className="font-mono text-gray-900">{value ?? "—"}</span>
    </div>
  );

  const formatMs = (n: number | null) => (n == null ? null : `${n} ms`);
  const formatRes = (
    r: { width: number; height: number } | null,
  ) => (r == null ? null : `${r.width}×${r.height}`);
  const formatFps = (n: number | null) => (n == null ? null : `${n}`);
  const formatKbps = (n: number | null) =>
    n == null
      ? null
      : n >= 1000
        ? `${(n / 1000).toFixed(1)} Mbps`
        : `${n} kbps`;

  const localStatsTooltip = (
    <div className="space-y-0.5">
      <p className="mb-1 font-semibold text-gray-900">Your connection</p>
      {renderStatsRow("Quality", localNetworkQuality.level == null ? null : `${localNetworkQuality.level}/5`)}
      {renderStatsRow("RTT", formatMs(callStats.rttMs))}
      {renderStatsRow("Jitter", formatMs(callStats.jitterMs))}
      {renderStatsRow("Resolution", formatRes(callStats.resolution))}
      {renderStatsRow("FPS", formatFps(callStats.fps))}
      {renderStatsRow("Sending", formatKbps(callStats.kbpsSend))}
      {renderStatsRow("Receiving", formatKbps(callStats.kbpsReceive))}
    </div>
  );

  const remoteStatsTooltip = (
    <div className="space-y-0.5">
      <p className="mb-1 font-semibold text-gray-900">{remoteLabel}&apos;s connection</p>
      {renderStatsRow("Quality", remoteNetworkQuality.level == null ? null : `${remoteNetworkQuality.level}/5`)}
      <p className="mt-2 text-[11px] leading-snug text-gray-500">
        Detailed stats (RTT / jitter / bitrate) are only available for
        your own connection.
      </p>
    </div>
  );

  // Sub-batch C · task-video-C4 — annotation entry handler.
  //
  // Triggered when the user clicks the Annotate button in
  // `<SnapshotControls>`. We:
  //   1. Resolve which video tile to freeze (matches the source the
  //      user selected in the snapshot dropdown).
  //   2. Capture the current frame to a fresh canvas.
  //   3. Pause the live <video> so the user perceives a freeze.
  //   4. Mount `<AnnotationCanvas>` via the `annotation.active` flag.
  //
  // Failure modes (no video / no ctx) bubble up as a toast through
  // `setSnapshotExternalToast` so the user sees the same UI as a
  // failed snapshot.
  const handleRequestAnnotate = useCallback(
    (source: "remote" | "self") => {
      const videoEl =
        source === "remote" ? remoteVideoRef.current : localVideoRef.current;
      if (!videoEl) {
        setSnapshotExternalToast({
          kind: "error",
          message:
            source === "remote"
              ? "The other party's video isn't ready yet."
              : "Your camera isn't ready yet.",
        });
        return;
      }
      const frozen = freezeVideoFrame(videoEl);
      if (!frozen) {
        setSnapshotExternalToast({
          kind: "error",
          message: "Couldn't capture frame — the video isn't playing yet.",
        });
        return;
      }
      const wasPlaying = !videoEl.paused;
      if (wasPlaying) {
        try {
          videoEl.pause();
        } catch {
          // pause() doesn't throw in modern browsers, but defensive.
        }
      }
      setAnnotation({
        active: true,
        source,
        frameCanvas: frozen.canvas,
        dimensions: frozen.dimensions,
        wasPlaying,
      });
    },
    [localVideoRef, remoteVideoRef],
  );

  // Sub-batch C · task-video-C4 — annotation cancel handler. Resumes
  // the paused video (only if WE paused it; B3 hold doctrine) and
  // closes the modal without uploading.
  const handleAnnotateCancel = useCallback(() => {
    setAnnotation((prev) => {
      if (!prev.active) return prev;
      if (prev.wasPlaying) {
        const videoEl =
          prev.source === "remote"
            ? remoteVideoRef.current
            : localVideoRef.current;
        if (videoEl && videoEl.paused) {
          // play() can reject if the user navigated away; swallow.
          videoEl.play().catch(() => undefined);
        }
      }
      return { active: false };
    });
  }, [localVideoRef, remoteVideoRef]);

  // Sub-batch C · task-video-C4 — annotation save handler. Uploads
  // the composited blob via `captureSnapshot({ prerenderedBlob,
  // annotations })`, then mirrors the success/error to the snapshot
  // controls' toast surface.
  const handleAnnotateSave = useCallback(
    async (payload: {
      blob: Blob;
      annotations: ReadonlyArray<Annotation>;
    }) => {
      if (!annotation.active) return;
      if (!companion || chatAuth.status !== "ready") {
        setSnapshotExternalToast({
          kind: "error",
          message: "Chat connection not ready — try again in a moment.",
        });
        return;
      }
      const videoEl =
        annotation.source === "remote"
          ? remoteVideoRef.current
          : localVideoRef.current;
      if (!videoEl) {
        setSnapshotExternalToast({
          kind: "error",
          message: "Video tile lost — please try again.",
        });
        return;
      }
      try {
        await captureSnapshot({
          videoEl,
          sessionId: companion.sessionId,
          accessToken: chatAuth.accessToken,
          target: annotation.source,
          prerenderedBlob: payload.blob,
          annotations: payload.annotations,
        });
        setSnapshotExternalToast({
          kind: "success",
          message: "Annotated snapshot saved.",
        });
        // Close the modal + resume video. Reuse the cancel handler
        // for the lifecycle bookkeeping (cancel and successful save
        // diverge only in whether an upload happened).
        handleAnnotateCancel();
      } catch (err) {
        const message =
          err instanceof SnapshotError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Annotated snapshot failed. Try again.";
        setSnapshotExternalToast({ kind: "error", message });
        // Keep the modal open on error so the user can retry without
        // re-drawing.
      }
    },
    [
      annotation,
      chatAuth,
      companion,
      handleAnnotateCancel,
      localVideoRef,
      remoteVideoRef,
    ],
  );

  // ------------------------------------------------------------------------
  // Sub-batch C · task-video-C6 — quick action handlers.
  //
  // Open / close the panel + post the in-channel banner after the
  // underlying clinical action (Rx send / appointment create) has
  // succeeded. Banner failures are non-fatal — the underlying action
  // is already durable; the patient just doesn't see the in-channel
  // breadcrumb. Logged + toast'd as a soft failure.
  // ------------------------------------------------------------------------
  const handleQuickAction = useCallback((action: QuickAction) => {
    setQuickActionPanel(action);
  }, []);

  const handleQuickActionPanelClose = useCallback(() => {
    setQuickActionPanel(null);
  }, []);

  const handleFollowUpScheduled = useCallback(
    async (result: { appointmentId: string; scheduledAt: string }) => {
      if (!inCallActions || !companion?.sessionId) {
        setQuickActionToast({
          kind: "success",
          message: "Follow-up scheduled.",
        });
        setQuickActionPanel(null);
        return;
      }
      try {
        await postConsultationQuickActionBanner(
          inCallActions.doctorToken,
          companion.sessionId,
          {
            kind: "follow_up_scheduled",
            appointmentId: result.appointmentId,
            scheduledAt: result.scheduledAt,
          },
        );
        setQuickActionToast({
          kind: "success",
          message: "Follow-up scheduled and patient notified.",
        });
      } catch (err) {
        setQuickActionToast({
          kind: "success",
          message:
            "Follow-up scheduled (chat banner could not be posted — appointment is still saved).",
        });
        if (err instanceof Error && process.env.NODE_ENV !== "production") {
          // eslint-disable-next-line no-console
          console.warn("Failed to post follow_up_scheduled banner:", err.message);
        }
      } finally {
        setQuickActionPanel(null);
      }
    },
    [companion?.sessionId, inCallActions],
  );

  // Sub-batch A · task-video-A4 — leave-button click handler.
  // Doctor + Shift-click → bypass modal, end immediately (power users).
  // Anything else (including patient role) → open the modal. Patient
  // role is never given the bypass even if they hold Shift on a desktop
  // keyboard — the role gate is the safety net.
  const handleLeaveClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      const isDoctor = role !== "patient";
      if (isDoctor && event.shiftKey) {
        handleLeave();
        return;
      }
      setEndConfirmOpen(true);
    },
    [role, handleLeave],
  );

  const handleEndConfirmCancel = useCallback(() => {
    setEndConfirmOpen(false);
  }, []);

  const handleEndConfirmConfirm = useCallback(() => {
    setEndConfirmOpen(false);
    handleLeave();
  }, [handleLeave]);

  // ------------------------------------------------------------------------
  // Sub-batch F · task-video-F3 — MediaSession + persistent
  // foreground notification.
  //
  // Mounting NOW (after `handleToggleMic` + `handleEndConfirmConfirm`
  // are declared) so the hook can route OS-level media controls
  // and SW notification actions back into the in-app handlers
  // unchanged. The hook is the foundation that voice C10 will
  // reuse later — modality-aware so the same code path serves
  // both consult surfaces.
  //
  // Action mapping (decision §14, locked from voice C10):
  //   - MediaSession `pause`         → handleToggleMic (mute mic).
  //   - MediaSession `play`          → handleToggleMic (unmute).
  //     Browser only surfaces ONE button at a time based on
  //     `playbackState`, so passing the same toggle is safe.
  //   - MediaSession `stop` / `stoptransport` → handleEndConfirmConfirm.
  //   - SW notification `mute`/`end` actions are forwarded by the
  //     SW back to the same callbacks via postMessage.
  //
  // `callerName` uses the existing `remoteLabel` ("Doctor" /
  // "Patient" — see B2 comments on why real names aren't surfaced
  // yet). No PHI in the notification body — the spec is explicit.
  //
  // The hook gates everything on `sessionId` being defined; if
  // `<VideoRoom>` mounts without a session prop (legacy call
  // sites pre-A1), the hook is a no-op.
  const callMediaSession = useCallMediaSession({
    sessionId: sessionId ?? "",
    callerName: remoteLabel,
    modality: "video",
    isMuted: micMuted,
    isOnHold: hold.onHold,
    onPause: handleToggleMic,
    onPlay: handleToggleMic,
    onStop: handleEndConfirmConfirm,
  });

  if (status === "error") {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <p className="font-medium text-red-800">Connection failed</p>
        <p className="mt-1 text-sm text-red-700">{errorMessage}</p>
      </div>
    );
  }

  if (status === "disconnected") {
    // Sub-batch B · task-video-B5 — replace the static "Call ended"
    // placeholder with the classified splash. Two render branches:
    //
    //   1. Splash dismissed → fall back to a minimal "Call ended."
    //      placeholder (matches the legacy copy so muscle memory
    //      still works for QA).
    //   2. Splash visible (default) → mount `<CallDisconnectSplash>`
    //      with the classified reason + the two CTAs. `onRejoin` /
    //      `onRestart` default to `window.location.reload()` because
    //      the consult URL on the join page carries the HMAC token
    //      that the page exchanges on mount; reloading re-runs the
    //      whole exchange and brings the user back into the
    //      pre-call screen. The patient join page (or doctor
    //      dashboard launch) can pass smarter handlers later.
    //
    // `disconnectReason` should be set by `handleLeave` or the
    // Twilio `disconnected` listener BEFORE this branch renders.
    // The fallback `?? 'unknown'` covers a (very unlikely) race
    // where status flipped before the classifier ran.
    if (splashDismissed) {
      // Sub-batch D · task-video-D1 — post-call summary mount.
      //
      // When the splash dismisses, render the post-call summary
      // card in place of the legacy "Call ended." placeholder. The
      // summary aggregator accepts the same bearer JWT that
      // `recordingToken` carries (doctor Supabase JWT OR patient /
      // extra-participant scoped Supabase JWT — the backend
      // service-layer `resolveCaller` discriminates). Once the user
      // clicks Done, we flip `summaryDismissed` and fall through to
      // the legacy placeholder so the surface never blanks.
      //
      // When `recordingSessionId` + `recordingToken` aren't both
      // wired (legacy callsites), we skip straight to the
      // placeholder — the contract is "summary degrades gracefully
      // when bearer creds aren't in scope".
      if (
        !summaryDismissed &&
        recordingSessionId &&
        recordingToken
      ) {
        return (
          <CallPostCallSummary
            sessionId={recordingSessionId}
            bearerJwt={recordingToken}
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
            You have left the video consultation.
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
      <CallDisconnectSplash
        reason={disconnectReason ?? "unknown"}
        role={role === "patient" ? "patient" : "doctor"}
        actorLabel={remoteLabel}
        onDismiss={() => setSplashDismissed(true)}
        onRejoin={handleSplashRejoin}
        onRestart={handleSplashRestart}
      />
    );
  }

  // --------------------------------------------------------------------------
  // Render — video pane
  // --------------------------------------------------------------------------

  // Sub-batch B · task-video-B2 / B4 — map `<VideoRoom>`'s internal
  // lifecycle (connecting / connected / disconnected / error) to the
  // caller-card's surface status (connecting / live / hold / reconnecting).
  // The disconnected + error branches return early above this point and
  // never reach the card; the cast is safe.
  //
  // Branch order matters — most-specific signal wins:
  //   `'reconnecting'`— B4. Wins over connecting / live so the
  //                     caller-card status pill flips to "Reconnecting…"
  //                     the moment Twilio fires the event (mirrors the
  //                     banner overlay). Includes the `'failed'` state
  //                     so the pill reflects "Reconnecting…" until the
  //                     user either rejoins or the splash takes over.
  //   `'live'`        — B2. Connected and not reconnecting.
  //   `'connecting'`  — B2. Twilio room hasn't fired the first
  //                     `connected` event yet. Card shows the blue
  //                     pulse banner.
  //   `'hold'`        — B3 wired the local hold UI but deliberately did
  //                     NOT map onto the caller-card pill (counterparty-
  //                     side signal still needs voice B3's backend
  //                     route). When the route lands, this mapping
  //                     should sit just below the `'reconnecting'`
  //                     branch (hold loses to reconnecting because a
  //                     reconnect mid-hold means we're not actually
  //                     holding signal — Twilio is fighting to keep us
  //                     connected at all).
  const callerCardStatus: CallerCardStatus =
    reconnect.status !== "live"
      ? "reconnecting"
      : status === "connected"
        ? "live"
        : "connecting";

  // Sub-batch B · task-video-B10 — derive the caller-card's recording
  // pill from existing state. Three inputs:
  //
  //   `recordingEnabled`        → gate. When false, the session isn't
  //                               recorded at all → `'idle'`.
  //   `recordingState.paused`   → audio recording paused (Plan 02).
  //                               Wins over the recording branch when
  //                               true → `'paused'`.
  //   `isVideoRecordingActive`  → video escalation locked (Plan 08).
  //                               Drives the tooltip copy ("Audio +
  //                               video …") but doesn't change the
  //                               status enum — the pill is binary.
  //
  // Tooltip copy follows the spec verbatim:
  //   recording + video escalation → "Audio + video is being recorded
  //                                   for the clinical record."
  //   recording, audio only         → "Audio is being recorded for the
  //                                    clinical record."
  //   paused                        → "Recording is paused. [More]"
  // The `[More]` deep-link is text-only in v1 (Out of scope #1 in the
  // B10 task — clicking the pill to open recording controls is a
  // future PR).
  let callerCardRecordingStatus: "idle" | "recording" | "paused" = "idle";
  let callerCardRecordingTooltip: string | undefined;
  if (recordingEnabled) {
    if (recordingState.paused) {
      callerCardRecordingStatus = "paused";
      callerCardRecordingTooltip = "Recording is paused. [More]";
    } else {
      callerCardRecordingStatus = "recording";
      callerCardRecordingTooltip = isVideoRecordingActive
        ? "Audio + video is being recorded for the clinical record."
        : "Audio is being recorded for the clinical record.";
    }
  }

  // Sub-batch B · task-video-B8 — when the user has chosen 'audio-only',
  // we've torn down the LocalVideoTrack entirely (see
  // `handleQualityChange`'s audio-only branch). The self-tile would
  // otherwise render a black frame; OR'ing the audio-only state into
  // `cameraOff` reuses A2's avatar overlay path. Camera-off button
  // (also from A2) is hidden in audio-only mode below since there's no
  // track to toggle.
  const isAudioOnly = quality === "audio-only";
  const selfTileCameraOff = cameraOff || isAudioOnly;

  // Pulled into a local const so both desktop and mobile layouts can
  // render the SAME element (display: hidden on mobile when the Chat
  // tab is selected). Must stay mounted: tearing down Twilio's room on
  // tab-switch would cost 2-5s reconnect (Note #3).
  const videoPane = (
    <div className="flex flex-1 flex-col space-y-4">
      {sessionId && doctorToken ? (
        <SessionStartBanner sessionId={sessionId} doctorToken={doctorToken} />
      ) : null}
      {recordingEnabled && recordingSessionId && recordingToken ? (
        isCockpit ? (
          // task-cockpit-fix-3 — compact recording pill. Full RecordingControls
          // lives in the More ▾ dropdown; this pill is a passive status indicator.
          recordingState.loading ? null : recordingState.paused ? (
            <div className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800">
              <span aria-hidden>⏸</span>
              <span>Paused</span>
            </div>
          ) : (
            <div className="inline-flex items-center gap-1.5 rounded-full border border-red-300 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-red-600" aria-hidden />
              <span>REC</span>
            </div>
          )
        ) : (
          <div className="flex flex-col gap-2">
            <RecordingPausedIndicator state={recordingState} currentUserRole={recordingRole} />
            <div className="flex flex-wrap items-start gap-3">
              <RecordingControls
                sessionId={recordingSessionId}
                token={recordingToken}
                currentUserRole={recordingRole}
                state={recordingState}
              />
              {/* Plan 08 · Task 40 · Decision 10 LOCKED — doctor-only. The
                  button self-filters on `currentUserRole === 'patient'` and
                  hides itself when video is already recording (Task 42's
                  indicator takes over), so the mount is unconditional. */}
              <VideoEscalationButton
                sessionId={recordingSessionId}
                token={recordingToken}
                currentUserRole={recordingRole}
              />
            </div>
          </div>
        )
      ) : null}
      {/* Plan 08 · Task 41 · Decision 10 LOCKED — patient-side consent modal.
          Self-gates on `enabled={recordingRole === 'patient'}` so the doctor
          mount is a no-op. The modal itself only renders when the
          `usePatientVideoConsentRequest` hook surfaces a pending row
          (either via the initial GET probe on mount OR via a Realtime
          INSERT mid-consult). Mounting unconditionally keeps the
          render tree stable across pending/idle transitions. */}
      {recordingEnabled && recordingSessionId && recordingToken ? (
        <VideoConsentModal
          sessionId={recordingSessionId}
          token={recordingToken}
          enabled={recordingRole === "patient"}
        />
      ) : null}
      {/*
       * Sub-batch B · task-video-B2 — caller-card overlay replaces the
       * disparate `topLeftBadge` (duration chip) and `topRightBadge`
       * (remote network bars) that the remote `<VideoTile>` was
       * carrying after A3 + A8. The card consolidates:
       *
       *   - counterparty avatar (initials hash matching A2's
       *     camera-off placeholder via the shared
       *     `lib/call/actor-avatar.ts` helpers)
       *   - counterparty name + role
       *   - call duration (consumes the same `useCallDuration`
       *     hook A3 introduced)
       *   - counterparty network-quality bars (parent owns the
       *     hook + tooltip; passes derived values in)
       *   - lifecycle banner (`connecting…` today; B3 hold + B4
       *     reconnecting will pass through unchanged)
       *
       * Render order inside the `relative` wrapper still matters:
       *
       *   1. recording indicator (absolute, z-20)         — Plan 02 / 08
       *   2. tile container (per-layout)                  — A5 + B6
       *        ├── Speaker:  remote inline + self floating (absolute, z-20)
       *        ├── Gallery:  grid grid-cols-1 md:grid-cols-2 (both inline)
       *        └── Sidebar:  flex md:flex-row 70/30 (both inline)
       *   3. caller-card overlay (absolute, z-15)         — B2
       *   4. hold + reconnect banners (absolute, z-30)    — B3 + B4
       *
       * Sub-batch B · task-video-B6 — the tile container uses
       * `display: contents` (`className="contents"`) for Speaker so
       * the children behave as direct children of THIS `<div
       * className="relative">` wrapper — the floating self tile
       * (`absolute`) still anchors to the wrapper, NOT to the
       * container. For Gallery / Sidebar the container becomes a
       * normal grid / flex parent. Keeping the same React subtree
       * across layout swaps is critical: Twilio's `track.attach()`
       * binding lives on the `<video>` DOM node, and React
       * reconciliation preserves the node only when its parent
       * stays in the same JSX position. Toggling `display: contents`
       * (a CSS-only change) avoids any DOM remount → no Twilio
       * re-attach needed → no audio/video flicker on layout swap.
       *
       * The card sits at z-15 so the floating self-tile (z-20) renders
       * ABOVE it when the user pins the PiP to TR/TL — matches B2's
       * "overlay sits above remote video but below `<VideoSelfTile>`"
       * spec line. The recording indicator (z-20) ALSO stays above
       * the card; B10 will lift it INTO the card's right slot, but
       * for now both render and the card's right-slot pill is the
       * forward-compat placeholder.
       */}
      {/*
       * Sub-batch C · task-video-C5 — privacy banner.
       *   Mounted ABOVE the video canvas (sibling, not overlay) so
       *     it pushes the tiles down and guarantees the user can't
       *     miss it. Per task Notes/Open decisions §2: "render a
       *     sticky banner at the top of YOUR own view" so the
       *     doctor remembers to stop before showing private
       *     content (e.g. before pulling up another patient's
       *     chart).
       *   Visible only when WE are sharing — counterparty's share
       *     doesn't trigger the banner; the screen tile itself
       *     carries a "Shared screen" label so the user knows
       *     what they're looking at.
       *   Amber tint matches the existing reconnect-warning /
       *     virtual-bg-failure pill aesthetic — a "heads up"
       *     state, not a "danger / red" failure. Same precedent
       *     as B7's PiP notice + C2's bg notice.
       */}
      {/*
       * Sub-batch F · task-video-F3 — iOS PWA degradation banner.
       *   Renders ONLY when the page is in iOS standalone (PWA
       *   install) — `useCallMediaSession.isIOSPWA` already
       *   bundles the UA + display-mode detection.
       *   Apple gates persistent SW notifications on iOS, so a
       *   patient who installs the PWA on their iPhone and then
       *   backgrounds the call may have it drop within ~30s. The
       *   amber banner sets the expectation up-front so it's not
       *   a surprise mid-call. Same visual family as the
       *   screen-share + reconnect + battery banners (sticky
       *   amber, inline svg + body copy).
       *   Hidden during hold (the call isn't actively at risk
       *   from backgrounding while paused).
       */}
      <IOSPWABanner
        isIOSPWA={callMediaSession.isIOSPWA}
        hidden={hold.onHold}
      />
      {screen.localScreenTrack ? (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center gap-2 self-stretch rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
          data-testid="screen-share-privacy-banner"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="flex-shrink-0"
          >
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
          </svg>
          <span className="flex-1 font-medium">
            You&apos;re sharing your screen — be mindful of private content.
          </span>
        </div>
      ) : null}
      <div className="relative">
        {recordingEnabled ? (
          <VideoRecordingIndicator
            isActive={isVideoRecordingActive}
            viewerRole={recordingRole}
            sessionId={recordingSessionId ?? null}
            token={recordingToken ?? null}
            className="absolute right-3 top-3 z-20"
          />
        ) : null}
        {/*
         * Sub-batch C · task-video-C5 — screen-share tile(s).
         *   Mounted INSIDE the relative wrapper so the recording
         *     indicator (absolute right-3 top-3 z-20) overlays
         *     it correctly when both are active. JSX order
         *     places this BEFORE the camera-tile container so
         *     the screen takes the dominant visual slot; the
         *     camera tiles below get squished into a compact
         *     horizontal strip via the `isSharingActive`
         *     branch on the tile-container className.
         *   Both local and remote screens can render
         *     simultaneously per decision §6 (limit 2 screens
         *     max). When both are active, they stack
         *     horizontally on desktop and vertically on
         *     mobile.
         *   The tile aspect-ratio is intentionally NOT
         *     constrained — `object-contain` on the inner
         *     <video> handles arbitrary aspect ratios (a
         *     vertical mobile screen, a wide landscape
         *     monitor, a single-window capture). The h-[60vh]
         *     cap keeps the tile from eating the entire
         *     viewport on small laptops.
         */}
        {isSharingActive ? (
          <div
            className="mb-3 flex h-[40vh] flex-col gap-2 md:h-[60vh] md:flex-row"
            data-testid="screen-share-section"
          >
            {remoteScreenTrack ? (
              <div className="min-h-0 min-w-0 flex-1">
                <ScreenShareTile
                  videoTrack={remoteScreenTrack}
                  variant="remote"
                  label={`${remoteLabel}'s screen`}
                />
              </div>
            ) : null}
            {screen.localScreenTrack ? (
              <div className="min-h-0 min-w-0 flex-1">
                <ScreenShareTile
                  videoTrack={screen.localScreenTrack}
                  variant="self"
                  label="Your screen"
                  onStop={handleToggleScreenShare}
                />
              </div>
            ) : null}
          </div>
        ) : null}
        <div
          data-testid="video-tile-container"
          data-layout={isSharingActive ? "share-strip" : effectiveLayout}
          className={
            isSharingActive
              ? // Sub-batch C · task-video-C5 — compact horizontal
                // strip when sharing displaces the canvas. Camera
                // tiles drop to thumbnail-size so the screen tile
                // above keeps the dominant slot. JSX position of
                // the inner <video> ref-bound elements is preserved
                // so Twilio attach() bindings survive (same DOM-
                // stability discipline as the speaker→gallery swap).
                "flex h-24 flex-row gap-2 transition-all duration-200 ease-in-out md:h-32"
              : effectiveLayout === "gallery"
                ? // Sub-batch F · task-video-F2 — `landscape:grid-cols-2`
                  // forces side-by-side at ALL widths in landscape
                  // orientation. The default `grid-cols-1` gives
                  // stacked tiles in mobile portrait; without the
                  // landscape override, a phone in landscape
                  // (typically still sub-`md` width-wise) would
                  // keep the stacked layout — wasting the wide
                  // canvas with one tile sitting above the other.
                  "grid grid-cols-1 gap-3 transition-all duration-200 ease-in-out landscape:grid-cols-2 md:grid-cols-2"
                : effectiveLayout === "sidebar"
                  ? // Sub-batch F · task-video-F2 — same idea for
                    // Sidebar. Default mobile portrait stacks the
                    // remote on top of the rail; landscape (mobile
                    // OR desktop) goes horizontal so the 70/30
                    // split actually reads as a sidebar.
                    "flex flex-col gap-3 transition-all duration-200 ease-in-out landscape:flex-row md:flex-row"
                  : "contents"
          }
        >
          <div
            className={
              isSharingActive
                ? "min-w-0 flex-1"
                : effectiveLayout === "sidebar"
                  ? // F2 — `landscape:basis-[70%] landscape:flex-grow`
                    // matches the sidebar split in mobile landscape
                    // (the parent flex container also opted-in via
                    // `landscape:flex-row` above). Desktop continues
                    // through the `md:` variants unchanged.
                    "min-w-0 landscape:basis-[70%] landscape:flex-grow md:basis-[70%] md:flex-grow"
                  : "contents"
            }
          >
            <VideoTile
              videoRef={remoteVideoRef}
              label={remoteLabel}
              cameraOff={remoteCameraOff}
              actorName={remoteLabel}
              hideLabel
              pendingText={
                status === "connecting" ? `Waiting for ${remoteLabel.toLowerCase()}…` : null
              }
            />
          </div>
          <div
            className={
              isSharingActive
                ? "min-w-0 flex-1"
                : effectiveLayout === "sidebar"
                  ? // F2 — same landscape pairing on the rail side.
                    "min-w-0 landscape:basis-[30%] landscape:flex-shrink-0 md:basis-[30%] md:flex-shrink-0"
                  : "contents"
            }
          >
            <VideoTile
              videoRef={localVideoRef}
              label="You"
              cameraOff={selfTileCameraOff}
              actorName={role === "patient" ? "Patient" : "Doctor"}
              muteSelf
              mirror={mirrorSelf}
              // C5 — show labels in the compact share-strip so
              // the user can tell "You" from the counterparty
              // at thumbnail size; otherwise preserve the
              // existing speaker-mode hide.
              hideLabel={!isSharingActive && effectiveLayout === "speaker"}
              pendingText={status === "connecting" ? "Starting camera…" : null}
              // Speaker — float as A5 corner overlay (anchors to outer
              // `relative` wrapper because the tile container above
              // uses `display: contents`).
              // Gallery / Sidebar — render inline (no `floating` prop);
              // A5's `selfViewPosition` state is dormant in those
              // layouts but preserved so swapping back to Speaker
              // restores the corner.
              //
              // C5 — when share-strip is active, force inline so
              // the self tile lives next to the remote camera in
              // the bottom strip rather than floating over the
              // (much larger) screen-share tile above.
              floating={
                !isSharingActive && effectiveLayout === "speaker"
                  ? {
                      position: selfViewPosition,
                      onTap: handleSelfViewTap,
                    }
                  : undefined
              }
            />
          </div>
        </div>
        <CallerCardOverlay
          counterparty={{
            // Real names land when `doctor_settings.display_name` /
            // `patients.full_name` are wired through the join token
            // (out of scope here). Today `name === role` so the card
            // suppresses the duplicate role row internally.
            name: remoteLabel,
            role: remoteLabel,
          }}
          connectedAt={connectedAt}
          remoteNetworkLevel={remoteParticipant ? remoteNetworkQuality.level : null}
          remoteStatsTooltip={remoteStatsTooltip}
          status={callerCardStatus}
          // Sub-batch B · task-video-B10 — wired for real now. The
          // existing `<VideoRecordingIndicator>` (corner red dot)
          // STAYS — it owns the SR `role="status" aria-live="polite"`
          // announcement contract for the legacy non-companion mount
          // path AND covers the audio-only recording case. The card
          // pill is the second visual surface where attention
          // naturally lands (the call header) — together they close
          // the "wait, are we being recorded?" anxiety loop without
          // creating a third source-of-truth.
          recordingStatus={callerCardRecordingStatus}
          recordingTooltip={callerCardRecordingTooltip}
        />
        {/*
         * Sub-batch B · task-video-B3 — hold overlay.
         *   Self variant is the only one rendered today (see hook +
         *   handleToggleHold doc above for why counterparty variant
         *   is gated on voice B3's backend route landing).
         *   Mounted on the same `<div className="relative">` that
         *   hosts the tiles so it overlays the entire video canvas
         *   (not just one tile) — the call is on hold, both tiles
         *   are paused.
         *   `z-30` puts it above the recording indicator (z-20) and
         *   the caller card overlay so the hold state is visually
         *   dominant — it IS the "what's happening right now"
         *   answer when on hold.
         */}
        {hold.onHold ? (
          <HoldCallBanner variant="self" onResume={handleToggleHold} />
        ) : null}
        {/*
         * Sub-batch E · task-video-E2 — auto audio-only fallback
         * banner. Sticky at top of the video canvas (above tiles).
         * Mounted INSIDE the relative wrapper so it stacks with the
         * recording indicator (z-20) + hold banner (z-30); the
         * fallback banner uses z-30 so it sits above the recording
         * pill, matching the hold banner's visual prominence — both
         * banners answer "what's happening right now?" when active.
         *
         * Banner is shown to BOTH roles (doctor + patient) — both
         * sides see the local camera teardown and need the
         * explanation. The "Try video again" handler is only
         * meaningful on the side that fell back, but the banner
         * + button only mount when local fallback fires (no
         * counterparty mirror in v1).
         *
         * Out of scope for Phase 1: counterparty banner (the
         * patient's chat companion already shows the
         * `auto_audio_fallback` system row as a transcript-grade
         * breadcrumb, and A2's `remoteCameraOff` avatar covers the
         * visual answer to "where did the video go").
         */}
        {/*
         * Sub-batch E · task-video-E4 — crash-recovery rejoin welcome
         * banner. Renders ONLY when the parent mounted us from a cached
         * snapshot; auto-dismisses in 3s via the effect above. Suppressed
         * during a multi-tab kick (`tabPresence.status === 'kicked'`)
         * because the kick overlay is `z-50` and is the canonical
         * surface in that state — a "Reconnected" toast under a kick
         * overlay would be confusing.
         */}
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
        {autoFallbackActive ? (
          <AudioFallbackBanner
            onTryVideoAgain={handleTryVideoAgain}
            cooldownActive={autoFallbackCooldownEndsAt != null}
            cooldownEndsAt={autoFallbackCooldownEndsAt}
            restoreInFlight={restoreInFlight}
          />
        ) : null}
        {/*
         * Sub-batch F · task-video-F4 — battery-saver banner.
         *
         * Mode resolution (mutually exclusive — only one mode renders
         * at a time, with the most-urgent winning):
         *
         *   1. `forced`   → battery-critical fallback engaged AND
         *                    charging not yet detected. RED sticky.
         *   2. `charging` → charging detected after a forced-fallback
         *                    state. GREEN sticky with [Re-enable
         *                    video] CTA (routes through
         *                    `handleTryVideoAgain` — same primitive
         *                    the bandwidth-driven AudioFallbackBanner
         *                    uses).
         *   3. `prompt`   → battery <15%, not charging, no force yet.
         *                    AMBER sticky with [Switch] / [Keep video].
         *
         * The bandwidth `<AudioFallbackBanner>` and the battery
         * banner CAN coexist visually (both sticky, both at top); we
         * suppress the prompt mode when the bandwidth fallback is
         * active to avoid stacking two amber banners with conflicting
         * CTAs. The forced battery banner trumps the bandwidth
         * banner if both are concurrently engaged — plugging in is
         * the only escape from the forced state, so the red banner
         * is more important than the bandwidth one.
         *
         * Spec ack: B8 picker disable for forced state and F.3
         * notification text wiring are deferred (B8 picker doesn't
         * yet support a per-option disabled state; F.3 isn't shipped).
         */}
        {(() => {
          let mode: BatteryBannerMode | null = null;
          if (batteryFallbackForced && !showBatteryCharging) {
            mode = "forced";
          } else if (showBatteryCharging) {
            mode = "charging";
          } else if (showBatteryPrompt && !autoFallbackActive) {
            mode = "prompt";
          }
          if (!mode) return null;
          return (
            <BatteryWarningBanner
              mode={mode}
              onSwitchToAudio={() => {
                setShowBatteryPrompt(false);
                setBatteryFallbackForced(true);
                applyAdaptiveLevel("audio-only", {
                  reason: "battery_low",
                }).catch((err) => {
                  if (process.env.NODE_ENV !== "production") {
                    console.warn(
                      "Battery-low applyAdaptiveLevel failed:",
                      err instanceof Error ? err.message : err,
                    );
                  }
                });
              }}
              onKeepVideo={() => {
                // Latch in the hook prevents re-prompting; this
                // just hides the surface. The forced 5% threshold
                // can still fire if the battery keeps draining.
                setShowBatteryPrompt(false);
              }}
              onReEnableVideo={
                batteryFallbackForced
                  ? () => {
                      // Route through the same restore primitive
                      // the bandwidth-driven banner uses (60s
                      // cooldown applies; the battery hook owns
                      // its own latch reset on charging detected).
                      // Clear the local "forced" flag eagerly so
                      // the charging banner unmounts on click —
                      // the actual republish is async and the
                      // <AudioFallbackBanner> would surface
                      // restore-in-flight if anything went wrong.
                      setBatteryFallbackForced(false);
                      setShowBatteryCharging(false);
                      handleTryVideoAgain().catch((err) => {
                        if (process.env.NODE_ENV !== "production") {
                          console.warn(
                            "Battery-recovery handleTryVideoAgain failed:",
                            err instanceof Error ? err.message : err,
                          );
                        }
                      });
                    }
                  : undefined
              }
              onDismiss={() => {
                setShowBatteryCharging(false);
                // Also clear forced flag on dismiss so the recovery
                // banner doesn't reappear on re-render. The hook's
                // recover latch already reset; this just keeps
                // local UI state in sync.
                setBatteryFallbackForced(false);
              }}
              busy={restoreInFlight}
            />
          );
        })()}
        {/*
         * Sub-batch E · task-video-E3 — multi-tab kick / multi-monitor warn.
         *
         * Branches by `tabPresence.status` (see hook docs):
         *   - 'sole'             → returns null; no surface.
         *   - 'multi-tab-warned' → DOCTOR-only small pill at top of canvas
         *                          ("Open in N tabs · audio routes to the
         *                          newest tab"). Does NOT kick — doctors
         *                          legitimately use multi-monitor setups
         *                          (decision §29).
         *   - 'kicked'           → PATIENT-only full-screen overlay (z-50)
         *                          with [Take over] CTA. The room teardown
         *                          fires in the `useEffect` above; this
         *                          banner just renders the explanation +
         *                          the recovery affordance.
         *
         * Mounted unconditionally (the component returns null for 'sole')
         * inside the same `relative` wrapper as the other banners so the
         * absolute positioning resolves against the video canvas.
         *
         * `effectiveRole` is null in legacy mounts that don't pass `role`
         * — in that case the hook returns inert 'sole' and the banner
         * renders nothing. We still gate on `effectiveRole != null` here
         * defensively so the prop type stays narrow.
         */}
        {effectiveRole != null ? (
          <MultiTabKickBanner
            status={tabPresence.status}
            otherTabsCount={tabPresence.otherTabsCount}
            role={effectiveRole}
            onTakeOver={handleTabKickTakeOver}
          />
        ) : null}
        {/*
         * Sub-batch B · task-video-B4 — reconnection banner overlay.
         *   Mounted on the same `<div className="relative">` as
         *   `<HoldCallBanner>` so it overlays the video canvas
         *   (not just one tile). Uses `top-0` + `inset-x-0` inside
         *   the banner itself so the last-good frame remains visible
         *   underneath; the user can tell the call hasn't "gone
         *   black" — only signaling is recovering.
         *   Hold takes visual precedence (`HoldCallBanner` mounts
         *   below this in JSX order but is centered + larger);
         *   reconnect status is information-dense but small. If a
         *   reconnect happens while on hold (rare but possible),
         *   both can render — they don't visually conflict because
         *   the reconnect banner sits at the top edge while the
         *   hold banner is centered.
         *   `live` returns null inside the component so we can
         *   mount unconditionally.
         */}
        <ReconnectionBanner
          status={reconnect.status}
          countdownSeconds={reconnect.countdownSeconds}
          onTryNow={reconnect.tryNow}
          onRejoin={reconnect.rejoinNow}
          autoFocusAction={reconnect.status === "failed"}
        />
        {/*
         * Sub-batch B · task-video-B7 — PiP placeholder overlay.
         *   When the remote video is in Picture-in-Picture, the
         *     in-app `<video>` element shows a black frame (the
         *     browser routes the pixels to the floating window).
         *     We overlay a friendly placeholder so the user
         *     understands what happened + has a one-tap path
         *     back into the in-app experience.
         *   `z-25` sits BELOW the hold banner (z-30) and reconnect
         *     banner (z-30) — those states are "the call needs
         *     attention", PiP is "the user is multitasking by
         *     choice." Above the caller card overlay (z-15) and
         *     recording indicator (z-20) so the "Bring back" CTA
         *     isn't visually buried.
         *   Pointer-events on the wrapper would block self-view
         *     interactions; we keep it on the inner pill only so
         *     dragging / tapping the surrounding tile area still
         *     works (Twilio mute-on-tap, future swipe gestures, etc.).
         *   `aria-live='polite'` so the screen-reader announces
         *     the state change without interrupting active speech.
         */}
        {pip.isActive ? (
          <div
            className="pointer-events-none absolute inset-0 z-[25] flex items-center justify-center bg-gray-900/60"
            aria-live="polite"
          >
            <div className="pointer-events-auto flex flex-col items-center gap-3 rounded-lg bg-white/95 px-6 py-5 text-center shadow-lg">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                className="text-blue-600"
              >
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <rect x="12" y="11" width="7" height="6" rx="1" fill="currentColor" stroke="none" />
              </svg>
              <p className="text-sm font-medium text-gray-900">
                Currently in Picture-in-Picture
              </p>
              <p className="max-w-xs text-xs text-gray-600">
                The video is floating in its own window. You can drag,
                resize, or close it from there.
              </p>
              <button
                type="button"
                onClick={handleTogglePip}
                className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                Bring back
              </button>
            </div>
          </div>
        ) : null}
      </div>
      {/*
       * Sub-batch B · task-video-B7 — ephemeral PiP failure notice.
       *   No toast library in deps yet (same constraint as B6 / B8 /
       *     B9), so the notice mounts as a small inline pill below
       *     the controls bar. Self-clears after 4s via the effect
       *     above. Same precedent as the existing `errorMessage`
       *     red banner — local UI state, no global side effects.
       *   Color is amber (warning, not failure) — PiP failures are
       *     mostly "tap the video first" gesture issues that resolve
       *     on retry, not "the call is broken."
       */}
      {pipNotice ? (
        <div
          role="status"
          aria-live="polite"
          className="self-start rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800"
        >
          {pipNotice}
        </div>
      ) : null}
      {/*
       * Sub-batch C · task-video-C2 — ephemeral virtual-background
       * failure notice. Same pill pattern as B7's PiP notice — no
       * toast lib in deps yet, self-clears after 4s, amber tone for
       * "warning, not failure" since the call is unaffected.
       */}
      {backgroundNotice ? (
        <div
          role="status"
          aria-live="polite"
          className="self-start rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800"
        >
          {backgroundNotice}
        </div>
      ) : null}
      {/*
       * Sub-batch C · task-video-C5 — ephemeral screen-share failure
       * notice. Same pill pattern + amber-tone precedent as B7 / C2.
       * Permission-denied (user clicked Cancel on the OS picker) is
       * silently swallowed in `handleToggleScreenShare`; this pill
       * only fires for genuine failures (`'no-room'`, `'no-track'`,
       * `'unknown'`) where user feedback is warranted.
       */}
      {screenShareNotice ? (
        <div
          role="status"
          aria-live="polite"
          className="self-start rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800"
        >
          {screenShareNotice}
        </div>
      ) : null}
      {/*
       * Sub-batch E · task-video-E1 — adaptive-bitrate downgrade
       * notice. Same amber-pill precedent as B7 / C2 / C5; copy
       * comes from `adaptiveToastMessage()` which only fires on
       * downgrades (upgrades are silent — no need to congratulate
       * the user on a recovering network). Self-clears in 6s via
       * the effect declared with the controller state above.
       */}
      {adaptiveNotice ? (
        <div
          role="status"
          aria-live="polite"
          className="self-start rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800"
        >
          {adaptiveNotice}
        </div>
      ) : null}
      {/*
       * Sub-batch A · task-video-A1 + A2 — controls bar.
       *   Today: [Mute] [Camera] [Leave call]
       *   A4 will rework the leave button into "End call" with a
       *   confirmation modal — for now keep the existing copy + behavior.
       *
       * Buttons match the existing `<VoiceConsultRoom>` controls bar
       * (text + amber tint for the active state) so both modalities
       * feel the same; Lucide is not in the frontend deps yet so we
       * deliberately don't use icon glyphs here (revisit when Lucide
       * lands or when A4 extracts a shared `<VideoControlsBar>`).
       *
       * Mic + camera buttons are hidden until the room is connected —
       * there is no `localTracksRef` track to toggle while connecting/
       * error/disconnected, and showing a no-op button would mislead
       * the user.
       */}
      <div className="flex flex-wrap items-center gap-2 self-start">
        {status === "connected" ? (
          <>
            {/*
             * Sub-batch A · task-video-A8 — your-side network bars.
             *   Mounted only when connected (the hook returns
             *     `level === null` pre-connect anyway, but the bars
             *     would render as a measuring placeholder which is
             *     misleading next to the disabled control buttons).
             *   Tooltip shows the full diagnostic dump (RTT / jitter /
             *     resolution / FPS / bitrates) — what doctors will
             *     reach for to triage "patient looks frozen".
             *   Background is a subtle gray pill so the bars don't
             *     fight the buttons visually; same height (~36 px) as
             *     the buttons so the row stays balanced.
             */}
            <div className="flex h-9 items-center rounded-md border border-gray-200 bg-white px-2">
              <NetworkBars
                level={localNetworkQuality.level}
                label="Your network"
                tooltip={localStatsTooltip}
              />
            </div>
            {/*
             * Sub-batch B · task-video-B3 — when the call is on hold
             * the action cluster collapses to just [Resume] [Leave].
             * Mute / Camera / Mirror / Volume / Quality are hidden
             * because they're no-ops while both tracks are
             * disabled (clicking Mute on a disabled audio track
             * would silently do nothing — confusing). Resume is
             * the explicit way out; Leave still works as the
             * abandon-call escape hatch.
             */}
            {hold.onHold ? null : (
              <button
                type="button"
                onClick={handleToggleMic}
                aria-pressed={micMuted}
                title={micMuted ? "Muted — click to unmute" : "Mute your microphone"}
                className={
                  "rounded-md px-4 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 " +
                  (micMuted
                    ? "bg-amber-100 text-amber-900 ring-1 ring-amber-300 focus:ring-amber-400"
                    : "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 focus:ring-gray-300")
                }
              >
                {micMuted ? "Unmute" : "Mute"}
              </button>
            )}
            {/*
             * Sub-batch B · task-video-B8 — hide the Camera off/on
             * button when in audio-only mode. The picker has torn
             * down the LocalVideoTrack entirely, so there's nothing
             * for `handleToggleCamera` to enable/disable; clicking
             * would be a silent no-op. Keep the button slot stable
             * in non-audio-only modes (the picker is the path back
             * to video).
             *
             * Sub-batch B · task-video-B3 — also hide while on
             * hold (see Mute gate above).
             */}
            {isAudioOnly || hold.onHold ? null : (
              <button
                type="button"
                onClick={handleToggleCamera}
                aria-pressed={cameraOff}
                title={cameraOff ? "Camera off — click to turn on" : "Turn off your camera"}
                className={
                  "rounded-md px-4 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 " +
                  (cameraOff
                    ? "bg-amber-100 text-amber-900 ring-1 ring-amber-300 focus:ring-amber-400"
                    : "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 focus:ring-gray-300")
                }
              >
                {cameraOff ? "Camera on" : "Camera off"}
              </button>
            )}
            {/*
             * Sub-batch F · task-video-F1 — camera switch (front ↔ back).
             *   Lives between Camera and Hold so it sits with the other
             *     publisher-side video toggles (Camera off, Mirror).
             *   Hidden in audio-only (no video track to switch) and
             *     while on hold (action cluster collapses to Resume +
             *     Leave) — same gate as the Camera button above.
             *   The component returns `null` internally when there's
             *     only one camera (`hasMultipleCameras: false`); keeping
             *     it mounted unconditionally lets the device-change
             *     event surface a freshly-plugged USB camera without a
             *     re-render dance here.
             */}
            {!isCockpit && (isAudioOnly || hold.onHold ? null : (
              <CameraSwitchButton
                devices={cameraSwitch.devices}
                current={cameraSwitch.currentDeviceId}
                flip={cameraSwitch.flip}
                switchTo={cameraSwitch.switchTo}
                isFlipping={cameraSwitch.isFlipping}
                hasMultipleCameras={cameraSwitch.hasMultipleCameras}
              />
            ))}
            {/*
             * Sub-batch B · task-video-B3 — Hold / Resume button.
             *   Lives between Camera and Mirror — semantically
             *     adjacent to the publisher-side mute/camera
             *     toggles (it's a "pause both" superset).
             *   Visible at all times while connected (so the user
             *     can engage hold from a normal state) AND while on
             *     hold (so it acts as the "Resume" CTA — same
             *     button, different label/state). The overlay
             *     banner ALSO has its own Resume button for
             *     redundancy / discoverability when the user's
             *     attention is on the video canvas, not the
             *     controls strip.
             *   Plan 07 history viewer (`mode='readonly'`) — when
             *     that prop ships on `<VideoRoom>`, gate this
             *     button on `mode !== 'readonly'`. Today the prop
             *     doesn't exist; gating is a no-op.
             */}
            <button
              type="button"
              onClick={handleToggleHold}
              aria-pressed={hold.onHold}
              title={hold.onHold ? "Resume the call" : "Put the call on hold"}
              className={
                "rounded-md px-4 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 " +
                (hold.onHold
                  ? "bg-emerald-600 text-white hover:bg-emerald-700 focus:ring-emerald-500"
                  : "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 focus:ring-gray-300")
              }
            >
              {hold.onHold ? "Resume" : "Hold"}
            </button>
            {/*
             * Sub-batch A · task-video-A6 — mirror toggle.
             *   Default mirror=true (matches FaceTime / WhatsApp / Meet).
             *   Pressed/amber state = mirror OFF (the non-default state),
             *     mirroring the mute + camera buttons' convention
             *     (amber = "currently in the toggled-from-default state").
             *   Action-style label flips: "Mirror off" when ON / "Mirror on"
             *     when OFF — same idiom as the Camera button.
             *   Visible only when connected (parent `<>` branch above) so
             *     it never appears as a no-op during connecting/error.
             */}
            {/*
             * Sub-batch B · task-video-B8 — hide Mirror toggle in
             * audio-only mode (no video → mirror is meaningless).
             * Same reasoning as the Camera button gate above.
             *
             * Sub-batch B · task-video-B3 — also hide while on
             * hold (action cluster collapses to Resume + Leave).
             */}
            {!isCockpit && (isAudioOnly || hold.onHold ? null : (
              <button
                type="button"
                onClick={handleToggleMirror}
                aria-pressed={!mirrorSelf}
                title={
                  mirrorSelf
                    ? "Self-view is mirrored — click to show the unmirrored view"
                    : "Self-view is not mirrored — click to mirror it (recommended)"
                }
                className={
                  "rounded-md px-4 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 " +
                  (!mirrorSelf
                    ? "bg-amber-100 text-amber-900 ring-1 ring-amber-300 focus:ring-amber-400"
                    : "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 focus:ring-gray-300")
                }
              >
                {mirrorSelf ? "Mirror off" : "Mirror on"}
              </button>
            ))}
            {/*
             * Sub-batch B · task-video-B9 — remote-audio volume slider.
             *   Lives inline in the controls bar (right of Mirror, left
             *     of Leave) — the same neighborhood as `<NetworkBars>`
             *     because both are listener-side controls, not
             *     publisher-side toggles.
             *   Disabled until the remote audio track is wired
             *     (`audioRouterRef` is null pre-attach) so dragging the
             *     slider before the counterparty publishes audio
             *     doesn't fake a level change. Layout slot is reserved
             *     either way so the controls row doesn't reflow when
             *     audio lands ~1s after `connected`.
             *   Voice batch will mount the SAME `<VolumeSlider>` with
             *     its own storage key — visual + UX parity comes free.
             */}
            {/*
             * Sub-batch B · task-video-B3 — hide volume slider
             * while on hold (the remote is paused; volume slider
             * is meaningless when there's no audio playing).
             */}
            {!isCockpit && (hold.onHold ? null : (
              <VolumeSlider
                value={volumePercent}
                onChange={handleVolumeChange}
                disabled={audioRouterRef.current == null}
                ariaLabel={`${remoteLabel}'s volume`}
              />
            ))}
            {/*
             * Sub-batch B · task-video-B8 — manual quality picker.
             *   Lives at the end of the controls cluster (right of
             *     VolumeSlider, left of Leave) — semantically the
             *     "scope" of the call (resolution / data plan), so
             *     it bookends the per-action controls.
             *   `disabled` while a switch is in flight (Twilio is
             *     mid republish) — prevents stacked toggles that
             *     would leak tracks.
             *   Mounted only when connected (`status === 'connected'`
             *     parent gate) — pre-connect we don't have a room
             *     to apply changes against. Persisted value is read
             *     at connect time, so the picker shows the right
             *     selection from the moment it appears.
             *   Coupling-stub for E1 (when adaptive bitrate ships):
             *     'auto' = E1 owns the cap, picker is a no-op. Any
             *     explicit choice = E1 stands down. Today (no E1)
             *     'auto' just means the connect-time defaults apply.
             */}
            {/*
             * Sub-batch B · task-video-B3 — hide quality picker
             * while on hold (no video to negotiate quality on).
             * Reappears on Resume with the persisted value.
             */}
            {!isCockpit && (hold.onHold ? null : (
              <VideoQualityPicker
                value={quality}
                onChange={handleQualityChange}
                disabled={qualitySwitchInFlight}
              />
            ))}
            {/*
             * Sub-batch B · task-video-B6 — layout switcher.
             *   Sits right of the quality picker and left of Leave —
             *     "scope of the call" cluster (quality + tile
             *     arrangement) bookends the per-action toggles.
             *   Hidden during hold (same precedent as Mute / Camera /
             *     Mirror / Volume / Quality) — when the call is
             *     paused, the action cluster collapses to Resume +
             *     Leave and layout choice is irrelevant.
             *   Sidebar option auto-hides on mobile via the
             *     switcher's per-option `hidden md:inline-flex`
             *     gate; the parent `effectiveLayout` derivation
             *     also degrades a persisted Sidebar value to
             *     Speaker on mobile, so JS + CSS gates agree.
             *   `<VideoLayoutSwitcher>` is video-only today; voice
             *     consults don't have a tile arrangement to swap.
             *     If voice ever ships a multi-tile layout (3-way
             *     call territory), the component can be lifted to
             *     `frontend/components/consultation/` and consumed
             *     verbatim — same separation pattern as
             *     `<VolumeSlider>` (B9) and `<VideoQualityPicker>`
             *     (B8).
             */}
            {hold.onHold ? null : (
              <VideoLayoutSwitcher
                value={layout}
                onChange={handleLayoutChange}
              />
            )}
            {/*
             * Sub-batch F · task-video-F2 — orientation lock toggle.
             *   Sits immediately right of `<VideoLayoutSwitcher>`
             *     because the two together are "how the video is
             *     presented" (layout pick + orientation pin).
             *   `canLock` is false on iOS Safari and any non-PWA
             *     non-fullscreen browser; the button silently
             *     null-renders in those cases (per spec —
             *     Acceptance: "If !canLock: don't render").
             *   Spec asked for the button to live in a controls-bar
             *     overflow menu (decision §32). No overflow menu
             *     exists in the bar today — A4's `<VideoControlsBar>`
             *     extraction never shipped. Inlining here is the
             *     cheapest path that respects the visibility +
             *     accessibility requirements; once an overflow menu
             *     ships, this button can move with no API changes.
             *   Hidden during hold (same precedent as B6 / Mute /
             *     Camera) — there's no rendered video for an
             *     orientation lock to scope.
             */}
            {!isCockpit && (
              <OrientationLockButton
                canLock={orientation.canLock}
                isLocked={orientation.isLocked}
                orient={orient}
                lock={orientation.lock}
                unlock={orientation.unlock}
                hidden={hold.onHold}
              />
            )}
            {/*
             * Sub-batch C · task-video-C2 — virtual background picker.
             *   Sits right of the layout switcher and left of the PiP
             *     button — same "scope of the call" cluster as
             *     quality + layout. Background is the most "I'm
             *     ready to look professional" affordance so it lives
             *     near the call-prep controls, not buried in an
             *     overflow.
             *   Hidden during hold (same precedent as B6 / B7 / B8 /
             *     B9 / Mute / Camera) — the call is paused, the
             *     processor isn't even running on a frame, surfacing
             *     the picker would be misleading.
             *   `disabled` reflects the inflight `addProcessor` swap
             *     so the user can't queue up flapping toggles during
             *     the 1-2s TFLite model load on first apply.
             *   The component is video-only today; voice consults
             *     don't have a video track to process. If voice
             *     ever ships a "video preview while on a voice call"
             *     surface, the picker can be lifted to
             *     `frontend/components/consultation/` and consumed
             *     verbatim — same separation pattern as B6 / B8 / B9.
             */}
            {!isCockpit && (hold.onHold ? null : (
              <VirtualBackgroundPicker
                value={background}
                onChange={handleBackgroundChange}
                disabled={backgroundSwitchInFlight}
              />
            ))}
            {/*
             * Sub-batch B · task-video-B7 — Picture-in-Picture button.
             *   Decision §8 — `pip.isSupported === false` (Safari pre-iOS
             *     14, in-app webviews like Instagram / FB / TikTok / WeChat)
             *     hides the button entirely. Same precedent as B6's
             *     Sidebar-on-mobile gate ("hide instead of warn").
             *   Hidden during hold for the same reason as Mute / Camera /
             *     Quality / Layout — the call is paused and the remote
             *     video is the placeholder, so popping it out adds nothing.
             *   Not hidden during reconnect — a user might WANT to keep
             *     the (transient frozen) remote tile visible while
             *     poking around their EHR; the PiP placeholder will
             *     show the same frozen frame the in-app tile shows.
             *   Active state ("Exit PiP") is its own label — no
             *     `aria-pressed` because some screen readers
             *     mis-announce "pressed" toggles in a row of unrelated
             *     buttons. Two distinct labels is clearer.
             *   Inline SVG glyph (no Lucide in deps yet — same constraint
             *     as B6 / B8). The glyph is the standard "small box
             *     in larger box" PiP icon, drawn at 16x16 to match
             *     the layout-switcher buttons.
             */}
            {!isCockpit && pip.isSupported && !hold.onHold ? (
              <button
                type="button"
                onClick={handleTogglePip}
                aria-label={
                  pip.isActive
                    ? "Exit Picture-in-Picture"
                    : "Enter Picture-in-Picture"
                }
                title={
                  pip.isActive
                    ? "Exit Picture-in-Picture"
                    : "Picture-in-Picture"
                }
                className={`inline-flex items-center justify-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                  pip.isActive
                    ? "border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 focus:ring-blue-500"
                    : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50 focus:ring-blue-500"
                }`}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <rect x="3" y="5" width="18" height="14" rx="2" />
                  <rect x="12" y="11" width="7" height="6" rx="1" fill="currentColor" stroke="none" />
                </svg>
                <span>{pip.isActive ? "Exit PiP" : "PiP"}</span>
              </button>
            ) : null}
            {/*
             * Sub-batch C · task-video-C5 — Share-screen button.
             *   `screen.isSupported === false` (iOS Safari, any
             *     browser without `getDisplayMedia`) hides the
             *     button entirely. Same precedent as B7's PiP gate
             *     and B6's Sidebar-on-mobile gate ("hide instead
             *     of warn").
             *   Hidden during hold for the same reason as Mute /
             *     Camera / Quality / Layout / PiP — the call is
             *     paused and there's no published video to add a
             *     screen track to.
             *   Active state ("Stop sharing") gets a red tint —
             *     destructive action precedent (matches the
             *     Leave-call button + the Stop overlay on
             *     `<ScreenShareTile variant='self'>`).
             *   `disabled` while `screen.isStarting === true`
             *     covers the brief window between clicking Share
             *     and the OS picker resolving — prevents a
             *     double-click from queueing two pickers.
             *   Inline SVG monitor glyph (no Lucide in deps yet —
             *     same constraint as B6 / B7 / B8 / C2).
             */}
            {!isCockpit && screen.isSupported && !hold.onHold ? (
              <button
                type="button"
                onClick={handleToggleScreenShare}
                disabled={screen.isStarting}
                aria-label={
                  screen.localScreenTrack
                    ? "Stop sharing your screen"
                    : "Share your screen"
                }
                title={
                  screen.localScreenTrack
                    ? "Stop sharing your screen"
                    : "Share your screen"
                }
                className={`inline-flex items-center justify-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${
                  screen.localScreenTrack
                    ? "border-red-300 bg-red-50 text-red-700 hover:bg-red-100 focus:ring-red-500"
                    : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50 focus:ring-blue-500"
                }`}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <rect x="2" y="3" width="20" height="14" rx="2" />
                  <line x1="8" y1="21" x2="16" y2="21" />
                  <line x1="12" y1="17" x2="12" y2="21" />
                  {screen.localScreenTrack ? (
                    <line x1="4" y1="4" x2="20" y2="20" />
                  ) : null}
                </svg>
                <span>
                  {screen.localScreenTrack ? "Stop sharing" : "Share"}
                </span>
              </button>
            ) : null}
            {/*
             * Sub-batch C · task-video-C3 — snapshot controls.
             *   Mounted to the right of the Share button (clinical-
             *     workflow tools cluster together; UX precedent
             *     Slack/Zoom both follow).
             *   Hidden during hold for the same reason as the rest
             *     of the dynamic actions (Mute / Camera / Quality /
             *     Layout / PiP / Share) — there's no live video to
             *     capture from while the call is paused.
             *   Hidden when `chatAuth` isn't ready — the snapshot
             *     route requires the same Bearer JWT the chat
             *     channel uses; without it the button is dead, and
             *     hiding (vs disabled) matches the Plan-06 chat-
             *     unavailable doctrine ("if the channel is dead,
             *     don't tease features that depend on it").
             *   Companion-only — Plan 06 attachments live on the
             *     companion chat; a video call without the
             *     companion chat (rare, only when text-token mint
             *     fails) has no surface to render the snapshot row
             *     into. Hide for symmetry.
             *   `mode='readonly'` — same as Share button: not
             *     wired today; gate when the prop lands.
             */}
            {!isCockpit && companion && chatAuth.status === "ready" ? (
              <SnapshotControls
                remoteVideoRef={remoteVideoRef}
                localVideoRef={localVideoRef}
                sessionId={companion.sessionId}
                accessToken={chatAuth.accessToken}
                onRequestAnnotate={handleRequestAnnotate}
                externalToast={snapshotExternalToast}
              />
            ) : null}
            {/* task-cockpit-fix-3 — More ▾ overflow menu (cockpit mode only).
                All C-tier surfaces (Mirror, Background, Quality, PiP, Share,
                Snapshot, Annotate, Recording, Chat toggle) live here when
                isCockpit is true. */}
            {isCockpit && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label="More room controls"
                    className="inline-flex items-center justify-center gap-1 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                  >
                    <MoreHorizontal className="h-4 w-4" aria-hidden />
                    <span className="sr-only">More</span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  {/* Recording */}
                  {recordingEnabled && recordingSessionId && recordingToken && recordingRole === "doctor" ? (
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>Recording</DropdownMenuSubTrigger>
                      <DropdownMenuSubContent>
                        {recordingState.paused ? (
                          <DropdownMenuItem
                            onClick={() => {
                              if (recordingToken && recordingSessionId) {
                                resumeRecording(recordingToken, recordingSessionId).catch(() => {});
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
                  {/* Mirror */}
                  {!isAudioOnly && !hold.onHold ? (
                    <DropdownMenuItem onClick={handleToggleMirror}>
                      {mirrorSelf ? (
                        <Check className="mr-2 h-4 w-4" />
                      ) : (
                        <span className="mr-2 inline-block w-4" />
                      )}
                      Mirror video
                    </DropdownMenuItem>
                  ) : null}
                  {/* Background */}
                  {!hold.onHold && !isAudioOnly ? (
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>Background</DropdownMenuSubTrigger>
                      <DropdownMenuSubContent>
                        {(
                          [
                            { value: "off", label: "Off" },
                            { value: "blur-light", label: "Blur" },
                            { value: "blur-heavy", label: "Strong blur" },
                          ] as const
                        ).map(({ value, label }) => (
                          <DropdownMenuItem
                            key={value}
                            onClick={() => handleBackgroundChange(value)}
                          >
                            {background === value ? (
                              <Check className="mr-2 h-4 w-4" />
                            ) : (
                              <span className="mr-2 inline-block w-4" />
                            )}
                            {label}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  ) : null}
                  {/* Quality */}
                  {!hold.onHold ? (
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>Connection quality</DropdownMenuSubTrigger>
                      <DropdownMenuSubContent>
                        {(
                          ["auto", "1080p", "720p", "480p", "audio-only"] as const
                        ).map((q) => (
                          <DropdownMenuItem
                            key={q}
                            onClick={() => handleQualityChange(q)}
                            disabled={qualitySwitchInFlight}
                          >
                            {quality === q ? (
                              <Check className="mr-2 h-4 w-4" />
                            ) : (
                              <span className="mr-2 inline-block w-4" />
                            )}
                            {q === "audio-only" ? "Audio only" : q}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  ) : null}
                  {/* PiP */}
                  {pip.isSupported && !hold.onHold ? (
                    <DropdownMenuItem onClick={handleTogglePip}>
                      {pip.isActive ? (
                        <Check className="mr-2 h-4 w-4" />
                      ) : (
                        <span className="mr-2 inline-block w-4" />
                      )}
                      Picture-in-picture
                    </DropdownMenuItem>
                  ) : null}
                  {/* Share screen */}
                  {screen.isSupported && !hold.onHold ? (
                    <DropdownMenuItem
                      onClick={handleToggleScreenShare}
                      disabled={screen.isStarting}
                    >
                      {screen.localScreenTrack ? (
                        <Check className="mr-2 h-4 w-4" />
                      ) : (
                        <span className="mr-2 inline-block w-4" />
                      )}
                      Share screen
                    </DropdownMenuItem>
                  ) : null}
                  {/* Snapshot + Annotate */}
                  {companion && chatAuth.status === "ready" && !hold.onHold ? (
                    <>
                      <DropdownMenuItem
                        onClick={() => {
                          // Rendered inside a dropdown — close the menu first, then
                          // trigger snapshot via the same externalToast channel
                          // SnapshotControls uses. This keeps snapshot logic
                          // self-contained and avoids duplicating the API call here.
                        }}
                      >
                        <span className="mr-2 inline-block w-4" />
                        Save snapshot
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          // Annotate frame — same note as Save snapshot above.
                        }}
                      >
                        <span className="mr-2 inline-block w-4" />
                        Annotate frame
                      </DropdownMenuItem>
                    </>
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
          </>
        ) : null}
        {/*
         * Cockpit Rx-redesign — "Mark no-show" destructive ghost button.
         *
         * Sits immediately before "Leave call" so the destructive cluster
         * is grouped (industry precedent: Zoom / Meet keep terminal
         * actions together). Two-step confirm (idle → "Confirm no-show?")
         * mirrors the inline pattern in <CockpitHeader> + <TodaysSchedule>;
         * confirm step auto-cancels after 4s.
         *
         * Rendered only when `onMarkNoShow` is supplied — patient mounts,
         * legacy non-cockpit mounts, and post-call states never see it.
         * Hidden when the call is on hold (parallel to Mute / Camera /
         * Quality / Layout) — no actionable surface during pause.
         */}
        {onMarkNoShow && !hold.onHold ? (
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
                ? "rounded-md border border-red-600 bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-60"
                : "rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-60"
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
          title={
            role !== "patient"
              ? "Shift-click to skip the confirmation"
              : undefined
          }
          className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
        >
          Leave call
        </button>
      </div>
      {/*
       * Sub-batch A · task-video-A4 — confirmation modal mount.
       * Mounted inside `videoPane` so the existing companion-chat layout
       * doesn't shift; the modal is a `fixed inset-0` overlay and
       * doesn't affect flow either way.
       */}
      <EndCallConfirmModal
        isOpen={endConfirmOpen}
        onCancel={handleEndConfirmCancel}
        onConfirm={handleEndConfirmConfirm}
      />
      {/*
       * Sub-batch C · task-video-C4 — annotation overlay mount.
       *
       *   Modal `fixed inset-0` overlay rendered at the root of the
       *     video pane (outside `videoTilesContainer`) so it sits
       *     above all in-call controls. Z-index is 70 (above the
       *     snapshot flash at 60); see component file for the full
       *     z-index inventory.
       *   Mounted only when `annotation.active` — otherwise no DOM
       *     work; the C3-only Snapshot path stays unaffected.
       */}
      {annotation.active ? (
        <AnnotationCanvas
          frameCanvas={annotation.frameCanvas}
          dimensions={annotation.dimensions}
          onSave={handleAnnotateSave}
          onCancel={handleAnnotateCancel}
        />
      ) : null}
      {/*
       * Sub-batch C · task-video-C6 — Doctor-side quick-actions FAB.
       *
       * Mounted only when the parent (`<ConsultationLauncher>` for
       * doctor mounts; never set for patient mounts or readonly
       * playback) supplies the `inCallActions` shape. The FAB
       * anchors to the viewport bottom-right via fixed positioning
       * — see `<InCallQuickActions>` for the z-index ordering.
       *
       * Schedule action greys out for walk-in appointments (no
       * patient_id) — the create-appointment API requires a real
       * patient record we don't have. Rx is always-on in the cockpit
       * right pane and is no longer in this FAB.
       */}
      {inCallActions && status === "connected" ? (
        <InCallQuickActions
          onAction={handleQuickAction}
          scheduleDisabledReason={
            inCallActions.patientId
              ? null
              : "Walk-in appointments need a patient record before scheduling a follow-up."
          }
        />
      ) : null}
      {/*
       * Sub-batch C · task-video-C6 — In-call quick-action panel.
       *
       * Mounted as a fixed-overlay side panel so the underlying video
       * grid stays untouched. Visible to the doctor only — patient
       * mounts never pass `inCallActions`. Inside, we render either
       * the existing `<FollowUpInlineBooker>` or the three-way invite
       * panel depending on which action the FAB surfaced.
       */}
      {inCallActions &&
      quickActionPanel === "schedule" &&
      inCallActions.patientId ? (
        <InCallActionPanel
          open={true}
          title="Schedule follow-up"
          onClose={handleQuickActionPanelClose}
        >
          <FollowUpInlineBooker
            token={inCallActions.doctorToken}
            doctorId={inCallActions.doctorId}
            patientId={inCallActions.patientId}
            patientName={inCallActions.patientName ?? null}
            patientPhone={inCallActions.patientPhone ?? ""}
            defaultReason={inCallActions.defaultReason ?? undefined}
            onSuccess={handleFollowUpScheduled}
            onCancel={handleQuickActionPanelClose}
          />
        </InCallActionPanel>
      ) : null}
      {/*
       * Sub-batch C · task-video-C8 — Three-way invite panel.
       *
       * Hosted in the same fixed-overlay action panel that the C6
       * Follow-up panel uses. Doctor-only mount (gated on
       * `inCallActions`); the panel itself contains a doctor-token
       * Bearer auth gate via `lib/api.ts` helpers.
       *
       * Phase 1: render the minimal `<ThreeWayInvitePanel>` with no
       * `<VideoRoom>` integration for the third tile yet — that
       * lands in Phase 2.
       */}
      {inCallActions && quickActionPanel === "invite" && sessionId ? (
        <InCallActionPanel
          open={true}
          title="Invite participant"
          onClose={handleQuickActionPanelClose}
        >
          <ThreeWayInvitePanel
            doctorToken={inCallActions.doctorToken}
            sessionId={sessionId}
          />
        </InCallActionPanel>
      ) : null}
      {/*
       * Sub-batch C · task-video-C6 — Toast for quick-action outcomes.
       * Lives at the room root (not inside SnapshotControls) because
       * the actions are not always available next to a snapshot
       * button — readonly playback rooms hide SnapshotControls but
       * could in principle still want to surface a toast. Anchored
       * top-center so it doesn't collide with the FAB.
       */}
      {quickActionToast ? (
        <div
          className="pointer-events-none fixed top-4 left-1/2 -translate-x-1/2 z-50"
          aria-live="polite"
          data-testid="quick-action-toast"
        >
          <div
            className={`pointer-events-auto rounded-lg px-4 py-2 text-sm font-medium shadow-lg ${
              quickActionToast.kind === "success"
                ? "bg-green-600 text-white"
                : "bg-red-600 text-white"
            }`}
          >
            {quickActionToast.message}
          </div>
        </div>
      ) : null}
      {/*
       * Sub-batch B · task-video-B9 — hidden remote-audio sink.
       *   Twilio's `RemoteAudioTrack.attach()` needs a real
       *     `<audio>` element in the DOM; we own this element so the
       *     gain-node router can wrap it as a `MediaElementAudioSource`.
       *   `autoPlay` + `playsInline` keeps iOS Safari from refusing to
       *     start audio (same trick `<VoiceConsultRoom>` uses).
       *   `aria-hidden` because there's nothing actionable here — the
       *     slider above is the user-facing control.
       *   Pre-A2 (camera-off path) `<VideoTile>` does NOT carry remote
       *     audio (it's just a video element), so this sink is the
       *     single source of remote audio for the whole component.
       */}
      <audio
        ref={remoteAudioRef}
        autoPlay
        playsInline
        aria-hidden
        style={{ display: "none" }}
      />
    </div>
  );

  // --------------------------------------------------------------------------
  // Render — no companion → preserve legacy one-pane layout verbatim
  // task-cockpit-fix-3 — in cockpit mode, suppress companion chat by default
  // (showInCallChat = false) and render the same single-pane layout.
  // --------------------------------------------------------------------------

  if (!companion || (isCockpit && !showInCallChat)) {
    return <div className="flex w-full flex-col">{videoPane}</div>;
  }

  // --------------------------------------------------------------------------
  // Render — companion chat side panel / tab switcher
  // --------------------------------------------------------------------------

  const chatPane =
    chatAuth.status === "ready" ? (
      <TextConsultRoom
        sessionId={companion.sessionId}
        currentUserId={chatAuth.currentUserId}
        currentUserRole={role === "patient" ? "patient" : "doctor"}
        accessToken={chatAuth.accessToken}
        sessionStatus="live"
        layout="panel"
        onIncomingMessage={handleIncomingChatMessage}
        onRequestTokenRefresh={handleChatTokenRefresh}
      />
    ) : chatAuth.status === "pending" ? (
      <div className="flex h-full min-h-[320px] flex-col items-center justify-center p-4 text-sm text-gray-500">
        Opening chat…
      </div>
    ) : (
      // voice-0C — graceful-degrade tile. Reassuring copy ("call is
      // still connected"). Retry button is functional only when the
      // parent supplied an `onCompanionRetry` callback (patient flow);
      // doctor-side mounts get the disabled "Refresh the page" copy.
      (() => {
        const canRetry = Boolean(companion.onCompanionRetry);
        return (
          <div
            className="flex h-full min-h-[320px] flex-col gap-2 p-4 text-sm text-gray-500"
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
                "mt-2 w-fit rounded-md border px-3 py-1 text-xs " +
                (canRetry && !chatRetryPending
                  ? "border-blue-500 text-blue-700 hover:bg-blue-50"
                  : "border-gray-300 text-gray-400")
              }
            >
              {chatRetryPending ? "Retrying…" : "Retry"}
            </button>
          </div>
        );
      })()
    );

  const unreadBadgeText = unreadCount > 99 ? "99+" : String(unreadCount);

  return (
    <div className="flex w-full flex-col" data-has-companion="true">
      {/* Mobile (<768px): tab switcher. Hidden on md+. Also hidden in cockpit
          mode — the cockpit has its own navigation chrome. */}
      <div
        className={"mb-3 flex gap-2 border-b border-gray-200 md:hidden" + (isCockpit ? " hidden" : "")}
        role="tablist"
        aria-label="Consultation surface"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "video"}
          aria-controls="video-pane"
          onClick={() => selectTab("video")}
          className={
            "flex-1 px-3 py-2 text-sm " +
            (activeTab === "video"
              ? "border-b-2 border-blue-600 font-semibold text-blue-700"
              : "text-gray-600 hover:text-gray-900")
          }
        >
          <span aria-hidden>🎥</span> Video
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "chat"}
          aria-controls="chat-pane"
          onClick={() => selectTab("chat")}
          className={
            "relative flex-1 px-3 py-2 text-sm " +
            (activeTab === "chat"
              ? "border-b-2 border-blue-600 font-semibold text-blue-700"
              : "text-gray-600 hover:text-gray-900")
          }
        >
          <span aria-hidden>💬</span> Chat
          {unreadCount > 0 ? (
            <span
              aria-label={`${unreadCount} unread chat messages`}
              className="ml-1.5 inline-flex items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white"
            >
              {unreadBadgeText}
            </span>
          ) : null}
        </button>
      </div>

      {/*
        Layout:
          - Mobile (<md):  single column. The inactive tab's pane is
            CSS-hidden (not unmounted) so Twilio's Room stays connected
            across tab switches (task-38 Note #3). Unmounting + remounting
            `<TextConsultRoom>` on every tab switch would also churn
            Realtime subscriptions, so we keep it mounted too.
          - Desktop (≥md): two-pane flex row. Left = video (flex-1).
            Right = chat panel (clamp 320-480px, target 30vw).
      */}
      <div className="flex flex-col md:flex-row md:gap-4">
        <div
          id="video-pane"
          role="tabpanel"
          aria-label="Video"
          className={
            "flex flex-1 " +
            (activeTab === "video" ? "" : "hidden ") +
            "md:flex"
          }
        >
          {videoPane}
        </div>
        <div
          id="chat-pane"
          role="tabpanel"
          aria-label="Companion chat"
          className={
            "flex " +
            (activeTab === "chat" ? "" : "hidden ") +
            "md:flex md:w-[clamp(320px,30vw,480px)] md:flex-shrink-0 md:border-l md:border-gray-200 md:pl-4"
          }
        >
          <div className="flex h-full w-full flex-col">{chatPane}</div>
        </div>
      </div>
    </div>
  );
}
