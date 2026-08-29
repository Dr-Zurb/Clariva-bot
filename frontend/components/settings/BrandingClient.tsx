"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { FieldLabel } from "@/components/ui/FieldLabel";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SaveButton } from "@/components/ui/SaveButton";
import { SettingsPageShell } from "@/components/settings/SettingsPageShell";
import { cn } from "@/lib/utils";
import { type LetterheadPagePreviewModel } from "@/components/settings/LetterheadPagePreview";
import { LetterheadPreviewPane } from "@/components/settings/LetterheadPreviewPane";
import { useDoctorSettingsForm } from "@/hooks/useDoctorSettingsForm";
import {
  BRANDING_LOGO_MAX_BYTES,
  deleteBrandingFooter,
  deleteBrandingHeader,
  deleteBrandingLogo,
  deleteBrandingBackground,
  putBrandingBackground,
  putBrandingFooter,
  putBrandingHeader,
  putBrandingLogo,
} from "@/lib/api";
import {
  letterheadBuiltinBackgroundUrl,
  letterheadImageFitClass,
  parseLetterheadImageFit,
  type LetterheadBackgroundPreset,
  parseLetterheadTextSize,
  type LetterheadImageFit,
  type LetterheadTextSize,
} from "@/lib/letterhead-heading";
import { createClient } from "@/lib/supabase/client";
import type {
  DoctorSettings,
  PatchDoctorSettingsPayload,
} from "@/types/doctor-settings";

type BrandingForm = {
  letterhead_preset: "classic" | "centred" | "preprinted" | "banner";
  letterhead_accent_color: string;
  letterhead_chrome_color: string;
  letterhead_patient_color: string;
  page_size: "a4" | "a5";
  preprint_margin_top_mm: string;
  preprint_margin_bottom_mm: string;
  header_height_mm: string;
  footer_height_mm: string;
  page_margin_top_mm: string;
  page_margin_right_mm: string;
  page_margin_bottom_mm: string;
  page_margin_left_mm: string;
  logo_size: "small" | "medium" | "large";
  patient_identity_preset: "open_letter" | "compact" | "grid";
  show_patient_phone: boolean;
  show_patient_guardian: boolean;
  show_patient_mrn: boolean;
  show_patient_address: boolean;
  letterhead_footer_line: string;
  hide_halo_credit: boolean;
  letterhead_background_preset: LetterheadBackgroundPreset;
  letterhead_background_opacity: string;
  letterhead_header_fit: LetterheadImageFit;
  letterhead_footer_fit: LetterheadImageFit;
  letterhead_background_fit: LetterheadImageFit;
  letterhead_header_text_size: LetterheadTextSize;
  letterhead_patient_text_size: LetterheadTextSize;
  letterhead_body_text_size: LetterheadTextSize;
};

function isAllowedLogoFile(file: File): boolean {
  const type = file.type.toLowerCase();
  if (!type) return true;
  return type === "image/png" || type === "image/jpeg" || type === "image/jpg";
}

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
  }
  return btoa(binary);
}

function FormSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2.5">
      <h3 className="border-b border-border/70 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

