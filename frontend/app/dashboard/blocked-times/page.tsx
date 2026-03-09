"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  getBlockedTimes,
  postBlockedTime,
  deleteBlockedTime,
} from "@/lib/api";
import type { BlockedTime } from "@/types/blocked-time";

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

/**
 * Blocked times page: list, add, remove (e-task-5).
 */
export default function BlockedTimesPage() {
  const [blockedTimes, setBlockedTimes] = useState<BlockedTime[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [addStart, setAddStart] = useState("");
  const [addEnd, setAddEnd] = useState("");
  const [addReason, setAddReason] = useState("");
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchBlockedTimes = useCallback(async () => {
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
      const today = new Date();
      const start = today.toISOString().slice(0, 10);
      const end = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const res = await getBlockedTimes(token, { start_date: start, end_date: end });
      setBlockedTimes(res.data.blockedTimes);
    } catch (err) {
      const status = err && typeof err === "object" && "status" in err ? (err as { status?: number }).status : 500;
      setError(
        status === 401
          ? "Session expired. Please sign in again."
          : "Unable to load blocked times. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBlockedTimes();
  }, [fetchBlockedTimes]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) {
      setError("Not signed in");
      return;
    }

    const start = addStart ? new Date(addStart).toISOString() : "";
    const end = addEnd ? new Date(addEnd).toISOString() : "";
    if (!start || !end || new Date(start) >= new Date(end)) {
      setMessage({ type: "error", text: "Start must be before end." });
      return;
    }

    setAdding(true);
    setMessage(null);
    try {
      const res = await postBlockedTime(token, {
        start_time: start,
        end_time: end,
        reason: addReason.trim() || undefined,
      });
      setBlockedTimes((prev) => [...prev, res.data.blockedTime]);
      setAddStart("");
      setAddEnd("");
      setAddReason("");
      setMessage({ type: "success", text: "Blocked time added." });
    } catch (err) {
      const status = err && typeof err === "object" && "status" in err ? (err as { status?: number }).status : 500;
      setMessage({
        type: "error",
        text: status === 401 ? "Session expired. Please sign in again." : "Failed to add. Please try again.",
      });
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id: string) => {
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) return;
    setDeletingId(id);
    setMessage(null);
    try {
      await deleteBlockedTime(token, id);
      setBlockedTimes((prev) => prev.filter((b) => b.id !== id));
      setMessage({ type: "success", text: "Blocked time removed." });
    } catch (err) {
      const status = err && typeof err === "object" && "status" in err ? (err as { status?: number }).status : 500;
      setMessage({
        type: "error",
        text: status === 401 ? "Session expired. Please sign in again." : "Failed to remove. Please try again.",
      });
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-4" aria-busy="true" aria-live="polite">
        <p className="text-sm text-gray-600">Loading blocked times…</p>
      </div>
    );
  }

  if (error && blockedTimes.length === 0) {
    return (
      <div
        className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800"
        role="alert"
        aria-live="polite"
      >
        <p className="font-medium">Error</p>
        <p className="mt-1 text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900">Blocked Times</h1>
      <p className="mt-1 text-gray-600">
        Block specific time slots when you are unavailable.
      </p>
      {message && (
        <div
          role="alert"
          aria-live="polite"
          className={`mt-4 rounded-md p-2 text-sm ${message.type === "success" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}
        >
          {message.text}
        </div>
      )}

      <section className="mt-6 rounded-lg border border-gray-200 bg-white p-4" aria-labelledby="add-heading">
        <h2 id="add-heading" className="text-lg font-medium text-gray-900">
          Add blocked time
        </h2>
        <form onSubmit={handleAdd} className="mt-4 flex flex-wrap items-end gap-4">
          <div>
            <label htmlFor="add-start" className="block text-sm font-medium text-gray-700">
              Start
            </label>
            <input
              id="add-start"
              type="datetime-local"
              value={addStart}
              onChange={(e) => setAddStart(e.target.value)}
              required
              className="mt-1 block rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label htmlFor="add-end" className="block text-sm font-medium text-gray-700">
              End
            </label>
            <input
              id="add-end"
              type="datetime-local"
              value={addEnd}
              onChange={(e) => setAddEnd(e.target.value)}
              required
              className="mt-1 block rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div className="min-w-[200px] flex-1">
            <label htmlFor="add-reason" className="block text-sm font-medium text-gray-700">
              Reason (optional)
            </label>
            <input
              id="add-reason"
              type="text"
              value={addReason}
              onChange={(e) => setAddReason(e.target.value)}
              maxLength={500}
              placeholder="e.g. Vacation"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <button
            type="submit"
            disabled={adding}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
          >
            {adding ? "Adding…" : "Add"}
          </button>
        </form>
      </section>

      <section className="mt-6" aria-labelledby="list-heading">
        <h2 id="list-heading" className="text-lg font-medium text-gray-900">
          Blocked periods
        </h2>
        {blockedTimes.length === 0 ? (
          <p className="mt-4 text-sm text-gray-500">No blocked times in the next 90 days.</p>
        ) : (
          <ul className="mt-4 divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white">
            {blockedTimes.map((bt) => (
              <li
                key={bt.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <div>
                  <p className="font-medium text-gray-900">
                    {formatDateTime(bt.start_time)} – {formatDateTime(bt.end_time)}
                  </p>
                  {bt.reason && (
                    <p className="text-sm text-gray-600">{bt.reason}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(bt.id)}
                  disabled={deletingId === bt.id}
                  className="rounded-md border border-red-200 px-2 py-1.5 text-sm text-red-700 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50"
                  aria-label={`Remove blocked time ${formatDateTime(bt.start_time)}`}
                >
                  {deletingId === bt.id ? "Removing…" : "Remove"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
