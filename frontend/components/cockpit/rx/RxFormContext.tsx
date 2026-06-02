"use client";

/**
 * RxFormContext — state owner for the cockpit-v2 prescription form refactor
 * (cv2-05). Extracted from PrescriptionForm.tsx's local hooks per DL-26 / DL-27.
 *
 * Inventory of state moved (vs PrescriptionForm.tsx as of 2026-05-17):
 *
 *  - cc, hopi (string, useState)                    → fields.cc, fields.hopi
 *  - provisionalDiagnosis (string, useState)        → fields.provisionalDiagnosis
 *  - investigations (string, useState)              → fields.investigationsOrders
 *  - followUp (string, useState)                    → fields.followUp (legacy free-text)
 *  - patientEducation (string, useState)            → fields.patientEducation
 *  - clinicalNotes (string, useState)               → fields.clinicalNotes
 *  - medicines (MedicineEntry[], useState)          → fields.medicines (reducer-managed)
 *  - formSnapshot + useAutoSave (useMemo + hook)    → provider autosave wiring
 *  - isDirty (implicit via edits)                   → state.isDirty (reducer)
 *  - autosave saving / savedAt (useAutoSave)        → autoSave.* on context value
 *
 * UI-only state that STAYS in PrescriptionForm.tsx (not form fields):
 *  - entryMode, prescription, loading, saving (send), uploading, attachments,
 *    templatePickerOpen, previewOpen, allergies, DDI, medicineInstanceIds, etc.
 *
 * NEW fields (cv2-04 migration; typed here, no UI yet — cv2-07 adds inputs):
 *  - vitals_bp_systolic / vitals_bp_diastolic / vitals_hr / vitals_temp_c /
 *    vitals_spo2 / vitals_wt_kg / vitals_ht_cm
 *  - examination_findings
 *  - differential_diagnosis (string[])
 *  - advice
 *  - follow_up_value (number) + follow_up_unit ('days' | 'weeks' | 'months' | 'as_needed')
 *  - referral
 *  - test_results
 *  - vitals_text (legacy placeholder — no current UI input; preserved for cv2-07)
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type MutableRefObject,
} from "react";
import { createPrescription, updatePrescription } from "@/lib/api";
import { useAutoSave, type UseAutoSaveResult } from "@/hooks/useAutoSave";
import type { MedicineRowValue } from "@/components/consultation/MedicineRow";
import type {
  PrescriptionType,
  PrescriptionWithRelations,
  UpdatePrescriptionPayload,
} from "@/types/prescription";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FollowUpUnit = "days" | "weeks" | "months" | "as_needed";

/** Mirrors MedicineRowValue — hand rows straight to <MedicineRow>. */
export type RxMedicine = MedicineRowValue;

export interface RxFormFields {
  cc: string;
  hopi: string;

  /** Legacy free-text vitals (DEPRECATED; preserved until cv2-07 structured UI). */
  vitalsText: string;

  vitalsBpSystolic: number | null;
  vitalsBpDiastolic: number | null;
  vitalsHr: number | null;
  vitalsTempC: number | null;
  vitalsSpo2: number | null;
  vitalsWtKg: number | null;
  vitalsHtCm: number | null;

  examinationFindings: string;

  provisionalDiagnosis: string;
  differentialDiagnosis: string[];

  /** Renamed DB column `investigations_orders`; API field stays `investigations`. */
  investigationsOrders: string;
  medicines: RxMedicine[];

  advice: string;
  followUp: string;
  followUpValue: number | null;
  followUpUnit: FollowUpUnit | null;
  referral: string;
  testResults: string;

  patientEducation: string;
  clinicalNotes: string;
  /** Prior Rx re-use audit (rxss-03); client form state only in v1. */
  fromPrescriptionId: string | null;
}

export interface RxFormState {
  fields: RxFormFields;
  isDirty: boolean;
  isSaving: boolean;
  isSubmitting: boolean;
  lastSavedAt: string | null;
  submitError: string | null;
}

