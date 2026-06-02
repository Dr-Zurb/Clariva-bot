"use client";

/**
 * AllergiesSection (EHR Sub-batch A / T1.3)
 *
 * Lists patient_allergies rows for the current doctor + patient. Add /
 * archive flows are local + optimistic (the row appears / disappears
 * immediately; on server error we roll back and surface the message).
 *
 * Hosted by <PatientChartPanel> via <SectionWrapper title="Allergies">.
 * The wrapper owns the collapse/expand and the "+ Add" affordance —
 * this component just renders the body and exposes an imperative
 * `openAdd()` via a controlled `addOpen` prop pattern.
 *
 * Future hooks:
 *   - T2.7 may canonicalize allergens against drug_master.
 *   - T4.18 reads this same data to render the allergy-clash banner.
 */

import { useEffect, useState } from "react";
import {
  archivePatientAllergy,
  createPatientAllergy,
  listPatientAllergies,
} from "@/lib/api";
import type {
  PatientAllergy,
  PatientAllergySeverity,
  PatientChartLayout,
  PatientChartMode,
} from "@/types/patient-chart";

interface AllergiesSectionProps {
  patientId: string;
  token: string;
  layout: PatientChartLayout;
  mode: PatientChartMode;
  /** Controlled "is the inline add form open?" — owned by the parent so the
   *  SectionWrapper "+ Add" button can drive it. */
  addOpen: boolean;
  onAddOpenChange: (open: boolean) => void;
  /** Notify parent of the row count for the section badge. */
  onCountChange?: (count: number) => void;
}

const SEVERITY_OPTIONS: { value: PatientAllergySeverity; label: string }[] = [
  { value: "unknown", label: "Unknown" },
  { value: "mild", label: "Mild" },
  { value: "moderate", label: "Moderate" },
  { value: "severe", label: "Severe" },
];

const SEVERITY_BADGE_CLASS: Record<PatientAllergySeverity, string> = {
  mild: "bg-yellow-50 text-yellow-700 ring-yellow-600/20",
  moderate: "bg-orange-50 text-orange-700 ring-orange-600/20",
  severe: "bg-red-50 text-red-700 ring-red-600/20",
  unknown: "bg-gray-50 text-gray-600 ring-gray-500/10",
};

