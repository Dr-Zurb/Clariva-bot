/**
 * Consultation visit quote engine (SFU-03)
 *
 * Pure, authoritative **index** vs **follow-up** pricing from `service_offerings_json`
 * (or legacy `appointment_fee_minor`) plus optional **active episode** row.
 * Platform fee / GST are applied later in the payment layer (SFU-05).
 *
 * **Episode `price_snapshot_json` v1** (written at index completion, SFU-04):
 * ```json
 * {
 *   "version": 1,
 *   "modalities": { "video": { "price_minor": 50000 }, "text": { "price_minor": 10000 } },
 *   "followup_policy": { "enabled": true, "max_followups": 3, "eligibility_window_days": 90,
 *     "discount_type": "percent", "discount_value": 30 }
 * }
 * ```
 * If `followup_policy` is omitted, the current catalog offering's `followup_policy` is used (replay).
 *
 * **Expired / exhausted episode:** caller may still pass the row; this engine **falls back to index**
 * pricing (list price) so payments can open a **new** episode downstream — see PLAN §3.3.
 *
 * @see docs/Development/Daily-plans/March 2026/2026-03-27/services-and-follow-ups/PLAN-services-modalities-and-follow-ups.md §3.3, §9
 */

import type { CareEpisodeRow } from '../types/care-episode';
import type { DoctorSettingsRow } from '../types/doctor-settings';
import {
  LegacyAppointmentFeeNotConfiguredError,
  ModalityNotOfferedForQuote,
  ServiceNotFoundForQuote,
} from '../utils/errors';
import { findServiceOfferingByKey, getActiveServiceCatalog } from '../utils/service-catalog-helpers';
import type { FollowUpPolicyV1, ServiceOfferingV1 } from '../utils/service-catalog-schema';
import { followUpPolicyV1Schema } from '../utils/service-catalog-schema';

export const CONSULTATION_MODALITIES = ['text', 'voice', 'video'] as const;
export type ConsultationModality = (typeof CONSULTATION_MODALITIES)[number];

export interface VisitQuote {
  kind: 'index' | 'followup';
  /** Duplicate of `kind` for payment / metadata consumers */
  visit_kind: 'index' | 'followup';
  amount_minor: number;
  currency: string;
  service_key: string;
  /** SFU-11: stable id from `service_offerings_json` */
  service_id: string;
  modality: ConsultationModality;
  episode_id?: string;
  /** Discounted follow-up visits remaining **after** this quoted visit */
  visits_remaining?: number;
  /** 1 = index visit; 2 = first follow-up, etc. */
  visit_index?: number;
}

export interface QuoteConsultationVisitInput {
  settings: DoctorSettingsRow | null;
  catalogServiceKey: string;
  /** SFU-11: when set, must match episode.catalog_service_id for follow-up path */
  catalogServiceId?: string | null;
  modality: ConsultationModality;
  /** Booking / quote time (eligibility vs `eligibility_ends_at`) */
  at: Date;
  /** Optional active episode for same doctor + patient + service (SFU-02) */
  activeEpisode?: CareEpisodeRow | null;
}

function resolveCurrency(settings: DoctorSettingsRow | null): string {
  const c = settings?.appointment_fee_currency?.trim();
  if (c && /^[A-Z]{3}$/.test(c)) {
    return c;
  }
  return 'INR';
}

function readSlotMinor(
  modalities: Partial<Record<ConsultationModality, unknown>>,
  modality: ConsultationModality
): { price_minor: number; enabled: boolean } | null {
  const slot = modalities[modality];
  if (!slot || typeof slot !== 'object') {
    return null;
  }
  const rec = slot as { enabled?: unknown; price_minor?: unknown };
  const enabled = rec.enabled === true;
  const pm = rec.price_minor;
  if (typeof pm !== 'number' || !Number.isInteger(pm) || pm < 0) {
    return null;
  }
  return { enabled, price_minor: pm };
}

/** Episode snapshot: `enabled` optional; explicit `enabled: false` excludes modality */
function readSnapshotModalityMinor(val: unknown): number | null {
  if (!val || typeof val !== 'object' || Array.isArray(val)) {
    return null;
  }
  const rec = val as { enabled?: unknown; price_minor?: unknown };
  if (rec.enabled === false) {
    return null;
  }
  const pm = rec.price_minor;
  if (typeof pm !== 'number' || !Number.isInteger(pm) || pm < 0) {
    return null;
  }
  return pm;
}

