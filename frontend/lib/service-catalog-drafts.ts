/**
 * SFU-06 + SFU-12: Draft state ↔ ServiceCatalogV1 for Practice Setup editor.
 */

import type {
  FollowUpPolicyV1,
  ServiceCatalogV1,
  ServiceOfferingV1,
} from "@/lib/service-catalog-schema";
import { SERVICE_CATALOG_VERSION } from "@/lib/service-catalog-schema";

export type DiscountTypeOption = FollowUpPolicyV1["discount_type"];

/** Per-modality follow-up policy (max, window, and discount). */
export interface ModalityFollowUpDiscountDraft {
  followUpDiscountEnabled: boolean;
  max_followups: string;
  eligibility_window_days: string;
  discount_type: DiscountTypeOption;
  discount_value: string;
}

export interface ServiceOfferingDraft {
  /** Stable React key */
  id: string;
  /** SFU-11: persisted UUID; never change when label edits */
  service_id: string;
  label: string;
  /** Internal slug for API payload (server may preserve per service_id) */
  service_key: string;
  description: string;
  textEnabled: boolean;
  voiceEnabled: boolean;
  videoEnabled: boolean;
  /** Main currency units as string (e.g. "500" = ₹500); empty if invalid while typing */
  textPriceMain: string;
  voicePriceMain: string;
  videoPriceMain: string;
  textFollowUp: ModalityFollowUpDiscountDraft;
  voiceFollowUp: ModalityFollowUpDiscountDraft;
  videoFollowUp: ModalityFollowUpDiscountDraft;
}

