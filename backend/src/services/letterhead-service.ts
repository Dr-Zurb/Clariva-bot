/**
 * clinic-branding-v1 / Phase 2 — letterhead resolver + branding assets.
 *
 * Public surface:
 *   - `resolveLetterhead(doctorId)` — single read path for PDF + HTML
 *     (BRD-D7). Soft-fails every optional field.
 *   - `putBrandingAsset` / `putBrandingLogo` (service-role bytes) /
 *     `createBrandingLogoUploadUrl` / `registerBrandingLogo` /
 *     `deleteBrandingAsset` / `getBrandingAssetSignedUrl`.
 *
 * Images never reach react-pdf as a URL (BRD-D5): this service
 * downloads bytes via the service-role client and caches them on
 * `doctorId + slot + version`.
 *
 * Never log logo/header/footer paths, registration numbers, or names.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdminClient } from '../config/database';
import { logger } from '../config/logger';
import { ForbiddenError, InternalError, NotFoundError, ValidationError } from '../utils/errors';
import { handleSupabaseError } from '../utils/db-helpers';
import { logDataModification } from '../utils/audit-logger';
import { getDoctorSettings } from './doctor-settings-service';
import type {
  BrandingAssetSlot,
  BrandingLogoMime,
  LetterheadLogoBytes,
  LetterheadLogoFormat,
  LetterheadPageSize,
  LetterheadPreset,
  ResolvedLetterhead,
} from '../types/letterhead';
import {
  ACCENT_COLOR_RE,
  BANNER_BANDS_SUM_MAX_MM,
  BRANDING_LOGO_ALLOWED_MIME,
  BRANDING_LOGO_MAX_BYTES,
  DEFAULT_FOOTER_HEIGHT_MM,
  DEFAULT_HEADER_HEIGHT_MM,
  DEFAULT_LETTERHEAD_ACCENT,
  DEFAULT_LETTERHEAD_PAGE_SIZE,
  DEFAULT_LETTERHEAD_PRESET,
  BACKGROUND_OPACITY_MAX,
  BACKGROUND_OPACITY_MIN,
  DEFAULT_LETTERHEAD_BACKGROUND_OPACITY,
  DEFAULT_LETTERHEAD_BACKGROUND_PRESET,
  DEFAULT_BACKGROUND_IMAGE_FIT,
  DEFAULT_BANNER_IMAGE_FIT,
  DEFAULT_LETTERHEAD_TEXT_SIZE,
  DEFAULT_LOGO_SIZE,
  DEFAULT_PAGE_MARGIN_MM,
  DEFAULT_PATIENT_IDENTITY_PRESET,
  DEFAULT_PREPRINT_MARGIN_BOTTOM_MM,
  DEFAULT_PREPRINT_MARGIN_TOP_MM,
  FOOTER_HEIGHT_MM_MAX,
  FOOTER_HEIGHT_MM_MIN,
  HEADER_HEIGHT_MM_MAX,
  HEADER_HEIGHT_MM_MIN,
  LETTERHEAD_BACKGROUND_PRESETS,
  LETTERHEAD_IMAGE_FITS,
  LETTERHEAD_FOOTER_LINE_MAX,
  LETTERHEAD_LOGO_SIZES,
  LETTERHEAD_TEXT_SIZES,
  LETTERHEAD_PAGE_SIZES,
  LETTERHEAD_PRESETS,
  PAGE_MARGIN_MM_MAX,
  PAGE_MARGIN_MM_MIN,
  PATIENT_IDENTITY_PRESETS,
} from '../types/letterhead';
import type {
  LetterheadBackgroundPreset,
  LetterheadImageFit,
  LetterheadLogoSize,
  LetterheadTextSize,
  PatientIdentityPreset,
} from '../types/letterhead';
import { loadBuiltinBackground } from '../templates/prescription-pdf/backgrounds/load-builtin';

export const CLINIC_BRANDING_BUCKET = 'clinic-branding';

const LOGO_SIGNED_TTL_SEC = 300;
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47] as const;
const JPEG_MAGIC = [0xff, 0xd8, 0xff] as const;

const MIME_EXT: Record<BrandingLogoMime, LetterheadLogoFormat> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
};

type AllowedMime = BrandingLogoMime;

const SLOT_FILE: Record<BrandingAssetSlot, string> = {
  logo: 'logo',
  header: 'header',
  footer: 'footer',
  background: 'background',
};

const SLOT_PATH_COL: Record<
  BrandingAssetSlot,
  'logo_path' | 'header_path' | 'footer_path' | 'background_path'
> = {
  logo: 'logo_path',
  header: 'header_path',
  footer: 'footer_path',
  background: 'background_path',
};

const SLOT_VERSION_COL: Record<
  BrandingAssetSlot,
  'logo_version' | 'header_version' | 'footer_version' | 'background_version'
> = {
  logo: 'logo_version',
  header: 'header_version',
  footer: 'footer_version',
  background: 'background_version',
};

interface AssetCacheEntry {
  key: string;
  asset: LetterheadLogoBytes;
}

const assetCache = new Map<string, AssetCacheEntry>();

function requireAdmin(): SupabaseClient {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }
  return admin;
}

function cacheStoreKey(slot: BrandingAssetSlot, doctorId: string): string {
  return `${slot}:${doctorId}`;
}

function cacheVersionKey(doctorId: string, slot: BrandingAssetSlot, version: number): string {
  return `${doctorId}:${slot}:${version}`;
}

export function brandingAssetPath(
  doctorId: string,
  slot: BrandingAssetSlot,
  contentType: string
): string {
  const ext = MIME_EXT[contentType as AllowedMime];
  if (!ext) {
    throw new ValidationError('Invalid file type. Allowed: image/png, image/jpeg');
  }
  return `${doctorId}/${SLOT_FILE[slot]}.${ext}`;
}

export function brandingLogoPath(doctorId: string, contentType: string): string {
  return brandingAssetPath(doctorId, 'logo', contentType);
}

function assertOwnedLogoPath(doctorId: string, path: string): void {
  const prefix = `${doctorId}/`;
  if (!path.startsWith(prefix) || path.includes('..')) {
    throw new ForbiddenError('Logo path does not belong to this doctor');
  }
}

function sniffLogo(buf: Buffer): LetterheadLogoBytes | null {
  if (buf.length < 4 || buf.length > BRANDING_LOGO_MAX_BYTES) return null;
  const isPng = PNG_MAGIC.every((b, i) => buf[i] === b);
  if (isPng) {
    return { bytes: buf, format: 'png', contentType: 'image/png' };
  }
  const isJpeg = JPEG_MAGIC.every((b, i) => buf[i] === b);
  if (isJpeg) {
    return { bytes: buf, format: 'jpg', contentType: 'image/jpeg' };
  }
  return null;
}

function parsePreset(raw: string | null | undefined): LetterheadPreset {
  if (raw && (LETTERHEAD_PRESETS as readonly string[]).includes(raw)) {
    return raw as LetterheadPreset;
  }
  return DEFAULT_LETTERHEAD_PRESET;
}

function parsePageSize(raw: string | null | undefined): LetterheadPageSize {
  if (raw && (LETTERHEAD_PAGE_SIZES as readonly string[]).includes(raw)) {
    return raw as LetterheadPageSize;
  }
  return DEFAULT_LETTERHEAD_PAGE_SIZE;
}

function parseAccent(raw: string | null | undefined): string {
  const trimmed = raw?.trim() ?? '';
  return ACCENT_COLOR_RE.test(trimmed) ? trimmed : DEFAULT_LETTERHEAD_ACCENT;
}

function clampMm(raw: number | null | undefined, fallback: number): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return fallback;
  return Math.min(80, Math.max(0, Math.round(raw)));
}

function clampRange(
  raw: number | null | undefined,
  min: number,
  max: number,
  fallback: number
): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return fallback;
  return Math.min(max, Math.max(min, Math.round(raw)));
}

function clampHeaderMm(raw: number | null | undefined): number {
  return clampRange(raw, HEADER_HEIGHT_MM_MIN, HEADER_HEIGHT_MM_MAX, DEFAULT_HEADER_HEIGHT_MM);
}

function clampFooterMm(raw: number | null | undefined): number {
  return clampRange(raw, FOOTER_HEIGHT_MM_MIN, FOOTER_HEIGHT_MM_MAX, DEFAULT_FOOTER_HEIGHT_MM);
}

function parseLogoSize(raw: string | null | undefined): LetterheadLogoSize {
  if (raw && (LETTERHEAD_LOGO_SIZES as readonly string[]).includes(raw)) {
    return raw as LetterheadLogoSize;
  }
  return DEFAULT_LOGO_SIZE;
}

function parseTextSize(raw: string | null | undefined): LetterheadTextSize {
  if (raw && (LETTERHEAD_TEXT_SIZES as readonly string[]).includes(raw)) {
    return raw as LetterheadTextSize;
  }
  return DEFAULT_LETTERHEAD_TEXT_SIZE;
}

function parsePatientPreset(raw: string | null | undefined): PatientIdentityPreset {
  if (raw === 'minimal') return DEFAULT_PATIENT_IDENTITY_PRESET;
  if (raw && (PATIENT_IDENTITY_PRESETS as readonly string[]).includes(raw)) {
    return raw as PatientIdentityPreset;
  }
  return DEFAULT_PATIENT_IDENTITY_PRESET;
}

function parseBackgroundPreset(raw: string | null | undefined): LetterheadBackgroundPreset {
  if (raw && (LETTERHEAD_BACKGROUND_PRESETS as readonly string[]).includes(raw)) {
    return raw as LetterheadBackgroundPreset;
  }
  return DEFAULT_LETTERHEAD_BACKGROUND_PRESET;
}

function parseImageFit(
  raw: string | null | undefined,
  fallback: LetterheadImageFit
): LetterheadImageFit {
  if (raw && (LETTERHEAD_IMAGE_FITS as readonly string[]).includes(raw)) {
    return raw as LetterheadImageFit;
  }
  return fallback;
}

function clampBackgroundOpacity(raw: number | null | undefined): number {
  return clampRange(
    raw,
    BACKGROUND_OPACITY_MIN,
    BACKGROUND_OPACITY_MAX,
    DEFAULT_LETTERHEAD_BACKGROUND_OPACITY
  );
}

function clampPageMargin(raw: number | null | undefined): number {
  return clampRange(raw, PAGE_MARGIN_MM_MIN, PAGE_MARGIN_MM_MAX, DEFAULT_PAGE_MARGIN_MM);
}

function parseFooterLine(raw: string | null | undefined): string | null {
  const t = raw?.trim() || '';
  if (!t) return null;
  return t.slice(0, LETTERHEAD_FOOTER_LINE_MAX);
}

function clampBannerHeights(
  headerRaw: number | null | undefined,
  footerRaw: number | null | undefined
): { headerHeightMm: number; footerHeightMm: number } {
  const headerHeightMm = clampHeaderMm(headerRaw);
  let footerHeightMm = clampFooterMm(footerRaw);
  if (headerHeightMm + footerHeightMm > BANNER_BANDS_SUM_MAX_MM) {
    footerHeightMm = Math.max(FOOTER_HEIGHT_MM_MIN, BANNER_BANDS_SUM_MAX_MM - headerHeightMm);
  }
  return { headerHeightMm, footerHeightMm };
}

/**
 * Verified registration number only. Soft-fails to null — never throws
 * into the PDF path.
 */
