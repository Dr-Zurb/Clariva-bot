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
import { ComplaintList } from "@/components/cockpit/rx/subjective/ComplaintList";
import { useHistoryFieldRegistry } from "@/components/cockpit/rx/subjective/HistoryFields";
import { CarryForwardButton } from "@/components/cockpit/rx/subjective/CarryForwardButton";
import {
  SubjectivePresetButton,
  SubjectivePmhBridgeProvider,
  type PmhTemplateBridge,
} from "@/components/cockpit/rx/subjective/SubjectivePresetButton";
import { PatientBackgroundZone } from "@/components/cockpit/rx/subjective/PatientBackgroundZone";
import { PatientAllergiesZone } from "@/components/cockpit/rx/subjective/PatientAllergiesZone";
import { PastSurgicalHistoryField } from "@/components/cockpit/rx/subjective/PastSurgicalHistoryField";
import { CustomSubsectionBlock } from "@/components/cockpit/rx/subjective/CustomSubsectionBlock";
import { CustomSectionTemplateButton } from "@/components/cockpit/rx/subjective/CustomSectionTemplateButton";
import { SubjectiveSectionTemplateButton } from "@/components/cockpit/rx/subjective/SubjectiveSectionTemplateButton";
import { DeleteCustomSectionDialog } from "@/components/cockpit/rx/subjective/DeleteCustomSectionDialog";
import {
  CustomSubsectionsChrome,
  createEmptyCustomSubsectionChild,
} from "@/components/cockpit/rx/subjective/CustomSubsectionsField";
import { createEmptyCustomSubsection } from "@/lib/cockpit/custom-subsections";
import {
  fetchLinkedCustomSectionTemplates,
  type LinkedCustomSectionTemplateCounts,
} from "@/lib/cockpit/custom-section-linked-templates";
import { archiveCustomBlockTemplates } from "@/lib/cockpit/archive-custom-block-templates";
import { SectionManagerMenu } from "@/components/cockpit/rx/subjective/SectionManagerMenu";
import {
  SortableSectionShell,
  SectionReorderLeadingAction,
} from "@/components/cockpit/rx/subjective/SortableSectionShell";
import { CollapsibleContainer } from "@/components/ui/CollapsibleContainer";
import { SUBJECTIVE_SCROLL_TOP_SELECTOR } from "@/lib/cockpit/exam-card-scroll";
import type { PatientChartMode } from "@/types/patient-chart";
import {
  customBlockIdFromSectionId,
  isCustomBlockSectionId,
  isStaticSubjectiveSectionId,
  resolveCustomEmptyChromeIndex,
  resolveInitialSectionOrder,
  resolveSubjectiveSectionLabel,
  resolveAvailableSectionIds,
  fetchSubjectiveSectionOrder,
  removeCustomBlockFromOrder,
  saveSubjectiveSectionOrder,
  syncCustomBlockIdsInOrder,
  type StaticSubjectiveSectionId,
  type SubjectiveSectionId,
} from "@/lib/cockpit/subjective-section-order";
import {
  SUBJECTIVE_SECTION_DRAG_MIME,
  moveSectionInOrder,
  readSubjectiveSectionDragId,
  reorderSectionInOrder,
  resolveSectionDropIntent,
  type SectionDropIntent,
} from "@/lib/cockpit/section-drag";
import { hasFamilyHistoryStructuredContent } from "@/lib/cockpit/family-history";
import { hasPastSurgicalHistoryStructuredContent } from "@/lib/cockpit/past-surgical-history";
import {
  collapseOverridesToPersist,
  fetchSubjectiveSectionCollapsed,
  resolveSectionOpenState,
  saveSubjectiveSectionCollapsed,
  serializeCollapseOverrides,
  type SubjectiveSectionCollapseMap,
} from "@/lib/cockpit/subjective-section-collapse";
import {
  fetchSubjectiveSectionHidden,
  hiddenOverridesToPersist,
  resolveVisibleSections,
  saveSubjectiveSectionHidden,
  serializeHiddenIds,
  type SubjectiveSectionHiddenSet,
} from "@/lib/cockpit/subjective-section-visibility";
import {
  RX_FIELD_INPUT_CLASS,
  RX_FIELD_LABEL_CLASS,
  RX_SECTION_HEADING_CLASS,
} from "@/components/cockpit/rx/sections/field-styles";
import {
  SOAP_TAB_HEADING_ICON,
  SoapTabFamilyProvider,
  SoapSectionListSkeleton,
  resolveSubjectiveSectionIcon,
  sectionHeaderIcon,
  soapTabHeadingClassName,
} from "@/components/cockpit/rx/sections/section-chrome";
import {
  buildSubjectiveClearAllActions,
  rxFormHasClearableSubjectiveContent,
} from "@/lib/cockpit/apply-subjective-template";
import { ClearAllConfirmDialog } from "@/components/cockpit/rx/ClearAllConfirmDialog";
import {
  SoapTabExpandCollapseClearButtons,
  SoapTabLayoutSaveStatus,
} from "@/components/cockpit/rx/SoapTabChromeActions";