export type RxFormAction =
  | { type: "SET_FIELD"; key: keyof RxFormFields; value: RxFormFields[keyof RxFormFields] }
  | { type: "SET_MEDICINES"; medicines: RxMedicine[] }
  | { type: "ADD_MEDICINE"; medicine: RxMedicine }
  | { type: "REMOVE_MEDICINE"; index: number }
  | { type: "UPDATE_MEDICINE"; index: number; patch: Partial<RxMedicine> }
  | { type: "ADD_DDX"; entry: string }
  | { type: "REMOVE_DDX"; index: number }
  | { type: "SAVE_START" }
  | { type: "SAVE_SUCCESS"; lastSavedAt: string }
  | { type: "SAVE_ERROR"; error: string }
  | { type: "SUBMIT_START" }
  | { type: "SUBMIT_SUCCESS" }
  | { type: "SUBMIT_ERROR"; error: string }
  | { type: "RESET"; initialFields: RxFormFields };

export const EMPTY_RX_MEDICINE: RxMedicine = {
  medicineName: "",
  dosage: "",
  route: "",
  frequency: "",
  duration: "",
  instructions: "",
  drugMasterId: null,
  frequencyCode: null,
  durationValue: null,
  durationUnit: null,
  routeCode: null,
};

export function createEmptyRxFormFields(
  seedMedicines: RxMedicine[] = [{ ...EMPTY_RX_MEDICINE }],
): RxFormFields {
  return {
    cc: "",
    hopi: "",
    vitalsText: "",
    vitalsBpSystolic: null,
    vitalsBpDiastolic: null,
    vitalsHr: null,
    vitalsTempC: null,
    vitalsSpo2: null,
    vitalsWtKg: null,
    vitalsHtCm: null,
    examinationFindings: "",
    provisionalDiagnosis: "",
    differentialDiagnosis: [],
    investigationsOrders: "",
    medicines: seedMedicines,
    advice: "",
    followUp: "",
    followUpValue: null,
    followUpUnit: null,
    referral: "",
    testResults: "",
    patientEducation: "",
    clinicalNotes: "",
    fromPrescriptionId: null,
  };
}

/** Read investigations from API row (column rename compat). */
export function investigationsFromPrescription(
  rx: Pick<PrescriptionWithRelations, "investigations" | "investigations_orders">,
): string {
  return rx.investigations_orders ?? rx.investigations ?? "";
}

export function medicinesFromPrescription(
  rx: PrescriptionWithRelations,
): RxMedicine[] {
  const meds = rx.prescription_medicines ?? [];
  if (meds.length === 0) return [{ ...EMPTY_RX_MEDICINE }];
  return meds.map((m) => ({
    medicineName: m.medicine_name,
    dosage: m.dosage ?? "",
    route: m.route ?? "",
    frequency: m.frequency ?? "",
    duration: m.duration ?? "",
    instructions: m.instructions ?? "",
    drugMasterId: m.drug_master_id ?? null,
    frequencyCode: m.frequency_code ?? null,
    durationValue: m.duration_value ?? null,
    durationUnit: m.duration_unit ?? null,
    routeCode: m.route_code ?? null,
  }));
}

export function rxFormFieldsFromPrescription(
  rx: PrescriptionWithRelations,
  medicines: RxMedicine[] = medicinesFromPrescription(rx),
): RxFormFields {
  return {
    cc: rx.cc ?? "",
    hopi: rx.hopi ?? "",
    vitalsText: "",
    vitalsBpSystolic: rx.vitals_bp_systolic ?? null,
    vitalsBpDiastolic: rx.vitals_bp_diastolic ?? null,
    vitalsHr: rx.vitals_hr ?? null,
    vitalsTempC: rx.vitals_temp_c ?? null,
    vitalsSpo2: rx.vitals_spo2 ?? null,
    vitalsWtKg: rx.vitals_wt_kg ?? null,
    vitalsHtCm: rx.vitals_ht_cm ?? null,
    examinationFindings: rx.examination_findings ?? "",
    provisionalDiagnosis: rx.provisional_diagnosis ?? "",
    differentialDiagnosis: rx.differential_diagnosis ?? [],
    investigationsOrders: investigationsFromPrescription(rx),
    medicines,
    advice: rx.advice ?? "",
    followUp: rx.follow_up ?? "",
    followUpValue: rx.follow_up_value ?? null,
    followUpUnit: rx.follow_up_unit ?? null,
    referral: rx.referral ?? "",
    testResults: rx.test_results ?? "",
    patientEducation: rx.patient_education ?? "",
    clinicalNotes: rx.clinical_notes ?? "",
    fromPrescriptionId: null,
  };
}

