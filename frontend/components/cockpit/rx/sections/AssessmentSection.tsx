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
import { useRxForm } from "@/components/cockpit/rx/RxFormContext";
import { usePrescriptionFormShell } from "@/components/cockpit/rx/PrescriptionFormShellContext";
import {
  ASSESSMENT_TAB_DX_INPUT_ID,
  DiagnosisRowsList,
} from "@/components/cockpit/rx/inputs/DiagnosisRowsList";
import { OngoingProblemsZone } from "@/components/cockpit/rx/inputs/OngoingProblemsZone";
import {
  AssessmentSectionTemplateButton,
  AssessmentWholeTemplateButton,
} from "@/components/cockpit/rx/assessment/AssessmentSectionTemplateButton";
import {
  AssessmentSectionDragHandle,
  AssessmentSortableSectionShell,
} from "@/components/cockpit/rx/assessment/AssessmentSortableSectionShell";
import { ManageAssessmentSectionsMenu } from "@/components/cockpit/rx/assessment/ManageAssessmentSectionsMenu";
import { ClearAllConfirmDialog } from "@/components/cockpit/rx/ClearAllConfirmDialog";
import {
  SoapTabExpandCollapseClearButtons,
  SoapTabLayoutSaveStatus,
} from "@/components/cockpit/rx/SoapTabChromeActions";
import { SoapTabCustomSectionsAddChrome } from "@/components/cockpit/rx/SoapTabCustomSectionsAddChrome";
import {
  RX_FIELD_INPUT_CLASS,
  RX_SECTION_HEADING_CLASS,
} from "@/components/cockpit/rx/sections/field-styles";
import {
  SOAP_TAB_HEADING_ICON,
  SoapTabFamilyProvider,
  SoapSectionListSkeleton,
  sectionHeaderIcon,
  soapTabHeadingClassName,
} from "@/components/cockpit/rx/sections/section-chrome";
import { CollapsibleContainer } from "@/components/ui/CollapsibleContainer";
import { ASSESSMENT_SCROLL_TOP_SELECTOR } from "@/lib/cockpit/exam-card-scroll";
import {
  buildAssessmentClearAllActions,
  rxFormHasClearableAssessmentContent,
} from "@/lib/cockpit/apply-assessment-template";
import {
  ASSESSMENT_SECTION_DRAG_MIME,
  customBlockIdFromSectionId,
  fetchAssessmentSectionOrder,
  isCustomBlockSectionId,
  moveSectionInOrder,
  readAssessmentSectionDragId,
  reorderSectionInOrder,
  resolveAvailableSectionIds,
  resolveInitialSectionOrder,
  resolveAssessmentSectionLabel,
  resolveSectionDropIntent,
  saveAssessmentSectionOrder,
  syncCustomBlockIdsInOrder,
  type AssessmentSectionId,
  type SectionDropIntent,
  type StaticAssessmentSectionId,
} from "@/lib/cockpit/assessment-section-order";
import { CustomSubsectionBlock } from "@/components/cockpit/rx/subjective/CustomSubsectionBlock";
import {
  createEmptyCustomSubsection,
  createEmptyCustomSubsectionChild,
} from "@/lib/cockpit/custom-subsections";
import {
  ASSESSMENT_CUSTOM_SECTIONS_MAX,
  assessmentCustomSectionsStructureKey,
  assessmentCustomSectionsToDefaultTemplate,
  saveAssessmentCustomSectionsDefault,
} from "@/lib/cockpit/custom-assessment-sections";
import {
  collapseOverridesToPersist,
  fetchAssessmentSectionCollapsed,
  resolveSectionOpenState,
  saveAssessmentSectionCollapsed,
  serializeCollapseOverrides,
  type AssessmentSectionCollapseMap,
} from "@/lib/cockpit/assessment-section-collapse";
import {
  fetchAssessmentSectionHidden,
  hiddenOverridesToPersist,
  resolveVisibleSections,
  saveAssessmentSectionHidden,
  serializeHiddenIds,
  type AssessmentSectionHiddenSet,
} from "@/lib/cockpit/assessment-section-visibility";
import { normalizeDiagnoses } from "@/lib/cockpit/diagnoses";
import { usePatientConditionsQuery } from "@/hooks/queries/usePatientConditionsQuery";
import { invalidatePatientConditions } from "@/lib/query/invalidate";
import { createPatientCondition } from "@/lib/api";
import { isDuplicateCondition } from "@/lib/chart/pmh-icd-shortcuts";
import {
  knownConditionToCreatePayload,
  knownConditionsHasContent,
  snapshotKnownConditions,
  useKnownConditionsTemplateApply,
} from "@/lib/chart/use-known-conditions-template-apply";
import { useQueryClient } from "@tanstack/react-query";
import { ClipboardList, NotebookPen, Stethoscope } from "lucide-react";
import type { KnownConditionsTemplateBridge } from "@/components/cockpit/rx/assessment/AssessmentSectionTemplateButton";
import type { RxTemplateKnownCondition } from "@/types/rx-template";

