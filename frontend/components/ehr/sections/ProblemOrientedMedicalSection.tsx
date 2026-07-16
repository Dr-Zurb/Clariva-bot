"use client";

/**
 * Problem-oriented medical history — substance-style condition cards,
 * additional medications, add-at-top flow.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState, type RefObject } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RX_FIELD_INPUT_CLASS } from "@/components/cockpit/rx/sections/field-styles";
import { queryKeys } from "@/lib/query/keys";
import { STALE } from "@/lib/query/stale";
import {
  invalidatePatientConditions,
  type InvalidatePatientConditionsOptions,
} from "@/lib/query/invalidate";
import { ConditionCard, conditionMedCaptureInputId } from "@/components/ehr/chart/ConditionCard";
import type { ConditionTimingValue } from "@/components/ehr/chart/ConditionTimingField";
import { HistorySubsection } from "@/components/ehr/chart/HistorySubsection";
import { ChartMedicationCard } from "@/components/ehr/chart/ChartMedicationCard";
import { ChartMedicationCaptureBar } from "@/components/ehr/chart/ChartMedicationCaptureBar";
import { useChartMedDuplicateNotice } from "@/components/ehr/chart/useChartMedDuplicateNotice";
import { countActivePast } from "@/components/ehr/chart/ChartPillToggle";
import { ChartQuickAddChips } from "@/components/ehr/chart/ChartQuickAddChips";
import {
  DiagnosisAutocomplete,
  type DiagnosisCommitPayload,
} from "@/components/cockpit/rx/inputs/DiagnosisAutocomplete";
import {
  ADDITIONAL_MEDICATIONS_SECTION_ID,
} from "@/lib/chart/chart-medication-scroll";
import {
  isDuplicateCondition,
  normalizeConditionKey,
  PMH_ICD_SHORTCUTS,
} from "@/lib/chart/pmh-icd-shortcuts";
import {
  type ChartMedicationPatch,
  chartMedPatchToApiPayload,
  chartMedPatchToLocalPatch,
  findDuplicateMedication,
} from "@/lib/chart/chart-medication";
import { useStableMedKey } from "@/lib/chart/use-stable-med-key";
import {
  formatApplySummary,
  pmhHasContent,
  pmhMedToCreatePayload,
  snapshotPmh,
  usePmhTemplateApply,
  type ApplyRowResult,
} from "@/lib/chart/use-pmh-template-apply";
import {
  type SectionTemplateControlsBinding,
} from "@/components/cockpit/rx/subjective/SubjectiveSectionTemplateButton";
import {
  useRegisterPmhTemplateBridge,
  type PmhTemplateBridge,
} from "@/components/cockpit/rx/subjective/SubjectivePresetButton";
import {
  archivePatientCondition,
  archivePatientMedication,
  createPatientCondition,
  createPatientMedication,
  getPatientMedicalBackground,
  updatePatientCondition,
  updatePatientMedicalBackgroundNotes,
  updatePatientMedication,
} from "@/lib/api";
import type {
  ConditionWithMedications,
  CreatePatientMedicationPayload,
  MedicalBackgroundGrouped,
  PatientChartLayout,
  PatientChartMode,
  PatientChronicCondition,
  PatientConditionAgoUnit,
  PatientConditionStatus,
  PatientMedication,
} from "@/types/patient-chart";

interface ProblemOrientedMedicalSectionProps {
  patientId: string;
  token: string;
  layout: PatientChartLayout;
  mode: PatientChartMode;
  /** Header-mounted template controls read live bindings from this ref. */
  templateControlsRef?: RefObject<SectionTemplateControlsBinding | null>;
  onTemplateControlsReadyChange?: (ready: boolean) => void;
  onStatusCountsChange?: (counts: {
    conditionActive: number;
    conditionPast: number;
    medActive: number;
    medPast: number;
    hasSectionNotes: boolean;
  }) => void;
}

function normalizeKey(value: string): string {
  return normalizeConditionKey(value);
}

function normalizeCondition(row: ConditionWithMedications): ConditionWithMedications {
  return {
    ...row,
    status: row.status ?? "active",
    diagnosed_ago_value: row.diagnosed_ago_value ?? null,
    diagnosed_ago_unit: row.diagnosed_ago_unit ?? null,
    resolved_ago_value: row.resolved_ago_value ?? null,
    resolved_ago_unit: row.resolved_ago_unit ?? null,
    on_treatment: row.on_treatment ?? null,
    acuity: row.acuity ?? null,
    code: row.code ?? null,
    code_title: row.code_title ?? null,
  };
}

/** Stable newest-first order by created_at — Active↔Past must not jump the card. */
function sortConditionCards(conditions: ConditionWithMedications[]): ConditionWithMedications[] {
  return [...conditions].sort((a, b) =>
    String(b.created_at).localeCompare(String(a.created_at)),
  );
}

function allMedications(background: MedicalBackgroundGrouped): PatientMedication[] {
  const byId = new Map<string, PatientMedication>();
  for (const c of background.conditions) {
    for (const m of c.medications) byId.set(m.id, m);
  }
  for (const m of background.unlinkedMedications) byId.set(m.id, m);
  return Array.from(byId.values());
}

