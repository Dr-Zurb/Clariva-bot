"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  listPrescriptionsByAppointment,
  getDoctorSettings,
  getAppointmentById,
} from "@/lib/api";
import {
  resolveDefaultLayout,
  type DefaultLayout,
} from "@/lib/cockpit/objective-default-layout";
import type { PrescriptionWithRelations, PrescriptionType } from "@/types/prescription";
import {
  createEmptyRxFormFields,
  medicinesFromPrescription,
  rxFormFieldsFromPrescription,
  type RxFormFields,
  type RxFormProviderProps,
} from "@/components/cockpit/rx/RxFormContext";
import {
  seedCustomSubsectionsFromDefault,
  serializeCustomSubsections,
} from "@/lib/cockpit/custom-subsections";
import type { SubjectiveSectionCollapseMap } from "@/lib/cockpit/subjective-section-collapse";
import type { SubjectiveSectionHiddenSet } from "@/lib/cockpit/subjective-section-visibility";
import type { SubjectiveSectionId } from "@/lib/cockpit/subjective-section-order";
import type { ObjectiveSectionId } from "@/lib/cockpit/objective-section-order";

/** obj-10: doctor default Objective-tab layout config (no consumer yet — obj-11/12 consume). */
export interface DoctorObjectiveDefaults {
  sectionOrder: ObjectiveSectionId[];
  sectionCollapsed: Record<string, boolean>;
  sectionHidden: ObjectiveSectionId[];
  customSections: import("@/types/prescription").CustomSubsection[];
}

const EMPTY_OBJECTIVE_DEFAULTS: DoctorObjectiveDefaults = {
  sectionOrder: [],
  sectionCollapsed: {},
  sectionHidden: [],
  customSections: [],
};

async function loadDoctorSubjectiveDefaults(token: string): Promise<{
  customSubsections: import("@/types/prescription").CustomSubsection[];
  sectionOrder: SubjectiveSectionId[];
  sectionCollapsed: SubjectiveSectionCollapseMap;
  sectionHidden: SubjectiveSectionHiddenSet;
  objective: DoctorObjectiveDefaults;
  /** obj-14: doctor specialty for the modality/specialty default-layout seed. */
  specialty: string | null;
}> {
  try {
    const settingsRes = await getDoctorSettings(token);
    const settings = settingsRes.data.settings;
    return {
      customSubsections: settings.subjective_custom_subsections ?? [],
      sectionOrder: settings.subjective_section_order ?? [],
      sectionCollapsed: settings.subjective_section_collapsed ?? {},
      sectionHidden: settings.subjective_section_hidden ?? [],
      objective: {
        sectionOrder: settings.objective_section_order ?? [],
        sectionCollapsed: settings.objective_section_collapsed ?? {},
        sectionHidden: settings.objective_section_hidden ?? [],
        customSections: settings.objective_custom_sections ?? [],
      },
      specialty: settings.specialty ?? null,
    };
  } catch {
    return {
      customSubsections: [],
      sectionOrder: [],
      sectionCollapsed: {},
      sectionHidden: [],
      objective: EMPTY_OBJECTIVE_DEFAULTS,
      specialty: null,
    };
  }
}

/**
 * obj-14 (OBJ-D6): compute the modality/specialty default-layout seed for the
 * Objective tab. Pure resolver fed by the appointment modality + doctor
 * specialty; a missing/failed modality fetch degrades to a specialty-only seed
 * (never throws — the tab must never block on this).
 */
