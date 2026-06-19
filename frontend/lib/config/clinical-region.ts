/**
 * Clinical region resolver — picks which region pack to apply at app bootstrap.
 *
 * See docs/Reference/engineering/REGION-SPECIFIC-CONFIG.md for the full registry
 * of region-specific values across the codebase.
 */

export const CLINICAL_REGION_CODES = ["IN", "UK", "US", "EU"] as const;

export type ClinicalRegionCode = (typeof CLINICAL_REGION_CODES)[number];

/** Reference region used in tests and as the UK/Global-default pack id. */
export const UK_CLINICAL_REGION: ClinicalRegionCode = "UK";

/** Current launch default until per-doctor or per-tenant region is wired. */
export const DEFAULT_CLINICAL_REGION: ClinicalRegionCode = "IN";

const REGION_ALIASES: Record<string, ClinicalRegionCode> = {
  IN: "IN",
  IND: "IN",
  INDIA: "IN",
  UK: "UK",
  GB: "UK",
  US: "US",
  USA: "US",
  EU: "EU",
};

export function parseClinicalRegionCode(raw: string | undefined | null): ClinicalRegionCode | null {
  if (!raw?.trim()) return null;
  return REGION_ALIASES[raw.trim().toUpperCase()] ?? null;
}

/** Resolve from `NEXT_PUBLIC_CLINICAL_REGION`; falls back to {@link DEFAULT_CLINICAL_REGION}. */
export function resolveClinicalRegion(): ClinicalRegionCode {
  return (
    parseClinicalRegionCode(process.env.NEXT_PUBLIC_CLINICAL_REGION) ?? DEFAULT_CLINICAL_REGION
  );
}
