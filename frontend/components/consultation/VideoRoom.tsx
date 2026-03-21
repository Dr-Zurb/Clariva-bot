"use client";

import { useEffect, useRef, useState } from "react";
import { connect, createLocalTracks, type Room } from "twilio-video";

interface VideoRoomProps {
  accessToken: string;
  roomName: string;
  onDisconnect?: () => void;
}

/**
 * Twilio Video room component. Connects with token, shows local + remote video.
 * @see e-task-6; twilio-video SDK
 */
export default function VideoRoom({
  accessToken,
  roomName,
  onDisconnect,
}: VideoRoomProps) {
  const [status, setStatus] = useState<"connecting" | "connected" | "disconnected" | "error">(
    "connecting"
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const roomRef = useRef<Room | null>(null);

  useEffect(() => {
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
      roomRef.current = null;
    };

    const connectRoom = async () => {
      try {
        localTracks = await createLocalTracks({ audio: true, video: { width: 640, height: 480 } });
        if (localVideoRef.current && localTracks.find((t) => t.kind === "video")) {
          const videoTrack = localTracks.find((t) => t.kind === "video");
          if (videoTrack) videoTrack.attach(localVideoRef.current);
        }

        room = await connect(accessToken, {
          name: roomName,
          tracks: localTracks,
        });
        roomRef.current = room;
        setStatus("connected");

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
          setStatus("disconnected");
          onDisconnect?.();
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
  }, [accessToken, roomName, onDisconnect]);

  const handleLeave = () => {
    if (roomRef.current) {
      roomRef.current.disconnect();
      onDisconnect?.();
    }
  };

  if (status === "connecting") {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 text-center">
        <p className="text-gray-600">Connecting to video room…</p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <p className="font-medium text-red-800">Connection failed</p>
        <p className="mt-1 text-sm text-red-700">{errorMessage}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <p className="mb-2 text-sm font-medium text-gray-500">You</p>
          <video
            ref={localVideoRef}
            autoPlay
            muted
            playsInline
            className="w-full rounded-lg border border-gray-200 bg-gray-900 aspect-video object-cover"
          />
        </div>
        <div>
          <p className="mb-2 text-sm font-medium text-gray-500">Patient</p>
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="w-full rounded-lg border border-gray-200 bg-gray-900 aspect-video object-cover"
          />
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