const DOCTOR_LAYOUT_AUTOSAVE_MS = 500;

export interface SubjectiveSectionProps {
  heading?: string | null;
  disabled?: boolean;
  patientId?: string | null;
  token?: string;
  chartMode?: PatientChartMode;
}

type DropTargetState = {
  index: number;
  intent: SectionDropIntent;
};

type SaveOrderStatus = "idle" | "saving" | "saved" | "error";

import type { FamilyHistoryStructured } from "@/lib/cockpit/family-history";
import type { PastSurgicalHistoryStructured } from "@/lib/cockpit/past-surgical-history";

function buildSubjectiveSectionCollapseDefaults(
  linkedChart: boolean,
  sectionOrder: readonly SubjectiveSectionId[],
  familyHistoryStructured: FamilyHistoryStructured,
  pastSurgicalHistoryStructured: PastSurgicalHistoryStructured,
): Record<SubjectiveSectionId, boolean> {
  const catalog: Partial<Record<StaticSubjectiveSectionId, boolean>> = {
    chief_complaints: true,
    family_history: hasFamilyHistoryStructuredContent(familyHistoryStructured),
    social_history: false,
    free_text_notes: false,
  };

  if (linkedChart) {
    catalog.patient_background = true;
    catalog.allergies = false;
    catalog.past_surgical = false;
  } else {
    catalog.past_surgical = hasPastSurgicalHistoryStructuredContent(pastSurgicalHistoryStructured);
  }

  const result = {} as Record<SubjectiveSectionId, boolean>;
  for (const id of sectionOrder) {
    if (!isStaticSubjectiveSectionId(id)) continue;
    const defaultOpen = catalog[id];
    if (defaultOpen !== undefined) result[id] = defaultOpen;
  }
  return result;
}

type RenderItem =
  | { kind: "section"; sectionId: SubjectiveSectionId }
  | { kind: "custom-empty" };

