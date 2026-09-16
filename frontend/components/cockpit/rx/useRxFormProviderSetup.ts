"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  listPrescriptionsByAppointment,
  getAppointmentById,
} from "@/lib/api";
import { deskVitalsQueryOptions } from "@/lib/cockpit/desk-vitals-query";
/** Hydrate-time seed — merge lands via `setInitialFields` / RESET, not setField. */
import { mergeDeskVitalsIntoFields } from "@/lib/cockpit/desk-vitals-seed";
import {
  getDoctorSettingsShared,
  peekDoctorSettingsShared,
} from "@/lib/api/doctor-settings-shared";
import type { DoctorSettingsData } from "@/lib/api";
import {
  resolveDefaultLayout,
  type DefaultLayout,
} from "@/lib/cockpit/objective-default-layout";
import type { AppointmentStatus } from "@/types/appointment";
import type { PrescriptionWithRelations, PrescriptionType } from "@/types/prescription";
import {
  createEmptyRxFormFields,
  medicinesFromPrescription,
  rxFormFieldsFromPrescription,
  type RxFormFields,
  type RxFormProviderProps,
} from "@/components/cockpit/rx/RxFormContext";
import {
  applySubjectiveCarrySeed,
  closedSiblingFromSource,
  resolveRxLoadDecision,
  type ClosedSiblingRef,
} from "@/components/cockpit/rx/rxLoadDecision";
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
  timezone: string;
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
    timezone: settings.timezone?.trim() || "Asia/Kolkata",
  };
}

function applyDoctorCustomSeeds(
  fields: RxFormFields,
  defaults: DoctorLayoutDefaultsBundle,
): void {
  if (defaults.customSubsections.length > 0 && fields.customSubsections.length === 0) {
    fields.customSubsections = seedCustomSubsectionsFromDefault(
      defaults.customSubsections,
    );
    fields.customSubsectionsText = serializeCustomSubsections(
      fields.customSubsections,
    );
  }
  if (defaults.objective.customSections.length > 0) {
    fields.objectiveCustomSections = seedCustomSubsectionsFromDefault(
      defaults.objective.customSections,
    );
  }
  if (defaults.assessment.customSections.length > 0) {
    fields.assessmentCustomSections = seedCustomSubsectionsFromDefault(
      defaults.assessment.customSections,
    );
  }
  if (defaults.plan.customSections.length > 0) {
    fields.planCustomSections = seedCustomSubsectionsFromDefault(
      defaults.plan.customSections,
    );
  }
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
      timezone: "Asia/Kolkata",
    };
  }
}

type AppointmentLoadContext = {
  consultationType: string | null;
  status: AppointmentStatus | null;
};

async function loadAppointmentContext(
  token: string,
  appointmentId: string,
): Promise<AppointmentLoadContext> {
  try {
    const apptRes = await getAppointmentById(appointmentId, token);
    return {
      consultationType: apptRes.data.appointment.consultation_type ?? null,
      status: apptRes.data.appointment.status ?? null,
    };
  } catch {
    return { consultationType: null, status: null };
  }
}

