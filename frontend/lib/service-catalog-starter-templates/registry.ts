/**
 * SFU-13: Validated starter templates. Throws at module load if any catalog fails Zod.
 */

import { safeParseServiceCatalogV1, SERVICE_CATALOG_VERSION } from "@/lib/service-catalog-schema";
import { RAW_STARTER_TEMPLATE_ROWS } from "./data";
import type { ServiceStarterTemplate } from "./types";

function buildStarters(): ServiceStarterTemplate[] {
  const out: ServiceStarterTemplate[] = [];
  for (const row of RAW_STARTER_TEMPLATE_ROWS) {
    const catalog = { version: SERVICE_CATALOG_VERSION, services: row.services };
    const parsed = safeParseServiceCatalogV1(catalog);
    if (!parsed.ok) {
      throw new Error(`[service-catalog-starter-templates] ${row.id}: ${parsed.message}`);
    }
    out.push({
      id: row.id,
      specialtyLabel: row.specialtyLabel,
      title: row.title,
      description: row.description,
      catalog: parsed.data,
    });
  }
  return out;
}

/** All system starter templates (validated). */
export const STARTER_SERVICE_TEMPLATES: readonly ServiceStarterTemplate[] = buildStarters();

export function getStarterTemplateById(id: string): ServiceStarterTemplate | undefined {
  return STARTER_SERVICE_TEMPLATES.find((t) => t.id === id);
}

/** Specialty labels that have at least one starter (for docs / UI badges). */
export const STARTER_SPECIALTY_LABELS: readonly string[] = Array.from(
  new Set(STARTER_SERVICE_TEMPLATES.map((t) => t.specialtyLabel))
).sort((a, b) => a.localeCompare(b));
