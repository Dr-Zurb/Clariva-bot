"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import {
  getSlotPageInfo,
  getDaySlots,
  selectSlotAndPay,
  type DaySlotWithStatus,
  type OpdModeApi,
} from "@/lib/api";

const DAYS_AHEAD = 14;

function formatSlotTime(iso: string, timezone: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString(undefined, {
      timeZone: timezone,
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso.slice(11, 16);
  }
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  d.setHours(0, 0, 0, 0);
  if (d.getTime() === today.getTime()) return "Today";
  if (d.getTime() === tomorrow.getTime()) return "Tomorrow";
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function BookPageContent() {
  const searchParams = useSearchParams();
  const token = searchParams?.get("token") ?? "";

  const [practiceName, setPracticeName] = useState<string>("");
  const [mode, setMode] = useState<"book" | "reschedule">("book");
  const [opdMode, setOpdMode] = useState<OpdModeApi>("slot");
  const [pageError, setPageError] = useState<string | null>(null);
  const [pageLoading, setPageLoading] = useState(true);

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [slots, setSlots] = useState<DaySlotWithStatus[]>([]);
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<DaySlotWithStatus | null>(
    null
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [queueSuccess, setQueueSuccess] = useState<{
    tokenNumber: number;
    redirectUrl: string;
  } | null>(null);

  const dateOptions = useMemo(() => {
    const options: string[] = [];
    const today = new Date();
    for (let i = 0; i < DAYS_AHEAD; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      options.push(d.toISOString().slice(0, 10));
    }
    return options;
  }, []);

  useEffect(() => {
    if (!token || token.trim() === "") {
      setPageError("Invalid or expired link. Please start from the chat.");
      setPageLoading(false);
      return;
    }

    let cancelled = false;
    setPageError(null);
    setPageLoading(true);

    getSlotPageInfo(token)
      .then((res) => {
        if (cancelled) return;
        setPracticeName(res.data.practiceName || "Book Appointment");
        setMode(res.data.mode ?? "book");
        setOpdMode(res.data.opdMode ?? "slot");
        setPageLoading(false);
        setSelectedDate(dateOptions[0] ?? null);
      })
      .catch((err) => {
        if (cancelled) return;
        setPageError(
          err?.status === 401
            ? "Invalid or expired link. Please start from the chat."
            : "Something went wrong. Please try again or return to the chat."
        );
        setPageLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token, dateOptions]);

  const fetchSlots = useCallback(
    (date: string) => {
      if (!token) return;
      setSlotsLoading(true);
      setSlots([]);
      setSelectedSlot(null);
      getDaySlots(token, date)
        .then((res) => {
          setSlots(res.data.slots);
          setTimezone(res.data.timezone);
          if (res.data.opdMode) {
            setOpdMode(res.data.opdMode);
          }
        })
        .catch(() => {
          setSlots([]);
        })
        .finally(() => {
          setSlotsLoading(false);
        });
    },
    [token]
  );

  useEffect(() => {
    if (selectedDate && token) {
      fetchSlots(selectedDate);
    }
  }, [selectedDate, token, fetchSlots]);

  /** Queue + booking: first available slot on the chosen day backs the join request. */
  useEffect(() => {
    if (opdMode !== "queue" || mode !== "book" || slotsLoading) return;
    const first = slots.find((s) => s.status === "available");
    setSelectedSlot(first ?? null);
  }, [opdMode, mode, slots, slotsLoading]);

  const handleSave = useCallback(async () => {
    if (!selectedSlot || !token || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await selectSlotAndPay(token, selectedSlot.start);
      const { paymentUrl, redirectUrl, tokenNumber, opdMode: resMode } = res.data;
      if (paymentUrl) {
        window.location.href = paymentUrl;
        return;
      }
      if (
        (resMode ?? opdMode) === "queue" &&
        tokenNumber != null &&
        mode === "book"
      ) {
        setQueueSuccess({ tokenNumber, redirectUrl });
        return;
      }
      window.location.href = redirectUrl;
    } catch (err) {
      const e = err as Error & { status?: number; code?: string };
      const status = e.status;
      const msg = e.message?.trim();
      if (status === 409 && msg) {
        setSaveError(msg);
      } else {
        setSaveError(
          status === 409
            ? "This time was just taken. Please pick another."
            : "Something went wrong. Please try again or return to the chat."
        );
      }
    } finally {
      setSaving(false);
    }
  }, [selectedSlot, token, saving, opdMode, mode]);

  const availableCount = slots.filter((s) => s.status === "available").length;
  const isQueueBook = opdMode === "queue" && mode === "book";

  if (pageLoading) {
    return (
      <main className="min-h-screen bg-gray-50 p-4">
        <div className="mx-auto max-w-md">
          <p className="text-center text-gray-600">Loading…</p>
        </div>
      </main>
    );
  }

  if (pageError) {
    return (
      <main className="min-h-screen bg-gray-50 p-4">
        <div className="mx-auto max-w-md rounded-lg border border-red-200 bg-red-50 p-6 text-center">
          <p className="font-medium text-red-800">{pageError}</p>
        </div>
      </main>
    );
  }

  if (queueSuccess) {
    return (
      <main className="min-h-screen bg-gray-50 p-4">
        <div className="mx-auto max-w-md rounded-lg border border-green-200 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-semibold text-gray-900">
            You&apos;re in the queue
          </h1>
          <p className="mt-3 text-sm text-gray-700">
            Your consultation token is{" "}
            <span className="font-semibold text-gray-900">
              #{queueSuccess.tokenNumber}
            </span>
            . Wait times are approximate (around order of arrival, not a fixed
            clock time).
          </p>
          <button
            type="button"
            className="mt-6 w-full rounded-lg bg-blue-600 px-4 py-3 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            onClick={() => {
              window.location.href = queueSuccess.redirectUrl;
            }}
          >
            Continue to Instagram
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 p-4">
      <div className="mx-auto max-w-md">
        <h1 className="text-xl font-semibold text-gray-900">
          {mode === "reschedule" ? "Reschedule Appointment" : practiceName || "Book Appointment"}
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          {mode === "reschedule"
            ? opdMode === "queue"
              ? "Pick a new day for your visit. You’ll keep a place in the queue for that session day."
              : "Select a new date and time for your appointment."
            : isQueueBook
              ? "Choose a day to join the queue. You’ll get a token number — wait times are approximate."
              : "Select a date and time for your appointment."}
        </p>

        {/* Date picker */}
        <section className="mt-6" aria-labelledby="date-heading">
          <h2 id="date-heading" className="text-sm font-medium text-gray-700">
            Select a date
          </h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {dateOptions.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setSelectedDate(d)}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  selectedDate === d
                    ? "bg-blue-600 text-white"
                    : "bg-white text-gray-700 shadow-sm ring-1 ring-gray-200 hover:bg-gray-50"
                }`}
              >
                {formatDateLabel(d)}
              </button>
            ))}
          </div>
        </section>

        {/* Slot grid (slot mode, or reschedule in queue) */}
        <section className="mt-6" aria-labelledby="time-heading">
          <h2 id="time-heading" className="text-sm font-medium text-gray-700">
            {isQueueBook ? "Queue for this day" : "Select a time"}
          </h2>

          {slotsLoading ? (
            <p className="mt-3 text-sm text-gray-500">Loading slots…</p>
          ) : slots.length === 0 ? (
            <p className="mt-3 text-sm text-gray-500">
              No slots available. Pick another date.
            </p>
          ) : isQueueBook ? (
            <p className="mt-3 text-sm text-gray-600">
              {availableCount > 0
                ? "We’ll use the first available slot on this day to join the queue. Tap Continue to confirm."
                : "No openings left on this day — the session may be full. Try another date."}
            </p>
          ) : (
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {slots.map((slot) => {
                const isAvailable = slot.status === "available";
                const isSelected = selectedSlot?.start === slot.start;
                return (
                  <button
                    key={slot.start}
                    type="button"
                    disabled={!isAvailable}
                    onClick={() =>
                      isAvailable && setSelectedSlot(isSelected ? null : slot)
                    }
                    className={`rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                      !isAvailable
                        ? "cursor-not-allowed bg-gray-100 text-gray-400 line-through"
                        : isSelected
                          ? "bg-blue-600 text-white ring-2 ring-blue-500 ring-offset-2"
                          : "bg-white text-gray-700 shadow-sm ring-1 ring-gray-200 hover:bg-blue-50 hover:ring-blue-300"
                    }`}
                  >
                    {formatSlotTime(slot.start, timezone)}
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* Save button */}
        <div className="mt-6">
          <button
            type="button"
            onClick={handleSave}
            disabled={!selectedSlot || saving || availableCount === 0}
            className="w-full rounded-lg bg-blue-600 px-4 py-3 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving
              ? "Processing…"
              : mode === "reschedule"
                ? "Reschedule"
                : isQueueBook
                  ? "Join queue"
                  : "Continue to payment"}
          </button>
          {saveError && (
            <p className="mt-2 text-center text-sm text-red-600">
              {saveError}
            </p>
          )}
        </div>
      </div>
    </main>
  );
}

export default function BookPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-gray-50 p-4">
          <div className="mx-auto max-w-md">
            <p className="text-center text-gray-600">Loading…</p>
          </div>
        </main>
      }
    >
      <BookPageContent />
    </Suspense>
  );
}