export { ASSESSMENT_TAB_DX_INPUT_ID };

const DOCTOR_LAYOUT_AUTOSAVE_MS = 500;

/** Canonical default open/closed state — all Assessment L1s start open. */
const ASSESSMENT_COLLAPSE_DEFAULTS: Record<StaticAssessmentSectionId, boolean> = {
  diagnoses: true,
  known_conditions: true,
  assessment_notes: true,
};

const ASSESSMENT_CLEAR_ALL_BULLETS = [
  "Diagnoses on this visit",
  "Additional notes (and visit acuity)",
  "Custom section notes (section titles are kept)",
  "Does not clear Known conditions on the patient chart",
] as const;

type DropTargetState = {
  index: number;
  intent: SectionDropIntent;
};

type SaveStatus = "idle" | "saving" | "saved" | "error";

function buildCollapseDefaults(
  order: readonly AssessmentSectionId[],
): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  for (const id of order) {
    // Custom blocks default open (mirrors subjective).
    result[id] = isCustomBlockSectionId(id) ? true : ASSESSMENT_COLLAPSE_DEFAULTS[id];
  }
  return result;
}

/** First-paint collapse seed — avoids default-open → stored-closed flicker on remount. */
function seedAssessmentCollapseOpen(
  sectionCollapsed: AssessmentSectionCollapseMap | null | undefined,
  sectionOrder: AssessmentSectionId[] | null | undefined,
  customBlockIds: readonly string[],
): {
  openById: Record<string, boolean>;
  ready: boolean;
  persistedKey: string | null;
} {
  if (sectionCollapsed == null || sectionOrder == null) {
    return { openById: {}, ready: false, persistedKey: null };
  }
  const order = resolveInitialSectionOrder(sectionOrder, customBlockIds);
  const defaults = buildCollapseDefaults(order);
  if (Object.keys(defaults).length === 0) {
    return { openById: {}, ready: false, persistedKey: null };
  }
  const resolved = resolveSectionOpenState(sectionCollapsed, defaults);
  return {
    openById: resolved,
    ready: true,
    persistedKey: serializeCollapseOverrides(
      collapseOverridesToPersist(resolved, defaults),
    ),
  };
}

export interface AssessmentSectionProps {
  heading?: string | null;
  disabled?: boolean;
  /**
   * When true, the Dx editor is omitted — the Plan pane hides its own
   * Assessment block because the `assessment` tab (or `<AssessmentStrip>`
   * glance) owns editing (cmr-01 / asmt-01).
   */
  dxLifted?: boolean;
}

export function AssessmentSection({
  heading = "Assessment",
  disabled = false,
  dxLifted = false,
}: AssessmentSectionProps) {
  // Keep the hook call so this section stays a valid RxForm consumer even when
  // dxLifted short-circuits (Plan pane).
  useRxForm();

  if (dxLifted) {
    return null;
  }

  return (
    <AssessmentSectionChrome heading={heading} disabled={disabled} />
  );
}

