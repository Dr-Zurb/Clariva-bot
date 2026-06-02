"use client";

/**
 * Aggregates chart-rail empty signals for DL-2 unified empty-state (ccd-01).
 *
 * Mirrors the fetch composition in `usePatientRibbonData` / chart sections:
 * allergies, chronic conditions, problems, vitals + current meds (snapshot),
 * and full visit history.
 */

import { useEffect, useState } from "react";
import {
  listPatientAllergies,
  listPatientConditions,
  listPatientVitals,
  listPrescriptionsByPatient,
  listRecentPrescriptionsByPatient,
} from "@/lib/api";
import { listPatientProblems } from "@/lib/api/patient-chart";
import { useOptionalRxForm } from "@/components/cockpit/rx/RxFormContext";
import type { RxFormFields } from "@/components/cockpit/rx/RxFormContext";
import type { ChartRailEmptySignals } from "@/components/patient-profile/panes/UnifiedChartRailEmptyState";

export interface UseChartRailEmptySignalsResult {
  signals: ChartRailEmptySignals;
  isLoading: boolean;
}

const ALL_EMPTY: ChartRailEmptySignals = {
  allergiesEmpty: true,
  chronicEmpty: true,
  problemListEmpty: true,
  snapshotEmpty: true,
  historyEmpty: true,
};

function hasDraftVitals(fields: RxFormFields | undefined): boolean {
  if (!fields) return false;
  return (
    fields.vitalsBpSystolic != null ||
    fields.vitalsBpDiastolic != null ||
    fields.vitalsHr != null ||
    fields.vitalsTempC != null ||
    fields.vitalsSpo2 != null ||
    fields.vitalsWtKg != null ||
    fields.vitalsHtCm != null
  );
}

export function useChartRailEmptySignals(
  patientId: string | null,
  token: string | null,
): UseChartRailEmptySignalsResult {
  const rxForm = useOptionalRxForm();
  const draftHasVitals = hasDraftVitals(rxForm?.state.fields);

  const [signals, setSignals] = useState<ChartRailEmptySignals>(ALL_EMPTY);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!patientId || !token) {
      setSignals(ALL_EMPTY);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    void Promise.allSettled([
      listPatientAllergies(token, patientId),
      listPatientConditions(token, patientId),
      listPatientProblems(token, patientId),
      listPatientVitals(token, patientId, { limit: 1 }),
      listRecentPrescriptionsByPatient(token, patientId, { limit: 1 }),
      listPrescriptionsByPatient(token, patientId),
    ]).then((results) => {
      if (cancelled) return;

      const [
        allergiesRes,
        conditionsRes,
        problemsRes,
        vitalsRes,
        recentRxRes,
        historyRes,
      ] = results;

      const allergyCount =
        allergiesRes.status === "fulfilled"
          ? allergiesRes.value.data.allergies?.length ?? 0
          : 0;
      const conditionCount =
        conditionsRes.status === "fulfilled"
          ? conditionsRes.value.data.conditions?.length ?? 0
          : 0;
      const problemCount =
        problemsRes.status === "fulfilled"
          ? problemsRes.value.data.problems?.length ?? 0
          : 0;
      const vitalsCount =
        vitalsRes.status === "fulfilled"
          ? vitalsRes.value.data.vitals?.length ?? 0
          : 0;
      const medicineCount =
        recentRxRes.status === "fulfilled"
          ? recentRxRes.value.data.prescriptions[0]?.medicine_count ?? 0
          : 0;
      const visitCount =
        historyRes.status === "fulfilled"
          ? historyRes.value.data.prescriptions?.length ?? 0
          : 0;

      setSignals({
        allergiesEmpty: allergyCount === 0,
        chronicEmpty: conditionCount === 0,
        problemListEmpty: problemCount === 0,
        snapshotEmpty:
          vitalsCount === 0 && medicineCount === 0 && !draftHasVitals,
        historyEmpty: visitCount === 0,
      });
      setIsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [patientId, token, draftHasVitals]);

  return { signals, isLoading };
}
