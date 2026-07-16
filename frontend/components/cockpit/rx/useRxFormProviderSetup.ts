"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  listPrescriptionsByAppointment,
  getAppointmentById,
} from "@/lib/api";
import {
  getDoctorSettingsShared,
  peekDoctorSettingsShared,
} from "@/lib/api/doctor-settings-shared";
import type { DoctorSettingsData } from "@/lib/api";
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
import type { PlanSectionId } from "@/lib/cockpit/plan-section-order";
import type { PlanSectionCollapseMap } from "@/lib/cockpit/plan-section-collapse";
import type { PlanSectionHiddenSet } from "@/lib/cockpit/plan-section-visibility";
import type { AssessmentSectionId } from "@/lib/cockpit/assessment-section-order";
import type { AssessmentSectionCollapseMap } from "@/lib/cockpit/assessment-section-collapse";
import type { AssessmentSectionHiddenSet } from "@/lib/cockpit/assessment-section-visibility";

/** obj-10: doctor default Objective-tab layout config (no consumer yet — obj-11/12 consume). */
export interface DoctorObjectiveDefaults {
  sectionOrder: ObjectiveSectionId[];
  sectionCollapsed: Record<string, boolean>;
  sectionHidden: ObjectiveSectionId[];
  customSections: import("@/types/prescription").CustomSubsection[];
}

/** Doctor default Plan-tab layout (order / collapse / hidden). */
export interface DoctorPlanDefaults {
  sectionOrder: PlanSectionId[];
  sectionCollapsed: PlanSectionCollapseMap;
  sectionHidden: PlanSectionHiddenSet;
  /** assessment-plan-custom-sections: per-doctor default custom Plan sections. */
  customSections: import("@/types/prescription").CustomSubsection[];
}

/** Doctor default Assessment-tab layout (order / collapse / hidden). */
export interface DoctorAssessmentDefaults {
  sectionOrder: AssessmentSectionId[];
  sectionCollapsed: AssessmentSectionCollapseMap;
  sectionHidden: AssessmentSectionHiddenSet;
  /** assessment-plan-custom-sections: per-doctor default custom Assessment sections. */
  customSections: import("@/types/prescription").CustomSubsection[];
}

const EMPTY_OBJECTIVE_DEFAULTS: DoctorObjectiveDefaults = {
  sectionOrder: [],
  sectionCollapsed: {},
  sectionHidden: [],
  customSections: [],
};

const EMPTY_PLAN_DEFAULTS: DoctorPlanDefaults = {
  sectionOrder: [],
  sectionCollapsed: {},
  sectionHidden: [],
  customSections: [],
};

const EMPTY_ASSESSMENT_DEFAULTS: DoctorAssessmentDefaults = {
  sectionOrder: [],
  sectionCollapsed: {},
  sectionHidden: [],
  customSections: [],
};

type DoctorLayoutDefaultsBundle = {
  customSubsections: import("@/types/prescription").CustomSubsection[];
  sectionOrder: SubjectiveSectionId[];
  sectionCollapsed: SubjectiveSectionCollapseMap;
  sectionHidden: SubjectiveSectionHiddenSet;
  objective: DoctorObjectiveDefaults;
  plan: DoctorPlanDefaults;
  assessment: DoctorAssessmentDefaults;
  specialty: string | null;
};

function doctorLayoutDefaultsFromSettings(
  settings: DoctorSettingsData["settings"],
): DoctorLayoutDefaultsBundle {
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
    plan: {
      sectionOrder: (settings.plan_section_order ?? []) as PlanSectionId[],
      sectionCollapsed: settings.plan_section_collapsed ?? {},
      sectionHidden: (settings.plan_section_hidden ?? []) as PlanSectionHiddenSet,
      customSections: settings.plan_custom_sections ?? [],
    },
    assessment: {
      sectionOrder: (settings.assessment_section_order ??
        []) as AssessmentSectionId[],
      sectionCollapsed: settings.assessment_section_collapsed ?? {},
      sectionHidden: (settings.assessment_section_hidden ??
        []) as AssessmentSectionHiddenSet,
      customSections: settings.assessment_custom_sections ?? [],
    },
    specialty: settings.specialty ?? null,
  };
}

