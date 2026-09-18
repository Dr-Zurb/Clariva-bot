/**
 * clinic-branding-v1 — resolveLetterhead + path helpers.
 */

import { describe, expect, it, beforeEach, jest } from '@jest/globals';

// Untyped mocks — the service is imported after jest.mock, so the
// real getDoctorSettings signature is not available here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockGetDoctorSettings = jest.fn() as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockFrom = jest.fn() as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockStorageFrom = jest.fn() as any;

jest.mock('../../../src/services/doctor-settings-service', () => ({
  getDoctorSettings: (...args: unknown[]) => mockGetDoctorSettings(...args),
}));

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: () => ({
    from: (...args: unknown[]) => mockFrom(...args),
    storage: { from: (...args: unknown[]) => mockStorageFrom(...args) },
  }),
}));

jest.mock('../../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('../../../src/utils/audit-logger', () => ({
  logDataModification: jest.fn(async () => undefined),
  logDataAccess: jest.fn(async () => undefined),
}));

import {
  __clearLetterheadLogoCacheForTests,
  brandingAssetPath,
  brandingLogoPath,
  putBrandingLogo,
  resolveLetterhead,
  signClinicBrandingPath,
} from '../../../src/services/letterhead-service';
import { ValidationError } from '../../../src/utils/errors';

describe('letterhead-service', () => {
  beforeEach(() => {
    mockGetDoctorSettings.mockReset();
    mockFrom.mockReset();
    mockStorageFrom.mockReset();
    __clearLetterheadLogoCacheForTests();
  });

  describe('brandingLogoPath', () => {
    it('uses doctor_id-first PNG key', () => {
      expect(brandingLogoPath('doc-1', 'image/png')).toBe('doc-1/logo.png');
    });

    it('rejects non-image mime', () => {
      expect(() => brandingLogoPath('doc-1', 'application/pdf')).toThrow(
        ValidationError,
      );
    });
  });

  describe('brandingAssetPath', () => {
    it('uses doctor_id-first keys per slot', () => {
      expect(brandingAssetPath('doc-1', 'header', 'image/jpeg')).toBe(
        'doc-1/header.jpg',
      );
      expect(brandingAssetPath('doc-1', 'footer', 'image/png')).toBe(
        'doc-1/footer.png',
      );
    });
  });

  describe('resolveLetterhead', () => {
    it('omits registration_number unless verification is verified', async () => {
      mockGetDoctorSettings.mockResolvedValue({
        practice_name: 'Halo Clinic',
        specialty: 'GP',
        address_summary: '1 Main St',
        qualifications: 'MBBS',
        letterhead_preset: 'classic',
        page_size: 'a4',
        logo_path: null,
        logo_version: 0,
      });
      mockFrom.mockReturnValue({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { status: 'pending_review', registration_number: 'REG-1' },
              error: null,
            }),
          }),
        }),
      });

      const resolved = await resolveLetterhead('doc-1', 'cid');
      expect(resolved.registrationNumber).toBeNull();
      expect(resolved.clinicName).toBe('Halo Clinic');
      expect(resolved.qualifications).toBe('MBBS');
      expect(resolved.logo).toBeNull();
      expect(resolved.header).toBeNull();
      expect(resolved.footer).toBeNull();
      expect(resolved.headerHeightMm).toBe(35);
      expect(resolved.footerHeightMm).toBe(20);
      expect(resolved.logoSize).toBe('medium');
      expect(resolved.patientIdentityPreset).toBe('open_letter');
      expect(resolved.pageMarginTopMm).toBe(12);
      expect(resolved.hideHaloCredit).toBe(false);
      expect(resolved.chromeColor).toBe('#000000');
      expect(resolved.patientColor).toBe('#000000');
      expect(resolved.backgroundPreset).toBe('none');
      expect(resolved.background).toBeNull();
      expect(resolved.backgroundOpacity).toBe(15);
      expect(resolved.headerTextSize).toBe('medium');
      expect(resolved.patientTextSize).toBe('medium');
      expect(resolved.bodyTextSize).toBe('medium');
    });

    it('returns verified registration number', async () => {
      mockGetDoctorSettings.mockResolvedValue({
        practice_name: 'Halo Clinic',
        letterhead_preset: 'centred',
        page_size: 'a5',
        logo_path: null,
        logo_version: 0,
      });
      mockFrom.mockReturnValue({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { status: 'verified', registration_number: '  REG-9  ' },
              error: null,
            }),
          }),
        }),
      });

      const resolved = await resolveLetterhead('doc-1', 'cid');
      expect(resolved.registrationNumber).toBe('REG-9');
      expect(resolved.preset).toBe('centred');
      expect(resolved.pageSize).toBe('a5');
    });
  });

  describe('signClinicBrandingPath', () => {
    it('signs from the given path without another settings read', async () => {
      mockStorageFrom.mockReturnValue({
        createSignedUrl: async () => ({
          data: { signedUrl: 'https://example.test/signed' },
          error: null,
        }),
      });

      const url = await signClinicBrandingPath(
        'doc-1/logo.png',
        'cid',
        'doc-1',
        'logo'
      );
      expect(url).toBe('https://example.test/signed');
      expect(mockGetDoctorSettings).not.toHaveBeenCalled();
    });
  });

  describe('putBrandingLogo', () => {
    it('rejects bytes that are not a PNG or JPEG', async () => {
      await expect(putBrandingLogo('doc-1', Buffer.from('not-an-image'), 'cid')).rejects.toBeInstanceOf(
        ValidationError
      );
    });

    it('uploads sniffed PNG and returns a preview URL', async () => {
      const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d]);
      mockStorageFrom.mockReturnValue({
        remove: async () => ({ error: null }),
        upload: async () => ({ error: null }),
        createSignedUrl: async () => ({
          data: { signedUrl: 'https://example.test/logo' },
          error: null,
        }),
      });
      mockFrom.mockReturnValue({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { logo_version: 1 }, error: null }),
          }),
        }),
        update: () => ({
          eq: async () => ({ error: null }),
        }),
      });

      const result = await putBrandingLogo('doc-1', png, 'cid');
      expect(result.logoVersion).toBe(2);
      expect(result.logoPreviewUrl).toBe('https://example.test/logo');
    });
  });
});
