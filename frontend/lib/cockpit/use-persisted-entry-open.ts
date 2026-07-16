"use client";

import {
  useCallback,
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  patchEntryCardUi,
  readEntryCardUi,
  type EntryCardSingleSurface,
} from "@/lib/cockpit/entry-card-ui-state";

function resolveNext<T>(prev: T, next: SetStateAction<T>): T {
  return typeof next === "function" ? (next as (p: T) => T)(prev) : next;
}

function resolveMedicineOpenId(
  scopeId: string,
  medicineInstanceIds: readonly string[],
): string | null {
  const bucket = readEntryCardUi(scopeId);
  if (bucket.medicines && medicineInstanceIds.includes(bucket.medicines)) {
    return bucket.medicines;
  }
  if (
    typeof bucket.medicinesIndex === "number" &&
    bucket.medicinesIndex >= 0 &&
    bucket.medicinesIndex < medicineInstanceIds.length
  ) {
    return medicineInstanceIds[bucket.medicinesIndex] ?? null;
  }
  return null;
}

/**
 * Persist a single open entry id (accordion) for a visit/patient scope.
 * Hydrates from sessionStorage on first mount; writes on every change.
 */
export function usePersistedOpenId(
  scopeId: string | null | undefined,
  surface: EntryCardSingleSurface,
): [string | null, Dispatch<SetStateAction<string | null>>] {
  const [openId, setOpenIdState] = useState<string | null>(() => {
    if (!scopeId) return null;
    return readEntryCardUi(scopeId)[surface] ?? null;
  });

  const setOpenId = useCallback<Dispatch<SetStateAction<string | null>>>(
    (next) => {
      setOpenIdState((prev) => {
        const resolved = resolveNext(prev, next);
        if (scopeId) patchEntryCardUi(scopeId, { [surface]: resolved });
        return resolved;
      });
    },
    [scopeId, surface],
  );

  return [openId, setOpenId];
}

/**
 * Persist which associated-complaint child is open under a parent complaint.
 */
export function usePersistedComplaintChildOpen(
  scopeId: string | null | undefined,
  parentComplaintId: string,
): [string | null, Dispatch<SetStateAction<string | null>>] {
  const [openId, setOpenIdState] = useState<string | null>(() => {
    if (!scopeId || !parentComplaintId) return null;
    return readEntryCardUi(scopeId).complaintChildren?.[parentComplaintId] ?? null;
  });

  const setOpenId = useCallback<Dispatch<SetStateAction<string | null>>>(
    (next) => {
      setOpenIdState((prev) => {
        const resolved = resolveNext(prev, next);
        if (scopeId && parentComplaintId) {
          const children = {
            ...(readEntryCardUi(scopeId).complaintChildren ?? {}),
            [parentComplaintId]: resolved,
          };
          if (resolved == null) delete children[parentComplaintId];
          patchEntryCardUi(scopeId, { complaintChildren: children });
        }
        return resolved;
      });
    },
    [scopeId, parentComplaintId],
  );

  return [openId, setOpenId];
}

/**
 * Medicine editor open id — stores instance id + row index so refresh (when
 * instance ids regenerate) can still restore the same row.
 */
export function usePersistedMedicineOpen(
  scopeId: string | null | undefined,
  medicineInstanceIds: readonly string[],
): [string | null, Dispatch<SetStateAction<string | null>>] {
  const [openId, setOpenIdState] = useState<string | null>(() => {
    if (!scopeId) return null;
    return resolveMedicineOpenId(scopeId, medicineInstanceIds);
  });

  // When instance ids arrive/change after hydrate, re-resolve from index.
  useEffect(() => {
    if (!scopeId || medicineInstanceIds.length === 0) return;
    setOpenIdState((prev) => {
      if (prev && medicineInstanceIds.includes(prev)) return prev;
      return resolveMedicineOpenId(scopeId, medicineInstanceIds);
    });
  }, [scopeId, medicineInstanceIds]);

  const setOpenId = useCallback<Dispatch<SetStateAction<string | null>>>(
    (next) => {
      setOpenIdState((prev) => {
        const resolved = resolveNext(prev, next);
        if (scopeId) {
          const index =
            resolved == null ? null : medicineInstanceIds.indexOf(resolved);
          patchEntryCardUi(scopeId, {
            medicines: resolved,
            medicinesIndex: index != null && index >= 0 ? index : null,
          });
        }
        return resolved;
      });
    },
    [scopeId, medicineInstanceIds],
  );

  return [openId, setOpenId];
}

/**
 * Persist whether a multi-open entry (e.g. PMH condition card) is expanded.
 */
export function usePersistedOpenFlag(
  scopeId: string | null | undefined,
  entryId: string,
  defaultOpen = false,
): [boolean, Dispatch<SetStateAction<boolean>>] {
  const [open, setOpenState] = useState<boolean>(() => {
    if (!scopeId || !entryId) return defaultOpen;
    const ids = readEntryCardUi(scopeId).pmhConditions ?? [];
    if (ids.includes(entryId)) return true;
    // If we have never persisted this entry, honor defaultOpen.
    return defaultOpen;
  });

  const setOpen = useCallback<Dispatch<SetStateAction<boolean>>>(
    (next) => {
      setOpenState((prev) => {
        const resolved = resolveNext(prev, next);
        if (scopeId && entryId) {
          const prevIds = readEntryCardUi(scopeId).pmhConditions ?? [];
          const set = new Set(prevIds);
          if (resolved) set.add(entryId);
          else set.delete(entryId);
          patchEntryCardUi(scopeId, { pmhConditions: [...set] });
        }
        return resolved;
      });
    },
    [scopeId, entryId],
  );

  return [open, setOpen];
}
