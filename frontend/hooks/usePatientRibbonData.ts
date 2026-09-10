"use client";

/**
 * usePatientRibbonData — cockpit strip chips for allergies, PMH, and chart meds.
 *
 * Reads the same TanStack Query keys as Subjective (allergies + PMH) and
 * Assessment (flat conditions), so a write in a tab or the allergies popover
 * updates the strip immediately (and the other way around).
 */

import { useMemo } from "react";
import { usePatientAllergiesQuery } from "@/hooks/queries/usePatientAllergiesQuery";
import { usePatientConditionsQuery } from "@/hooks/queries/usePatientConditionsQuery";
import { usePatientMedicalBackgroundQuery } from "@/hooks/queries/usePatientMedicalBackgroundQuery";
import type {
  MedicalBackgroundGrouped,
  PatientAllergy,
  PatientChronicCondition,
  PatientMedication,
} from "@/types/patient-chart";

export interface RibbonAllergyChip {
  id: string;
  name: string;
  reaction?: string | null;
  severity?: "mild" | "moderate" | "severe" | null;
}

export interface RibbonChronicChip {
  id: string;
  name: string;
  /** ISO date or display label. */
  since?: string | null;
}

/** Active chart medication shown in the ribbon meds popover. */
export interface RibbonMedChip {
  id: string;
  name: string;
  /** Compact sig when available (dose / frequency). */
  detail?: string | null;
}

export interface RibbonData {
  allergies: RibbonAllergyChip[];
  chronicConditions: RibbonChronicChip[];
  /** Active, non-archived chart medications (PMH / additional). */
  activeMeds: RibbonMedChip[];
  activeMedsCount: number;
  isLoading: boolean;
  error: Error | null;
}

const EMPTY_RIBBON: RibbonData = {
  allergies: [],
  chronicConditions: [],
  activeMeds: [],
  activeMedsCount: 0,
  isLoading: false,
  error: null,
};

/** No-op kept for tests that reset the old module cache. */
export function clearPatientRibbonDataCache(): void {}

function toRibbonAllergy(row: PatientAllergy): RibbonAllergyChip {
  return {
    id: row.id,
    name: row.allergen,
    reaction: row.reaction,
    severity: row.severity === "unknown" ? null : row.severity,
  };
}

function toRibbonChronic(row: PatientChronicCondition): RibbonChronicChip {
  return {
    id: row.id,
    name: row.condition,
    since: row.diagnosed_on,
  };
}

function isActiveChartMed(row: PatientMedication): boolean {
  return row.status === "active" && row.archived_at == null;
}

function formatMedDetail(row: PatientMedication): string | null {
  const parts: string[] = [];
  const strength = row.strength?.trim() || row.dose?.trim();
  if (strength) parts.push(strength);
  if (row.frequency?.trim()) parts.push(row.frequency.trim());
  else if (row.dose_schedule?.trim()) parts.push(row.dose_schedule.trim());
  return parts.length > 0 ? parts.join(" · ") : null;
}

function toRibbonMed(row: PatientMedication): RibbonMedChip {
  return {
    id: row.id,
    name: row.drug_name,
    detail: formatMedDetail(row),
  };
}

/** Exported for unit tests — active chart meds only. */
export function selectActiveChartMeds(
  rows: PatientMedication[],
): RibbonMedChip[] {
  return rows.filter(isActiveChartMed).map(toRibbonMed);
}

/** Deduped chart meds from grouped PMH (condition-linked + additional). */
export function collectBackgroundMeds(
  bg: MedicalBackgroundGrouped,
): PatientMedication[] {
  const byId = new Map<string, PatientMedication>();
  for (const condition of bg.conditions) {
    for (const med of condition.medications) byId.set(med.id, med);
  }
  for (const med of bg.unlinkedMedications) byId.set(med.id, med);
  return [...byId.values()];
}

function firstQueryError(
  ...errors: Array<unknown>
): Error | null {
  const found = errors.find((e) => e != null);
  if (found == null) return null;
  return found instanceof Error ? found : new Error(String(found));
}

export function usePatientRibbonData(
  patientId: string | null,
  token: string | null,
): RibbonData {
  const pid = patientId ?? "";
  const tok = token ?? "";
  const allergiesQuery = usePatientAllergiesQuery(tok, pid);
  const conditionsQuery = usePatientConditionsQuery(tok, pid);
  const backgroundQuery = usePatientMedicalBackgroundQuery(tok, pid);

  return useMemo(() => {
    if (!patientId || !token) return EMPTY_RIBBON;

    const allergies = (allergiesQuery.data?.allergies ?? []).map(toRibbonAllergy);
    const background = backgroundQuery.data;
    const chronicSource = background?.conditions ?? conditionsQuery.data ?? [];
    const activeMeds = selectActiveChartMeds(
      background ? collectBackgroundMeds(background) : [],
    );
    const waitingAllergies = allergiesQuery.isLoading && !allergiesQuery.data;
    const waitingPmh =
      backgroundQuery.isLoading &&
      !backgroundQuery.data &&
      !conditionsQuery.data;

    return {
      allergies,
      chronicConditions: chronicSource.map(toRibbonChronic),
      activeMeds,
      activeMedsCount: activeMeds.length,
      isLoading: waitingAllergies || waitingPmh,
      error: firstQueryError(
        allergiesQuery.error,
        backgroundQuery.error,
        conditionsQuery.error,
      ),
    };
  }, [
    allergiesQuery.data,
    allergiesQuery.error,
    allergiesQuery.isLoading,
    backgroundQuery.data,
    backgroundQuery.error,
    backgroundQuery.isLoading,
    conditionsQuery.data,
    conditionsQuery.error,
    patientId,
    token,
  ]);
}
