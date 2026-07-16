"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  EMPTY_RX_MEDICINE,
  useRxForm,
  type RxMedicine,
} from "@/components/cockpit/rx/RxFormContext";
import { useRxFormActions } from "@/components/cockpit/rx/RxFormActionsContext";
import { usePrescriptionFormShell } from "@/components/cockpit/rx/PrescriptionFormShellContext";
import { FollowUpPicker } from "@/components/cockpit/rx/inputs/FollowUpPicker";
import { PlanQuickPickChips } from "@/components/cockpit/rx/inputs/PlanQuickPickChips";
import {
  RX_FIELD_INPUT_CLASS,
  RX_FIELD_LABEL_CLASS,
  RX_SECTION_HEADING_CLASS,
} from "@/components/cockpit/rx/sections/field-styles";
import {
  SOAP_TAB_HEADING_ICON,
  SoapTabFamilyProvider,
  SoapSectionListSkeleton,
  sectionHeaderIcon,
  soapTabHeadingClassName,
} from "@/components/cockpit/rx/sections/section-chrome";
import { InvestigationsChipRow } from "@/components/cockpit/rx/inputs/InvestigationsChipRow";
import { InvestigationsSectionTemplateButton } from "@/components/cockpit/rx/inputs/InvestigationsSectionTemplateButton";
import { MedicinesSectionTemplateButton } from "@/components/cockpit/rx/inputs/MedicinesSectionTemplateButton";
import {
  PlanSectionTemplateButton,
  PlanWholeTemplateButton,
} from "@/components/cockpit/rx/plan/PlanSectionTemplateButton";
import {
  PlanSectionDragHandle,
  PlanSortableSectionShell,
} from "@/components/cockpit/rx/plan/PlanSortableSectionShell";
import { ManagePlanSectionsMenu } from "@/components/cockpit/rx/plan/ManagePlanSectionsMenu";
import { ClearAllConfirmDialog } from "@/components/cockpit/rx/ClearAllConfirmDialog";
import {
  SoapTabExpandCollapseClearButtons,
  SoapTabLayoutSaveStatus,
} from "@/components/cockpit/rx/SoapTabChromeActions";
import { SoapTabCustomSectionsAddChrome } from "@/components/cockpit/rx/SoapTabCustomSectionsAddChrome";
import { parseInvestigationsOrders } from "@/components/cockpit/rx/inputs/investigations-orders-format";
import MedicineRow from "@/components/consultation/MedicineRow";
import AllergyClashBanner from "@/components/ehr/AllergyClashBanner";
import InteractionChips from "@/components/ehr/InteractionChips";
import { CollapsibleContainer } from "@/components/ui/CollapsibleContainer";
import { usePaneKeyboardShortcuts } from "@/hooks/usePaneKeyboardShortcuts";
import { modShortcutHint } from "@/lib/patient-profile/keyboard-shortcuts";
import { useRegisterCommand } from "@/lib/patient-profile/command-registry";
import {
  trackCockpitV2RRxPolishDensificationLanded,
  trackCockpitV2RRxPolishShortcutUsed,
} from "@/lib/patient-profile/telemetry";
import { MedicineCaptureBar } from "@/components/cockpit/rx/inputs/MedicineCaptureBar";
import { isMedicineRowComplete } from "@/lib/cockpit/medicine-row-state";
import { usePersistedMedicineOpen } from "@/lib/cockpit/use-persisted-entry-open";
import { rxMedicineFromDrugMaster } from "@/lib/cockpit/rx-medicine-from-capture";
import {
  appendUniquePlanPhrase,
  applyFollowUpQuickPick,
  addReferralSpecialty,
  isFollowUpQuickPickSelected,
  planPhraseAlreadyPresent,
  PLAN_ADVICE_QUICK_PICKS,
  PLAN_FOLLOW_UP_QUICK_PICKS,
  PLAN_REFERRAL_QUICK_PICKS,
  PLAN_REFERRAL_REASON_QUICK_PICKS,
  PLAN_REFERRAL_URGENCY_QUICK_PICKS,
  referralPartsFromFields,
  resolveReferralForOutput,
  toggleReferralSpecialty,
} from "@/lib/cockpit/plan-quick-picks";
import { resolveFollowUpForOutput } from "@/lib/cockpit/follow-up-format";
import { AdviceHandoutsStrip } from "@/components/cockpit/rx/plan/AdviceHandoutsStrip";
import {
  ChartCatalogCombobox,
  type ChartCatalogCommit,
  type ChartCatalogOption,
} from "@/components/ehr/chart/ChartCatalogCombobox";
import {
  filterReferralSpecialtyCatalog,
  REFERRAL_SPECIALTY_CATALOG,
  referralSpecialtyLabelForValue,
  referralSpecialtyOptionsForCombobox,
  resolveReferralSpecialtyCatalog,
} from "@/lib/cockpit/referral-specialty-catalog";
import { PreviousRxPlanTrigger } from "@/components/cockpit/rx/previous/PreviousRxPlanTrigger";
import type { MatchableMedicine } from "@/lib/ehr/match-allergens";
import type { PatientAllergy } from "@/types/patient-chart";
import type { DrugMasterRow } from "@/types/drug-master";
import type { InteractionRow } from "@/lib/api/drug-interactions";
import { coerceRouteCode, defaultDoseUnitForForm } from "@/lib/medicineCodes";
import { PLAN_SCROLL_TOP_SELECTOR } from "@/lib/cockpit/exam-card-scroll";
import {
  buildPlanClearAllActions,
  rxFormHasClearablePlanContent,
} from "@/lib/cockpit/apply-plan-template";
import {
  PLAN_SECTION_DRAG_MIME,
  customBlockIdFromSectionId,
  fetchPlanSectionOrder,
  isCustomBlockSectionId,
  moveSectionInOrder,
  readPlanSectionDragId,
  reorderSectionInOrder,
  resolveAvailableSectionIds,
  resolveInitialSectionOrder,
  resolvePlanSectionLabel,
  resolveSectionDropIntent,
  savePlanSectionOrder,
  syncCustomBlockIdsInOrder,
  type PlanSectionId,
  type SectionDropIntent,
  type StaticPlanSectionId,
} from "@/lib/cockpit/plan-section-order";
import { CustomSubsectionBlock } from "@/components/cockpit/rx/subjective/CustomSubsectionBlock";
import {
  createEmptyCustomSubsection,
  createEmptyCustomSubsectionChild,
} from "@/lib/cockpit/custom-subsections";
import {
  PLAN_CUSTOM_SECTIONS_MAX,
  planCustomSectionsStructureKey,
  planCustomSectionsToDefaultTemplate,
  savePlanCustomSectionsDefault,
} from "@/lib/cockpit/custom-plan-sections";
import {
  collapseOverridesToPersist,
  fetchPlanSectionCollapsed,
  resolveSectionOpenState,
  savePlanSectionCollapsed,
  serializeCollapseOverrides,
  type PlanSectionCollapseMap,
} from "@/lib/cockpit/plan-section-collapse";
import {
  fetchPlanSectionHidden,
  hiddenOverridesToPersist,
  resolveVisibleSections,
  savePlanSectionHidden,
  serializeHiddenIds,
  type PlanSectionHiddenSet,
} from "@/lib/cockpit/plan-section-visibility";
import { cn } from "@/lib/utils";
import {
  CalendarClock,
  FlaskConical,
  MessageSquareText,
  NotebookPen,
  Pill,
  Share2,
  X,
} from "lucide-react";

