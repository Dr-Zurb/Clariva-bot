/**
 * SFU-01: Read helpers for service_offerings_json (no I/O).
 */

import type { DoctorSettingsRow } from '../types/doctor-settings';
import type { ServiceCatalogV1, ServiceOfferingV1 } from './service-catalog-schema';
import { safeParseServiceCatalogV1FromDb } from './service-catalog-schema';

/** Validated catalog or null if unset / invalid shape */
export function getActiveServiceCatalog(settings: DoctorSettingsRow | null): ServiceCatalogV1 | null {
  if (!settings) {
    return null;
  }
  const raw = settings.service_offerings_json;
  if (raw == null) {
    return null;
  }
  return safeParseServiceCatalogV1FromDb(raw as unknown, settings.doctor_id);
}

export function findServiceOfferingByKey(
  catalog: ServiceCatalogV1,
  serviceKey: string
): ServiceOfferingV1 | undefined {
  const key = serviceKey.trim().toLowerCase();
  return catalog.services.find((s) => s.service_key === key);
}

export function findServiceOfferingByServiceId(
  catalog: ServiceCatalogV1,
  serviceId: string
): ServiceOfferingV1 | undefined {
  const id = serviceId.trim().toLowerCase();
  return catalog.services.find((s) => s.service_id.trim().toLowerCase() === id);
}
