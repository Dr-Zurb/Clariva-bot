"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DuplicateGroupPatient, PatientSummary } from "@/types/patient";
import { useSearchParams } from "next/navigation";
import { BulkActionsBar } from "@/components/patients-v2/list/BulkActionsBar";
import { DuplicatesCollapsedChip } from "@/components/patients-v2/list/DuplicatesCollapsedChip";
import { PatientsKpiStrip } from "@/components/patients-v2/list/PatientsKpiStrip";
import { PatientsTable } from "@/components/patients-v2/list/PatientsTable";
import { PatientsToolbar } from "@/components/patients-v2/list/PatientsToolbar";
import {
  hasListFilterParams,
  usePatientsListFilters,
} from "@/hooks/usePatientsListFilters";
import {
  deletePatientSavedView,
  getPatientSavedViews,
  getPatientsKpis,
  getPossibleDuplicates,
  upsertPatientSavedView,
} from "@/lib/api/patients";
import {
  trackPatientsV2ListViewed,
  trackPatientsV2SavedViewApplied,
} from "@/lib/patients-v2/telemetry";
import {
  readColumnsFromStorage,
  readDensityFromStorage,
  writeColumnsToStorage,
  writeDensityToStorage,
  type PatientListColumnId,
  type PatientsListDensity,
} from "@/lib/patients-v2/list-preferences";
import type { PatientSavedView, PatientsKpis } from "@/types/patient";

const MAX_LIST_VIEWS = 5;

interface PatientsV2PageProps {
  token: string;
  userId: string;
}

/**
 * Patients v2 list client island — KPI strip (pr-05), toolbar (pr-06), table (pr-07).
 */
