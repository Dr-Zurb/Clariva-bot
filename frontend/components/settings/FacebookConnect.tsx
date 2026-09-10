"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { formatDateTime } from "@/lib/format-date";
import {
  getFacebookStatus,
  redirectToFacebookConnect,
  disconnectFacebook,
  type FacebookStatusData,
} from "@/lib/api";
import { createClient } from "@/lib/supabase/client";
import { useVerificationStatusQuery } from "@/hooks/queries/useVerificationStatusQuery";

interface FacebookConnectProps {
  /** Access token from the server page (ver-05 soft-block). */
  token: string;
}

/**
 * Facebook Page connection status and Connect/Disconnect actions (fbm-06).
 * Separate from Instagram Login — requires a Facebook Page for Messenger.
 */
export default function FacebookConnect({ token }: FacebookConnectProps) {
  const [status, setStatus] = useState<FacebookStatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectLoading, setConnectLoading] = useState(false);
  const [disconnectLoading, setDisconnectLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(
    null
  );
  const verification = useVerificationStatusQuery(token);
  const mustVerifyFirst =
    !!verification.data && verification.data.status !== "verified";

  const fetchStatus = useCallback(async () => {
    if (!token) {
      setError("Not signed in");
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const res = await getFacebookStatus(token);
      setStatus(res.data);
    } catch (err) {
      const statusCode =
        err && typeof err === "object" && "status" in err
          ? (err as { status?: number }).status
          : 500;
      if (statusCode === 401) {
        setError("Session expired. Please sign in again.");
      } else {
        setError("Unable to load Facebook status. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("fb_connected") ?? params.get("connected");
    if (connected === "1" && params.has("fb_connected")) {
      setMessage({ type: "success", text: "Facebook Page connected successfully." });
      fetchStatus();
      window.history.replaceState({}, "", window.location.pathname);
    } else if (connected === "0" && params.has("fb_connected")) {
      const errParam = params.get("error");
      const errMsg =
        errParam === "page_already_linked"
          ? "This Facebook Page is already linked to another Halo Aid account."
          : errParam === "no_pages"
            ? "Could not find a Facebook Page you manage. Create or select a Page, then try again."
            : errParam === "doctor_not_verified"
              ? "Verify your medical registration before connecting Facebook."
              : "Connection was not completed.";
      setMessage({ type: "error", text: errMsg });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [fetchStatus]);

  const handleConnect = async () => {
    if (!token) {
      setError("Not signed in");
      return;
    }
    if (mustVerifyFirst) {
      setError("Verify your medical registration before connecting Facebook.");
      return;
    }
    setConnectLoading(true);
    setError(null);
    setMessage(null);
    try {
      await createClient().auth.refreshSession();
      await redirectToFacebookConnect(token);
    } catch (err) {
      const statusCode =
        err && typeof err === "object" && "status" in err
          ? (err as { status?: number }).status
          : undefined;
      const msg = err instanceof Error ? err.message : null;
      setError(
        statusCode === 403 && msg
          ? msg
          : "Could not start connect. Please try again."
      );
    } finally {
      setConnectLoading(false);
    }
  };

  const handleDisconnect = async () => {
    const confirmed = window.confirm(
      "Are you sure? Messenger DMs for this Page will no longer be handled."
    );
    if (!confirmed) return;
    if (!token) {
      setError("Not signed in");
      return;
    }
    setDisconnectLoading(true);
    setError(null);
    setMessage(null);
    try {
      await disconnectFacebook(token);
      setMessage({ type: "success", text: "Facebook Page disconnected." });
      setStatus({
        connected: false,
        pageName: null,
        pageId: null,
        health: {
          level: "not_connected",
          checkedAt: null,
          tokenExpiresAt: null,
          lastDmSuccessAt: null,
          message: "Connect a Facebook Page to enable Messenger replies.",
          reconnectRecommended: true,
        },
      });
    } catch (err) {
      const statusCode =
        err && typeof err === "object" && "status" in err
          ? (err as { status?: number }).status
          : 500;
      setError(
        statusCode === 401
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
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-sky-50 text-sky-700">
          <FacebookIcon />
        </div>
        <h2 className="font-semibold text-gray-900">Facebook Messenger</h2>
        <p className="mt-1 text-sm text-gray-600">Loading Facebook status…</p>
      </div>
    );
  }

  if (error && !status) {
    return (
      <div className={cardBase} role="alert" aria-live="polite">
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-sky-50 text-sky-700">
          <FacebookIcon />
        </div>
        <h2 className="font-semibold text-gray-900">Facebook Messenger</h2>
        <p className="mt-1 text-sm text-gray-600">
          Connect a Facebook Page to receive Messenger patient messages.
        </p>
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-red-800">
          <p className="font-medium">Error</p>
          <p className="mt-1 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cardBase}>
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-sky-50 text-sky-700">
        <FacebookIcon />
      </div>
      <h2 className="font-semibold text-gray-900">Facebook Messenger</h2>
      <p className="mt-1 text-sm text-gray-600">
        Connect a Facebook Page you manage to receive Messenger DMs. This is
        separate from Instagram Login and requires a Page.
      </p>
      {message && (
        <div
          role="alert"
          aria-live="polite"
          className={`mt-3 rounded-md p-2 text-sm ${
            message.type === "success"
              ? "bg-green-50 text-green-800"
              : "bg-red-50 text-red-800"
          }`}
        >
          {message.text}
        </div>
      )}
      {status?.health && status.health.level !== "not_connected" && (
        <div
          className={`mt-3 rounded-md border p-3 text-sm ${
            status.health.level === "ok"
              ? "border-green-200 bg-green-50 text-green-900"
              : status.health.level === "warning"
                ? "border-amber-200 bg-amber-50 text-amber-900"
                : status.health.level === "error"
                  ? "border-red-200 bg-red-50 text-red-900"
                  : "border-gray-200 bg-gray-50 text-gray-800"
          }`}
          role="status"
          aria-live="polite"
        >
          <p className="font-medium">
            Connection health:{" "}
            {status.health.level === "ok"
              ? "OK"
              : status.health.level === "warning"
                ? "Needs attention"
                : status.health.level === "error"
                  ? "Action required"
                  : "Unknown"}
          </p>
          <p className="mt-1">{status.health.message}</p>
          {status.health.tokenExpiresAt && (
            <p className="mt-1 text-xs opacity-90">
              Token expiry (UTC): {formatDateTime(status.health.tokenExpiresAt)}
            </p>
          )}
          {status.health.lastDmSuccessAt && (
            <p className="mt-1 text-xs opacity-90">
              Last bot Messenger DM: {formatDateTime(status.health.lastDmSuccessAt)}
            </p>
          )}
          {status.health.checkedAt && (
            <p className="mt-1 text-xs opacity-75">
              Checked: {formatDateTime(status.health.checkedAt)}
            </p>
          )}
          {(status.health.reconnectRecommended || status.health.level === "error") && (
            <p className="mt-2 text-xs">
              Use <span className="font-medium">Disconnect</span> then{" "}
              <span className="font-medium">Connect Facebook Page</span> below to
              refresh your Page connection.
            </p>
          )}
        </div>
      )}
      <div className="mt-3">
        {status?.connected ? (
          <>
            <p className="text-gray-700">
              {status.pageName
                ? `Connected as ${status.pageName}`
                : "Connected"}
            </p>
            <button
              type="button"
              onClick={handleDisconnect}
              disabled={disconnectLoading}
              className="mt-2 rounded-md border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50"
              aria-label="Disconnect Facebook Page"
            >
              {disconnectLoading ? "Disconnecting…" : "Disconnect"}
            </button>
          </>
        ) : (
          <>
            <p className="text-gray-600">Not connected</p>
            {mustVerifyFirst ? (
              <div className="mt-2 space-y-2">
                <p className="text-sm text-amber-800" role="status">
                  Verify your medical registration before connecting Facebook.
                </p>
                <Link
                  href="/dashboard/get-verified"
                  className="inline-flex rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                >
                  Get verified
                </Link>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleConnect}
                disabled={connectLoading || verification.isLoading}
                className="mt-2 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
                aria-label="Connect Facebook Page"
              >
                {connectLoading ? "Redirecting…" : "Connect Facebook Page"}
              </button>
            )}
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

function FacebookIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M22 12.07C22 6.48 17.52 2 11.93 2S1.86 6.48 1.86 12.07c0 5.02 3.66 9.18 8.44 9.93v-7.02H7.9v-2.91h2.4V9.84c0-2.37 1.4-3.68 3.56-3.68 1.03 0 2.11.18 2.11.18v2.32h-1.19c-1.17 0-1.54.73-1.54 1.48v1.78h2.62l-.42 2.91h-2.2V22c4.78-.75 8.44-4.91 8.44-9.93z" />
    </svg>
  );
}