export function buildRxPayload(fields: RxFormFields): UpdatePrescriptionPayload {
  return {
    cc: fields.cc.trim() || null,
    hopi: fields.hopi.trim() || null,
    provisionalDiagnosis: fields.provisionalDiagnosis.trim() || null,
    investigations: fields.investigationsOrders.trim() || null,
    followUp: fields.followUp.trim() || null,
    patientEducation: fields.patientEducation.trim() || null,
    clinicalNotes: fields.clinicalNotes.trim() || null,
    vitalsBpSystolic: fields.vitalsBpSystolic,
    vitalsBpDiastolic: fields.vitalsBpDiastolic,
    vitalsHr: fields.vitalsHr,
    vitalsTempC: fields.vitalsTempC,
    vitalsSpo2: fields.vitalsSpo2,
    vitalsWtKg: fields.vitalsWtKg,
    vitalsHtCm: fields.vitalsHtCm,
    examinationFindings: fields.examinationFindings.trim() || null,
    differentialDiagnosis:
      fields.differentialDiagnosis.length > 0 ? fields.differentialDiagnosis : null,
    advice: fields.advice.trim() || null,
    followUpValue: fields.followUpValue,
    followUpUnit: fields.followUpUnit,
    referral: fields.referral.trim() || null,
    testResults: fields.testResults.trim() || null,
    medicines: fields.medicines
      .filter((m) => m.medicineName.trim())
      .map((m, i) => ({
        medicineName: m.medicineName.trim(),
        dosage: m.dosage.trim() || null,
        route: m.route.trim() || null,
        frequency: m.frequency.trim() || null,
        duration: m.duration.trim() || null,
        instructions: m.instructions.trim() || null,
        sortOrder: i,
        drugMasterId: m.drugMasterId,
        frequencyCode: m.frequencyCode,
        durationValue: m.durationValue,
        durationUnit: m.durationUnit,
        routeCode: m.routeCode,
      })),
  };
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

export function rxFormReducer(state: RxFormState, action: RxFormAction): RxFormState {
  switch (action.type) {
    case "SET_FIELD":
      return {
        ...state,
        fields: { ...state.fields, [action.key]: action.value },
        isDirty: true,
        submitError: null,
      };
    case "SET_MEDICINES":
      return {
        ...state,
        fields: { ...state.fields, medicines: action.medicines },
        isDirty: true,
        submitError: null,
      };
    case "ADD_MEDICINE":
      return {
        ...state,
        fields: {
          ...state.fields,
          medicines: [...state.fields.medicines, action.medicine],
        },
        isDirty: true,
        submitError: null,
      };
    case "REMOVE_MEDICINE": {
      const { medicines } = state.fields;
      if (medicines.length <= 1) return state;
      return {
        ...state,
        fields: {
          ...state.fields,
          medicines: medicines.filter((_, i) => i !== action.index),
        },
        isDirty: true,
        submitError: null,
      };
    }
    case "UPDATE_MEDICINE": {
      const next = [...state.fields.medicines];
      next[action.index] = { ...next[action.index], ...action.patch };
      return {
        ...state,
        fields: { ...state.fields, medicines: next },
        isDirty: true,
        submitError: null,
      };
    }
    case "ADD_DDX":
      return {
        ...state,
        fields: {
          ...state.fields,
          differentialDiagnosis: [...state.fields.differentialDiagnosis, action.entry],
        },
        isDirty: true,
        submitError: null,
      };
    case "REMOVE_DDX":
      return {
        ...state,
        fields: {
          ...state.fields,
          differentialDiagnosis: state.fields.differentialDiagnosis.filter(
            (_, i) => i !== action.index,
          ),
        },
        isDirty: true,
        submitError: null,
      };
    case "SAVE_START":
      return { ...state, isSaving: true, submitError: null };
    case "SAVE_SUCCESS":
      return {
        ...state,
        isSaving: false,
        isDirty: false,
        lastSavedAt: action.lastSavedAt,
      };
    case "SAVE_ERROR":
      return { ...state, isSaving: false, submitError: action.error };
    case "SUBMIT_START":
      return { ...state, isSubmitting: true, submitError: null };
    case "SUBMIT_SUCCESS":
      return { ...state, isSubmitting: false, isDirty: false };
    case "SUBMIT_ERROR":
      return { ...state, isSubmitting: false, submitError: action.error };
    case "RESET":
      return {
        fields: action.initialFields,
        isDirty: false,
        isSaving: false,
        isSubmitting: false,
        lastSavedAt: null,
        submitError: null,
      };
    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export interface RxFormContextValue {
  appointmentId: string;
  patientId: string | null;
  state: RxFormState;
  dispatch: React.Dispatch<RxFormAction>;
  setField: <K extends keyof RxFormFields>(key: K, value: RxFormFields[K]) => void;
  isDirty: boolean;
  submitDisabled: boolean;
  buildPayload: () => UpdatePrescriptionPayload;
  autoSave: UseAutoSaveResult;
}

const RxFormContext = createContext<RxFormContextValue | null>(null);

export interface RxFormProviderProps {
  appointmentId: string;
  patientId: string | null;
  token: string;
  entryMode: PrescriptionType;
  initialFields: RxFormFields;
  autosaveEnabled: boolean;
  prescriptionIdRef: MutableRefObject<string | null>;
  onPrescriptionCreated: (prescription: PrescriptionWithRelations) => void;
  children: React.ReactNode;
}

export function RxFormProvider({
  appointmentId,
  patientId,
  token,
  entryMode,
  initialFields,
  autosaveEnabled,
  prescriptionIdRef,
  onPrescriptionCreated,
  children,
}: RxFormProviderProps): JSX.Element {
  const [state, dispatch] = useReducer(rxFormReducer, {
    fields: initialFields,
    isDirty: false,
    isSaving: false,
    isSubmitting: false,
    lastSavedAt: null,
    submitError: null,
  });

  const initialFieldsRef = useRef(initialFields);
  useEffect(() => {
    if (initialFieldsRef.current === initialFields) return;
    initialFieldsRef.current = initialFields;
    dispatch({ type: "RESET", initialFields });
  }, [initialFields]);

  const setField = useCallback(<K extends keyof RxFormFields>(key: K, value: RxFormFields[K]) => {
    dispatch({ type: "SET_FIELD", key, value });
  }, []);

  const fieldsRef = useRef(state.fields);
  fieldsRef.current = state.fields;

  const buildPayload = useCallback(() => buildRxPayload(fieldsRef.current), []);

  const formSnapshot = useMemo(
    () =>
      JSON.stringify({
        fields: state.fields,
        entryMode,
      }),
    [state.fields, entryMode],
  );

  const persistSnapshot = useCallback(async () => {
    dispatch({ type: "SAVE_START" });
    try {
      const payload = buildRxPayload(fieldsRef.current);
      const existingId = prescriptionIdRef.current;
      if (existingId) {
        await updatePrescription(token, existingId, payload);
      } else {
        const res = await createPrescription(token, {
          appointmentId,
          patientId: patientId ?? undefined,
          type: entryMode,
          ...payload,
        });
        prescriptionIdRef.current = res.data.prescription.id;
        onPrescriptionCreated(res.data.prescription);
      }
      dispatch({ type: "SAVE_SUCCESS", lastSavedAt: new Date().toISOString() });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      dispatch({ type: "SAVE_ERROR", error: message });
      throw err;
    }
  }, [
    appointmentId,
    entryMode,
    onPrescriptionCreated,
    patientId,
    prescriptionIdRef,
    token,
  ]);

  const autoSave = useAutoSave({
    value: formSnapshot,
    save: persistSnapshot,
    debounceMs: 1500,
    enabled: autosaveEnabled,
  });

  const filledMedicineCount = state.fields.medicines.filter((m) =>
    m.medicineName.trim(),
  ).length;
  const submitDisabled =
    state.isSubmitting ||
    (filledMedicineCount === 0 &&
      !state.fields.advice.trim() &&
      !state.fields.provisionalDiagnosis.trim());

  const value: RxFormContextValue = useMemo(
    () => ({
      appointmentId,
      patientId,
      state,
      dispatch,
      setField,
      isDirty: state.isDirty,
      submitDisabled,
      buildPayload,
      autoSave,
    }),
    [appointmentId, patientId, autoSave, buildPayload, setField, state, submitDisabled],
  );

  return <RxFormContext.Provider value={value}>{children}</RxFormContext.Provider>;
}

/** Returns form context when a parent `<RxFormProvider>` exists; otherwise `null`. */
export function useOptionalRxForm(): RxFormContextValue | null {
  return useContext(RxFormContext);
}

export function useRxForm(): RxFormContextValue {
  const ctx = useContext(RxFormContext);
  if (!ctx) {
    throw new Error("useRxForm must be called inside an <RxFormProvider>.");
  }
  return ctx;
}
