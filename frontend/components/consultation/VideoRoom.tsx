"use client";

import { useEffect, useRef, useState } from "react";
import { connect, createLocalTracks, type Room } from "twilio-video";

interface VideoRoomProps {
  accessToken: string;
  roomName: string;
  onDisconnect?: () => void;
  /** When "patient", remote label is "Doctor" from the start (no transition). Omit to derive from room identity. */
  role?: "doctor" | "patient";
}

/**
 * Twilio Video room component. Connects with token, shows local + remote video.
 * @see e-task-6; twilio-video SDK
 */
export default function VideoRoom({
  accessToken,
  roomName,
  onDisconnect,
  role,
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

        // Derive remote label from identity only when role not provided (patient page passes role="patient" for immediate "Doctor" label)
        if (!role) {
          const identity = room.localParticipant.identity;
          setRemoteLabel(identity.startsWith("patient-") ? "Doctor" : "Patient");
        }
        setStatus("connected");

        // Attach local video (element exists because we always render the grid)
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

  // Backup: attach local video when ref becomes available (handles ref timing)
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

    // Stop and detach local tracks immediately (stops camera, clears video)
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

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
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
        className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
      >
        Leave call
      </button>
    </div>
  );
}
