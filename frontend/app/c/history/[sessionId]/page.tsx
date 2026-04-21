"use client";

/**
 * Patient-facing post-consult chat-history route (Plan 07 · Task 31).
 *
 * URL shape: `/c/history/[sessionId]?t=<HMAC-consultation-token>`
 *
 * **Decision 1 sub-decision LOCKED** — indefinite read access for both
 * parties. The *access right* is indefinite; the *patient JWT TTL* is
 * 90 days (matches the patient-self-serve recording-replay TTL from
 * Decision 4). After 90 days the patient contacts support to re-mint a
 * fresh DM link — the underlying RLS + data remain intact.
 *
 * **Threat model** mirrors `/c/text/[sessionId]`:
 *   - The HMAC URL token MAY end up in browser history / referrer
 *     headers / link previews. The Supabase JWT NEVER appears in a
 *     URL — only in memory + (briefly) the Authorization header on
 *     the wire.
 *   - The HMAC is re-presentable (no nonce / single-use semantics) —
 *     re-tapping the DM link any time within 90 days re-mints a fresh
 *     JWT. This is by design (see Plan 07 Task 31 Notes #2).
 *   - We strip `?t=` from the address bar after the first exchange so
 *     it doesn't persist in the address bar / refresh URL.
 *
 * **Unauthenticated route.** Public — bot patients have no Supabase
 * auth session. The `frontend/middleware.ts` matcher only gates
 * `/dashboard/*`, so `/c/*` falls through naturally. If middleware
 * ever expands its matcher, an explicit allowlist for `/c/history/*`
 * must be added — document this in any matcher change PR.
 *
 * **Lifecycle states the page handles:**
 *   1. Missing/invalid `?t=` → render error CTA, no API call.
 *   2. Backend rejects token (401 / NotFound / 429) → render error CTA.
 *   3. 200 → mount `<TextConsultRoom mode='readonly' …>` with the
 *      JWT + metadata returned by the exchange.
 *
 * No live updates — the readonly room performs a single SELECT on
 * mount and skips both the Realtime INSERT subscription and the
 * presence channel. JWT refresh hand-off (`onRequestTokenRefresh`)
 * is wired to re-call the exchange so the room can recover from a
 * Supabase 401 mid-session — useful for the long-tail case where the
 * patient leaves the page open past the JWT's 90-day TTL boundary.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import {
  requestChatHistoryToken,
  type ChatHistoryTokenExchangeData,
} from "@/lib/api";
import TextConsultRoom from "@/components/consultation/TextConsultRoom";
import TranscriptDownloadButton from "@/components/consultation/TranscriptDownloadButton";

interface PageState {
  phase: "loading" | "error" | "ready";
  errorMessage?: string;
  data?: ChatHistoryTokenExchangeData;
}

function pickErrorMessage(status: number | undefined): string {
  if (status === 401) {
    return "This link has expired or is invalid. Please contact support for a new link.";
  }
  if (status === 404) {
    return "We couldn’t find this consultation. Please contact support.";
  }
  if (status === 429) {
    return "Too many requests. Please try again in a minute.";
  }
  return "Something went wrong opening the conversation. Please try again in a moment.";
}

export default function PatientChatHistoryPage() {
  const params       = useParams<{ sessionId: string }>();
  const searchParams = useSearchParams();
  const router       = useRouter();

  const sessionId       = (params?.sessionId ?? "").toString();
  const initialUrlToken = searchParams?.get("t") ?? "";
  // Captured into a ref so JWT refresh can re-use it after the URL is
  // scrubbed (the address bar no longer carries `?t=` post-mount).
  const urlTokenRef = useRef<string>(initialUrlToken);

  const [state, setState] = useState<PageState>({ phase: "loading" });

  /**
   * Single source of truth for "go talk to the backend, mint a fresh
   * JWT, update local state". Called on mount + on JWT refresh.
   */
  const exchange = useCallback(async (): Promise<ChatHistoryTokenExchangeData | null> => {
    const token = urlTokenRef.current;
    if (!sessionId || !token) {
      setState({ phase: "error", errorMessage: pickErrorMessage(401) });
      return null;
    }
    try {
      const res = await requestChatHistoryToken(sessionId, token);
      return res.data;
    } catch (err) {
      const status = (err as { status?: number }).status;
      setState({ phase: "error", errorMessage: pickErrorMessage(status) });
      return null;
    }
  }, [sessionId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const data = await exchange();
      if (cancelled || !data) return;

      // Strip ?t=… from the address bar — re-presentable HMAC, but we
      // don't want it lingering in the bar / refresh URL.
      try {
        router.replace(`/c/history/${sessionId}`);
      } catch {
        // best-effort
      }

      setState({ phase: "ready", data });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  /**
   * JWT refresh hand-off for `<TextConsultRoom>`. Triggered when the
   * Supabase client gets a 401 (e.g. mid-90-day-window the JWT
   * crossed an expiry — rare but defensible). Re-call the exchange to
   * mint a fresh JWT.
   */
  const handleTokenRefresh = useCallback(async (): Promise<string> => {
    const data = await exchange();
    if (!data || !data.accessToken) {
      throw new Error("Unable to refresh chat-history token");
    }
    setState({ phase: "ready", data });
    return data.accessToken;
  }, [exchange]);

  // ----------------------------------------------------------------------
  // Render
  // ----------------------------------------------------------------------

  if (state.phase === "loading") {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-gray-50 px-4">
        <p className="text-sm text-gray-600">Opening your conversation…</p>
      </main>
    );
  }

  if (state.phase === "error") {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-gray-50 px-4">
        <div className="max-w-sm rounded-lg border border-red-200 bg-white p-6 text-center shadow-sm">
          <h1 className="text-base font-semibold text-gray-900">
            Can’t open this conversation
          </h1>
          <p className="mt-2 text-sm text-gray-600">{state.errorMessage}</p>
        </div>
      </main>
    );
  }

  if (state.phase === "ready" && state.data) {
    return (
      <main className="min-h-[100dvh] bg-gray-50">
        <TextConsultRoom
          sessionId={sessionId}
          currentUserId={state.data.currentUserId}
          currentUserRole="patient"
          accessToken={state.data.accessToken}
          sessionStatus={state.data.sessionStatus}
          counterpartyName={state.data.practiceName}
          mode="readonly"
          consultEndedAt={state.data.consultEndedAt ?? undefined}
          onRequestTokenRefresh={handleTokenRefresh}
        />
        {/* Task 32 — transcript PDF download. The chat-history JWT
            carries `consult_role:'patient'` + `session_id` claims
            which the transcript route accepts via `resolveReplayCaller`
            (same auth surface as Task 29 / Task 31). */}
        <div className="mx-auto max-w-3xl px-4 py-4">
          <TranscriptDownloadButton
            sessionId={sessionId}
            token={state.data.accessToken}
            callerRole="patient"
          />
        </div>
      </main>
    );
  }

  // Defensive fallthrough — shouldn't be reachable.
  return null;
}
