/**
 * clinic-branding-v1 — letterhead tokens and resolver output.
 *
 * Branding is per-doctor (`doctor_settings`). Registration number is
 * resolved from `doctor_verification` (verified only) and is never a
 * settings column (BRD-D2).
 */

export const LETTERHEAD_PRESETS = ['classic', 'centred', 'preprinted', 'banner'] as const;
export type LetterheadPreset = (typeof LETTERHEAD_PRESETS)[number];

export const BRANDING_ASSET_SLOTS = ['logo', 'header', 'footer', 'background'] as const;
export type BrandingAssetSlot = (typeof BRANDING_ASSET_SLOTS)[number];

export const LETTERHEAD_BACKGROUND_PRESETS = ['none', 'paper', 'cross', 'upload'] as const;
export type LetterheadBackgroundPreset = (typeof LETTERHEAD_BACKGROUND_PRESETS)[number];
export const DEFAULT_LETTERHEAD_BACKGROUND_PRESET: LetterheadBackgroundPreset = 'none';
export const DEFAULT_LETTERHEAD_BACKGROUND_OPACITY = 15;
export const BACKGROUND_OPACITY_MIN = 0;
export const BACKGROUND_OPACITY_MAX = 40;

export const LETTERHEAD_IMAGE_FITS = ['fit', 'fill', 'stretch'] as const;
export type LetterheadImageFit = (typeof LETTERHEAD_IMAGE_FITS)[number];
export const DEFAULT_BANNER_IMAGE_FIT: LetterheadImageFit = 'stretch';
export const DEFAULT_BACKGROUND_IMAGE_FIT: LetterheadImageFit = 'fill';

/** CSS object-fit: fit=contain, fill=cover, stretch=fill. */
export function letterheadImageFitCss(
  fit: LetterheadImageFit | null | undefined
): 'contain' | 'cover' | 'fill' {
  if (fit === 'fit') return 'contain';
  if (fit === 'stretch') return 'fill';
  return 'cover';
}

export const LETTERHEAD_PAGE_SIZES = ['a4', 'a5'] as const;
export type LetterheadPageSize = (typeof LETTERHEAD_PAGE_SIZES)[number];

export const LETTERHEAD_LOGO_SIZES = ['small', 'medium', 'large'] as const;
export type LetterheadLogoSize = (typeof LETTERHEAD_LOGO_SIZES)[number];

export const PATIENT_IDENTITY_PRESETS = [
  'open_letter',
  'compact',
  'grid',
] as const;
export type PatientIdentityPreset = (typeof PATIENT_IDENTITY_PRESETS)[number];

export const BRANDING_LOGO_MAX_BYTES = 2 * 1024 * 1024;
export const BRANDING_LOGO_ALLOWED_MIME = ['image/png', 'image/jpeg'] as const;
export type BrandingLogoMime = (typeof BRANDING_LOGO_ALLOWED_MIME)[number];

export const PREPRINT_MARGIN_MM_MIN = 0;
export const PREPRINT_MARGIN_MM_MAX = 80;
export const QUALIFICATIONS_MAX = 200;
export const ACCENT_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

export const DEFAULT_LETTERHEAD_PRESET: LetterheadPreset = 'classic';
export const DEFAULT_LETTERHEAD_PAGE_SIZE: LetterheadPageSize = 'a4';
export const DEFAULT_PREPRINT_MARGIN_TOP_MM = 40;
export const DEFAULT_PREPRINT_MARGIN_BOTTOM_MM = 30;
export const DEFAULT_LETTERHEAD_ACCENT = '#000000';
export const DEFAULT_LETTERHEAD_CHROME = DEFAULT_LETTERHEAD_ACCENT;
export const DEFAULT_LETTERHEAD_PATIENT = DEFAULT_LETTERHEAD_ACCENT;
export const DEFAULT_HEADER_HEIGHT_MM = 35;
export const DEFAULT_FOOTER_HEIGHT_MM = 20;
export const HEADER_HEIGHT_MM_MIN = 15;
export const HEADER_HEIGHT_MM_MAX = 80;
export const FOOTER_HEIGHT_MM_MIN = 10;
export const FOOTER_HEIGHT_MM_MAX = 60;
export const BANNER_BANDS_SUM_MAX_MM = 100;
export const PAGE_MARGIN_MM_MIN = 8;
export const PAGE_MARGIN_MM_MAX = 32;
export const DEFAULT_PAGE_MARGIN_MM = 12;
export const DEFAULT_LOGO_SIZE: LetterheadLogoSize = 'medium';
export const LETTERHEAD_TEXT_SIZES = ['small', 'medium', 'large'] as const;
export type LetterheadTextSize = (typeof LETTERHEAD_TEXT_SIZES)[number];
export const DEFAULT_LETTERHEAD_TEXT_SIZE: LetterheadTextSize = 'medium';

