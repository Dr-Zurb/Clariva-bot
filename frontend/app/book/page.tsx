"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import {
  getSlotPageInfo,
  getDaySlots,
  selectSlotAndPay,
  postRecordingConsent,
  type BookingPageCatalogApi,
  type ConsultationModalityApi,
  type DaySlotWithStatus,
  type OpdModeApi,
} from "@/lib/api";
import {
  RecordingConsentCheckbox,
  RECORDING_CONSENT_VERSION_DISPLAY,
} from "@/components/booking/RecordingConsentCheckbox";
import { RecordingConsentRePitchModal } from "@/components/booking/RecordingConsentRePitchModal";

const DAYS_AHEAD = 14;

const MODALITY_LABEL: Record<ConsultationModalityApi, string> = {
  text: "Text chat",
  voice: "Voice",
  video: "Video",
};

function formatMoneyMinor(minor: number, currency: string): string {
  const main = minor / 100;
  if (currency === "INR") {
    return `₹${main.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  }
  return `${main.toFixed(2)} ${currency}`;
}

function enabledModalitiesForService(
  service: BookingPageCatalogApi["services"][0]
): ConsultationModalityApi[] {
  return (["text", "voice", "video"] as const).filter(
    (m) => service.modalities[m]?.enabled === true
  );
}

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

  const [serviceCatalog, setServiceCatalog] = useState<BookingPageCatalogApi | null>(
    null
  );
  const [selectedServiceKey, setSelectedServiceKey] = useState<string | null>(
    null
  );
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(
    null
  );
  const [selectedModality, setSelectedModality] =
    useState<ConsultationModalityApi | null>(null);
  /** ARM-09: visit type fixed in chat — disable switching to another catalog row. */
  const [servicePickerLocked, setServicePickerLocked] = useState(false);

  // Plan 02 · Task 27 — recording consent. Default ON (Decision 4:
  // recording-on-by-default). Re-pitch modal fires only on the first
  // uncheck; subsequent uncheck toggles skip the modal.
  const [recordingConsent, setRecordingConsent] = useState<boolean>(true);
  const [hasRePitched, setHasRePitched] = useState<boolean>(false);
  const [rePitchOpen, setRePitchOpen] = useState<boolean>(false);

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

        if (res.data.bookingAllowed === false) {
          const why = res.data.bookingBlockedReason;
          const msg =
            why === "staff_review_pending"
              ? "Your visit type is still being confirmed by the clinic. Please return to your chat thread — we’ll send you a link when you can schedule and pay."
              : why === "service_selection_not_finalized"
                ? "Please finish confirming your visit type in chat with the clinic before choosing a time here."
                : "This scheduling link is not ready yet. Please return to the chat for the next step.";
          setPageError(msg);
          setPageLoading(false);
          return;
        }

        const sc = res.data.serviceCatalog ?? null;
        setServiceCatalog(sc);

        const locked = res.data.servicePickerLocked === true;
        setServicePickerLocked(locked);

        const sugKey = res.data.suggestedCatalogServiceKey?.trim().toLowerCase();
        const sugId = res.data.suggestedCatalogServiceId?.trim();
        const sugMod = res.data.suggestedConsultationModality;

        if (sc && (sugKey || sugId)) {
          const svc = sc.services.find(
            (s) =>
              s.service_key.toLowerCase() === sugKey ||
              (Boolean(sugId) && s.service_id === sugId)
          );
          if (svc) {
            setSelectedServiceKey(svc.service_key);
            setSelectedServiceId(svc.service_id);
            const enabled = enabledModalitiesForService(svc);
            if (sugMod && enabled.includes(sugMod)) {
              setSelectedModality(sugMod);
            } else if (enabled.length === 1) {
              setSelectedModality(enabled[0]!);
            } else {
              setSelectedModality(null);
            }
          } else if (sc.services.length === 1) {
            setSelectedServiceKey(sc.services[0]!.service_key);
            setSelectedServiceId(sc.services[0]!.service_id);
            setSelectedModality(null);
          } else {
            setSelectedServiceKey(null);
            setSelectedServiceId(null);
            setSelectedModality(null);
            setServicePickerLocked(false);
          }
        } else if (sc && sc.services.length === 1) {
          setSelectedServiceKey(sc.services[0]!.service_key);
          setSelectedServiceId(sc.services[0]!.service_id);
          setSelectedModality(null);
        } else {
          setSelectedServiceKey(null);
          setSelectedServiceId(null);
          setSelectedModality(null);
        }

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

  useEffect(() => {
    if (!serviceCatalog || !selectedServiceKey) {
      return;
    }
    const svc = serviceCatalog.services.find(
      (s) => s.service_key === selectedServiceKey
    );
    if (!svc) {
      return;
    }
    const enabled = enabledModalitiesForService(svc);
    if (enabled.length === 1) {
      setSelectedModality(enabled[0]!);
    } else {
      setSelectedModality((prev) =>
        prev && enabled.includes(prev) ? prev : null
      );
    }
  }, [serviceCatalog, selectedServiceKey]);

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

  const catalogPickComplete = useMemo(() => {
    if (!serviceCatalog || mode !== "book") {
      return true;
    }
    return Boolean(selectedServiceKey && selectedServiceId && selectedModality);
  }, [serviceCatalog, mode, selectedServiceKey, selectedServiceId, selectedModality]);

  const handleSave = useCallback(async () => {
    if (!selectedSlot || !token || saving || !catalogPickComplete) return;
    setSaving(true);
    setSaveError(null);
    try {
      const catalogPayload =
        serviceCatalog && mode === "book"
          ? {
              catalogServiceKey: selectedServiceKey ?? undefined,
              catalogServiceId: selectedServiceId ?? undefined,
              consultationModality: selectedModality ?? undefined,
            }
          : undefined;
      const res = await selectSlotAndPay(
        token,
        selectedSlot.start,
        catalogPayload
      );
      const { paymentUrl, redirectUrl, tokenNumber, opdMode: resMode, appointmentId } =
        res.data;

      // Plan 02 · Task 27 — persist recording consent before redirecting.
      // Fail-open: any error here is logged but does NOT block the payment
      // flow. The appointment is already created; a missed write leaves
      // consent NULL which is handled as "no explicit opt-out" downstream.
      if (appointmentId) {
        try {
          await postRecordingConsent(
            token,
            appointmentId,
            recordingConsent,
            RECORDING_CONSENT_VERSION_DISPLAY
          );
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn("[book] failed to record consent", err);
        }
      }

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
  }, [
    selectedSlot,
    token,
    saving,
    opdMode,
    mode,
    catalogPickComplete,
    serviceCatalog,
    selectedServiceKey,
    selectedServiceId,
    selectedModality,
    recordingConsent,
  ]);

  const handleConsentChange = useCallback(
    (next: boolean) => {
      setRecordingConsent(next);
    },
    []
  );

  const handleFirstDecline = useCallback(() => {
    if (!hasRePitched) {
      setHasRePitched(true);
      setRePitchOpen(true);
    }
  }, [hasRePitched]);

  const handleKeepRecordingOn = useCallback(() => {
    setRecordingConsent(true);
    setRePitchOpen(false);
  }, []);

  const handleContinueWithoutRecording = useCallback(() => {
    setRecordingConsent(false);
    setRePitchOpen(false);
  }, []);

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

        {serviceCatalog && mode === "book" && serviceCatalog.services.length > 0 && (
          <section className="mt-6 space-y-4" aria-labelledby="svc-heading">
            <h2 id="svc-heading" className="text-sm font-medium text-gray-700">
              Consultation type
            </h2>
            {servicePickerLocked &&
              selectedServiceKey &&
              serviceCatalog.services.length > 1 && (
              <p className="rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-900">
                Your visit type was confirmed in chat as{" "}
                <span className="font-medium">
                  {serviceCatalog.services.find((x) => x.service_key === selectedServiceKey)
                    ?.label ?? selectedServiceKey}
                </span>
                . Other consultation types are not shown here so scheduling matches what the clinic set up.
              </p>
            )}
            {serviceCatalog.services.length > 1 &&
              !(servicePickerLocked && selectedServiceKey) && (
              <div className="flex flex-col gap-2">
                <span className="text-xs text-gray-500">Service</span>
                <div className="flex flex-wrap gap-2">
                  {serviceCatalog.services.map((s) => (
                    <button
                      key={s.service_id}
                      type="button"
                      onClick={() => {
                        setSelectedServiceKey(s.service_key);
                        setSelectedServiceId(s.service_id);
                        setSelectedModality(null);
                      }}
                      className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                        selectedServiceKey === s.service_key
                          ? "bg-blue-600 text-white"
                          : "bg-white text-gray-800 shadow-sm ring-1 ring-gray-200 hover:bg-gray-50"
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {selectedServiceKey &&
              (() => {
                const svc = serviceCatalog.services.find(
                  (s) => s.service_key === selectedServiceKey
                );
                if (!svc) return null;
                const enabled = enabledModalitiesForService(svc);
                if (enabled.length <= 1) {
                  return (
                    <p className="text-xs text-gray-600">
                      Price:{" "}
                      {enabled[0]
                        ? formatMoneyMinor(
                            svc.modalities[enabled[0]]!.price_minor,
                            serviceCatalog.feeCurrency
                          )
                        : "—"}
                    </p>
                  );
                }
                return (
                  <div className="flex flex-col gap-2">
                    <span className="text-xs text-gray-500">
                      How would you like to consult?
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {enabled.map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setSelectedModality(m)}
                          className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                            selectedModality === m
                              ? "bg-blue-600 text-white"
                              : "bg-white text-gray-800 shadow-sm ring-1 ring-gray-200 hover:bg-gray-50"
                          }`}
                        >
                          {MODALITY_LABEL[m]} —{" "}
                          {formatMoneyMinor(
                            svc.modalities[m]!.price_minor,
                            serviceCatalog.feeCurrency
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })()}
          </section>
        )}

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

        {/* Plan 02 · Task 27 — recording consent. Rendered only for fresh
            bookings, not reschedules (the consent on the original booking
            carries forward; re-asking on reschedule is out of scope per
            Plan 02 open question #1). */}
        {mode === "book" ? (
          <section className="mt-6">
            <RecordingConsentCheckbox
              checked={recordingConsent}
              onChange={handleConsentChange}
              onFirstDecline={handleFirstDecline}
              disabled={saving}
              practiceName={practiceName || undefined}
            />
          </section>
        ) : null}

        {/* Save button */}
        <div className="mt-6">
          <button
            type="button"
            onClick={handleSave}
            disabled={
              !selectedSlot ||
              saving ||
              availableCount === 0 ||
              !catalogPickComplete
            }
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

      <RecordingConsentRePitchModal
        open={rePitchOpen}
        onKeepOn={handleKeepRecordingOn}
        onContinueWithout={handleContinueWithoutRecording}
        onDismiss={handleContinueWithoutRecording}
      />
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
