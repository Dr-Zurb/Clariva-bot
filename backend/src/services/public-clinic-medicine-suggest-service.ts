/**
 * Patient medicine suggestions for the prep form.
 * Same drug catalog as the cockpit. Brand plus strength is the saved name.
 * No doctor ranking, no dose line, and the query is not logged.
 */

import { logger } from '../config/logger';
import { searchDrugs } from './drug-master-service';
import { readPatientHistory } from './public-clinic-history-service';
import { readHistoryFormAppointmentId } from '../utils/history-form-token';
import type { DrugSearchResult } from '../types/drug-master';

export interface PatientMedicineSuggestion {
  label: string;
  hint: string | null;
}

const MAX_LABEL = 80;
const SUGGEST_LIMIT = 8;

function clip(value: string): string {
  return value.trim().slice(0, MAX_LABEL);
}

function withStrength(name: string, strength: string | null): string {
  const base = name.trim();
  const extra = strength?.trim() ?? '';
  if (!base) return '';
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

/** Brand the patient typed, with strength. Generic is the hint, not the saved name. */
export function toPatientMedicineSuggestion(
  row: DrugSearchResult,
  query: string
): PatientMedicineSuggestion | null {
  const generic = row.generic_name?.trim() ?? '';
  const brand = matchingBrand(Array.isArray(row.brand_names) ? row.brand_names : [], query);
  if (brand) {
    const label = withStrength(brand, row.strength);
    if (!label) return null;
    const hint = generic && generic.toLowerCase() !== label.toLowerCase() ? generic : null;
    return { label, hint };
  }
  const label = withStrength(generic, row.strength);
  if (!label) return null;
  return { label, hint: null };
}

export interface PublicMedicineCatalogRow {
  id: string;
  genericName: string;
  brandNames: string[];
  strength: string | null;
}

/** One catalog read for the prep page. The browser filters it while typing. */
export async function listPublicMedicineCatalog(
  token: string,
  correlationId: string
): Promise<{ drugs: PublicMedicineCatalogRow[] }> {
  await readPatientHistory(token, correlationId);
  const rows = await searchDrugs('');
  const drugs = rows.map((row) => ({
    id: row.id,
    genericName: row.generic_name,
    brandNames: Array.isArray(row.brand_names) ? row.brand_names : [],
    strength: row.strength,
  }));
  const opened = readHistoryFormAppointmentId(token);
  logger.info(
    {
      appointmentId: opened.ok ? opened.appointmentId : undefined,
      drugCount: drugs.length,
    },
    'patient_medicine_catalog'
  );
  return { drugs };
}

export async function suggestPublicMedicines(
  token: string,
  rawQuery: string,
  correlationId: string
): Promise<{ suggestions: PatientMedicineSuggestion[] }> {
  const query = rawQuery.trim();
  if (query.length < 2) return { suggestions: [] };

  await readPatientHistory(token, correlationId);
  const rows = await searchDrugs(query, SUGGEST_LIMIT, { preferBrands: true });
  const suggestions: PatientMedicineSuggestion[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const item = toPatientMedicineSuggestion(row, query);
    if (!item) continue;
    const key = item.label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    suggestions.push(item);
  }

  const opened = readHistoryFormAppointmentId(token);
  logger.info(
    {
      appointmentId: opened.ok ? opened.appointmentId : undefined,
      suggestionCount: suggestions.length,
    },
    'patient_medicine_suggest'
  );
  return { suggestions };
}
