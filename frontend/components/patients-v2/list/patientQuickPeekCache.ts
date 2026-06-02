import type { PatientOverviewData } from "@/types/patient";

const TTL_MS = 15 * 60 * 1000;

interface CacheEntry {
  data: PatientOverviewData;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

export function getCachedOverview(patientId: string): PatientOverviewData | null {
  const entry = cache.get(patientId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(patientId);
    return null;
  }
  return entry.data;
}

export function setCachedOverview(patientId: string, data: PatientOverviewData): void {
  cache.set(patientId, { data, expiresAt: Date.now() + TTL_MS });
}
