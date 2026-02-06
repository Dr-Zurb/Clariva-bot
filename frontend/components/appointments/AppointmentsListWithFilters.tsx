"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { Appointment } from "@/types/appointment";

interface AppointmentsListWithFiltersProps {
  appointments: Appointment[];
}

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "confirmed", label: "Confirmed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "completed", label: "Completed" },
] as const;

function formatAppointmentDate(iso: string): string {
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
 * Client component: filters appointments by status, date range, and patient name.
 * Phase 0: client-side filter per e-task-5.
 */
export default function AppointmentsListWithFilters({
  appointments,
}: AppointmentsListWithFiltersProps) {
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [searchName, setSearchName] = useState<string>("");

  const filtered = useMemo(() => {
    let list = [...appointments];

    if (statusFilter) {
      list = list.filter((apt) => apt.status === statusFilter);
    }

    if (dateFrom) {
      const from = new Date(dateFrom);
      from.setHours(0, 0, 0, 0);
      list = list.filter((apt) => new Date(apt.appointment_date) >= from);
    }

    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      list = list.filter((apt) => new Date(apt.appointment_date) <= to);
    }

    if (searchName.trim()) {
      const q = searchName.trim().toLowerCase();
      list = list.filter((apt) =>
        apt.patient_name.toLowerCase().includes(q)
      );
    }

    return list;
  }, [appointments, statusFilter, dateFrom, dateTo, searchName]);

  return (
    <div>
      <div
        className="mb-4 rounded-lg border border-gray-200 bg-gray-50/50 p-4 sm:p-4"
        role="group"
        aria-label="Filter appointments"
      >
        <h2 className="sr-only">Filters</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label
              htmlFor="filter-status"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Status
            </label>
            <select
              id="filter-status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={cn(
                "w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm",
                "focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500",
                "min-h-[44px]"
              )}
              aria-label="Filter by status"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value || "all"} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="filter-date-from"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              From date
            </label>
            <input
              id="filter-date-from"
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className={cn(
                "w-full rounded-md border border-gray-300 px-3 py-2 text-sm",
                "focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500",
                "min-h-[44px]"
              )}
              aria-label="Filter from date"
            />
          </div>
          <div>
            <label
              htmlFor="filter-date-to"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              To date
            </label>
            <input
              id="filter-date-to"
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className={cn(
                "w-full rounded-md border border-gray-300 px-3 py-2 text-sm",
                "focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500",
                "min-h-[44px]"
              )}
              aria-label="Filter to date"
            />
          </div>
          <div>
            <label
              htmlFor="filter-patient-name"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Patient name
            </label>
            <input
              id="filter-patient-name"
              type="search"
              value={searchName}
              onChange={(e) => setSearchName(e.target.value)}
              placeholder="Search by name"
              className={cn(
                "w-full rounded-md border border-gray-300 px-3 py-2 text-sm",
                "focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500",
                "min-h-[44px]"
              )}
              aria-label="Search by patient name"
            />
          </div>
        </div>
      </div>

      <h1 className="text-2xl font-semibold text-gray-900">Appointments</h1>
      {filtered.length === 0 ? (
        <p className="mt-4 text-gray-600" role="status">
          {appointments.length === 0
            ? "No appointments yet."
            : "No appointments match the current filters."}
        </p>
      ) : (
        <ul className="mt-4 space-y-2" role="list">
          {filtered.map((apt) => (
            <li key={apt.id}>
              <Link
                href={`/dashboard/appointments/${apt.id}`}
                className={cn(
                  "block rounded-lg border border-gray-200 bg-white p-4 transition-colors hover:border-blue-300 hover:bg-blue-50/50",
                  "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2",
                  "min-h-[44px]"
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-gray-900">
                    {apt.patient_name}
                  </span>
                  <span
                    className={cn(
                      "inline-block rounded-full px-2 py-0.5 text-xs font-medium",
                      apt.status === "confirmed" &&
                        "bg-green-100 text-green-800",
                      apt.status === "pending" && "bg-amber-100 text-amber-800",
                      apt.status === "cancelled" &&
                        "bg-gray-100 text-gray-700",
                      apt.status === "completed" && "bg-blue-100 text-blue-800"
                    )}
                  >
                    {apt.status}
                  </span>
                </div>
                <p className="mt-1 text-sm text-gray-600">
                  {formatAppointmentDate(apt.appointment_date)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