export default function AllergiesSection({
  patientId,
  token,
  layout: _layout,
  mode,
  addOpen,
  onAddOpenChange,
  onCountChange,
}: AllergiesSectionProps) {
  const [rows, setRows] = useState<PatientAllergy[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Add-form fields
  const [allergen, setAllergen] = useState("");
  const [severity, setSeverity] = useState<PatientAllergySeverity>("unknown");
  const [reaction, setReaction] = useState("");

  const readonly = mode === "readonly";

  // -------- load --------
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await listPatientAllergies(token, patientId);
        if (cancelled) return;
        const data = res.data.allergies ?? [];
        setRows(data);
        onCountChange?.(data.length);
      } catch (err) {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : "Failed to load allergies");
        setRows([]);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [token, patientId, onCountChange]);

  // -------- add (optimistic) --------
  const submitAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = allergen.trim();
    if (!trimmed || busy) return;
    setActionError(null);
    setBusy(true);

    // Optimistic placeholder. Use a temp id so we can swap with the server row.
    const tempId = `temp-${Date.now()}`;
    const optimistic: PatientAllergy = {
      id: tempId,
      doctor_id: "", // server-owned; ok to leave blank for the placeholder
      patient_id: patientId,
      allergen: trimmed,
      severity,
      reaction: reaction.trim() || null,
      note: null,
      archived_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    setRows((prev) => {
      const next = [optimistic, ...(prev ?? [])];
      onCountChange?.(next.length);
      return next;
    });

    try {
      const res = await createPatientAllergy(token, patientId, {
        allergen: trimmed,
        severity,
        reaction: reaction.trim() || null,
      });
      const created = res.data.allergy;
      // Swap temp row with server row.
      setRows((prev) => {
        if (!prev) return [created];
        return prev.map((r) => (r.id === tempId ? created : r));
      });
      // Reset form.
      setAllergen("");
      setSeverity("unknown");
      setReaction("");
      onAddOpenChange(false);
    } catch (err) {
      // Rollback.
      setRows((prev) => {
        if (!prev) return prev;
        const next = prev.filter((r) => r.id !== tempId);
        onCountChange?.(next.length);
        return next;
      });
      setActionError(err instanceof Error ? err.message : "Failed to add allergy");
    } finally {
      setBusy(false);
    }
  };

  // -------- archive (optimistic) --------
  const archive = async (row: PatientAllergy) => {
    if (busy) return;
    setActionError(null);
    setBusy(true);
    const snapshot = rows ?? [];
    setRows((prev) => {
      if (!prev) return prev;
      const next = prev.filter((r) => r.id !== row.id);
      onCountChange?.(next.length);
      return next;
    });
    try {
      await archivePatientAllergy(token, patientId, row.id);
    } catch (err) {
      // Roll back.
      setRows(snapshot);
      onCountChange?.(snapshot.length);
      setActionError(err instanceof Error ? err.message : "Failed to remove allergy");
    } finally {
      setBusy(false);
    }
  };

  // -------- render --------
  if (rows === null) {
    return <p className="px-1 py-2 text-xs text-gray-400">Loading allergies…</p>;
  }
  if (loadError) {
    return (
      <p role="alert" className="px-1 py-2 text-xs text-red-600">
        {loadError}
      </p>
    );
  }

  const empty = rows.length === 0;

  return (
    <div className="space-y-2">
      {/* Inline add form (rendered when parent says addOpen=true). */}
      {!readonly && addOpen && (
        <form onSubmit={submitAdd} className="space-y-2 rounded-md border border-gray-200 bg-gray-50 p-2">
          <div>
            <label htmlFor="allergen" className="sr-only">
              Allergen
            </label>
            <input
              id="allergen"
              type="text"
              value={allergen}
              onChange={(e) => setAllergen(e.target.value)}
              placeholder="Allergen (e.g. Penicillin, Peanuts)"
              maxLength={200}
              required
              disabled={busy}
              className="block w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
            />
          </div>
          <div className="flex gap-2">
            <select
              value={severity}
              onChange={(e) => setSeverity(e.target.value as PatientAllergySeverity)}
              disabled={busy}
              aria-label="Severity"
              className="rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
            >
              {SEVERITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={reaction}
              onChange={(e) => setReaction(e.target.value)}
              placeholder="Reaction (optional)"
              maxLength={200}
              disabled={busy}
              className="block flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setAllergen("");
                setReaction("");
                setSeverity("unknown");
                onAddOpenChange(false);
              }}
              disabled={busy}
              className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || !allergen.trim()}
              className="rounded-md bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      )}

      {actionError && (
        <p role="alert" className="text-xs text-red-600">
          {actionError}
        </p>
      )}

      {empty ? (
        <p className="px-1 py-2 text-xs text-gray-500">
          No allergies recorded.
          {!readonly && !addOpen && (
            <>
              {" "}
              <button
                type="button"
                onClick={() => onAddOpenChange(true)}
                className="font-medium text-blue-600 hover:text-blue-700"
              >
                Add one
              </button>
              .
            </>
          )}
        </p>
      ) : (
        <ul className="space-y-1">
          {rows.map((row) => (
            <li
              key={row.id}
              className="group flex items-start gap-2 rounded px-1 py-1 hover:bg-gray-50"
            >
              <span
                className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ring-1 ring-inset ${
                  SEVERITY_BADGE_CLASS[row.severity]
                }`}
              >
                {row.severity}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-900">{row.allergen}</p>
                {row.reaction && (
                  <p className="truncate text-xs text-gray-500">{row.reaction}</p>
                )}
              </div>
              {!readonly && !row.id.startsWith("temp-") && (
                <button
                  type="button"
                  onClick={() => archive(row)}
                  disabled={busy}
                  aria-label={`Remove allergy ${row.allergen}`}
                  className="invisible text-xs text-gray-400 hover:text-red-600 group-hover:visible disabled:opacity-50"
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
