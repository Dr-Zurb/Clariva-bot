import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query/keys";
import {
  applyTagOp,
  coercePatientTags,
  type PatientTagOp,
} from "@/lib/patients-v2/patient-tags";
import type { PatientsListPagedData } from "@/types/patient";

/** Optimistically apply a tag op on cached patients list pages. */
export function patchPatientTagsInListCache(
  queryClient: QueryClient,
  patientIds: string[],
  op: PatientTagOp,
  tags: string[],
): void {
  if (patientIds.length === 0) return;
  const idSet = new Set(patientIds);
  queryClient.setQueriesData<PatientsListPagedData>(
    { queryKey: queryKeys.patients.all },
    (old) => {
      if (!old?.patients?.length) return old;
      let changed = false;
      const patients = old.patients.map((p) => {
        if (!idSet.has(p.id)) return p;
        changed = true;
        const next = applyTagOp(
          coercePatientTags(p.patient_tags, p.patient_tag),
          op,
          tags,
        );
        return {
          ...p,
          patient_tags: next,
          patient_tag: next[0] ?? null,
        };
      });
      return changed ? { ...old, patients } : old;
    },
  );
}
