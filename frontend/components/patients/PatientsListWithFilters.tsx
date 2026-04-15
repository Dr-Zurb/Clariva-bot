"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import type { PatientSummary, DuplicateGroupPatient } from "@/types/patient";
import MergePatientsModal from "./MergePatientsModal";

interface PatientsListWithFiltersProps {
  patients: PatientSummary[];
  duplicateGroups?: DuplicateGroupPatient[][];
}

/** Mask phone: show last 4 digits only (e.g. ••••••1234). */
function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "••••";
  return "••••••" + digits.slice(-4);
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { dateStyle: "medium" });
  } catch {
    return iso;
  }
}

/**
 * Client component: filters patients by name. Displays list with links to detail.
 * @see e-task-4
 */
export default function PatientsListWithFilters({
  patients,
  duplicateGroups = [],
}: PatientsListWithFiltersProps) {
  const router = useRouter();
  const [searchName, setSearchName] = useState<string>("");
  const [mergeModalGroup, setMergeModalGroup] = useState<DuplicateGroupPatient[] | null>(null);

  const filtered = useMemo(() => {
    if (!searchName.trim()) return patients;
    const q = searchName.trim().toLowerCase();
    return patients.filter((p) => p.name.toLowerCase().includes(q));
  }, [patients, searchName]);

  return (
    <div>
      <div
        className="mb-4 rounded-lg border border-gray-200 bg-gray-50/50 p-4 sm:p-4"
        role="group"
        aria-label="Filter patients"
      >
        <h2 className="sr-only">Filters</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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

      {duplicateGroups.length > 0 && (
        <section
          className="mb-6 rounded-lg border border-amber-200 bg-amber-50/50 p-4"
          aria-labelledby="possible-duplicates-heading"
        >
          <h2 id="possible-duplicates-heading" className="text-lg font-medium text-amber-900">
            Possible duplicates
          </h2>
          <p className="mt-1 text-sm text-amber-800">
            These patients may be the same person (same phone number). Merge to combine records.
          </p>
          <ul className="mt-3 space-y-2">
            {duplicateGroups.map((group, idx) => (
              <li
                key={idx}
                className="flex flex-wrap items-center justify-between gap-2 rounded border border-amber-200 bg-white p-3"
              >
                <span className="text-sm text-gray-700">
                  {group.map((p) => p.name).join(", ")}
                </span>
                <button
                  type="button"
                  onClick={() => setMergeModalGroup(group)}
                  className="rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2"
                >
                  Merge
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {mergeModalGroup && (
        <MergePatientsModal
          group={mergeModalGroup}
          onClose={() => setMergeModalGroup(null)}
          onSuccess={() => router.refresh()}
        />
      )}

      <h1 className="text-2xl font-semibold text-gray-900">Patients</h1>
      {filtered.length === 0 ? (
        patients.length === 0 ? (
          <div
            className="mt-4 rounded-lg border border-gray-200 bg-gray-50/80 p-6 sm:p-8"
            role="status"
            aria-live="polite"
          >
            <p className="text-base font-medium text-gray-900">No registered patients yet</p>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-gray-600">
              This list shows people who have completed registration with your practice—usually after
              their first successful payment, or when a no-fee or zero-fee booking is confirmed.
              Conversations still in progress may not appear here until registration completes; that
              is expected.
            </p>
          </div>
        ) : (
          <p className="mt-4 text-gray-600" role="status">
            No patients match the current filters.
          </p>
        )
      ) : (
        <ul className="mt-4 space-y-2" role="list">
          {filtered.map((patient) => (
            <li key={patient.id}>
              <Link
                href={`/dashboard/patients/${patient.id}`}
                className={cn(
                  "block rounded-lg border border-gray-200 bg-white p-4 transition-colors hover:border-blue-300 hover:bg-blue-50/50",
                  "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2",
                  "min-h-[44px]"
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-gray-900">
                    {patient.name}
                  </span>
                  {patient.medical_record_number && (
                    <span className="text-xs text-gray-500">
                      MRN: {patient.medical_record_number}
                    </span>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
                  <span>Phone: {maskPhone(patient.phone)}</span>
                  {patient.age != null && (
                    <span>Age: {patient.age}</span>
                  )}
                  {patient.gender && (
                    <span>{patient.gender}</span>
                  )}
                  {patient.last_appointment_date && (
                    <span>
                      Last visit: {formatDate(patient.last_appointment_date)}
                    </span>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