export default function PatientsV2Page({ token, userId }: PatientsV2PageProps) {
  const searchParams = useSearchParams();
  const {
    filters,
    q,
    activeSegment,
    setQ,
    toggleSegment,
    applyFilters,
    setSort,
    setPage,
    clearListFilters,
  } = usePatientsListFilters();

  const [kpis, setKpis] = useState<PatientsKpis | null>(null);
  const [kpiError, setKpiError] = useState<string | null>(null);
  const [savedViews, setSavedViews] = useState<PatientSavedView[]>([]);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [density, setDensity] = useState<PatientsListDensity>("comfortable");
  const [columns, setColumns] = useState<PatientListColumnId[]>([]);
  const [selectedPatientIds, setSelectedPatientIds] = useState<string[]>([]);
  const [loadedRows, setLoadedRows] = useState<PatientSummary[]>([]);
  const [tableRefreshKey, setTableRefreshKey] = useState(0);
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroupPatient[][]>(
    [],
  );
  const [duplicatesPopoverOpen, setDuplicatesPopoverOpen] = useState(false);

  const selectedPatients = useMemo(
    () => loadedRows.filter((p) => selectedPatientIds.includes(p.id)),
    [loadedRows, selectedPatientIds],
  );
  const defaultViewAppliedRef = useRef(false);
  const listViewedSent = useRef(false);

  const loadKpis = useCallback(() => {
    setKpiError(null);
    setKpis(null);
    return getPatientsKpis(token)
      .then((data) => setKpis(data))
      .catch((e) =>
        setKpiError(e instanceof Error ? e.message : "Failed to load KPIs"),
      );
  }, [token]);

  const loadDuplicates = useCallback(() => {
    return getPossibleDuplicates(token)
      .then((groups) => setDuplicateGroups(groups))
      .catch((e) => {
        console.error("[PatientsV2Page] possible duplicates load failed:", e);
      });
  }, [token]);

  const handleDuplicatesMerged = useCallback(() => {
    void loadDuplicates();
    void loadKpis();
    setTableRefreshKey((k) => k + 1);
  }, [loadDuplicates, loadKpis]);

  const refreshSavedViews = useCallback(() => {
    return getPatientSavedViews(token)
      .then(setSavedViews)
      .catch((e) => {
        console.error("[PatientsV2Page] saved views load failed:", e);
      });
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    getPatientsKpis(token)
      .then((data) => {
        if (!cancelled) setKpis(data);
      })
      .catch((e) => {
        if (!cancelled) {
          setKpiError(e instanceof Error ? e.message : "Failed to load KPIs");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    void refreshSavedViews();
  }, [refreshSavedViews]);

  useEffect(() => {
    void loadDuplicates();
  }, [loadDuplicates]);

  useEffect(() => {
    setDensity(readDensityFromStorage());
    setColumns(readColumnsFromStorage(userId));
  }, [userId]);

  const applySavedView = useCallback(
    (view: PatientSavedView) => {
      applyFilters({ ...view.filters, page: 1 });
      if (view.columns && view.columns.length > 0) {
        setColumns(view.columns as PatientListColumnId[]);
      }
      setActiveViewId(view.id);
      trackPatientsV2SavedViewApplied(view.id);
    },
    [applyFilters],
  );

  useEffect(() => {
    if (listViewedSent.current) return;
    listViewedSent.current = true;
    trackPatientsV2ListViewed();
  }, []);

  useEffect(() => {
    if (defaultViewAppliedRef.current || savedViews.length === 0) return;
    if (hasListFilterParams(searchParams)) {
      defaultViewAppliedRef.current = true;
      return;
    }
    const defaultView = savedViews.find((v) => v.is_default);
    defaultViewAppliedRef.current = true;
    if (defaultView) {
      applySavedView(defaultView);
    }
  }, [applySavedView, savedViews, searchParams]);

  const handleDensityChange = useCallback((next: PatientsListDensity) => {
    setDensity(next);
    writeDensityToStorage(next);
  }, []);

  const handleColumnsChange = useCallback(
    (next: PatientListColumnId[]) => {
      setColumns(next);
      if (!activeViewId) {
        writeColumnsToStorage(userId, next);
        return;
      }
      const activeView = savedViews.find((v) => v.id === activeViewId);
      if (activeView) {
        void upsertPatientSavedView(token, { ...activeView, columns: next }).then(() =>
          refreshSavedViews(),
        );
      }
    },
    [activeViewId, refreshSavedViews, savedViews, token, userId],
  );

  const nextEvictionTarget = useMemo((): PatientSavedView | null => {
    if (savedViews.length < MAX_LIST_VIEWS) return null;
    return (
      [...savedViews].sort((a, b) => a.created_at.localeCompare(b.created_at))[0] ?? null
    );
  }, [savedViews]);

  const handleSaveView = useCallback(
    async (name: string, setAsDefault: boolean) => {
      if (nextEvictionTarget) {
        await deletePatientSavedView(token, nextEvictionTarget.id);
      }
      const view: PatientSavedView = {
        id: crypto.randomUUID(),
        name,
        is_default: setAsDefault,
        filters: { ...filters, page: 1 },
        columns: [...columns],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const saved = await upsertPatientSavedView(token, view);
      await refreshSavedViews();
      setActiveViewId(saved.id);
    },
    [columns, filters, nextEvictionTarget, refreshSavedViews, token],
  );

  const handleRenameView = useCallback(
    async (id: string, newName: string) => {
      const existing = savedViews.find((v) => v.id === id);
      if (!existing) return;
      await upsertPatientSavedView(token, { ...existing, name: newName });
      await refreshSavedViews();
    },
    [refreshSavedViews, savedViews, token],
  );

  const handleDeleteView = useCallback(
    async (id: string) => {
      await deletePatientSavedView(token, id);
      if (activeViewId === id) setActiveViewId(null);
      await refreshSavedViews();
    },
    [activeViewId, refreshSavedViews, token],
  );

  const handleSetDefaultView = useCallback(
    async (id: string) => {
      const existing = savedViews.find((v) => v.id === id);
      if (!existing) return;
      await upsertPatientSavedView(token, { ...existing, is_default: true });
      await refreshSavedViews();
    },
    [refreshSavedViews, savedViews, token],
  );

  const handleKpiSegmentSelect = useCallback(
    (segment: Parameters<typeof toggleSegment>[0]) => {
      setActiveViewId(null);
      toggleSegment(segment);
    },
    [toggleSegment],
  );

  const handleToolbarSegmentToggle = useCallback(
    (segment: Parameters<typeof toggleSegment>[0]) => {
      setActiveViewId(null);
      toggleSegment(segment);
    },
    [toggleSegment],
  );

  return (
    <div className="space-y-4 p-6">
      <h1 className="text-2xl font-semibold">Patients</h1>

      <PatientsKpiStrip
        kpis={kpis}
        error={kpiError}
        activeSegment={activeSegment}
        onSegmentSelect={handleKpiSegmentSelect}
        possibleDuplicatesCount={duplicateGroups.length}
        onDuplicatesOpen={() => setDuplicatesPopoverOpen(true)}
        onRetry={loadKpis}
      />

      <PatientsToolbar
        q={q}
        onQChange={(next) => {
          setActiveViewId(null);
          setQ(next);
        }}
        activeSegment={activeSegment}
        onSegmentToggle={handleToolbarSegmentToggle}
        savedViews={savedViews}
        activeViewId={activeViewId}
        onViewSelect={(view) => applySavedView(view)}
        onSaveView={handleSaveView}
        onRenameView={handleRenameView}
        onDeleteView={handleDeleteView}
        onSetDefaultView={handleSetDefaultView}
        nextEvictionTarget={nextEvictionTarget}
        density={density}
        onDensityChange={handleDensityChange}
        columns={columns}
        onColumnsChange={handleColumnsChange}
        selectedCount={selectedPatientIds.length}
        bulkActionsSlot={
          selectedPatientIds.length > 0 ? (
            <BulkActionsBar
              selectedCount={selectedPatientIds.length}
              selectedPatients={selectedPatients}
              token={token}
              onClear={() => setSelectedPatientIds([])}
              onTagged={() => setTableRefreshKey((k) => k + 1)}
            />
          ) : null
        }
        duplicatesSlot={
          <DuplicatesCollapsedChip
            duplicateGroups={duplicateGroups}
            onMerged={handleDuplicatesMerged}
            open={duplicatesPopoverOpen}
            onOpenChange={setDuplicatesPopoverOpen}
          />
        }
      />

      <PatientsTable
        filters={filters}
        visibleColumns={columns}
        density={density}
        selectedPatientIds={selectedPatientIds}
        onSelectionChange={setSelectedPatientIds}
        onSortChange={setSort}
        onPageChange={setPage}
        onClearFilters={clearListFilters}
        token={token}
        refreshKey={tableRefreshKey}
        onDataLoaded={setLoadedRows}
      />
    </div>
  );
}