const DOCTOR_LAYOUT_AUTOSAVE_MS = 500;

/** Canonical default open/closed state — all six Plan L1s start open. */
const PLAN_COLLAPSE_DEFAULTS: Record<StaticPlanSectionId, boolean> = {
  investigations: true,
  medications: true,
  follow_up: true,
  advice: true,
  referral: true,
  clinical_notes: true,
};

const PLAN_CLEAR_ALL_BULLETS = [
  "Investigations / orders",
  "Medications",
  "Follow-up, advice, referral, and clinical notes",
  "Custom section notes (section titles are kept)",
] as const;

type DropTargetState = {
  index: number;
  intent: SectionDropIntent;
};

type SaveStatus = "idle" | "saving" | "saved" | "error";

function buildCollapseDefaults(
  order: readonly PlanSectionId[],
): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  for (const id of order) {
    // Custom blocks default open (mirrors subjective).
    result[id] = isCustomBlockSectionId(id) ? true : PLAN_COLLAPSE_DEFAULTS[id];
  }
  return result;
}

export interface PlanSectionProps {
  heading?: string | null;
  disabled?: boolean;
  /**
   * When true, allergy banner + DDI chips are hidden — the
   * `<SafetyStickyStrip>` overlay above the bottom-row owns them (cmr-02).
   */
  safetyLifted?: boolean;
  token: string;
  medicineInstanceIds: string[];
  setMedicineInstanceIds: React.Dispatch<React.SetStateAction<string[]>>;
  generateInstanceIds: (count: number) => string[];
  drugMasterIndex: ReadonlyMap<string, DrugMasterRow>;
  setDrugMasterIndex: React.Dispatch<
    React.SetStateAction<ReadonlyMap<string, DrugMasterRow>>
  >;
  allergies: ReadonlyArray<PatientAllergy>;
  ddiInteractions: InteractionRow[];
  isAcked: (key: string) => boolean;
  onAcknowledge: (keys: string[]) => void;
  onAckDdi: (key: string) => void;
  onSendAndFinish?: () => void;
  onOpenTemplates?: () => void;
  onOpenPreview?: () => void;
  canSend?: boolean;
  /** Cockpit Plan zone — open previous-Rx side sheet (rxss-03). */
  showPreviousRxTrigger?: boolean;
}