async function loadDoctorSubjectiveDefaults(
  token: string,
): Promise<DoctorLayoutDefaultsBundle> {
  try {
    const settingsRes = await getDoctorSettingsShared(token);
    return doctorLayoutDefaultsFromSettings(settingsRes.data.settings);
  } catch {
    return {
      customSubsections: [],
      sectionOrder: [],
      sectionCollapsed: {},
      sectionHidden: [],
      objective: EMPTY_OBJECTIVE_DEFAULTS,
      plan: EMPTY_PLAN_DEFAULTS,
      assessment: EMPTY_ASSESSMENT_DEFAULTS,
      specialty: null,
    };
  }
}

async function loadConsultationType(
  token: string,
  appointmentId: string,
): Promise<string | null> {
  try {
    const apptRes = await getAppointmentById(appointmentId, token);
    return apptRes.data.appointment.consultation_type ?? null;
  } catch {
    return null;
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
   * Doctor default Plan-tab layout; `null` until the first fetch resolves.
   * PlanSection prefers this over a standalone settings fetch when present.
   */
  planDefaults: DoctorPlanDefaults | null;
  setPlanDefaults: React.Dispatch<
    React.SetStateAction<DoctorPlanDefaults | null>
  >;
  /**
   * Doctor default Assessment-tab layout; `null` until the first fetch resolves.
   * AssessmentSection prefers this over a standalone settings fetch when present.
   */
  assessmentDefaults: DoctorAssessmentDefaults | null;
  setAssessmentDefaults: React.Dispatch<
    React.SetStateAction<DoctorAssessmentDefaults | null>
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
   * empty fields and `autosaveEnabled: false`, then soft-`RESET` when the
   * draft resolves (via `initialFields` identity change). A stable `key` keeps
   * the provider (and siblings like PatientRibbon) mounted so chart fetches
   * are not replayed.
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

  // One-shot peek: if profile override (or a prior mount) already filled the
  // shared cache, SOAP tabs paint the doctor order on first frame.
  const [layoutSeed] = useState<DoctorLayoutDefaultsBundle | null>(() => {
    if (disabled) return null;
    const hit = peekDoctorSettingsShared(token);
    return hit ? doctorLayoutDefaultsFromSettings(hit.data.settings) : null;
  });

  const [subjectiveSectionOrder, setSubjectiveSectionOrder] =
    useState<SubjectiveSectionId[] | null>(layoutSeed?.sectionOrder ?? null);
  const [subjectiveSectionCollapsed, setSubjectiveSectionCollapsed] =
    useState<SubjectiveSectionCollapseMap | null>(
      layoutSeed?.sectionCollapsed ?? null,
    );
  const [subjectiveSectionHidden, setSubjectiveSectionHidden] =
    useState<SubjectiveSectionHiddenSet | null>(layoutSeed?.sectionHidden ?? null);
  const [objectiveDefaults, setObjectiveDefaults] =
    useState<DoctorObjectiveDefaults | null>(layoutSeed?.objective ?? null);
  const [planDefaults, setPlanDefaults] = useState<DoctorPlanDefaults | null>(
    layoutSeed?.plan ?? null,
  );
  const [assessmentDefaults, setAssessmentDefaults] =
    useState<DoctorAssessmentDefaults | null>(layoutSeed?.assessment ?? null);
  const [objectiveSeed, setObjectiveSeed] = useState<DefaultLayout | null>(null);
  const [consultationType, setConsultationType] = useState<string | null>(null);
  const settingsWarmRef = useRef(false);

  // Kick the shared settings fetch once on first render so cold open overlaps
  // with the rest of the page mount (useEffect still applies results to state).
  if (!disabled && token && !settingsWarmRef.current) {
    settingsWarmRef.current = true;
    void getDoctorSettingsShared(token);
  }

  useEffect(() => {
    if (disabled || !token) return;
    let cancelled = false;
    void (async () => {
      // Settings + appointment modality in parallel — seed only needs specialty
      // from settings after both settle (avoids a second appointment round-trip).
      const [defaults, modality] = await Promise.all([
        loadDoctorSubjectiveDefaults(token),
        loadConsultationType(token, appointmentId),
      ]);
      if (cancelled) return;
      setSubjectiveSectionOrder(defaults.sectionOrder);
      setSubjectiveSectionCollapsed(defaults.sectionCollapsed);
      setSubjectiveSectionHidden(defaults.sectionHidden);
      setObjectiveDefaults(defaults.objective);
      setPlanDefaults(defaults.plan);
      setAssessmentDefaults(defaults.assessment);
      setObjectiveSeed(
        resolveDefaultLayout({
          modality,
          specialty: defaults.specialty,
        }),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [disabled, token, appointmentId]);

  useEffect(() => {
    if (disabled) return;
    if (initialPrescription) {
      let cancelled = false;
      void (async () => {
        const consultationType = await loadConsultationType(token, appointmentId);
        if (cancelled) return;
        setConsultationType(consultationType);
        setPrescription(initialPrescription);
        prescriptionIdRef.current = initialPrescription.id;
        setEntryMode(initialPrescription.type);
        const meds = medicinesFromPrescription(initialPrescription);
        setInitialFields(
          rxFormFieldsFromPrescription(initialPrescription, meds, { consultationType }),
        );
        if ((initialPrescription.prescription_medicines ?? []).length > 0) {
          setMedicineInstanceIds(
            generateInstanceIds(initialPrescription.prescription_medicines!.length),
          );
        }
        setAttachments(initialPrescription.prescription_attachments ?? []);
        setLoading(false);
      })();
      return () => {
        cancelled = true;
      };
    }
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const [consultationType, res] = await Promise.all([
          loadConsultationType(token, appointmentId),
          listPrescriptionsByAppointment(token, appointmentId),
        ]);
        if (cancelled) return;
        setConsultationType(consultationType);
        const list = res.data.prescriptions ?? [];
        if (list.length > 0) {
          const latest = list[0];
          setPrescription(latest);
          prescriptionIdRef.current = latest.id;
          setEntryMode(latest.type);
          const meds = medicinesFromPrescription(latest);
          setInitialFields(
            rxFormFieldsFromPrescription(latest, meds, { consultationType }),
          );
          if ((latest.prescription_medicines ?? []).length > 0) {
            setMedicineInstanceIds(
              generateInstanceIds(latest.prescription_medicines!.length),
            );
          }
          setAttachments(latest.prescription_attachments ?? []);
        } else {
          const fields = createEmptyRxFormFields(undefined, { consultationType });
          try {
            // Hits shared settings cache when the defaults effect already ran.
            const defaults = await loadDoctorSubjectiveDefaults(token);
            setSubjectiveSectionOrder(defaults.sectionOrder);
            setSubjectiveSectionCollapsed(defaults.sectionCollapsed);
            setSubjectiveSectionHidden(defaults.sectionHidden);
            setObjectiveDefaults(defaults.objective);
            setPlanDefaults(defaults.plan);
            setAssessmentDefaults(defaults.assessment);
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
            if (defaults.assessment.customSections.length > 0) {
              // assessment-plan-custom-sections: seed per-visit assessment sections.
              fields.assessmentCustomSections = seedCustomSubsectionsFromDefault(
                defaults.assessment.customSections,
              );
            }
            if (defaults.plan.customSections.length > 0) {
              // assessment-plan-custom-sections: seed per-visit plan sections.
              fields.planCustomSections = seedCustomSubsectionsFromDefault(
                defaults.plan.customSections,
              );
            }
          } catch {
            // Non-fatal — fresh visit still opens with empty custom subsections.
          }
          setInitialFields(fields);
        }
      } catch {
        if (!cancelled) {
          const consultationType = await loadConsultationType(token, appointmentId);
          if (!cancelled) {
            setConsultationType(consultationType);
            setInitialFields(createEmptyRxFormFields(undefined, { consultationType }));
          }
        }
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
  // provider empty fields with `autosaveEnabled: false`. When the draft
  // resolves, `initialFields` changes and `RxFormProvider` soft-`RESET`s —
  // keep `key` stable on `appointmentId` so PatientRibbon / chart panes are
  // not unmounted (that remount was replaying ribbon skeletons on every load).
  const providerProps: Omit<RxFormProviderProps, "children"> & { key: string } = {
    key: appointmentId,
    appointmentId,
    patientId,
    token,
    entryMode,
    initialFields: initialFields ?? emptyInitialFields,
    consultationType,
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
    planDefaults,
    setPlanDefaults,
    assessmentDefaults,
    setAssessmentDefaults,
    objectiveSeed,
    providerProps,
  };
}