export interface UseRxFormProviderSetupArgs {
  appointmentId: string;
  patientId: string | null;
  token: string;
  existingPrescription?: PrescriptionWithRelations | null;
  /** When true, skip fetch/bootstrap (cockpit shell owns setup via context). */
  disabled?: boolean;
  /**
   * Modality + status the caller already holds (the cockpit route fetches the
   * appointment server-side). Supplying it drops two `GET /appointments/:id`
   * round-trips from every patient switch — they were the doctor's wait before
   * the form accepted typing. Read once per appointment, like the fetch it
   * replaces, so a later status flip cannot re-decide an open note.
   */
  appointmentContext?: AppointmentLoadContext | null;
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
   * rxl-07 / rxl-24 — `false` for a draft or today's issued slip; `true` when
   * reviewing a later-day or superseded note. `undefined` only during the
   * first load. Drives {@link RxLockProvider}.
   */
  noteClosed?: boolean;
  /** Closed newest note when the form started a continuation. Discoverable for rxl-09. */
  closedSibling?: ClosedSiblingRef | null;
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
  appointmentContext,
}: UseRxFormProviderSetupArgs): RxFormProviderSetup {
  const queryClient = useQueryClient();
  const tokenRef = useRef(token);
  tokenRef.current = token;
  const appointmentContextRef = useRef(appointmentContext ?? null);
  appointmentContextRef.current = appointmentContext ?? null;
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
  const [noteClosed, setNoteClosed] = useState<boolean | undefined>(undefined);
  const [closedSibling, setClosedSibling] = useState<ClosedSiblingRef | null>(
    null,
  );
  const settingsWarmRef = useRef(false);

  // Kick the shared settings fetch once on first render so cold open overlaps
  // with the rest of the page mount (useEffect still applies results to state).
  if (!disabled && token && !settingsWarmRef.current) {
    settingsWarmRef.current = true;
    void getDoctorSettingsShared(token);
  }

  const loadDeskVitals = useCallback(async () => {
    try {
      return await queryClient.fetchQuery(
        deskVitalsQueryOptions(tokenRef.current, appointmentId),
      );
    } catch {
      return { ghost: null, note: null };
    }
  }, [appointmentId, queryClient]);

  const resolveAppointmentContext =
    useCallback(async (): Promise<AppointmentLoadContext> => {
      const supplied = appointmentContextRef.current;
      if (supplied) return supplied;
      return loadAppointmentContext(tokenRef.current, appointmentId);
    }, [appointmentId]);

  useEffect(() => {
    if (disabled || !tokenRef.current) return;
    let cancelled = false;
    void (async () => {
      // Settings + appointment modality in parallel — seed only needs specialty
      // from settings after both settle (avoids a second appointment round-trip).
      const [defaults, appt] = await Promise.all([
        loadDoctorSubjectiveDefaults(tokenRef.current),
        resolveAppointmentContext(),
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
          modality: appt.consultationType,
          specialty: defaults.specialty,
        }),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [disabled, appointmentId, resolveAppointmentContext]);

  useEffect(() => {
    if (disabled) return;
    let cancelled = false;

    const applyLayoutDefaults = (defaults: DoctorLayoutDefaultsBundle) => {
      setSubjectiveSectionOrder(defaults.sectionOrder);
      setSubjectiveSectionCollapsed(defaults.sectionCollapsed);
      setSubjectiveSectionHidden(defaults.sectionHidden);
      setObjectiveDefaults(defaults.objective);
      setPlanDefaults(defaults.plan);
      setAssessmentDefaults(defaults.assessment);
    };

    const adoptDraft = (
      rx: PrescriptionWithRelations,
      visitConsultationType: string | null,
      desk: Awaited<ReturnType<typeof loadDeskVitals>>,
      options?: { noteClosed?: boolean },
    ) => {
      setPrescription(rx);
      prescriptionIdRef.current = rx.id;
      setEntryMode(rx.type);
      setNoteClosed(options?.noteClosed ?? false);
      setClosedSibling(null);
      const meds = medicinesFromPrescription(rx);
      setInitialFields(
        mergeDeskVitalsIntoFields(
          rxFormFieldsFromPrescription(rx, meds, {
            consultationType: visitConsultationType,
          }),
          desk,
        ),
      );
      if ((rx.prescription_medicines ?? []).length > 0) {
        setMedicineInstanceIds(
          generateInstanceIds(rx.prescription_medicines!.length),
        );
      }
      setAttachments(rx.prescription_attachments ?? []);
    };

    const startFresh = async (
      visitConsultationType: string | null,
      desk: Awaited<ReturnType<typeof loadDeskVitals>>,
      source?: PrescriptionWithRelations,
    ) => {
      setPrescription(null);
      prescriptionIdRef.current = null;
      setEntryMode("structured");
      setAttachments([]);
      setNoteClosed(false);
      setClosedSibling(source ? closedSiblingFromSource(source) : null);
      let fields = createEmptyRxFormFields(undefined, {
        consultationType: visitConsultationType,
      });
      if (source) {
        fields = applySubjectiveCarrySeed(fields, source);
      }
      try {
        const defaults = await loadDoctorSubjectiveDefaults(tokenRef.current);
        if (cancelled) return;
        applyLayoutDefaults(defaults);
        applyDoctorCustomSeeds(fields, defaults);
      } catch {
        // Non-fatal — fresh / continuation still opens.
      }
      if (cancelled) return;
      setInitialFields(mergeDeskVitalsIntoFields(fields, desk));
    };

    const load = async () => {
      if (!initialPrescription) setLoading(true);
      try {
        const [appt, desk, listed, defaults] = await Promise.all([
          resolveAppointmentContext(),
          loadDeskVitals(),
          initialPrescription
            ? Promise.resolve(null)
            : listPrescriptionsByAppointment(tokenRef.current, appointmentId),
          loadDoctorSubjectiveDefaults(tokenRef.current),
        ]);
        if (cancelled) return;
        setConsultationType(appt.consultationType);
        const newest =
          initialPrescription ?? listed?.data.prescriptions?.[0] ?? null;
        const decision = resolveRxLoadDecision(newest, appt.status, {
          now: new Date(),
          timezone: defaults.timezone,
        });
        if (decision.kind === "adopt") {
          adoptDraft(decision.rx, appt.consultationType, desk);
        } else if (decision.kind === "review") {
          adoptDraft(decision.rx, appt.consultationType, desk, {
            noteClosed: true,
          });
        } else if (decision.kind === "continue") {
          await startFresh(appt.consultationType, desk, decision.source);
        } else {
          await startFresh(appt.consultationType, desk);
        }
      } catch {
        if (cancelled) return;
        const [appt, desk] = await Promise.all([
          resolveAppointmentContext(),
          loadDeskVitals(),
        ]);
        if (cancelled) return;
        setConsultationType(appt.consultationType);
        setNoteClosed(false);
        setClosedSibling(null);
        setInitialFields(
          mergeDeskVitalsIntoFields(
            createEmptyRxFormFields(undefined, {
              consultationType: appt.consultationType,
            }),
            desk,
          ),
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [
    appointmentId,
    initialPrescription,
    generateInstanceIds,
    disabled,
    loadDeskVitals,
    resolveAppointmentContext,
  ]);

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
    noteClosed,
    closedSibling,
    providerProps,
  };
}