async function getVerifiedRegistrationNumber(
  doctorId: string,
  correlationId: string
): Promise<string | null> {
  const admin = getSupabaseAdminClient();
  if (!admin) return null;
  try {
    const { data, error } = await admin
      .from('doctor_verification')
      .select('status, registration_number')
      .eq('doctor_id', doctorId)
      .maybeSingle();
    if (error || !data) return null;
    const row = data as { status: string; registration_number: string | null };
    if (row.status !== 'verified') return null;
    const n = row.registration_number?.trim();
    return n && n.length > 0 ? n : null;
  } catch (err) {
    logger.warn(
      {
        correlationId,
        doctorId,
        error: err instanceof Error ? err.message : String(err),
      },
      'letterhead: verification lookup soft-failed'
    );
    return null;
  }
}

async function downloadAssetBytes(
  path: string,
  correlationId: string,
  doctorId: string,
  slot: BrandingAssetSlot
): Promise<LetterheadLogoBytes | null> {
  const admin = getSupabaseAdminClient();
  if (!admin) return null;
  try {
    const { data, error } = await admin.storage.from(CLINIC_BRANDING_BUCKET).download(path);
    if (error || !data) return null;
    const buf = Buffer.from(await data.arrayBuffer());
    return sniffLogo(buf);
  } catch (err) {
    logger.warn(
      {
        correlationId,
        doctorId,
        slot,
        error: err instanceof Error ? err.message : String(err),
      },
      'letterhead: branding asset download soft-failed'
    );
    return null;
  }
}

