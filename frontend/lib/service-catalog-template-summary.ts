import {
  catalogToServiceDrafts,
  type ServiceOfferingDraft,
} from "@/lib/service-catalog-drafts";
import { formatServiceChannelSummary } from "@/lib/service-catalog-channel-format";
import {
  CATALOG_CATCH_ALL_LABEL_DEFAULT,
  CATALOG_CATCH_ALL_SERVICE_KEY,
} from "@/lib/service-catalog-schema";
import type { UserSavedServiceTemplateV1 } from "@/types/doctor-settings";

const PREVIEW_ROWS = 4;

function isCatchAllDraft(d: ServiceOfferingDraft): boolean {
  return d.service_key.trim().toLowerCase() === CATALOG_CATCH_ALL_SERVICE_KEY;
}

function displayLabel(d: ServiceOfferingDraft): string {
  const raw = d.label.trim();
  if (isCatchAllDraft(d)) return raw || CATALOG_CATCH_ALL_LABEL_DEFAULT;
  return raw || "Untitled service";
}

/** UI copy for template cards — derived from stored catalog only (no extra API). */
export function summarizeUserSavedTemplate(t: UserSavedServiceTemplateV1): {
  headline: string;
  previewLines: { label: string; channels: string }[];
  restCount: number;
} {
  const drafts = catalogToServiceDrafts(t.catalog);
  const named = drafts.filter((d) => !isCatchAllDraft(d));
  const hasCatchAll = drafts.some((d) => isCatchAllDraft(d));

  const headlineParts: string[] = [];
  if (named.length > 0) {
    headlineParts.push(`${named.length} named service${named.length === 1 ? "" : "s"}`);
  }
  if (hasCatchAll) {
    headlineParts.push(`includes ${CATALOG_CATCH_ALL_LABEL_DEFAULT}`);
  }
  if (headlineParts.length === 0 && drafts.length > 0) {
    headlineParts.push(`${drafts.length} row${drafts.length === 1 ? "" : "s"}`);
  }
  if (headlineParts.length === 0) {
    headlineParts.push("Empty catalog");
  }
  const headline = headlineParts.join(" · ");

  const previewLines = drafts.slice(0, PREVIEW_ROWS).map((d) => ({
    label: displayLabel(d),
    channels: formatServiceChannelSummary(d),
  }));
  const restCount = Math.max(0, drafts.length - PREVIEW_ROWS);

  return { headline, previewLines, restCount };
}

/** Full ordered rows for expand-in-place in template cards. */
export function listTemplateRowDetails(t: UserSavedServiceTemplateV1): {
  label: string;
  channels: string;
}[] {
  return catalogToServiceDrafts(t.catalog).map((d) => ({
    label: displayLabel(d),
    channels: formatServiceChannelSummary(d),
  }));
}
