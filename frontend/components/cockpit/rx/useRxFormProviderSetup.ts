"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listPrescriptionsByAppointment } from "@/lib/api";
import type { PrescriptionWithRelations, PrescriptionType } from "@/types/prescription";
import {
  createEmptyRxFormFields,
  medicinesFromPrescription,
  rxFormFieldsFromPrescription,
  type RxFormFields,
  type RxFormProviderProps,
} from "@/components/cockpit/rx/RxFormContext";

export interface UseRxFormProviderSetupArgs {
  appointmentId: string;
  patientId: string | null;
  token: string;
  existingPrescription?: PrescriptionWithRelations | null;
  /** When true, skip fetch/bootstrap (cockpit shell owns setup via context). */
  disabled?: boolean;
}

export interface RxFormProviderSetup {
  loading: boolean;
  initialFields: RxFormFields | null;
  entryMode: PrescriptionType;
  setEntryMode: React.Dispatch<React.SetStateAction<PrescriptionType>>;
  prescription: PrescriptionWithRelations | null;
  setPrescription: React.Dispatch<
    React.SetStateAction<PrescriptionWithRelations | null>
  >;
  prescriptionIdRef: React.MutableRefObject<string | null>;
  attachments: import("@/types/prescription").PrescriptionAttachment[];
  setAttachments: React.Dispatch<
    React.SetStateAction<import("@/types/prescription").PrescriptionAttachment[]>
  >;
  setInitialFields: React.Dispatch<React.SetStateAction<RxFormFields | null>>;
  generateInstanceIds: (count: number) => string[];
  instanceIdSeqRef: React.MutableRefObject<number>;
  medicineInstanceIds: string[];
  setMedicineInstanceIds: React.Dispatch<React.SetStateAction<string[]>>;
  /**
   * Props for `<RxFormProvider>`. Always non-null so callers can mount the
   * provider on the first render — during the fetch window we mount it with
   * empty fields and `autosaveEnabled: false`, then re-mount (via the `key`)
   * when the draft resolves. This is what lets sibling panes that call
   * `useRxForm()` (e.g. `AssessmentStrip`, `PatientRibbon`) render safely
   * even before the prescription draft is loaded.
   */
  providerProps: Omit<RxFormProviderProps, "children"> & { key: string };
}

/**
 * Loads the appointment prescription draft and builds props for {@link RxFormProvider}.
 * Shared by `PatientProfilePage` (hoisted provider, csf-01) and standalone `PrescriptionForm`.
 */
export function useRxFormProviderSetup({
  appointmentId,
  patientId,
  token,
  existingPrescription: initialPrescription,
  disabled = false,
}: UseRxFormProviderSetupArgs): RxFormProviderSetup {
  const [entryMode, setEntryMode] = useState<PrescriptionType>("structured");
  const [prescription, setPrescription] = useState<PrescriptionWithRelations | null>(
    initialPrescription ?? null,
  );
  const [initialFields, setInitialFields] = useState<RxFormFields | null>(() =>
    initialPrescription ? rxFormFieldsFromPrescription(initialPrescription) : null,
  );
  const instanceIdSeqRef = useRef(0);
  const generateInstanceIds = useCallback((count: number): string[] => {
    const out: string[] = [];
    for (let i = 0; i < count; i++) {
      instanceIdSeqRef.current += 1;
      out.push(`m-${instanceIdSeqRef.current}`);
    }
    return out;
  }, []);
  const [medicineInstanceIds, setMedicineInstanceIds] = useState<string[]>(() => [
    `m-${++instanceIdSeqRef.current}`,
  ]);
  const [attachments, setAttachments] = useState<
    import("@/types/prescription").PrescriptionAttachment[]
  >([]);
  const [loading, setLoading] = useState(!initialPrescription);
  const prescriptionIdRef = useRef<string | null>(initialPrescription?.id ?? null);

  useEffect(() => {
    if (disabled) return;
    if (initialPrescription) {
      setPrescription(initialPrescription);
      prescriptionIdRef.current = initialPrescription.id;
      setEntryMode(initialPrescription.type);
      const meds = medicinesFromPrescription(initialPrescription);
      setInitialFields(rxFormFieldsFromPrescription(initialPrescription, meds));
      if ((initialPrescription.prescription_medicines ?? []).length > 0) {
        setMedicineInstanceIds(
          generateInstanceIds(initialPrescription.prescription_medicines!.length),
        );
      }
      setAttachments(initialPrescription.prescription_attachments ?? []);
      setLoading(false);
      return;
    }
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const res = await listPrescriptionsByAppointment(token, appointmentId);
        if (cancelled) return;
        const list = res.data.prescriptions ?? [];
        if (list.length > 0) {
          const latest = list[0];
          setPrescription(latest);
          prescriptionIdRef.current = latest.id;
          setEntryMode(latest.type);
          const meds = medicinesFromPrescription(latest);
          setInitialFields(rxFormFieldsFromPrescription(latest, meds));
          if ((latest.prescription_medicines ?? []).length > 0) {
            setMedicineInstanceIds(
              generateInstanceIds(latest.prescription_medicines!.length),
            );
          }
          setAttachments(latest.prescription_attachments ?? []);
        } else {
          setInitialFields(createEmptyRxFormFields());
        }
      } catch {
        if (!cancelled) setInitialFields(createEmptyRxFormFields());
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [appointmentId, token, initialPrescription, generateInstanceIds, disabled]);

  // Stable placeholder used during the brief loading window before the draft
  // resolves. Memoised so the reference stays identical across re-renders —
  // otherwise `RxFormProvider`'s `RESET`-on-initialFields-change effect would
  // fire on every render while loading.
  const emptyInitialFields = useMemo(() => createEmptyRxFormFields(), []);

  // `providerProps` is always non-null so callers can mount `<RxFormProvider>`
  // on the very first render. During the brief fetch window we feed the
  // provider empty fields with `autosaveEnabled: false`; the `key` flips from
  // "${id}-loading" → "${id}-ready" once the draft resolves, forcing React to
  // unmount the placeholder provider and remount it with the freshly-loaded
  // initial fields. Without this, sibling panes that call `useRxForm()`
  // (PatientRibbon Dx mirror, AssessmentStrip, etc.) would crash because there
  // would be no provider above them in the tree during the loading window.
  const providerProps: Omit<RxFormProviderProps, "children"> & { key: string } = {
    key: `${appointmentId}-${initialFields == null ? "loading" : "ready"}`,
    appointmentId,
    patientId,
    token,
    entryMode,
    initialFields: initialFields ?? emptyInitialFields,
    autosaveEnabled: !loading,
    prescriptionIdRef,
    onPrescriptionCreated: (rx) => {
      setPrescription(rx);
    },
  };

  return {
    loading,
    initialFields,
    entryMode,
    setEntryMode,
    prescription,
    setPrescription,
    prescriptionIdRef,
    attachments,
    setAttachments,
    setInitialFields,
    generateInstanceIds,
    instanceIdSeqRef,
    medicineInstanceIds,
    setMedicineInstanceIds,
    providerProps,
  };
}