async function resolveAsset(
  doctorId: string,
  slot: BrandingAssetSlot,
  path: string | null,
  version: number,
  correlationId: string
): Promise<LetterheadLogoBytes | null> {
  if (!path) return null;
  const storeKey = cacheStoreKey(slot, doctorId);
  const versionKey = cacheVersionKey(doctorId, slot, version);
  const cached = assetCache.get(storeKey);
  if (cached && cached.key === versionKey) {
    return cached.asset;
  }
  const asset = await downloadAssetBytes(path, correlationId, doctorId, slot);
  if (asset) {
    assetCache.set(storeKey, { key: versionKey, asset });
  } else {
    assetCache.delete(storeKey);
  }
  return asset;
}

export async function resolveLetterhead(
  doctorId: string,
  correlationId: string
): Promise<ResolvedLetterhead> {
  const [settings, registrationNumber] = await Promise.all([
    getDoctorSettings(doctorId),
    getVerifiedRegistrationNumber(doctorId, correlationId),
  ]);

  const logoPath = settings?.logo_path?.trim() || null;
  const logoVersion =
    typeof settings?.logo_version === 'number' && settings.logo_version >= 0
      ? settings.logo_version
      : 0;
  const headerPath = settings?.header_path?.trim() || null;
  const headerVersion =
    typeof settings?.header_version === 'number' && settings.header_version >= 0
      ? settings.header_version
      : 0;
  const footerPath = settings?.footer_path?.trim() || null;
  const footerVersion =
    typeof settings?.footer_version === 'number' && settings.footer_version >= 0
      ? settings.footer_version
      : 0;
  const backgroundPath = settings?.background_path?.trim() || null;
  const backgroundVersion =
    typeof settings?.background_version === 'number' && settings.background_version >= 0
      ? settings.background_version
      : 0;
  const backgroundPreset = parseBackgroundPreset(settings?.letterhead_background_preset);
  const { headerHeightMm, footerHeightMm } = clampBannerHeights(
    settings?.header_height_mm,
    settings?.footer_height_mm
  );

  const [logo, header, footer, uploadedBackground] = await Promise.all([
    resolveAsset(doctorId, 'logo', logoPath, logoVersion, correlationId),
    resolveAsset(doctorId, 'header', headerPath, headerVersion, correlationId),
    resolveAsset(doctorId, 'footer', footerPath, footerVersion, correlationId),
    resolveAsset(doctorId, 'background', backgroundPath, backgroundVersion, correlationId),
  ]);

  const background =
    backgroundPreset === 'paper' || backgroundPreset === 'cross'
      ? loadBuiltinBackground(backgroundPreset)
      : backgroundPreset === 'upload'
        ? uploadedBackground
        : null;

  return {
    qualifications: settings?.qualifications?.trim() || null,
    specialty: settings?.specialty?.trim() || null,
    registrationNumber,
    clinicName: settings?.practice_name?.trim() || null,
    clinicAddress: settings?.address_summary?.trim() || null,
    preset: parsePreset(settings?.letterhead_preset),
    pageSize: parsePageSize(settings?.page_size),
    accentColor: parseAccent(settings?.letterhead_accent_color),
    chromeColor: parseAccent(settings?.letterhead_chrome_color),
    patientColor: parseAccent(settings?.letterhead_patient_color),
    preprintMarginTopMm: clampMm(settings?.preprint_margin_top_mm, DEFAULT_PREPRINT_MARGIN_TOP_MM),
    preprintMarginBottomMm: clampMm(
      settings?.preprint_margin_bottom_mm,
      DEFAULT_PREPRINT_MARGIN_BOTTOM_MM
    ),
    logo,
    logoPath,
    logoVersion,
    header,
    headerPath,
    headerVersion,
    footer,
    footerPath,
    footerVersion,
    background,
    backgroundPath,
    backgroundVersion,
    backgroundPreset,
    backgroundOpacity: clampBackgroundOpacity(settings?.letterhead_background_opacity),
    headerFit: parseImageFit(settings?.letterhead_header_fit, DEFAULT_BANNER_IMAGE_FIT),
    footerFit: parseImageFit(settings?.letterhead_footer_fit, DEFAULT_BANNER_IMAGE_FIT),
    backgroundFit: parseImageFit(settings?.letterhead_background_fit, DEFAULT_BACKGROUND_IMAGE_FIT),
    headerHeightMm,
    footerHeightMm,
    pageMarginTopMm: clampPageMargin(settings?.page_margin_top_mm),
    pageMarginRightMm: clampPageMargin(settings?.page_margin_right_mm),
    pageMarginBottomMm: clampPageMargin(settings?.page_margin_bottom_mm),
    pageMarginLeftMm: clampPageMargin(settings?.page_margin_left_mm),
    logoSize: parseLogoSize(settings?.logo_size),
    headerTextSize: parseTextSize(settings?.letterhead_header_text_size),
    patientTextSize: parseTextSize(settings?.letterhead_patient_text_size),
    bodyTextSize: parseTextSize(settings?.letterhead_body_text_size),
    patientIdentityPreset: parsePatientPreset(settings?.patient_identity_preset),
    showPatientPhone: settings?.show_patient_phone !== false,
    showPatientGuardian: settings?.show_patient_guardian !== false,
    showPatientMrn: settings?.show_patient_mrn !== false,
    showPatientAddress: settings?.show_patient_address !== false,
    footerLine: parseFooterLine(settings?.letterhead_footer_line),
    hideHaloCredit: settings?.hide_halo_credit === true,
  };
}

