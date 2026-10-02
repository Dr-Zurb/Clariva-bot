/**
 * Prep-page medicine list. The catalog is loaded once; filtering matches
 * the cockpit and does not wait on a search for each letter.
 */

import type { ChartCatalogOption } from "@/components/ehr/chart/ChartCatalogCombobox";
import { filterDrugMasterCatalog } from "@/lib/drug-master-catalog";
import type { DrugMasterRow } from "@/types/drug-master";

export interface PublicMedicineDrug {
  id: string;
  genericName: string;
  brandNames: string[];
  strength: string | null;
}

const MAX_LABEL = 80;

export function publicDrugToMasterRow(drug: PublicMedicineDrug): DrugMasterRow {
  return {
    id: drug.id,
    generic_name: drug.genericName,
    brand_names: drug.brandNames,
    strength: drug.strength,
    form: null,
    route_default: null,
    created_at: "",
    updated_at: "",
  };
}

function clip(value: string): string {
  return value.trim().slice(0, MAX_LABEL);
}

function withStrength(name: string, strength: string | null): string {
  const base = name.trim();
  const extra = strength?.trim() ?? "";
  if (!base) return "";
  if (!extra || base.toLowerCase().includes(extra.toLowerCase())) return clip(base);
  const numeric = extra.match(/\d+(?:\.\d+)?/)?.[0];
  if (numeric && new RegExp(`\\b${numeric}\\b`).test(base)) return clip(base);
  return clip(`${base} ${extra}`);
}

function matchingBrand(brands: string[], query: string): string | null {
  const q = query.trim().toLowerCase();
  const hits = brands.filter((brand) => brand.toLowerCase().includes(q));
  if (hits.length === 0) return null;
  hits.sort((a, b) => {
    const aStart = a.toLowerCase().startsWith(q) ? 0 : 1;
    const bStart = b.toLowerCase().startsWith(q) ? 0 : 1;
    if (aStart !== bStart) return aStart - bStart;
    return a.length - b.length;
  });
  return hits[0] ?? null;
}

function patientMedicineOption(row: DrugMasterRow, query: string): ChartCatalogOption | null {
  const generic = row.generic_name?.trim() ?? "";
  const brand = matchingBrand(row.brand_names ?? [], query);
  if (brand) {
    const label = withStrength(brand, row.strength);
    if (!label) return null;
    const hint = generic && generic.toLowerCase() !== label.toLowerCase() ? generic : undefined;
    return { value: label, label, ...(hint ? { hint } : {}) };
  }
  const label = withStrength(generic, row.strength);
  if (!label) return null;
  return { value: label, label };
}

export function filterPatientMedicines(rows: readonly DrugMasterRow[], query: string): ChartCatalogOption[] {
  const options: ChartCatalogOption[] = [];
  const seen = new Set<string>();
  for (const row of filterDrugMasterCatalog(rows, query)) {
    const option = patientMedicineOption(row, query);
    if (!option) continue;
    const key = option.label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    options.push(option);
  }
  return options;
}
