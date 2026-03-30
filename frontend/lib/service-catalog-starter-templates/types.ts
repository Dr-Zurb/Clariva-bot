import type { ServiceCatalogV1 } from "@/lib/service-catalog-schema";

/** One system-owned starter aligned with a Practice Info specialty label (e.g. from `MEDICAL_SPECIALTIES`). */
export type ServiceStarterTemplate = {
  /** Stable id for UI/analytics (kebab-case). */
  id: string;
  /** Must match `MEDICAL_SPECIALTIES` entry for filtering (India region today). */
  specialtyLabel: string;
  title: string;
  description: string;
  catalog: ServiceCatalogV1;
};
