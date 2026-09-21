import { describe, expect, it, jest } from '@jest/globals';
import {
  cacheGet,
  cacheGetBytes,
  cacheSet,
  cacheSetBytes,
  invalidatePrescriptionPdfCache,
  pdfCacheGeneration,
  withPdfBytesInflight,
  withPdfGenerateInflight,
} from '../../../src/services/prescription-pdf-cache';

const RX_ID = '11111111-1111-4111-8111-111111111111';

const SAMPLE = {
  storagePath: 'doc/rx.pdf',
  signedUrl: 'https://storage.example/rx.pdf',
  generatedAt: '2026-08-25T00:00:00.000Z',
  byteCount: 12,
  cacheHit: false,
};

describe('prescription-pdf-cache', () => {
  it('returns a cache hit until invalidated', () => {
    invalidatePrescriptionPdfCache(RX_ID);
    expect(cacheGet(RX_ID)).toBeNull();

    cacheSet(RX_ID, SAMPLE);

    const hit = cacheGet(RX_ID);
    expect(hit?.cacheHit).toBe(true);
    expect(hit?.signedUrl).toBe('https://storage.example/rx.pdf');

    invalidatePrescriptionPdfCache(RX_ID);
    expect(cacheGet(RX_ID)).toBeNull();
  });

  it('joins concurrent generate callers onto one factory', async () => {
    invalidatePrescriptionPdfCache(RX_ID);
    let resolveFactory!: (value: typeof SAMPLE) => void;
    const factory = jest.fn(
      () =>
        new Promise<typeof SAMPLE>((resolve) => {
          resolveFactory = resolve;
        })
    );

    const first = withPdfGenerateInflight(RX_ID, factory);
    const second = withPdfGenerateInflight(RX_ID, factory);
    expect(factory).toHaveBeenCalledTimes(1);

    resolveFactory(SAMPLE);
    await expect(first).resolves.toEqual(SAMPLE);
    await expect(second).resolves.toEqual(SAMPLE);
  });

  it('stores bytes until invalidated', () => {
    invalidatePrescriptionPdfCache(RX_ID);
    const bytes = Buffer.from('%PDF-stub%');
    cacheSetBytes(RX_ID, bytes);
    expect(cacheGetBytes(RX_ID)?.equals(bytes)).toBe(true);
    invalidatePrescriptionPdfCache(RX_ID);
    expect(cacheGetBytes(RX_ID)).toBeNull();
  });

  it('joins concurrent byte callers onto one factory', async () => {
    invalidatePrescriptionPdfCache(RX_ID);
    let resolveFactory!: (value: Buffer) => void;
    const factory = jest.fn(
      () =>
        new Promise<Buffer>((resolve) => {
          resolveFactory = resolve;
        })
    );

    const first = withPdfBytesInflight(RX_ID, factory);
    const second = withPdfBytesInflight(RX_ID, factory);
    expect(factory).toHaveBeenCalledTimes(1);

    const bytes = Buffer.from('%PDF-join%');
    resolveFactory(bytes);
    await expect(first).resolves.toBe(bytes);
    await expect(second).resolves.toBe(bytes);
  });

  it('does not join an in-flight generate after invalidate', async () => {
    invalidatePrescriptionPdfCache(RX_ID);
    const factoryA = jest.fn(
      () =>
        new Promise<typeof SAMPLE>(() => {
          /* hang — stale generate must not be joined */
        })
    );
    void withPdfGenerateInflight(RX_ID, factoryA);
    invalidatePrescriptionPdfCache(RX_ID);

    const factoryB = jest.fn(async () => SAMPLE);
    await expect(withPdfGenerateInflight(RX_ID, factoryB)).resolves.toEqual(SAMPLE);
    expect(factoryB).toHaveBeenCalledTimes(1);
  });

  it('drops a stale render so it cannot recache after a save', () => {
    invalidatePrescriptionPdfCache(RX_ID);
    const startedAtGen = pdfCacheGeneration(RX_ID);
    const stale = Buffer.from('%PDF-three-meds%');
    const fresh = Buffer.from('%PDF-four-meds%');

    invalidatePrescriptionPdfCache(RX_ID);
    cacheSetBytes(RX_ID, stale, startedAtGen);
    expect(cacheGetBytes(RX_ID)).toBeNull();

    cacheSetBytes(RX_ID, fresh, pdfCacheGeneration(RX_ID));
    expect(cacheGetBytes(RX_ID)?.equals(fresh)).toBe(true);
  });
});