interface BackgroundCounts {
  conditionActive: number;
  conditionPast: number;
  medActive: number;
  medPast: number;
  hasSectionNotes: boolean;
}

function computeBackgroundCounts(background: MedicalBackgroundGrouped): BackgroundCounts {
  const condCounts = countActivePast(
    background.conditions.map((c) => ({ status: c.status ?? "active" })),
  );
  const meds = allMedications(background);
  const medCounts = countActivePast(meds.map((m) => ({ status: m.status })));
  return {
    conditionActive: condCounts.active,
    conditionPast: condCounts.past,
    medActive: medCounts.active,
    medPast: medCounts.past,
    hasSectionNotes: !!background.notes?.trim(),
  };
}

/** Full PatientMedication shaped from a create payload for instant optimistic render. */
function buildOptimisticMedication(
  tempId: string,
  patientId: string,
  payload: CreatePatientMedicationPayload,
): PatientMedication {
  const now = new Date().toISOString();
  return {
    id: tempId,
    doctor_id: "",
    patient_id: patientId,
    drug_name: payload.drugName.trim(),
    dose: payload.dose ?? payload.strength ?? null,
    frequency: payload.frequency ?? null,
    status: payload.status ?? "active",
    intake_pattern: payload.intakePattern ?? null,
    source: payload.source ?? null,
    started_on: null,
    stopped_on: null,
    note: payload.note ?? null,
    archived_at: null,
    created_at: now,
    updated_at: now,
    strength: payload.strength ?? payload.dose ?? null,
    dose_qty: payload.doseQty ?? null,
    dose_unit: payload.doseUnit ?? null,
    frequency_code: payload.frequencyCode ?? null,
    form: payload.form ?? null,
    drug_master_id: payload.drugMasterId ?? null,
    stopped_ago_value: payload.stoppedAgoValue ?? null,
    stopped_ago_unit: payload.stoppedAgoUnit ?? null,
    started_ago_value: payload.startedAgoValue ?? null,
    started_ago_unit: payload.startedAgoUnit ?? null,
    stop_reason: payload.stopReason ?? null,
    dose_schedule: payload.doseSchedule ?? null,
    strength_value: payload.strengthValue ?? null,
    strength_unit: payload.strengthUnit ?? null,
    strength_components: payload.strengthComponents ?? null,
    food_timing: payload.foodTiming ?? null,
  };
}

function timingToPayload(timing: ConditionTimingValue) {
  return {
    diagnosedOn: null,
    diagnosedAgoValue: timing.agoValue,
    diagnosedAgoUnit: timing.agoUnit,
  };
}

type ConditionUpdatePayload = Parameters<typeof updatePatientCondition>[3];
type MedicationUpdatePayload = Parameters<typeof updatePatientMedication>[3];

const FIELD_SAVE_DEBOUNCE_MS = 400;

const PMH_SECTION_NOTES_MAX = 2000;
const PMH_SECTION_NOTES_PLACEHOLDER =
  "e.g. Prior hospitalizations abroad, undocumented conditions, context not captured above";

/** Capture-bar input id for the "Additional medications" block (refocus target). */
const ADDITIONAL_MED_CAPTURE_INPUT_ID = "additional-med-capture";

function medCaptureInputIdFor(target: string | "additional"): string {
  return target === "additional"
    ? ADDITIONAL_MED_CAPTURE_INPUT_ID
    : conditionMedCaptureInputId(target);
}

function payloadToConditionPatch(payload: ConditionUpdatePayload): Partial<PatientChronicCondition> {
  return {
    ...(payload.diagnosedOn !== undefined ? { diagnosed_on: payload.diagnosedOn ?? null } : {}),
    ...(payload.diagnosedAgoValue !== undefined
      ? { diagnosed_ago_value: payload.diagnosedAgoValue ?? null }
      : {}),
    ...(payload.diagnosedAgoUnit !== undefined
      ? { diagnosed_ago_unit: payload.diagnosedAgoUnit ?? null }
      : {}),
    ...(payload.resolvedAgoValue !== undefined
      ? { resolved_ago_value: payload.resolvedAgoValue ?? null }
      : {}),
    ...(payload.resolvedAgoUnit !== undefined
      ? { resolved_ago_unit: payload.resolvedAgoUnit ?? null }
      : {}),
    ...(payload.onTreatment !== undefined ? { on_treatment: payload.onTreatment ?? null } : {}),
    ...(payload.note !== undefined ? { note: payload.note ?? null } : {}),
    ...(payload.status !== undefined ? { status: payload.status } : {}),
  };
}

function payloadToMedicationPatch(payload: MedicationUpdatePayload): Partial<PatientMedication> {
  return chartMedPatchToLocalPatch(payload as ChartMedicationPatch);
}

