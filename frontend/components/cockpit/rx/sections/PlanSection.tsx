"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  EMPTY_RX_MEDICINE,
  useRxForm,
  type RxMedicine,
} from "@/components/cockpit/rx/RxFormContext";
import { useRxFormActions } from "@/components/cockpit/rx/RxFormActionsContext";
import { FollowUpPicker } from "@/components/cockpit/rx/inputs/FollowUpPicker";
import {
  RX_FIELD_INPUT_CLASS,
  RX_FIELD_LABEL_CLASS,
  RX_SECTION_HEADING_CLASS,
} from "@/components/cockpit/rx/sections/field-styles";
import { InvestigationsChipRow } from "@/components/cockpit/rx/inputs/InvestigationsChipRow";
import MedicineRow from "@/components/consultation/MedicineRow";
import AllergyClashBanner from "@/components/ehr/AllergyClashBanner";
import InteractionChips from "@/components/ehr/InteractionChips";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { usePaneKeyboardShortcuts } from "@/hooks/usePaneKeyboardShortcuts";
import { modShortcutHint } from "@/lib/patient-profile/keyboard-shortcuts";
import { useRegisterCommand } from "@/lib/patient-profile/command-registry";
import {
  trackCockpitV2RRxPolishDensificationLanded,
  trackCockpitV2RRxPolishShortcutUsed,
} from "@/lib/patient-profile/telemetry";
import { isMedicineRowComplete } from "@/lib/cockpit/medicine-row-state";
import { PreviousRxPlanTrigger } from "@/components/cockpit/rx/previous/PreviousRxPlanTrigger";
import type { MatchableMedicine } from "@/lib/ehr/match-allergens";
import type { PatientAllergy } from "@/types/patient-chart";
import type { DrugMasterRow } from "@/types/drug-master";
import type { InteractionRow } from "@/lib/api/drug-interactions";
import { coerceRouteCode } from "@/lib/medicineCodes";
import { FavoritesChipStrip } from "@/components/cockpit/rx/favorites/FavoritesChipStrip";
import { useSideSheet } from "@/components/patient-profile/SideSheetHost";
import { useFavorites } from "@/hooks/useFavorites";
import {
  createFavorite,
  type DoctorDrugFavorite,
} from "@/lib/api/doctor-drug-favorites";
import {
  trackCockpitV2RRxPolishFavoriteApplied,
} from "@/lib/patient-profile/telemetry";

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
  const { fields } = state;
  const medicines = fields.medicines;
  const isReadOnly = disabled;
  const registeredActions = useRxFormActions();
  const { data: favorites = [], refetch: refetchFavorites } = useFavorites(token);
  const sideSheet = useSideSheet();

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
  const [activeRowInstanceId, setActiveRowInstanceId] = useState<string | null>(
    null,
  );
  const densificationTrackedRef = useRef(false);

  const activeRowIndex = useMemo(() => {
    if (!activeRowInstanceId) return null;
    const idx = medicineInstanceIds.indexOf(activeRowInstanceId);
    return idx >= 0 ? idx : null;
  }, [activeRowInstanceId, medicineInstanceIds]);

  const handleApplyFavorite = useCallback(
    (fav: DoctorDrugFavorite) => {
      const fromCount = medicines.length;
      const newInstanceIds = generateInstanceIds(1);
      dispatch({
        type: "ADD_MEDICINE",
        medicine: { ...EMPTY_RX_MEDICINE, ...fav.template },
      });
      setMedicineInstanceIds((prev) => [...prev, ...newInstanceIds]);
      setActiveRowInstanceId(newInstanceIds[0] ?? null);
      trackCockpitV2RRxPolishFavoriteApplied({
        favoriteId: fav.id,
        fromCount,
      });
    },
    [dispatch, generateInstanceIds, medicines.length, setMedicineInstanceIds],
  );

  const handleSaveCurrentRowAsFavorite = useCallback(async () => {
    if (activeRowIndex === null) return;
    const value = medicines[activeRowIndex];
    if (!isMedicineRowComplete(value)) return;

    const defaultName = value.medicineName.trim() || "Favorite";
    const name = window.prompt("Name this favorite", defaultName)?.trim();
    if (!name) return;

    await createFavorite(token, { name, template: value });
    await refetchFavorites();
  }, [activeRowIndex, medicines, refetchFavorites, token]);

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
      "[role='button'][aria-label*='Medicine row']",
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
    setMedicineInstanceIds((prev) => [...prev, ...newInstanceIds]);
    setActiveRowInstanceId(newInstanceIds[0] ?? null);
  }, [dispatch, generateInstanceIds, setMedicineInstanceIds]);

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
    if (medicines.length <= 1) return;
    const removedInstanceId = medicineInstanceIds[index];
    dispatch({ type: "REMOVE_MEDICINE", index });
    setMedicineInstanceIds((prev) =>
      prev.length > 1 ? prev.filter((_, i) => i !== index) : prev,
    );
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

  return (
    <section aria-label="Plan" className="space-y-3">
      {heading !== null && (
        <h3 className={RX_SECTION_HEADING_CLASS}>{heading}</h3>
      )}

      <section id="rx-medicines" aria-label="Medicines">
        <div id="medicines-section">
          <MedicinesHeader
            disabled={disabled}
            onAddMedicine={handleAddMedicine}
            showPreviousRxTrigger={showPreviousRxTrigger}
            token={token}
          />
          {!isReadOnly ? (
            <FavoritesChipStrip
              favorites={favorites}
              canSaveCurrent={
                activeRowIndex !== null &&
                isMedicineRowComplete(medicines[activeRowIndex])
              }
              onApply={handleApplyFavorite}
              onSaveCurrentRow={() => {
                void handleSaveCurrentRowAsFavorite();
              }}
              onManage={() => sideSheet.open("rx-favorites")}
            />
          ) : null}
          <div className="mt-2 space-y-2" onKeyDown={handleMedicineListKeyDown}>
            {medicines.map((med, i) => {
              const instanceId = medicineInstanceIds[i];
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
                  isEditing={!disabled && instanceId === activeRowInstanceId}
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
      </section>

      {!safetyLifted && (
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
      )}

      <InvestigationsChipRow
        value={fields.investigationsOrders}
        onChange={(next) => setField("investigationsOrders", next)}
        disabled={disabled}
      />

      <FollowUpPicker />

      <FollowUpNotesField fields={fields} setField={setField} disabled={disabled} />

      <AdviceField fields={fields} setField={setField} disabled={disabled} />

      <PatientEducationField fields={fields} setField={setField} disabled={disabled} />

      <ReferralField fields={fields} setField={setField} disabled={disabled} />

      <TestResultsField fields={fields} setField={setField} disabled={disabled} />

      <ClinicalNotesField fields={fields} setField={setField} disabled={disabled} />
    </section>
  );
}

function MedicinesHeader({
  disabled,
  onAddMedicine,
  showPreviousRxTrigger,
  token,
}: {
  disabled: boolean;
  onAddMedicine: () => void;
  showPreviousRxTrigger: boolean;
  token: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <label className={RX_FIELD_LABEL_CLASS}>Medications</label>
      <div className="flex items-center gap-2">
        {showPreviousRxTrigger ? <PreviousRxPlanTrigger token={token} /> : null}
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onAddMedicine}
              disabled={disabled}
              className="text-sm font-medium text-primary hover:text-primary/80 disabled:opacity-50"
            >
              + Add medicine
            </button>
          </TooltipTrigger>
          <TooltipContent>
            Add medicine{" "}
            <kbd className="ml-2 rounded border bg-background/20 px-1.5 py-0.5 text-xs">
              {modShortcutHint("M")}
            </kbd>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      </div>
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
        Follow-up notes (free-text)
      </label>
      <input
        id="followUp"
        type="text"
        value={fields.followUp}
        onChange={(e) => setField("followUp", e.target.value)}
        className={RX_FIELD_INPUT_CLASS}
        placeholder="Follow-up notes"
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
    <div>
      <label htmlFor="advice" className={RX_FIELD_LABEL_CLASS}>
        Advice / lifestyle
      </label>
      <textarea
        id="advice"
        rows={2}
        value={fields.advice}
        onChange={(e) => setField("advice", e.target.value)}
        className={RX_FIELD_INPUT_CLASS}
        placeholder="Advice / lifestyle"
        maxLength={5000}
        disabled={disabled}
      />
    </div>
  );
}

function PatientEducationField({
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
      <label htmlFor="patientEducation" className={RX_FIELD_LABEL_CLASS}>
        Patient education
      </label>
      <input
        id="patientEducation"
        type="text"
        value={fields.patientEducation}
        onChange={(e) => setField("patientEducation", e.target.value)}
        className={RX_FIELD_INPUT_CLASS}
        placeholder="Patient education"
        maxLength={1000}
        disabled={disabled}
      />
    </div>
  );
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
  return (
    <div>
      <label htmlFor="referral" className={RX_FIELD_LABEL_CLASS}>
        Referral
      </label>
      <textarea
        id="referral"
        rows={2}
        value={fields.referral}
        onChange={(e) => setField("referral", e.target.value)}
        className={RX_FIELD_INPUT_CLASS}
        placeholder="Referral"
        maxLength={5000}
        disabled={disabled}
      />
    </div>
  );
}

function TestResultsField({
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
      <label htmlFor="testResults" className={RX_FIELD_LABEL_CLASS}>
        Test results
      </label>
      <textarea
        id="testResults"
        rows={2}
        value={fields.testResults}
        onChange={(e) => setField("testResults", e.target.value)}
        className={RX_FIELD_INPUT_CLASS}
        placeholder="Test results"
        maxLength={5000}
        disabled={disabled}
      />
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
      <label htmlFor="clinicalNotes" className={RX_FIELD_LABEL_CLASS}>
        Clinical notes (private)
      </label>
      <textarea
        id="clinicalNotes"
        rows={2}
        value={fields.clinicalNotes}
        onChange={(e) => setField("clinicalNotes", e.target.value)}
        className={RX_FIELD_INPUT_CLASS}
        placeholder="Clinical notes"
        maxLength={5000}
        disabled={disabled}
      />
    </div>
  );
}
