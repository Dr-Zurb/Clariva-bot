"use client";

/**
 * usePatientRibbonData (cockpit-ribbon crb-01 · ribbon rethink 2026-07-17)
 *
 * Composes chart endpoints into the data shape `<PatientRibbon>` needs:
 * allergies, chronic conditions, and **active chart medications**
 * (`patient_medications` where status=active and not archived).
 *
 * Demographics (age / sex / weight) live in the cockpit header beside the
 * patient name — not fetched here.
 *
 * Meds are NOT derived from the most recent prescription. "Still taking from
 * last Rx" belongs on the chart via explicit `continue` → chart promotion
 * (separate follow-up); the ribbon only counts the chart source of truth.
 *
 * # Fetch pattern
 *
 * Matches the dominant pattern in this codebase (`useSessionOverrun`,
 * `useChartPrefetch`, etc.): `useState` + `useEffect` with a manual
 * cancellation flag. A short module-level memory cache seeds state so
 * remounts / Strict Mode do not flash the ribbon skeleton twice.
 *
 * # Edge cases
 *
 * - `patientId == null` (walk-in) → empty shape, `isLoading: false`.
 * - `token == null` → same.
 * - Per-endpoint failure → first error wins on `error`; other slots still render.
 *
 * @see frontend/components/patient-profile/PatientRibbon.tsx
 */

import { useEffect, useState } from "react";
import {
  listPatientAllergies,
  listPatientConditions,
  listPatientMedications,
} from "@/lib/api";
import type {
  PatientAllergy,
  PatientChronicCondition,
  PatientMedication,
} from "@/types/patient-chart";

// ---------------------------------------------------------------------------
// Public surface
// ---------------------------------------------------------------------------

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

/** Session memory so remounts / Strict Mode don't flash ribbon skeletons again. */
const RIBBON_CACHE_TTL_MS = 60_000;
const ribbonCache = new Map<
  string,
  { data: Omit<RibbonData, "isLoading">; at: number }
>();

function ribbonCacheKey(patientId: string, token: string): string {
  return `${patientId}::${token.slice(0, 12)}`;
}

function readRibbonCache(
  patientId: string,
  token: string,
): RibbonData | null {
  const hit = ribbonCache.get(ribbonCacheKey(patientId, token));
  if (!hit) return null;
  if (Date.now() - hit.at > RIBBON_CACHE_TTL_MS) {
    ribbonCache.delete(ribbonCacheKey(patientId, token));
    return null;
  }
  // Guard against stale cache shapes from before the ribbon rethink.
  if (!Array.isArray(hit.data.activeMeds)) {
    ribbonCache.delete(ribbonCacheKey(patientId, token));
    return null;
  }
  return { ...hit.data, isLoading: false };
}

function writeRibbonCache(
  patientId: string,
  token: string,
  data: RibbonData,
): void {
  ribbonCache.set(ribbonCacheKey(patientId, token), {
    data: {
      allergies: data.allergies,
      chronicConditions: data.chronicConditions,
      activeMeds: data.activeMeds,
      activeMedsCount: data.activeMedsCount,
      error: data.error,
    },
    at: Date.now(),
  });
}

/** Test helper — drop ribbon memory cache. */
export function clearPatientRibbonDataCache(): void {
  ribbonCache.clear();
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function usePatientRibbonData(
  patientId: string | null,
  token: string | null,
): RibbonData {
  const [data, setData] = useState<RibbonData>(() => {
    if (!patientId || !token) return EMPTY_RIBBON;
    return readRibbonCache(patientId, token) ?? {
      ...EMPTY_RIBBON,
      isLoading: true,
    };
  });

  useEffect(() => {
    if (!patientId || !token) {
      setData(EMPTY_RIBBON);
      return;
    }

    let cancelled = false;
    const cached = readRibbonCache(patientId, token);
    if (cached) {
      setData(cached);
    } else {
      setData((prev) => ({ ...prev, isLoading: true, error: null }));
    }

    void Promise.allSettled([
      listPatientAllergies(token, patientId),
      listPatientConditions(token, patientId),
      listPatientMedications(token, patientId),
    ]).then((results) => {
      if (cancelled) return;

      const [allergiesRes, conditionsRes, medsRes] = results;

      const allergyRows: PatientAllergy[] =
        allergiesRes.status === "fulfilled"
          ? allergiesRes.value.data.allergies ?? []
          : [];
      const conditionRows: PatientChronicCondition[] =
        conditionsRes.status === "fulfilled"
          ? conditionsRes.value.data.conditions ?? []
          : [];
      const medicationRows: PatientMedication[] =
        medsRes.status === "fulfilled"
          ? medsRes.value.data.medications ?? []
          : [];

      const firstError = results
        .map((r) => (r.status === "rejected" ? (r.reason as unknown) : null))
        .find((e): e is unknown => e !== null);
      const error: Error | null =
        firstError instanceof Error
          ? firstError
          : firstError != null
            ? new Error(String(firstError))
            : null;

      const activeMeds = selectActiveChartMeds(medicationRows);
      const next: RibbonData = {
        allergies: allergyRows.map(toRibbonAllergy),
        chronicConditions: conditionRows.map(toRibbonChronic),
        activeMeds,
        activeMedsCount: activeMeds.length,
        isLoading: false,
        error,
      };
      writeRibbonCache(patientId, token, next);
      setData(next);
    });

    return () => {
      cancelled = true;
    };
  }, [patientId, token]);

  return data;
}