export default function ProblemOrientedMedicalSection({
  patientId,
  token,
  layout: _layout,
  mode,
  templateControlsRef,
  onTemplateControlsReadyChange,
  onStatusCountsChange,
}: ProblemOrientedMedicalSectionProps) {
  const conditionInputId = useId();
  const { stableKey, linkRealId } = useStableMedKey();
  const queryClient = useQueryClient();
  const bgKey = useMemo(
    () => queryKeys.patient(patientId).medicalBackground(),
    [patientId],
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [templateNotice, setTemplateNotice] = useState<string | null>(null);
  const [conditionCapture, setConditionCapture] = useState("");

  const conditionSaveTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const conditionPendingPayloadRef = useRef<Map<string, ConditionUpdatePayload>>(new Map());
  const medicationSaveTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const medicationPendingPayloadRef = useRef<Map<string, MedicationUpdatePayload>>(new Map());
  const sectionNotesTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSectionNotesRef = useRef<string | null | undefined>(undefined);
  const creatingConditionsRef = useRef(new Set<string>());
  const lastReportedCountsRef = useRef<string | null>(null);

  const readonly = mode === "readonly";
  const registerPmhBridge = useRegisterPmhTemplateBridge();
  const { notifyDuplicate, noticePortal } = useChartMedDuplicateNotice();

  // PMH conditions + meds live in the shared query cache, so a chronic-condition
  // write here and a write in the Assessment "Known conditions" zone (which reads
  // the same conditions) refresh each other with no manual page reload.
  const backgroundQuery = useQuery({
    queryKey: bgKey,
    queryFn: async (): Promise<MedicalBackgroundGrouped> => {
      const res = await getPatientMedicalBackground(token, patientId);
      const data = res.data.medicalBackground;
      return {
        ...data,
        conditions: data.conditions.map((c) => normalizeCondition(c)),
        notes: data.notes ?? null,
      };
    },
    enabled: Boolean(token) && Boolean(patientId),
    staleTime: STALE.CLINICAL,
  });

  const background = backgroundQuery.data ?? null;
  const loadError =
    backgroundQuery.isError && !background
      ? backgroundQuery.error instanceof Error
        ? backgroundQuery.error.message
        : "Failed to load medical background"
      : null;

  // Optimistic writes go straight to the query cache (mirrors the old
  // setState(prev => next) API so the mutation handlers below are unchanged).
  const setBackground = useCallback(
    (
      update:
        | MedicalBackgroundGrouped
        | null
        | ((
            prev: MedicalBackgroundGrouped | null,
          ) => MedicalBackgroundGrouped | null),
    ) => {
      queryClient.setQueryData<MedicalBackgroundGrouped | null>(bgKey, (prev) =>
        typeof update === "function" ? update(prev ?? null) : update,
      );
    },
    [bgKey, queryClient],
  );

  const reload = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: bgKey });
  }, [bgKey, queryClient]);

  // Cross-surface sync after a chronic-condition write here. Prefer
  // invalidatePatientConditions so the acting surface can skip an immediate
  // refetch (avoids the deleted-card flicker on Assessment Known conditions).
  const syncConditionSurfaces = useCallback(
    (options?: InvalidatePatientConditionsOptions) => {
      void invalidatePatientConditions(queryClient, patientId, {
        // Default: PMH already holds the optimistic medical-background cache.
        actingSurface: options?.actingSurface ?? "medicalBackground",
      });
    },
    [patientId, queryClient],
  );
  // De-duped so it fires on the initial load + external refetches without
  // re-emitting identical counts (which could loop an unmemoized parent).
  const emitCounts = useCallback(
    (bg: MedicalBackgroundGrouped) => {
      const counts = computeBackgroundCounts(bg);
      const key = JSON.stringify(counts);
      if (key === lastReportedCountsRef.current) return;
      lastReportedCountsRef.current = key;
      onStatusCountsChange?.(counts);
    },
    [onStatusCountsChange],
  );

  useEffect(() => {
    if (background) emitCounts(background);
  }, [background, emitCounts]);

  useEffect(() => {
    const conditionTimers = conditionSaveTimersRef.current;
    const medicationTimers = medicationSaveTimersRef.current;
    return () => {
      for (const timer of conditionTimers.values()) clearTimeout(timer);
      conditionTimers.clear();
      for (const timer of medicationTimers.values()) clearTimeout(timer);
      medicationTimers.clear();
      if (sectionNotesTimerRef.current) clearTimeout(sectionNotesTimerRef.current);
    };
  }, []);

  const sortedConditions = useMemo(
    () => sortConditionCards(background?.conditions ?? []),
    [background?.conditions],
  );

  const quickAddItems = useMemo(() => {
    return PMH_ICD_SHORTCUTS.filter(
      (s) => !isDuplicateCondition(sortedConditions, s.title, s.code),
    ).map((s) => ({ id: s.id, label: s.title, badge: s.code }));
  }, [sortedConditions]);

  const patchConditionInBackground = useCallback(
    (id: string, patch: Partial<PatientChronicCondition>) => {
      setBackground((prev) => {
        if (!prev) return prev;
        const next = {
          ...prev,
          conditions: prev.conditions.map((c) => (c.id === id ? { ...c, ...patch } : c)),
        };
        emitCounts(next);
        return next;
      });
    },
    [emitCounts, setBackground],
  );

  const patchMedicationInBackground = useCallback(
    (medId: string, patch: Partial<PatientMedication>) => {
      setBackground((prev) => {
        if (!prev) return prev;
        const patchMed = (m: PatientMedication) => (m.id === medId ? { ...m, ...patch } : m);
        const next: MedicalBackgroundGrouped = {
          ...prev,
          conditions: prev.conditions.map((c) => ({
            ...c,
            medications: c.medications.map(patchMed),
          })),
          unlinkedMedications: prev.unlinkedMedications.map(patchMed),
        };
        emitCounts(next);
        return next;
      });
    },
    [emitCounts, setBackground],
  );

  const flushConditionSave = useCallback(
    async (rowId: string) => {
      const payload = conditionPendingPayloadRef.current.get(rowId);
      if (!payload) return;
      conditionPendingPayloadRef.current.delete(rowId);
      setActionError(null);
      try {
        await updatePatientCondition(token, patientId, rowId, payload);
        syncConditionSurfaces();
      } catch (err) {
        void reload();
        setActionError(err instanceof Error ? err.message : "Failed to update condition");
      }
    },
    [patientId, reload, syncConditionSurfaces, token],
  );

  const scheduleConditionPatch = useCallback(
    (row: PatientChronicCondition, payload: ConditionUpdatePayload) => {
      if (row.id.startsWith("temp-")) return;
      patchConditionInBackground(row.id, payloadToConditionPatch(payload));
      const merged = { ...(conditionPendingPayloadRef.current.get(row.id) ?? {}), ...payload };
      conditionPendingPayloadRef.current.set(row.id, merged);

      const existingTimer = conditionSaveTimersRef.current.get(row.id);
      if (existingTimer) clearTimeout(existingTimer);
      conditionSaveTimersRef.current.set(
        row.id,
        setTimeout(() => {
          conditionSaveTimersRef.current.delete(row.id);
          void flushConditionSave(row.id);
        }, FIELD_SAVE_DEBOUNCE_MS),
      );
    },
    [flushConditionSave, patchConditionInBackground],
  );

  const flushPendingConditionSave = useCallback(
    async (rowId: string) => {
      const timer = conditionSaveTimersRef.current.get(rowId);
      if (timer) {
        clearTimeout(timer);
        conditionSaveTimersRef.current.delete(rowId);
      }
      await flushConditionSave(rowId);
    },
    [flushConditionSave],
  );

  const removeConditionFromBackground = useCallback(
    (conditionId: string) => {
      setBackground((prev) => {
        if (!prev) return prev;
        const removed = prev.conditions.find((c) => c.id === conditionId);
        if (!removed) return prev;
        const unlinkedIds = new Set(prev.unlinkedMedications.map((m) => m.id));
        const medsToUnlink = removed.medications.filter((m) => !unlinkedIds.has(m.id));
        const next: MedicalBackgroundGrouped = {
          ...prev,
          conditions: prev.conditions.filter((c) => c.id !== conditionId),
          unlinkedMedications: [...prev.unlinkedMedications, ...medsToUnlink],
          links: prev.links.filter((l) => l.condition_id !== conditionId),
        };
        emitCounts(next);
        return next;
      });
    },
    [emitCounts, setBackground],
  );

  const removeCondition = useCallback(
    async (condition: ConditionWithMedications) => {
      if (condition.id.startsWith("temp-")) {
        removeConditionFromBackground(condition.id);
        creatingConditionsRef.current.delete(normalizeKey(condition.condition));
        return;
      }

      setActionError(null);
      const conditionsKey = queryKeys.patient(patientId).conditions();
      // Cancel in-flight refetches so a stale medical-background / conditions
      // list can't revive the card after optimistic remove.
      await queryClient.cancelQueries({ queryKey: bgKey });
      await queryClient.cancelQueries({ queryKey: conditionsKey });
      const previousBg =
        queryClient.getQueryData<MedicalBackgroundGrouped | null>(bgKey) ?? null;
      const previousConditions =
        queryClient.getQueryData<PatientChronicCondition[]>(conditionsKey) ?? [];

      removeConditionFromBackground(condition.id);
      queryClient.setQueryData<PatientChronicCondition[]>(
        conditionsKey,
        previousConditions.filter((c) => c.id !== condition.id),
      );

      try {
        await flushPendingConditionSave(condition.id);
        await archivePatientCondition(token, patientId, condition.id);
        // Both caches were patched optimistically — don't active-refetch either
        // or the soft-delete GET can briefly revive the card on Known conditions.
        syncConditionSurfaces({ actingSurface: "all" });
      } catch (err) {
        if (previousBg) {
          queryClient.setQueryData(bgKey, previousBg);
          emitCounts(previousBg);
        } else {
          void reload();
        }
        queryClient.setQueryData(conditionsKey, previousConditions);
        setActionError(err instanceof Error ? err.message : "Failed to remove condition");
      }
    },
    [
      bgKey,
      emitCounts,
      flushPendingConditionSave,
      patientId,
      queryClient,
      reload,
      removeConditionFromBackground,
      syncConditionSurfaces,
      token,
    ],
  );

  const flushMedicationSave = useCallback(
    async (medId: string) => {
      const payload = medicationPendingPayloadRef.current.get(medId);
      if (!payload) return;
      medicationPendingPayloadRef.current.delete(medId);
      setActionError(null);
      try {
        await updatePatientMedication(token, patientId, medId, payload);
      } catch (err) {
        void reload();
        setActionError(err instanceof Error ? err.message : "Failed to update medication");
      }
    },
    [patientId, reload, token],
  );

  const scheduleMedicationPatch = useCallback(
    (row: PatientMedication, patch: ChartMedicationPatch) => {
      if (row.id.startsWith("temp-")) return;
      const payload = chartMedPatchToApiPayload(patch) as MedicationUpdatePayload;
      patchMedicationInBackground(row.id, payloadToMedicationPatch(payload));
      const merged = { ...(medicationPendingPayloadRef.current.get(row.id) ?? {}), ...payload };
      medicationPendingPayloadRef.current.set(row.id, merged);

      const existingTimer = medicationSaveTimersRef.current.get(row.id);
      if (existingTimer) clearTimeout(existingTimer);
      medicationSaveTimersRef.current.set(
        row.id,
        setTimeout(() => {
          medicationSaveTimersRef.current.delete(row.id);
          void flushMedicationSave(row.id);
        }, FIELD_SAVE_DEBOUNCE_MS),
      );
    },
    [flushMedicationSave, patchMedicationInBackground],
  );

  const flushSectionNotesSave = useCallback(async () => {
    if (pendingSectionNotesRef.current === undefined) return;
    const notes = pendingSectionNotesRef.current;
    pendingSectionNotesRef.current = undefined;
    setActionError(null);
    try {
      await updatePatientMedicalBackgroundNotes(token, patientId, {
        notes: notes.trim() ? notes.trim() : null,
      });
    } catch (err) {
      void reload();
      setActionError(
        err instanceof Error ? err.message : "Failed to save medical history notes",
      );
    }
  }, [patientId, reload, token]);

  const scheduleSectionNotesPatch = useCallback(
    (notes: string) => {
      if (readonly) return;
      setBackground((prev) => {
        if (!prev) return prev;
        const next = { ...prev, notes: notes.trim() ? notes : null };
        emitCounts(next);
        return next;
      });
      pendingSectionNotesRef.current = notes;
      if (sectionNotesTimerRef.current) clearTimeout(sectionNotesTimerRef.current);
      sectionNotesTimerRef.current = setTimeout(() => {
        sectionNotesTimerRef.current = null;
        void flushSectionNotesSave();
      }, FIELD_SAVE_DEBOUNCE_MS);
    },
    [emitCounts, flushSectionNotesSave, readonly, setBackground],
  );

  const commitCondition = useCallback(
    async (
      condition: string,
      opts?: {
        status?: PatientConditionStatus;
        note?: string | null;
        code?: string | null;
        codeTitle?: string | null;
      },
    ): Promise<ApplyRowResult> => {
      const trimmed = condition.trim();
      const code = opts?.code?.trim() || null;
      const codeTitle = opts?.codeTitle?.trim() || null;
      const key = code ? `code:${code}` : normalizeKey(trimmed);
      if (!trimmed || readonly || !background) return "duplicate";
      if (isDuplicateCondition(sortedConditions, trimmed, code)) return "duplicate";
      if (creatingConditionsRef.current.has(key)) return "duplicate";

      const status = opts?.status ?? "active";
      const note = opts?.note ?? null;

      setActionError(null);
      creatingConditionsRef.current.add(key);
      const tempId = `temp-cond-${Date.now()}`;
      const optimistic = normalizeCondition({
        id: tempId,
        doctor_id: "",
        patient_id: patientId,
        condition: trimmed,
        status,
        diagnosed_on: null,
        diagnosed_ago_value: null,
        diagnosed_ago_unit: null,
        resolved_ago_value: null,
        resolved_ago_unit: null,
        on_treatment: null,
        acuity: null,
        code,
        code_title: codeTitle,
        note,
        archived_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        medications: [],
      });
      // Cancel in-flight refetch so it can't overwrite this optimistic insert.
      await queryClient.cancelQueries({ queryKey: bgKey });
      setBackground((prev) => {
        const next = prev
          ? { ...prev, conditions: [optimistic, ...prev.conditions] }
          : { conditions: [optimistic], unlinkedMedications: [], links: [], notes: null };
        emitCounts(next);
        return next;
      });

      try {
        const res = await createPatientCondition(token, patientId, {
          condition: trimmed,
          status,
          note,
          code,
          codeTitle,
        });
        const created = normalizeCondition({ ...res.data.condition, medications: [] });
        setBackground((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            conditions: prev.conditions.map((c) => (c.id === tempId ? created : c)),
          };
        });
        setConditionCapture("");
        syncConditionSurfaces();
        return "created";
      } catch (err) {
        removeConditionFromBackground(tempId);
        setActionError(err instanceof Error ? err.message : "Failed to add condition");
        return "error";
      } finally {
        creatingConditionsRef.current.delete(key);
      }
    },
    [
      background,
      bgKey,
      emitCounts,
      patientId,
      queryClient,
      readonly,
      removeConditionFromBackground,
      setBackground,
      sortedConditions,
      syncConditionSurfaces,
      token,
    ],
  );

  const handleConditionCaptureCommit = useCallback(
    (payload: DiagnosisCommitPayload) => {
      if (payload.source === "catalog") {
        void commitCondition(payload.entry.title, {
          code: payload.entry.code,
          codeTitle: payload.entry.title,
        });
        return;
      }
      void commitCondition(payload.label);
    },
    [commitCondition],
  );

  const handleConditionQuickAdd = useCallback(
    (item: { id: string; label: string; badge?: string }) => {
      const shortcut = PMH_ICD_SHORTCUTS.find((s) => s.id === item.id);
      if (!shortcut) return;
      void commitCondition(shortcut.title, {
        code: shortcut.code,
        codeTitle: shortcut.title,
      });
    },
    [commitCondition],
  );

  const commitMedication = async (
    payload: CreatePatientMedicationPayload,
    target: string | "additional",
    opts?: { silent?: boolean },
  ): Promise<ApplyRowResult> => {
    const silent = opts?.silent ?? false;
    const trimmed = payload.drugName.trim();
    if (!trimmed || readonly) return "duplicate";

    setActionError(null);

    // Render the card instantly; the server create + reconcile happen behind it.
    const tempId = `temp-med-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    const optimistic = buildOptimisticMedication(tempId, patientId, { ...payload, drugName: trimmed });
    let added = false;
    let blockedDuplicate: { id: string; drug_name: string } | null = null;
    // Cancel any in-flight refetch so it can't overwrite this optimistic insert.
    await queryClient.cancelQueries({ queryKey: bgKey });
    setBackground((prev) => {
      if (!prev) return prev;
      const existing =
        target === "additional"
          ? prev.unlinkedMedications
          : (prev.conditions.find((c) => c.id === target)?.medications ?? []);
      const duplicate = findDuplicateMedication(existing, {
        drugName: trimmed,
        drugMasterId: payload.drugMasterId,
      });
      if (duplicate) {
        blockedDuplicate = duplicate;
        return prev;
      }
      added = true;
      let next: MedicalBackgroundGrouped;
      if (target === "additional") {
        next = { ...prev, unlinkedMedications: [optimistic, ...prev.unlinkedMedications] };
      } else {
        const tempLink: MedicalBackgroundGrouped["links"][number] = {
          id: `temp-link-${tempId}`,
          doctor_id: "",
          patient_id: patientId,
          condition_id: target,
          medication_id: tempId,
          created_at: optimistic.created_at,
        };
        next = {
          ...prev,
          conditions: prev.conditions.map((c) =>
            c.id === target
              ? { ...c, medications: [optimistic, ...c.medications] }
              : c,
          ),
          links: [tempLink, ...prev.links],
        };
      }
      emitCounts(next);
      return next;
    });

    if (!added) {
      if (blockedDuplicate && !silent) notifyDuplicate(blockedDuplicate);
      return "duplicate";
    }

    // Keep the doctor in the capture bar for the next medicine (chief-complaint
    // style). During a bulk template apply we suppress this so focus doesn't jump.
    if (!silent) {
      const focusId = medCaptureInputIdFor(target);
      requestAnimationFrame(() => document.getElementById(focusId)?.focus());
    }

    const conditionIds = target !== "additional" ? [target] : undefined;
    try {
      const res = await createPatientMedication(token, patientId, {
        ...payload,
        drugName: trimmed,
        conditionIds,
      });
      // Keep the card's React key stable across the temp → real id swap so the
      // reload below doesn't remount it (which would collapse a card the doctor
      // just opened).
      linkRealId(tempId, res.data.medication.id);
      // Reconcile real ids + link ids (the create response omits links).
      await reload();
      return "created";
    } catch (err) {
      // Roll back the optimistic card and shield it from a stale refetch.
      await queryClient.cancelQueries({ queryKey: bgKey });
      setBackground((prev) => {
        if (!prev) return prev;
        const next: MedicalBackgroundGrouped = {
          ...prev,
          conditions: prev.conditions.map((c) => ({
            ...c,
            medications: c.medications.filter((m) => m.id !== tempId),
          })),
          unlinkedMedications: prev.unlinkedMedications.filter((m) => m.id !== tempId),
          links: prev.links.filter((l) => l.medication_id !== tempId),
        };
        emitCounts(next);
        return next;
      });
      setActionError(err instanceof Error ? err.message : "Failed to add medication");
      return "error";
    }
  };

  const patchMedication = (row: PatientMedication, patch: ChartMedicationPatch) => {
    scheduleMedicationPatch(row, patch);
  };

  const archiveMedication = async (row: PatientMedication) => {
    if (row.id.startsWith("temp-")) return;
    setActionError(null);

    await queryClient.cancelQueries({ queryKey: bgKey });
    const previousBg =
      queryClient.getQueryData<MedicalBackgroundGrouped | null>(bgKey) ?? null;

    setBackground((prev) => {
      if (!prev) return prev;
      const next: MedicalBackgroundGrouped = {
        ...prev,
        conditions: prev.conditions.map((c) => ({
          ...c,
          medications: c.medications.filter((m) => m.id !== row.id),
        })),
        unlinkedMedications: prev.unlinkedMedications.filter((m) => m.id !== row.id),
        links: prev.links.filter((l) => l.medication_id !== row.id),
      };
      emitCounts(next);
      return next;
    });

    try {
      await archivePatientMedication(token, patientId, row.id);
    } catch (err) {
      if (previousBg) {
        queryClient.setQueryData(bgKey, previousBg);
        emitCounts(previousBg);
      } else {
        void reload();
      }
      setActionError(err instanceof Error ? err.message : "Failed to remove medication");
    }
  };

  const applyTemplate = usePmhTemplateApply({
    getExisting: () => ({
      conditions: (background?.conditions ?? []).map((c) => ({ condition: c.condition })),
      medications: background
        ? allMedications(background).map((m) => ({ drug_name: m.drug_name }))
        : [],
    }),
    createCondition: (c) =>
      commitCondition(c.condition, { status: c.status, note: c.note ?? null }),
    createMedication: (m) => commitMedication(pmhMedToCreatePayload(m), "additional", { silent: true }),
    reload,
    onSummary: (summary) => setTemplateNotice(formatApplySummary(summary, "items")),
  });

  const buildTemplateSave = useCallback(() => {
    if (!background || !pmhHasContent(background)) return null;
    return { scope: "past_medical" as const, pmh: snapshotPmh(background) };
  }, [background]);

  const controlsReady = !readonly && background !== null && !!templateControlsRef;

  useEffect(() => {
    if (!templateControlsRef) return;
    if (controlsReady) {
      templateControlsRef.current = {
        applyOverride: applyTemplate,
        buildSaveOverride: buildTemplateSave,
        defaultSaveName: "Medical history",
      };
    } else {
      templateControlsRef.current = null;
    }
  }, [applyTemplate, buildTemplateSave, controlsReady, templateControlsRef]);

  useEffect(() => {
    onTemplateControlsReadyChange?.(controlsReady);
    return () => onTemplateControlsReadyChange?.(false);
  }, [controlsReady, onTemplateControlsReadyChange]);

  // subj-18: expose PMH snapshot + apply to the whole-subjective Templates button.
  // Keep the latest chart state + apply fn in refs so the bridge object itself is
  // stable — registering a fresh object every render would loop setState forever.
  const backgroundRef = useRef(background);
  backgroundRef.current = background;
  const applyTemplateRef = useRef(applyTemplate);
  applyTemplateRef.current = applyTemplate;

  const clearAllChartPmh = useCallback(async () => {
    const bg = backgroundRef.current;
    if (!bg || readonly) return;

    for (const timer of conditionSaveTimersRef.current.values()) clearTimeout(timer);
    conditionSaveTimersRef.current.clear();
    conditionPendingPayloadRef.current.clear();
    for (const timer of medicationSaveTimersRef.current.values()) clearTimeout(timer);
    medicationSaveTimersRef.current.clear();
    medicationPendingPayloadRef.current.clear();
    if (sectionNotesTimerRef.current) {
      clearTimeout(sectionNotesTimerRef.current);
      sectionNotesTimerRef.current = null;
    }
    pendingSectionNotesRef.current = undefined;
    creatingConditionsRef.current.clear();

    const conditionIds = bg.conditions
      .map((c) => c.id)
      .filter((id) => !id.startsWith("temp-"));
    const medicationIds = new Set<string>();
    for (const condition of bg.conditions) {
      for (const med of condition.medications) {
        if (!med.id.startsWith("temp-")) medicationIds.add(med.id);
      }
    }
    for (const med of bg.unlinkedMedications) {
      if (!med.id.startsWith("temp-")) medicationIds.add(med.id);
    }
    const hadNotes = Boolean(bg.notes?.trim());

    await queryClient.cancelQueries({ queryKey: bgKey });
    const conditionsKey = queryKeys.patient(patientId).conditions();
    await queryClient.cancelQueries({ queryKey: conditionsKey });
    const emptied: MedicalBackgroundGrouped = {
      ...bg,
      conditions: [],
      unlinkedMedications: [],
      links: [],
      notes: null,
    };
    setBackground(emptied);
    emitCounts(emptied);
    // Keep Assessment Known in sync immediately — both caches are empty.
    queryClient.setQueryData(conditionsKey, []);
    setActionError(null);

    try {
      await Promise.all([
        ...[...medicationIds].map((id) => archivePatientMedication(token, patientId, id)),
        ...conditionIds.map((id) => archivePatientCondition(token, patientId, id)),
        ...(hadNotes
          ? [updatePatientMedicalBackgroundNotes(token, patientId, { notes: null })]
          : []),
      ]);
      if (conditionIds.length > 0) syncConditionSurfaces({ actingSurface: "all" });
    } catch (err) {
      void reload();
      setActionError(err instanceof Error ? err.message : "Failed to clear medical history");
    }
  }, [
    bgKey,
    emitCounts,
    patientId,
    queryClient,
    readonly,
    reload,
    setBackground,
    syncConditionSurfaces,
    token,
  ]);

  const clearAllChartPmhRef = useRef(clearAllChartPmh);
  clearAllChartPmhRef.current = clearAllChartPmh;

  const bridgeRef = useRef<PmhTemplateBridge>({
    snapshotForSave: () => {
      const bg = backgroundRef.current;
      return bg && pmhHasContent(bg) ? snapshotPmh(bg) : null;
    },
    hasContent: () => {
      const bg = backgroundRef.current;
      return !!bg && (pmhHasContent(bg) || Boolean(bg.notes?.trim()));
    },
    applyFromTemplate: (template, opts) => applyTemplateRef.current(template, opts),
    clearAll: () => clearAllChartPmhRef.current(),
  });

  const bridgeAvailable = !readonly && background !== null;
  useEffect(() => {
    if (!registerPmhBridge) return;
    registerPmhBridge(bridgeAvailable ? bridgeRef.current : null);
    return () => registerPmhBridge(null);
  }, [bridgeAvailable, registerPmhBridge]);

  if (background === null) {
    if (loadError) {
      return (
        <p role="alert" className="px-1 py-2 text-xs text-red-600">
          {loadError}
        </p>
      );
    }
    return <p className="px-1 py-2 text-xs text-muted-foreground">Loading medical history…</p>;
  }

  return (
    <div className="space-y-3" data-testid="problem-oriented-medical">
      {templateNotice ? (
        <p className="text-xs text-muted-foreground" role="status">
          {templateNotice}
        </p>
      ) : null}

      {(!readonly || sortedConditions.length > 0) && (
        <HistorySubsection testId="pmh-conditions" label="Conditions">
          {!readonly && (
            <div className="space-y-3">
              <DiagnosisAutocomplete
                inputId={conditionInputId}
                testId="pmh-combobox"
                value={conditionCapture}
                onChange={setConditionCapture}
                onCommit={handleConditionCaptureCommit}
                token={token}
                ariaLabel="Add past medical history condition"
                placeholder="Add condition — search ICD or type and press Enter"
              />
              <ChartQuickAddChips
                items={quickAddItems}
                groupLabel="Common conditions"
                testId="pmh-quick-add"
                onAddItem={handleConditionQuickAdd}
              />
            </div>
          )}
          {sortedConditions.length > 0 && (
            <div className="space-y-3">
              {sortedConditions.map((condition) => (
                <ConditionCard
                  key={normalizeKey(condition.condition)}
                  condition={condition}
                  readonly={readonly}
                  uiScopeKey={patientId}
                  token={token}
                  getMedKey={stableKey}
                  onStatusChange={(status) => scheduleConditionPatch(condition, { status })}
                  onRemove={() => void removeCondition(condition)}
                  onTimingChange={(timing) =>
                    scheduleConditionPatch(condition, timingToPayload(timing))
                  }
                  onResolvedAgoChange={(agoValue, agoUnit) =>
                    scheduleConditionPatch(condition, {
                      resolvedAgoValue: agoValue,
                      resolvedAgoUnit: agoUnit,
                    })
                  }
                  onNoteChange={(note) => scheduleConditionPatch(condition, { note: note || null })}
                  onCommitMedication={(payload) =>
                    void commitMedication(payload, condition.id)
                  }
                  onPatchMedication={(med, patch) => patchMedication(med, patch)}
                  onRemoveMedication={(med) => void archiveMedication(med)}
                  onLocalMedPatch={(medId, patch) => patchMedicationInBackground(medId, patch)}
                />
              ))}
            </div>
          )}
        </HistorySubsection>
      )}

      {(background.unlinkedMedications.length > 0 || !readonly) && (
        <HistorySubsection
          id={ADDITIONAL_MEDICATIONS_SECTION_ID}
          testId="additional-medications"
          label="Additional medications"
          hint="Not tied to a listed condition (symptomatic, OTC, etc.)"
        >
          {!readonly && (
            <ChartMedicationCaptureBar
              token={token}
              inputId={ADDITIONAL_MED_CAPTURE_INPUT_ID}
              placeholder="Add medication — search or type a full line and press Enter"
              onAddPayload={(payload) => void commitMedication(payload, "additional")}
            />
          )}
          {background.unlinkedMedications.map((med) => (
            <ChartMedicationCard
              key={stableKey(med.id)}
              med={med}
              readonly={readonly}
              defaultCollapsed
              token={token}
              captureInputId={ADDITIONAL_MED_CAPTURE_INPUT_ID}
              medSectionId={ADDITIONAL_MEDICATIONS_SECTION_ID}
              testIdPrefix="additional-med"
              onPatch={(patch) => {
                patchMedicationInBackground(med.id, chartMedPatchToLocalPatch(patch));
                patchMedication(med, patch);
              }}
              onRemove={() => void archiveMedication(med)}
            />
          ))}
        </HistorySubsection>
      )}

      {(!readonly || background.notes?.trim()) && (
        <HistorySubsection testId="pmh-section-notes" label="Additional notes">
          {readonly ? (
            <p className="whitespace-pre-wrap text-xs text-muted-foreground">{background.notes}</p>
          ) : (
            <textarea
              rows={2}
              defaultValue={background.notes ?? ""}
              key={`pmh-notes-${background.notes ?? ""}`}
              placeholder={PMH_SECTION_NOTES_PLACEHOLDER}
              aria-label="Past medical history additional notes"
              className={RX_FIELD_INPUT_CLASS}
              maxLength={PMH_SECTION_NOTES_MAX}
              data-testid="pmh-section-notes-input"
              onChange={(e) => scheduleSectionNotesPatch(e.target.value)}
            />
          )}
        </HistorySubsection>
      )}

      {readonly &&
        sortedConditions.length === 0 &&
        background.unlinkedMedications.length === 0 &&
        !background.notes?.trim() && (
        <p className="px-1 py-1 text-xs text-muted-foreground">No medical history recorded.</p>
      )}

      {actionError && (
        <p role="alert" className="text-xs text-red-600">
          {actionError}
        </p>
      )}
      {noticePortal}
    </div>
  );
}
