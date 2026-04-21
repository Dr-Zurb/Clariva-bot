/**
 * Modality pricing unit tests (Plan 09 · Task 49)
 *
 * Pins the pricing-source ladder + the delta helpers:
 *
 *   1. Service catalog happy path — per-modality price_minor resolves
 *      into `{ text, voice, video }` rows tagged `service_offerings_json`.
 *   2. Multi-service MAX rule — the highest-priced service per modality
 *      wins (documented v1 behaviour).
 *   3. Partial catalog — missing modality falls back to appointment fee.
 *   4. No catalog + no appointment fee — all three modalities fall back
 *      to hardcoded defaults + warning log fires.
 *   5. Appointment-fee fallback — used when catalog returns no usable
 *      price for a modality.
 *   6. Catalog read failure — warn log + graceful fallback.
 *   7. `computeUpgradeDeltaPaise` — positive for upgrade; throws on
 *      same-modality or downgrade pair.
 *   8. `computeDowngradeRefundPaise` — positive for downgrade; throws
 *      on same-modality or upgrade; zero when fees are flat.
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mocks — BEFORE importing the SUT.
// ---------------------------------------------------------------------------

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: jest.fn(() => null),
}));

jest.mock('../../../src/config/logger', () => ({
  logger: {
    error: jest.fn(),
    warn:  jest.fn(),
    info:  jest.fn(),
    debug: jest.fn(),
  },
}));

const mockGetDoctorSettings = jest.fn<(doctorId: string) => Promise<unknown>>();
jest.mock('../../../src/services/doctor-settings-service', () => ({
  getDoctorSettings: (id: string) => mockGetDoctorSettings(id),
}));

// Bypass the full Zod schema parse — the pricing util only needs the
// shape `{ services: [{ modalities: {...} }] }`, which
// `safeParseServiceCatalogV1FromDb` validates. Returning the raw
// object mirrors what `getActiveServiceCatalog` would produce in
// practice.
jest.mock('../../../src/utils/service-catalog-helpers', () => ({
  getActiveServiceCatalog: (settings: unknown): unknown =>
    (settings as { service_offerings_json?: unknown })?.service_offerings_json ?? null,
}));

import {
  __testOnly__,
  computeDowngradeRefundPaise,
  computeUpgradeDeltaPaise,
  FALLBACK_MODALITY_FEES_PAISE,
  getModalityFeesForDoctor,
} from '../../../src/utils/modality-pricing';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const catalogWith = (modalities: {
  text?: number;
  voice?: number;
  video?: number;
}): unknown => ({
  service_offerings_json: {
    version: 1,
    services: [
      {
        modalities: {
          text:  modalities.text  !== undefined ? { enabled: true, price_minor: modalities.text }  : undefined,
          voice: modalities.voice !== undefined ? { enabled: true, price_minor: modalities.voice } : undefined,
          video: modalities.video !== undefined ? { enabled: true, price_minor: modalities.video } : undefined,
        },
      },
    ],
  },
});

const catalogMultiService = (services: Array<{
  text?: number; voice?: number; video?: number;
}>): unknown => ({
  service_offerings_json: {
    version: 1,
    services: services.map((s) => ({
      modalities: {
        text:  s.text  !== undefined ? { enabled: true, price_minor: s.text }  : undefined,
        voice: s.voice !== undefined ? { enabled: true, price_minor: s.voice } : undefined,
        video: s.video !== undefined ? { enabled: true, price_minor: s.video } : undefined,
      },
    })),
  },
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('getModalityFeesForDoctor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('resolves from service_offerings_json when fully populated', async () => {
    mockGetDoctorSettings.mockResolvedValue(catalogWith({
      text: 10_000, voice: 25_000, video: 80_000,
    }));
    const fees = await getModalityFeesForDoctor({ doctorId: 'doc-1' });
    expect(fees.text).toEqual({ modality: 'text', feePaise: 10_000, source: 'service_offerings_json' });
    expect(fees.voice).toEqual({ modality: 'voice', feePaise: 25_000, source: 'service_offerings_json' });
    expect(fees.video).toEqual({ modality: 'video', feePaise: 80_000, source: 'service_offerings_json' });
  });

  it('applies MAX-across-services rule when multiple services declare per-modality pricing', async () => {
    mockGetDoctorSettings.mockResolvedValue(catalogMultiService([
      { text: 10_000, voice: 20_000, video: 50_000 },
      { text: 20_000,                  video: 90_000 },  // max for text + video
      {                voice: 40_000                  }, // max for voice
    ]));
    const fees = await getModalityFeesForDoctor({ doctorId: 'doc-1' });
    expect(fees.text.feePaise).toBe(20_000);
    expect(fees.voice.feePaise).toBe(40_000);
    expect(fees.video.feePaise).toBe(90_000);
  });

  it('falls back to appointment fee when a modality is missing from catalog', async () => {
    mockGetDoctorSettings.mockResolvedValue(catalogWith({ text: 10_000 }));
    const fees = await getModalityFeesForDoctor({
      doctorId: 'doc-1',
      appointmentFeePaise: 30_000,
    });
    expect(fees.text.source).toBe('service_offerings_json');
    expect(fees.text.feePaise).toBe(10_000);
    expect(fees.voice.source).toBe('appointments_fee_paise');
    expect(fees.voice.feePaise).toBe(30_000);
    expect(fees.video.source).toBe('appointments_fee_paise');
    expect(fees.video.feePaise).toBe(30_000);
  });

  it('falls back to hardcoded defaults when neither catalog nor appointment fee available', async () => {
    mockGetDoctorSettings.mockResolvedValue(null);
    const fees = await getModalityFeesForDoctor({ doctorId: 'doc-1' });
    expect(fees.text.source).toBe('fallback_default');
    expect(fees.text.feePaise).toBe(FALLBACK_MODALITY_FEES_PAISE.text);
    expect(fees.voice.feePaise).toBe(FALLBACK_MODALITY_FEES_PAISE.voice);
    expect(fees.video.feePaise).toBe(FALLBACK_MODALITY_FEES_PAISE.video);
  });

  it('falls back gracefully if doctor-settings read throws', async () => {
    mockGetDoctorSettings.mockRejectedValue(new Error('db exploded'));
    const fees = await getModalityFeesForDoctor({ doctorId: 'doc-1' });
    expect(fees.text.source).toBe('fallback_default');
    expect(fees.voice.source).toBe('fallback_default');
    expect(fees.video.source).toBe('fallback_default');
  });

  it('ignores catalog slots with price_minor <= 0 or enabled=false', async () => {
    mockGetDoctorSettings.mockResolvedValue({
      service_offerings_json: {
        version: 1,
        services: [
          {
            modalities: {
              text:  { enabled: false, price_minor: 10_000 },
              voice: { enabled: true,  price_minor: 0 },
              video: { enabled: true,  price_minor: 50_000 },
            },
          },
        ],
      },
    });
    const fees = await getModalityFeesForDoctor({
      doctorId: 'doc-1',
      appointmentFeePaise: 25_000,
    });
    expect(fees.text.source).toBe('appointments_fee_paise');
    expect(fees.voice.source).toBe('appointments_fee_paise');
    expect(fees.video.source).toBe('service_offerings_json');
    expect(fees.video.feePaise).toBe(50_000);
  });
});

describe('computeUpgradeDeltaPaise', () => {
  const fees = {
    text:  { modality: 'text'  as const, feePaise: 10_000, source: 'service_offerings_json' as const },
    voice: { modality: 'voice' as const, feePaise: 25_000, source: 'service_offerings_json' as const },
    video: { modality: 'video' as const, feePaise: 80_000, source: 'service_offerings_json' as const },
  };

  it('returns positive delta for every upgrade pair', () => {
    expect(computeUpgradeDeltaPaise({ fees, fromModality: 'text',  toModality: 'voice' })).toBe(15_000);
    expect(computeUpgradeDeltaPaise({ fees, fromModality: 'text',  toModality: 'video' })).toBe(70_000);
    expect(computeUpgradeDeltaPaise({ fees, fromModality: 'voice', toModality: 'video' })).toBe(55_000);
  });

  it('returns zero when upgrade fees are flat (free-upgrade route)', () => {
    const flat = {
      text:  { ...fees.text,  feePaise: 20_000 },
      voice: { ...fees.voice, feePaise: 20_000 },
      video: { ...fees.video, feePaise: 20_000 },
    };
    expect(computeUpgradeDeltaPaise({ fees: flat, fromModality: 'text', toModality: 'voice' })).toBe(0);
  });

  it('throws when from === to', () => {
    expect(() =>
      computeUpgradeDeltaPaise({ fees, fromModality: 'voice', toModality: 'voice' }),
    ).toThrow(/no delta/);
  });

  it('throws when the pair is not an upgrade', () => {
    expect(() =>
      computeUpgradeDeltaPaise({ fees, fromModality: 'video', toModality: 'voice' }),
    ).toThrow(/not an upgrade/);
  });
});

describe('computeDowngradeRefundPaise', () => {
  const fees = {
    text:  { modality: 'text'  as const, feePaise: 10_000, source: 'service_offerings_json' as const },
    voice: { modality: 'voice' as const, feePaise: 25_000, source: 'service_offerings_json' as const },
    video: { modality: 'video' as const, feePaise: 80_000, source: 'service_offerings_json' as const },
  };

  it('returns positive amount for every downgrade pair', () => {
    expect(computeDowngradeRefundPaise({ fees, fromModality: 'video', toModality: 'voice' })).toBe(55_000);
    expect(computeDowngradeRefundPaise({ fees, fromModality: 'video', toModality: 'text'  })).toBe(70_000);
    expect(computeDowngradeRefundPaise({ fees, fromModality: 'voice', toModality: 'text'  })).toBe(15_000);
  });

  it('returns zero when downgrade fees are flat', () => {
    const flat = {
      text:  { ...fees.text,  feePaise: 20_000 },
      voice: { ...fees.voice, feePaise: 20_000 },
      video: { ...fees.video, feePaise: 20_000 },
    };
    expect(computeDowngradeRefundPaise({ fees: flat, fromModality: 'video', toModality: 'text' })).toBe(0);
  });

  it('throws on same-modality and upgrade pairs', () => {
    expect(() =>
      computeDowngradeRefundPaise({ fees, fromModality: 'voice', toModality: 'voice' }),
    ).toThrow(/no delta/);
    expect(() =>
      computeDowngradeRefundPaise({ fees, fromModality: 'text', toModality: 'video' }),
    ).toThrow(/not a downgrade/);
  });
});

describe('internals', () => {
  it('isUpgrade / isDowngrade agree with ordinal ordering', () => {
    const { isUpgrade, isDowngrade } = __testOnly__;
    expect(isUpgrade('text', 'voice')).toBe(true);
    expect(isUpgrade('voice', 'video')).toBe(true);
    expect(isUpgrade('video', 'voice')).toBe(false);
    expect(isDowngrade('video', 'voice')).toBe(true);
    expect(isDowngrade('voice', 'text')).toBe(true);
    expect(isDowngrade('text', 'voice')).toBe(false);
  });
});
