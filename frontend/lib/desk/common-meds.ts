import type { ChartCatalogOption } from "@/components/ehr/chart/ChartCatalogCombobox";

/** Static OPD list — desk cannot call drug-master search (principle 6). */
export const COMMON_DESK_MEDS: readonly ChartCatalogOption[] = [
  { value: "metformin", label: "Metformin" },
  { value: "amlodipine", label: "Amlodipine" },
  { value: "telmisartan", label: "Telmisartan" },
  { value: "losartan", label: "Losartan" },
  { value: "atorvastatin", label: "Atorvastatin" },
  { value: "thyroxine", label: "Thyroxine" },
  { value: "aspirin", label: "Aspirin" },
  { value: "pantoprazole", label: "Pantoprazole" },
  { value: "glimepiride", label: "Glimepiride" },
  { value: "paracetamol", label: "Paracetamol" },
  { value: "cetirizine", label: "Cetirizine" },
] as const;

export const COMMON_DESK_MED_QUICK_ADD = [
  "Metformin",
  "Amlodipine",
  "Telmisartan",
  "Atorvastatin",
  "Thyroxine",
] as const;

export function filterDeskMedCatalog(
  options: ChartCatalogOption[],
  query: string,
): ChartCatalogOption[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return [...options].sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
  }
  return options.filter(
    (opt) =>
      opt.label.toLowerCase().includes(q) || opt.value.toLowerCase().includes(q),
  );
}

export function resolveDeskMed(query: string): string | undefined {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return undefined;
  const exact = COMMON_DESK_MEDS.find(
    (opt) => opt.label.toLowerCase() === trimmed || opt.value === trimmed,
  );
  return exact?.value;
}
