/** One letterhead title — practice name wins so Classic is not two doctor names. */
export function letterheadHeading(
  doctorName: string | null | undefined,
  clinicName: string | null | undefined,
): string {
  const clinic = clinicName?.trim() || "";
  const doctor = doctorName?.trim() || "";
  return clinic || doctor;
}

export type LetterheadLogoSize = "small" | "medium" | "large";
export type PatientIdentityPreset = "open_letter" | "compact" | "grid";
export type LetterheadBackgroundPreset = "none" | "paper" | "cross" | "upload";
export type LetterheadImageFit = "fit" | "fill" | "stretch";
export type LetterheadTextSize = "small" | "medium" | "large";

export type LetterheadTypeRole =
  | "headerTitle"
  | "headerMeta"
  | "patientName"
  | "patientNameCompact"
  | "patientMeta"
  | "bodyLabel"
  | "bodyText";

/**
 * Same point sizes as `LETTERHEAD_TYPE_PT` on the PDF. Preview CSS px
 * must be pt × (96/72) so a 794 px A4 sheet matches a 595 pt PDF page.
 */
export const LETTERHEAD_PT_TO_PREVIEW_PX = 96 / 72;

const LETTERHEAD_TYPE_PT: Record<
  LetterheadTypeRole,
  Record<LetterheadTextSize, number>
> = {
  headerTitle: { small: 12, medium: 14, large: 17 },
  headerMeta: { small: 8, medium: 9, large: 11 },
  patientName: { small: 11, medium: 13, large: 16 },
  patientNameCompact: { small: 10, medium: 11, large: 13 },
  patientMeta: { small: 8, medium: 9, large: 11 },
  bodyLabel: { small: 8, medium: 9, large: 11 },
  bodyText: { small: 9, medium: 10, large: 12 },
};

export function parseLetterheadTextSize(
  raw: string | null | undefined,
  fallback: LetterheadTextSize = "medium",
): LetterheadTextSize {
  if (raw === "small" || raw === "medium" || raw === "large") return raw;
  return fallback;
}

export function letterheadTypePx(
  role: LetterheadTypeRole,
  size?: LetterheadTextSize | null,
): number {
  const key = size === "small" || size === "large" ? size : "medium";
  return LETTERHEAD_TYPE_PT[role][key] * LETTERHEAD_PT_TO_PREVIEW_PX;
}

/** Screen Rx / share page. Medium matches the current web type. */
const LETTERHEAD_TYPE_SCREEN_PX: Record<
  LetterheadTypeRole,
  Record<LetterheadTextSize, number>
> = {
  headerTitle: { small: 16, medium: 18, large: 22 },
  headerMeta: { small: 12, medium: 14, large: 16 },
  patientName: { small: 16, medium: 18, large: 22 },
  patientNameCompact: { small: 12, medium: 14, large: 16 },
  patientMeta: { small: 12, medium: 14, large: 16 },
  bodyLabel: { small: 10, medium: 12, large: 14 },
  bodyText: { small: 12, medium: 14, large: 16 },
};

export function letterheadTypeScreenPx(
  role: LetterheadTypeRole,
  size?: LetterheadTextSize | null,
): number {
  const key = size === "small" || size === "large" ? size : "medium";
  return LETTERHEAD_TYPE_SCREEN_PX[role][key];
}

export function parseLetterheadImageFit(
  raw: string | null | undefined,
  fallback: LetterheadImageFit,
): LetterheadImageFit {
  if (raw === "fit" || raw === "fill" || raw === "stretch") return raw;
  return fallback;
}

export function letterheadImageFitClass(
  fit?: LetterheadImageFit | null,
): "object-contain" | "object-cover" | "object-fill" {
  if (fit === "fit") return "object-contain";
  if (fit === "stretch") return "object-fill";
  return "object-cover";
}

export const DEFAULT_BACKGROUND_OPACITY = 15;

export function letterheadBuiltinBackgroundUrl(
  preset: LetterheadBackgroundPreset | null | undefined,
): string | null {
  if (preset === "paper") return "/letterhead/bg-paper.png";
  if (preset === "cross") return "/letterhead/bg-cross.png";
  return null;
}

export function logoSizePx(size: LetterheadLogoSize | null | undefined): number {
  if (size === "small") return 40;
  if (size === "large") return 80;
  return 56;
}

export function mmToPreviewPx(mm: number): number {
  return Math.round((mm / 25.4) * 96);
}

export function letterheadChromeFromSettings(s: {
  logo_size?: LetterheadLogoSize | null;
  patient_identity_preset?: PatientIdentityPreset | null;
  show_patient_phone?: boolean | null;
  show_patient_guardian?: boolean | null;
  show_patient_mrn?: boolean | null;
  show_patient_address?: boolean | null;
  letterhead_footer_line?: string | null;
  hide_halo_credit?: boolean | null;
} | null) {
  return {
    logoSize: s?.logo_size ?? "medium",
    patientIdentityPreset:
      s?.patient_identity_preset === "compact" ||
      s?.patient_identity_preset === "grid"
        ? s.patient_identity_preset
        : "open_letter",
    showPatientPhone: s?.show_patient_phone !== false,
    showPatientGuardian: s?.show_patient_guardian !== false,
    showPatientMrn: s?.show_patient_mrn !== false,
    showPatientAddress: s?.show_patient_address !== false,
    footerLine: s?.letterhead_footer_line ?? null,
    hideHaloCredit: s?.hide_halo_credit === true,
  } as const;
}
