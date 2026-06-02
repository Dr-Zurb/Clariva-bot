"use client";

/**
 * usePatientRibbonData (cockpit-ribbon crb-01)
 *
 * Composes existing chart endpoints into the data shape `<PatientRibbon>`
 * (crb-02) needs. The ribbon has five slots; this hook owns four of them
 * (identity, allergies, chronic conditions, active medications count).
 * The fifth slot — `🎯 Treating Dx` — is read by the component directly
 * from `useRxForm()` and is intentionally NOT subscribed here.
 *
 * # Discovery decisions (documented per crb-01 acceptance gate)
 *
 * - **Identity path**: PATH 2 — `getPatientById`. Path 1
 *   (`appointment.patient_demographics`) was the preferred zero-cost
 *   option per the task spec, but a workspace-wide grep for
 *   `patient_demographics` returns no matches: cs-03 has not landed in
 *   this code path yet. Weight is not on the `Patient` row either, so
 *   we issue a second call to `listPatientVitals(..., { limit: 1 })`
 *   and pull `weight_kg` from the most recent reading.
 *   See follow-up inbox entry "patient_demographics on appointment-detail
 *   response — needed for cockpit-ribbon Path 1 optimization".
 *
 * - **Active meds count path**: PATH A — most recent prescription via
 *   `listRecentPrescriptionsByPatient(..., { limit: 1 })`. The recent
 *   endpoint already returns a server-computed `medicine_count` on each
 *   `PrescriptionRecentSummary`, so we use it as-is rather than fetching
 *   the full medicines array and filtering client-side. The recent
 *   endpoint is also already excluding drafts server-side.
 *
 * # Fetch pattern
 *
 * Matches the dominant pattern in this codebase (`useSessionOverrun`,
 * `useChartPrefetch`, etc.): `useState` + `useEffect` with a manual
 * cancellation flag. The codebase does NOT use SWR / React Query
 * (confirmed via the docblock in `useChartPrefetch.ts`), so this hook
 * deliberately does not introduce one.
 *
 * # Edge cases
 *
 * - `patientId == null` (walk-in) → returns the empty shape synchronously
 *   with `isLoading: false`.
 * - `token == null` → same as walk-in (no auth, no data).
 * - Per-endpoint failure → the first error wins on `error`; the other
 *   slots still render whatever data they got. The component is
 *   expected to render partial data; we never block the whole ribbon.
 *
 * @see frontend/hooks/useChartPrefetch.ts — closest precedent (composed chart fetch)
 * @see frontend/hooks/useSessionOverrun.ts — useState+useEffect pattern
 * @see docs/Work/Daily-plans/May 2026/21-05-2026/cockpit-ribbon/Tasks/task-crb-01-ribbon-data-hook.md
 */

import { useEffect, useState } from "react";
import {
  getPatientById,
  listPatientAllergies,
  listPatientConditions,
  listPatientVitals,
  listRecentPrescriptionsByPatient,
} from "@/lib/api";
import type { Patient } from "@/types/patient";
import type {
  PatientAllergy,
  PatientChronicCondition,
  PatientVitalsReading,
} from "@/types/patient-chart";
import type { PrescriptionRecentSummary } from "@/types/prescription";

// ---------------------------------------------------------------------------
// Public surface
// ---------------------------------------------------------------------------

export interface RibbonIdentity {
  ageYears: number | null;
  sex: "M" | "F" | "O" | null;
  weightKg: number | null;
}

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

export interface RibbonData {
  identity: RibbonIdentity;
  allergies: RibbonAllergyChip[];
  chronicConditions: RibbonChronicChip[];
  activeMedsCount: number;
  isLoading: boolean;
  error: Error | null;
}

const EMPTY_IDENTITY: RibbonIdentity = {
  ageYears: null,
  sex: null,
  weightKg: null,
};

const EMPTY_RIBBON: RibbonData = {
  identity: EMPTY_IDENTITY,
  allergies: [],
  chronicConditions: [],
  activeMedsCount: 0,
  isLoading: false,
  error: null,
};

// ---------------------------------------------------------------------------
// Mappers (kept module-local; consumers don't need them)
// ---------------------------------------------------------------------------

function computeAgeYears(dateOfBirth: string | null | undefined): number | null {
  if (!dateOfBirth) return null;
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const monthDelta = now.getMonth() - dob.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < dob.getDate())) {
    age -= 1;
  }
  return age >= 0 ? age : null;
}

function normalizeSex(gender: string | null | undefined): RibbonIdentity["sex"] {
  if (!gender) return null;
  const g = gender.trim().toLowerCase();
  if (g === "m" || g === "male") return "M";
  if (g === "f" || g === "female") return "F";
  return "O";
}

function deriveIdentity(
  patient: Patient | null,
  latestVitals: PatientVitalsReading | null,
): RibbonIdentity {
  if (!patient && !latestVitals) return EMPTY_IDENTITY;
  return {
    ageYears: computeAgeYears(patient?.date_of_birth),
    sex: normalizeSex(patient?.gender),
    weightKg: latestVitals?.weight_kg ?? null,
  };
}

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

function countActiveMedicines(
  latest: PrescriptionRecentSummary | null,
): number {
  return latest?.medicine_count ?? 0;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function usePatientRibbonData(
  patientId: string | null,
  token: string | null,
): RibbonData {
  const [data, setData] = useState<RibbonData>(EMPTY_RIBBON);

  useEffect(() => {
    if (!patientId || !token) {
      setData(EMPTY_RIBBON);
      return;
    }

    let cancelled = false;
    setData((prev) => ({ ...prev, isLoading: true, error: null }));

    void Promise.allSettled([
      getPatientById(patientId, token),
      listPatientVitals(token, patientId, { limit: 1 }),
      listPatientAllergies(token, patientId),
      listPatientConditions(token, patientId),
      listRecentPrescriptionsByPatient(token, patientId, { limit: 1 }),
    ]).then((results) => {
      if (cancelled) return;

      const [patientRes, vitalsRes, allergiesRes, conditionsRes, rxRes] = results;

      const patient: Patient | null =
        patientRes.status === "fulfilled" ? patientRes.value.data.patient : null;
      const latestVitals: PatientVitalsReading | null =
        vitalsRes.status === "fulfilled"
          ? vitalsRes.value.data.vitals[0] ?? null
          : null;
      const allergyRows: PatientAllergy[] =
        allergiesRes.status === "fulfilled"
          ? allergiesRes.value.data.allergies ?? []
          : [];
      const conditionRows: PatientChronicCondition[] =
        conditionsRes.status === "fulfilled"
          ? conditionsRes.value.data.conditions ?? []
          : [];
      const latestRx: PrescriptionRecentSummary | null =
        rxRes.status === "fulfilled"
          ? rxRes.value.data.prescriptions[0] ?? null
          : null;

      // First rejection wins; partial data still renders.
      const firstError = results
        .map((r) => (r.status === "rejected" ? (r.reason as unknown) : null))
        .find((e): e is unknown => e !== null);
      const error: Error | null =
        firstError instanceof Error
          ? firstError
          : firstError != null
            ? new Error(String(firstError))
            : null;

      setData({
        identity: deriveIdentity(patient, latestVitals),
        allergies: allergyRows.map(toRibbonAllergy),
        chronicConditions: conditionRows.map(toRibbonChronic),
        activeMedsCount: countActiveMedicines(latestRx),
        isLoading: false,
        error,
      });
    });

    return () => {
      cancelled = true;
    };
  }, [patientId, token]);

  return data;
}