export async function createBrandingLogoUploadUrl(
  doctorId: string,
  contentType: string,
  correlationId: string
): Promise<{ path: string; token: string }> {
  if (!BRANDING_LOGO_ALLOWED_MIME.includes(contentType as AllowedMime)) {
    throw new ValidationError('Invalid file type. Allowed: image/png, image/jpeg');
  }
  const admin = requireAdmin();
  const path = brandingLogoPath(doctorId, contentType);
  const { data, error } = await admin.storage
    .from(CLINIC_BRANDING_BUCKET)
    .createSignedUploadUrl(path, { upsert: true });
  if (error) {
    handleSupabaseError(error, correlationId);
  }
  if (!data?.path || !data?.token) {
    throw new InternalError('Failed to create branding upload URL');
  }
  logger.info(
    { correlationId, doctorId, event: 'branding_logo_upload_url_minted' },
    'branding_logo_upload_url_minted'
  );
  return { path: data.path, token: data.token };
}

async function persistAssetPointer(
  admin: SupabaseClient,
  doctorId: string,
  slot: BrandingAssetSlot,
  path: string,
  correlationId: string
): Promise<number> {
  const versionCol = SLOT_VERSION_COL[slot];
  const pathCol = SLOT_PATH_COL[slot];
  const { data: existing, error: readErr } = await admin
    .from('doctor_settings')
    .select(versionCol)
    .eq('doctor_id', doctorId)
    .maybeSingle();
  if (readErr) {
    handleSupabaseError(readErr, correlationId);
  }
  const currentVersion = (existing as Record<string, unknown> | null)?.[versionCol];
  const nextVersion = (typeof currentVersion === 'number' ? currentVersion : 0) + 1;

  if (existing) {
    const { error: updateErr } = await admin
      .from('doctor_settings')
      .update({ [pathCol]: path, [versionCol]: nextVersion })
      .eq('doctor_id', doctorId);
    if (updateErr) {
      handleSupabaseError(updateErr, correlationId);
    }
  } else {
    const { error: insertErr } = await admin.from('doctor_settings').insert({
      doctor_id: doctorId,
      [pathCol]: path,
      [versionCol]: nextVersion,
    });
    if (insertErr) {
      handleSupabaseError(insertErr, correlationId);
    }
  }
  return nextVersion;
}

