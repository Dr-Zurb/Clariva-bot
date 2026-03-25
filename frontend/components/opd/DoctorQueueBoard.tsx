"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  getDoctorOpdQueueSession,
  patchDoctorQueueEntry,
} from "@/lib/api";
import type { DoctorQueueSessionRow } from "@/types/opd-doctor";
import { cn } from "@/lib/utils";

interface DoctorQueueBoardProps {
  token: string;
  sessionDate: string;
  pollSeconds?: number;
}

/**
 * Live queue table: token, patient label, status, actions (e-task-opd-06).
 */
export default function DoctorQueueBoard({
  token,
  sessionDate,
  pollSeconds = 15,
}: DoctorQueueBoardProps) {
  const [entries, setEntries] = useState<DoctorQueueSessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await getDoctorOpdQueueSession(token, sessionDate);
      setEntries(res.data.entries);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load queue");
    } finally {
      setLoading(false);
    }
  }, [token, sessionDate]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  useEffect(() => {
    const id = setInterval(() => void load(), pollSeconds * 1000);
    return () => clearInterval(id);
  }, [load, pollSeconds]);

  const runAction = async (
    entryId: string,
    status: "called" | "skipped"
  ) => {
    setActionId(entryId);
    try {
      await patchDoctorQueueEntry(token, entryId, status);
      await load();
    } finally {
      setActionId(null);
    }
  };

  if (loading && entries.length === 0) {
    return <p className="text-sm text-gray-600">Loading queue…</p>;
  }

  if (error) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
        {error}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div
        className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-8 text-center text-gray-600"
        role="status"
      >
        <p className="font-medium text-gray-800">No queue for this day</p>
        <p className="mt-1 text-sm">
          There are no token-queue visits on {sessionDate}. Bookings in queue
          mode will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th scope="col" className="px-3 py-2 text-left font-medium text-gray-700">
              Token
            </th>
            <th scope="col" className="px-3 py-2 text-left font-medium text-gray-700">
              Patient
            </th>
            <th scope="col" className="px-3 py-2 text-left font-medium text-gray-700">
              Queue
            </th>
            <th scope="col" className="px-3 py-2 text-left font-medium text-gray-700">
              Visit
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium text-gray-700">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {entries.map((row) => {
            const busy = actionId === row.entryId;
            const canAct =
              row.queueStatus === "waiting" || row.queueStatus === "called";
            return (
              <tr key={row.entryId}>
                <td className="whitespace-nowrap px-3 py-2 font-mono font-semibold">
                  #{row.tokenNumber}
                </td>
                <td className="px-3 py-2">{row.patientLabel}</td>
                <td className="px-3 py-2 capitalize text-gray-700">
                  {row.queueStatus.replace("_", " ")}
                </td>
                <td className="px-3 py-2 capitalize">{row.appointmentStatus}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right">
                  <Link
                    href={`/dashboard/appointments/${row.appointmentId}`}
                    className={cn(
                      "mr-2 text-blue-600 hover:text-blue-800",
                      "focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
                    )}
                  >
                    Open
                  </Link>
                  {canAct ? (
                    <>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void runAction(row.entryId, "called")}
                        className="mr-2 rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                      >
                        Call
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void runAction(row.entryId, "skipped")}
                        className="rounded border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-800 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                      >
                        Skip
                      </button>
                    </>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
