"use client";

import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  getAvailability,
  putAvailability,
  getBlockedTimes,
  postBlockedTime,
  deleteBlockedTime,
} from "@/lib/api";
import type { AvailabilitySlot, DayOfWeek } from "@/types/availability";
import type { BlockedTime } from "@/types/blocked-time";

const DAY_NAMES: Record<DayOfWeek, string> = {
  0: "Sunday",
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
};

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

/**
 * Availability page: Weekly Slots + Blocked Times (two sections, single scroll).
 */
export default function AvailabilityPage() {
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [blockedTimes, setBlockedTimes] = useState<BlockedTime[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [availabilitySaving, setAvailabilitySaving] = useState(false);
  const [availabilityMessage, setAvailabilityMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [blockedMessage, setBlockedMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [addStart, setAddStart] = useState("");
  const [addEnd, setAddEnd] = useState("");
  const [addReason, setAddReason] = useState("");
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) {
      setError("Not signed in");
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const [availRes, blockedRes] = await Promise.all([
        getAvailability(token),
        getBlockedTimes(token, {
          start_date: new Date().toISOString().slice(0, 10),
          end_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        }),
      ]);
      const avail = availRes.data.availability;
      setSlots(avail.map((a) => ({
        day_of_week: a.day_of_week,
        start_time: a.start_time.slice(0, 5),
        end_time: a.end_time.slice(0, 5),
      })));
      setBlockedTimes(blockedRes.data.blockedTimes);
    } catch (err) {
      const status = err && typeof err === "object" && "status" in err ? (err as { status?: number }).status : 500;
      setError(status === 401 ? "Session expired." : "Unable to load.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const addSlot = () => {
    setSlots((prev) => [...prev, { day_of_week: 1, start_time: "09:00", end_time: "17:00" }]);
    setAvailabilityMessage(null);
  };

  const updateSlot = (index: number, field: keyof AvailabilitySlot, value: string | number) => {
    setSlots((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
    setAvailabilityMessage(null);
  };

  const removeSlot = (index: number) => {
    setSlots((prev) => prev.filter((_, i) => i !== index));
    setAvailabilityMessage(null);
  };

  const handleSaveAvailability = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) return;

    for (const s of slots) {
      const [sh, sm] = s.start_time.split(":").map(Number);
      const [eh, em] = s.end_time.split(":").map(Number);
      if (sh * 60 + sm >= eh * 60 + em) {
        setAvailabilityMessage({ type: "error", text: "Start time must be before end time for each slot." });
        return;
      }
    }

    setAvailabilitySaving(true);
    setAvailabilityMessage(null);
    try {
      const payload = slots.map((s) => ({
        day_of_week: s.day_of_week,
        start_time: s.start_time.length === 5 ? `${s.start_time}:00` : s.start_time,
        end_time: s.end_time.length === 5 ? `${s.end_time}:00` : s.end_time,
      }));
      await putAvailability(token, payload);
      setAvailabilityMessage({ type: "success", text: "Schedule saved." });
      fetchAll();
    } catch (err) {
      const status = err && typeof err === "object" && "status" in err ? (err as { status?: number }).status : 500;
      setAvailabilityMessage({ type: "error", text: status === 401 ? "Session expired." : "Failed to save." });
    } finally {
      setAvailabilitySaving(false);
    }
  };

  const handleAddBlocked = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) return;

    const start = addStart ? new Date(addStart).toISOString() : "";
    const end = addEnd ? new Date(addEnd).toISOString() : "";
    if (!start || !end || new Date(start) >= new Date(end)) {
      setBlockedMessage({ type: "error", text: "Start must be before end." });
      return;
    }

    setAdding(true);
    setBlockedMessage(null);
    try {
      const res = await postBlockedTime(token, { start_time: start, end_time: end, reason: addReason.trim() || undefined });
      setBlockedTimes((prev) => [...prev, res.data.blockedTime]);
      setAddStart("");
      setAddEnd("");
      setAddReason("");
      setBlockedMessage({ type: "success", text: "Blocked time added." });
    } catch (err) {
      const status = err && typeof err === "object" && "status" in err ? (err as { status?: number }).status : 500;
      setBlockedMessage({ type: "error", text: status === 401 ? "Session expired." : "Failed to add." });
    } finally {
      setAdding(false);
    }
  };

  const handleDeleteBlocked = async (id: string) => {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) return;
    setDeletingId(id);
    setBlockedMessage(null);
    try {
      await deleteBlockedTime(token, id);
      setBlockedTimes((prev) => prev.filter((b) => b.id !== id));
      setBlockedMessage({ type: "success", text: "Blocked time removed." });
    } catch (err) {
      const status = err && typeof err === "object" && "status" in err ? (err as { status?: number }).status : 500;
      setBlockedMessage({ type: "error", text: status === 401 ? "Session expired." : "Failed to remove." });
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-4" aria-busy="true">
        <p className="text-sm text-gray-600">Loading…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800" role="alert">
        <p className="font-medium">Error</p>
        <p className="mt-1 text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div>
      <Link
        href="/dashboard/settings/practice-setup"
        className="mb-4 inline-flex items-center text-sm text-gray-600 hover:text-blue-600"
      >
        ← Back to Practice Setup
      </Link>
      <h1 className="text-2xl font-semibold text-gray-900">Availability</h1>
      <p className="mt-1 text-gray-600">
        Weekly schedule and blocked times when you are unavailable.
      </p>

      {/* Section 1: Weekly Slots */}
      <section className="mt-6 rounded-lg border border-gray-200 bg-white p-4" aria-labelledby="slots-heading">
        <h2 id="slots-heading" className="text-lg font-semibold text-gray-900">Weekly Slots</h2>
        <p className="mt-1 text-sm text-gray-600">Set your weekly availability. Patients can book within these slots.</p>
        {availabilityMessage && (
          <div role="alert" className={`mt-3 rounded-md p-2 text-sm ${availabilityMessage.type === "success" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
            {availabilityMessage.text}
          </div>
        )}
        <form onSubmit={handleSaveAvailability} className="mt-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-medium text-gray-900">Slots</h3>
            <button type="button" onClick={addSlot} className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">Add slot</button>
          </div>
          <ul className="mt-4 space-y-3">
            {slots.map((slot, i) => (
              <li key={i} className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
                <select value={slot.day_of_week} onChange={(e) => updateSlot(i, "day_of_week", Number(e.target.value) as DayOfWeek)} className="rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" aria-label="Day of week">
                  {(Object.entries(DAY_NAMES) as [string, string][]).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                </select>
                <input type="time" value={slot.start_time} onChange={(e) => updateSlot(i, "start_time", e.target.value)} className="rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" aria-label="Start time" />
                <span className="text-gray-500">to</span>
                <input type="time" value={slot.end_time} onChange={(e) => updateSlot(i, "end_time", e.target.value)} className="rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" aria-label="End time" />
                <button type="button" onClick={() => removeSlot(i)} className="rounded-md border border-red-200 px-2 py-1.5 text-sm text-red-700 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2" aria-label="Remove slot">Remove</button>
              </li>
            ))}
          </ul>
          {slots.length === 0 && <p className="mt-4 text-sm text-gray-500">No slots yet. Click &quot;Add slot&quot; to define your availability.</p>}
          <button type="submit" disabled={availabilitySaving} className="mt-4 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50">
            {availabilitySaving ? "Saving…" : "Save schedule"}
          </button>
        </form>
      </section>

      {/* Section 2: Blocked Times */}
      <section className="mt-6 rounded-lg border border-gray-200 bg-white p-4" aria-labelledby="blocked-heading">
        <h2 id="blocked-heading" className="text-lg font-semibold text-gray-900">Blocked Times</h2>
        <p className="mt-1 text-sm text-gray-600">Block specific time slots when you are unavailable.</p>
        {blockedMessage && (
          <div role="alert" className={`mt-3 rounded-md p-2 text-sm ${blockedMessage.type === "success" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
            {blockedMessage.text}
          </div>
        )}
        <form onSubmit={handleAddBlocked} className="mt-4 flex flex-wrap items-end gap-4">
          <div>
            <label htmlFor="add-start" className="block text-sm font-medium text-gray-700">Start</label>
            <input id="add-start" type="datetime-local" value={addStart} onChange={(e) => setAddStart(e.target.value)} required className="mt-1 block rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>
          <div>
            <label htmlFor="add-end" className="block text-sm font-medium text-gray-700">End</label>
            <input id="add-end" type="datetime-local" value={addEnd} onChange={(e) => setAddEnd(e.target.value)} required className="mt-1 block rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>
          <div className="min-w-[200px] flex-1">
            <label htmlFor="add-reason" className="block text-sm font-medium text-gray-700">Reason (optional)</label>
            <input id="add-reason" type="text" value={addReason} onChange={(e) => setAddReason(e.target.value)} maxLength={500} placeholder="e.g. Vacation" className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>
          <button type="submit" disabled={adding} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50">
            {adding ? "Adding…" : "Add"}
          </button>
        </form>
        <div className="mt-4">
          <h3 className="text-base font-medium text-gray-900">Blocked periods</h3>
          {blockedTimes.length === 0 ? (
            <p className="mt-2 text-sm text-gray-500">No blocked times in the next 90 days.</p>
          ) : (
            <ul className="mt-2 divide-y divide-gray-200 rounded-lg border border-gray-200">
              {blockedTimes.map((bt) => (
                <li key={bt.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <p className="font-medium text-gray-900">{formatDateTime(bt.start_time)} – {formatDateTime(bt.end_time)}</p>
                    {bt.reason && <p className="text-sm text-gray-600">{bt.reason}</p>}
                  </div>
                  <button type="button" onClick={() => handleDeleteBlocked(bt.id)} disabled={deletingId === bt.id} className="rounded-md border border-red-200 px-2 py-1.5 text-sm text-red-700 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50" aria-label={`Remove blocked time ${formatDateTime(bt.start_time)}`}>
                    {deletingId === bt.id ? "Removing…" : "Remove"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