export async function putBrandingAsset(
  doctorId: string,
  slot: BrandingAssetSlot,
  bytes: Buffer,
  correlationId: string
): Promise<{ version: number; previewUrl: string | null }> {
  const sniffed = sniffLogo(bytes);
  if (!sniffed) {
    throw new ValidationError('Image must be a PNG or JPEG under 2 MB');
  }

  const admin = requireAdmin();
  const path = brandingAssetPath(doctorId, slot, sniffed.contentType);
  const otherPath =
    sniffed.format === 'png'
      ? `${doctorId}/${SLOT_FILE[slot]}.jpg`
      : `${doctorId}/${SLOT_FILE[slot]}.png`;
  await admin.storage.from(CLINIC_BRANDING_BUCKET).remove([otherPath]);

  const { error: uploadErr } = await admin.storage.from(CLINIC_BRANDING_BUCKET).upload(
    path,
    sniffed.bytes,
    { contentType: sniffed.contentType, upsert: true }
  );
  if (uploadErr) {
    handleSupabaseError(uploadErr, correlationId);
  }

  const nextVersion = await persistAssetPointer(admin, doctorId, slot, path, correlationId);
  const storeKey = cacheStoreKey(slot, doctorId);
  assetCache.set(storeKey, {
    key: cacheVersionKey(doctorId, slot, nextVersion),
    asset: sniffed,
  });

  logger.info(
    { correlationId, doctorId, event: 'branding_asset_registered', slot, version: nextVersion },
    'branding_asset_registered'
  );
  await logDataModification(correlationId, doctorId, 'update', 'doctor_settings', doctorId, [
    SLOT_PATH_COL[slot],
    SLOT_VERSION_COL[slot],
  ]);

  const { data: signed } = await admin.storage
    .from(CLINIC_BRANDING_BUCKET)
    .createSignedUrl(path, LOGO_SIGNED_TTL_SEC);
  return { version: nextVersion, previewUrl: signed?.signedUrl ?? null };
}

