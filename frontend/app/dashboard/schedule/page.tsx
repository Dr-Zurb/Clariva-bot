"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { getAvailability, putAvailability } from "@/lib/api";
import type { AvailabilitySlot, DayOfWeek } from "@/types/availability";

const DAY_NAMES: Record<DayOfWeek, string> = {
  0: "Sunday",
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
};

/**
 * Schedule page: manage weekly availability (e-task-5).
 */
export default function SchedulePage() {
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchAvailability = useCallback(async () => {
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
      const res = await getAvailability(token);
      const avail = res.data.availability;
      const list: AvailabilitySlot[] = avail.map((a) => ({
        day_of_week: a.day_of_week,
        start_time: a.start_time.slice(0, 5),
        end_time: a.end_time.slice(0, 5),
      }));
      setSlots(list);
    } catch (err) {
      const status = err && typeof err === "object" && "status" in err ? (err as { status?: number }).status : 500;
      setError(
        status === 401
          ? "Session expired. Please sign in again."
          : "Unable to load schedule. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAvailability();
  }, [fetchAvailability]);

  const addSlot = () => {
    setSlots((prev) => [
      ...prev,
      { day_of_week: 1, start_time: "09:00", end_time: "17:00" },
    ]);
    setMessage(null);
  };

  const updateSlot = (index: number, field: keyof AvailabilitySlot, value: string | number) => {
    setSlots((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
    setMessage(null);
  };

  const removeSlot = (index: number) => {
    setSlots((prev) => prev.filter((_, i) => i !== index));
    setMessage(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
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

    for (const s of slots) {
      const [sh, sm] = s.start_time.split(":").map(Number);
      const [eh, em] = s.end_time.split(":").map(Number);
      if (sh * 60 + sm >= eh * 60 + em) {
        setMessage({ type: "error", text: "Start time must be before end time for each slot." });
        return;
      }
    }

    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const payload = slots.map((s) => ({
        day_of_week: s.day_of_week,
        start_time: s.start_time.length === 5 ? `${s.start_time}:00` : s.start_time,
        end_time: s.end_time.length === 5 ? `${s.end_time}:00` : s.end_time,
      }));
      await putAvailability(token, payload);
      setMessage({ type: "success", text: "Schedule saved successfully." });
      fetchAvailability();
    } catch (err) {
      const status = err && typeof err === "object" && "status" in err ? (err as { status?: number }).status : 500;
      setMessage({
        type: "error",
        text: status === 401 ? "Session expired. Please sign in again." : "Failed to save. Please try again.",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-4" aria-busy="true" aria-live="polite">
        <p className="text-sm text-gray-600">Loading schedule…</p>
      </div>
    );
  }

  if (error && slots.length === 0 && !loading) {
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
      <h1 className="text-2xl font-semibold text-gray-900">Schedule</h1>
      <p className="mt-1 text-gray-600">
        Set your weekly availability. Patients can book within these slots.
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
      <form onSubmit={handleSubmit} className="mt-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium text-gray-900">Weekly slots</h2>
          <button
            type="button"
            onClick={addSlot}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Add slot
          </button>
        </div>
        <ul className="mt-4 space-y-3">
          {slots.map((slot, i) => (
            <li
              key={i}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3"
            >
              <select
                value={slot.day_of_week}
                onChange={(e) => updateSlot(i, "day_of_week", Number(e.target.value) as DayOfWeek)}
                className="rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                aria-label="Day of week"
              >
                {(Object.entries(DAY_NAMES) as [string, string][]).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
              <label className="sr-only" htmlFor={`start-${i}`}>
                Start time
              </label>
              <input
                id={`start-${i}`}
                type="time"
                value={slot.start_time}
                onChange={(e) => updateSlot(i, "start_time", e.target.value)}
                className="rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <span className="text-gray-500">to</span>
              <label className="sr-only" htmlFor={`end-${i}`}>
                End time
              </label>
              <input
                id={`end-${i}`}
                type="time"
                value={slot.end_time}
                onChange={(e) => updateSlot(i, "end_time", e.target.value)}
                className="rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={() => removeSlot(i)}
                className="rounded-md border border-red-200 px-2 py-1.5 text-sm text-red-700 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
                aria-label="Remove slot"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
        {slots.length === 0 && (
          <p className="mt-4 text-sm text-gray-500">
            No slots yet. Click &quot;Add slot&quot; to define your availability.
          </p>
        )}
        <button
          type="submit"
          disabled={saving}
          className="mt-6 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save schedule"}
        </button>
      </form>
    </div>
  );
}
