"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  getInstagramStatus,
  redirectToInstagramConnect,
  disconnectInstagram,
  type InstagramStatusData,
} from "@/lib/api";

/**
 * Instagram connection status and Connect/Disconnect actions.
 * Requires authenticated user (dashboard layout guards). Uses session token for API calls.
 * @see e-task-5; FRONTEND_STANDARDS (loading, error, a11y); FRONTEND_COMPLIANCE (no PII in logs)
 */
export default function InstagramConnect() {
  const [status, setStatus] = useState<InstagramStatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectLoading, setConnectLoading] = useState(false);
  const [disconnectLoading, setDisconnectLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchStatus = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) {
      setError("Not signed in");
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const res = await getInstagramStatus(token);
      setStatus(res.data);
    } catch (err) {
      const status = err && typeof err === "object" && "status" in err ? (err as { status?: number }).status : 500;
      if (status === 401) {
        setError("Session expired. Please sign in again.");
      } else {
        setError("Unable to load Instagram status. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Read callback query params (e.g. ?connected=1 or ?connected=0&error=...)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("connected");
    if (connected === "1") {
      setMessage({ type: "success", text: "Instagram connected successfully." });
      fetchStatus();
      // Clear URL without full reload
      window.history.replaceState({}, "", window.location.pathname);
    } else if (connected === "0") {
      const errParam = params.get("error");
      const errMsg =
        errParam === "page_already_linked"
          ? "This Instagram page is already linked to another account."
          : errParam === "no_pages"
            ? "No Facebook Page found. Please link a Page to your Instagram account."
            : "Connection was not completed.";
      setMessage({ type: "error", text: errMsg });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [fetchStatus]);

  const handleConnect = async () => {
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) {
      setError("Not signed in");
      return;
    }
    setConnectLoading(true);
    setError(null);
    setMessage(null);
    try {
      await redirectToInstagramConnect(token);
      // Redirect initiated; do not set error — navigation may complete shortly.
    } catch {
      setError("Could not start connect. Please try again.");
    } finally {
      setConnectLoading(false);
    }
  };

  const handleDisconnect = async () => {
    const confirmed = window.confirm(
      "Are you sure? Incoming DMs will no longer be handled."
    );
    if (!confirmed) return;
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) {
      setError("Not signed in");
      return;
    }
    setDisconnectLoading(true);
    setError(null);
    setMessage(null);
    try {
      await disconnectInstagram(token);
      setMessage({ type: "success", text: "Instagram disconnected." });
      setStatus({ connected: false, username: null });
    } catch (err) {
      const status = err && typeof err === "object" && "status" in err ? (err as { status?: number }).status : 500;
      setError(
        status === 401
          ? "Session expired. Please sign in again."
          : "Failed to disconnect. Please try again."
      );
    } finally {
      setDisconnectLoading(false);
    }
  };

  const cardBase = "rounded-lg border border-gray-200 bg-white p-5 shadow-sm";

  if (loading) {
    return (
      <div className={cardBase} aria-busy="true" aria-live="polite">
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
          <InstagramIcon />
        </div>
        <h2 className="font-semibold text-gray-900">Instagram</h2>
        <p className="mt-1 text-sm text-gray-600">Loading Instagram status…</p>
      </div>
    );
  }

  if (error && !status) {
    return (
      <div
        className={cardBase}
        role="alert"
        aria-live="polite"
      >
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
          <InstagramIcon />
        </div>
        <h2 className="font-semibold text-gray-900">Instagram</h2>
        <p className="mt-1 text-sm text-gray-600">Connect Instagram to receive patient messages.</p>
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-red-800">
          <p className="font-medium">Error</p>
          <p className="mt-1 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cardBase}>
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
        <InstagramIcon />
      </div>
      <h2 className="font-semibold text-gray-900">Instagram</h2>
      <p className="mt-1 text-sm text-gray-600">
        Connect Instagram to receive patient messages and manage appointments.
      </p>
      {message && (
        <div
          role="alert"
          aria-live="polite"
          className={`mt-3 rounded-md p-2 text-sm ${message.type === "success" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}
        >
          {message.text}
        </div>
      )}
      <div className="mt-3">
        {status?.connected ? (
          <>
            <p className="text-gray-700">
              {status.username
                ? `Connected as @${status.username}`
                : "Connected"}
            </p>
            <button
              type="button"
              onClick={handleDisconnect}
              disabled={disconnectLoading}
              className="mt-2 rounded-md border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50"
              aria-label="Disconnect Instagram"
            >
              {disconnectLoading ? "Disconnecting…" : "Disconnect"}
            </button>
          </>
        ) : (
          <>
            <p className="text-gray-600">Not connected</p>
            <button
              type="button"
              onClick={handleConnect}
              disabled={connectLoading}
              className="mt-2 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
              aria-label="Connect Instagram"
            >
              {connectLoading ? "Redirecting…" : "Connect Instagram"}
            </button>
          </>
        )}
      </div>
      {error && status && (
        <p className="mt-2 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function InstagramIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  );
}