function OptionTrack<T extends string>({
  id,
  value,
  onChange,
  options,
}: {
  id: string;
  value: T;
  onChange: (next: T) => void;
  options: ReadonlyArray<{ value: T; label: string; title?: string }>;
}) {
  return (
    <div
      id={id}
      role="radiogroup"
      className="inline-flex max-w-full flex-wrap rounded-md border border-border bg-muted/70 p-0.5"
    >
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            title={opt.title}
            className={cn(
              "h-7 rounded-[5px] px-2.5 text-xs font-medium transition-colors",
              selected
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => onChange(opt.value)}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function FieldRow({
  label,
  htmlFor,
  tooltip,
  children,
}: {
  label: string;
  htmlFor?: string;
  tooltip?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <FieldLabel htmlFor={htmlFor} tooltip={tooltip}>
        {label}
      </FieldLabel>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function HexColorField({
  id,
  label,
  value,
  onChange,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  hint?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <FieldLabel htmlFor={id} tooltip={hint}>
        {label}
      </FieldLabel>
      <div className="flex items-center gap-1.5">
        <input
          type="color"
          aria-label={label}
          value={/^#[0-9A-Fa-f]{6}$/.test(value.trim()) ? value.trim() : "#000000"}
          className="h-8 w-8 shrink-0 cursor-pointer rounded-md border border-input bg-transparent p-0.5"
          onChange={(e) => onChange(e.target.value.toUpperCase())}
        />
        <Input
          id={id}
          type="text"
          value={value}
          maxLength={7}
          className="h-8 w-[5.75rem] font-mono text-xs"
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    </div>
  );
}

function formatDoctorDisplayName(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "Your name";
  if (trimmed.toLowerCase().startsWith("dr")) {
    return trimmed.replace(/^dr\.?\s*/i, "Dr. ");
  }
  return `Dr. ${trimmed}`;
}

function toForm(s: DoctorSettings): BrandingForm {
  return {
    letterhead_preset: s.letterhead_preset ?? "classic",
    letterhead_accent_color: s.letterhead_accent_color ?? "#000000",
    letterhead_chrome_color: s.letterhead_chrome_color ?? "#000000",
    letterhead_patient_color: s.letterhead_patient_color ?? "#000000",
    page_size: s.page_size ?? "a4",
    preprint_margin_top_mm: String(s.preprint_margin_top_mm ?? 40),
    preprint_margin_bottom_mm: String(s.preprint_margin_bottom_mm ?? 30),
    header_height_mm: String(s.header_height_mm ?? 35),
    footer_height_mm: String(s.footer_height_mm ?? 20),
    page_margin_top_mm: String(s.page_margin_top_mm ?? 12),
    page_margin_right_mm: String(s.page_margin_right_mm ?? 12),
    page_margin_bottom_mm: String(s.page_margin_bottom_mm ?? 12),
    page_margin_left_mm: String(s.page_margin_left_mm ?? 12),
    logo_size: s.logo_size ?? "medium",
    patient_identity_preset:
      s.patient_identity_preset === "compact" ||
      s.patient_identity_preset === "grid"
        ? s.patient_identity_preset
        : "open_letter",
    show_patient_phone: s.show_patient_phone !== false,
    show_patient_guardian: s.show_patient_guardian !== false,
    show_patient_mrn: s.show_patient_mrn !== false,
    show_patient_address: s.show_patient_address !== false,
    letterhead_footer_line: s.letterhead_footer_line ?? "",
    hide_halo_credit: s.hide_halo_credit === true,
    letterhead_background_preset:
      s.letterhead_background_preset === "paper" ||
      s.letterhead_background_preset === "cross" ||
      s.letterhead_background_preset === "upload"
        ? s.letterhead_background_preset
        : "none",
    letterhead_background_opacity: String(s.letterhead_background_opacity ?? 15),
    letterhead_header_fit: parseLetterheadImageFit(
      s.letterhead_header_fit,
      "stretch",
    ),
    letterhead_footer_fit: parseLetterheadImageFit(
      s.letterhead_footer_fit,
      "stretch",
    ),
    letterhead_background_fit: parseLetterheadImageFit(
      s.letterhead_background_fit,
      "fill",
    ),
    letterhead_header_text_size: parseLetterheadTextSize(
      s.letterhead_header_text_size,
    ),
    letterhead_patient_text_size: parseLetterheadTextSize(
      s.letterhead_patient_text_size,
    ),
    letterhead_body_text_size: parseLetterheadTextSize(
      s.letterhead_body_text_size,
    ),
  };
}

function TextSizeField({
  id,
  value,
  onChange,
}: {
  id: string;
  value: LetterheadTextSize;
  onChange: (next: LetterheadTextSize) => void;
}) {
  return (
    <FieldRow label="Text" htmlFor={id}>
      <OptionTrack
        id={id}
        value={value}
        onChange={onChange}
        options={[
          { value: "small", label: "S", title: "Small" },
          { value: "medium", label: "M", title: "Medium" },
          { value: "large", label: "L", title: "Large" },
        ]}
      />
    </FieldRow>
  );
}

function ImageFitField({
  id,
  value,
  onChange,
}: {
  id: string;
  value: LetterheadImageFit;
  onChange: (next: LetterheadImageFit) => void;
}) {
  return (
    <FieldRow
      label="Fit"
      htmlFor={id}
      tooltip="Fit keeps the whole photo. Fill crops to cover. Stretch fills the box."
    >
      <OptionTrack
        id={id}
        value={value}
        onChange={onChange}
        options={[
          { value: "fit", label: "Fit", title: "Whole photo, may letterbox" },
          { value: "fill", label: "Fill", title: "Crop to cover" },
          { value: "stretch", label: "Stretch", title: "Fill the box" },
        ]}
      />
    </FieldRow>
  );
}

function MmField({
  id,
  label,
  min,
  max,
  value,
  onChange,
}: {
  id: string;
  label: string;
  min: number;
  max: number;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <div className="min-w-0">
      <label className="text-[11px] text-muted-foreground" htmlFor={id}>
        {label}
      </label>
      <Input
        id={id}
        type="number"
        min={min}
        max={max}
        value={value}
        className="mt-0.5 h-8"
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function UploadButton({
  id,
  disabled,
  accept,
  onFile,
}: {
  id: string;
  disabled?: boolean;
  accept: string;
  onFile: (file: File | null) => void;
}) {
  return (
    <label
      htmlFor={id}
      className={cn(
        buttonVariants({ variant: "outline", size: "sm" }),
        disabled && "pointer-events-none opacity-50",
      )}
    >
      Upload
      <input
        id={id}
        type="file"
        accept={accept}
        disabled={disabled}
        className="sr-only"
        onChange={(e) => {
          onFile(e.target.files?.[0] ?? null);
          e.target.value = "";
        }}
      />
    </label>
  );
}

interface BrandingClientProps {
  token: string;
}

export function BrandingClient({ token }: BrandingClientProps) {
  const {
    settings,
    form,
    setForm,
    isDirty,
    saving,
    saveSuccess,
    saveError,
    save,
    isLoading,
    loadError,
    refetch,
  } = useDoctorSettingsForm(token, toForm);
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [logoSaved, setLogoSaved] = useState(false);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [headerBusy, setHeaderBusy] = useState(false);
  const [footerBusy, setFooterBusy] = useState(false);
  const [localHeaderPreview, setLocalHeaderPreview] = useState<string | null>(
    null,
  );
  const [localFooterPreview, setLocalFooterPreview] = useState<string | null>(
    null,
  );
  const [headerSaved, setHeaderSaved] = useState(false);
  const [footerSaved, setFooterSaved] = useState(false);
  const [backgroundBusy, setBackgroundBusy] = useState(false);
  const [localBackgroundPreview, setLocalBackgroundPreview] = useState<
    string | null
  >(null);
  const [backgroundSaved, setBackgroundSaved] = useState(false);
  const [doctorName, setDoctorName] = useState("Your name");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    const top = Number.parseInt(form.preprint_margin_top_mm, 10);
    const bottom = Number.parseInt(form.preprint_margin_bottom_mm, 10);
    const headerMm = Number.parseInt(form.header_height_mm, 10);
    const footerMm = Number.parseInt(form.footer_height_mm, 10);
    const mt = Number.parseInt(form.page_margin_top_mm, 10);
    const mr = Number.parseInt(form.page_margin_right_mm, 10);
    const mb = Number.parseInt(form.page_margin_bottom_mm, 10);
    const ml = Number.parseInt(form.page_margin_left_mm, 10);
    const payload: PatchDoctorSettingsPayload = {
      letterhead_preset: form.letterhead_preset,
      letterhead_accent_color: form.letterhead_accent_color.trim() || null,
      letterhead_chrome_color: form.letterhead_chrome_color.trim() || null,
      letterhead_patient_color: form.letterhead_patient_color.trim() || null,
      page_size: form.page_size,
      preprint_margin_top_mm: Number.isFinite(top) ? top : 40,
      preprint_margin_bottom_mm: Number.isFinite(bottom) ? bottom : 30,
      header_height_mm: Number.isFinite(headerMm) ? headerMm : 35,
      footer_height_mm: Number.isFinite(footerMm) ? footerMm : 20,
      page_margin_top_mm: Number.isFinite(mt) ? mt : 12,
      page_margin_right_mm: Number.isFinite(mr) ? mr : 12,
      page_margin_bottom_mm: Number.isFinite(mb) ? mb : 12,
      page_margin_left_mm: Number.isFinite(ml) ? ml : 12,
      logo_size: form.logo_size,
      patient_identity_preset: form.patient_identity_preset,
      show_patient_phone: form.show_patient_phone,
      show_patient_guardian: form.show_patient_guardian,
      show_patient_mrn: form.show_patient_mrn,
      show_patient_address: form.show_patient_address,
      letterhead_footer_line: form.letterhead_footer_line.trim() || null,
      hide_halo_credit: form.hide_halo_credit,
      letterhead_background_preset: form.letterhead_background_preset,
      letterhead_background_opacity: (() => {
        const n = Number.parseInt(form.letterhead_background_opacity, 10);
        return Number.isFinite(n) ? Math.min(40, Math.max(0, n)) : 15;
      })(),
      letterhead_header_fit: form.letterhead_header_fit,
      letterhead_footer_fit: form.letterhead_footer_fit,
      letterhead_background_fit: form.letterhead_background_fit,
      letterhead_header_text_size: form.letterhead_header_text_size,
      letterhead_patient_text_size: form.letterhead_patient_text_size,
      letterhead_body_text_size: form.letterhead_body_text_size,
    };
    await save(payload);
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;
      const meta =
        (data.user?.user_metadata as
          | { full_name?: string; name?: string; display_name?: string }
          | null
          | undefined) ?? {};
      const raw =
        (typeof meta.display_name === "string" && meta.display_name) ||
        (typeof meta.full_name === "string" && meta.full_name) ||
        (typeof meta.name === "string" && meta.name) ||
        (data.user?.email ? data.user.email.split("@")[0] : "") ||
        "";
      setDoctorName(formatDoctorDisplayName(raw));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleLogoChange(file: File | null) {
    if (!file) return;
    setLogoError(null);
    setLogoSaved(false);
    if (!isAllowedLogoFile(file)) {
      setLogoError("Use a PNG or JPEG logo.");
      return;
    }
    if (file.size > BRANDING_LOGO_MAX_BYTES) {
      setLogoError("Logo must be 2 MB or smaller.");
      return;
    }
    setLogoBusy(true);
    const blobUrl = URL.createObjectURL(file);
    try {
      const data = await fileToBase64(file);
      const result = await putBrandingLogo(token, data);
      setLogoSaved(true);
      setLocalPreview(result.data.logoPreviewUrl || blobUrl);
      await refetch();
      if (result.data.logoPreviewUrl) {
        URL.revokeObjectURL(blobUrl);
      }
    } catch (err) {
      URL.revokeObjectURL(blobUrl);
      setLogoError(err instanceof Error ? err.message : "Logo upload failed");
    } finally {
      setLogoBusy(false);
    }
  }

  async function handleRemoveLogo() {
    setLogoBusy(true);
    setLogoError(null);
    try {
      await deleteBrandingLogo(token);
      setLocalPreview(null);
      setLogoSaved(false);
      await refetch();
    } catch (err) {
      setLogoError(
        err instanceof Error ? err.message : "Could not remove logo"
      );
    } finally {
      setLogoBusy(false);
    }
  }

  async function handleBandChange(
    slot: "header" | "footer",
    file: File | null,
  ) {
    if (!file) return;
    setLogoError(null);
    if (!isAllowedLogoFile(file)) {
      setLogoError("Use a PNG or JPEG image.");
      return;
    }
    if (file.size > BRANDING_LOGO_MAX_BYTES) {
      setLogoError("Image must be 2 MB or smaller.");
      return;
    }
    const setBusy = slot === "header" ? setHeaderBusy : setFooterBusy;
    const setSaved = slot === "header" ? setHeaderSaved : setFooterSaved;
    const setLocal = slot === "header" ? setLocalHeaderPreview : setLocalFooterPreview;
    setBusy(true);
    setSaved(false);
    const blobUrl = URL.createObjectURL(file);
    try {
      const data = await fileToBase64(file);
      let preview: string | null;
      if (slot === "header") {
        const result = await putBrandingHeader(token, data);
        preview = result.data.headerPreviewUrl;
      } else {
        const result = await putBrandingFooter(token, data);
        preview = result.data.footerPreviewUrl;
      }
      setSaved(true);
      setLocal(preview || blobUrl);
      await refetch();
      if (preview) URL.revokeObjectURL(blobUrl);
    } catch (err) {
      URL.revokeObjectURL(blobUrl);
      setLogoError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemoveBand(slot: "header" | "footer") {
    const setBusy = slot === "header" ? setHeaderBusy : setFooterBusy;
    const setSaved = slot === "header" ? setHeaderSaved : setFooterSaved;
    const setLocal = slot === "header" ? setLocalHeaderPreview : setLocalFooterPreview;
    setBusy(true);
    setLogoError(null);
    try {
      if (slot === "header") await deleteBrandingHeader(token);
      else await deleteBrandingFooter(token);
      setLocal(null);
      setSaved(false);
      await refetch();
    } catch (err) {
      setLogoError(err instanceof Error ? err.message : "Could not remove image");
    } finally {
      setBusy(false);
    }
  }

  async function handleBackgroundChange(file: File | null) {
    if (!file) return;
    setLogoError(null);
    if (!isAllowedLogoFile(file)) {
      setLogoError("Use a PNG or JPEG background.");
      return;
    }
    if (file.size > BRANDING_LOGO_MAX_BYTES) {
      setLogoError("Background must be 2 MB or smaller.");
      return;
    }
    setBackgroundBusy(true);
    const blobUrl = URL.createObjectURL(file);
    try {
      const data = await fileToBase64(file);
      const result = await putBrandingBackground(token, data);
      setBackgroundSaved(true);
      setLocalBackgroundPreview(result.data.backgroundPreviewUrl || blobUrl);
      setForm((p) => ({ ...p, letterhead_background_preset: "upload" }));
      await refetch();
      if (result.data.backgroundPreviewUrl) URL.revokeObjectURL(blobUrl);
    } catch (err) {
      URL.revokeObjectURL(blobUrl);
      setLogoError(err instanceof Error ? err.message : "Background upload failed");
    } finally {
      setBackgroundBusy(false);
    }
  }

  async function handleRemoveBackground() {
    setBackgroundBusy(true);
    setLogoError(null);
    try {
      await deleteBrandingBackground(token);
      setLocalBackgroundPreview(null);
      setBackgroundSaved(false);
      await refetch();
    } catch (err) {
      setLogoError(err instanceof Error ? err.message : "Could not remove image");
    } finally {
      setBackgroundBusy(false);
    }
  }

  const previewUrl = settings?.logo_preview_url ?? localPreview ?? null;
  const headerPreviewUrl =
    settings?.header_preview_url ?? localHeaderPreview ?? null;
  const footerPreviewUrl =
    settings?.footer_preview_url ?? localFooterPreview ?? null;
  const backgroundPreviewUrl =
    settings?.background_preview_url ?? localBackgroundPreview ?? null;
  const bandBusy = headerBusy || footerBusy;
  const pagePreview = useMemo<LetterheadPagePreviewModel | null>(() => {
    if (!form) return null;
    const top = Number.parseInt(form.preprint_margin_top_mm, 10);
    const bottom = Number.parseInt(form.preprint_margin_bottom_mm, 10);
    return {
      doctorName,
      qualifications: settings?.qualifications ?? "",
      specialty: settings?.specialty ?? null,
      clinicName: settings?.practice_name?.trim() || "Practice name",
      clinicAddress: settings?.address_summary?.trim() || "Address",
      logoUrl: form.letterhead_preset === "preprinted" ? null : previewUrl,
      headerUrl:
        form.letterhead_preset === "banner" ? headerPreviewUrl : null,
      footerUrl:
        form.letterhead_preset === "banner" ? footerPreviewUrl : null,
      headerHeightMm: Number.parseInt(form.header_height_mm, 10) || 35,
      footerHeightMm: Number.parseInt(form.footer_height_mm, 10) || 20,
      preset: form.letterhead_preset,
      pageSize: form.page_size,
      accentColor: form.letterhead_accent_color,
      chromeColor: form.letterhead_chrome_color,
      patientColor: form.letterhead_patient_color,
      preprintMarginTopMm: Number.isFinite(top) ? top : 40,
      preprintMarginBottomMm: Number.isFinite(bottom) ? bottom : 30,
      pageMarginTopMm: Number.parseInt(form.page_margin_top_mm, 10) || 12,
      pageMarginRightMm: Number.parseInt(form.page_margin_right_mm, 10) || 12,
      pageMarginBottomMm: Number.parseInt(form.page_margin_bottom_mm, 10) || 12,
      pageMarginLeftMm: Number.parseInt(form.page_margin_left_mm, 10) || 12,
      logoSize: form.logo_size,
      patientIdentityPreset: form.patient_identity_preset,
      showPatientPhone: form.show_patient_phone,
      showPatientGuardian: form.show_patient_guardian,
      showPatientMrn: form.show_patient_mrn,
      showPatientAddress: form.show_patient_address,
      footerLine: form.letterhead_footer_line,
      hideHaloCredit: form.hide_halo_credit,
      backgroundUrl:
        form.letterhead_background_preset === "upload"
          ? backgroundPreviewUrl
          : letterheadBuiltinBackgroundUrl(form.letterhead_background_preset),
      backgroundPreset: form.letterhead_background_preset,
      backgroundOpacity: (() => {
        const n = Number.parseInt(form.letterhead_background_opacity, 10);
        return Number.isFinite(n) ? Math.min(40, Math.max(0, n)) : 15;
      })(),
      headerFit: form.letterhead_header_fit,
      footerFit: form.letterhead_footer_fit,
      backgroundFit: form.letterhead_background_fit,
      headerTextSize: form.letterhead_header_text_size,
      patientTextSize: form.letterhead_patient_text_size,
      bodyTextSize: form.letterhead_body_text_size,
    };
  }, [
    form,
    doctorName,
    settings?.specialty,
    settings?.qualifications,
    settings?.practice_name,
    settings?.address_summary,
    previewUrl,
    headerPreviewUrl,
    footerPreviewUrl,
    backgroundPreviewUrl,
  ]);

  return (
    <SettingsPageShell
      title="Letterhead & branding"
      description="Logo and prescription layout. Registration number appears only after you are verified."
      isLoading={(isLoading || !form) && !loadError}
      loadError={loadError}
      onRetry={() => void refetch()}
      saveError={saveError ?? logoError}
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
    >
      {form ? (
        <>
        <p className="mt-2 shrink-0 text-xs text-muted-foreground">
          Clinic name, specialty, qualifications, and address are set in{" "}
          <Link
            href="/dashboard/settings/practice-setup/practice-info"
            className="underline underline-offset-2 hover:text-foreground"
          >
            Practice info
          </Link>
          . Registration comes from{" "}
          <Link
            href="/dashboard/get-verified"
            className="underline underline-offset-2 hover:text-foreground"
          >
            Get verified
          </Link>
          . Patient and Rx lines in the preview are sample.
        </p>
        <div className="mt-3 flex min-h-0 flex-1 flex-col gap-4 lg:flex-row lg:items-stretch">
          <form
            onSubmit={(e) => void handleSubmit(e)}
            className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card"
          >
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-3">
            <FormSection title="Page">
              <div className="space-y-2">
                <FieldLabel
                  htmlFor="letterhead_preset"
                  tooltip="Name, qualifications, and address come from Practice info."
                >
                  Layout
                </FieldLabel>
                <OptionTrack
                  id="letterhead_preset"
                  value={form.letterhead_preset}
                  onChange={(next) =>
                    setForm((p) => ({ ...p, letterhead_preset: next }))
                  }
                  options={[
                    {
                      value: "classic",
                      label: "Classic",
                      title: "Logo left, clinic right",
                    },
                    {
                      value: "centred",
                      label: "Centred",
                      title: "Formal stacked header",
                    },
                    {
                      value: "preprinted",
                      label: "Preprinted",
                      title: "Print on your own letterhead",
                    },
                    {
                      value: "banner",
                      label: "Banner",
                      title: "Full-width header and footer photos",
                    },
                  ]}
                />
              </div>
              <FieldRow label="Paper" htmlFor="page_size">
                <OptionTrack
                  id="page_size"
                  value={form.page_size}
                  onChange={(next) => setForm((p) => ({ ...p, page_size: next }))}
                  options={[
                    { value: "a4", label: "A4" },
                    { value: "a5", label: "A5" },
                  ]}
                />
              </FieldRow>
              {form.letterhead_preset === "preprinted" ? (
                <div className="grid grid-cols-2 gap-2">
                  <MmField
                    id="preprint_margin_top_mm"
                    label="Top mm"
                    min={0}
                    max={80}
                    value={form.preprint_margin_top_mm}
                    onChange={(next) =>
                      setForm((p) => ({ ...p, preprint_margin_top_mm: next }))
                    }
                  />
                  <MmField
                    id="preprint_margin_bottom_mm"
                    label="Bottom mm"
                    min={0}
                    max={80}
                    value={form.preprint_margin_bottom_mm}
                    onChange={(next) =>
                      setForm((p) => ({ ...p, preprint_margin_bottom_mm: next }))
                    }
                  />
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-1.5">
                  {(
                    [
                      ["page_margin_top_mm", "Top"],
                      ["page_margin_right_mm", "Right"],
                      ["page_margin_bottom_mm", "Bottom"],
                      ["page_margin_left_mm", "Left"],
                    ] as const
                  ).map(([key, label]) => (
                    <MmField
                      key={key}
                      id={key}
                      label={label}
                      min={8}
                      max={32}
                      value={form[key]}
                      onChange={(next) => setForm((p) => ({ ...p, [key]: next }))}
                    />
                  ))}
                </div>
              )}
            </FormSection>

            {form.letterhead_preset !== "preprinted" ? (
              <FormSection title="Header">
                {form.letterhead_preset === "classic" ||
                form.letterhead_preset === "centred" ? (
                  <>
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
                        {previewUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={previewUrl}
                            alt=""
                            className="h-full w-full object-contain"
                          />
                        ) : (
                          <span className="text-[10px] text-muted-foreground">Logo</span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <UploadButton
                            id="logo"
                            disabled={logoBusy}
                            accept="image/png,image/jpeg,image/jpg"
                            onFile={(file) => void handleLogoChange(file)}
                          />
                          {previewUrl ? (
                            <button
                              type="button"
                              disabled={logoBusy}
                              onClick={() => void handleRemoveLogo()}
                              className="text-xs text-muted-foreground underline"
                            >
                              Remove
                            </button>
                          ) : null}
                        </div>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {logoBusy
                            ? "Saving…"
                            : logoSaved
                              ? "Saved."
                              : "PNG or JPEG, 2 MB. Saves on pick."}
                        </p>
                      </div>
                    </div>
                    <FieldRow label="Size" htmlFor="logo_size">
                      <OptionTrack
                        id="logo_size"
                        value={form.logo_size}
                        onChange={(next) =>
                          setForm((p) => ({ ...p, logo_size: next }))
                        }
                        options={[
                          { value: "small", label: "S", title: "Small" },
                          { value: "medium", label: "M", title: "Medium" },
                          { value: "large", label: "L", title: "Large" },
                        ]}
                      />
                    </FieldRow>
                  </>
                ) : null}
                {form.letterhead_preset === "banner" ? (
                  <>
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
                        {headerPreviewUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={headerPreviewUrl}
                            alt=""
                            className={`h-full w-full ${letterheadImageFitClass(form.letterhead_header_fit)}`}
                          />
                        ) : (
                          <span className="text-[10px] text-muted-foreground">Photo</span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <UploadButton
                            id="header-band"
                            disabled={headerBusy}
                            accept="image/png,image/jpeg,image/jpg"
                            onFile={(file) => void handleBandChange("header", file)}
                          />
                          {headerPreviewUrl ? (
                            <button
                              type="button"
                              disabled={headerBusy}
                              onClick={() => void handleRemoveBand("header")}
                              className="text-xs text-muted-foreground underline"
                            >
                              Remove
                            </button>
                          ) : null}
                        </div>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {headerBusy
                            ? "Saving…"
                            : headerSaved
                              ? "Saved."
                              : "PNG or JPEG, 2 MB."}
                        </p>
                      </div>
                    </div>
                    <ImageFitField
                      id="letterhead_header_fit"
                      value={form.letterhead_header_fit}
                      onChange={(next) =>
                        setForm((p) => ({ ...p, letterhead_header_fit: next }))
                      }
                    />
                    <FieldRow label="Height">
                      <div className="w-20">
                        <Input
                          id="header_height_mm"
                          type="number"
                          min={15}
                          max={80}
                          value={form.header_height_mm}
                          className="h-8"
                          onChange={(e) =>
                            setForm((p) => ({
                              ...p,
                              header_height_mm: e.target.value,
                            }))
                          }
                        />
                      </div>
                    </FieldRow>
                  </>
                ) : null}
                <HexColorField
                  id="letterhead_chrome_color"
                  label="Colour"
                  hint="Also used for the footer contact line."
                  value={form.letterhead_chrome_color}
                  onChange={(next) =>
                    setForm((p) => ({ ...p, letterhead_chrome_color: next }))
                  }
                />
                <TextSizeField
                  id="letterhead_header_text_size"
                  value={form.letterhead_header_text_size}
                  onChange={(next) =>
                    setForm((p) => ({ ...p, letterhead_header_text_size: next }))
                  }
                />
              </FormSection>
            ) : null}

            <FormSection title="Patient">
              <FieldRow label="Layout" htmlFor="patient_identity_preset">
                <OptionTrack
                  id="patient_identity_preset"
                  value={form.patient_identity_preset}
                  onChange={(next) =>
                    setForm((p) => ({ ...p, patient_identity_preset: next }))
                  }
                  options={[
                    {
                      value: "open_letter",
                      label: "Open",
                      title: "Large name, date on the right, details below",
                    },
                    {
                      value: "compact",
                      label: "Compact",
                      title: "Name, age, and date on one line",
                    },
                    {
                      value: "grid",
                      label: "Grid",
                      title: "Hospital chart cells",
                    },
                  ]}
                />
              </FieldRow>
              <div className="flex flex-wrap gap-1">
                {(
                  [
                    ["show_patient_phone", "Phone"],
                    ["show_patient_guardian", "Relative"],
                    ["show_patient_mrn", "MRN"],
                    ["show_patient_address", "Address"],
                  ] as const
                ).map(([key, label]) => {
                  const on = form[key];
                  return (
                    <button
                      key={key}
                      type="button"
                      aria-pressed={on}
                      className={cn(
                        "h-7 rounded-md border px-2.5 text-xs font-medium",
                        on
                          ? "border-primary/40 bg-primary/10 text-foreground"
                          : "border-border text-muted-foreground",
                      )}
                      onClick={() => setForm((p) => ({ ...p, [key]: !p[key] }))}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <HexColorField
                id="letterhead_patient_color"
                label="Colour"
                value={form.letterhead_patient_color}
                onChange={(next) =>
                  setForm((p) => ({ ...p, letterhead_patient_color: next }))
                }
              />
              <TextSizeField
                id="letterhead_patient_text_size"
                value={form.letterhead_patient_text_size}
                onChange={(next) =>
                  setForm((p) => ({ ...p, letterhead_patient_text_size: next }))
                }
              />
            </FormSection>

            <FormSection title="Body">
              <HexColorField
                id="letterhead_accent_color"
                label="Colour"
                hint="Chief complaint, Rx, advice, and other section labels."
                value={form.letterhead_accent_color}
                onChange={(next) =>
                  setForm((p) => ({ ...p, letterhead_accent_color: next }))
                }
              />
              <TextSizeField
                id="letterhead_body_text_size"
                value={form.letterhead_body_text_size}
                onChange={(next) =>
                  setForm((p) => ({ ...p, letterhead_body_text_size: next }))
                }
              />
            </FormSection>

            {form.letterhead_preset !== "preprinted" ? (
              <FormSection title="Background">
                <FieldRow label="Style" htmlFor="letterhead_background_preset">
                  <OptionTrack
                    id="letterhead_background_preset"
                    value={form.letterhead_background_preset}
                    onChange={(next) =>
                      setForm((p) => ({
                        ...p,
                        letterhead_background_preset: next,
                      }))
                    }
                    options={[
                      { value: "none", label: "None" },
                      { value: "paper", label: "Paper" },
                      { value: "cross", label: "Cross" },
                      { value: "upload", label: "Photo" },
                    ]}
                  />
                </FieldRow>
                {form.letterhead_background_preset !== "none" ? (
                  <FieldRow
                    label={`Strength ${form.letterhead_background_opacity}%`}
                    htmlFor="letterhead_background_opacity"
                  >
                    <input
                      id="letterhead_background_opacity"
                      type="range"
                      min={0}
                      max={40}
                      value={form.letterhead_background_opacity}
                      className="w-28"
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          letterhead_background_opacity: e.target.value,
                        }))
                      }
                    />
                  </FieldRow>
                ) : null}
                {form.letterhead_background_preset === "upload" ? (
                  <>
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
                        {backgroundPreviewUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={backgroundPreviewUrl}
                            alt=""
                            className={`h-full w-full ${letterheadImageFitClass(form.letterhead_background_fit)}`}
                          />
                        ) : (
                          <span className="text-[10px] text-muted-foreground">Photo</span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <UploadButton
                            id="background-photo"
                            disabled={backgroundBusy}
                            accept="image/png,image/jpeg"
                            onFile={(file) => void handleBackgroundChange(file)}
                          />
                          {backgroundPreviewUrl ? (
                            <button
                              type="button"
                              className="text-xs text-destructive underline"
                              disabled={backgroundBusy}
                              onClick={() => void handleRemoveBackground()}
                            >
                              Remove
                            </button>
                          ) : null}
                        </div>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {backgroundBusy ? "Saving…" : backgroundSaved ? "Saved." : "PNG or JPEG, 2 MB."}
                        </p>
                      </div>
                    </div>
                    <ImageFitField
                      id="letterhead_background_fit"
                      value={form.letterhead_background_fit}
                      onChange={(next) =>
                        setForm((p) => ({
                          ...p,
                          letterhead_background_fit: next,
                        }))
                      }
                    />
                  </>
                ) : null}
              </FormSection>
            ) : null}

            <FormSection title="Footer">
              {form.letterhead_preset === "banner" ? (
                <>
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
                      {footerPreviewUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={footerPreviewUrl}
                          alt=""
                          className={`h-full w-full ${letterheadImageFitClass(form.letterhead_footer_fit)}`}
                        />
                      ) : (
                        <span className="text-[10px] text-muted-foreground">Photo</span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <UploadButton
                          id="footer-band"
                          disabled={footerBusy}
                          accept="image/png,image/jpeg,image/jpg"
                          onFile={(file) => void handleBandChange("footer", file)}
                        />
                        {footerPreviewUrl ? (
                          <button
                            type="button"
                            disabled={footerBusy}
                            onClick={() => void handleRemoveBand("footer")}
                            className="text-xs text-muted-foreground underline"
                          >
                            Remove
                          </button>
                        ) : null}
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {footerBusy ? "Saving…" : footerSaved ? "Saved." : "PNG or JPEG, 2 MB."}
                      </p>
                    </div>
                  </div>
                  <ImageFitField
                    id="letterhead_footer_fit"
                    value={form.letterhead_footer_fit}
                    onChange={(next) =>
                      setForm((p) => ({ ...p, letterhead_footer_fit: next }))
                    }
                  />
                  <FieldRow
                    label="Height"
                    tooltip="Header 15–80 mm, footer 10–60 mm, together 100 mm or less."
                  >
                    <div className="w-20">
                      <Input
                        id="footer_height_mm"
                        type="number"
                        min={10}
                        max={60}
                        value={form.footer_height_mm}
                        className="h-8"
                        onChange={(e) =>
                          setForm((p) => ({
                            ...p,
                            footer_height_mm: e.target.value,
                          }))
                        }
                      />
                    </div>
                  </FieldRow>
                </>
              ) : null}
              {form.letterhead_preset === "preprinted" ? (
                <HexColorField
                  id="letterhead_chrome_color"
                  label="Colour"
                  hint="Colours the footer contact line."
                  value={form.letterhead_chrome_color}
                  onChange={(next) =>
                    setForm((p) => ({ ...p, letterhead_chrome_color: next }))
                  }
                />
              ) : null}
              <div>
                <FieldLabel
                  htmlFor="letterhead_footer_line"
                  tooltip="Optional clinic phone or hours. Not a patient number."
                >
                  Contact line
                </FieldLabel>
                <Input
                  id="letterhead_footer_line"
                  type="text"
                  maxLength={200}
                  value={form.letterhead_footer_line}
                  className="mt-1 h-8"
                  placeholder="0183-123456 · 9am–5pm"
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      letterhead_footer_line: e.target.value,
                    }))
                  }
                />
              </div>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={form.hide_halo_credit}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, hide_halo_credit: e.target.checked }))
                  }
                />
                Hide Halo credit
              </label>
            </FormSection>
          </div>

          <div className="flex shrink-0 justify-end border-t border-border px-3 py-2">
            <div>
              <SaveButton
                isDirty={isDirty}
                saving={saving || logoBusy || bandBusy}
                saveSuccess={saveSuccess}
                disableReason={
                  logoBusy || bandBusy
                    ? "Wait for the image to finish saving."
                    : null
                }
              />
            </div>
          </div>
        </form>

          <aside className="min-h-0 min-w-0 flex-1">
            <LetterheadPreviewPane model={pagePreview} />
          </aside>
        </div>
        </>
      ) : null}
    </SettingsPageShell>
  );
}