export function PlanSection({
  heading = "Plan",
  disabled = false,
  safetyLifted = false,
  token,
  medicineInstanceIds,
  setMedicineInstanceIds,
  generateInstanceIds,
  drugMasterIndex,
  setDrugMasterIndex,
  allergies,
  ddiInteractions,
  isAcked,
  onAcknowledge,
  onAckDdi,
  onSendAndFinish,
  onOpenTemplates,
  onOpenPreview,
  canSend: canSendProp,
  showPreviousRxTrigger = false,
}: PlanSectionProps) {
  const { appointmentId, state, setField, dispatch } = useRxForm();
  const shell = usePrescriptionFormShell();
  const { fields } = state;
  const medicines = fields.medicines;
  const isReadOnly = disabled;
  const registeredActions = useRxFormActions();
  const [activeRowInstanceId, setActiveRowInstanceId] = usePersistedMedicineOpen(
    appointmentId,
    medicineInstanceIds,
  );

  const customSections = fields.planCustomSections;
  const customBlockIds = useMemo(
    () => customSections.map((section) => section.id),
    [customSections],
  );
  const focusBlockIdRef = useRef<string | null>(null);
  const focusChildIdRef = useRef<string | null>(null);
  const prevCustomBlockCountRef = useRef(customSections.length);

  const dragSectionIdRef = useRef<PlanSectionId | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTargetState | null>(null);
  const [layoutSaveStatus, setLayoutSaveStatus] = useState<SaveStatus>("idle");
  const [collapseSaveStatus, setCollapseSaveStatus] = useState<SaveStatus>("idle");
  const [visibilitySaveStatus, setVisibilitySaveStatus] = useState<SaveStatus>("idle");
  const [sectionManagerOpen, setSectionManagerOpen] = useState(false);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [clearBusy, setClearBusy] = useState(false);
  const lastPersistedSectionOrderRef = useRef<string | null>(null);
  const lastPersistedCollapseRef = useRef<string | null>(null);
  const lastPersistedHiddenRef = useRef<string | null>(null);
  const hasHydratedCollapseRef = useRef(false);
  const hasHydratedHiddenRef = useRef(false);

  const [storedSectionOrder, setStoredSectionOrder] = useState<PlanSectionId[] | null>(
    shell?.planDefaults?.sectionOrder ?? null,
  );
  const [storedSectionCollapsed, setStoredSectionCollapsed] =
    useState<PlanSectionCollapseMap | null>(
      shell?.planDefaults?.sectionCollapsed ?? null,
    );
  const [storedSectionHidden, setStoredSectionHidden] =
    useState<PlanSectionHiddenSet | null>(shell?.planDefaults?.sectionHidden ?? null);
  const [openById, setOpenById] = useState<Record<string, boolean>>({});
  const [hiddenIds, setHiddenIds] = useState<PlanSectionHiddenSet>(
    () => shell?.planDefaults?.sectionHidden ?? [],
  );

  const [sectionOrder, setSectionOrder] = useState<PlanSectionId[]>(() => {
    const stored = shell?.planDefaults?.sectionOrder;
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

  const defaultsById = useMemo(() => buildCollapseDefaults(sectionOrder), [sectionOrder]);

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
    (sectionId: PlanSectionId, open: boolean) => {
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

  const hasClearablePlan = useMemo(
    () => rxFormHasClearablePlanContent(fields),
    [fields],
  );

  const clearAllPlan = useCallback(() => {
    if (disabled || !hasClearablePlan) return;
    setClearBusy(true);
    try {
      for (const action of buildPlanClearAllActions(fields)) {
        dispatch(action);
      }
      setMedicineInstanceIds(generateInstanceIds(1));
      setActiveRowInstanceId(null);
      collapseAllSections();
      setClearConfirmOpen(false);
    } finally {
      setClearBusy(false);
    }
  }, [
    collapseAllSections,
    disabled,
    dispatch,
    fields,
    generateInstanceIds,
    hasClearablePlan,
    setMedicineInstanceIds,
  ]);

  // ---- Hydration: shell prefetch or standalone settings fetch --------------
  useEffect(() => {
    if (shell?.planDefaults != null) {
      setStoredSectionOrder(shell.planDefaults.sectionOrder);
      return;
    }
    if (!token) {
      setStoredSectionOrder([]);
      return;
    }
    let cancelled = false;
    void fetchPlanSectionOrder(token)
      .then((order) => {
        if (!cancelled) setStoredSectionOrder(order);
      })
      .catch(() => {
        if (!cancelled) setStoredSectionOrder([]);
      });
    return () => {
      cancelled = true;
    };
  }, [shell?.planDefaults, token]);

  useEffect(() => {
    if (shell?.planDefaults != null) {
      setStoredSectionCollapsed(shell.planDefaults.sectionCollapsed);
      return;
    }
    if (!token) {
      setStoredSectionCollapsed({});
      return;
    }
    let cancelled = false;
    void fetchPlanSectionCollapsed(token)
      .then((collapsed) => {
        if (!cancelled) setStoredSectionCollapsed(collapsed);
      })
      .catch(() => {
        if (!cancelled) setStoredSectionCollapsed({});
      });
    return () => {
      cancelled = true;
    };
  }, [shell?.planDefaults, token]);

  useEffect(() => {
    if (shell?.planDefaults != null) {
      setStoredSectionHidden(shell.planDefaults.sectionHidden);
      return;
    }
    if (!token) {
      setStoredSectionHidden([]);
      return;
    }
    let cancelled = false;
    void fetchPlanSectionHidden(token)
      .then((hidden) => {
        if (!cancelled) setStoredSectionHidden(hidden);
      })
      .catch(() => {
        if (!cancelled) setStoredSectionHidden([]);
      });
    return () => {
      cancelled = true;
    };
  }, [shell?.planDefaults, token]);

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
          const saved = await savePlanSectionOrder(token, sectionOrder);
          lastPersistedSectionOrderRef.current = JSON.stringify(saved);
          setStoredSectionOrder(saved);
          shell?.setPlanDefaults((prev) =>
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
          const saved = await savePlanSectionCollapsed(token, overrides);
          lastPersistedCollapseRef.current = serializeCollapseOverrides(saved);
          setStoredSectionCollapsed(saved);
          shell?.setPlanDefaults((prev) =>
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
          const saved = await savePlanSectionHidden(token, toPersist);
          lastPersistedHiddenRef.current = serializeHiddenIds(saved);
          setStoredSectionHidden(saved);
          shell?.setPlanDefaults((prev) =>
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
    planCustomSectionsStructureKey(fields.planCustomSections),
  );

  useEffect(() => {
    if (disabled || !token) return;

    const structureKey = planCustomSectionsStructureKey(customSections);
    if (structureKey === lastPersistedCustomStructureRef.current) return;

    const template = planCustomSectionsToDefaultTemplate(customSections);
    // Untitled-only edits never reach the default (the template drops them).
    if (template.length === 0 && customSections.length > 0) {
      lastPersistedCustomStructureRef.current = structureKey;
      return;
    }

    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          await savePlanCustomSectionsDefault(token, customSections);
          lastPersistedCustomStructureRef.current = structureKey;
          shell?.setPlanDefaults((prev) =>
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
    if (customSections.length >= PLAN_CUSTOM_SECTIONS_MAX) return;
    dispatch({ type: "ADD_PLAN_CUSTOM_SECTION", section: createEmptyCustomSubsection() });
    setSectionManagerOpen(false);
  }, [customSections.length, disabled, dispatch]);

  const handleRemoveCustomSection = useCallback(
    (sectionId: PlanSectionId) => {
      if (disabled || !isCustomBlockSectionId(sectionId)) return;
      const blockId = customBlockIdFromSectionId(sectionId);
      const index = customSections.findIndex((section) => section.id === blockId);
      if (index === -1) return;
      dispatch({ type: "REMOVE_PLAN_CUSTOM_SECTION", index });
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
    (sectionId: PlanSectionId, direction: "up" | "down") => {
      const index = sectionOrder.indexOf(sectionId);
      if (index === -1) return;
      handleMoveByDirection(index, direction);
    },
    [handleMoveByDirection, sectionOrder],
  );

  const handleToggleSectionHidden = useCallback((sectionId: PlanSectionId) => {
    setHiddenIds((prev) =>
      prev.includes(sectionId) ? prev.filter((id) => id !== sectionId) : [...prev, sectionId],
    );
  }, []);

  const dragHandleProps = useCallback(
    (sectionId: PlanSectionId): HTMLAttributes<HTMLDivElement> => ({
      draggable: !disabled,
      onDragStart: (e: DragEvent<HTMLDivElement>) => {
        dragSectionIdRef.current = sectionId;
        e.dataTransfer?.setData(PLAN_SECTION_DRAG_MIME, sectionId);
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
    (targetIndex: number, sectionId: PlanSectionId, e: DragEvent<HTMLDivElement>) => {
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

  const canSend = canSendProp ?? registeredActions?.canSend ?? false;

  const handleSend = useCallback(() => {
    (onSendAndFinish ?? registeredActions?.sendAndFinish)?.();
  }, [onSendAndFinish, registeredActions]);

  const handleOpenTemplates = useCallback(() => {
    (onOpenTemplates ?? registeredActions?.openTemplates)?.();
  }, [onOpenTemplates, registeredActions]);

  const handleOpenPreview = useCallback(() => {
    (onOpenPreview ?? registeredActions?.openPreview)?.();
  }, [onOpenPreview, registeredActions]);
  const densificationTrackedRef = useRef(false);

  useEffect(() => {
    if (densificationTrackedRef.current) return;

    const completedRowsCount = medicines.filter(isMedicineRowComplete).length;
    if (completedRowsCount === 0) return;

    const editorRowsCount = medicines.filter((med, i) => {
      const instanceId = medicineInstanceIds[i];
      const isActiveEditor = !disabled && instanceId === activeRowInstanceId;
      return !isMedicineRowComplete(med) || isActiveEditor;
    }).length;

    if (editorRowsCount >= medicines.length) return;

    densificationTrackedRef.current = true;
    trackCockpitV2RRxPolishDensificationLanded({
      appointmentId,
      completedRowsCount,
      editorRowsCount,
    });
  }, [
    activeRowInstanceId,
    appointmentId,
    disabled,
    medicineInstanceIds,
    medicines,
  ]);

  const handleMedicineListKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const focusable = e.currentTarget.querySelectorAll<HTMLElement>(
      "[role='button'][aria-label*='expand medication']",
    );
    const currentIndex = Array.from(focusable).indexOf(
      document.activeElement as HTMLElement,
    );
    if (currentIndex === -1) return;

    if (e.key === "ArrowDown" && currentIndex < focusable.length - 1) {
      e.preventDefault();
      focusable[currentIndex + 1]?.focus();
    } else if (e.key === "ArrowUp" && currentIndex > 0) {
      e.preventDefault();
      focusable[currentIndex - 1]?.focus();
    }
  };

  const handleMedicineChange = (index: number, field: string, value: string) => {
    const prevRow = medicines[index];
    const patch: Partial<RxMedicine> = { [field]: value } as Partial<RxMedicine>;
    if (
      field === "medicineName" &&
      prevRow.drugMasterId &&
      value !== prevRow.medicineName
    ) {
      patch.drugMasterId = null;
    }
    dispatch({ type: "UPDATE_MEDICINE", index, patch });
  };

  const handleMedicinePatch = (index: number, patch: Partial<RxMedicine>) => {
    dispatch({ type: "UPDATE_MEDICINE", index, patch });
  };

  const handleMedicineSelect = (index: number, drug: DrugMasterRow) => {
    const prevRow = medicines[index];
    const dosagePrefill = prevRow.dosage.trim() ? prevRow.dosage : (drug.strength ?? "");
    const routeText = prevRow.route.trim() ? prevRow.route : (drug.route_default ?? "");
    const seedRouteCode =
      !prevRow.routeCode && drug.route_default
        ? coerceRouteCode(drug.route_default)
        : prevRow.routeCode;
    dispatch({
      type: "UPDATE_MEDICINE",
      index,
      patch: {
        medicineName: drug.generic_name,
        drugMasterId: drug.id,
        dosage: dosagePrefill,
        route: routeText,
        routeCode: seedRouteCode,
        form: prevRow.form ?? drug.form ?? null,
        doseUnit: prevRow.doseUnit ?? defaultDoseUnitForForm(drug.form),
      },
    });
    setDrugMasterIndex((prev) => {
      if (prev.get(drug.id) === drug) return prev;
      const next = new Map(prev);
      next.set(drug.id, drug);
      return next;
    });
  };

  const handleAddMedicine = useCallback(() => {
    const newInstanceIds = generateInstanceIds(1);
    dispatch({ type: "ADD_MEDICINE", medicine: { ...EMPTY_RX_MEDICINE } });
    setMedicineInstanceIds((prev) => [...newInstanceIds, ...prev]);
    setActiveRowInstanceId(newInstanceIds[0] ?? null);
  }, [dispatch, generateInstanceIds, setMedicineInstanceIds]);

  /**
   * Insert a prefilled medicine card (capture bar). Reuses a still-blank seed
   * row when present, but always places the named card at the top of the list
   * (newest-first — matches ADD_MEDICINE / catalog pick).
   */
  const insertMedicine = useCallback(
    (medicine: RxMedicine, { keepEditorOpen }: { keepEditorOpen: boolean }) => {
      const blankIndex = medicines.findIndex(
        (m) => !m.medicineName.trim() && !m.dosage.trim(),
      );
      if (blankIndex >= 0) {
        const nextList = medicines.map((m) => ({ ...m }));
        const nextIds = [...medicineInstanceIds];
        const [blankId] = nextIds.splice(blankIndex, 1);
        nextList.splice(blankIndex, 1);
        nextList.unshift(medicine);
        nextIds.unshift(blankId ?? generateInstanceIds(1)[0]!);
        dispatch({ type: "SET_MEDICINES", medicines: nextList });
        setMedicineInstanceIds(nextIds);
        setActiveRowInstanceId(keepEditorOpen ? (nextIds[0] ?? null) : null);
        return;
      }
      const newInstanceIds = generateInstanceIds(1);
      dispatch({ type: "ADD_MEDICINE", medicine });
      setMedicineInstanceIds((prev) => [...newInstanceIds, ...prev]);
      setActiveRowInstanceId(keepEditorOpen ? (newInstanceIds[0] ?? null) : null);
    },
    [
      dispatch,
      generateInstanceIds,
      medicineInstanceIds,
      medicines,
      setMedicineInstanceIds,
    ],
  );

  const handleCaptureDrug = useCallback(
    (drug: DrugMasterRow) => {
      insertMedicine(rxMedicineFromDrugMaster(drug), {
        // PMH parity: capture commits a collapsed card; click to expand.
        keepEditorOpen: false,
      });
      setDrugMasterIndex((prev) => {
        if (prev.get(drug.id) === drug) return prev;
        const next = new Map(prev);
        next.set(drug.id, drug);
        return next;
      });
    },
    [insertMedicine, setDrugMasterIndex],
  );

  /**
   * Batch commit from the capture bar (deterministic parse or AI).
   * Mutates a local copy so multi-drug AI commits don't clobber the same
   * blank row. Newest named cards always land at the top (PMH / catalog parity).
   * Cards always start collapsed — expand on click (PMH ChartMedicationCard).
   */
  const handleCaptureMedicines = useCallback(
    (incoming: RxMedicine[]) => {
      if (incoming.length === 0) return;

      let nextList = medicines.map((m) => ({ ...m }));
      let nextIds = [...medicineInstanceIds];
      const added: RxMedicine[] = [];
      const addedIds: string[] = [];

      for (const medicine of incoming) {
        const blankIndex = nextList.findIndex(
          (m) => !m.medicineName.trim() && !m.dosage.trim(),
        );
        if (blankIndex >= 0) {
          const [blankId] = nextIds.splice(blankIndex, 1);
          nextList.splice(blankIndex, 1);
          added.push(medicine);
          addedIds.push(blankId ?? generateInstanceIds(1)[0]!);
        } else {
          added.push(medicine);
          addedIds.push(...generateInstanceIds(1));
        }
      }

      nextList = [...added, ...nextList];
      nextIds = [...addedIds, ...nextIds];

      dispatch({ type: "SET_MEDICINES", medicines: nextList });
      setMedicineInstanceIds(nextIds);
      setActiveRowInstanceId(null);
    },
    [
      dispatch,
      generateInstanceIds,
      medicineInstanceIds,
      medicines,
      setMedicineInstanceIds,
    ],
  );

  const handleMedicinesTemplateApplied = useCallback(
    (nextMedicines: RxMedicine[]) => {
      dispatch({ type: "SET_MEDICINES", medicines: nextMedicines });
      setMedicineInstanceIds(generateInstanceIds(nextMedicines.length));
      setActiveRowInstanceId(null);
    },
    [dispatch, generateInstanceIds, setMedicineInstanceIds],
  );

  const shortcuts = useMemo(
    () => [
      {
        combo: "mod+enter",
        label: "Send Rx & finish",
        when: "safe" as const,
        action: () => {
          if (canSend) handleSend();
          trackCockpitV2RRxPolishShortcutUsed({
            combo: "mod+enter",
            action: "send-rx",
          });
        },
      },
      {
        combo: "mod+shift+enter",
        label: "Send Rx & finish",
        when: "safe" as const,
        action: () => {
          if (canSend) handleSend();
          trackCockpitV2RRxPolishShortcutUsed({
            combo: "mod+shift+enter",
            action: "send-rx",
          });
        },
      },
      {
        combo: "mod+m",
        label: "Add medicine",
        when: "pane-focused" as const,
        action: () => {
          handleAddMedicine();
          trackCockpitV2RRxPolishShortcutUsed({
            combo: "mod+m",
            action: "add-medicine",
          });
        },
      },
      {
        combo: "mod+shift+t",
        label: "Open templates",
        when: "pane-focused" as const,
        action: () => {
          handleOpenTemplates();
          trackCockpitV2RRxPolishShortcutUsed({
            combo: "mod+shift+t",
            action: "open-templates",
          });
        },
      },
      {
        combo: "mod+shift+p",
        label: "Open preview",
        when: "pane-focused" as const,
        action: () => {
          handleOpenPreview();
          trackCockpitV2RRxPolishShortcutUsed({
            combo: "mod+shift+p",
            action: "open-preview",
          });
        },
      },
    ],
    [
      canSend,
      handleSend,
      handleAddMedicine,
      handleOpenTemplates,
      handleOpenPreview,
    ],
  );

  usePaneKeyboardShortcuts({
    paneId: "plan",
    shortcuts,
    enabled: !isReadOnly,
  });

  const sendCommand = useMemo(
    () => ({
      id: "send-rx",
      label: "Send Rx & finish",
      shortcutHint: modShortcutHint("Enter"),
      group: "Plan" as const,
      enabled: () => canSend,
      action: handleSend,
    }),
    [canSend, handleSend],
  );
  const addMedicineCommand = useMemo(
    () => ({
      id: "add-medicine",
      label: "Add medicine",
      shortcutHint: modShortcutHint("M"),
      group: "Plan" as const,
      action: handleAddMedicine,
    }),
    [handleAddMedicine],
  );
  const openTemplatesCommand = useMemo(
    () => ({
      id: "open-templates",
      label: "Open templates",
      shortcutHint: modShortcutHint("T", { shift: true }),
      group: "Plan" as const,
      action: handleOpenTemplates,
    }),
    [handleOpenTemplates],
  );
  const openPreviewCommand = useMemo(
    () => ({
      id: "open-preview",
      label: "Open preview",
      shortcutHint: modShortcutHint("P", { shift: true }),
      group: "Plan" as const,
      action: handleOpenPreview,
    }),
    [handleOpenPreview],
  );

  useRegisterCommand(isReadOnly ? null : sendCommand);
  useRegisterCommand(isReadOnly ? null : addMedicineCommand);
  useRegisterCommand(isReadOnly ? null : openTemplatesCommand);
  useRegisterCommand(isReadOnly ? null : openPreviewCommand);

  const handleRemoveMedicine = (index: number) => {
    const removedInstanceId = medicineInstanceIds[index];
    const clearingLast = medicines.length <= 1;
    dispatch({ type: "REMOVE_MEDICINE", index });
    if (clearingLast) {
      // Match reducer: keep one blank seed (hidden until capture / mod+m).
      setMedicineInstanceIds(generateInstanceIds(1));
      setActiveRowInstanceId(null);
      return;
    }
    setMedicineInstanceIds((prev) => prev.filter((_, i) => i !== index));
    setActiveRowInstanceId((activeId) =>
      activeId === removedInstanceId ? null : activeId,
    );
  };

  const matchableMedicines = useMemo<MatchableMedicine[]>(
    () =>
      medicines.map((m) => ({
        medicine_name: m.medicineName,
        drug_master_id: m.drugMasterId,
      })),
    [medicines],
  );

  const namedMedicineCount = useMemo(
    () => medicines.filter((m) => m.medicineName.trim().length > 0).length,
    [medicines],
  );

  const investigationCount = useMemo(
    () => parseInvestigationsOrders(fields.investigationsOrders).length,
    [fields.investigationsOrders],
  );

  const followUpPreview = useMemo(
    () =>
      resolveFollowUpForOutput(
        fields.followUp,
        fields.followUpValue,
        fields.followUpUnit,
      ),
    [fields.followUp, fields.followUpValue, fields.followUpUnit],
  );

  const referralPreview = useMemo(
    () => resolveReferralForOutput(referralPartsFromFields(fields)),
    [fields],
  );

  const PlanTabIcon = SOAP_TAB_HEADING_ICON.plan;
  const showAllHiddenEmptyState = layoutHydrated && visibleSectionOrder.length === 0;

  const safetyStrip =
    !safetyLifted ? (
      <>
        <AllergyClashBanner
          medicines={matchableMedicines}
          medicineInstanceIds={medicineInstanceIds}
          allergies={allergies}
          drugMasterIndex={drugMasterIndex}
          isAcked={isAcked}
          onAcknowledge={(keys) => onAcknowledge([...keys])}
        />
        <InteractionChips
          interactions={ddiInteractions}
          drugMasterIndex={drugMasterIndex}
          isAcked={isAcked}
          onAck={onAckDdi}
        />
      </>
    ) : null;

  const medicationsBody = (
    <div id="medicines-section">
      {!isReadOnly ? (
        <MedicineCaptureBar
          token={token}
          disabled={disabled}
          onAddDrug={handleCaptureDrug}
          onAddMedicines={handleCaptureMedicines}
        />
      ) : null}
      <div className="mt-2 space-y-2" onKeyDown={handleMedicineListKeyDown}>
        {medicines.map((med, i) => {
          const instanceId = medicineInstanceIds[i];
          const isActive = !disabled && instanceId === activeRowInstanceId;
          if (!med.medicineName.trim() && !isActive) return null;
          return (
            <MedicineRow
              key={instanceId ?? i}
              index={i}
              value={med}
              onChange={handleMedicineChange}
              onPatch={handleMedicinePatch}
              onRemove={handleRemoveMedicine}
              onMedicineSelect={handleMedicineSelect}
              token={token}
              disabled={disabled}
              isReadOnly={disabled}
              isEditing={isActive}
              onRequestEdit={(rowIndex) => {
                if (disabled) return;
                setActiveRowInstanceId(medicineInstanceIds[rowIndex] ?? null);
              }}
              onRequestCollapse={(rowIndex) => {
                const rowInstanceId = medicineInstanceIds[rowIndex];
                setActiveRowInstanceId((activeId) =>
                  activeId === rowInstanceId ? null : activeId,
                );
              }}
            />
          );
        })}
      </div>
    </div>
  );

  const sectionBody = (sectionId: StaticPlanSectionId): ReactNode => {
    switch (sectionId) {
      case "investigations":
        return (
          <InvestigationsChipRow
            value={fields.investigationsOrders}
            onChange={(next) => setField("investigationsOrders", next)}
            disabled={disabled}
            hideLabel
            token={token}
          />
        );
      case "medications":
        return medicationsBody;
      case "follow_up":
        return (
          <>
            {!disabled ? (
              <PlanQuickPickChips
                labels={PLAN_FOLLOW_UP_QUICK_PICKS.map((p) => p.label)}
                groupLabel="Quick follow-up"
                testId="plan-follow-up-quick-picks"
                isSelected={(label) => {
                  const pick = PLAN_FOLLOW_UP_QUICK_PICKS.find((p) => p.label === label);
                  if (!pick) return false;
                  return isFollowUpQuickPickSelected(
                    pick,
                    fields.followUpValue,
                    fields.followUpUnit,
                  );
                }}
                onPick={(label) => {
                  const pick = PLAN_FOLLOW_UP_QUICK_PICKS.find((p) => p.label === label);
                  if (!pick) return;
                  const next = applyFollowUpQuickPick(pick);
                  setField("followUpValue", next.followUpValue);
                  setField("followUpUnit", next.followUpUnit);
                  if (next.clearNotes) setField("followUp", "");
                }}
              />
            ) : null}
            <FollowUpPicker hideLabel hideHint />
            <FollowUpNotesField fields={fields} setField={setField} disabled={disabled} />
          </>
        );
      case "advice":
        return (
          <>
            <AdviceField fields={fields} setField={setField} disabled={disabled} />
            <AdviceHandoutsStrip disabled={disabled} />
          </>
        );
      case "referral":
        return <ReferralField fields={fields} setField={setField} disabled={disabled} />;
      case "clinical_notes":
        return (
          <ClinicalNotesField fields={fields} setField={setField} disabled={disabled} />
        );
    }
  };

  const sectionMeta = (
    sectionId: StaticPlanSectionId,
  ): {
    title: string;
    testId: string;
    id?: string;
    count: number | null;
    preview?: string;
    icon: typeof FlaskConical;
    bodyClassName?: string;
    actions?: ReactNode;
  } => {
    switch (sectionId) {
      case "investigations":
        return {
          title: "Investigations / orders",
          testId: "plan-investigations-zone",
          id: "rx-investigations-section",
          count: investigationCount > 0 ? investigationCount : null,
          icon: FlaskConical,
          actions: !disabled ? (
            <InvestigationsSectionTemplateButton disabled={disabled} />
          ) : undefined,
        };
      case "medications":
        return {
          title: "Medications",
          testId: "plan-medications-zone",
          id: "rx-medicines",
          count: namedMedicineCount > 0 ? namedMedicineCount : null,
          icon: Pill,
          actions: (
            <MedicinesSectionActions
              disabled={disabled}
              onMedicinesTemplateApplied={handleMedicinesTemplateApplied}
              showPreviousRxTrigger={showPreviousRxTrigger}
              token={token}
            />
          ),
        };
      case "follow_up":
        return {
          title: "Follow-up",
          testId: "plan-follow-up-zone",
          count: followUpPreview ? 1 : null,
          preview: followUpPreview ? `— ${followUpPreview.slice(0, 72)}` : undefined,
          icon: CalendarClock,
          bodyClassName: "space-y-2",
          actions: !disabled ? (
            <PlanSectionTemplateButton scope="follow_up" disabled={disabled} />
          ) : undefined,
        };
      case "advice":
        return {
          title: "Advice & education",
          testId: "plan-advice-zone",
          count: fields.advice.trim() ? 1 : null,
          preview: fields.advice.trim()
            ? `— ${fields.advice.trim().slice(0, 72)}`
            : undefined,
          icon: MessageSquareText,
          bodyClassName: "space-y-2",
          actions: !disabled ? (
            <PlanSectionTemplateButton scope="advice" disabled={disabled} />
          ) : undefined,
        };
      case "referral":
        return {
          title: "Referral",
          testId: "plan-referral-zone",
          count: referralPreview ? 1 : null,
          preview: referralPreview ? `— ${referralPreview.slice(0, 72)}` : undefined,
          icon: Share2,
          bodyClassName: "space-y-2",
          actions: !disabled ? (
            <PlanSectionTemplateButton scope="referral" disabled={disabled} />
          ) : undefined,
        };
      case "clinical_notes":
        return {
          title: "Clinical notes (private)",
          testId: "plan-notes-zone",
          count: null,
          icon: NotebookPen,
          actions: !disabled ? (
            <PlanSectionTemplateButton scope="clinical_notes" disabled={disabled} />
          ) : undefined,
        };
    }
  };

  const renderCustomBlockInner = (
    sectionId: PlanSectionId,
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
        scrollSelector={PLAN_SCROLL_TOP_SELECTOR}
        leadingActions={leadingActions}
        focusTitleOnMount={focusBlockIdRef.current === block.id}
        pendingChildFocusId={focusChildIdRef.current}
        onUpdate={(patch) => {
          if (disabled) return;
          if (focusBlockIdRef.current === block.id) focusBlockIdRef.current = null;
          dispatch({ type: "UPDATE_PLAN_CUSTOM_SECTION", index: blockIndex, patch });
        }}
        onRemove={() => handleRemoveCustomSection(sectionId)}
        onAddChild={() => {
          if (disabled) return;
          const child = createEmptyCustomSubsectionChild();
          focusChildIdRef.current = child.id;
          dispatch({
            type: "ADD_PLAN_CUSTOM_SECTION_CHILD",
            sectionId: block.id,
            child,
          });
        }}
        onUpdateChild={(childIndex, patch) => {
          if (disabled) return;
          dispatch({
            type: "UPDATE_PLAN_CUSTOM_SECTION_CHILD",
            sectionId: block.id,
            childIndex,
            patch,
          });
        }}
        onRemoveChild={(childIndex) => {
          if (disabled) return;
          dispatch({
            type: "REMOVE_PLAN_CUSTOM_SECTION_CHILD",
            sectionId: block.id,
            childIndex,
          });
        }}
        onMoveChildUp={(childIndex) => {
          if (disabled || childIndex <= 0) return;
          dispatch({
            type: "REORDER_PLAN_CUSTOM_SECTION_CHILDREN",
            sectionId: block.id,
            fromIndex: childIndex,
            toIndex: childIndex - 1,
          });
        }}
        onMoveChildDown={(childIndex) => {
          const childCount = block.children?.length ?? 0;
          if (disabled || childIndex >= childCount - 1) return;
          dispatch({
            type: "REORDER_PLAN_CUSTOM_SECTION_CHILDREN",
            sectionId: block.id,
            fromIndex: childIndex,
            toIndex: childIndex + 1,
          });
        }}
      />
    );
  };

  const renderSection = (sectionId: PlanSectionId) => {
    const index = sectionOrder.indexOf(sectionId);
    const isDropTarget = dropTarget?.index === index;
    const dropIntent = isDropTarget ? dropTarget.intent : null;
    const title = resolvePlanSectionLabel(sectionId, customSections);

    const leadingActions = !disabled ? (
      <PlanSectionDragHandle
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
          id={meta.id}
          count={meta.count}
          preview={meta.preview}
          depthTone
          stickyHeader
          scrollOnExpand
          closeScrollToSelector={PLAN_SCROLL_TOP_SELECTOR}
          bodyClassName={meta.bodyClassName}
          leadingActions={leadingActions}
          actions={meta.actions}
          open={collapseControlled ? displayOpenById[sectionId] : undefined}
          onOpenChange={
            collapseControlled
              ? (open) => handleSectionOpenChange(sectionId, open)
              : undefined
          }
          defaultOpen={collapseControlled ? undefined : PLAN_COLLAPSE_DEFAULTS[sectionId]}
        >
          {sectionBody(sectionId)}
        </CollapsibleContainer>
      );
    }

    return (
      <PlanSortableSectionShell
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
            dragSectionIdRef.current ?? readPlanSectionDragId(e.dataTransfer);
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
        {sectionId === "medications" ? safetyStrip : null}
      </PlanSortableSectionShell>
    );
  };

  return (
    <SoapTabFamilyProvider family="plan">
      {/* Depth tone is opt-in per L1 CollapsibleContainer, not at this tab wrapper (PLAN-C3). */}
      <section
        aria-label="Plan"
        className="space-y-3"
        data-testid="plan-scroll-top"
      >
        {heading !== null ? (
          <h3 className={soapTabHeadingClassName("plan", RX_SECTION_HEADING_CLASS)}>
            <PlanTabIcon
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
              expandTestId="plan-expand-all"
              collapseTestId="plan-collapse-all"
              clearTestId="plan-clear-all"
              onExpandAll={expandAllSections}
              onCollapseAll={collapseAllSections}
              onClearAll={() => setClearConfirmOpen(true)}
              clearDisabled={!hasClearablePlan}
            />
            <PlanWholeTemplateButton
              disabled={disabled}
              onMedicinesApplied={handleMedicinesTemplateApplied}
            />
            <ManagePlanSectionsMenu
              disabled={disabled}
              open={sectionManagerOpen}
              onOpenChange={setSectionManagerOpen}
              sectionOrder={sectionOrder}
              mountableIds={mountableIds}
              hiddenIds={hiddenIds}
              fields={fields}
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
            data-testid="plan-all-hidden-empty"
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
          <SoapSectionListSkeleton testId="plan-layout-skeleton" rows={5} />
        ) : (
          <>
            {visibleSectionOrder.map((sectionId) => renderSection(sectionId))}
            {!disabled ? (
              <SoapTabCustomSectionsAddChrome
                disabled={disabled}
                sectionCount={customSections.length}
                max={PLAN_CUSTOM_SECTIONS_MAX}
                emptyHint="Add your own plan headings — e.g. counselling points, procedure notes, care coordination."
                emptyTestId="plan-custom-sections-empty"
                addFirstTestId="plan-custom-sections-add-first"
                addMoreTestId="plan-custom-sections-add-more"
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
        title="Clear all plan content?"
        descriptionLead="This cannot be undone from this screen."
        bullets={[...PLAN_CLEAR_ALL_BULLETS]}
        busy={clearBusy}
        testId="plan-clear-all-dialog"
        onConfirm={clearAllPlan}
      />
    </SoapTabFamilyProvider>
  );
}

function MedicinesSectionActions({
  disabled,
  onMedicinesTemplateApplied,
  showPreviousRxTrigger,
  token,
}: {
  disabled: boolean;
  onMedicinesTemplateApplied: (medicines: RxMedicine[]) => void;
  showPreviousRxTrigger: boolean;
  token: string;
}) {
  return (
    <div className="flex items-center gap-2">
      {!disabled ? (
        <MedicinesSectionTemplateButton
          disabled={disabled}
          onMedicinesApplied={onMedicinesTemplateApplied}
        />
      ) : null}
      {showPreviousRxTrigger ? <PreviousRxPlanTrigger token={token} /> : null}
    </div>
  );
}

function FollowUpNotesField({
  fields,
  setField,
  disabled,
}: {
  fields: ReturnType<typeof useRxForm>["state"]["fields"];
  setField: ReturnType<typeof useRxForm>["setField"];
  disabled: boolean;
}) {
  return (
    <div>
      <label htmlFor="followUp" className={RX_FIELD_LABEL_CLASS}>
        Notes
      </label>
      <input
        id="followUp"
        type="text"
        value={fields.followUp}
        onChange={(e) => setField("followUp", e.target.value)}
        className={RX_FIELD_INPUT_CLASS}
        placeholder="Extra on Rx — e.g. bring fasting labs"
        maxLength={1000}
        disabled={disabled}
      />
    </div>
  );
}

function AdviceField({
  fields,
  setField,
  disabled,
}: {
  fields: ReturnType<typeof useRxForm>["state"]["fields"];
  setField: ReturnType<typeof useRxForm>["setField"];
  disabled: boolean;
}) {
  return (
    <div className="space-y-2">
      {!disabled ? (
        <PlanQuickPickChips
          labels={PLAN_ADVICE_QUICK_PICKS}
          groupLabel="Quick advice"
          testId="plan-advice-quick-picks"
          isSelected={(label) => planPhraseAlreadyPresent(fields.advice, label)}
          onPick={(label) =>
            setField("advice", appendUniquePlanPhrase(fields.advice, label))
          }
        />
      ) : null}
      <div>
        <label htmlFor="advice" className="sr-only">
          Advice & education
        </label>
        <textarea
          id="advice"
          rows={3}
          value={fields.advice}
          onChange={(e) => setField("advice", e.target.value)}
          className={RX_FIELD_INPUT_CLASS}
          placeholder="Lifestyle, diet, activity, when to seek care…"
          maxLength={5000}
          disabled={disabled}
        />
      </div>
    </div>
  );
}

function filterReferralSpecialtyOptions(
  options: ChartCatalogOption[],
  query: string,
): ChartCatalogOption[] {
  const available = new Set(options.map((o) => o.value));
  return filterReferralSpecialtyCatalog(REFERRAL_SPECIALTY_CATALOG, query)
    .filter((o) => available.has(o.value))
    .map((o) => ({ value: o.value, label: o.label }));
}

function ReferralField({
  fields,
  setField,
  disabled,
}: {
  fields: ReturnType<typeof useRxForm>["state"]["fields"];
  setField: ReturnType<typeof useRxForm>["setField"];
  disabled: boolean;
}) {
  const specialties = fields.referralSpecialties;
  const referralPreview = resolveReferralForOutput(
    referralPartsFromFields(fields),
  );
  const hasReferral = Boolean(referralPreview);

  const specialtySelected = useCallback(
    (label: string) =>
      specialties.some((s) => s.toLowerCase() === label.toLowerCase()),
    [specialties],
  );

  const specialtyCatalogOptions = useMemo(
    () =>
      referralSpecialtyOptionsForCombobox().filter(
        (opt) => !specialtySelected(opt.label),
      ),
    [specialtySelected],
  );

  const handleSpecialtyCommit = useCallback(
    (payload: ChartCatalogCommit) => {
      const label =
        payload.kind === "catalog"
          ? (referralSpecialtyLabelForValue(payload.value) ?? payload.label)
          : payload.text.trim();
      if (!label) return;
      setField(
        "referralSpecialties",
        addReferralSpecialty(fields.referralSpecialties, label),
      );
    },
    [fields.referralSpecialties, setField],
  );

  const clearReferral = useCallback(() => {
    setField("referralUrgency", null);
    setField("referralSpecialties", []);
    setField("referralReason", null);
    setField("referral", "");
  }, [setField]);

  return (
    <div className="space-y-2">
      {!disabled ? (
        <>
          <PlanQuickPickChips
            labels={PLAN_REFERRAL_URGENCY_QUICK_PICKS}
            groupLabel="Urgency"
            testId="plan-referral-urgency-quick-picks"
            isSelected={(label) => fields.referralUrgency === label}
            onPick={(label) =>
              setField(
                "referralUrgency",
                fields.referralUrgency === label ? null : label,
              )
            }
          />
          <div className="space-y-1.5">
            <PlanQuickPickChips
              labels={PLAN_REFERRAL_QUICK_PICKS}
              groupLabel="Specialty"
              testId="plan-referral-quick-picks"
              isSelected={specialtySelected}
              onPick={(label) =>
                setField(
                  "referralSpecialties",
                  toggleReferralSpecialty(fields.referralSpecialties, label),
                )
              }
            />
            <ChartCatalogCombobox
              inputId="referral-specialty-search"
              testId="plan-referral-specialty-combobox"
              ariaLabel="Search specialty"
              placeholder="Search specialty…"
              disabled={disabled}
              catalogOptions={specialtyCatalogOptions}
              filterCatalog={filterReferralSpecialtyOptions}
              resolveCatalog={resolveReferralSpecialtyCatalog}
              customLabel={(text) => `Add "${text}"`}
              onCommit={handleSpecialtyCommit}
            />
            {specialties.length > 0 ? (
              <ul
                className="flex flex-col gap-1"
                data-testid="plan-referral-specialty-selected"
              >
                {specialties.map((label) => (
                  <li
                    key={label}
                    className={cn(
                      "group flex min-w-0 items-center gap-1 rounded-md border px-1.5 py-1",
                      "border-border/70 bg-muted/25",
                      "hover:border-border hover:bg-muted/45",
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate pl-1 text-sm font-medium text-foreground">
                      {label}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setField(
                          "referralSpecialties",
                          toggleReferralSpecialty(
                            fields.referralSpecialties,
                            label,
                          ),
                        )
                      }
                      aria-label={`Remove ${label}`}
                      className={cn(
                        "shrink-0 rounded-md p-1 text-muted-foreground",
                        "opacity-70 hover:bg-background hover:text-foreground hover:opacity-100",
                        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary",
                      )}
                    >
                      <X size={13} />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <PlanQuickPickChips
            labels={PLAN_REFERRAL_REASON_QUICK_PICKS}
            groupLabel="Reason"
            testId="plan-referral-reason-quick-picks"
            isSelected={(label) => fields.referralReason === label}
            onPick={(label) =>
              setField(
                "referralReason",
                fields.referralReason === label ? null : label,
              )
            }
          />
        </>
      ) : specialties.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {specialties.map((label) => (
            <li
              key={label}
              className="rounded-md border border-border/70 bg-muted/25 px-2 py-1 text-sm font-medium"
            >
              {label}
            </li>
          ))}
        </ul>
      ) : null}
      <div>
        <div className="flex items-center justify-between gap-2">
          <label htmlFor="referral" className={RX_FIELD_LABEL_CLASS}>
            Referral notes
          </label>
          {!disabled ? (
            <button
              type="button"
              className={cn(
                "text-xs text-muted-foreground underline-offset-2 hover:underline",
                !hasReferral && "invisible pointer-events-none",
              )}
              onClick={clearReferral}
              aria-label="Clear referral"
              tabIndex={hasReferral ? undefined : -1}
            >
              Clear
            </button>
          ) : null}
        </div>
        <textarea
          id="referral"
          rows={2}
          value={fields.referral}
          onChange={(e) => setField("referral", e.target.value)}
          className={RX_FIELD_INPUT_CLASS}
          placeholder="Who to see, facility, clinical context…"
          maxLength={5000}
          disabled={disabled}
        />
      </div>
    </div>
  );
}

function ClinicalNotesField({
  fields,
  setField,
  disabled,
}: {
  fields: ReturnType<typeof useRxForm>["state"]["fields"];
  setField: ReturnType<typeof useRxForm>["setField"];
  disabled: boolean;
}) {
  return (
    <div>
      <label htmlFor="clinicalNotes" className="sr-only">
        Clinical notes (private)
      </label>
      <textarea
        id="clinicalNotes"
        rows={2}
        value={fields.clinicalNotes}
        onChange={(e) => setField("clinicalNotes", e.target.value)}
        className={RX_FIELD_INPUT_CLASS}
        placeholder="Internal clinician notes"
        maxLength={5000}
        disabled={disabled}
      />
    </div>
  );
}
