"use client";

/**
 * Patient-facing replay route (Plan 07 · Task 29 · Decision 4 + 10 LOCKED).
 *
 * URL shape: `/c/replay/[sessionId]?t=<HMAC-consultation-token>`
 *
 * Flow:
 *   1. Read `sessionId` + `?t=` from the URL.
 *   2. Exchange the HMAC for a 15-min patient-scoped Supabase JWT via
 *      `POST /api/v1/consultation/:sessionId/replay-token`.
 *   3. Strip `?t=` from the URL (same hygiene as `/c/voice/*`).
 *   4. Mount `<ConsultArtifactsPanel callerRole="patient">` with the
 *      scoped token.
 *
 * The HMAC consultation-token IS the proof of authority — it's bound
 * to the appointment ID and only the patient who booked the appointment
 * has it (delivered by SMS / IG DM / email link from the consult-ready
 * notification). No login wall. No Supabase auth UI. The replay
 * auto-locks 15 minutes after exchange; if the patient is mid-listen
 * when that happens, the player will silently re-mint via the same
 * scoped JWT… until the JWT itself expires, at which point a refresh
 * is needed (we surface a friendly "session expired, refresh the page"
 * empty state below).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";

import ConsultArtifactsPanel from "@/components/consultation/ConsultArtifactsPanel";
import {
  exchangeReplayToken,
  type ReplayTokenExchangeData,
} from "@/lib/api";

type Phase =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; token: string; expiresAt: string };

const TOKEN_EXPIRY_BUFFER_MS = 30_000;

export default function PatientReplayPage(): JSX.Element {
  const params = useParams<{ sessionId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();

  const sessionId = (params?.sessionId ?? "").toString();
  const initialUrlToken = searchParams?.get("t") ?? "";
  const urlTokenRef = useRef<string>(initialUrlToken);

  const [phase, setPhase] = useState<Phase>({ kind: "loading" });

  const exchange = useCallback(async (): Promise<ReplayTokenExchangeData | null> => {
    const urlToken = urlTokenRef.current;
    if (!sessionId || !urlToken) {
      setPhase({
        kind: "error",
        message:
          "This link is invalid or expired. Please ask the clinic to send a fresh replay link.",
      });
      return null;
    }
    try {
      const res = await exchangeReplayToken(sessionId, urlToken);
      return res.data;
    } catch (err) {
      const status = (err as { status?: number }).status;
      const message =
        status === 401 || status === 403
          ? "This replay link is invalid or expired. Please ask the clinic to send a fresh one."
          : status === 404
            ? "We couldn't find this consult. Please ask the clinic to send a fresh replay link."
            : "Something went wrong opening the replay. Please try again in a moment.";
      setPhase({ kind: "error", message });
      return null;
    }
  }, [sessionId]);

  // Mount: do the exchange + strip `?t=` from the URL.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const data = await exchange();
      if (cancelled || !data) return;
      try {
        router.replace(`/c/replay/${sessionId}`);
      } catch {
        // best-effort
      }
      setPhase({ kind: "ready", token: data.token, expiresAt: data.expiresAt });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // Refresh the scoped JWT before it expires so an active listening
  // session doesn't get cut off mid-stream. The HMAC URL token is
  // re-usable on the backend for the same appointment until its own
  // (longer) TTL expires.
  useEffect(() => {
    if (phase.kind !== "ready") return;
    const expiresAtMs = new Date(phase.expiresAt).getTime();
    const refreshAtMs = expiresAtMs - TOKEN_EXPIRY_BUFFER_MS;
    const delay = Math.max(refreshAtMs - Date.now(), 60_000);
    const timer = setTimeout(() => {
      void (async () => {
        const data = await exchange();
        if (!data) return;
        setPhase({
          kind: "ready",
          token: data.token,
          expiresAt: data.expiresAt,
        });
      })();
    }, delay);
    return () => clearTimeout(timer);
  }, [phase, exchange]);

  if (phase.kind === "loading") {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-gray-50 px-4">
        <p className="text-sm text-gray-600">Opening your recording…</p>
      </main>
    );
  }

  if (phase.kind === "error") {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-gray-50 px-4">
        <div className="max-w-sm rounded-lg border border-red-200 bg-white p-6 text-center shadow-sm">
          <h1 className="text-base font-semibold text-gray-900">
            Can&apos;t open this replay
          </h1>
          <p className="mt-2 text-sm text-gray-600">{phase.message}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] bg-gray-50 px-3 py-6 sm:px-6">
      <div className="mx-auto max-w-2xl">
        <header className="mb-4">
          <h1 className="text-xl font-semibold text-gray-900">
            Your consult recording
          </h1>
          <p className="mt-1 text-xs text-gray-500">
            Stream-only · do not share. Every play is logged for clinical
            compliance.
          </p>
        </header>

        <ConsultArtifactsPanel
          sessionId={sessionId}
          token={phase.token}
          callerRole="patient"
          callerLabel="Patient"
        />
      </div>
    </main>
  );
}
