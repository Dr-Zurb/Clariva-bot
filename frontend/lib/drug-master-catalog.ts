/**
 * Session-cached drug_master list + local filter.
 * Capture-bar autocomplete filters in memory so typing never waits on search.
 */

import { searchDrugs } from "@/lib/api";
import { formatChartMedFormLabel } from "@/lib/chart/chart-medication";
import type { DrugMasterRow } from "@/types/drug-master";

export const DRUG_MASTER_CATALOG_MIN_QUERY = 2;
export const DRUG_MASTER_CATALOG_FETCH_LIMIT = 1000;

const SESSION_CACHE = new Map<string, DrugMasterRow[]>();
const INFLIGHT = new Map<string, Promise<DrugMasterRow[]>>();

function tokenCacheKey(token: string): string {
  return token.slice(0, 16);
}

export function resetDrugMasterCatalogCache(): void {
  SESSION_CACHE.clear();
  INFLIGHT.clear();
}

export function peekDrugMasterCatalog(
  token: string
): DrugMasterRow[] | undefined {
  return SESSION_CACHE.get(tokenCacheKey(token));
}

export async function loadDrugMasterCatalog(
  token: string
): Promise<DrugMasterRow[]> {
  const key = tokenCacheKey(token);
  const cached = SESSION_CACHE.get(key);
  if (cached) return cached;

  const pending = INFLIGHT.get(key);
  if (pending) return pending;

  const request = searchDrugs(token, "", {
    limit: DRUG_MASTER_CATALOG_FETCH_LIMIT,
  })
    .then((res) => {
      const rows = res.data.results;
      SESSION_CACHE.set(key, rows);
      return rows;
    })
    .finally(() => {
      INFLIGHT.delete(key);
    });

  INFLIGHT.set(key, request);
  return request;
}

export function filterDrugMasterCatalog(
  rows: readonly DrugMasterRow[],
  rawQuery: string,
  limit = 10
): DrugMasterRow[] {
  const q = rawQuery.trim().toLowerCase();
  if (q.length < DRUG_MASTER_CATALOG_MIN_QUERY) return [];

  const prefix: DrugMasterRow[] = [];
  const brand: DrugMasterRow[] = [];
  const contains: DrugMasterRow[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    if (row.generic_name.toLowerCase().startsWith(q)) {
      prefix.push(row);
      seen.add(row.id);
    }
  }
  prefix.sort((a, b) => a.generic_name.localeCompare(b.generic_name));
  if (prefix.length >= limit) return prefix.slice(0, limit);

  for (const row of rows) {
    if (seen.has(row.id)) continue;
    const brandHit = (row.brand_names ?? []).some((name) =>
      name.toLowerCase().includes(q)
    );
    if (!brandHit) continue;
    brand.push(row);
    seen.add(row.id);
  }
  if (prefix.length + brand.length >= limit) {
    return [...prefix, ...brand].slice(0, limit);
  }

  for (const row of rows) {
    if (seen.has(row.id)) continue;
    if (row.generic_name.toLowerCase().includes(q)) {
      contains.push(row);
      seen.add(row.id);
    }
  }
  contains.sort((a, b) => a.generic_name.localeCompare(b.generic_name));

  return [...prefix, ...brand, ...contains].slice(0, limit);
}

/** Short form, then generic name, then strength — same string in the dropdown and the field. */
export function formatDrugMasterCaptureLine(drug: DrugMasterRow): string {
  return [formatChartMedFormLabel(drug.form), drug.generic_name, drug.strength]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(" ");
}