export async function putBrandingLogo(
  doctorId: string,
  bytes: Buffer,
  correlationId: string
): Promise<{ logoVersion: number; logoPreviewUrl: string | null }> {
  const result = await putBrandingAsset(doctorId, 'logo', bytes, correlationId);
  return { logoVersion: result.version, logoPreviewUrl: result.previewUrl };
}

export async function registerBrandingLogo(
  doctorId: string,
  path: string,
  correlationId: string
): Promise<{ logoVersion: number }> {
  assertOwnedLogoPath(doctorId, path);
  const sniffed = await downloadAssetBytes(path, correlationId, doctorId, 'logo');
  if (!sniffed) {
    throw new ValidationError('Logo file is missing or not a valid PNG/JPEG under 2 MB');
  }

  const admin = requireAdmin();
  const nextVersion = await persistAssetPointer(admin, doctorId, 'logo', path, correlationId);

  assetCache.set(cacheStoreKey('logo', doctorId), {
    key: cacheVersionKey(doctorId, 'logo', nextVersion),
    asset: sniffed,
  });

  logger.info(
    { correlationId, doctorId, event: 'branding_logo_registered', logoVersion: nextVersion },
    'branding_logo_registered'
  );
  await logDataModification(correlationId, doctorId, 'update', 'doctor_settings', doctorId, [
    'logo_path',
    'logo_version',
  ]);
  return { logoVersion: nextVersion };
}