function AssessmentSectionChrome({
  heading = "Assessment",
  disabled = false,
}: {
  heading?: string | null;
  disabled?: boolean;
}) {
  const { token, patientId, state, setField, dispatch } = useRxForm();
  const shell = usePrescriptionFormShell();
  const queryClient = useQueryClient();

  const conditionsQuery = usePatientConditionsQuery(token ?? "", patientId ?? "");
  const chartConditions = useMemo(
    () =>
      (conditionsQuery.data ?? []).filter(
        (c) => !c.archived_at && c.status === "active",
      ),
    [conditionsQuery.data],
  );

  const applyKnownConditions = useKnownConditionsTemplateApply({
    getExisting: () => chartConditions.map((c) => ({ condition: c.condition })),
    createCondition: async (c: RxTemplateKnownCondition) => {
      if (!patientId || !token) return "error";
      if (isDuplicateCondition(chartConditions, c.condition, c.code ?? null)) {
        return "duplicate";
      }
      try {
        await createPatientCondition(
          token,
          patientId,
          knownConditionToCreatePayload(c),
        );
        await invalidatePatientConditions(queryClient, patientId);
        return "created";
      } catch {
        return "error";
      }
    },
    reload: async () => {
      if (!patientId) return;
      await invalidatePatientConditions(queryClient, patientId);
    },
  });

  const knownConditionsBridge = useMemo((): KnownConditionsTemplateBridge => {
    return {
      snapshotForSave: () => snapshotKnownConditions(chartConditions),
      hasContent: () => knownConditionsHasContent(chartConditions),
      applyFromTemplate: applyKnownConditions,
    };
  }, [applyKnownConditions, chartConditions]);

  const customSections = state.fields.assessmentCustomSections;
  const customBlockIds = useMemo(
    () => customSections.map((section) => section.id),
    [customSections],
  );
  const focusBlockIdRef = useRef<string | null>(null);
  const focusChildIdRef = useRef<string | null>(null);
  const prevCustomBlockCountRef = useRef(customSections.length);

  const dragSectionIdRef = useRef<AssessmentSectionId | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTargetState | null>(null);
  const [layoutSaveStatus, setLayoutSaveStatus] = useState<SaveStatus>("idle");
  const [collapseSaveStatus, setCollapseSaveStatus] = useState<SaveStatus>("idle");
  const [visibilitySaveStatus, setVisibilitySaveStatus] =
    useState<SaveStatus>("idle");
  const [sectionManagerOpen, setSectionManagerOpen] = useState(false);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [clearBusy, setClearBusy] = useState(false);
  const collapseSeedRef = useRef<ReturnType<typeof seedAssessmentCollapseOpen> | null>(
    null,
  );
  if (collapseSeedRef.current === null) {
    collapseSeedRef.current = seedAssessmentCollapseOpen(
      shell?.assessmentDefaults?.sectionCollapsed,
      shell?.assessmentDefaults?.sectionOrder,
      customBlockIds,
    );
  }
  const collapseSeed = collapseSeedRef.current;

  const lastPersistedSectionOrderRef = useRef<string | null>(null);
  const lastPersistedCollapseRef = useRef<string | null>(collapseSeed.persistedKey);
  const lastPersistedHiddenRef = useRef<string | null>(null);
  const hasHydratedCollapseRef = useRef(collapseSeed.ready);
  const hasHydratedHiddenRef = useRef(false);

  const [storedSectionOrder, setStoredSectionOrder] = useState<
    AssessmentSectionId[] | null
  >(shell?.assessmentDefaults?.sectionOrder ?? null);
  const [storedSectionCollapsed, setStoredSectionCollapsed] =
    useState<AssessmentSectionCollapseMap | null>(
      shell?.assessmentDefaults?.sectionCollapsed ?? null,
    );
  const [storedSectionHidden, setStoredSectionHidden] =
    useState<AssessmentSectionHiddenSet | null>(
      shell?.assessmentDefaults?.sectionHidden ?? null,
    );
  const [openById, setOpenById] = useState<Record<string, boolean>>(
    () => collapseSeed.openById,
  );
  const [collapseReady, setCollapseReady] = useState(() => collapseSeed.ready);
  const [hiddenIds, setHiddenIds] = useState<AssessmentSectionHiddenSet>(
    () => shell?.assessmentDefaults?.sectionHidden ?? [],
  );

  const [sectionOrder, setSectionOrder] = useState<AssessmentSectionId[]>(() => {
    const stored = shell?.assessmentDefaults?.sectionOrder;
    if (stored == null) return [];
    return resolveInitialSectionOrder(stored, customBlockIds);
  });

  const layoutHydrated =
    storedSectionOrder !== null &&
    storedSectionHidden !== null &&
    sectionOrder.length > 0;

  const mountableIds = useMemo(
    () => resolveAvailableSectionIds(customBlockIds),
    [customBlockIds],
  );

  const visibleSectionOrder = useMemo(
    () => resolveVisibleSections(sectionOrder, hiddenIds, mountableIds),
    [hiddenIds, mountableIds, sectionOrder],
  );

  const defaultsById = useMemo(
    () => buildCollapseDefaults(sectionOrder),
    [sectionOrder],
  );

  const collapseHydrated = storedSectionCollapsed !== null;
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
    (sectionId: AssessmentSectionId, open: boolean) => {
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

  const hasClearableAssessment = useMemo(
    () => rxFormHasClearableAssessmentContent(state.fields),
    [state.fields],
  );

  const clearAllAssessment = useCallback(() => {
    if (disabled || !hasClearableAssessment) return;
    setClearBusy(true);
    try {
      for (const action of buildAssessmentClearAllActions(state.fields)) {
        dispatch(action);
      }
      collapseAllSections();
      setClearConfirmOpen(false);
    } finally {
      setClearBusy(false);
    }
  }, [collapseAllSections, disabled, dispatch, hasClearableAssessment, state.fields]);

  // ---- Hydration: shell prefetch or standalone settings fetch --------------
  useEffect(() => {
    if (shell?.assessmentDefaults != null) {
      setStoredSectionOrder(shell.assessmentDefaults.sectionOrder);
      return;
    }
    if (!token) {
      setStoredSectionOrder([]);
      return;
    }
    let cancelled = false;
    void fetchAssessmentSectionOrder(token)
      .then((order) => {
        if (!cancelled) setStoredSectionOrder(order);
      })
      .catch(() => {
        if (!cancelled) setStoredSectionOrder([]);
      });
    return () => {
      cancelled = true;
    };
  }, [shell?.assessmentDefaults, token]);

  useEffect(() => {
    if (shell?.assessmentDefaults != null) {
      setStoredSectionCollapsed(shell.assessmentDefaults.sectionCollapsed);
      return;
    }
    if (!token) {
      setStoredSectionCollapsed({});
      return;
    }
    let cancelled = false;
    void fetchAssessmentSectionCollapsed(token)
      .then((collapsed) => {
        if (!cancelled) setStoredSectionCollapsed(collapsed);
      })
      .catch(() => {
        if (!cancelled) setStoredSectionCollapsed({});
      });
    return () => {
      cancelled = true;
    };
  }, [shell?.assessmentDefaults, token]);

  useEffect(() => {
    if (shell?.assessmentDefaults != null) {
      setStoredSectionHidden(shell.assessmentDefaults.sectionHidden);
      return;
    }
    if (!token) {
      setStoredSectionHidden([]);
      return;
    }
    let cancelled = false;
    void fetchAssessmentSectionHidden(token)
      .then((hidden) => {
        if (!cancelled) setStoredSectionHidden(hidden);
      })
      .catch(() => {
        if (!cancelled) setStoredSectionHidden([]);
      });
    return () => {
      cancelled = true;
    };
  }, [shell?.assessmentDefaults, token]);

  useEffect(() => {
    if (storedSectionOrder === null) return;
    const resolved = resolveInitialSectionOrder(storedSectionOrder, customBlockIds);
    setSectionOrder(resolved);
    lastPersistedSectionOrderRef.current = JSON.stringify(resolved);
    // customBlockIds intentionally omitted — sync effect below merges new blocks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storedSectionOrder]);

  // assessment-plan-custom-sections: fold added/removed custom blocks into order.
  useEffect(() => {
    if (storedSectionOrder === null) return;
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
  }, [customBlockIds, storedSectionOrder]);

  // Focus a newly-added custom block's title (added entry is prepended).
  useEffect(() => {
    if (customSections.length > prevCustomBlockCountRef.current) {
      const added = customSections[0];
      if (added) focusBlockIdRef.current = added.id;
    }
    prevCustomBlockCountRef.current = customSections.length;
  }, [customSections]);

  useEffect(() => {
    if (storedSectionHidden === null) return;
    if (hasHydratedHiddenRef.current) return;
    hasHydratedHiddenRef.current = true;

    setHiddenIds(storedSectionHidden);
    lastPersistedHiddenRef.current = serializeHiddenIds(
      hiddenOverridesToPersist(storedSectionHidden, mountableIds),
    );
    // Intentionally omit mountableIds — one-shot hydrate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storedSectionHidden]);

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

    const serialized = JSON.stringify(sectionOrder);
    if (serialized === lastPersistedSectionOrderRef.current) return;

    setLayoutSaveStatus("saving");
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const saved = await saveAssessmentSectionOrder(token, sectionOrder);
          lastPersistedSectionOrderRef.current = JSON.stringify(saved);
          setStoredSectionOrder(saved);
          shell?.setAssessmentDefaults((prev) =>
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
          const saved = await saveAssessmentSectionCollapsed(token, overrides);
          lastPersistedCollapseRef.current = serializeCollapseOverrides(saved);
          setStoredSectionCollapsed(saved);
          shell?.setAssessmentDefaults((prev) =>
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
  }, [
    defaultsById,
    disabled,
    effectiveOpenById,
    shell,
    storedSectionCollapsed,
    token,
  ]);

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
          const saved = await saveAssessmentSectionHidden(token, toPersist);
          lastPersistedHiddenRef.current = serializeHiddenIds(saved);
          setStoredSectionHidden(saved);
          shell?.setAssessmentDefaults((prev) =>
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

  // ---- Doctor-default autosave: custom section structure ----------------------
  const lastPersistedCustomStructureRef = useRef<string>(
    assessmentCustomSectionsStructureKey(state.fields.assessmentCustomSections),
  );

  useEffect(() => {
    if (disabled || !token) return;

    const structureKey = assessmentCustomSectionsStructureKey(customSections);
    if (structureKey === lastPersistedCustomStructureRef.current) return;

    const template = assessmentCustomSectionsToDefaultTemplate(customSections);
    // Untitled-only edits never reach the default (the template drops them).
    if (template.length === 0 && customSections.length > 0) {
      lastPersistedCustomStructureRef.current = structureKey;
      return;
    }

    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          await saveAssessmentCustomSectionsDefault(token, customSections);
          lastPersistedCustomStructureRef.current = structureKey;
          shell?.setAssessmentDefaults((prev) =>
            prev
              ? { ...prev, customSections: template }
              : {
                  sectionOrder: [],
                  sectionCollapsed: {},
                  sectionHidden: [],
                  customSections: template,
                },
          );
        } catch {
          // Best-effort; visit content is unaffected by a default-save failure.
        }
      })();
    }, DOCTOR_LAYOUT_AUTOSAVE_MS);

    return () => window.clearTimeout(timer);
  }, [customSections, disabled, shell, token]);

  const handleAddCustomSection = useCallback(() => {
    if (disabled) return;
    if (customSections.length >= ASSESSMENT_CUSTOM_SECTIONS_MAX) return;
    dispatch({ type: "ADD_ASSESSMENT_CUSTOM_SECTION", section: createEmptyCustomSubsection() });
    setSectionManagerOpen(false);
  }, [customSections.length, disabled, dispatch]);

  const handleRemoveCustomSection = useCallback(
    (sectionId: AssessmentSectionId) => {
      if (disabled || !isCustomBlockSectionId(sectionId)) return;
      const blockId = customBlockIdFromSectionId(sectionId);
      const index = customSections.findIndex((section) => section.id === blockId);
      if (index === -1) return;
      dispatch({ type: "REMOVE_ASSESSMENT_CUSTOM_SECTION", index });
    },
    [customSections, disabled, dispatch],
  );

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
    (sectionId: AssessmentSectionId, direction: "up" | "down") => {
      const index = sectionOrder.indexOf(sectionId);
      if (index === -1) return;
      handleMoveByDirection(index, direction);
    },
    [handleMoveByDirection, sectionOrder],
  );

  const handleToggleSectionHidden = useCallback(
    (sectionId: AssessmentSectionId) => {
      setHiddenIds((prev) =>
        prev.includes(sectionId)
          ? prev.filter((id) => id !== sectionId)
          : [...prev, sectionId],
      );
    },
    [],
  );

  const dragHandleProps = useCallback(
    (sectionId: AssessmentSectionId): HTMLAttributes<HTMLDivElement> => ({
      draggable: !disabled,
      onDragStart: (e: DragEvent<HTMLDivElement>) => {
        dragSectionIdRef.current = sectionId;
        e.dataTransfer?.setData(ASSESSMENT_SECTION_DRAG_MIME, sectionId);
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
    (
      targetIndex: number,
      sectionId: AssessmentSectionId,
      e: DragEvent<HTMLDivElement>,
    ) => {
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

  const diagnosisCount = normalizeDiagnoses(state.fields.diagnoses).length;
  const AssessmentTabIcon = SOAP_TAB_HEADING_ICON.assessment;
  const showAllHiddenEmptyState = layoutHydrated && visibleSectionOrder.length === 0;

  const sectionBody = (sectionId: StaticAssessmentSectionId): ReactNode => {
    switch (sectionId) {
      case "diagnoses":
        return <DiagnosisRowsList disabled={disabled} hideHeading />;
      case "known_conditions":
        return <OngoingProblemsZone disabled={disabled} hideHeading />;
      case "assessment_notes":
        return (
          <div>
            <label htmlFor="assessmentNote" className="sr-only">
              Additional notes (private)
            </label>
            <textarea
              id="assessmentNote"
              rows={2}
              value={state.fields.assessmentNote}
              onChange={(e) => setField("assessmentNote", e.target.value)}
              className={RX_FIELD_INPUT_CLASS}
              placeholder="Clinical impression, reasoning, and other notes"
              maxLength={5000}
              disabled={disabled}
            />
          </div>
        );
    }
  };

  const sectionMeta = (
    sectionId: StaticAssessmentSectionId,
  ): {
    title: string;
    testId: string;
    count: number | null;
    icon: typeof ClipboardList;
    actions?: ReactNode;
  } => {
    switch (sectionId) {
      case "diagnoses":
        return {
          title: "Diagnoses",
          testId: "assessment-diagnoses-zone",
          count: diagnosisCount > 0 ? diagnosisCount : null,
          icon: Stethoscope,
          actions: !disabled ? (
            <AssessmentSectionTemplateButton scope="diagnoses" disabled={disabled} />
          ) : undefined,
        };
      case "known_conditions":
        return {
          title: "Known conditions",
          testId: "assessment-known-conditions-zone",
          count: chartConditions.length > 0 ? chartConditions.length : null,
          icon: ClipboardList,
          actions: !disabled ? (
            <AssessmentSectionTemplateButton
              scope="known_conditions"
              disabled={disabled}
              knownConditionsBridge={knownConditionsBridge}
            />
          ) : undefined,
        };
      case "assessment_notes":
        return {
          title: "Additional notes (private)",
          testId: "assessment-notes-zone",
          count: state.fields.assessmentNote.trim() ? 1 : null,
          icon: NotebookPen,
          actions: !disabled ? (
            <AssessmentSectionTemplateButton
              scope="assessment_notes"
              disabled={disabled}
            />
          ) : undefined,
        };
    }
  };

  const renderCustomBlockInner = (
    sectionId: AssessmentSectionId,
    leadingActions: ReactNode,
  ): ReactNode => {
    const blockId = customBlockIdFromSectionId(sectionId);
    const blockIndex = customSections.findIndex((section) => section.id === blockId);
    const block = customSections[blockIndex];
    if (!block) return null;

    return (
      <CustomSubsectionBlock
        section={block}
        sectionId={sectionId}
        disabled={disabled}
        scrollSelector={ASSESSMENT_SCROLL_TOP_SELECTOR}
        leadingActions={leadingActions}
        focusTitleOnMount={focusBlockIdRef.current === block.id}
        pendingChildFocusId={focusChildIdRef.current}
        onUpdate={(patch) => {
          if (disabled) return;
          if (focusBlockIdRef.current === block.id) focusBlockIdRef.current = null;
          dispatch({ type: "UPDATE_ASSESSMENT_CUSTOM_SECTION", index: blockIndex, patch });
        }}
        onRemove={() => handleRemoveCustomSection(sectionId)}
        onAddChild={() => {
          if (disabled) return;
          const child = createEmptyCustomSubsectionChild();
          focusChildIdRef.current = child.id;
          dispatch({
            type: "ADD_ASSESSMENT_CUSTOM_SECTION_CHILD",
            sectionId: block.id,
            child,
          });
        }}
        onUpdateChild={(childIndex, patch) => {
          if (disabled) return;
          dispatch({
            type: "UPDATE_ASSESSMENT_CUSTOM_SECTION_CHILD",
            sectionId: block.id,
            childIndex,
            patch,
          });
        }}
        onRemoveChild={(childIndex) => {
          if (disabled) return;
          dispatch({
            type: "REMOVE_ASSESSMENT_CUSTOM_SECTION_CHILD",
            sectionId: block.id,
            childIndex,
          });
        }}
        onMoveChildUp={(childIndex) => {
          if (disabled || childIndex <= 0) return;
          dispatch({
            type: "REORDER_ASSESSMENT_CUSTOM_SECTION_CHILDREN",
            sectionId: block.id,
            fromIndex: childIndex,
            toIndex: childIndex - 1,
          });
        }}
        onMoveChildDown={(childIndex) => {
          const childCount = block.children?.length ?? 0;
          if (disabled || childIndex >= childCount - 1) return;
          dispatch({
            type: "REORDER_ASSESSMENT_CUSTOM_SECTION_CHILDREN",
            sectionId: block.id,
            fromIndex: childIndex,
            toIndex: childIndex + 1,
          });
        }}
      />
    );
  };

  const renderSection = (sectionId: AssessmentSectionId) => {
    const index = sectionOrder.indexOf(sectionId);
    const isDropTarget = dropTarget?.index === index;
    const dropIntent = isDropTarget ? dropTarget.intent : null;
    const title = resolveAssessmentSectionLabel(sectionId, customSections);

    const leadingActions = !disabled ? (
      <AssessmentSectionDragHandle
        dragHandleProps={dragHandleProps(sectionId)}
        ariaLabel={`Reorder ${title}. Use arrow keys to move.`}
        disabled={disabled}
        index={index}
        count={sectionOrder.length}
        onMoveUp={() => handleMoveByDirection(index, "up")}
        onMoveDown={() => handleMoveByDirection(index, "down")}
      />
    ) : undefined;

    let inner: ReactNode;
    if (isCustomBlockSectionId(sectionId)) {
      inner = renderCustomBlockInner(sectionId, leadingActions);
      if (inner === null) return null;
    } else {
      const meta = sectionMeta(sectionId);
      inner = (
        <CollapsibleContainer
          title={meta.title}
          sectionIcon={sectionHeaderIcon(meta.icon)}
          toggleLabel={`Toggle ${meta.title.replace(" (private)", "")}`}
          testId={meta.testId}
          count={meta.count}
          depthTone
          stickyHeader
          scrollOnExpand
          closeScrollToSelector={ASSESSMENT_SCROLL_TOP_SELECTOR}
          leadingActions={leadingActions}
          actions={meta.actions}
          open={collapseControlled ? displayOpenById[sectionId] : undefined}
          onOpenChange={
            collapseControlled
              ? (open) => handleSectionOpenChange(sectionId, open)
              : undefined
          }
          defaultOpen={
            collapseControlled ? undefined : ASSESSMENT_COLLAPSE_DEFAULTS[sectionId]
          }
        >
          {sectionBody(sectionId)}
        </CollapsibleContainer>
      );
    }

    return (
      <AssessmentSortableSectionShell
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
          const sourceId =
            dragSectionIdRef.current ??
            readAssessmentSectionDragId(e.dataTransfer);
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
      </AssessmentSortableSectionShell>
    );
  };

  return (
    <SoapTabFamilyProvider family="assessment">
      <section
        id="rx-diagnosis"
        aria-label="Assessment"
        className="space-y-3"
        data-testid="assessment-scroll-top"
      >
        {heading !== null ? (
          <h3
            className={soapTabHeadingClassName(
              "assessment",
              RX_SECTION_HEADING_CLASS,
            )}
          >
            <AssessmentTabIcon
              className="h-4 w-4 shrink-0 text-muted-foreground"
              aria-hidden
            />
            {heading}
          </h3>
        ) : null}

        {!disabled ? (
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
              expandTestId="assessment-expand-all"
              collapseTestId="assessment-collapse-all"
              clearTestId="assessment-clear-all"
              onExpandAll={expandAllSections}
              onCollapseAll={collapseAllSections}
              onClearAll={() => setClearConfirmOpen(true)}
              clearDisabled={!hasClearableAssessment}
            />
            <AssessmentWholeTemplateButton
              disabled={disabled}
              knownConditionsBridge={knownConditionsBridge}
            />
            <ManageAssessmentSectionsMenu
              disabled={disabled}
              open={sectionManagerOpen}
              onOpenChange={setSectionManagerOpen}
              sectionOrder={sectionOrder}
              mountableIds={mountableIds}
              hiddenIds={hiddenIds}
              fields={state.fields}
              customSections={customSections}
              onToggleHidden={handleToggleSectionHidden}
              onMoveSection={handleMoveSectionById}
              onAddCustomSection={handleAddCustomSection}
              onRemoveCustomSection={handleRemoveCustomSection}
            />
          </div>
        ) : null}

        {showAllHiddenEmptyState ? (
          <div
            className="rounded-md border border-dashed border-border bg-muted/10 px-3 py-4 text-center"
            data-testid="assessment-all-hidden-empty"
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
          <SoapSectionListSkeleton testId="assessment-layout-skeleton" rows={3} />
        ) : (
          <>
            {visibleSectionOrder.map((sectionId) => renderSection(sectionId))}
            {!disabled ? (
              <SoapTabCustomSectionsAddChrome
                disabled={disabled}
                sectionCount={customSections.length}
                max={ASSESSMENT_CUSTOM_SECTIONS_MAX}
                emptyHint="Add your own assessment headings — e.g. differential notes, risk factors, shared decision."
                emptyTestId="assessment-custom-sections-empty"
                addFirstTestId="assessment-custom-sections-add-first"
                addMoreTestId="assessment-custom-sections-add-more"
                onAdd={handleAddCustomSection}
              />
            ) : null}
          </>
        )}
      </section>

      <ClearAllConfirmDialog
        open={clearConfirmOpen}
        onOpenChange={(open) => {
          if (!clearBusy) setClearConfirmOpen(open);
        }}
        title="Clear all assessment content?"
        descriptionLead="This cannot be undone from this screen. Chart Known conditions are not cleared."
        bullets={[...ASSESSMENT_CLEAR_ALL_BULLETS]}
        busy={clearBusy}
        testId="assessment-clear-all-dialog"
        onConfirm={clearAllAssessment}
      />
    </SoapTabFamilyProvider>
  );
}