export interface FollowUpFormDraft {
  enabled: boolean;
  max_followups: string;
  eligibility_window_days: string;
  discount_type: DiscountTypeOption;
  discount_value: string;
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `svc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Slug label → backend service_key pattern. */
export function slugifyLabelToServiceKey(label: string): string {
  let s = label
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_-]/g, "");
  if (!s) return "service";
  if (!/^[a-z0-9]/.test(s)) {
    s = `s_${s}`;
  }
  if (s.length > 64) s = s.slice(0, 64);
  return s;
}

function defaultModalityFollowUpDiscount(): ModalityFollowUpDiscountDraft {
  return {
    followUpDiscountEnabled: false,
    max_followups: "3",
    eligibility_window_days: "90",
    discount_type: "percent",
    discount_value: "30",
  };
}

export function emptyServiceDraft(): ServiceOfferingDraft {
  const sid =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : newId();
  return {
    id: newId(),
    service_id: sid,
    label: "",
    service_key: "",
    description: "",
    textEnabled: false,
    voiceEnabled: false,
    videoEnabled: true,
    textPriceMain: "",
    voicePriceMain: "",
    videoPriceMain: "",
    textFollowUp: defaultModalityFollowUpDiscount(),
    voiceFollowUp: defaultModalityFollowUpDiscount(),
    videoFollowUp: defaultModalityFollowUpDiscount(),
  };
}

export function defaultFollowUpDraft(): FollowUpFormDraft {
  return {
    enabled: false,
    max_followups: "3",
    eligibility_window_days: "90",
    discount_type: "percent",
    discount_value: "30",
  };
}

function modalityFollowUpDraftFromPolicy(
  p: FollowUpPolicyV1 | null | undefined,
  root: FollowUpPolicyV1 | null | undefined
): ModalityFollowUpDiscountDraft {
  const effective = p ?? root;
  if (!effective?.enabled) {
    return defaultModalityFollowUpDiscount();
  }
  const dv = effective.discount_value;
  const valueStr =
    dv === undefined || dv === null
      ? ""
      : effective.discount_type === "percent"
        ? String(dv)
        : String(dv / 100);
  return {
    followUpDiscountEnabled: true,
    max_followups: String(effective.max_followups),
    eligibility_window_days: String(effective.eligibility_window_days),
    discount_type: effective.discount_type,
    discount_value: valueStr,
  };
}

export function offeringToDraft(o: ServiceOfferingV1): ServiceOfferingDraft {
  const text = o.modalities.text;
  const voice = o.modalities.voice;
  const video = o.modalities.video;
  const sid =
    o.service_id ??
    (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : newId());
  const rootFu = o.followup_policy?.enabled ? o.followup_policy : undefined;

  return {
    id: newId(),
    service_id: sid,
    label: o.label,
    service_key: o.service_key,
    description: o.description?.trim() ?? "",
    textEnabled: !!text?.enabled,
    voiceEnabled: !!voice?.enabled,
    videoEnabled: !!video?.enabled,
    textPriceMain: text?.enabled ? minorToMain(text.price_minor) : "",
    voicePriceMain: voice?.enabled ? minorToMain(voice.price_minor) : "",
    videoPriceMain: video?.enabled ? minorToMain(video.price_minor) : "",
    textFollowUp: modalityFollowUpDraftFromPolicy(
      text?.followup_policy,
      text?.enabled ? rootFu : undefined
    ),
    voiceFollowUp: modalityFollowUpDraftFromPolicy(
      voice?.followup_policy,
      voice?.enabled ? rootFu : undefined
    ),
    videoFollowUp: modalityFollowUpDraftFromPolicy(
      video?.followup_policy,
      video?.enabled ? rootFu : undefined
    ),
  };
}

export function catalogToServiceDrafts(catalog: ServiceCatalogV1 | null): ServiceOfferingDraft[] {
  if (!catalog) return [];
  return catalog.services.map(offeringToDraft);
}

/** @deprecated SFU-12 — use per-service drafts only; kept for transitional imports */
export function catalogToFollowUpDraft(_catalog: ServiceCatalogV1 | null): FollowUpFormDraft {
  return defaultFollowUpDraft();
}

function mainToMinor(s: string): number | null {
  const t = s.trim();
  if (t === "") return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

function minorToMain(minor: number): string {
  return (minor / 100).toString();
}

function buildFollowUpPolicy(form: FollowUpFormDraft): FollowUpPolicyV1 | null {
  if (!form.enabled) return null;

  const maxFollow = parseInt(form.max_followups, 10);
  const windowDays = parseInt(form.eligibility_window_days, 10);
  if (Number.isNaN(maxFollow) || maxFollow < 0 || maxFollow > 100) {
    throw new Error("Max follow-up visits must be 0–100");
  }
  if (Number.isNaN(windowDays) || windowDays < 1 || windowDays > 3650) {
    throw new Error("Eligibility window must be 1–3650 days");
  }

  const dt = form.discount_type;
  let discount_value: number | undefined;

  if (dt === "percent") {
    const v = parseFloat(form.discount_value);
    if (!Number.isFinite(v) || v < 0 || v > 100) {
      throw new Error("Percent discount must be between 0 and 100");
    }
    discount_value = v;
  } else if (dt === "flat_off" || dt === "fixed_price") {
    const main = parseFloat(form.discount_value);
    if (!Number.isFinite(main) || main < 0) {
      throw new Error("Discount amount must be a non-negative number");
    }
    discount_value = Math.round(main * 100);
  } else {
    discount_value = 0;
  }

  return {
    enabled: true,
    max_followups: maxFollow,
    eligibility_window_days: windowDays,
    discount_type: dt,
    ...(discount_value !== undefined ? { discount_value } : {}),
  };
}

function buildModalityFollowUpPolicy(disc: ModalityFollowUpDiscountDraft): FollowUpPolicyV1 | null {
  if (!disc.followUpDiscountEnabled) return null;
  return buildFollowUpPolicy({
    enabled: true,
    max_followups: disc.max_followups,
    eligibility_window_days: disc.eligibility_window_days,
    discount_type: disc.discount_type,
    discount_value: disc.discount_value,
  });
}

function buildModalities(d: ServiceOfferingDraft): ServiceOfferingV1["modalities"] {
  const modalities: ServiceOfferingV1["modalities"] = {};
  if (d.textEnabled) {
    const m = mainToMinor(d.textPriceMain);
    if (m === null) throw new Error("Text price required");
    const fp = buildModalityFollowUpPolicy(d.textFollowUp);
    modalities.text = {
      enabled: true,
      price_minor: m,
      ...(fp ? { followup_policy: fp } : { followup_policy: null }),
    };
  }
  if (d.voiceEnabled) {
    const m = mainToMinor(d.voicePriceMain);
    if (m === null) throw new Error("Voice price required");
    const fp = buildModalityFollowUpPolicy(d.voiceFollowUp);
    modalities.voice = {
      enabled: true,
      price_minor: m,
      ...(fp ? { followup_policy: fp } : { followup_policy: null }),
    };
  }
  if (d.videoEnabled) {
    const m = mainToMinor(d.videoPriceMain);
    if (m === null) throw new Error("Video price required");
    const fp = buildModalityFollowUpPolicy(d.videoFollowUp);
    modalities.video = {
      enabled: true,
      price_minor: m,
      ...(fp ? { followup_policy: fp } : { followup_policy: null }),
    };
  }
  return modalities;
}

/** Build API payload from drafts. Returns null if user cleared all services (legacy-only). */
export function draftsToCatalogOrNull(services: ServiceOfferingDraft[]): ServiceCatalogV1 | null {
  if (services.length === 0) {
    return null;
  }

  const offerings: ServiceOfferingV1[] = services.map((d) => {
    if (!d.label.trim()) throw new Error("Each service needs a label");
    if (!d.service_id.trim()) throw new Error("Each service needs a stable id");

    const validateFu = (disc: ModalityFollowUpDiscountDraft) => {
      if (!disc.followUpDiscountEnabled) return;
      const mf = parseInt(disc.max_followups, 10);
      const wd = parseInt(disc.eligibility_window_days, 10);
      if (Number.isNaN(mf) || mf < 0 || mf > 100) {
        throw new Error("Max follow-up visits must be 0–100");
      }
      if (Number.isNaN(wd) || wd < 1 || wd > 3650) {
        throw new Error("Eligibility window must be 1–3650 days");
      }
    };
    if (d.textEnabled) validateFu(d.textFollowUp);
    if (d.voiceEnabled) validateFu(d.voiceFollowUp);
    if (d.videoEnabled) validateFu(d.videoFollowUp);

    try {
      const modalities = buildModalities(d);
      const key = d.service_key.trim().toLowerCase() || slugifyLabelToServiceKey(d.label);
      const base: ServiceOfferingV1 = {
        service_id: d.service_id.trim(),
        service_key: key,
        label: d.label.trim(),
        modalities,
        followup_policy: null,
      };
      const desc = d.description.trim();
      if (desc) {
        base.description = desc;
      }
      return base;
    } catch (e) {
      throw e;
    }
  });

  return {
    version: SERVICE_CATALOG_VERSION,
    services: offerings,
  };
}
