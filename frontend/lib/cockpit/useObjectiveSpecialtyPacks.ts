import { useMemo } from "react";
import {
  resolveObjectiveSpecialtyPacks,
  type ObjectiveSpecialtyPack,
} from "@/lib/cockpit/objective-specialty-packs";
import type { SpecialtyEmphasis } from "@/lib/cockpit/objective-default-layout";

/**
 * Resolve static specialty exam packs for the doctor's specialty label.
 * Pure memo wrapper — no I/O; packs never auto-apply or auto-persist (P4-D4).
 */
export function useObjectiveSpecialtyPacks(
  specialty: string | SpecialtyEmphasis | null | undefined,
): ObjectiveSpecialtyPack[] {
  return useMemo(() => resolveObjectiveSpecialtyPacks(specialty), [specialty]);
}
