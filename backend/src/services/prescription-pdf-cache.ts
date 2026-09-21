/**
 * 5-min in-memory cache for prescription PDF signed URLs and bytes.
 *
 * Kept in its own module so `prescription-service` can invalidate on
 * save without importing `@react-pdf/renderer` (ESM).
 *
 * Bytes are stored separately from the signed-URL result so print can
 * take the rendered buffer before upload+sign finishes.
 */

const CACHE_TTL_MS = 5 * 60 * 1000;

/** Mirrors `PrescriptionPdfResult` without importing the renderer module. */
interface CachedPdfResult {
  storagePath: string;
  signedUrl: string;
  generatedAt: string;
  byteCount: number;
  cacheHit: boolean;
}

interface CacheEntry {
  result: CachedPdfResult;
  expires: number;
}

interface BytesCacheEntry {
  bytes: Buffer;
  expires: number;
}

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<CachedPdfResult>>();
const bytesCache = new Map<string, BytesCacheEntry>();
const bytesInflight = new Map<string, Promise<unknown>>();
/** Bumped on invalidate so a stale in-flight render cannot recache. */
const generation = new Map<string, number>();

export function pdfCacheGeneration(prescriptionId: string): number {
  return generation.get(prescriptionId) ?? 0;
}

function generationMatches(
  prescriptionId: string,
  startedAtGen: number | undefined,
): boolean {
  return startedAtGen === undefined || generation.get(prescriptionId) === startedAtGen;
}

/**
 * Coalesce concurrent generate/print callers onto one render+upload.
 * `invalidatePrescriptionPdfCache` drops the in-flight entry so a
 * forced regenerate does not join a stale generate.
 */
export function withPdfGenerateInflight(
  prescriptionId: string,
  factory: () => Promise<CachedPdfResult>
): Promise<CachedPdfResult> {
  const existing = inflight.get(prescriptionId);
  if (existing) return existing;

  const promise = factory().finally(() => {
    if (inflight.get(prescriptionId) === promise) {
      inflight.delete(prescriptionId);
    }
  });
  inflight.set(prescriptionId, promise);
  return promise;
}

/**
 * Coalesce callers that only need the rendered buffer (doctor print)
 * so they do not wait for upload+sign.
 */
export function withPdfBytesInflight<T>(
  prescriptionId: string,
  factory: () => Promise<T>
): Promise<T> {
  const existing = bytesInflight.get(prescriptionId);
  if (existing) return existing as Promise<T>;

  const promise = factory().finally(() => {
    if (bytesInflight.get(prescriptionId) === promise) {
      bytesInflight.delete(prescriptionId);
    }
  });
  bytesInflight.set(prescriptionId, promise);
  return promise;
}

export function cacheGet(prescriptionId: string): CachedPdfResult | null {
  const entry = cache.get(prescriptionId);
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    cache.delete(prescriptionId);
    return null;
  }
  // Mark cacheHit=true even though the underlying file/signed URL was
  // produced earlier. The signedUrl is still valid for ~24h from
  // mint time, so a 5-min cache is comfortably within its lifetime.
  return { ...entry.result, cacheHit: true };
}

export function cacheSet(
  prescriptionId: string,
  result: CachedPdfResult,
  startedAtGen?: number,
): void {
  if (!generationMatches(prescriptionId, startedAtGen)) return;
  cache.set(prescriptionId, {
    result: { ...result, cacheHit: false },
    expires: Date.now() + CACHE_TTL_MS,
  });
}

export function cacheGetBytes(prescriptionId: string): Buffer | null {
  const entry = bytesCache.get(prescriptionId);
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    bytesCache.delete(prescriptionId);
    return null;
  }
  return entry.bytes;
}

export function cacheSetBytes(
  prescriptionId: string,
  bytes: Buffer,
  startedAtGen?: number,
): void {
  if (!generationMatches(prescriptionId, startedAtGen)) return;
  bytesCache.set(prescriptionId, {
    bytes,
    expires: Date.now() + CACHE_TTL_MS,
  });
}

/** Drop the in-memory entry so the next print re-renders (unsent) or remints (sent). */
export function invalidatePrescriptionPdfCache(prescriptionId: string): void {
  generation.set(prescriptionId, pdfCacheGeneration(prescriptionId) + 1);
  cache.delete(prescriptionId);
  inflight.delete(prescriptionId);
  bytesCache.delete(prescriptionId);
  bytesInflight.delete(prescriptionId);
}
