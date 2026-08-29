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
import { ExamSystemList } from "@/components/cockpit/rx/inputs/ExamSystemList";
import { VitalsGrid } from "@/components/cockpit/rx/inputs/VitalsGrid";
import { TestResultsList } from "@/components/cockpit/rx/objective/TestResultsList";
import { ObjectiveMediaStrip } from "@/components/cockpit/rx/objective/ObjectiveMediaStrip";
import { useRxForm } from "@/components/cockpit/rx/RxFormContext";
import { usePrescriptionFormShell } from "@/components/cockpit/rx/PrescriptionFormShellContext";
import { CollapsibleContainer } from "@/components/ui/CollapsibleContainer";
import {
  ObjectiveSectionDragHandle,
  ObjectiveSortableSectionShell,
} from "@/components/cockpit/rx/objective/ObjectiveSortableSectionShell";
import {
  ObjectiveSectionTemplateButton,
  ObjectiveWholeTemplateButton,
} from "@/components/cockpit/rx/objective/ObjectiveSectionTemplateButton";
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
import {
  SOAP_TAB_HEADING_ICON,
  SoapTabFamilyProvider,
  SoapSectionListSkeleton,
  resolveObjectiveSectionIcon,
  sectionHeaderIcon,
  soapTabHeadingClassName,
} from "@/components/cockpit/rx/sections/section-chrome";
import { OBJECTIVE_SCROLL_TOP_SELECTOR } from "@/lib/cockpit/exam-card-scroll";
import { createEmptyCustomSubsection } from "@/lib/cockpit/custom-subsections";
import {
  buildObjectiveClearAllActions,
  rxFormHasClearableObjectiveContent,
} from "@/lib/cockpit/apply-objective-template";
import { ClearAllConfirmDialog } from "@/components/cockpit/rx/ClearAllConfirmDialog";
import {
  SoapTabExpandCollapseClearButtons,
  SoapTabLayoutSaveStatus,
} from "@/components/cockpit/rx/SoapTabChromeActions";
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

/** obj-14 registry fallback seed — full exam, nothing hidden (never blank). */
const REGISTRY_DEFAULT_LAYOUT: DefaultLayout = {
  defaultOrder: [...DEFAULT_OBJECTIVE_SECTION_ORDER],
  defaultHidden: [],
};