function indexAmountFromOffering(offering: ServiceOfferingV1, modality: ConsultationModality): number {
  const slot = readSlotMinor(offering.modalities as Partial<Record<ConsultationModality, unknown>>, modality);
  if (!slot?.enabled) {
    throw new ModalityNotOfferedForQuote(offering.service_key, modality);
  }
  return slot.price_minor;
}

function parseFollowUpPolicyLoose(raw: unknown): FollowUpPolicyV1 | null {
  if (raw === null || raw === undefined) {
    return null;
  }
  const r = followUpPolicyV1Schema.safeParse(raw);
  return r.success ? r.data : null;
}

export interface ParsedEpisodePriceSnapshotV1 {
  modalities: Partial<Record<ConsultationModality, { price_minor: number }>>;
  followup_policy: FollowUpPolicyV1 | null;
}

/** Read locked snapshot + optional frozen policy from `care_episodes.price_snapshot_json` */
export function parseEpisodePriceSnapshotV1(raw: Record<string, unknown>): ParsedEpisodePriceSnapshotV1 {
  const modalities: Partial<Record<ConsultationModality, { price_minor: number }>> = {};

  const wrap = raw['modalities'];
  if (wrap && typeof wrap === 'object' && wrap !== null && !Array.isArray(wrap)) {
    const obj = wrap as Record<string, unknown>;
    for (const m of CONSULTATION_MODALITIES) {
      const pm = readSnapshotModalityMinor(obj[m]);
      if (pm !== null) {
        modalities[m] = { price_minor: pm };
      }
    }
  } else {
    for (const m of CONSULTATION_MODALITIES) {
      const pm = readSnapshotModalityMinor(raw[m]);
      if (pm !== null) {
        modalities[m] = { price_minor: pm };
      }
    }
  }

  const followup_policy = parseFollowUpPolicyLoose(raw['followup_policy']);

  return { modalities, followup_policy };
}

function baseMinorFromSnapshotModalities(
  modalities: Partial<Record<ConsultationModality, { price_minor: number }>>,
  serviceKey: string,
  modality: ConsultationModality
): number {
  const entry = modalities[modality];
  if (!entry || typeof entry.price_minor !== 'number') {
    throw new ModalityNotOfferedForQuote(serviceKey, modality);
  }
  return entry.price_minor;
}

/**
 * SFU-09: pick tier with greatest `from_visit` <= visitIndex; else top-level `discount_type` / `discount_value`.
 * `visitIndex`: 2 = first follow-up after index completion, 3 = second follow-up, ...
 */
export function resolveFollowUpDiscountSpec(
  policy: FollowUpPolicyV1,
  visitIndex: number
): { discount_type: FollowUpPolicyV1['discount_type']; discount_value: number | undefined } {
  const tiers = policy.discount_tiers;
  if (tiers?.length) {
    const applicable = tiers.filter((t) => t.from_visit <= visitIndex);
    if (applicable.length > 0) {
      const best = applicable.reduce((a, b) => (a.from_visit >= b.from_visit ? a : b));
      return { discount_type: best.discount_type, discount_value: best.discount_value };
    }
  }
  return { discount_type: policy.discount_type, discount_value: policy.discount_value };
}

/**
 * Apply follow-up discount to base minor amount (integer minor units out).
 * When `visitIndex` is set and `policy.discount_tiers` is non-empty, tier rules apply (SFU-09).
 */
export function applyFollowUpDiscount(
  baseMinor: number,
  policy: FollowUpPolicyV1 | null,
  visitIndex?: number
): number {
  if (!policy || !policy.enabled) {
    return baseMinor;
  }
  const spec =
    visitIndex != null && policy.discount_tiers?.length
      ? resolveFollowUpDiscountSpec(policy, visitIndex)
      : { discount_type: policy.discount_type, discount_value: policy.discount_value };
  const v = spec.discount_value ?? 0;
  switch (spec.discount_type) {
    case 'none':
      return baseMinor;
    case 'free':
      return 0;
    case 'percent':
      return Math.round((baseMinor * (100 - Math.min(100, v))) / 100);
    case 'flat_off':
      return Math.max(0, baseMinor - Math.round(v));
    case 'fixed_price':
      return Math.max(0, Math.round(v));
    default:
      return baseMinor;
  }
}

function normalizeServiceKey(catalogServiceKey: string): string {
  return catalogServiceKey.trim().toLowerCase();
}

function episodeMatchesQuoteCatalog(
  ep: CareEpisodeRow,
  serviceKeyNorm: string,
  catalogServiceId?: string | null
): boolean {
  const qid = catalogServiceId?.trim();
  const eid = ep.catalog_service_id?.trim();
  if (qid && eid) {
    return qid === eid;
  }
  return ep.catalog_service_key.trim().toLowerCase() === serviceKeyNorm;
}

