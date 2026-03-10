"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { usePathname } from "next/navigation";
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

const DAY_ORDER: DayOfWeek[] = [1, 2, 3, 4, 5, 6, 0]; // Mon–Sun
const DAY_NAMES: Record<DayOfWeek, string> = {
  0: "Sunday",
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
};
const WEEKDAYS: DayOfWeek[] = [1, 2, 3, 4, 5]; // Mon–Fri
const REASON_PRESETS = ["Vacation", "Sick leave", "Conference", "Personal", "Other"] as const;

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function formatDateOnly(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { dateStyle: "medium" });
  } catch {
    return iso;
  }
}

function isWholeDay(bt: BlockedTime): boolean {
  const start = new Date(bt.start_time);
  const end = new Date(bt.end_time);
  const hours = (end.getTime() - start.getTime()) / (60 * 60 * 1000);
  return start.toDateString() === end.toDateString() && hours >= 23;
}

/**
 * Availability page: Weekly calendar + Blocked Times (e-task-9).
 */
export default function AvailabilityPage() {
  const pathname = usePathname();
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [blockedTimes, setBlockedTimes] = useState<BlockedTime[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [availabilityMessage, setAvailabilityMessage] = useState<{ type: "error"; text: string } | null>(null);
  const [blockedMessage, setBlockedMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [blockedWholeDay, setBlockedWholeDay] = useState(true);
  const [blockedDate, setBlockedDate] = useState("");
  const [blockedStartTime, setBlockedStartTime] = useState("09:00");
  const [blockedEndTime, setBlockedEndTime] = useState("17:00");
  const [blockedReasonPreset, setBlockedReasonPreset] = useState("");
  const [blockedReasonCustom, setBlockedReasonCustom] = useState("");
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [copyMenuDay, setCopyMenuDay] = useState<DayOfWeek | null>(null);
  const [copySelectedModalOpen, setCopySelectedModalOpen] = useState(false);
  const [copySelectedDays, setCopySelectedDays] = useState<Set<DayOfWeek>>(new Set());
  const [copySourceDay, setCopySourceDay] = useState<DayOfWeek | null>(null);
  const copyMenuRefs = useRef<Map<DayOfWeek, HTMLDivElement>>(new Map());
  const copySelectedRef = useRef<HTMLDivElement>(null);
  const isInitialLoad = useRef(true);
  const saveImmediatelyRef = useRef(false);
  const slotsRef = useRef<AvailabilitySlot[]>([]);
  const saveInProgressRef = useRef(false);
  const pendingSlotsRef = useRef<AvailabilitySlot[] | null>(null);

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
    if (pathname?.endsWith("/availability")) {
      setLoading(true);
      fetchAll();
    }
  }, [pathname, fetchAll]);

  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted && typeof window !== "undefined" && window.location.pathname.endsWith("/availability")) {
        setLoading(true);
        fetchAll();
      }
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, [fetchAll]);

  const performSave = useCallback(async (slotsToSave: AvailabilitySlot[]) => {
    if (saveInProgressRef.current) {
      pendingSlotsRef.current = slotsToSave;
      return;
    }
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) return;
    for (const s of slotsToSave) {
      const [sh, sm] = s.start_time.split(":").map(Number);
      const [eh, em] = s.end_time.split(":").map(Number);
      if (sh * 60 + sm >= eh * 60 + em) {
        setAvailabilityMessage({ type: "error", text: "Start time must be before end time for each slot." });
        return;
      }
    }
    setAvailabilityMessage(null);
    saveInProgressRef.current = true;
    try {
      const payload = slotsToSave.map((s) => ({
        day_of_week: s.day_of_week,
        start_time: s.start_time.length === 5 ? `${s.start_time}:00` : s.start_time,
        end_time: s.end_time.length === 5 ? `${s.end_time}:00` : s.end_time,
      }));
      await putAvailability(token, payload);
    } catch (err) {
      const status = err && typeof err === "object" && "status" in err ? (err as { status?: number }).status : 500;
      setAvailabilityMessage({ type: "error", text: status === 401 ? "Session expired." : "Failed to save." });
    } finally {
      saveInProgressRef.current = false;
      const next = pendingSlotsRef.current;
      pendingSlotsRef.current = null;
      if (next !== null) {
        performSave(next);
      }
    }
  }, []);

  const saveAvailability = useCallback((slotsToSave: AvailabilitySlot[]) => {
    performSave(slotsToSave);
  }, [performSave]);

  slotsRef.current = slots;

  useEffect(() => {
    if (isInitialLoad.current) {
      isInitialLoad.current = false;
      return;
    }
    if (saveImmediatelyRef.current) {
      saveImmediatelyRef.current = false;
      saveAvailability(slots);
      return;
    }
    const timer = setTimeout(() => saveAvailability(slots), 400);
    return () => {
      clearTimeout(timer);
      saveAvailability(slotsRef.current);
    };
  }, [slots, saveAvailability]);

  useEffect(() => {
    if (!blockedDate) {
      const today = new Date().toISOString().slice(0, 10);
      setBlockedDate(today);
    }
  }, [blockedDate]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      const isInsideCopyMenu = Array.from(copyMenuRefs.current.values()).some((el) => el.contains(target));
      if (copyMenuDay !== null && !isInsideCopyMenu) {
        setCopyMenuDay(null);
      }
      if (copySelectedModalOpen && copySelectedRef.current && !copySelectedRef.current.contains(target)) {
        setCopySelectedModalOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [copyMenuDay, copySelectedModalOpen]);

  const getSlotsForDay = (day: DayOfWeek) => slots.filter((s) => s.day_of_week === day);
  const getFlatIndex = (day: DayOfWeek, slotIndexInDay: number): number => {
    let count = 0;
    for (let i = 0; i < slots.length; i++) {
      if (slots[i].day_of_week === day) {
        if (count === slotIndexInDay) return i;
        count++;
      }
    }
    return -1;
  };

  const addSlot = (day: DayOfWeek) => {
    saveImmediatelyRef.current = true;
    setSlots((prev) => [...prev, { day_of_week: day, start_time: "09:00", end_time: "17:00" }]);
    setAvailabilityMessage(null);
  };

  const updateSlot = (flatIndex: number, field: keyof AvailabilitySlot, value: string | number) => {
    setSlots((prev) => {
      const next = [...prev];
      next[flatIndex] = { ...next[flatIndex], [field]: value };
      return next;
    });
    setAvailabilityMessage(null);
  };

  const removeSlot = (flatIndex: number) => {
    saveImmediatelyRef.current = true;
    setSlots((prev) => prev.filter((_, i) => i !== flatIndex));
    setAvailabilityMessage(null);
  };

  const copySlotsToDays = (sourceDay: DayOfWeek, targetDays: DayOfWeek[]) => {
    if (targetDays.length === 0) return;
    saveImmediatelyRef.current = true;
    setSlots((prev) => {
      const sourceSlots = prev.filter((s) => s.day_of_week === sourceDay);
      if (sourceSlots.length === 0) return prev;
      // Override: remove all slots for target days, then add copied slots
      const keep = prev.filter((s) => !targetDays.includes(s.day_of_week));
      const newSlots = targetDays.flatMap((d) =>
        sourceSlots.map((s) => ({ ...s, day_of_week: d }))
      );
      return [...keep, ...newSlots];
    });
    setCopyMenuDay(null);
    setCopySelectedModalOpen(false);
    setCopySelectedDays(new Set());
    setCopySourceDay(null);
    setAvailabilityMessage(null);
  };

  const handleCopyToAll = (sourceDay: DayOfWeek) => {
    const targets = DAY_ORDER.filter((d) => d !== sourceDay);
    copySlotsToDays(sourceDay, targets);
  };

  const handleCopyToWeekdays = (sourceDay: DayOfWeek) => {
    const targets = WEEKDAYS.filter((d) => d !== sourceDay);
    copySlotsToDays(sourceDay, targets);
  };

  const handleCopyToSelected = (sourceDay: DayOfWeek) => {
    setCopySourceDay(sourceDay);
    setCopyMenuDay(null);
    setCopySelectedModalOpen(true);
    setCopySelectedDays(new Set());
  };

  const handleApplyCopyToSelected = () => {
    if (copySourceDay === null) return;
    const targets = Array.from(copySelectedDays).filter((d) => d !== copySourceDay);
    if (targets.length === 0) return;
    copySlotsToDays(copySourceDay, targets);
    setCopySourceDay(null);
  };

  const handleAddBlocked = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) return;

    const dateStr = blockedDate || new Date().toISOString().slice(0, 10);
    let start: string;
    let end: string;

    if (blockedWholeDay) {
      start = new Date(`${dateStr}T00:00:00`).toISOString();
      end = new Date(`${dateStr}T23:59:59.999`).toISOString();
    } else {
      const startTime = blockedStartTime.length === 5 ? `${blockedStartTime}:00` : blockedStartTime;
      const endTime = blockedEndTime.length === 5 ? `${blockedEndTime}:00` : blockedEndTime;
      start = new Date(`${dateStr}T${startTime}`).toISOString();
      end = new Date(`${dateStr}T${endTime}`).toISOString();
      if (new Date(start).getTime() >= new Date(end).getTime()) {
        setBlockedMessage({ type: "error", text: "Start time must be before end time." });
        return;
      }
    }

    const reason = blockedReasonPreset === "Other" ? blockedReasonCustom.trim() : blockedReasonPreset || blockedReasonCustom.trim() || undefined;

    setAdding(true);
    setBlockedMessage(null);
    try {
      const res = await postBlockedTime(token, { start_time: start, end_time: end, reason });
      setBlockedTimes((prev) => [...prev, res.data.blockedTime]);
      setBlockedDate(new Date().toISOString().slice(0, 10));
      setBlockedStartTime("09:00");
      setBlockedEndTime("17:00");
      setBlockedReasonPreset("");
      setBlockedReasonCustom("");
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
      <h1 className="text-2xl font-semibold text-gray-900">Availability</h1>
      <p className="mt-1 text-gray-600">
        Weekly schedule and blocked times when you are unavailable.
      </p>

      {/* Section 1: Weekly Slots */}
      <section className="mt-6 rounded-lg border border-gray-200 bg-white p-4" aria-labelledby="slots-heading">
        <h2 id="slots-heading" className="text-lg font-semibold text-gray-900">Weekly Slots</h2>
        <p className="mt-1 text-sm text-gray-600">Set your weekly availability. Patients can book within these slots.</p>
        {availabilityMessage && (
          <div role="alert" className="mt-3 rounded-md bg-red-50 p-2 text-sm text-red-800">
            {availabilityMessage.text}
          </div>
        )}
        <div className="mt-4 space-y-3">
            {DAY_ORDER.map((day) => {
              const daySlots = getSlotsForDay(day);
              const hasSlots = daySlots.length > 0;
              return (
                <div
                  key={day}
                  className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-gray-50/50 p-3"
                >
                  <span className="w-24 shrink-0 font-medium text-gray-900 sm:w-28">
                    {DAY_NAMES[day]}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                    {daySlots.map((slot, idx) => {
                      const flatIdx = getFlatIndex(day, idx);
                      return (
                        <div
                          key={flatIdx}
                          className="flex items-center gap-2 rounded-md border border-gray-200 bg-white px-2 py-1.5"
                        >
                          <input
                            type="time"
                            value={slot.start_time}
                            onChange={(e) => updateSlot(flatIdx, "start_time", e.target.value)}
                            className="w-24 rounded border border-gray-300 px-1.5 py-0.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            aria-label={`${DAY_NAMES[day]} start time`}
                          />
                          <span className="text-gray-500">–</span>
                          <input
                            type="time"
                            value={slot.end_time}
                            onChange={(e) => updateSlot(flatIdx, "end_time", e.target.value)}
                            className="w-24 rounded border border-gray-300 px-1.5 py-0.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            aria-label={`${DAY_NAMES[day]} end time`}
                          />
                          <button
                            type="button"
                            onClick={() => removeSlot(flatIdx)}
                            className="rounded p-1 text-red-600 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500"
                            aria-label={`Remove ${DAY_NAMES[day]} slot`}
                          >
                            <span aria-hidden>×</span>
                          </button>
                        </div>
                      );
                    })}
                    {!hasSlots && (
                      <span className="text-sm text-gray-500">(no slots)</span>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => addSlot(day)}
                      className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                    >
                      + Add slot
                    </button>
                    {hasSlots && (
                      <div
                        className="relative"
                        ref={(el) => {
                          if (el) copyMenuRefs.current.set(day, el);
                          else copyMenuRefs.current.delete(day);
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => setCopyMenuDay(copyMenuDay === day ? null : day)}
                          aria-haspopup="true"
                          aria-expanded={copyMenuDay === day}
                          aria-label={`Copy ${DAY_NAMES[day]} to other days`}
                          className="rounded p-1.5 text-gray-500 hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <span className="text-lg leading-none" aria-hidden>⋮</span>
                        </button>
                        {copyMenuDay === day && (
                          <div
                            className="absolute right-0 top-full z-10 mt-1 w-48 rounded-md border border-gray-200 bg-white py-1 shadow-lg"
                            role="menu"
                          >
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => handleCopyToAll(day)}
                              className="block w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
                            >
                              Copy to all days
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => handleCopyToWeekdays(day)}
                              className="block w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
                            >
                              Copy to weekdays (Mon–Fri)
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => handleCopyToSelected(day)}
                              className="block w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
                            >
                              Copy to selected days…
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
      </section>

      {/* Copy to selected days modal */}
      {copySelectedModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div
            ref={copySelectedRef}
            className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-4 shadow-lg"
            role="dialog"
            aria-labelledby="copy-modal-title"
          >
            <h3 id="copy-modal-title" className="text-lg font-semibold text-gray-900">
              Copy to selected days
            </h3>
            <p className="mt-1 text-sm text-gray-600">
              Choose which days to copy {copySourceDay !== null ? DAY_NAMES[copySourceDay] : ""} slots to:
            </p>
            <div className="mt-4 space-y-2">
              {DAY_ORDER.filter((d) => d !== copySourceDay).map((d) => (
                <label key={d} className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={copySelectedDays.has(d)}
                    onChange={(e) => {
                      setCopySelectedDays((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(d);
                        else next.delete(d);
                        return next;
                      });
                    }}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-900">{DAY_NAMES[d]}</span>
                </label>
              ))}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setCopySelectedModalOpen(false);
                  setCopySelectedDays(new Set());
                  setCopySourceDay(null);
                }}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApplyCopyToSelected}
                disabled={copySelectedDays.size === 0}
                className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Section 2: Blocked Times */}
      <section className="mt-6 rounded-lg border border-gray-200 bg-white p-4" aria-labelledby="blocked-heading">
        <h2 id="blocked-heading" className="text-lg font-semibold text-gray-900">Blocked Times</h2>
        <p className="mt-1 text-sm text-gray-600">
          Block dates or specific times when you are unavailable.
        </p>
        {blockedMessage && (
          <div role="alert" className={`mt-3 rounded-md p-2 text-sm ${blockedMessage.type === "success" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
            {blockedMessage.text}
          </div>
        )}
        <form onSubmit={handleAddBlocked} className="mt-4 space-y-4">
          <div className="flex flex-wrap gap-4">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                name="blocked-type"
                checked={blockedWholeDay}
                onChange={() => setBlockedWholeDay(true)}
                className="text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm font-medium text-gray-700">Whole day</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                name="blocked-type"
                checked={!blockedWholeDay}
                onChange={() => setBlockedWholeDay(false)}
                className="text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm font-medium text-gray-700">Specific time</span>
            </label>
          </div>
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label htmlFor="blocked-date" className="block text-sm font-medium text-gray-700">Date</label>
              <input
                id="blocked-date"
                type="date"
                value={blockedDate}
                onChange={(e) => setBlockedDate(e.target.value)}
                required
                className="mt-1 block rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            {!blockedWholeDay && (
              <>
                <div>
                  <label htmlFor="blocked-start" className="block text-sm font-medium text-gray-700">Start time</label>
                  <input
                    id="blocked-start"
                    type="time"
                    value={blockedStartTime}
                    onChange={(e) => setBlockedStartTime(e.target.value)}
                    className="mt-1 block rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label htmlFor="blocked-end" className="block text-sm font-medium text-gray-700">End time</label>
                  <input
                    id="blocked-end"
                    type="time"
                    value={blockedEndTime}
                    onChange={(e) => setBlockedEndTime(e.target.value)}
                    className="mt-1 block rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </>
            )}
            <div className="min-w-[140px] flex-1">
              <label htmlFor="blocked-reason" className="block text-sm font-medium text-gray-700">Reason (optional)</label>
              <select
                id="blocked-reason"
                value={blockedReasonPreset}
                onChange={(e) => setBlockedReasonPreset(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">—</option>
                {REASON_PRESETS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            {blockedReasonPreset === "Other" && (
              <div className="min-w-[160px] flex-1">
                <label htmlFor="blocked-reason-custom" className="block text-sm font-medium text-gray-700">Custom reason</label>
                <input
                  id="blocked-reason-custom"
                  type="text"
                  value={blockedReasonCustom}
                  onChange={(e) => setBlockedReasonCustom(e.target.value)}
                  placeholder="e.g. Family event"
                  maxLength={500}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            )}
            <button
              type="submit"
              disabled={adding}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
            >
              {adding ? "Adding…" : "Add blocked time"}
            </button>
          </div>
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
                    <p className="font-medium text-gray-900">
                      {isWholeDay(bt)
                        ? `${formatDateOnly(bt.start_time)} (whole day)`
                        : `${formatDateTime(bt.start_time)} – ${formatDateTime(bt.end_time)}`}
                    </p>
                    {bt.reason && <p className="text-sm text-gray-600">{bt.reason}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteBlocked(bt.id)}
                    disabled={deletingId === bt.id}
                    className="rounded-md border border-red-200 px-2 py-1.5 text-sm text-red-700 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50"
                    aria-label={`Remove blocked time`}
                  >
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
