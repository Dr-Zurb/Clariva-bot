"use client";

/**
 * Shared allergy-clash + DDI state for the Rx draft (cmr-02).
 *
 * Inventory:
 *   - {@link AllergyClashBanner} — `frontend/components/ehr/AllergyClashBanner.tsx`
 *   - {@link InteractionChips} — `frontend/components/ehr/InteractionChips.tsx`
 *   - Data: `useRxForm().state.fields.medicines`, shell `medicineInstanceIds`,
 *     patient allergies fetch, debounced DDI check, `useAcknowledgements()`.
 *
 * Mounted once per appointment via `<RxSafetyProvider>` so
 * `<SafetyStickyStrip>` (bottom-row overlay) and `<PlanSection>` (form body)
 * share the same acknowledgement store and fetch results.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { listPatientAllergies } from "@/lib/api";
import { checkDrugInteractions, type InteractionRow } from "@/lib/api/drug-interactions";
import { useRxForm } from "@/components/cockpit/rx/RxFormContext";
import { usePrescriptionFormShell } from "@/components/cockpit/rx/PrescriptionFormShellContext";
import { ackKeyForAllergyMatch } from "@/components/ehr/AllergyClashBanner";
import { ackKeyForDdi } from "@/components/ehr/InteractionChips";
import {
  matchAllergens,
  type AllergyMatch,
  type MatchableMedicine,
} from "@/lib/ehr/match-allergens";
import { useAcknowledgements } from "@/lib/ehr/use-acknowledgements";
import type { PatientAllergy } from "@/types/patient-chart";
import type { DrugMasterRow } from "@/types/drug-master";

export interface UseRxSafetySurfaceArgs {
  token: string;
  patientId: string | null;
}

export interface RxSafetySurfaceValue {
  matchableMedicines: MatchableMedicine[];
  medicineInstanceIds: string[];
  allergies: ReadonlyArray<PatientAllergy>;
  drugMasterIndex: ReadonlyMap<string, DrugMasterRow>;
  setDrugMasterIndex: React.Dispatch<
    React.SetStateAction<ReadonlyMap<string, DrugMasterRow>>
  >;
  ddiInteractions: InteractionRow[];
  formAllergyMatches: AllergyMatch[];
  isAcked: (key: string) => boolean;
  onAcknowledge: (keys: string[]) => void;
  onAckDdi: (key: string) => void;
  /** True when at least one unacked allergy match or DDI chip would render. */
  visible: boolean;
  clashesCount: number;
  ddiCount: number;
}

export function computeRxSafetyStripVisible(inputs: {
  formAllergyMatches: AllergyMatch[];
  medicineInstanceIds: ReadonlyArray<string>;
  ddiInteractions: ReadonlyArray<InteractionRow>;
  isAcked: (key: string) => boolean;
}): { visible: boolean; clashesCount: number; ddiCount: number } {
  const unackedClashes = inputs.formAllergyMatches.filter((m) => {
    const instanceId = inputs.medicineInstanceIds[m.medicineIndex];
    const key = instanceId
      ? ackKeyForAllergyMatch(instanceId, m.allergyId)
      : `allergy:fallback-${m.medicineIndex}:${m.allergyId}`;
    return !inputs.isAcked(key);
  });
  const unackedDdi = inputs.ddiInteractions.filter(
    (row) => !inputs.isAcked(ackKeyForDdi(row.id)),
  );
  return {
    visible: unackedClashes.length > 0 || unackedDdi.length > 0,
    clashesCount: unackedClashes.length,
    ddiCount: unackedDdi.length,
  };
}

export function useRxSafetySurface({
  token,
  patientId,
}: UseRxSafetySurfaceArgs): RxSafetySurfaceValue {
  const { state } = useRxForm();
  const medicines = state.fields.medicines;
  const shell = usePrescriptionFormShell();
  const medicineInstanceIds = shell?.medicineInstanceIds ?? [];

  const [drugMasterIndex, setDrugMasterIndex] = useState<
    ReadonlyMap<string, DrugMasterRow>
  >(() => new Map());
  const [allergies, setAllergies] = useState<ReadonlyArray<PatientAllergy>>([]);
  const [ddiInteractions, setDdiInteractions] = useState<InteractionRow[]>([]);
  const ddiCacheRef = useRef(new Map<string, InteractionRow[]>());
  const ddiDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const acknowledgements = useAcknowledgements();

  useEffect(() => {
    if (!patientId) {
      setAllergies([]);
      return;
    }
    let cancelled = false;
    listPatientAllergies(token, patientId)
      .then((res) => {
        if (cancelled) return;
        setAllergies(res.data.allergies ?? []);
      })
      .catch(() => {
        if (!cancelled) setAllergies([]);
      });
    return () => {
      cancelled = true;
    };
  }, [token, patientId]);

  const sortedDrugIds = useMemo(() => {
    const ids = medicines
      .map((m) => m.drugMasterId)
      .filter((id): id is string => id !== null && id !== "");
    return Array.from(new Set(ids)).sort();
  }, [medicines]);

  useEffect(() => {
    if (ddiDebounceRef.current !== null) {
      clearTimeout(ddiDebounceRef.current);
      ddiDebounceRef.current = null;
    }

    if (sortedDrugIds.length < 2) {
      setDdiInteractions([]);
      return;
    }

    const key = sortedDrugIds.join(",");
    const cached = ddiCacheRef.current.get(key);
    if (cached !== undefined) {
      setDdiInteractions(cached);
      return;
    }

    ddiDebounceRef.current = setTimeout(() => {
      ddiDebounceRef.current = null;
      let cancelled = false;
      checkDrugInteractions(token, sortedDrugIds)
        .then((res) => {
          if (cancelled) return;
          const rows = res.data.results;
          ddiCacheRef.current.set(key, rows);
          setDdiInteractions(rows);
        })
        .catch(() => {
          /* soft-fail — chips stay hidden on network error */
        });
      return () => {
        cancelled = true;
      };
    }, 300);

    return () => {
      if (ddiDebounceRef.current !== null) {
        clearTimeout(ddiDebounceRef.current);
        ddiDebounceRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortedDrugIds, token]);

  const matchableMedicines = useMemo<MatchableMedicine[]>(
    () =>
      medicines.map((m) => ({
        medicine_name: m.medicineName,
        drug_master_id: m.drugMasterId,
      })),
    [medicines],
  );

  const formAllergyMatches = useMemo<AllergyMatch[]>(
    () => matchAllergens(matchableMedicines, allergies, drugMasterIndex),
    [matchableMedicines, allergies, drugMasterIndex],
  );

  const { visible, clashesCount, ddiCount } = useMemo(
    () =>
      computeRxSafetyStripVisible({
        formAllergyMatches,
        medicineInstanceIds,
        ddiInteractions,
        isAcked: acknowledgements.isAcked,
      }),
    [
      formAllergyMatches,
      medicineInstanceIds,
      ddiInteractions,
      acknowledgements.isAcked,
    ],
  );

  return {
    matchableMedicines,
    medicineInstanceIds,
    allergies,
    drugMasterIndex,
    setDrugMasterIndex,
    ddiInteractions,
    formAllergyMatches,
    isAcked: acknowledgements.isAcked,
    onAcknowledge: acknowledgements.ackMany,
    onAckDdi: acknowledgements.ack,
    visible,
    clashesCount,
    ddiCount,
  };
}