async function loadObjectiveSeed(
  token: string,
  appointmentId: string,
  specialty: string | null,
): Promise<DefaultLayout> {
  try {
    const apptRes = await getAppointmentById(appointmentId, token);
    return resolveDefaultLayout({
      modality: apptRes.data.appointment.consultation_type ?? null,
      specialty,
    });
  } catch {
    return resolveDefaultLayout({ modality: null, specialty });
  }
}

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
  /** Doctor default section order from settings; `null` until the first fetch resolves. */
  subjectiveSectionOrder: SubjectiveSectionId[] | null;
  setSubjectiveSectionOrder: React.Dispatch<
    React.SetStateAction<SubjectiveSectionId[] | null>
  >;
  /** Doctor default section collapse overrides; `null` until the first fetch resolves. */
  subjectiveSectionCollapsed: SubjectiveSectionCollapseMap | null;
  setSubjectiveSectionCollapsed: React.Dispatch<
    React.SetStateAction<SubjectiveSectionCollapseMap | null>
  >;
  /** Doctor default hidden section set; `null` until the first fetch resolves. */
  subjectiveSectionHidden: SubjectiveSectionHiddenSet | null;
  setSubjectiveSectionHidden: React.Dispatch<
    React.SetStateAction<SubjectiveSectionHiddenSet | null>
  >;
  /**
   * obj-10: doctor default Objective-tab layout config; `null` until the first
   * fetch resolves. No consumer yet — obj-11/12 read this through the shell.
   */
  objectiveDefaults: DoctorObjectiveDefaults | null;
  setObjectiveDefaults: React.Dispatch<
    React.SetStateAction<DoctorObjectiveDefaults | null>
  >;
  /**
   * obj-14 (OBJ-D6): modality/specialty default-layout seed for the Objective
   * tab. View-only (never persisted, never reaches `buildRxPayload`); a doctor
   * override always wins over it. Optional so the shell can be constructed
   * without it (consumers fall back to the registry default).
   */
  objectiveSeed?: DefaultLayout | null;
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
  const [subjectiveSectionOrder, setSubjectiveSectionOrder] =
    useState<SubjectiveSectionId[] | null>(null);
  const [subjectiveSectionCollapsed, setSubjectiveSectionCollapsed] =
    useState<SubjectiveSectionCollapseMap | null>(null);
  const [subjectiveSectionHidden, setSubjectiveSectionHidden] =
    useState<SubjectiveSectionHiddenSet | null>(null);
  const [objectiveDefaults, setObjectiveDefaults] =
    useState<DoctorObjectiveDefaults | null>(null);
  const [objectiveSeed, setObjectiveSeed] = useState<DefaultLayout | null>(null);

  useEffect(() => {
    if (disabled || !token) return;
    let cancelled = false;
    void (async () => {
      const defaults = await loadDoctorSubjectiveDefaults(token);
      if (cancelled) return;
      setSubjectiveSectionOrder(defaults.sectionOrder);
      setSubjectiveSectionCollapsed(defaults.sectionCollapsed);
      setSubjectiveSectionHidden(defaults.sectionHidden);
      setObjectiveDefaults(defaults.objective);
      // obj-14: compute the view-only modality/specialty seed for the Objective tab.
      const seed = await loadObjectiveSeed(token, appointmentId, defaults.specialty);
      if (!cancelled) setObjectiveSeed(seed);
    })();
    return () => {
      cancelled = true;
    };
  }, [disabled, token, appointmentId]);

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
          const fields = createEmptyRxFormFields();
          try {
            const defaults = await loadDoctorSubjectiveDefaults(token);
            setSubjectiveSectionOrder(defaults.sectionOrder);
            setSubjectiveSectionCollapsed(defaults.sectionCollapsed);
            setSubjectiveSectionHidden(defaults.sectionHidden);
            setObjectiveDefaults(defaults.objective);
            if (defaults.customSubsections.length > 0) {
              fields.customSubsections = seedCustomSubsectionsFromDefault(defaults.customSubsections);
              fields.customSubsectionsText = serializeCustomSubsections(fields.customSubsections);
            }
            if (defaults.objective.customSections.length > 0) {
              // obj-13: seed per-visit objective custom sections from the doctor default.
              fields.objectiveCustomSections = seedCustomSubsectionsFromDefault(
                defaults.objective.customSections,
              );
            }
          } catch {
            // Non-fatal — fresh visit still opens with empty custom subsections.
          }
          setInitialFields(fields);
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
    subjectiveSectionOrder,
    setSubjectiveSectionOrder,
    subjectiveSectionCollapsed,
    setSubjectiveSectionCollapsed,
    subjectiveSectionHidden,
    setSubjectiveSectionHidden,
    objectiveDefaults,
    setObjectiveDefaults,
    objectiveSeed,
    providerProps,
  };
}
