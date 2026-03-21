"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { getConsultationTokenForPatient } from "@/lib/api";
import VideoRoom from "@/components/consultation/VideoRoom";

function ConsultJoinContent() {
  const searchParams = useSearchParams();
  const token = searchParams?.get("token") ?? "";

  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [videoData, setVideoData] = useState<{
    accessToken: string;
    roomName: string;
  } | null>(null);

  useEffect(() => {
    if (!token || token.length < 10) {
      setStatus("error");
      setErrorMessage("Invalid or missing link. Please use the link shared by your doctor.");
      return;
    }

    const fetchToken = async () => {
      try {
        const res = await getConsultationTokenForPatient(token);
        setVideoData({
          accessToken: res.data.token,
          roomName: res.data.roomName,
        });
        setStatus("ready");
      } catch (err) {
        setStatus("error");
        const msg = err instanceof Error ? err.message : "Request failed";
        if (msg.toLowerCase().includes("expired")) {
          setErrorMessage("This link has expired. Please ask your doctor for a new link.");
        } else {
          setErrorMessage("Link expired or invalid. Please use the link shared by your doctor.");
        }
      }
    };

    fetchToken();
  }, [token]);

  if (status === "loading") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-4">
        <p className="text-gray-600">Connecting to your video consultation…</p>
      </div>
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

  if (!videoData) return null;

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-4 text-center text-xl font-semibold text-gray-900">
          Video Consultation
        </h1>
        <VideoRoom
          accessToken={videoData.accessToken}
          roomName={videoData.roomName}
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
