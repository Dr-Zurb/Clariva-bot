"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { PatientSummary } from "@/types/patient";
import { useSearchParams } from "next/navigation";
import { AddPatientDialog } from "@/components/patients-v2/AddPatientDialog";
import { BulkActionsBar } from "@/components/patients-v2/list/BulkActionsBar";
import { PatientsKpiStrip } from "@/components/patients-v2/list/PatientsKpiStrip";
import { PatientsTable } from "@/components/patients-v2/list/PatientsTable";
import { PatientsToolbar } from "@/components/patients-v2/list/PatientsToolbar";
import {
  hasListFilterParams,
  usePatientsListFilters,
} from "@/hooks/usePatientsListFilters";
import { usePrefetchPatientsListSegments } from "@/hooks/usePrefetchPatientsListSegments";
import {
  bulkTagPatients,
  deletePatientSavedView,
  getPatientSavedViews,
  getPatientsKpis,
  upsertPatientSavedView,
} from "@/lib/api/patients";
import {
  applyTagOp,
  coercePatientTags,
  patientHasTag,
  type PatientTagOp,
} from "@/lib/patients-v2/patient-tags";
import { patchPatientTagsInListCache } from "@/lib/patients-v2/patch-patient-tags-cache";
import {
  trackPatientsV2BulkAction,
  trackPatientsV2ListViewed,
  trackPatientsV2SavedViewApplied,
} from "@/lib/patients-v2/telemetry";
import {
  readColumnsFromStorage,
  writeColumnsToStorage,
  type PatientListColumnId,
} from "@/lib/patients-v2/list-preferences";
import { queryKeys } from "@/lib/query/keys";
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
  const queryClient = useQueryClient();
  const {
    filters,
    q,
    activeSegment,
    activeTag,
    setQ,
    toggleSegment,
    setTag,
    toggleTag,
    applyFilters,
    setSort,
    setPage,
    clearListFilters,
  } = usePatientsListFilters();

  const prefetchSegment = usePrefetchPatientsListSegments(token, filters);

  const [kpis, setKpis] = useState<PatientsKpis | null>(null);
  const [kpiError, setKpiError] = useState<string | null>(null);
  const [savedViews, setSavedViews] = useState<PatientSavedView[]>([]);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [columns, setColumns] = useState<PatientListColumnId[]>([]);
  const [addPatientOpen, setAddPatientOpen] = useState(false);
  const [selectedPatientIds, setSelectedPatientIds] = useState<string[]>([]);
  const [loadedRows, setLoadedRows] = useState<PatientSummary[]>([]);
  const [rosterPatients, setRosterPatients] = useState<PatientSummary[]>([]);
  const [knownTags, setKnownTags] = useState<string[]>([]);

  const mergeKnownTags = useCallback((tags: Array<string | null | undefined>) => {
    setKnownTags((prev) => {
      // Case-insensitive merge; keep first-seen casing.
      const byKey = new Map<string, string>();
      for (const t of prev) byKey.set(t.toLowerCase(), t);
      for (const t of tags) {
        const trimmed = t?.trim();
        if (!trimmed) continue;
        const key = trimmed.toLowerCase();
        if (!byKey.has(key)) byKey.set(key, trimmed);
      }
      return Array.from(byKey.values()).sort((a, b) =>
        a.localeCompare(b, undefined, { sensitivity: "base" }),
      );
    });
  }, []);

  const handleDataLoaded = useCallback((rows: PatientSummary[]) => {
    setLoadedRows(rows);
  }, []);

  const handleRosterLoaded = useCallback(
    (rows: PatientSummary[]) => {
      setRosterPatients(rows);
      mergeKnownTags(
        rows.flatMap((r) => coercePatientTags(r.patient_tags, r.patient_tag)),
      );
    },
    [mergeKnownTags],
  );

  /** Prefer page rows (fresher), fall back to roster for cross-page selection. */
  const patientById = useMemo(() => {
    const map = new Map<string, PatientSummary>();
    for (const p of rosterPatients) map.set(p.id, p);
    for (const p of loadedRows) map.set(p.id, p);
    return map;
  }, [rosterPatients, loadedRows]);

  const selectedPatients = useMemo(
    () =>
      selectedPatientIds
        .map((id) => patientById.get(id))
        .filter((p): p is PatientSummary => p != null),
    [patientById, selectedPatientIds],
  );

  const applyLocalTagPatch = useCallback(
    (op: PatientTagOp, tags: string[], patientIds: string[]) => {
      patchPatientTagsInListCache(queryClient, patientIds, op, tags);
      if (op === "add" || op === "set") mergeKnownTags(tags);
      const idSet = new Set(patientIds);
      const patchRow = (p: PatientSummary): PatientSummary => {
        if (!idSet.has(p.id)) return p;
        const next = applyTagOp(
          coercePatientTags(p.patient_tags, p.patient_tag),
          op,
          tags,
        );
        return {
          ...p,
          patient_tags: next,
          patient_tag: next[0] ?? null,
        };
      };
      setLoadedRows((prev) => prev.map(patchRow));
      setRosterPatients((prev) => prev.map(patchRow));
    },
    [mergeKnownTags, queryClient],
  );

  const handleRemoveTag = useCallback(
    (patientId: string, tag: string) => {
      // Optimistic — badge disappears immediately; refetch heals on failure.
      applyLocalTagPatch("remove", [tag], [patientId]);
      void bulkTagPatients(token, [patientId], {
        op: "remove",
        tags: [tag],
      }).catch(() => {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.patients.all,
        });
      });
    },
    [applyLocalTagPatch, queryClient, token],
  );

  /** Delete a tag everywhere it appears (roster ∪ current page) + drop from known list. */
  const handleDeleteKnownTag = useCallback(
    (tag: string) => {
      const key = tag.toLowerCase();
      setKnownTags((prev) => prev.filter((t) => t.toLowerCase() !== key));

      const ids = Array.from(patientById.values())
        .filter((p) =>
          patientHasTag(coercePatientTags(p.patient_tags, p.patient_tag), tag),
        )
        .map((p) => p.id);

      if (ids.length === 0) return;

      applyLocalTagPatch("remove", [tag], ids);

      const CHUNK = 200;
      void (async () => {
        try {
          for (let i = 0; i < ids.length; i += CHUNK) {
            await bulkTagPatients(token, ids.slice(i, i + CHUNK), {
              op: "remove",
              tags: [tag],
            });
          }
          trackPatientsV2BulkAction("tag", ids.length);
        } catch {
          void queryClient.invalidateQueries({
            queryKey: queryKeys.patients.all,
          });
        }
      })();
    },
    [applyLocalTagPatch, patientById, queryClient, token],
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
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      <div className="shrink-0 space-y-3">
        <h1 className="text-2xl font-semibold text-foreground">Patients</h1>

        <PatientsKpiStrip
          kpis={kpis}
          error={kpiError}
          activeSegment={activeSegment}
          onSegmentSelect={handleKpiSegmentSelect}
          onSegmentPrefetch={prefetchSegment}
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
          onSegmentPrefetch={prefetchSegment}
          activeTag={activeTag}
          onTagToggle={(tag) => {
            setActiveViewId(null);
            toggleTag(tag);
          }}
          onTagClear={() => {
            setActiveViewId(null);
            setTag(null);
          }}
          knownTags={knownTags}
          savedViews={savedViews}
          activeViewId={activeViewId}
          onViewSelect={(view) => applySavedView(view)}
          onSaveView={handleSaveView}
          onRenameView={handleRenameView}
          onDeleteView={handleDeleteView}
          onSetDefaultView={handleSetDefaultView}
          nextEvictionTarget={nextEvictionTarget}
          columns={columns}
          onColumnsChange={handleColumnsChange}
          onAddPatient={() => setAddPatientOpen(true)}
          selectedCount={selectedPatientIds.length}
          bulkActionsSlot={
            selectedPatientIds.length > 0 ? (
              <BulkActionsBar
                selectedCount={selectedPatientIds.length}
                selectedPatientIds={selectedPatientIds}
                selectedPatients={selectedPatients}
                token={token}
                knownTags={knownTags}
                onClear={() => setSelectedPatientIds([])}
                onTagged={applyLocalTagPatch}
                onTagFailed={() => {
                  void queryClient.invalidateQueries({
                    queryKey: queryKeys.patients.all,
                  });
                }}
                onDeleteKnownTag={handleDeleteKnownTag}
              />
            ) : null
          }
        />
      </div>

      <AddPatientDialog
        token={token}
        open={addPatientOpen}
        onOpenChange={setAddPatientOpen}
      />

      <PatientsTable
        filters={filters}
        visibleColumns={columns}
        selectedPatientIds={selectedPatientIds}
        onSelectionChange={setSelectedPatientIds}
        onSortChange={setSort}
        onPageChange={setPage}
        onClearFilters={clearListFilters}
        token={token}
        onDataLoaded={handleDataLoaded}
        onRosterLoaded={handleRosterLoaded}
        onFilterByTag={(tag) => {
          setActiveViewId(null);
          setTag(tag);
        }}
        onRemoveTag={(patientId, tag) => {
          void handleRemoveTag(patientId, tag);
        }}
      />
    </div>
  );
}
