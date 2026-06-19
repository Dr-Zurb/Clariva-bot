"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { Stethoscope, User } from "lucide-react";
import { ExamSystemList } from "@/components/cockpit/rx/inputs/ExamSystemList";
import { VitalsGrid } from "@/components/cockpit/rx/inputs/VitalsGrid";
import { useRxForm } from "@/components/cockpit/rx/RxFormContext";
import { usePrescriptionFormShell } from "@/components/cockpit/rx/PrescriptionFormShellContext";
import { CollapsibleContainer } from "@/components/ui/CollapsibleContainer";
import {
  ObjectiveSectionDragHandle,
  ObjectiveSortableSectionShell,
} from "@/components/cockpit/rx/objective/ObjectiveSortableSectionShell";
import { ManageObjectiveSectionsMenu } from "@/components/cockpit/rx/objective/ManageObjectiveSectionsMenu";
import {
  ObjectiveCustomSectionBlock,
  ObjectiveCustomSectionsChrome,
} from "@/components/cockpit/rx/objective/CustomObjectiveSectionsField";
import {
  RX_FIELD_INPUT_CLASS,
  RX_FIELD_LABEL_CLASS,
  RX_SECTION_HEADING_CLASS,
} from "@/components/cockpit/rx/sections/field-styles";
import { parseExam, serializeExam } from "@/lib/cockpit/exam-findings";
import { createEmptyCustomSubsection } from "@/lib/cockpit/custom-subsections";
import { getAppointmentById, getDoctorSettings } from "@/lib/api";
import {
  DEFAULT_OBJECTIVE_SECTION_ORDER,
  OBJECTIVE_SECTION_DRAG_MIME,
  customBlockIdFromSectionId,
  fetchObjectiveSectionOrder,
  isStaticObjectiveSectionId,
  moveSectionInOrder,
  readObjectiveSectionDragId,
  reorderSectionInOrder,
  resolveAvailableSectionIds,
  resolveInitialSectionOrder,
  resolveObjectiveSectionLabel,
  resolveSectionDropIntent,
  saveObjectiveSectionOrder,
  syncCustomBlockIdsInOrder,
  type ObjectiveSectionId,
  type SectionDropIntent,
  type StaticObjectiveSectionId,
} from "@/lib/cockpit/objective-section-order";
import {
  resolveDefaultLayout,
  resolveEffectiveLayout,
  type DefaultLayout,
} from "@/lib/cockpit/objective-default-layout";
import {
  collapseOverridesToPersist,
  fetchObjectiveSectionCollapsed,
  resolveSectionOpenState,
  saveObjectiveSectionCollapsed,
  serializeCollapseOverrides,
  type ObjectiveSectionCollapseMap,
} from "@/lib/cockpit/objective-section-collapse";
import {
  fetchObjectiveSectionHidden,
  hiddenOverridesToPersist,
  resolveVisibleSections,
  saveObjectiveSectionHidden,
  serializeHiddenIds,
  type ObjectiveSectionHiddenSet,
} from "@/lib/cockpit/objective-section-visibility";

const DOCTOR_LAYOUT_AUTOSAVE_MS = 500;

const EXAM_TEXTAREA_CLASS =
  "block w-full resize-y border-0 bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

/** obj-14 registry fallback seed — full exam, nothing hidden (never blank). */
const REGISTRY_DEFAULT_LAYOUT: DefaultLayout = {
  defaultOrder: [...DEFAULT_OBJECTIVE_SECTION_ORDER],
  defaultHidden: [],
};

/** Canonical default open/closed state per section block (obj-11 §2.2). */
const OBJECTIVE_COLLAPSE_DEFAULTS: Record<StaticObjectiveSectionId, boolean> = {
  vitals: true,
  exam: true,
  test_results: true,
  legacy_exam: false,
  legacy_vitals: false,
};

export interface ObjectiveSectionProps {
  heading?: string | null;
  disabled?: boolean;
}

type DropTargetState = {
  index: number;
  intent: SectionDropIntent;
};

type SaveStatus = "idle" | "saving" | "saved" | "error";