export type LetterheadTypeRole =
  | 'headerTitle'
  | 'headerMeta'
  | 'patientName'
  | 'patientNameCompact'
  | 'patientMeta'
  | 'bodyLabel'
  | 'bodyText';

const LETTERHEAD_TYPE_PT: Record<LetterheadTypeRole, Record<LetterheadTextSize, number>> = {
  headerTitle: { small: 12, medium: 14, large: 17 },
  headerMeta: { small: 8, medium: 9, large: 11 },
  patientName: { small: 11, medium: 13, large: 16 },
  patientNameCompact: { small: 10, medium: 11, large: 13 },
  patientMeta: { small: 8, medium: 9, large: 11 },
  bodyLabel: { small: 8, medium: 9, large: 11 },
  bodyText: { small: 9, medium: 10, large: 12 },
};

export function letterheadTypePt(
  role: LetterheadTypeRole,
  size?: LetterheadTextSize | null
): number {
  const key = size === 'small' || size === 'large' ? size : 'medium';
  return LETTERHEAD_TYPE_PT[role][key];
}

export const DEFAULT_PATIENT_IDENTITY_PRESET: PatientIdentityPreset = 'open_letter';
export const LETTERHEAD_FOOTER_LINE_MAX = 200;

export function logoSizePx(size: LetterheadLogoSize): number {
  if (size === 'small') return 40;
  if (size === 'large') return 80;
  return 56;
}

export type LetterheadLogoFormat = 'png' | 'jpg';

export interface LetterheadLogoBytes {
  bytes: Buffer;
  format: LetterheadLogoFormat;
  contentType: BrandingLogoMime;
}

/** Resolved letterhead for PDF + HTML surfaces (BRD-D7). */
export interface ResolvedLetterhead {
  qualifications: string | null;
  specialty: string | null;
  /** Present only when doctor_verification.status = 'verified'. */
  registrationNumber: string | null;
  clinicName: string | null;
  clinicAddress: string | null;
  preset: LetterheadPreset;
  pageSize: LetterheadPageSize;
  accentColor: string;
  /** Header + footer rule. */
  chromeColor: string;
  /** Patient-details hairline. */
  patientColor: string;
  preprintMarginTopMm: number;
  preprintMarginBottomMm: number;
  /** Buffer for react-pdf <Image>; null when missing or unreadable. */
  logo: LetterheadLogoBytes | null;
  logoPath: string | null;
  logoVersion: number;
  header: LetterheadLogoBytes | null;
  headerPath: string | null;
  headerVersion: number;
  footer: LetterheadLogoBytes | null;
  footerPath: string | null;
  footerVersion: number;
  background: LetterheadLogoBytes | null;
  backgroundPath: string | null;
  backgroundVersion: number;
  backgroundPreset: LetterheadBackgroundPreset;
  backgroundOpacity: number;
  headerFit: LetterheadImageFit;
  footerFit: LetterheadImageFit;
  backgroundFit: LetterheadImageFit;
  headerHeightMm: number;
  footerHeightMm: number;
  pageMarginTopMm: number;
  pageMarginRightMm: number;
  pageMarginBottomMm: number;
  pageMarginLeftMm: number;
  logoSize: LetterheadLogoSize;
  headerTextSize: LetterheadTextSize;
  patientTextSize: LetterheadTextSize;
  bodyTextSize: LetterheadTextSize;
  patientIdentityPreset: PatientIdentityPreset;
  showPatientPhone: boolean;
  showPatientGuardian: boolean;
  showPatientMrn: boolean;
  showPatientAddress: boolean;
  footerLine: string | null;
  hideHaloCredit: boolean;
}