export async function deleteBrandingAsset(
  doctorId: string,
  slot: BrandingAssetSlot,
  correlationId: string
): Promise<void> {
  const admin = requireAdmin();
  const pathCol = SLOT_PATH_COL[slot];
  const versionCol = SLOT_VERSION_COL[slot];
  const { data: row } = await admin
    .from('doctor_settings')
    .select(`${pathCol}, ${versionCol}`)
    .eq('doctor_id', doctorId)
    .maybeSingle();
  const record = row as Record<string, unknown> | null;
  const rawPath = record?.[pathCol];
  const path = typeof rawPath === 'string' ? rawPath.trim() : '';
  const rawVersion = record?.[versionCol];
  const currentVersion = typeof rawVersion === 'number' ? rawVersion : 0;

  if (path) {
    await admin.storage.from(CLINIC_BRANDING_BUCKET).remove([path]);
  }

  const { error } = await admin
    .from('doctor_settings')
    .update({ [pathCol]: null, [versionCol]: currentVersion + 1 })
    .eq('doctor_id', doctorId);
  if (error) {
    handleSupabaseError(error, correlationId);
  }
  assetCache.delete(cacheStoreKey(slot, doctorId));
  logger.info(
    { correlationId, doctorId, event: 'branding_asset_deleted', slot },
    'branding_asset_deleted'
  );
  await logDataModification(correlationId, doctorId, 'delete', 'doctor_settings', doctorId, [
    pathCol,
    versionCol,
  ]);
}

export async function deleteBrandingLogo(doctorId: string, correlationId: string): Promise<void> {
  await deleteBrandingAsset(doctorId, 'logo', correlationId);
}

export async function signClinicBrandingPath(
  path: string,
  correlationId: string,
  doctorId: string,
  slot: BrandingAssetSlot
): Promise<string | null> {
  const trimmed = path.trim();
  if (!trimmed) return null;
  const admin = getSupabaseAdminClient();
  if (!admin) return null;
  const { data, error } = await admin.storage
    .from(CLINIC_BRANDING_BUCKET)
    .createSignedUrl(trimmed, LOGO_SIGNED_TTL_SEC);
  if (error || !data?.signedUrl) {
    logger.warn(
      { correlationId, doctorId, event: 'branding_asset_sign_failed', slot },
      'branding_asset_sign_failed'
    );
    return null;
  }
  return data.signedUrl;
}

export async function getBrandingAssetSignedUrl(
  doctorId: string,
  slot: BrandingAssetSlot,
  correlationId: string
): Promise<string | null> {
  const settings = await getDoctorSettings(doctorId);
  const path =
    slot === 'logo'
      ? settings?.logo_path?.trim()
      : slot === 'header'
        ? settings?.header_path?.trim()
        : slot === 'footer'
          ? settings?.footer_path?.trim()
          : settings?.background_path?.trim();
  if (!path) return null;
  return signClinicBrandingPath(path, correlationId, doctorId, slot);
}

export async function getBrandingLogoSignedUrl(
  doctorId: string,
  correlationId: string
): Promise<string | null> {
  return getBrandingAssetSignedUrl(doctorId, 'logo', correlationId);
}

export async function getBrandingAssetForPublic(
  doctorId: string,
  slot: BrandingAssetSlot,
  correlationId: string
): Promise<LetterheadLogoBytes> {
  const resolved = await resolveLetterhead(doctorId, correlationId);
  const asset =
    slot === 'logo'
      ? resolved.logo
      : slot === 'header'
        ? resolved.header
        : slot === 'footer'
          ? resolved.footer
          : resolved.background;
  if (!asset) {
    throw new NotFoundError(slot === 'logo' ? 'Logo not found' : 'Image not found');
  }
  return asset;
}

export async function getBrandingLogoForPublic(
  doctorId: string,
  correlationId: string
): Promise<LetterheadLogoBytes> {
  return getBrandingAssetForPublic(doctorId, 'logo', correlationId);
}

/** Tests only. */
export function __clearLetterheadLogoCacheForTests(): void {
  assetCache.clear();
}
