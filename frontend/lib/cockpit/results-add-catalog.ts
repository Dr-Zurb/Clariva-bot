/**
 * Reports search catalog — panels + analytes from the shared investigation
 * catalog. Empty query lists panels only so the dropdown stays scannable;
 * typing filters aliases via `filterInvestigationOrderCatalog`.
 */

import type { ChartCatalogOption } from "@/components/ehr/chart/ChartCatalogCombobox";
import {
  INVESTIGATION_ORDER_CATALOG,
  filterInvestigationOrderCatalog,
  parseOrderCatalogValue,
  resolveInvestigationOrderCatalog,
} from "@/lib/cockpit/investigation-order-catalog";

const MAX_FILTERED_RESULTS = 32;

const RESULTS_ADD_ENTRIES = INVESTIGATION_ORDER_CATALOG.filter(
  (entry) => entry.kind === "panel" || entry.kind === "analyte"
);

const ANALYTE_LABELS = new Set(
  RESULTS_ADD_ENTRIES.filter((entry) => entry.kind === "analyte").map(
    (entry) => entry.label
  )
);

export const RESULTS_ADD_CATALOG_OPTIONS: readonly ChartCatalogOption[] =
  RESULTS_ADD_ENTRIES.map((entry) => ({
    value: entry.value,
    label:
      entry.kind === "panel" && ANALYTE_LABELS.has(entry.label)
        ? `${entry.label} · panel`
        : entry.label,
  }));

export type ResultsAddParsed =
  | { kind: "panel"; id: string }
  | { kind: "analyte"; id: string };

export function parseResultsAddValue(value: string): ResultsAddParsed | null {
  const parsed = parseOrderCatalogValue(value);
  if (!parsed) return null;
  if (parsed.kind === "panel" || parsed.kind === "analyte") {
    return { kind: parsed.kind, id: parsed.id };
  }
  return null;
}

export function filterResultsAddCatalog(
  options: readonly ChartCatalogOption[],
  query: string
): ChartCatalogOption[] {
  const trimmed = query.trim();
  if (!trimmed) {
    return options.filter((opt) => opt.value.startsWith("panel:"));
  }
  return filterInvestigationOrderCatalog([...options], trimmed).slice(
    0,
    MAX_FILTERED_RESULTS
  );
}

export function resolveResultsAddCatalog(query: string): string | undefined {
  const value = resolveInvestigationOrderCatalog(query);
  if (!value) return undefined;
  return parseResultsAddValue(value) ? value : undefined;
}
