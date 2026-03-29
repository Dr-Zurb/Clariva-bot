/**
 * SFU-11: Merge catalog payloads on PATCH — stable `service_id`, immutable `service_key`
 * for existing rows (rename-safe).
 */

import { randomUUID } from 'crypto';
import type { ServiceCatalogV1, ServiceOfferingV1 } from './service-catalog-schema';
import { hydrateServiceCatalogServiceIds, serviceCatalogV1Schema } from './service-catalog-schema';
import { ValidationError } from './errors';

/** Match frontend / historical slug rules (service-catalog-drafts). */
export function slugifyLabelToServiceKey(label: string): string {
  let s = label
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_-]/g, '');
  if (!s) s = 'service';
  if (!/^[a-z0-9]/.test(s)) {
    s = `s_${s}`;
  }
  if (s.length > 64) s = s.slice(0, 64);
  return s;
}

function uniqueKeyFromLabel(label: string, taken: Set<string>): string {
  let base = slugifyLabelToServiceKey(label);
  if (!taken.has(base)) {
    taken.add(base);
    return base;
  }
  for (let n = 2; n < 1000; n++) {
    const suffix = `_${n}`;
    const stem = base.length + suffix.length > 64 ? base.slice(0, 64 - suffix.length) : base;
    const candidate = `${stem}${suffix}`;
    if (!taken.has(candidate)) {
      taken.add(candidate);
      return candidate;
    }
  }
  throw new Error('Could not allocate unique service_key');
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Merge incoming catalog with previously persisted catalog: preserve `service_key` for
 * existing `service_id` rows (rename-safe); allocate keys for brand-new rows.
 */
export function mergeServiceCatalogOnSave(
  doctorId: string,
  incoming: ServiceCatalogV1,
  previous: ServiceCatalogV1 | null
): ServiceCatalogV1 {
  const prevHydrated = previous ? hydrateServiceCatalogServiceIds(doctorId, previous) : null;
  const prevById = new Map<string, ServiceOfferingV1>();
  const takenKeys = new Set<string>();
  if (prevHydrated) {
    for (const p of prevHydrated.services) {
      prevById.set(p.service_id.trim().toLowerCase(), p);
      takenKeys.add(p.service_key.trim().toLowerCase());
    }
  }

  const nextServices: ServiceOfferingV1[] = incoming.services.map((s) => {
    const idRaw = s.service_id?.trim();
    const idNorm = idRaw ? idRaw.toLowerCase() : '';

    if (idNorm && prevById.has(idNorm)) {
      const prevRow = prevById.get(idNorm)!;
      return {
        ...s,
        service_id: prevRow.service_id,
        service_key: prevRow.service_key,
      };
    }

    const keyIn = s.service_key.trim().toLowerCase();
    if (!idNorm && prevHydrated && keyIn) {
      const prevMatch = prevHydrated.services.find((p) => p.service_key === keyIn);
      if (prevMatch) {
        return {
          ...s,
          service_id: prevMatch.service_id,
          service_key: prevMatch.service_key,
        };
      }
    }

    const newId = idRaw && UUID_RE.test(idRaw) ? idRaw.trim() : randomUUID();
    let key = keyIn;
    if (!key || takenKeys.has(key)) {
      key = uniqueKeyFromLabel(s.label.trim() || 'service', takenKeys);
    } else {
      takenKeys.add(key);
    }

    return {
      ...s,
      service_id: newId,
      service_key: key,
    };
  });

  const out: ServiceCatalogV1 = {
    version: incoming.version,
    services: nextServices,
  };
  const parsed = serviceCatalogV1Schema.safeParse(out);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const msg = first ? `${first.path.join('.')}: ${first.message}` : 'Invalid service_offerings_json';
    throw new ValidationError(msg);
  }
  return parsed.data;
}
