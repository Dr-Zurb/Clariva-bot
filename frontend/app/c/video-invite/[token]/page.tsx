"use client";

/**
 * Sub-batch C · task-video-C8 — Extra-participant invite entry page.
 *
 * URL shape: `/c/video-invite/[token]`
 *
 * Phase 1 scope (per execution-time scope decision):
 *   - Exchange the invite token via the public
 *     `POST /api/v1/consultation/extra-participant-exchange` endpoint.
 *   - Hold the resulting JWT + Twilio token + roomName in memory ONLY
 *     (never written to the URL or localStorage — the token is
 *     short-lived and a leaked invite tab should NOT survive a copy/
 *     paste of the URL).
 *   - Render a minimal "lobby" with the participant's name + role
 *     label + a "Join the call" button.
 *   - On Join, call `twilio-video.connect()` directly and render the
 *     local self-view + remote tiles (doctor + patient + any other
 *     extras). No companion chat in Phase 1 — that needs the JWT to
 *     be threaded into a `<TextConsultRoom mode="readonly">` and the
 *     companion chat panel UX is deferred to Phase 2.
 *   - On unmount / Leave, call `recordExtraParticipantLeft()` so the
 *     server stamps `left_at` and emits the `participant_left`
 *     banner on the chat (visible to doctor + patient).
 *
 * Threat model:
 *   - The URL token is a 192-bit base64url string. Single-shot — the
 *     server rejects re-exchange after `joined_at` is set, so a
 *     leaked URL after first use is dead.
 *   - The exchanged JWT lives in-memory only. A page reload kills
 *     the call and the doctor must re-invite.
 *
 * Lifecycle phases:
 *   1. `loading`     — running the token exchange.
 *   2. `lobby`       — exchange done; participant clicks "Join".
 *   3. `connecting`  — twilio-video.connect() in flight.
 *   4. `connected`   — local + remote tiles rendering.
 *   5. `error`       — exchange / connect failed; render CTA.
 *   6. `left`        — participant left voluntarily.
 *
 * Phase 2 will replace this minimal page with a proper
 * `<VideoRoom mode="extra_participant">` mount that reuses the full
 * tile pipeline + companion chat. This page is intentionally
 * standalone so Phase 2 can swap it without touching the route shape.
 *
 * @see backend/src/services/consultation-extra-participant-service.ts
 * @see frontend/lib/api.ts (exchangeExtraParticipantInvite, recordExtraParticipantLeft)
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import {
  connect,
  createLocalTracks,
  type LocalAudioTrack,
  type LocalTrack,
  type LocalVideoTrack,
  type RemoteParticipant,
  type Room,
} from "twilio-video";
import {
  exchangeExtraParticipantInvite,
  recordExtraParticipantLeft,
  type ExchangeExtraParticipantResult,
} from "@/lib/api";

interface PageState {
  phase:
    | "loading"
    | "lobby"
    | "connecting"
    | "connected"
    | "error"
    | "left";
  errorMessage?: string;
  exchange?: ExchangeExtraParticipantResult;
}

export default function VideoInvitePage() {
  const params = useParams();
  const tokenParam = params?.token;
  const inviteToken = typeof tokenParam === "string" ? tokenParam : "";

  const [state, setState] = useState<PageState>({ phase: "loading" });
  const [remoteParticipants, setRemoteParticipants] = useState<
    Map<string, RemoteParticipant>
  >(() => new Map());
  const roomRef = useRef<Room | null>(null);
  const localContainerRef = useRef<HTMLDivElement | null>(null);
  const remoteContainerRef = useRef<HTMLDivElement | null>(null);
  const localTracksRef = useRef<LocalTrack[]>([]);

  // ---------------------------------------------------------------
  // Token exchange (mount-once)
  // ---------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    if (!inviteToken) {
      setState({
        phase: "error",
        errorMessage: "Missing invite token in URL.",
      });
      return;
    }
    void (async () => {
      try {
        const res = await exchangeExtraParticipantInvite(inviteToken);
        if (cancelled) return;
        setState({ phase: "lobby", exchange: res.data });
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof Error ? err.message : "Could not validate invite.";
        setState({ phase: "error", errorMessage: message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [inviteToken]);

  // ---------------------------------------------------------------
  // Connect to the Twilio room — kicked off by the user clicking Join.
  // ---------------------------------------------------------------
  const handleJoin = useCallback(async () => {
    const exchange = state.exchange;
    if (!exchange) return;
    if (!exchange.twilioToken || !exchange.roomName) {
      setState((prev) => ({
        ...prev,
        phase: "error",
        errorMessage:
          "Video is not configured for this session. Ask the doctor to fall back to phone.",
      }));
      return;
    }
    setState((prev) => ({ ...prev, phase: "connecting" }));

    let tracks: LocalTrack[] = [];
    let room: Room | null = null;
    try {
      tracks = await createLocalTracks({ audio: true, video: true });
      localTracksRef.current = tracks;
      room = await connect(exchange.twilioToken, {
        name: exchange.roomName,
        tracks,
      });
      roomRef.current = room;

      // Initial set of remote participants already in the room.
      setRemoteParticipants(new Map(room.participants));

      room.on("participantConnected", (p: RemoteParticipant) => {
        setRemoteParticipants((prev) => {
          const next = new Map(prev);
          next.set(p.sid, p);
          return next;
        });
      });
      room.on("participantDisconnected", (p: RemoteParticipant) => {
        setRemoteParticipants((prev) => {
          const next = new Map(prev);
          next.delete(p.sid);
          return next;
        });
      });
      room.on("disconnected", () => {
        setState((prev) => ({ ...prev, phase: "left" }));
      });

      // Attach local video into our self-view container.
      const videoTrack = tracks.find(
        (t): t is LocalVideoTrack => t.kind === "video",
      );
      if (videoTrack && localContainerRef.current) {
        localContainerRef.current.innerHTML = "";
        localContainerRef.current.appendChild(videoTrack.attach());
      }

      setState((prev) => ({ ...prev, phase: "connected" }));
    } catch (err) {
      tracks.forEach((t) => {
        if (t.kind === "audio" || t.kind === "video") {
          (t as LocalAudioTrack | LocalVideoTrack).stop();
        }
      });
      localTracksRef.current = [];
      const message =
        err instanceof Error
          ? err.message
          : "Could not connect to the video room.";
      setState((prev) => ({
        ...prev,
        phase: "error",
        errorMessage: message,
      }));
    }
  }, [state.exchange]);

  // ---------------------------------------------------------------
  // Render remote participants when the map changes.
  // ---------------------------------------------------------------
  useEffect(() => {
    const container = remoteContainerRef.current;
    if (!container) return;
    container.innerHTML = "";
    remoteParticipants.forEach((p) => {
      const wrapper = document.createElement("div");
      wrapper.className =
        "relative aspect-video w-full overflow-hidden rounded-md border border-gray-700 bg-black";
      const label = document.createElement("div");
      label.className =
        "absolute bottom-1 left-1 rounded bg-black/60 px-2 py-0.5 text-xs text-white";
      label.textContent = p.identity;
      wrapper.appendChild(label);
      p.tracks.forEach((pub) => {
        if (pub.track && (pub.track.kind === "audio" || pub.track.kind === "video")) {
          wrapper.appendChild(pub.track.attach());
        }
      });
      p.on("trackSubscribed", (track) => {
        if (track.kind === "audio" || track.kind === "video") {
          wrapper.appendChild(track.attach());
        }
      });
      container.appendChild(wrapper);
    });
  }, [remoteParticipants]);

  // ---------------------------------------------------------------
  // Leave handler — disconnect the room + tell the server.
  // ---------------------------------------------------------------
  const handleLeave = useCallback(async () => {
    const room = roomRef.current;
    if (room) {
      room.disconnect();
      roomRef.current = null;
    }
    localTracksRef.current.forEach((t) => {
      if (t.kind === "audio" || t.kind === "video") {
        (t as LocalAudioTrack | LocalVideoTrack).stop();
      }
    });
    localTracksRef.current = [];
    setState((prev) => ({ ...prev, phase: "left" }));
    if (state.exchange?.jwt) {
      try {
        await recordExtraParticipantLeft(state.exchange.jwt);
      } catch {
        // Best-effort — server still has join_at; doctor can revoke
        // manually if the leave webhook fails.
      }
    }
  }, [state.exchange?.jwt]);

  // ---------------------------------------------------------------
  // Cleanup on unmount.
  // ---------------------------------------------------------------
  useEffect(() => {
    return () => {
      const room = roomRef.current;
      if (room) {
        room.disconnect();
        roomRef.current = null;
      }
      localTracksRef.current.forEach((t) => {
        if (t.kind === "audio" || t.kind === "video") {
          (t as LocalAudioTrack | LocalVideoTrack).stop();
        }
      });
      localTracksRef.current = [];
    };
  }, []);

  // ---------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------
  if (state.phase === "loading") {
    return (
      <Shell title="Joining the consultation…">
        <p className="text-sm text-gray-500">Validating your invite…</p>
      </Shell>
    );
  }

  if (state.phase === "error") {
    return (
      <Shell title="We couldn't validate that invite">
        <p className="text-sm text-red-600">{state.errorMessage}</p>
        <p className="mt-3 text-xs text-gray-500">
          Ask the doctor to send you a fresh invite link.
        </p>
      </Shell>
    );
  }

  if (state.phase === "left") {
    return (
      <Shell title="You've left the call">
        <p className="text-sm text-gray-700">
          Thanks for joining. You can close this tab.
        </p>
      </Shell>
    );
  }

  if (state.phase === "lobby") {
    const exchange = state.exchange!;
    return (
      <Shell title="Ready to join">
        <p className="text-sm text-gray-800">
          You&apos;re joining as{" "}
          <strong>{exchange.displayName}</strong>
          {exchange.roleLabel ? (
            <>
              {" "}
              (<em>{exchange.roleLabel}</em>)
            </>
          ) : null}
          .
        </p>
        <p className="mt-2 text-xs text-gray-500">
          You&apos;ll have read access to the doctor + patient chat for the
          rest of this call. You won&apos;t be able to see anything from
          before you joined.
        </p>
        <button
          type="button"
          onClick={() => void handleJoin()}
          className="mt-4 w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          Join the call
        </button>
      </Shell>
    );
  }

  // connecting | connected
  return (
    <Shell title="In the consultation">
      {state.phase === "connecting" && (
        <p className="text-sm text-gray-500">Connecting to the room…</p>
      )}
      {state.phase === "connected" && (
        <p className="text-xs text-emerald-700">
          Connected. The doctor and patient can see and hear you.
        </p>
      )}

      <div className="mt-3 grid gap-3">
        <div
          ref={remoteContainerRef}
          className="grid grid-cols-1 gap-2 md:grid-cols-2"
        />
        <div className="relative aspect-video w-full max-w-xs self-center overflow-hidden rounded-md border border-gray-700 bg-black">
          <div
            ref={localContainerRef}
            className="absolute inset-0 [&>video]:h-full [&>video]:w-full [&>video]:object-cover"
          />
          <div className="absolute bottom-1 left-1 rounded bg-black/60 px-2 py-0.5 text-xs text-white">
            You
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => void handleLeave()}
        className="mt-4 w-full rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
      >
        Leave the call
      </button>
    </Shell>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-3 px-4 py-8">
      <h1 className="text-lg font-semibold text-gray-900">{title}</h1>
      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        {children}
      </div>
    </main>
  );
}
