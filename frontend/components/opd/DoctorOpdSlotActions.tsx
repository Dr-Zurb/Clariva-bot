"use client";

import { useEffect, useState } from "react";
import {
  getDoctorSettings,
  postDoctorOfferEarlyJoin,
  postDoctorSessionDelay,
} from "@/lib/api";
import type { OpdMode } from "@/types/doctor-settings";
import { cn } from "@/lib/utils";

interface DoctorOpdSlotActionsProps {
  token: string;
  appointmentId: string;
  appointmentStatus: string;
}

/**
 * Slot-mode doctor controls on appointment detail: early invite + delay broadcast (e-task-opd-06).
 */
export default function DoctorOpdSlotActions({
  token,
  appointmentId,
  appointmentStatus,
}: DoctorOpdSlotActionsProps) {
  const [opdMode, setOpdMode] = useState<OpdMode | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [delayInput, setDelayInput] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getDoctorSettings(token)
      .then((res) => {
        if (cancelled) return;
        const m = res.data.settings.opd_mode;
        setOpdMode(m === "queue" ? "queue" : "slot");
      })
      .catch(() => {
        if (!cancelled) setOpdMode("slot");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (loading || opdMode !== "slot") {
    return null;
  }

  const canOffer =
    appointmentStatus === "pending" || appointmentStatus === "confirmed";

  const handleOfferEarly = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await postDoctorOfferEarlyJoin(token, appointmentId, {
        expiresInMinutes: 15,
      });
      setMessage("Early join offer sent to the patient (next ~15 min).");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const handleSetDelay = async () => {
    const n = parseInt(delayInput, 10);
    if (Number.isNaN(n) || n < 0 || n > 480) {
      setMessage("Enter delay in minutes (0–480).");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await postDoctorSessionDelay(token, appointmentId, n);
      setMessage(`Patients will see ~${n} min delay.`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const handleClearDelay = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await postDoctorSessionDelay(token, appointmentId, null);
      setDelayInput("");
      setMessage("Delay cleared.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  if (!canOffer) {
    return (
      <section
        className="mt-6 rounded-lg border border-gray-200 bg-gray-50 p-4"
        aria-label="OPD slot controls"
      >
        <h2 className="text-sm font-medium text-gray-900">OPD (slot)</h2>
        <p className="mt-1 text-sm text-gray-600">
          Early join and delay apply to pending or confirmed visits only.
        </p>
      </section>
    );
  }

  return (
    <section
      className="mt-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
      aria-label="OPD slot controls"
    >
      <h2 className="text-sm font-medium text-gray-900">OPD — slot mode</h2>
      <p className="mt-1 text-sm text-gray-600">
        Offer the next patient an early join link, or broadcast a delay to patients
        viewing this visit.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void handleOfferEarly()}
          className={cn(
            "rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700",
            "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
          )}
        >
          Invite early join
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-2">
        <div>
          <label htmlFor="opd-delay" className="block text-xs font-medium text-gray-700">
            Delay (minutes)
          </label>
          <input
            id="opd-delay"
            type="number"
            min={0}
            max={480}
            value={delayInput}
            onChange={(e) => setDelayInput(e.target.value)}
            className="mt-0.5 w-28 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            placeholder="e.g. 15"
          />
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void handleSetDelay()}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
        >
          Set delay
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void handleClearDelay()}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
        >
          Clear delay
        </button>
      </div>

      {message ? (
        <p className="mt-3 text-sm text-gray-700" role="status">
          {message}
        </p>
      ) : null}
    </section>
  );
}