/** Canonical default open/closed state per section block (obj-11 §2.2). */
const OBJECTIVE_COLLAPSE_DEFAULTS: Record<StaticObjectiveSectionId, boolean> = {
  vitals: true,
  exam: true,
  notes: true,
  test_results: true,
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

/** First-paint collapse seed — avoids default-open → stored-closed flicker on remount. */
function seedObjectiveCollapseOpen(
  args: {
    sectionCollapsed: ObjectiveSectionCollapseMap | null | undefined;
    sectionOrder: ObjectiveSectionId[] | null | undefined;
    objectiveSeed: DefaultLayout | null | undefined;
  },
  customBlockIds: readonly string[],
): {
  openById: Record<string, boolean>;
  ready: boolean;
  persistedKey: string | null;
} {
  const { sectionCollapsed: stored, sectionOrder: storedOrder, objectiveSeed } = args;
  if (stored == null || storedOrder == null) {
    return { openById: {}, ready: false, persistedKey: null };
  }
  const seed = objectiveSeed ?? REGISTRY_DEFAULT_LAYOUT;
  const { baseOrder } = resolveEffectiveLayout({
    seed,
    storedOrder,
    storedHidden: [],
  });
  const order = resolveInitialSectionOrder(baseOrder, customBlockIds);
  const defaults = buildCollapseDefaults(order);
  if (Object.keys(defaults).length === 0) {
    return { openById: {}, ready: false, persistedKey: null };
  }
  const resolved = resolveSectionOpenState(stored, defaults);
  return {
    openById: resolved,
    ready: true,
    persistedKey: serializeCollapseOverrides(
      collapseOverridesToPersist(resolved, defaults),
    ),
  };
}

export function ObjectiveSection({
  heading = "Objective",
  disabled = false,
}: ObjectiveSectionProps) {
  const { state, setField, token, dispatch, appointmentId } = useRxForm();
  const shell = usePrescriptionFormShell();
  const { fields } = state;
  const objectiveCustomSections = fields.objectiveCustomSections;
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null);

  const dragSectionIdRef = useRef<ObjectiveSectionId | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTargetState | null>(null);
  const [layoutSaveStatus, setLayoutSaveStatus] = useState<SaveStatus>("idle");
  const [collapseSaveStatus, setCollapseSaveStatus] = useState<SaveStatus>("idle");
  const [visibilitySaveStatus, setVisibilitySaveStatus] = useState<SaveStatus>("idle");
  const [sectionManagerOpen, setSectionManagerOpen] = useState(false);
  const collapseSeedRef = useRef<ReturnType<typeof seedObjectiveCollapseOpen> | null>(null);
  if (collapseSeedRef.current === null) {
    collapseSeedRef.current = seedObjectiveCollapseOpen(
      {
        sectionCollapsed: shell?.objectiveDefaults?.sectionCollapsed,
        sectionOrder: shell?.objectiveDefaults?.sectionOrder,
        objectiveSeed: shell?.objectiveSeed,
      },
      objectiveCustomSections.map((s) => s.id),
    );
  }
  const collapseSeed = collapseSeedRef.current;

  const lastPersistedSectionOrderRef = useRef<string | null>(null);
  const lastPersistedCollapseRef = useRef<string | null>(collapseSeed.persistedKey);
  const lastPersistedHiddenRef = useRef<string | null>(null);
  const hasHydratedCollapseRef = useRef(collapseSeed.ready);
  // When shell already has objective defaults, seed-aware hidden is applied in
  // useState below — skip the one-shot effect so we don't flash empty → seeded.
  const hasHydratedHiddenRef = useRef(shell?.objectiveDefaults != null);

  const [storedSectionOrder, setStoredSectionOrder] = useState<ObjectiveSectionId[] | null>(
    shell?.objectiveDefaults?.sectionOrder ?? null,
  );
  const [storedSectionCollapsed, setStoredSectionCollapsed] =
    useState<ObjectiveSectionCollapseMap | null>(
      shell?.objectiveDefaults?.sectionCollapsed ?? null,
    );
  const [storedSectionHidden, setStoredSectionHidden] =
    useState<ObjectiveSectionHiddenSet | null>(shell?.objectiveDefaults?.sectionHidden ?? null);
  const [openById, setOpenById] = useState<Record<string, boolean>>(
    () => collapseSeed.openById,
  );
  /** True once stored collapse has been applied to openById (seed or effect). */
  const [collapseReady, setCollapseReady] = useState(() => collapseSeed.ready);
  const [hiddenIds, setHiddenIds] = useState<ObjectiveSectionHiddenSet>(() => {
    if (shell?.objectiveDefaults == null) return [];
    const seed = shell.objectiveSeed ?? REGISTRY_DEFAULT_LAYOUT;
    return resolveEffectiveLayout({
      seed,
      storedOrder: [],
      storedHidden: shell.objectiveDefaults.sectionHidden,
    }).hidden;
  });
  // obj-14 (OBJ-D6): modality/specialty default seed. `undefined` = still
  // resolving (gates the one-shot hydration so the seed lands on first paint);
  // `null` = no seed available → registry default (never blank).
  const [seedLayout, setSeedLayout] = useState<DefaultLayout | null | undefined>(() =>
    shell?.objectiveDefaults != null ? (shell.objectiveSeed ?? null) : undefined,
  );

  const customBlockIds = useMemo(
    () => objectiveCustomSections.map((s) => s.id),
    [objectiveCustomSections],
  );
  const customBlockIdsRef = useRef(customBlockIds);
  customBlockIdsRef.current = customBlockIds;

  // Empty until order + seed hydrate — avoids DEFAULT → doctor-order flash.
  const [sectionOrder, setSectionOrder] = useState<ObjectiveSectionId[]>(() => {
    const stored = shell?.objectiveDefaults?.sectionOrder;
    if (stored == null || shell?.objectiveDefaults == null) return [];
    const seed = shell.objectiveSeed ?? REGISTRY_DEFAULT_LAYOUT;
    const { baseOrder } = resolveEffectiveLayout({
      seed,
      storedOrder: stored,
      storedHidden: [],
    });
    return resolveInitialSectionOrder(baseOrder, customBlockIds);
  });

  const layoutHydrated =
    storedSectionOrder !== null &&
    storedSectionHidden !== null &&
    seedLayout !== undefined &&
    sectionOrder.length > 0;

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
    // Hold closed until stored map is applied — never paint canonical defaults
    // for one frame (tab switch / remount flicker: open → stored-closed).
    if (!collapseHydrated || !collapseReady) {
      const collapsed: Record<string, boolean> = {};
      for (const id of Object.keys(defaultsById)) {
        collapsed[id] = false;
      }
      return collapsed;
    }
    return effectiveOpenById;
  }, [
    collapseControlled,
    collapseHydrated,
    collapseReady,
    defaultsById,
    effectiveOpenById,
  ]);

  const handleSectionOpenChange = useCallback(
    (sectionId: ObjectiveSectionId, open: boolean) => {
      setOpenById((prev) => ({ ...prev, [sectionId]: open }));
    },
    [],
  );

  const expandAllSections = useCallback(() => {
    setOpenById((prev) => {
      const next = { ...prev };
      for (const id of visibleSectionOrder) {
        next[id] = true;
      }
      return next;
    });
  }, [visibleSectionOrder]);

  const collapseAllSections = useCallback(() => {
    setOpenById((prev) => {
      const next = { ...prev };
      for (const id of visibleSectionOrder) {
        next[id] = false;
      }
      return next;
    });
  }, [visibleSectionOrder]);

  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [clearBusy, setClearBusy] = useState(false);

  const hasClearableObjective = useMemo(
    () => rxFormHasClearableObjectiveContent(fields),
    [fields],
  );

  const clearAllObjective = useCallback(() => {
    if (disabled || !hasClearableObjective) return;
    setClearBusy(true);
    try {
      for (const action of buildObjectiveClearAllActions(fields)) {
        dispatch(action);
      }
      collapseAllSections();
      setClearConfirmOpen(false);
    } finally {
      setClearBusy(false);
    }
  }, [collapseAllSections, disabled, dispatch, fields, hasClearableObjective]);

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
    const resolved = resolveInitialSectionOrder(baseOrder, customBlockIdsRef.current);
    setSectionOrder(resolved);
    // Only the static projection is persisted (custom_block ids re-mint per visit, P10-D4 / §3.3).
    lastPersistedSectionOrderRef.current = JSON.stringify(
      resolved.filter(isStaticObjectiveSectionId),
    );
    // customBlockIds intentionally omitted — the dedicated sync effect below re-applies them
    // without rebuilding from the stored default (which would drop unsaved per-visit reorders).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storedSectionOrder, seedLayout]);

  const customBlockIdsKey = customBlockIds.join(",");

  // Keep the live order in sync with the current custom blocks (add/remove/re-mint).
  useEffect(() => {
    setSectionOrder((prev) => {
      const next = syncCustomBlockIdsInOrder(prev, customBlockIds);
      if (
        next.length === prev.length &&
        next.every((id, index) => id === prev[index])
      ) {
        return prev;
      }
      return next;
    });
  }, [customBlockIds, customBlockIdsKey]);

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
    if (Object.keys(defaultsById).length === 0) return;
    hasHydratedCollapseRef.current = true;

    const resolved = resolveSectionOpenState(storedSectionCollapsed, defaultsById);
    setOpenById(resolved);
    setCollapseReady(true);
    lastPersistedCollapseRef.current = serializeCollapseOverrides(
      collapseOverridesToPersist(resolved, defaultsById),
    );
    // Intentionally omit further defaultsById changes — one-shot after first non-empty defaults.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- subsequent stored map writes must not clobber openById
  }, [storedSectionCollapsed, defaultsById]);

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
  const objectiveNotesText =
    fields.examFindings.find((f) => f.systemId === "objective_notes")?.notes ?? "";

  const sectionBody = useMemo((): Record<StaticObjectiveSectionId, ReactNode> => {
    return {
      vitals: <VitalsGrid />,
      exam: <ExamSystemList disabled={disabled} />,
      notes: (
        <div className="space-y-2">
          <label htmlFor="objective-notes" className={RX_FIELD_LABEL_CLASS}>
            Visit notes
          </label>
          <textarea
            id="objective-notes"
            rows={4}
            value={objectiveNotesText}
            onChange={(e) => {
              const trimmed = e.target.value.trim();
              if (!trimmed) {
                dispatch({ type: "CLEAR_EXAM_SYSTEM", systemId: "objective_notes" });
                return;
              }
              dispatch({
                type: "SET_EXAM_SYSTEM",
                systemId: "objective_notes",
                status: "abnormal",
                findings: [],
                notes: e.target.value,
              });
            }}
            className={RX_FIELD_INPUT_CLASS}
            placeholder="Objective notes that don't fit vitals, exam, or reports…"
            maxLength={2000}
            disabled={disabled}
            data-testid="objective-notes-textarea"
          />
        </div>
      ),
      // rpt-01: one "Reports" section — all structured rows + media strip folded in.
      // `media` is no longer a standalone section id; the attachment strip renders here.
      test_results: (
        <div className="space-y-4">
          <TestResultsList disabled={disabled} showLegacyTextarea />
          <ObjectiveMediaStrip disabled={disabled} />
        </div>
      ),
    };
  }, [disabled, dispatch, objectiveNotesText]);

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
      // obj-23 / rpt-01: Reports templates save/apply all structured rows; legacy
      // `point_of_care` templates remapped on read in the picker.
      const sectionActions =
        disabled
          ? undefined
          : sectionId === "vitals"
            ? <ObjectiveSectionTemplateButton scope="vitals" />
            : sectionId === "exam"
              ? <ObjectiveSectionTemplateButton scope="exam_systemic" />
            : sectionId === "notes"
              ? <ObjectiveSectionTemplateButton scope="objective_notes" />
            : sectionId === "test_results"
              ? <ObjectiveSectionTemplateButton scope="test_results" />
              : undefined;
      const sectionIconDef = resolveObjectiveSectionIcon(sectionId);
      inner = (
        <CollapsibleContainer
          title={title}
          sectionIcon={sectionIconDef ? sectionHeaderIcon(sectionIconDef) : undefined}
          toggleLabel={`Toggle ${title}`}
          testId={`objective-section-${sectionId}`}
          leadingActions={leadingActions}
          actions={sectionActions}
          scrollOnExpand
          closeScrollToSelector={OBJECTIVE_SCROLL_TOP_SELECTOR}
          stickyHeader
          open={collapseControlled ? displayOpenById[sectionId] : undefined}
          onOpenChange={
            collapseControlled ? (open) => handleSectionOpenChange(sectionId, open) : undefined
          }
          defaultOpen={collapseControlled ? undefined : OBJECTIVE_COLLAPSE_DEFAULTS[sectionId]}
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

  const showAllHiddenEmptyState = layoutHydrated && visibleSectionOrder.length === 0;
  const ObjectiveTabIcon = SOAP_TAB_HEADING_ICON.objective;

  // Depth tone is opt-in per field section (CollapsibleContainer depthTone), not at this tab wrapper.

  return (
    <SoapTabFamilyProvider family="objective">
    <section
      aria-label="Objective"
      className="space-y-3"
      data-testid="objective-scroll-top"
    >
      {heading !== null ? (
        <h3 className={soapTabHeadingClassName("objective", RX_SECTION_HEADING_CLASS)}>
          <ObjectiveTabIcon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          {heading}
        </h3>
      ) : null}

      {/* Icon-only chrome — one nowrap row at typical column widths. */}
      <div className="flex min-h-9 flex-nowrap items-center gap-0.5">
        <div className="mr-auto flex min-w-0 items-center">
          <SoapTabLayoutSaveStatus
            saved={
              layoutSaveStatus === "saved" ||
              collapseSaveStatus === "saved" ||
              visibilitySaveStatus === "saved"
            }
            error={
              layoutSaveStatus === "error" ||
              collapseSaveStatus === "error" ||
              visibilitySaveStatus === "error"
            }
          />
        </div>
        <SoapTabExpandCollapseClearButtons
          expandTestId="objective-expand-all"
          collapseTestId="objective-collapse-all"
          clearTestId="objective-clear-all"
          onExpandAll={expandAllSections}
          onCollapseAll={collapseAllSections}
          onClearAll={() => setClearConfirmOpen(true)}
          clearDisabled={disabled || !hasClearableObjective}
        />
        {!disabled ? <ObjectiveWholeTemplateButton disabled={disabled} /> : null}
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
      ) : !layoutHydrated ? (
        <SoapSectionListSkeleton testId="objective-layout-skeleton" rows={4} />
      ) : (
        <>
          {visibleSectionOrder.map((sectionId) => renderSection(sectionId))}
          <ObjectiveCustomSectionsChrome disabled={disabled} onAdd={handleAddCustomSection} />
        </>
      )}
      <ClearAllConfirmDialog
        open={clearConfirmOpen}
        onOpenChange={(open) => {
          if (!clearBusy) setClearConfirmOpen(open);
        }}
        title="Clear all objective content?"
        descriptionLead="This cannot be undone from this screen."
        bullets={[
          "Vitals",
          "Structured examination findings",
          "Reports / test results",
          "Custom section notes (titles kept)",
        ]}
        busy={clearBusy}
        testId="objective-clear-all-dialog"
        onConfirm={clearAllObjective}
      />
    </section>
    </SoapTabFamilyProvider>
  );
}