export function SubjectiveSection({
  heading = "Subjective",
  disabled = false,
  patientId = null,
  token: tokenProp,
  chartMode = "default",
}: SubjectiveSectionProps) {
  const { state, dispatch, setField, setPastSurgicalHistoryStructured, token: formToken } =
    useRxForm();
  const token = tokenProp ?? formToken;
  const shell = usePrescriptionFormShell();
  const { fields } = state;
  const customSubsections = fields.customSubsections;
  const customBlockIds = useMemo(
    () => customSubsections.map((section) => section.id),
    [customSubsections],
  );
  const [pmhBridge, setPmhBridge] = useState<PmhTemplateBridge | null>(null);
  const linkedChart = Boolean(patientId && token);
  const dragSectionIdRef = useRef<SubjectiveSectionId | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTargetState | null>(null);
  const [layoutSaveStatus, setLayoutSaveStatus] = useState<SaveOrderStatus>("idle");
  const lastPersistedSectionOrderRef = useRef<string | null>(null);
  const syncingBlocksFromOrderRef = useRef(false);
  const focusChildIdRef = useRef<string | null>(null);
  const focusBlockIdRef = useRef<string | null>(null);
  const prevCustomBlockCountRef = useRef(customSubsections.length);
  const [storedSectionOrder, setStoredSectionOrder] = useState<SubjectiveSectionId[] | null>(
    shell?.subjectiveSectionOrder ?? null,
  );
  const [storedSectionCollapsed, setStoredSectionCollapsed] =
    useState<SubjectiveSectionCollapseMap | null>(shell?.subjectiveSectionCollapsed ?? null);
  const [storedSectionHidden, setStoredSectionHidden] = useState<SubjectiveSectionHiddenSet | null>(
    shell?.subjectiveSectionHidden ?? null,
  );
  const [collapseSaveStatus, setCollapseSaveStatus] = useState<SaveOrderStatus>("idle");
  const [visibilitySaveStatus, setVisibilitySaveStatus] = useState<SaveOrderStatus>("idle");
  const lastPersistedCollapseRef = useRef<string | null>(null);
  const lastPersistedHiddenRef = useRef<string | null>(null);
  const hasHydratedCollapseRef = useRef(false);
  const hasHydratedHiddenRef = useRef(false);
  const [openById, setOpenById] = useState<Record<SubjectiveSectionId, boolean>>(
    {} as Record<SubjectiveSectionId, boolean>,
  );
  const [hiddenIds, setHiddenIds] = useState<SubjectiveSectionHiddenSet>(
    () => shell?.subjectiveSectionHidden ?? [],
  );
  const [sectionManagerOpen, setSectionManagerOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteDialogLoading, setDeleteDialogLoading] = useState(false);
  const [deleteDialogBusy, setDeleteDialogBusy] = useState(false);
  const [deleteArchiveNotice, setDeleteArchiveNotice] = useState<string | null>(null);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [clearBusy, setClearBusy] = useState(false);
  const [pendingDeleteSectionId, setPendingDeleteSectionId] =
    useState<SubjectiveSectionId | null>(null);
  const [pendingDeleteCounts, setPendingDeleteCounts] =
    useState<LinkedCustomSectionTemplateCounts | null>(null);

  // Empty until order hydrates — painting DEFAULT_SECTION_ORDER first caused a
  // visible rearrange when doctor settings arrived.
  const [sectionOrder, setSectionOrder] = useState<SubjectiveSectionId[]>(() => {
    const stored = shell?.subjectiveSectionOrder;
    if (stored == null) return [];
    return resolveInitialSectionOrder(stored, linkedChart, customBlockIds);
  });

  const layoutHydrated =
    storedSectionOrder !== null &&
    storedSectionHidden !== null &&
    // Wait until the resolve effect has populated order — otherwise we flash
    // "all hidden" / empty while sectionOrder is still [].
    sectionOrder.length > 0;

  const mountableIds = useMemo(
    () => resolveAvailableSectionIds(linkedChart, customBlockIds),
    [customBlockIds, linkedChart],
  );

  const visibleSectionOrder = useMemo(
    () => resolveVisibleSections(sectionOrder, hiddenIds, mountableIds),
    [hiddenIds, mountableIds, sectionOrder],
  );

  const defaultsById = useMemo(
    () =>
      buildSubjectiveSectionCollapseDefaults(
        linkedChart,
        sectionOrder,
        fields.familyHistoryStructured,
        fields.pastSurgicalHistoryStructured,
      ),
    [
      fields.familyHistoryStructured,
      fields.pastSurgicalHistoryStructured,
      linkedChart,
      sectionOrder,
    ],
  );

  const collapseHydrated = storedSectionCollapsed !== null;
  /** Controlled collapse whenever persistence is expected (avoids uncontrolled defaultOpen flash). */
  const collapseControlled = collapseHydrated || Boolean(token);

  const effectiveOpenById = useMemo((): Record<SubjectiveSectionId, boolean> => {
    if (!collapseControlled) return {} as Record<SubjectiveSectionId, boolean>;
    const merged = {} as Record<SubjectiveSectionId, boolean>;
    for (const [id, defaultOpen] of Object.entries(defaultsById)) {
      merged[id as SubjectiveSectionId] = openById[id as SubjectiveSectionId] ?? defaultOpen;
    }
    return merged;
  }, [collapseControlled, defaultsById, openById]);

  const displayOpenById = useMemo((): Record<SubjectiveSectionId, boolean> => {
    if (!collapseControlled) return {} as Record<SubjectiveSectionId, boolean>;
    if (!collapseHydrated) {
      const collapsed = {} as Record<SubjectiveSectionId, boolean>;
      for (const id of Object.keys(defaultsById) as SubjectiveSectionId[]) {
        collapsed[id] = false;
      }
      return collapsed;
    }
    return effectiveOpenById;
  }, [collapseControlled, collapseHydrated, defaultsById, effectiveOpenById]);

  const handleSectionOpenChange = useCallback(
    (sectionId: SubjectiveSectionId, open: boolean) => {
      setOpenById((prev) => ({ ...prev, [sectionId]: open }));
    },
    [],
  );

  /** Bulk survey/reset — no scroll (matches ExamSystemList). */
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

  const hasClearableSubjective = useMemo(() => {
    if (rxFormHasClearableSubjectiveContent(fields)) return true;
    return Boolean(pmhBridge?.hasContent());
  }, [fields, pmhBridge]);

  const clearAllSubjective = useCallback(async () => {
    if (disabled || !hasClearableSubjective) return;
    setClearBusy(true);
    try {
      for (const action of buildSubjectiveClearAllActions(fields)) {
        dispatch(action);
      }
      if (pmhBridge?.hasContent()) {
        await pmhBridge.clearAll();
      }
      collapseAllSections();
      setClearConfirmOpen(false);
    } finally {
      setClearBusy(false);
    }
  }, [collapseAllSections, disabled, dispatch, fields, hasClearableSubjective, pmhBridge]);

  const clearConfirmBullets = useMemo(() => {
    const bullets = [
      "Chief complaints and free-text notes",
      "Family, social, and past surgical history",
      "Custom section notes (section titles kept)",
    ];
    if (pmhBridge) {
      bullets.push("Past medical history on the patient chart (conditions and medications)");
      bullets.push("Allergies are not cleared");
    }
    return bullets;
  }, [pmhBridge]);

  const sectionOpenControl = useMemo(
    () =>
      collapseControlled
        ? { openById: displayOpenById, onOpenChange: handleSectionOpenChange }
        : undefined,
    [collapseControlled, displayOpenById, handleSectionOpenChange],
  );

  const historyFieldRegistry = useHistoryFieldRegistry(disabled, sectionOpenControl);

  useEffect(() => {
    if (shell?.subjectiveSectionOrder != null) {
      setStoredSectionOrder(shell.subjectiveSectionOrder);
      return;
    }
    if (!token) {
      setStoredSectionOrder([]);
      return;
    }
    let cancelled = false;
    void fetchSubjectiveSectionOrder(token)
      .then((order) => {
        if (!cancelled) setStoredSectionOrder(order);
      })
      .catch(() => {
        if (!cancelled) setStoredSectionOrder([]);
      });
    return () => {
      cancelled = true;
    };
  }, [shell?.subjectiveSectionOrder, token]);

  useEffect(() => {
    if (shell?.subjectiveSectionCollapsed != null) {
      setStoredSectionCollapsed(shell.subjectiveSectionCollapsed);
      return;
    }
    if (!token) {
      setStoredSectionCollapsed({});
      return;
    }
    let cancelled = false;
    void fetchSubjectiveSectionCollapsed(token)
      .then((collapsed) => {
        if (!cancelled) setStoredSectionCollapsed(collapsed);
      })
      .catch(() => {
        if (!cancelled) setStoredSectionCollapsed({});
      });
    return () => {
      cancelled = true;
    };
  }, [shell?.subjectiveSectionCollapsed, token]);

  useEffect(() => {
    if (shell?.subjectiveSectionHidden != null) {
      setStoredSectionHidden(shell.subjectiveSectionHidden);
      return;
    }
    if (!token) {
      setStoredSectionHidden([]);
      return;
    }
    let cancelled = false;
    void fetchSubjectiveSectionHidden(token)
      .then((hidden) => {
        if (!cancelled) setStoredSectionHidden(hidden);
      })
      .catch(() => {
        if (!cancelled) setStoredSectionHidden([]);
      });
    return () => {
      cancelled = true;
    };
  }, [shell?.subjectiveSectionHidden, token]);

  useEffect(() => {
    if (storedSectionOrder === null) return;
    const resolved = resolveInitialSectionOrder(storedSectionOrder, linkedChart, customBlockIds);
    setSectionOrder(resolved);
    lastPersistedSectionOrderRef.current = JSON.stringify(resolved);
  }, [linkedChart, storedSectionOrder]);

  useEffect(() => {
    if (storedSectionCollapsed === null) return;
    if (hasHydratedCollapseRef.current) return;
    // Wait until section order has produced defaults — otherwise stored overrides
    // are dropped against an empty defaults map and never re-applied.
    if (Object.keys(defaultsById).length === 0) return;
    hasHydratedCollapseRef.current = true;

    const resolved = resolveSectionOpenState(storedSectionCollapsed, defaultsById);
    setOpenById(resolved);
    lastPersistedCollapseRef.current = serializeCollapseOverrides(
      collapseOverridesToPersist(resolved, defaultsById),
    );
    // Intentionally omit further defaultsById changes — one-shot after first non-empty defaults.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- subsequent stored map writes must not clobber openById
  }, [storedSectionCollapsed, defaultsById]);

  useEffect(() => {
    if (storedSectionHidden === null) return;
    if (hasHydratedHiddenRef.current) return;
    hasHydratedHiddenRef.current = true;

    setHiddenIds(storedSectionHidden);
    lastPersistedHiddenRef.current = serializeHiddenIds(
      hiddenOverridesToPersist(storedSectionHidden, mountableIds),
    );
    // Intentionally omit mountableIds — one-shot hydrate; cross-mode retention is in the serialiser.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- subsequent stored set writes must not clobber hiddenIds
  }, [storedSectionHidden]);

  useEffect(() => {
    if (storedSectionOrder === null) return;
    setSectionOrder((prev) => {
      const next = syncCustomBlockIdsInOrder(prev, customBlockIds, linkedChart);
      if (
        next.length === prev.length &&
        next.every((id, index) => id === prev[index])
      ) {
        return prev;
      }
      return next;
    });
  }, [customBlockIds, linkedChart, storedSectionOrder]);

  useEffect(() => {
    if (customSubsections.length > prevCustomBlockCountRef.current) {
      // Newest section is prepended — focus the first entry.
      const added = customSubsections[0];
      if (added) focusBlockIdRef.current = added.id;
    }
    prevCustomBlockCountRef.current = customSubsections.length;
  }, [customSubsections]);

  useEffect(() => {
    if (disabled || !token || storedSectionOrder === null) return;

    const serialized = JSON.stringify(sectionOrder);
    if (serialized === lastPersistedSectionOrderRef.current) return;

    setLayoutSaveStatus("saving");
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const saved = await saveSubjectiveSectionOrder(token, sectionOrder);
          lastPersistedSectionOrderRef.current = JSON.stringify(saved);
          setStoredSectionOrder(saved);
          shell?.setSubjectiveSectionOrder(saved);
          setLayoutSaveStatus("saved");
        } catch {
          setLayoutSaveStatus("error");
        }
      })();
    }, DOCTOR_LAYOUT_AUTOSAVE_MS);

    return () => window.clearTimeout(timer);
  }, [disabled, sectionOrder, shell, storedSectionOrder, token]);

  useEffect(() => {
    if (disabled || !token || storedSectionCollapsed === null) return;

    const overrides = collapseOverridesToPersist(effectiveOpenById, defaultsById);
    const serialized = serializeCollapseOverrides(overrides);
    if (serialized === lastPersistedCollapseRef.current) return;

    setCollapseSaveStatus("saving");
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const saved = await saveSubjectiveSectionCollapsed(token, overrides);
          lastPersistedCollapseRef.current = serializeCollapseOverrides(saved);
          setStoredSectionCollapsed(saved);
          shell?.setSubjectiveSectionCollapsed(saved);
          setCollapseSaveStatus("saved");
        } catch {
          setCollapseSaveStatus("error");
        }
      })();
    }, DOCTOR_LAYOUT_AUTOSAVE_MS);

    return () => window.clearTimeout(timer);
  }, [defaultsById, disabled, effectiveOpenById, shell, storedSectionCollapsed, token]);

  useEffect(() => {
    if (disabled || !token || storedSectionHidden === null) return;

    const toPersist = hiddenOverridesToPersist(hiddenIds, mountableIds);
    const serialized = serializeHiddenIds(toPersist);
    if (serialized === lastPersistedHiddenRef.current) return;

    setVisibilitySaveStatus("saving");
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const saved = await saveSubjectiveSectionHidden(token, toPersist);
          lastPersistedHiddenRef.current = serializeHiddenIds(saved);
          setStoredSectionHidden(saved);
          shell?.setSubjectiveSectionHidden(saved);
          setVisibilitySaveStatus("saved");
        } catch {
          setVisibilitySaveStatus("error");
        }
      })();
    }, DOCTOR_LAYOUT_AUTOSAVE_MS);

    return () => window.clearTimeout(timer);
  }, [disabled, hiddenIds, mountableIds, shell, storedSectionHidden, token]);

  useEffect(() => {
    if (syncingBlocksFromOrderRef.current) return;

    const orderedIds = sectionOrder
      .filter(isCustomBlockSectionId)
      .map((id) => customBlockIdFromSectionId(id)!);
    if (orderedIds.length !== customSubsections.length) return;

    const currentIds = customSubsections.map((section) => section.id);
    if (orderedIds.every((id, index) => id === currentIds[index])) return;

    const byId = new Map(customSubsections.map((section) => [section.id, section]));
    const reordered = orderedIds
      .map((id) => byId.get(id))
      .filter((section): section is NonNullable<typeof section> => Boolean(section));
    if (reordered.length !== customSubsections.length) return;

    syncingBlocksFromOrderRef.current = true;
    dispatch({ type: "SET_CUSTOM_SUBSECTIONS", sections: reordered });
    queueMicrotask(() => {
      syncingBlocksFromOrderRef.current = false;
    });
  }, [customSubsections, dispatch, sectionOrder]);

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
    (sectionId: SubjectiveSectionId, direction: "up" | "down") => {
      const index = sectionOrder.indexOf(sectionId);
      if (index === -1) return;
      handleMoveByDirection(index, direction);
    },
    [handleMoveByDirection, sectionOrder],
  );

  const handleToggleSectionHidden = useCallback((sectionId: SubjectiveSectionId) => {
    setHiddenIds((prev) =>
      prev.includes(sectionId) ? prev.filter((id) => id !== sectionId) : [...prev, sectionId],
    );
  }, []);

  const handleAddCustomSection = useCallback(() => {
    if (disabled) return;
    dispatch({ type: "ADD_CUSTOM_SUBSECTION", section: createEmptyCustomSubsection() });
  }, [disabled, dispatch]);

  const performRemoveCustomSection = useCallback(
    (sectionId: SubjectiveSectionId) => {
      if (disabled || !isCustomBlockSectionId(sectionId)) return;
      const blockId = customBlockIdFromSectionId(sectionId);
      if (!blockId) return;
      const blockIndex = customSubsections.findIndex((section) => section.id === blockId);
      if (blockIndex < 0) return;
      dispatch({ type: "REMOVE_CUSTOM_SUBSECTION", index: blockIndex });
      setSectionOrder((prev) => removeCustomBlockFromOrder(prev, blockId));
      setHiddenIds((prev) => prev.filter((id) => id !== sectionId));
    },
    [customSubsections, disabled, dispatch],
  );

  const requestRemoveCustomSection = useCallback(
    (sectionId: SubjectiveSectionId) => {
      if (disabled || !isCustomBlockSectionId(sectionId) || !token) return;
      setPendingDeleteSectionId(sectionId);
      setPendingDeleteCounts(null);
      setDeleteDialogOpen(true);
      setDeleteDialogLoading(true);

      const blockId = customBlockIdFromSectionId(sectionId);
      if (!blockId) {
        setDeleteDialogLoading(false);
        return;
      }

      void fetchLinkedCustomSectionTemplates(token, blockId)
        .then((counts) => {
          setPendingDeleteCounts(counts);
        })
        .catch(() => {
          setPendingDeleteCounts({
            customBlockTemplates: [],
            subjectiveFullTemplates: [],
            customBlockCount: 0,
            subjectiveFullCount: 0,
          });
        })
        .finally(() => {
          setDeleteDialogLoading(false);
        });
    },
    [disabled, token],
  );

  const handleCancelDeleteCustomSection = useCallback(() => {
    if (deleteDialogBusy) return;
    setDeleteDialogOpen(false);
    setPendingDeleteSectionId(null);
    setPendingDeleteCounts(null);
  }, [deleteDialogBusy]);

  const handleConfirmDeleteCustomSection = useCallback(
    async ({ archiveCustomBlockTemplateIds }: { archiveCustomBlockTemplateIds: string[] }) => {
      if (!pendingDeleteSectionId) return;
      setDeleteDialogBusy(true);
      setDeleteArchiveNotice(null);
      try {
        if (token && archiveCustomBlockTemplateIds.length > 0) {
          const { failedIds } = await archiveCustomBlockTemplates(
            token,
            archiveCustomBlockTemplateIds,
          );
          if (failedIds.length > 0) {
            setDeleteArchiveNotice(
              `Removed section. Could not archive ${failedIds.length} linked template${failedIds.length === 1 ? "" : "s"}.`,
            );
          }
        }
        performRemoveCustomSection(pendingDeleteSectionId);
        setDeleteDialogOpen(false);
        setPendingDeleteSectionId(null);
        setPendingDeleteCounts(null);
      } finally {
        setDeleteDialogBusy(false);
      }
    },
    [pendingDeleteSectionId, performRemoveCustomSection, token],
  );

  const pendingDeleteTitle = useMemo(() => {
    if (!pendingDeleteSectionId || !isCustomBlockSectionId(pendingDeleteSectionId)) return "";
    const blockId = customBlockIdFromSectionId(pendingDeleteSectionId);
    return customSubsections.find((section) => section.id === blockId)?.title ?? "";
  }, [customSubsections, pendingDeleteSectionId]);

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

  const dragHandleProps = useCallback(
    (sectionId: SubjectiveSectionId): HTMLAttributes<HTMLDivElement> => ({
      draggable: !disabled,
      onDragStart: (e: DragEvent<HTMLDivElement>) => {
        dragSectionIdRef.current = sectionId;
        e.dataTransfer?.setData(SUBJECTIVE_SECTION_DRAG_MIME, sectionId);
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
    (targetIndex: number, sectionId: SubjectiveSectionId, e: DragEvent<HTMLDivElement>) => {
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

  const staticSectionRegistry = useMemo((): Partial<Record<StaticSubjectiveSectionId, ReactNode>> => {
    const sectionOpenProps = (sectionId: StaticSubjectiveSectionId) =>
      collapseControlled
        ? {
            sectionOpen: displayOpenById[sectionId],
            onSectionOpenChange: (open: boolean) => handleSectionOpenChange(sectionId, open),
          }
        : {};

    const registry: Partial<Record<StaticSubjectiveSectionId, ReactNode>> = {
      chief_complaints: <ComplaintList disabled={disabled} {...sectionOpenProps("chief_complaints")} />,
      free_text_notes: (
        <CollapsibleContainer
          title="Additional Notes"
          sectionIcon={sectionHeaderIcon(resolveSubjectiveSectionIcon("free_text_notes")!)}
          toggleLabel="Toggle additional notes"
          scrollOnExpand
          closeScrollToSelector={SUBJECTIVE_SCROLL_TOP_SELECTOR}
          stickyHeader
          open={collapseControlled ? displayOpenById.free_text_notes : undefined}
          onOpenChange={
            collapseControlled
              ? (open) => handleSectionOpenChange("free_text_notes", open)
              : undefined
          }
          defaultOpen={collapseControlled ? undefined : false}
          depthTone
          leadingActions={<SectionReorderLeadingAction sectionId="free_text_notes" />}
          actions={
            !disabled ? (
              <SubjectiveSectionTemplateButton scope="free_text_notes" />
            ) : undefined
          }
        >
          <label htmlFor="hopi-fallback" className={RX_FIELD_LABEL_CLASS}>
            Additional history notes
          </label>
          <textarea
            id="hopi-fallback"
            rows={3}
            value={fields.hopi}
            onChange={(e) => setField("hopi", e.target.value)}
            className={RX_FIELD_INPUT_CLASS}
            placeholder="Non-chippable notes, dictation, or extra context"
            maxLength={2000}
            disabled={disabled}
          />
        </CollapsibleContainer>
      ),
      ...historyFieldRegistry,
    };

    if (linkedChart) {
      registry.patient_background = (
        <PatientBackgroundZone
          patientId={patientId!}
          token={token!}
          mode={chartMode}
          disabled={disabled}
          {...sectionOpenProps("patient_background")}
        />
      );
      registry.allergies = (
        <PatientAllergiesZone
          patientId={patientId!}
          token={token!}
          mode={chartMode}
          {...sectionOpenProps("allergies")}
        />
      );
    } else {
      registry.past_surgical = (
        <PastSurgicalHistoryField
          value={fields.pastSurgicalHistoryStructured}
          disabled={disabled}
          onChange={setPastSurgicalHistoryStructured}
          scrollOnExpand
          closeScrollToSelector={SUBJECTIVE_SCROLL_TOP_SELECTOR}
          {...sectionOpenProps("past_surgical")}
        />
      );
    }

    return registry;
  }, [
    chartMode,
    collapseControlled,
    disabled,
    displayOpenById,
    fields.hopi,
    fields.pastSurgicalHistoryStructured,
    handleSectionOpenChange,
    historyFieldRegistry,
    linkedChart,
    patientId,
    setField,
    setPastSurgicalHistoryStructured,
    token,
  ]);

  const renderItems = useMemo((): RenderItem[] => {
    const items: RenderItem[] = visibleSectionOrder.map((sectionId) => ({
      kind: "section",
      sectionId,
    }));
    if (customSubsections.length === 0 && !disabled) {
      items.splice(resolveCustomEmptyChromeIndex(visibleSectionOrder), 0, { kind: "custom-empty" });
    }
    return items;
  }, [customSubsections.length, disabled, visibleSectionOrder]);

  const showAllHiddenEmptyState = useMemo(() => {
    if (!layoutHydrated) return false;
    const hasRenderableSection = visibleSectionOrder.some((sectionId) => {
      if (isCustomBlockSectionId(sectionId)) return true;
      return isStaticSubjectiveSectionId(sectionId);
    });
    return !hasRenderableSection;
  }, [layoutHydrated, visibleSectionOrder]);

  const renderSortableSection = (
    sectionId: SubjectiveSectionId,
    index: number,
    node: ReactNode,
  ) => {
    const isDropTarget = dropTarget?.index === index;
    const dropIntent = isDropTarget ? dropTarget.intent : null;
    const label = resolveSubjectiveSectionLabel(sectionId, customSubsections);

    return (
      <SortableSectionShell
        key={sectionId}
        sectionId={sectionId}
        label={label}
        index={index}
        count={renderItems.length}
        disabled={disabled}
        dropIntent={dropIntent}
        isDropTarget={isDropTarget}
        dragHandleProps={dragHandleProps(sectionId)}
        onMoveUp={() => handleMoveByDirection(index, "up")}
        onMoveDown={() => handleMoveByDirection(index, "down")}
        onDragOver={(e) => handleSectionDragOver(index, sectionId, e)}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
            setDropTarget((prev) => (prev?.index === index ? null : prev));
          }
        }}
        onDrop={(e) => {
          e.preventDefault();
          const sourceId =
            dragSectionIdRef.current ?? readSubjectiveSectionDragId(e.dataTransfer);
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
        {node}
      </SortableSectionShell>
    );
  };

  const SubjectiveTabIcon = SOAP_TAB_HEADING_ICON.subjective;

  return (
    <SubjectivePmhBridgeProvider setBridge={setPmhBridge}>
      <SoapTabFamilyProvider family="subjective">
      {/* Depth tone is opt-in per field section (CollapsibleContainer depthTone), not here. */}
      <section
        id="rx-symptoms"
        aria-label="Subjective"
        className="space-y-3"
        data-testid="subjective-scroll-top"
      >
        {heading !== null ? (
          <h3 className={soapTabHeadingClassName("subjective", RX_SECTION_HEADING_CLASS)}>
            <SubjectiveTabIcon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            {heading}
          </h3>
        ) : null}

        <div className="flex min-h-9 flex-nowrap items-center gap-0.5">
          <div className="mr-auto flex min-w-0 items-center gap-1">
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
            {deleteArchiveNotice ? (
              <span
                className="truncate text-xs text-amber-700 dark:text-amber-400"
                role="status"
              >
                {deleteArchiveNotice}
              </span>
            ) : null}
          </div>
          <SoapTabExpandCollapseClearButtons
            expandTestId="subjective-expand-all"
            collapseTestId="subjective-collapse-all"
            clearTestId="subjective-clear-all"
            onExpandAll={expandAllSections}
            onCollapseAll={collapseAllSections}
            onClearAll={() => setClearConfirmOpen(true)}
            clearDisabled={disabled || !hasClearableSubjective}
          />
          {!disabled ? (
            <>
              <CarryForwardButton disabled={disabled} />
              <SubjectivePresetButton disabled={disabled} pmhBridge={pmhBridge} />
            </>
          ) : null}
          <SectionManagerMenu
            disabled={disabled}
            open={sectionManagerOpen}
            onOpenChange={setSectionManagerOpen}
            sectionOrder={sectionOrder}
            mountableIds={mountableIds}
            hiddenIds={hiddenIds}
            customSubsections={customSubsections}
            fields={fields}
            onToggleHidden={handleToggleSectionHidden}
            onMoveSection={handleMoveSectionById}
            onAddCustomSection={handleAddCustomSection}
            onRemoveCustomSection={requestRemoveCustomSection}
          />
        </div>

        {showAllHiddenEmptyState ? (
          <div
            className="rounded-md border border-dashed border-border bg-muted/10 px-3 py-4 text-center"
            data-testid="subjective-all-hidden-empty"
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
        ) : null}

        {!layoutHydrated ? (
          <SoapSectionListSkeleton testId="subjective-layout-skeleton" />
        ) : !showAllHiddenEmptyState
          ? renderItems.map((item, index) => {
          if (item.kind === "custom-empty") {
            return <CustomSubsectionsChrome key="custom-empty" disabled={disabled} variant="empty" />;
          }

          const { sectionId } = item;
          if (isCustomBlockSectionId(sectionId)) {
            const blockId = customBlockIdFromSectionId(sectionId);
            const blockIndex = customSubsections.findIndex((section) => section.id === blockId);
            const block = customSubsections[blockIndex];
            if (!block) return null;

            return renderSortableSection(
              sectionId,
              index,
              <CustomSubsectionBlock
                section={block}
                sectionId={sectionId}
                disabled={disabled}
                focusTitleOnMount={focusBlockIdRef.current === block.id}
                pendingChildFocusId={focusChildIdRef.current}
                templateActions={
                  !disabled ? (
                    <CustomSectionTemplateButton
                      sectionId={block.id}
                      sectionTitle={block.title}
                    />
                  ) : undefined
                }
                onUpdate={(patch) => {
                  if (disabled) return;
                  if (focusBlockIdRef.current === block.id) focusBlockIdRef.current = null;
                  dispatch({ type: "UPDATE_CUSTOM_SUBSECTION", index: blockIndex, patch });
                }}
                onRemove={() => {
                  if (disabled) return;
                  requestRemoveCustomSection(sectionId);
                }}
                onAddChild={() => {
                  if (disabled) return;
                  const child = createEmptyCustomSubsectionChild();
                  focusChildIdRef.current = child.id;
                  dispatch({
                    type: "ADD_CUSTOM_SUBSECTION_CHILD",
                    sectionId: block.id,
                    child,
                  });
                }}
                onUpdateChild={(childIndex, patch) => {
                  if (disabled) return;
                  dispatch({
                    type: "UPDATE_CUSTOM_SUBSECTION_CHILD",
                    sectionId: block.id,
                    childIndex,
                    patch,
                  });
                }}
                onRemoveChild={(childIndex) => {
                  if (disabled) return;
                  dispatch({
                    type: "REMOVE_CUSTOM_SUBSECTION_CHILD",
                    sectionId: block.id,
                    childIndex,
                  });
                }}
                onMoveChildUp={(childIndex) => {
                  if (disabled || childIndex <= 0) return;
                  dispatch({
                    type: "REORDER_CUSTOM_SUBSECTION_CHILDREN",
                    sectionId: block.id,
                    fromIndex: childIndex,
                    toIndex: childIndex - 1,
                  });
                }}
                onMoveChildDown={(childIndex) => {
                  if (disabled || childIndex >= block.children.length - 1) return;
                  dispatch({
                    type: "REORDER_CUSTOM_SUBSECTION_CHILDREN",
                    sectionId: block.id,
                    fromIndex: childIndex,
                    toIndex: childIndex + 1,
                  });
                }}
              />,
            );
          }

          if (!isStaticSubjectiveSectionId(sectionId)) return null;
          const node = staticSectionRegistry[sectionId];
          if (!node) return null;
          return renderSortableSection(sectionId, index, node);
        })
          : null}

        <CustomSubsectionsChrome disabled={disabled} variant="footer" />
      </section>
      </SoapTabFamilyProvider>

      <DeleteCustomSectionDialog
        open={deleteDialogOpen}
        sectionTitle={pendingDeleteTitle}
        counts={pendingDeleteCounts}
        loading={deleteDialogLoading}
        busy={deleteDialogBusy}
        onCancel={handleCancelDeleteCustomSection}
        onConfirm={handleConfirmDeleteCustomSection}
      />
      <ClearAllConfirmDialog
        open={clearConfirmOpen}
        onOpenChange={(open) => {
          if (!clearBusy) setClearConfirmOpen(open);
        }}
        title="Clear all subjective content?"
        descriptionLead="This cannot be undone from this screen."
        bullets={clearConfirmBullets}
        busy={clearBusy}
        testId="subjective-clear-all-dialog"
        onConfirm={clearAllSubjective}
      />
    </SubjectivePmhBridgeProvider>
  );
}
