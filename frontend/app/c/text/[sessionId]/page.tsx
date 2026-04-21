"use client";

/**
 * Patient-facing text consultation route (Plan 04 · Task 19).
 *
 * URL shape: `/c/text/[sessionId]?t=<HMAC-consultation-token>`
 *
 * **Threat model:** the URL token MAY end up in browser history,
 * referrer headers, link previews, or be shoulder-surfed. The Supabase
 * JWT we mint NEVER appears in a URL — only in memory + (briefly) the
 * Authorization header on the wire. The HMAC consultation-token is
 * single-use-by-convention (the backend re-mints fresh JWTs on each
 * exchange call, so the URL token can be re-presented for refresh, but
 * it can't be used to read past messages directly — the migration-052
 * RLS keys on the JWT, not the HMAC token).
 *
 * **Unauthenticated route.** This page is publicly accessible — bot
 * patients have no Supabase auth session. The `frontend/middleware.ts`
 * matcher only gates `/dashboard/*`, so `/c/*` falls through naturally.
 * If middleware ever expands its matcher, an explicit allowlist for
 * `/c/text/*` must be added — document this in any matcher change PR.
 *
 * **Lifecycle states the page handles:**
 *   1. Missing/invalid `?t=` → render error CTA, no API call.
 *   2. Backend rejects token (401 / NotFound) → render error CTA.
 *   3. `sessionStatus === 'scheduled'` → render holding screen, poll
 *      every 30s until status flips to `'live'`.
 *   4. `sessionStatus === 'live'` → mount `<TextConsultRoom>`.
 *   5. `sessionStatus in ('ended', 'cancelled', 'no_show')` → render
 *      end-state notice. Plan 07 will add the chat-history link.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import {
  requestTextSessionToken,
  type TextConsultSessionStatus,
  type TextConsultTokenExchangeData,
} from "@/lib/api";
import TextConsultRoom from "@/components/consultation/TextConsultRoom";

const SCHEDULED_POLL_MS = 30_000;

interface PageState {
  phase: "loading" | "error" | "holding" | "live" | "ended";
  errorMessage?: string;
  data?: TextConsultTokenExchangeData;
}

function endStateMessage(status: TextConsultSessionStatus): string {
  switch (status) {
    case "ended":
      return "This consult has ended. Your doctor will share next steps with you separately.";
    case "cancelled":
      return "This consult was cancelled. Please contact the clinic to reschedule.";
    case "no_show":
      return "This consult was marked as a no-show. Please contact the clinic to reschedule.";
    default:
      return "This consult is no longer active.";
  }
}

function formatScheduledTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString([], {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function PatientTextConsultPage() {
  const params = useParams<{ sessionId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();

  const sessionId = (params?.sessionId ?? "").toString();
  // Initial token from URL — captured into a ref so we can re-use it for
  // JWT refresh later without depending on the (already-stripped) URL.
  const initialUrlToken = searchParams?.get("t") ?? "";
  const urlTokenRef = useRef<string>(initialUrlToken);

  const [state, setState] = useState<PageState>({ phase: "loading" });

  /**
   * Single source of truth for "go talk to the backend, mint a fresh
   * JWT, update local state". Called on mount, on holding-screen poll,
   * and on JWT refresh from `<TextConsultRoom>`.
   */
  const exchange = useCallback(async (): Promise<TextConsultTokenExchangeData | null> => {
    const token = urlTokenRef.current;
    if (!sessionId || !token) {
      setState({
        phase: "error",
        errorMessage:
          "This link is invalid or expired. Please ask your doctor to send a new one.",
      });
      return null;
    }
    try {
      const res = await requestTextSessionToken(sessionId, token);
      return res.data;
    } catch (err) {
      const status = (err as { status?: number }).status;
      const message =
        status === 401
          ? "This link is invalid or expired. Please ask your doctor to send a new one."
          : status === 404
            ? "We couldn’t find this consult. Please ask your doctor to send a new link."
            : "Something went wrong opening the consult. Please try again in a moment.";
      setState({ phase: "error", errorMessage: message });
      return null;
    }
  }, [sessionId]);

  // Mount: do the first exchange + scrub the token from the URL.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const data = await exchange();
      if (cancelled || !data) return;

      // Strip ?t=... from the address bar — even though the token is
      // re-presentable, we don't want it persisting in browser history
      // for the duration of the consult.
      try {
        router.replace(`/c/text/${sessionId}`);
      } catch {
        // best-effort
      }

      if (data.sessionStatus === "live") {
        setState({ phase: "live", data });
      } else if (data.sessionStatus === "scheduled") {
        setState({ phase: "holding", data });
      } else {
        setState({ phase: "ended", data });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // Holding-screen poll — re-run exchange every 30s until status changes.
  useEffect(() => {
    if (state.phase !== "holding") return;
    const interval = setInterval(() => {
      void (async () => {
        const data = await exchange();
        if (!data) return;
        if (data.sessionStatus === "live") {
          setState({ phase: "live", data });
        } else if (data.sessionStatus !== "scheduled") {
          setState({ phase: "ended", data });
        } else {
          // Refresh metadata (and JWT) silently while holding.
          setState({ phase: "holding", data });
        }
      })();
    }, SCHEDULED_POLL_MS);
    return () => clearInterval(interval);
  }, [state.phase, exchange]);

  // Token refresh hook handed to <TextConsultRoom> — used on Supabase 401.
  const handleTokenRefresh = useCallback(async (): Promise<string> => {
    const data = await exchange();
    if (!data || !data.token) {
      throw new Error("Unable to refresh session token");
    }
    setState((prev) =>
      prev.phase === "live" && prev.data ? { phase: "live", data } : prev,
    );
    return data.token;
  }, [exchange]);

  // ------------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------------

  if (state.phase === "loading") {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-gray-50 px-4">
        <p className="text-sm text-gray-600">Opening your consult…</p>
      </main>
    );
  }

  if (state.phase === "error") {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-gray-50 px-4">
        <div className="max-w-sm rounded-lg border border-red-200 bg-white p-6 text-center shadow-sm">
          <h1 className="text-base font-semibold text-gray-900">Can’t open this consult</h1>
          <p className="mt-2 text-sm text-gray-600">{state.errorMessage}</p>
        </div>
      </main>
    );
  }

  if (state.phase === "holding" && state.data) {
    const startTimeLabel = formatScheduledTime(state.data.scheduledStartAt);
    const practice = state.data.practiceName?.trim();
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-gray-50 px-4">
        <div className="max-w-sm rounded-lg border border-gray-200 bg-white p-6 text-center shadow-sm">
          <p className="text-xs uppercase tracking-wide text-gray-500">
            {practice ? practice : "Your consult"}
          </p>
          <h1 className="mt-1 text-base font-semibold text-gray-900">
            Your consult starts at {startTimeLabel}
          </h1>
          <p className="mt-3 text-sm text-gray-600">
            We’ll open the chat as soon as the doctor begins the session. You can keep this page open.
          </p>
          <p className="mt-4 inline-flex items-center gap-2 text-xs text-gray-500">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-amber-500" aria-hidden />
            Waiting for the doctor…
          </p>
        </div>
      </main>
    );
  }

  if (state.phase === "ended" && state.data) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-gray-50 px-4">
        <div className="max-w-sm rounded-lg border border-gray-200 bg-white p-6 text-center shadow-sm">
          <h1 className="text-base font-semibold text-gray-900">Consult complete</h1>
          <p className="mt-2 text-sm text-gray-600">{endStateMessage(state.data.sessionStatus)}</p>
          {/* Plan 07 will replace this placeholder with a "View chat history" link. */}
          <p className="mt-3 text-xs text-gray-400">Chat history view coming soon.</p>
        </div>
      </main>
    );
  }

  if (state.phase === "live" && state.data && state.data.token) {
    return (
      <main className="min-h-[100dvh] bg-gray-50">
        <TextConsultRoom
          sessionId={sessionId}
          currentUserId={state.data.currentUserId}
          currentUserRole="patient"
          accessToken={state.data.token}
          sessionStatus={state.data.sessionStatus}
          counterpartyName={state.data.practiceName}
          onRequestTokenRefresh={handleTokenRefresh}
        />
      </main>
    );
  }

  // Defensive fallthrough — shouldn't happen with the phase checks above.
  return null;
}
