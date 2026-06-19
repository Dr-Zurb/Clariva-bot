import type { ClinicalRegionCode } from "@/lib/config/clinical-region";
import { applyIndiaClinicalRegion } from "@/lib/config/regions/IN";
import { applyUkClinicalRegion } from "@/lib/config/regions/UK";

export type ClinicalRegionApplier = () => void;

/** Region packs — add new regions here and register in REGION-SPECIFIC-CONFIG.md. */
export const CLINICAL_REGION_APPLIERS: Record<ClinicalRegionCode, ClinicalRegionApplier> = {
  IN: applyIndiaClinicalRegion,
  UK: applyUkClinicalRegion,
  /** US/EU reuse UK reference thresholds until dedicated packs exist. */
  US: applyUkClinicalRegion,
  EU: applyUkClinicalRegion,
};
