"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { connect, createLocalTracks, type Room } from "twilio-video";
import { SessionStartBanner } from "./SessionStartBanner";
import TextConsultRoom, { type IncomingMessageMeta } from "./TextConsultRoom";
import RecordingPausedIndicator from "./RecordingPausedIndicator";
import RecordingControls from "./RecordingControls";
import VideoEscalationButton from "./VideoEscalationButton";
import VideoConsentModal from "./VideoConsentModal";
import VideoRecordingIndicator from "./VideoRecordingIndicator";
import { createClient } from "@/lib/supabase/client";
import { useRecordingState } from "@/hooks/useRecordingState";
import { useVideoEscalationState } from "@/hooks/useVideoEscalationState";

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
}

/**
 * Twilio Video room component. Connects with token, shows local + remote video.
 *
 * Plan 06 · Task 38 extends this into a two-pane layout (desktop) / tab
 * switcher (mobile) when the `companion` prop is present, mounting
 * `<TextConsultRoom layout='panel'>` alongside the video tiles.
 *
 * @see e-task-6; twilio-video SDK
 * @see docs/Development/Daily-plans/April 2026/19-04-2026/Tasks/task-38-video-room-companion-chat-panel.md
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
}: VideoRoomProps) {
  const [status, setStatus] = useState<"connecting" | "connected" | "disconnected" | "error">(
    "connecting"
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [remoteLabel, setRemoteLabel] = useState<"Doctor" | "Patient">(
    role === "patient" ? "Doctor" : "Patient"
  );
  const onDisconnectRef = useRef(onDisconnect);
  onDisconnectRef.current = onDisconnect;
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const roomRef = useRef<Room | null>(null);
  const localTracksRef = useRef<Awaited<ReturnType<typeof createLocalTracks>>>([]);
  const hasNotifiedDisconnectRef = useRef(false);
  const hasDisconnectedRef = useRef(false);

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
   * Doctor-side Supabase session — fetched once on mount when `companion`
   * is set. Gates the chat-panel mount: we need the doctor's
   * `auth.uid()` (= `currentUserId` on `<TextConsultRoom>`) and their
   * dashboard JWT (= `accessToken`) for the doctor-branch RLS predicate
   * (migration 051's `auth.uid() = doctor_id`). Patient-side mounts of
   * `<VideoRoom>` with `companion` aren't a v1 surface (the patient
   * joins video via the existing Twilio URL; their chat comes through
   * the separate `/c/text/[sessionId]` page), so we treat "no Supabase
   * session" as "chat unavailable" rather than silently mounting the
   * panel with anonymous claims.
   */
  const [chatAuth, setChatAuth] = useState<
    | { status: "pending" }
    | { status: "ready"; accessToken: string; currentUserId: string }
    | { status: "unavailable"; reason: string }
  >({ status: "pending" });

  useEffect(() => {
    if (!companion) return;
    let cancelled = false;
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
  }, []);

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

    let room: Room | null = null;
    let localTracks: Awaited<ReturnType<typeof createLocalTracks>> = [];

    const cleanup = async () => {
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
    };

    const connectRoom = async () => {
      try {
        localTracks = await createLocalTracks({ audio: true, video: { width: 640, height: 480 } });
        localTracksRef.current = localTracks;

        room = await connect(accessToken, {
          name: roomName,
          tracks: localTracks,
        });
        roomRef.current = room;

        if (!role) {
          const identity = room.localParticipant.identity;
          setRemoteLabel(identity.startsWith("patient-") ? "Doctor" : "Patient");
        }
        setStatus("connected");

        const videoTrack = localTracks.find((t) => t.kind === "video");
        if (videoTrack && localVideoRef.current) {
          videoTrack.attach(localVideoRef.current);
        }

        room.on("participantConnected", (participant) => {
          participant.tracks.forEach((publication) => {
            if (publication.track && publication.track.kind === "video" && remoteVideoRef.current) {
              publication.track.attach(remoteVideoRef.current);
            }
          });
          participant.on("trackSubscribed", (track) => {
            if (track.kind === "video" && remoteVideoRef.current) {
              track.attach(remoteVideoRef.current);
            }
          });
        });

        room.participants.forEach((participant) => {
          participant.tracks.forEach((publication) => {
            if (publication.track && publication.track.kind === "video" && remoteVideoRef.current) {
              publication.track.attach(remoteVideoRef.current);
            }
          });
          participant.on("trackSubscribed", (track) => {
            if (track.kind === "video" && remoteVideoRef.current) {
              track.attach(remoteVideoRef.current);
            }
          });
        });

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
        setErrorMessage(err instanceof Error ? err.message : "Failed to connect");
      }
    };

    connectRoom();
    return () => {
      cleanup();
    };
  }, [accessToken, roomName, role]);

  useEffect(() => {
    if (status !== "connected") return;
    const videoTrack = localTracksRef.current.find((t) => t.kind === "video");
    if (videoTrack && localVideoRef.current) {
      videoTrack.attach(localVideoRef.current);
    }
  }, [status]);

  const handleLeave = () => {
    hasDisconnectedRef.current = true;
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

    setStatus("disconnected");
    if (!hasNotifiedDisconnectRef.current) {
      hasNotifiedDisconnectRef.current = true;
      onDisconnectRef.current?.();
    }
  };

  if (status === "error") {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <p className="font-medium text-red-800">Connection failed</p>
        <p className="mt-1 text-sm text-red-700">{errorMessage}</p>
      </div>
    );
  }

  if (status === "disconnected") {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 text-center">
        <p className="font-medium text-gray-800">Call ended</p>
        <p className="mt-1 text-sm text-gray-600">You have left the video consultation.</p>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // Render — video pane
  // --------------------------------------------------------------------------

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
      <div className="relative grid gap-4 md:grid-cols-2">
        {recordingEnabled ? (
          <VideoRecordingIndicator
            isActive={isVideoRecordingActive}
            viewerRole={recordingRole}
            sessionId={recordingSessionId ?? null}
            token={recordingToken ?? null}
            className="absolute right-3 top-3 z-20"
          />
        ) : null}
        <div className="relative">
          <p className="mb-2 text-sm font-medium text-gray-500">You</p>
          <video
            ref={localVideoRef}
            autoPlay
            muted
            playsInline
            className="w-full rounded-lg border border-gray-200 bg-gray-900 aspect-video object-cover"
          />
          {status === "connecting" && (
            <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-gray-900/80">
              <p className="text-sm text-white">Starting camera…</p>
            </div>
          )}
        </div>
        <div>
          <p className="mb-2 text-sm font-medium text-gray-500">{remoteLabel}</p>
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="w-full rounded-lg border border-gray-200 bg-gray-900 aspect-video object-cover"
          />
          {status === "connecting" && (
            <p className="mt-1 text-xs text-gray-400">Waiting for {remoteLabel.toLowerCase()}…</p>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={handleLeave}
        className="self-start rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
      >
        Leave call
      </button>
    </div>
  );

  // --------------------------------------------------------------------------
  // Render — no companion → preserve legacy one-pane layout verbatim
  // --------------------------------------------------------------------------

  if (!companion) {
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
      <div className="flex h-full min-h-[320px] flex-col gap-2 p-4 text-sm text-gray-500">
        <p className="font-medium text-gray-700">Chat unavailable</p>
        <p className="text-xs">{chatAuth.reason}</p>
        <button
          type="button"
          aria-disabled="true"
          disabled
          title="Coming soon — refresh the page to retry."
          className="mt-2 w-fit rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-400"
        >
          Retry
        </button>
      </div>
    );

  const unreadBadgeText = unreadCount > 99 ? "99+" : String(unreadCount);

  return (
    <div className="flex w-full flex-col" data-has-companion="true">
      {/* Mobile (<768px): tab switcher. Hidden on md+. */}
      <div
        className="mb-3 flex gap-2 border-b border-gray-200 md:hidden"
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
