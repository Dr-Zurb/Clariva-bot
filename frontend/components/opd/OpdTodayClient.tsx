"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getDoctorSettings } from "@/lib/api";
import type { OpdMode } from "@/types/doctor-settings";
import DoctorQueueBoard from "./DoctorQueueBoard";
import { cn } from "@/lib/utils";

interface OpdTodayClientProps {
  token: string;
}

function defaultMode(m: OpdMode | undefined): OpdMode {
  return m === "queue" ? "queue" : "slot";
}

/**
 * OPD operational hub: queue board or slot-mode hints (e-task-opd-06).
 */
export default function OpdTodayClient({ token }: OpdTodayClientProps) {
  const [sessionDate, setSessionDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [opdMode, setOpdMode] = useState<OpdMode>("slot");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getDoctorSettings(token)
      .then((res) => {
        if (cancelled) return;
        setOpdMode(defaultMode(res.data.settings.opd_mode));
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

  const title = useMemo(
    () => (opdMode === "queue" ? "Queue today" : "OPD today (slot mode)"),
    [opdMode]
  );

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900">{title}</h1>
      <p className="mt-1 text-sm text-gray-600">
        <Link
          href="/dashboard/settings/practice-setup/opd-mode"
          className={cn(
            "font-medium text-blue-600 hover:text-blue-800",
            "focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
          )}
        >
          Practice setup → OPD mode
        </Link>
        {" · "}
        <Link
          href="/dashboard/appointments"
          className="font-medium text-blue-600 hover:text-blue-800"
        >
          Appointments
        </Link>
      </p>

      <div className="mt-6 flex flex-wrap items-end gap-4">
        <div>
          <label htmlFor="opd-session-date" className="block text-sm font-medium text-gray-700">
            Session date
          </label>
          <input
            id="opd-session-date"
            type="date"
            value={sessionDate}
            onChange={(e) => setSessionDate(e.target.value)}
            className="mt-1 rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        {loading ? (
          <p className="text-sm text-gray-500">Loading mode…</p>
        ) : (
          <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-800">
            Mode: {opdMode === "queue" ? "Queue" : "Fixed slot"}
          </span>
        )}
      </div>

      <div className="mt-8">
        {opdMode === "queue" ? (
          <DoctorQueueBoard token={token} sessionDate={sessionDate} />
        ) : (
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-medium text-gray-900">Slot mode</h2>
            <p className="mt-2 text-sm text-gray-600">
              Open an appointment to <strong>offer early join</strong> to the next
              patient or <strong>set a delay</strong> (minutes) so patients see a
              running-late banner on their visit page.
            </p>
            <Link
              href="/dashboard/appointments"
              className={cn(
                "mt-4 inline-flex rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700",
                "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              )}
            >
              Go to appointments
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
