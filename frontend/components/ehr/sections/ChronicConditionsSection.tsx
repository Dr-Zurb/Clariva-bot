"use client";

/**
 * ChronicConditionsSection — patient_chronic_conditions as PMH chips.
 * Unified list with per-chip Active | Past toggle.
 */

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { ChartCatalogCombobox } from "@/components/ehr/chart/ChartCatalogCombobox";
import {
  ChartPillToggle,
  countActivePast,
  sortActiveFirst,
} from "@/components/ehr/chart/ChartPillToggle";
import { ChartQuickAddChips } from "@/components/ehr/chart/ChartQuickAddChips";
import { CHART_CHIP_CLASS } from "@/components/ehr/chart/chart-chip-styles";
import {
  archivePatientCondition,
  createPatientCondition,
  listPatientConditions,
  updatePatientCondition,
} from "@/lib/api";
import {
  FAMILY_HISTORY_CONDITION_CATALOG,
  type FamilyHistoryCatalogCondition,
  familyHistoryConditionLabel,
  filterFamilyHistoryConditionCatalog,
  resolveFamilyHistoryCatalogCondition,
} from "@/lib/cockpit/family-history-conditions";
import { cn } from "@/lib/utils";
import type {
  PatientChartLayout,
  PatientChartMode,
  PatientChronicCondition,
  PatientConditionStatus,
} from "@/types/patient-chart";

const PMH_QUICK_ADD: readonly FamilyHistoryCatalogCondition[] = [
  "htn",
  "dm",
  "asthma",
  "ckd",
  "thyroid",
  "cad",
  "dyslipidemia",
] as const;

const CONDITION_STATUS_OPTIONS = [
  { value: "active" as const, label: "Active" },
  { value: "resolved" as const, label: "Past" },
];

