/**
 * SFU-06: Draft state ↔ ServiceCatalogV1 for Practice Setup editor.
 */

import type {
  FollowUpPolicyV1,
  ServiceCatalogV1,
  ServiceOfferingV1,
} from "@/lib/service-catalog-schema";
import { SERVICE_CATALOG_VERSION } from "@/lib/service-catalog-schema";

export type DiscountTypeOption = FollowUpPolicyV1["discount_type"];

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

function policyToForm(p: FollowUpPolicyV1 | null | undefined): FollowUpFormDraft {
  if (!p || !p.enabled) {
    return defaultFollowUpDraft();
  }
  const dv = p.discount_value;
  const valueStr =
    dv === undefined || dv === null ? "" : p.discount_type === "percent" ? String(dv) : String(dv / 100);
  return {
    enabled: true,
    max_followups: String(p.max_followups),
    eligibility_window_days: String(p.eligibility_window_days),
    discount_type: p.discount_type,
    discount_value: valueStr,
  };
}

function policiesEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/** Pick uniform follow-up from catalog (all services same → form; else first non-null). */
export function catalogToFollowUpDraft(catalog: ServiceCatalogV1 | null): FollowUpFormDraft {
  if (!catalog || catalog.services.length === 0) {
    return defaultFollowUpDraft();
  }
  const policies = catalog.services.map((s) => s.followup_policy ?? null);
  const first = policies.find((p) => p && p.enabled) ?? null;
  if (!first) {
    return defaultFollowUpDraft();
  }
  const allSame = policies.every((p) => policiesEqual(p, first));
  return policyToForm(allSame ? first : first);
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

export function offeringToDraft(o: ServiceOfferingV1): ServiceOfferingDraft {
  const text = o.modalities.text;
  const voice = o.modalities.voice;
  const video = o.modalities.video;
  const sid =
    o.service_id ??
    (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : newId());
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
  };
}

export function catalogToServiceDrafts(catalog: ServiceCatalogV1 | null): ServiceOfferingDraft[] {
  if (!catalog) return [];
  return catalog.services.map(offeringToDraft);
}

function buildModalities(d: ServiceOfferingDraft): ServiceOfferingV1["modalities"] {
  const modalities: ServiceOfferingV1["modalities"] = {};
  if (d.textEnabled) {
    const m = mainToMinor(d.textPriceMain);
    if (m === null) throw new Error("Text price required");
    modalities.text = { enabled: true, price_minor: m };
  }
  if (d.voiceEnabled) {
    const m = mainToMinor(d.voicePriceMain);
    if (m === null) throw new Error("Voice price required");
    modalities.voice = { enabled: true, price_minor: m };
  }
  if (d.videoEnabled) {
    const m = mainToMinor(d.videoPriceMain);
    if (m === null) throw new Error("Video price required");
    modalities.video = { enabled: true, price_minor: m };
  }
  return modalities;
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

/** Build API payload from drafts. Returns null if user cleared all services (legacy-only). */
export function draftsToCatalogOrNull(
  services: ServiceOfferingDraft[],
  followUp: FollowUpFormDraft
): ServiceCatalogV1 | null {
  if (services.length === 0) {
    return null;
  }

  let followup_policy: FollowUpPolicyV1 | null;
  try {
    followup_policy = buildFollowUpPolicy(followUp);
  } catch (e) {
    throw e;
  }

  const offerings: ServiceOfferingV1[] = services.map((d) => {
    if (!d.label.trim()) throw new Error("Each service needs a label");
    if (!d.service_id.trim()) throw new Error("Each service needs a stable id");
    const modalities = buildModalities(d);
    const key =
      d.service_key.trim().toLowerCase() || slugifyLabelToServiceKey(d.label);
    const base: ServiceOfferingV1 = {
      service_id: d.service_id.trim(),
      service_key: key,
      label: d.label.trim(),
      modalities,
      ...(followup_policy ? { followup_policy } : { followup_policy: null }),
    };
    const desc = d.description.trim();
    if (desc) {
      base.description = desc;
    }
    return base;
  });

  return {
    version: SERVICE_CATALOG_VERSION,
    services: offerings,
  };
}