/** Whether an active episode still qualifies for discounted follow-up pricing */
export function isEpisodeEligibleForFollowUpQuote(episode: CareEpisodeRow, at: Date): boolean {
  if (episode.status !== 'active') {
    return false;
  }
  if (episode.followups_used >= episode.max_followups) {
    return false;
  }
  if (episode.eligibility_ends_at) {
    const end = new Date(episode.eligibility_ends_at);
    if (at.getTime() > end.getTime()) {
      return false;
    }
  }
  return true;
}

function quoteIndexPath(
  settings: DoctorSettingsRow | null,
  serviceKeyNorm: string,
  modality: ConsultationModality
): { amount_minor: number; currency: string } {
  const catalog = getActiveServiceCatalog(settings);
  const currency = resolveCurrency(settings);

  if (!catalog) {
    const minor = settings?.appointment_fee_minor;
    if (minor === null || minor === undefined) {
      throw new LegacyAppointmentFeeNotConfiguredError();
    }
    if (!Number.isInteger(minor) || minor < 0) {
      throw new LegacyAppointmentFeeNotConfiguredError();
    }
    return { amount_minor: minor, currency };
  }

  const offering = findServiceOfferingByKey(catalog, serviceKeyNorm);
  if (!offering) {
    throw new ServiceNotFoundForQuote(serviceKeyNorm);
  }
  const amount_minor = indexAmountFromOffering(offering, modality);
  return { amount_minor, currency };
}

function effectiveFollowUpPolicy(
  snapshotPolicy: FollowUpPolicyV1 | null,
  catalogOffering: ServiceOfferingV1 | null
): FollowUpPolicyV1 | null {
  if (snapshotPolicy) {
    return snapshotPolicy;
  }
  const fromCatalog = catalogOffering?.followup_policy;
  if (!fromCatalog) {
    return null;
  }
  return fromCatalog;
}

/**
 * Authoritative visit quote for payments, booking, and bot (SFU-03).
 *
 * - **Different service (`catalog_service_id` or `catalog_service_key`) than episode:** episode ignored → **index**.
 * - **Expired eligibility or exhausted follow-ups:** index list price (new episode path downstream).
 */
export function quoteConsultationVisit(input: QuoteConsultationVisitInput): VisitQuote {
  const { settings, catalogServiceKey, catalogServiceId, modality, at, activeEpisode } = input;
  const service_key = normalizeServiceKey(catalogServiceKey);
  const currency = resolveCurrency(settings);
  const catalog = getActiveServiceCatalog(settings);

  const episodeForService =
    activeEpisode && episodeMatchesQuoteCatalog(activeEpisode, service_key, catalogServiceId)
      ? activeEpisode
      : null;

  const useFollowUp =
    episodeForService && isEpisodeEligibleForFollowUpQuote(episodeForService, at);

  if (useFollowUp) {
    const snap = parseEpisodePriceSnapshotV1(episodeForService.price_snapshot_json);
    const baseMinor = baseMinorFromSnapshotModalities(snap.modalities, service_key, modality);

    const offering = catalog ? findServiceOfferingByKey(catalog, service_key) : null;
    const policy = effectiveFollowUpPolicy(snap.followup_policy, offering ?? null);

    const followupsUsed = episodeForService.followups_used;
    const maxFollow = episodeForService.max_followups;
    const visits_remaining = Math.max(0, maxFollow - followupsUsed - 1);
    const visit_index = followupsUsed + 2;
    const amount_minor = applyFollowUpDiscount(baseMinor, policy, visit_index);

    const offeringFu = catalog ? findServiceOfferingByKey(catalog, service_key) : null;
    const sidFu =
      offeringFu?.service_id ??
      episodeForService.catalog_service_id?.trim() ??
      '';

    return {
      kind: 'followup',
      visit_kind: 'followup',
      amount_minor,
      currency,
      service_key,
      service_id: sidFu,
      modality,
      episode_id: episodeForService.id,
      visits_remaining,
      visit_index,
    };
  }

  const { amount_minor } = quoteIndexPath(settings, service_key, modality);
  const offeringIx = catalog ? findServiceOfferingByKey(catalog, service_key) : null;
  return {
    kind: 'index',
    visit_kind: 'index',
    amount_minor,
    currency,
    service_key,
    service_id: offeringIx?.service_id ?? '',
    modality,
    visit_index: 1,
  };
}