interface ChronicConditionsSectionProps {
  patientId: string;
  token: string;
  layout: PatientChartLayout;
  mode: PatientChartMode;
  addOpen?: boolean;
  onAddOpenChange?: (open: boolean) => void;
  onCountChange?: (count: number) => void;
  onStatusCountsChange?: (counts: { active: number; past: number }) => void;
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

function isDuplicateCondition(rows: PatientChronicCondition[], condition: string): boolean {
  const key = normalizeKey(condition);
  return rows.some((row) => normalizeKey(row.condition) === key);
}

function reportCounts(
  rows: PatientChronicCondition[],
  onCountChange?: (count: number) => void,
  onStatusCountsChange?: (counts: { active: number; past: number }) => void,
) {
  onCountChange?.(rows.length);
  const { active, past } = countActivePast(rows);
  onStatusCountsChange?.({ active, past });
}

export default function ChronicConditionsSection({
  patientId,
  token,
  layout: _layout,
  mode,
  addOpen = false,
  onAddOpenChange,
  onCountChange,
  onStatusCountsChange,
}: ChronicConditionsSectionProps) {
  const inputId = useId();
  const [rows, setRows] = useState<PatientChronicCondition[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [focusCombobox, setFocusCombobox] = useState(false);

  const readonly = mode === "readonly";

  useEffect(() => {
    if (addOpen) setFocusCombobox(true);
  }, [addOpen]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await listPatientConditions(token, patientId);
        if (cancelled) return;
        const data = (res.data.conditions ?? []).map((row) => ({
          ...row,
          status: row.status ?? "active",
        }));
        setRows(data);
        reportCounts(data, onCountChange, onStatusCountsChange);
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
  }, [token, patientId, onCountChange, onStatusCountsChange]);

  const sortedRows = useMemo(
    () => (rows ? sortActiveFirst(rows) : []),
    [rows],
  );

  const catalogOptions = useMemo(() => {
    const selected = new Set((rows ?? []).map((row) => normalizeKey(row.condition)));
    return FAMILY_HISTORY_CONDITION_CATALOG.filter(
      (def) => !selected.has(normalizeKey(def.label)),
    ).map((def) => ({ value: def.value, label: def.label }));
  }, [rows]);

  const quickAddLabels = useMemo(() => {
    const selected = new Set((rows ?? []).map((row) => normalizeKey(row.condition)));
    return PMH_QUICK_ADD.map((value) => familyHistoryConditionLabel(value)).filter(
      (label) => !selected.has(normalizeKey(label)),
    );
  }, [rows]);

  const commitCondition = useCallback(
    async (condition: string) => {
      const trimmed = condition.trim();
      if (!trimmed || busy || readonly) return;
      if (rows && isDuplicateCondition(rows, trimmed)) return;

      setActionError(null);
      setBusy(true);

      const tempId = `temp-${Date.now()}`;
      const optimistic: PatientChronicCondition = {
        id: tempId,
        doctor_id: "",
        patient_id: patientId,
        condition: trimmed,
        status: "active",
        diagnosed_on: null,
        note: null,
        archived_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      setRows((prev) => {
        const next = [optimistic, ...(prev ?? [])];
        reportCounts(next, onCountChange, onStatusCountsChange);
        return next;
      });

      try {
        const res = await createPatientCondition(token, patientId, {
          condition: trimmed,
          status: "active",
        });
        const created = res.data.condition;
        setRows((prev) => {
          if (!prev) return [created];
          return prev.map((r) => (r.id === tempId ? created : r));
        });
        onAddOpenChange?.(false);
      } catch (err) {
        setRows((prev) => {
          if (!prev) return prev;
          const next = prev.filter((r) => r.id !== tempId);
          reportCounts(next, onCountChange, onStatusCountsChange);
          return next;
        });
        setActionError(err instanceof Error ? err.message : "Failed to add condition");
      } finally {
        setBusy(false);
      }
    },
    [busy, onAddOpenChange, onCountChange, onStatusCountsChange, patientId, readonly, rows, token],
  );

  const patchStatus = async (row: PatientChronicCondition, status: PatientConditionStatus) => {
    if (busy || row.id.startsWith("temp-") || row.status === status) return;
    setActionError(null);
    setBusy(true);
    const snapshot = rows ?? [];
    setRows((prev) => {
      const next =
        prev?.map((r) => (r.id === row.id ? { ...r, status } : r)) ?? prev;
      if (next) reportCounts(next, onCountChange, onStatusCountsChange);
      return next;
    });
    try {
      await updatePatientCondition(token, patientId, row.id, { status });
    } catch (err) {
      setRows(snapshot);
      reportCounts(snapshot, onCountChange, onStatusCountsChange);
      setActionError(err instanceof Error ? err.message : "Failed to update condition");
    } finally {
      setBusy(false);
    }
  };

  const archive = async (row: PatientChronicCondition) => {
    if (busy || row.id.startsWith("temp-")) return;
    setActionError(null);
    setBusy(true);
    const snapshot = rows ?? [];
    setRows((prev) => {
      if (!prev) return prev;
      const next = prev.filter((r) => r.id !== row.id);
      reportCounts(next, onCountChange, onStatusCountsChange);
      return next;
    });
    try {
      await archivePatientCondition(token, patientId, row.id);
    } catch (err) {
      setRows(snapshot);
      reportCounts(snapshot, onCountChange, onStatusCountsChange);
      setActionError(err instanceof Error ? err.message : "Failed to remove condition");
    } finally {
      setBusy(false);
    }
  };

  if (rows === null) {
    return <p className="px-1 py-2 text-xs text-muted-foreground">Loading conditions…</p>;
  }
  if (loadError) {
    return (
      <p role="alert" className="px-1 py-2 text-xs text-red-600">
        {loadError}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {sortedRows.length > 0 && (
        <div className="space-y-2" data-testid="pmh-chip-list">
          {sortedRows.map((row) => {
            const isPast = row.status === "resolved";
            return (
              <div
                key={row.id}
                className={cn(
                  "flex flex-wrap items-center gap-2",
                  isPast && "opacity-70",
                )}
                data-testid={`pmh-entry-${row.id}`}
              >
                <span className={cn(CHART_CHIP_CLASS, "min-w-0")}>
                  <span
                    className={cn(
                      "min-w-0 truncate font-medium text-foreground",
                      isPast && "line-through",
                    )}
                  >
                    {row.condition}
                  </span>
                  {row.diagnosed_on && (
                    <span className="text-[10px] text-muted-foreground">
                      since {row.diagnosed_on}
                    </span>
                  )}
                </span>
                {!readonly && (
                  <>
                    <ChartPillToggle
                      options={CONDITION_STATUS_OPTIONS}
                      value={row.status}
                      disabled={busy}
                      ariaLabel={`${row.condition} status`}
                      testId={`pmh-status-${row.id}`}
                      onChange={(status) => void patchStatus(row, status)}
                    />
                    <button
                      type="button"
                      disabled={busy}
                      aria-label={`Remove condition ${row.condition}`}
                      onClick={() => void archive(row)}
                      className="shrink-0 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
                    >
                      ×
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!readonly && (
        <>
          <ChartQuickAddChips
            labels={quickAddLabels}
            disabled={busy}
            groupLabel="Common conditions"
            testId="pmh-quick-add"
            onAdd={(label) => void commitCondition(label)}
          />
          <ChartCatalogCombobox
            inputId={inputId}
            testId="pmh-combobox"
            placeholder="Search or enter condition…"
            disabled={busy}
            catalogOptions={catalogOptions}
            filterCatalog={(options, query) =>
              filterFamilyHistoryConditionCatalog(
                FAMILY_HISTORY_CONDITION_CATALOG.filter((def) =>
                  options.some((opt) => opt.value === def.value),
                ),
                query,
              ).map((def) => ({ value: def.value, label: def.label }))
            }
            resolveCatalog={(query) => resolveFamilyHistoryCatalogCondition(query)}
            customLabel={(text) => `Add "${text}" as condition`}
            focusRequest={focusCombobox}
            onFocusRequestHandled={() => {
              setFocusCombobox(false);
              onAddOpenChange?.(false);
            }}
            onCommit={(payload) => {
              const condition = payload.kind === "catalog" ? payload.label : payload.text;
              void commitCondition(condition);
            }}
          />
        </>
      )}

      {rows.length === 0 && readonly && (
        <p className="px-1 py-1 text-xs text-muted-foreground">No medical conditions recorded.</p>
      )}

      {actionError && (
        <p role="alert" className="text-xs text-red-600">
          {actionError}
        </p>
      )}
    </div>
  );
}