function buildCollapseDefaults(
  order: readonly ObjectiveSectionId[],
): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  for (const id of order) {
    if (!isStaticObjectiveSectionId(id)) continue;
    result[id] = OBJECTIVE_COLLAPSE_DEFAULTS[id];
  }
  return result;
}

export function ObjectiveSection({
  heading = "Objective",
  disabled = false,
}: ObjectiveSectionProps) {
  const { state, setField, token, dispatch, appointmentId } = useRxForm();
  const shell = usePrescriptionFormShell();
  const { fields } = state;
  const exam = parseExam(fields.examinationFindings);
  const objectiveCustomSections = fields.objectiveCustomSections;
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null);

  const dragSectionIdRef = useRef<ObjectiveSectionId | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTargetState | null>(null);
  const [layoutSaveStatus, setLayoutSaveStatus] = useState<SaveStatus>("idle");
  const [collapseSaveStatus, setCollapseSaveStatus] = useState<SaveStatus>("idle");
  const [visibilitySaveStatus, setVisibilitySaveStatus] = useState<SaveStatus>("idle");
  const [sectionManagerOpen, setSectionManagerOpen] = useState(false);
  const lastPersistedSectionOrderRef = useRef<string | null>(null);
  const lastPersistedCollapseRef = useRef<string | null>(null);
  const lastPersistedHiddenRef = useRef<string | null>(null);
  const hasHydratedCollapseRef = useRef(false);
  const hasHydratedHiddenRef = useRef(false);

  const [storedSectionOrder, setStoredSectionOrder] = useState<ObjectiveSectionId[] | null>(
    shell?.objectiveDefaults?.sectionOrder ?? null,
  );
  const [storedSectionCollapsed, setStoredSectionCollapsed] =
    useState<ObjectiveSectionCollapseMap | null>(
      shell?.objectiveDefaults?.sectionCollapsed ?? null,
    );
  const [storedSectionHidden, setStoredSectionHidden] =
    useState<ObjectiveSectionHiddenSet | null>(shell?.objectiveDefaults?.sectionHidden ?? null);
  const [openById, setOpenById] = useState<Record<string, boolean>>({});
  const [hiddenIds, setHiddenIds] = useState<ObjectiveSectionHiddenSet>([]);
  // obj-14 (OBJ-D6): modality/specialty default seed. `undefined` = still
  // resolving (gates the one-shot hydration so the seed lands on first paint);
  // `null` = no seed available → registry default (never blank).
  const [seedLayout, setSeedLayout] = useState<DefaultLayout | null | undefined>(undefined);

  const customBlockIds = useMemo(
    () => objectiveCustomSections.map((s) => s.id),
    [objectiveCustomSections],
  );

  const canonicalOrder = useMemo(() => resolveInitialSectionOrder([]), []);
  const [sectionOrder, setSectionOrder] = useState<ObjectiveSectionId[]>(canonicalOrder);

  // Menu lists / hidden-set apply to the static registry only; custom blocks are
  // managed by add/remove (P10-D4) and always pass through resolveVisibleSections.
  const mountableIds = useMemo(() => resolveAvailableSectionIds(), []);

  const visibleSectionOrder = useMemo(
    () => resolveVisibleSections(sectionOrder, hiddenIds, mountableIds),
    [hiddenIds, mountableIds, sectionOrder],
  );

  const defaultsById = useMemo(() => buildCollapseDefaults(sectionOrder), [sectionOrder]);

  const collapseHydrated = storedSectionCollapsed !== null;
  /** Controlled collapse whenever persistence is expected (avoids uncontrolled defaultOpen flash). */
  const collapseControlled = collapseHydrated || Boolean(token);

  const effectiveOpenById = useMemo((): Record<string, boolean> => {
    if (!collapseControlled) return {};
    const merged: Record<string, boolean> = {};
    for (const [id, defaultOpen] of Object.entries(defaultsById)) {
      merged[id] = openById[id] ?? defaultOpen;
    }
    return merged;
  }, [collapseControlled, defaultsById, openById]);

  const displayOpenById = useMemo((): Record<string, boolean> => {
    if (!collapseControlled) return {};
    if (!collapseHydrated) {
      const collapsed: Record<string, boolean> = {};
      for (const id of Object.keys(defaultsById)) {
        collapsed[id] = false;
      }
      return collapsed;
    }
    return effectiveOpenById;
  }, [collapseControlled, collapseHydrated, defaultsById, effectiveOpenById]);

  const handleSectionOpenChange = useCallback(
    (sectionId: ObjectiveSectionId, open: boolean) => {
      setOpenById((prev) => ({ ...prev, [sectionId]: open }));
    },
    [],
  );

  // ---- obj-14: resolve the modality/specialty default seed (view-only) --------
  useEffect(() => {
    // In the cockpit the seed travels with the shell (computed once during
    // setup) — never re-fetch here. Only the standalone mount fetches.
    if (shell?.objectiveDefaults != null) {
      setSeedLayout(shell.objectiveSeed ?? null);
      return;
    }
    if (!token || !appointmentId) {
      setSeedLayout(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const [apptRes, settingsRes] = await Promise.all([
          getAppointmentById(appointmentId, token),
          getDoctorSettings(token),
        ]);
        if (cancelled) return;
        setSeedLayout(
          resolveDefaultLayout({
            modality: apptRes.data.appointment.consultation_type ?? null,
            specialty: settingsRes.data.settings.specialty ?? null,
          }),
        );
      } catch {
        if (!cancelled) setSeedLayout(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [shell?.objectiveDefaults, shell?.objectiveSeed, appointmentId, token]);

  // ---- Hydration: stored order + collapse from per-doctor default --------------
  useEffect(() => {
    if (shell?.objectiveDefaults != null) {
      setStoredSectionOrder(shell.objectiveDefaults.sectionOrder);
      return;
    }
    if (!token) {
      setStoredSectionOrder([]);
      return;
    }
    let cancelled = false;
    void fetchObjectiveSectionOrder(token)
      .then((order) => {
        if (!cancelled) setStoredSectionOrder(order);
      })
      .catch(() => {
        if (!cancelled) setStoredSectionOrder([]);
      });
    return () => {
      cancelled = true;
    };
  }, [shell?.objectiveDefaults, token]);

  useEffect(() => {
    if (shell?.objectiveDefaults != null) {
      setStoredSectionCollapsed(shell.objectiveDefaults.sectionCollapsed);
      return;
    }
    if (!token) {
      setStoredSectionCollapsed({});
      return;
    }
    let cancelled = false;
    void fetchObjectiveSectionCollapsed(token)
      .then((collapsed) => {
        if (!cancelled) setStoredSectionCollapsed(collapsed);
      })
      .catch(() => {
        if (!cancelled) setStoredSectionCollapsed({});
      });
    return () => {
      cancelled = true;
    };
  }, [shell?.objectiveDefaults, token]);

  useEffect(() => {
    if (shell?.objectiveDefaults != null) {
      setStoredSectionHidden(shell.objectiveDefaults.sectionHidden);
      return;
    }
    if (!token) {
      setStoredSectionHidden([]);
      return;
    }
    let cancelled = false;
    void fetchObjectiveSectionHidden(token)
      .then((hidden) => {
        if (!cancelled) setStoredSectionHidden(hidden);
      })
      .catch(() => {
        if (!cancelled) setStoredSectionHidden([]);
      });
    return () => {
      cancelled = true;
    };
  }, [shell?.objectiveDefaults, token]);

  useEffect(() => {
    if (storedSectionOrder === null || seedLayout === undefined) return;
    // obj-14: override wins; otherwise the modality/specialty seed is the base order
    // (P3-D5). The seed is never persisted — only the static projection seeds the
    // debounce guard, so no autosave fires until the doctor actually reorders.
    const { baseOrder } = resolveEffectiveLayout({
      seed: seedLayout ?? REGISTRY_DEFAULT_LAYOUT,
      storedOrder: storedSectionOrder,
      storedHidden: [],
    });
    const resolved = resolveInitialSectionOrder(baseOrder, customBlockIds);
    setSectionOrder(resolved);
    // Only the static projection is persisted (custom_block ids re-mint per visit, P10-D4 / §3.3).
    lastPersistedSectionOrderRef.current = JSON.stringify(
      resolved.filter(isStaticObjectiveSectionId),
    );
    // customBlockIds intentionally omitted — the dedicated sync effect below re-applies them
    // without rebuilding from the stored default (which would drop unsaved per-visit reorders).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storedSectionOrder, seedLayout]);

  // Keep the live order in sync with the current custom blocks (add/remove/re-mint).
  useEffect(() => {
    setSectionOrder((prev) => syncCustomBlockIdsInOrder(prev, customBlockIds));
  }, [customBlockIds]);

  useEffect(() => {
    if (storedSectionHidden === null || seedLayout === undefined) return;
    if (hasHydratedHiddenRef.current) return;
    hasHydratedHiddenRef.current = true;

    // obj-14: the doctor's stored hidden set wins wholesale; with none, the
    // modality/specialty seed is the default (P3-D5). The seed is never
    // persisted — the debounce guard is set to the seeded state so no autosave
    // fires until the doctor toggles visibility.
    const { hidden: initialHidden } = resolveEffectiveLayout({
      seed: seedLayout ?? REGISTRY_DEFAULT_LAYOUT,
      storedOrder: [],
      storedHidden: storedSectionHidden,
    });

    setHiddenIds(initialHidden);
    lastPersistedHiddenRef.current = serializeHiddenIds(
      hiddenOverridesToPersist(initialHidden, mountableIds),
    );
    // Intentionally omit mountableIds — one-shot hydrate; cross-context retention is in the serialiser.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- subsequent stored set writes must not clobber hiddenIds
  }, [storedSectionHidden, seedLayout]);

  useEffect(() => {
    if (storedSectionCollapsed === null) return;
    if (hasHydratedCollapseRef.current) return;
    hasHydratedCollapseRef.current = true;

    const resolved = resolveSectionOpenState(storedSectionCollapsed, defaultsById);
    setOpenById(resolved);
    lastPersistedCollapseRef.current = serializeCollapseOverrides(
      collapseOverridesToPersist(resolved, defaultsById),
    );
    // Intentionally omit defaultsById — one-shot hydrate; live defaults merge at render via effectiveOpenById.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- subsequent stored map writes must not clobber openById
  }, [storedSectionCollapsed]);

  // ---- Debounced delta-autosave: order ----------------------------------------
  useEffect(() => {
    if (disabled || !token || storedSectionOrder === null) return;

    // Persist static sections only — custom_block ids re-mint per visit (§3.3).
    const staticOrder = sectionOrder.filter(isStaticObjectiveSectionId);
    const serialized = JSON.stringify(staticOrder);
    if (serialized === lastPersistedSectionOrderRef.current) return;

    setLayoutSaveStatus("saving");
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const saved = await saveObjectiveSectionOrder(token, staticOrder);
          lastPersistedSectionOrderRef.current = JSON.stringify(saved);
          setStoredSectionOrder(saved);
          shell?.setObjectiveDefaults((prev) =>
            prev
              ? { ...prev, sectionOrder: saved }
              : { sectionOrder: saved, sectionCollapsed: {}, sectionHidden: [], customSections: [] },
          );
          setLayoutSaveStatus("saved");
        } catch {
          setLayoutSaveStatus("error");
        }
      })();
    }, DOCTOR_LAYOUT_AUTOSAVE_MS);

    return () => window.clearTimeout(timer);
  }, [disabled, sectionOrder, shell, storedSectionOrder, token]);

  // ---- Debounced delta-autosave: collapse -------------------------------------
  useEffect(() => {
    if (disabled || !token || storedSectionCollapsed === null) return;

    const overrides = collapseOverridesToPersist(effectiveOpenById, defaultsById);
    const serialized = serializeCollapseOverrides(overrides);
    if (serialized === lastPersistedCollapseRef.current) return;

    setCollapseSaveStatus("saving");
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const saved = await saveObjectiveSectionCollapsed(token, overrides);
          lastPersistedCollapseRef.current = serializeCollapseOverrides(saved);
          setStoredSectionCollapsed(saved);
          shell?.setObjectiveDefaults((prev) =>
            prev
              ? { ...prev, sectionCollapsed: saved }
              : { sectionOrder: [], sectionCollapsed: saved, sectionHidden: [], customSections: [] },
          );
          setCollapseSaveStatus("saved");
        } catch {
          setCollapseSaveStatus("error");
        }
      })();
    }, DOCTOR_LAYOUT_AUTOSAVE_MS);

    return () => window.clearTimeout(timer);
  }, [defaultsById, disabled, effectiveOpenById, shell, storedSectionCollapsed, token]);

  // ---- Debounced delta-autosave: hidden set -----------------------------------
  useEffect(() => {
    if (disabled || !token || storedSectionHidden === null) return;

    const toPersist = hiddenOverridesToPersist(hiddenIds, mountableIds);
    const serialized = serializeHiddenIds(toPersist);
    if (serialized === lastPersistedHiddenRef.current) return;

    setVisibilitySaveStatus("saving");
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const saved = await saveObjectiveSectionHidden(token, toPersist);
          lastPersistedHiddenRef.current = serializeHiddenIds(saved);
          setStoredSectionHidden(saved);
          shell?.setObjectiveDefaults((prev) =>
            prev
              ? { ...prev, sectionHidden: saved }
              : { sectionOrder: [], sectionCollapsed: {}, sectionHidden: saved, customSections: [] },
          );
          setVisibilitySaveStatus("saved");
        } catch {
          setVisibilitySaveStatus("error");
        }
      })();
    }, DOCTOR_LAYOUT_AUTOSAVE_MS);

    return () => window.clearTimeout(timer);
  }, [disabled, hiddenIds, mountableIds, shell, storedSectionHidden, token]);

  // ---- Reorder interaction ----------------------------------------------------
  const clearDragState = useCallback(() => {
    dragSectionIdRef.current = null;
    setDropTarget(null);
  }, []);

  const handleMoveByDirection = useCallback(
    (index: number, direction: "up" | "down") => {
      if (disabled) return;
      setSectionOrder((prev) => moveSectionInOrder(prev, index, direction));
    },
    [disabled],
  );

  const handleMoveSectionById = useCallback(
    (sectionId: ObjectiveSectionId, direction: "up" | "down") => {
      const index = sectionOrder.indexOf(sectionId);
      if (index === -1) return;
      handleMoveByDirection(index, direction);
    },
    [handleMoveByDirection, sectionOrder],
  );

  const handleToggleSectionHidden = useCallback((sectionId: ObjectiveSectionId) => {
    setHiddenIds((prev) =>
      prev.includes(sectionId) ? prev.filter((id) => id !== sectionId) : [...prev, sectionId],
    );
  }, []);

  const handleAddCustomSection = useCallback(() => {
    if (disabled) return;
    const section = createEmptyCustomSubsection();
    dispatch({ type: "ADD_OBJECTIVE_CUSTOM_SECTION", section });
    setPendingFocusId(section.id);
    setSectionManagerOpen(false);
  }, [disabled, dispatch]);

  const dragHandleProps = useCallback(
    (sectionId: ObjectiveSectionId): HTMLAttributes<HTMLDivElement> => ({
      draggable: !disabled,
      onDragStart: (e: DragEvent<HTMLDivElement>) => {
        dragSectionIdRef.current = sectionId;
        e.dataTransfer?.setData(OBJECTIVE_SECTION_DRAG_MIME, sectionId);
        e.dataTransfer?.setData("text/plain", sectionId);
        if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
      },
      onDragEnd: () => {
        clearDragState();
      },
    }),
    [clearDragState, disabled],
  );

  const handleSectionDragOver = useCallback(
    (targetIndex: number, sectionId: ObjectiveSectionId, e: DragEvent<HTMLDivElement>) => {
      const sourceId = dragSectionIdRef.current;
      if (disabled || !sourceId || sourceId === sectionId) return;

      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "move";

      const rect = e.currentTarget.getBoundingClientRect();
      const intent = resolveSectionDropIntent(e.clientY, rect);
      setDropTarget({ index: targetIndex, intent });
    },
    [disabled],
  );

  const handleDropOnTarget = useCallback(
    (targetIndex: number, intent: SectionDropIntent) => {
      const sourceId = dragSectionIdRef.current;
      if (disabled || !sourceId) {
        clearDragState();
        return;
      }
      setSectionOrder((prev) => {
        const fromIndex = prev.indexOf(sourceId);
        if (fromIndex === -1) return prev;
        return reorderSectionInOrder(prev, fromIndex, targetIndex, intent);
      });
      clearDragState();
    },
    [clearDragState, disabled],
  );

  // ---- Section content registry -----------------------------------------------
  const sectionBody = useMemo((): Record<StaticObjectiveSectionId, ReactNode> => {
    return {
      vitals: <VitalsGrid />,
      exam: <ExamSystemList disabled={disabled} />,
      test_results: (
        <>
          <label htmlFor="testResults" className={RX_FIELD_LABEL_CLASS}>
            Test results (patient-brought)
          </label>
          <textarea
            id="testResults"
            rows={3}
            value={fields.testResults}
            onChange={(e) => setField("testResults", e.target.value)}
            className={RX_FIELD_INPUT_CLASS}
            placeholder="Reports / labs the patient brought to this visit"
            maxLength={3000}
            disabled={disabled}
          />
        </>
      ),
      legacy_exam: (
        <div className="rounded-md border border-border bg-card">
          <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
            <User className="h-4 w-4 text-muted-foreground" aria-hidden />
            <label htmlFor="exam-general" className="text-xs font-medium text-foreground">
              General Examination
            </label>
          </div>
          <textarea
            id="exam-general"
            rows={3}
            value={exam.general}
            onChange={(e) =>
              setField("examinationFindings", serializeExam(e.target.value, exam.systemic))
            }
            className={EXAM_TEXTAREA_CLASS}
            placeholder="e.g. Alert, oriented, in no distress"
            maxLength={3000}
            disabled={disabled}
          />

          <div className="h-px bg-border" aria-hidden />

          <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
            <Stethoscope className="h-4 w-4 text-muted-foreground" aria-hidden />
            <label htmlFor="exam-systemic" className="text-xs font-medium text-foreground">
              Systemic Examination
            </label>
          </div>
          <textarea
            id="exam-systemic"
            rows={4}
            value={exam.systemic}
            onChange={(e) =>
              setField("examinationFindings", serializeExam(exam.general, e.target.value))
            }
            className={EXAM_TEXTAREA_CLASS}
            placeholder="e.g. Chest clear, HS S1+S2 normal, abdomen soft"
            maxLength={3000}
            disabled={disabled}
          />
        </div>
      ),
      legacy_vitals: (
        <>
          <label htmlFor="vitalsText" className={RX_FIELD_LABEL_CLASS}>
            Vitals (free-text — legacy)
          </label>
          <input
            id="vitalsText"
            type="text"
            value={fields.vitalsText}
            onChange={(e) => setField("vitalsText", e.target.value)}
            className={RX_FIELD_INPUT_CLASS}
            placeholder="Free-text vitals (deprecated — use the grid above)"
            maxLength={1000}
            disabled={disabled}
          />
        </>
      ),
    };
  }, [disabled, exam.general, exam.systemic, fields.testResults, fields.vitalsText, setField]);

  const renderSection = (sectionId: ObjectiveSectionId) => {
    const isStatic = isStaticObjectiveSectionId(sectionId);
    const customBlockId = isStatic ? null : customBlockIdFromSectionId(sectionId);
    const customIndex = customBlockId
      ? objectiveCustomSections.findIndex((s) => s.id === customBlockId)
      : -1;

    let inner: ReactNode = null;
    if (isStatic) {
      const body = sectionBody[sectionId];
      if (!body) return null;
    } else if (customIndex === -1) {
      return null;
    }

    // Index resolves against the full order so reorder stays correct even when
    // some sections are hidden from the visible render plan (obj-12 / P10-D2).
    const index = sectionOrder.indexOf(sectionId);
    const title = resolveObjectiveSectionLabel(sectionId);
    const isDropTarget = dropTarget?.index === index;
    const dropIntent = isDropTarget ? dropTarget.intent : null;

    const leadingActions = !disabled ? (
      <ObjectiveSectionDragHandle
        dragHandleProps={dragHandleProps(sectionId)}
        ariaLabel={`Reorder ${title}. Use arrow keys to move.`}
        disabled={disabled}
        index={index}
        count={sectionOrder.length}
        onMoveUp={() => handleMoveByDirection(index, "up")}
        onMoveDown={() => handleMoveByDirection(index, "down")}
      />
    ) : undefined;

    if (isStatic) {
      inner = (
        <CollapsibleContainer
          title={title}
          toggleLabel={`Toggle ${title}`}
          leadingActions={leadingActions}
          open={collapseControlled ? displayOpenById[sectionId] : undefined}
          onOpenChange={
            collapseControlled ? (open) => handleSectionOpenChange(sectionId, open) : undefined
          }
          defaultOpen={collapseControlled ? undefined : OBJECTIVE_COLLAPSE_DEFAULTS[sectionId]}
          bodyClassName="px-3 pb-3 pt-0"
        >
          {sectionBody[sectionId]}
        </CollapsibleContainer>
      );
    } else {
      inner = (
        <ObjectiveCustomSectionBlock
          section={objectiveCustomSections[customIndex]!}
          index={customIndex}
          disabled={disabled}
          focusTitleOnMount={pendingFocusId === customBlockId}
          leadingActions={leadingActions}
        />
      );
    }

    return (
      <ObjectiveSortableSectionShell
        key={sectionId}
        sectionId={sectionId}
        disabled={disabled}
        dropIntent={dropIntent}
        isDropTarget={isDropTarget}
        onDragOver={(e) => handleSectionDragOver(index, sectionId, e)}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
            setDropTarget((prev) => (prev?.index === index ? null : prev));
          }
        }}
        onDrop={(e) => {
          e.preventDefault();
          const sourceId = dragSectionIdRef.current ?? readObjectiveSectionDragId(e.dataTransfer);
          if (!sourceId || sourceId === sectionId) {
            clearDragState();
            return;
          }
          dragSectionIdRef.current = sourceId;
          const intent = resolveSectionDropIntent(
            e.clientY,
            e.currentTarget.getBoundingClientRect(),
          );
          handleDropOnTarget(index, intent);
        }}
      >
        {inner}
      </ObjectiveSortableSectionShell>
    );
  };

  const showAllHiddenEmptyState = visibleSectionOrder.length === 0;

  return (
    <section aria-label="Objective" className="space-y-3">
      {heading !== null && <h3 className={RX_SECTION_HEADING_CLASS}>{heading}</h3>}

      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-auto flex min-h-9 items-center gap-2">
          {layoutSaveStatus === "saved" ||
          collapseSaveStatus === "saved" ||
          visibilitySaveStatus === "saved" ? (
            <span className="text-xs text-muted-foreground" role="status">
              Layout saved
            </span>
          ) : null}
          {layoutSaveStatus === "error" ||
          collapseSaveStatus === "error" ||
          visibilitySaveStatus === "error" ? (
            <span className="text-xs text-destructive" role="status">
              Could not save layout
            </span>
          ) : null}
        </div>
        <ManageObjectiveSectionsMenu
          disabled={disabled}
          open={sectionManagerOpen}
          onOpenChange={setSectionManagerOpen}
          sectionOrder={sectionOrder}
          mountableIds={mountableIds}
          hiddenIds={hiddenIds}
          fields={fields}
          onToggleHidden={handleToggleSectionHidden}
          onMoveSection={handleMoveSectionById}
          onAddCustomSection={handleAddCustomSection}
        />
      </div>

      {showAllHiddenEmptyState ? (
        <div
          className="rounded-md border border-dashed border-border bg-muted/10 px-3 py-4 text-center"
          data-testid="objective-all-hidden-empty"
        >
          <p className="text-sm text-muted-foreground">All sections hidden</p>
          <button
            type="button"
            className="mt-2 text-sm font-medium text-primary underline-offset-2 hover:underline"
            onClick={() => setSectionManagerOpen(true)}
          >
            Manage sections
          </button>
        </div>
      ) : (
        visibleSectionOrder.map((sectionId) => renderSection(sectionId))
      )}

      <ObjectiveCustomSectionsChrome disabled={disabled} onAdd={handleAddCustomSection} />
    </section>
  );
}
