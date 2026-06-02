import type { ServiceCatalogV1 } from "@/lib/service-catalog-schema";
import type { ServiceMatchAssistHint } from "@/types/service-staff-review";

export type QuickResolveAction =
  | { kind: "confirm" }
  | { kind: "reassign"; catalogServiceKey: string; catalogServiceId: string };

export function findCatalogOffering(
  catalog: ServiceCatalogV1 | null | undefined,
  key: string
) {
  if (!catalog?.services?.length) return null;
  const k = key.trim().toLowerCase();
  return catalog.services.find((s) => s.service_key === k) ?? null;
}

/** Route a quick-resolve tap: confirm when keys match, reassign when they differ and catalog has the service. */
export function resolveQuickResolveAction(
  proposedKey: string,
  resolutionKey: string,
  catalog: ServiceCatalogV1 | null | undefined
): QuickResolveAction | null {
  const key = resolutionKey.trim().toLowerCase();
  const proposed = proposedKey.trim().toLowerCase();
  if (key === proposed) return { kind: "confirm" };
  const offering = findCatalogOffering(catalog, key);
  if (!offering) return null;
  return {
    kind: "reassign",
    catalogServiceKey: key,
    catalogServiceId: offering.service_id,
  };
}

export function quickResolveButtonResolutions(
  hint: ServiceMatchAssistHint,
  proposedKey: string,
  catalog: ServiceCatalogV1 | null | undefined,
  limit = 2
): ServiceMatchAssistHint["top_resolutions"] {
  return hint.top_resolutions
    .slice(0, limit)
    .filter(
      (h) =>
        resolveQuickResolveAction(proposedKey, h.final_catalog_service_key, catalog) !== null
    );
}
