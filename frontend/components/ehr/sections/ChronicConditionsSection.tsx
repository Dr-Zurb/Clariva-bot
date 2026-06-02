"use client";

/**
 * ChronicConditionsSection (EHR Sub-batch A / T1.3)
 *
 * Lists patient_chronic_conditions rows. Mirrors AllergiesSection's
 * shape: optimistic add + archive, controlled `addOpen` from the
 * parent SectionWrapper.
 */

import { useEffect, useState } from "react";
import {
  archivePatientCondition,
  createPatientCondition,
  listPatientConditions,
} from "@/lib/api";
import type {
  PatientChartLayout,
  PatientChartMode,
  PatientChronicCondition,
} from "@/types/patient-chart";

interface ChronicConditionsSectionProps {
  patientId: string;
  token: string;
  layout: PatientChartLayout;
  mode: PatientChartMode;
  addOpen: boolean;
  onAddOpenChange: (open: boolean) => void;
  onCountChange?: (count: number) => void;
}

export default function ChronicConditionsSection({
  patientId,
  token,
  layout: _layout,
  mode,
  addOpen,
  onAddOpenChange,
  onCountChange,
}: ChronicConditionsSectionProps) {
  const [rows, setRows] = useState<PatientChronicCondition[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const [condition, setCondition] = useState("");
  const [diagnosedOn, setDiagnosedOn] = useState("");

  const readonly = mode === "readonly";

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await listPatientConditions(token, patientId);
        if (cancelled) return;
        const data = res.data.conditions ?? [];
        setRows(data);
        onCountChange?.(data.length);
      } catch (err) {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : "Failed to load conditions");
        setRows([]);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [token, patientId, onCountChange]);

  const submitAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = condition.trim();
    if (!trimmed || busy) return;
    setActionError(null);
    setBusy(true);

    const tempId = `temp-${Date.now()}`;
    const optimistic: PatientChronicCondition = {
      id: tempId,
      doctor_id: "",
      patient_id: patientId,
      condition: trimmed,
      diagnosed_on: diagnosedOn || null,
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
      const res = await createPatientCondition(token, patientId, {
        condition: trimmed,
        diagnosedOn: diagnosedOn || null,
      });
      const created = res.data.condition;
      setRows((prev) => {
        if (!prev) return [created];
        return prev.map((r) => (r.id === tempId ? created : r));
      });
      setCondition("");
      setDiagnosedOn("");
      onAddOpenChange(false);
    } catch (err) {
      setRows((prev) => {
        if (!prev) return prev;
        const next = prev.filter((r) => r.id !== tempId);
        onCountChange?.(next.length);
        return next;
      });
      setActionError(err instanceof Error ? err.message : "Failed to add condition");
    } finally {
      setBusy(false);
    }
  };

  const archive = async (row: PatientChronicCondition) => {
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
      await archivePatientCondition(token, patientId, row.id);
    } catch (err) {
      setRows(snapshot);
      onCountChange?.(snapshot.length);
      setActionError(err instanceof Error ? err.message : "Failed to remove condition");
    } finally {
      setBusy(false);
    }
  };

  if (rows === null) {
    return <p className="px-1 py-2 text-xs text-gray-400">Loading conditions…</p>;
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
      {!readonly && addOpen && (
        <form onSubmit={submitAdd} className="space-y-2 rounded-md border border-gray-200 bg-gray-50 p-2">
          <input
            type="text"
            value={condition}
            onChange={(e) => setCondition(e.target.value)}
            placeholder="Condition (e.g. Type 2 Diabetes)"
            maxLength={200}
            required
            disabled={busy}
            aria-label="Condition"
            className="block w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
          />
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-600" htmlFor="diagnosed-on">
              Diagnosed:
            </label>
            <input
              id="diagnosed-on"
              type="date"
              value={diagnosedOn}
              onChange={(e) => setDiagnosedOn(e.target.value)}
              disabled={busy}
              className="rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setCondition("");
                setDiagnosedOn("");
                onAddOpenChange(false);
              }}
              disabled={busy}
              className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || !condition.trim()}
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
          No chronic conditions recorded.
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
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-900">{row.condition}</p>
                {row.diagnosed_on && (
                  <p className="text-xs text-gray-500">Since {row.diagnosed_on}</p>
                )}
              </div>
              {!readonly && !row.id.startsWith("temp-") && (
                <button
                  type="button"
                  onClick={() => archive(row)}
                  disabled={busy}
                  aria-label={`Remove condition ${row.condition}`}
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
