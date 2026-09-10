import { getPatientQuickPeek } from "@/lib/api/patients";
import type { PatientQuickPeekData } from "@/types/patient";

const TTL_MS = 15 * 60 * 1000;
const VISIBLE_PREFETCH_LIMIT = 12;
const VISIBLE_PREFETCH_CONCURRENCY = 3;

interface CacheEntry {
  data: PatientQuickPeekData;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<PatientQuickPeekData>>();

export function getCachedQuickPeek(patientId: string): PatientQuickPeekData | null {
  const entry = cache.get(patientId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(patientId);
    return null;
  }
  return entry.data;
}

export function setCachedQuickPeek(patientId: string, data: PatientQuickPeekData): void {
  cache.set(patientId, { data, expiresAt: Date.now() + TTL_MS });
}

function fetchAndCache(
  token: string,
  patientId: string,
): Promise<PatientQuickPeekData> {
  const existing = inflight.get(patientId);
  if (existing) return existing;

  const promise = getPatientQuickPeek(token, patientId)
    .then((peek) => {
      setCachedQuickPeek(patientId, peek);
      return peek;
    })
    .finally(() => {
      inflight.delete(patientId);
    });

  inflight.set(patientId, promise);
  return promise;
}

/** Warm cache on pointer-enter so data is ready when the hover card opens. */
export function prefetchPatientQuickPeek(
  token: string,
  patientId: string,
): Promise<PatientQuickPeekData> | null {
  if (getCachedQuickPeek(patientId)) return null;
  return fetchAndCache(token, patientId);
}

export function loadPatientQuickPeek(
  token: string,
  patientId: string,
): Promise<PatientQuickPeekData> {
  const cached = getCachedQuickPeek(patientId);
  if (cached) return Promise.resolve(cached);
  return fetchAndCache(token, patientId);
}

/**
 * Idle-prefetch peeks for the first N visible list rows (capped concurrency).
 * Cheap enough because peek skips appointments/Rx/payments.
 */
export function prefetchVisiblePatientQuickPeeks(
  token: string,
  patientIds: string[],
): void {
  const ids = patientIds
    .slice(0, VISIBLE_PREFETCH_LIMIT)
    .filter((id) => !getCachedQuickPeek(id) && !inflight.has(id));
  if (ids.length === 0) return;

  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(VISIBLE_PREFETCH_CONCURRENCY, ids.length) },
    async () => {
      while (cursor < ids.length) {
        const id = ids[cursor]!;
        cursor += 1;
        try {
          await fetchAndCache(token, id);
        } catch {
          // Best-effort warm; hover path will retry.
        }
      }
    },
  );
  void Promise.all(workers);
}
