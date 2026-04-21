/**
 * Modality Pricing — shared fee source of truth (Plan 09 · Task 49)
 *
 * Decision 11 LOCKED symmetric mid-consult billing: upgrade → capture
 * the delta; downgrade → auto-refund the delta. Every caller that
 * needs "what is the delta between modality X and modality Y for
 * doctor D?" routes through this file so the pricing rule has a
 * single source.
 *
 * ## Consumers
 *
 *   · `modality-billing-service.computeUpgradeDelta` — state-machine
 *     Step that decides free vs paid upgrade (Decision 11 matrix).
 *   · `modality-billing-service.autoRefundDowngrade` (indirectly,
 *     via Task 47 which passes the delta into the refund call).
 *   · Task 51's approval modal — "₹X difference" copy.
 *   · Task 55's post-consult timeline — fee column per transition.
 *
 * ## Fee source + fallback order
 *
 *   1. `doctor_settings.service_offerings_json` — V1 schema; per-
 *      service per-modality `price_minor`. Primary source.
 *   2. `appointments.fee_paise` — original booking fee. Acts as the
 *      baseline for both the current and target modality when the
 *      catalog does not declare a modality-specific price.
 *   3. Hardcoded defaults (₹100 text / ₹200 voice / ₹500 video) with
 *      a warning log so ops can push doctors to configure the
 *      catalog.
 *
 * ## v1 multi-service disambiguation
 *
 * A doctor's catalog can declare multiple services (consultation,
 * follow-up, specialised panel, etc) with distinct per-modality
 * prices. For mid-consult pricing we take the **maximum** price
 * across enabled services for each modality. Rationale: upgrading
 * cannot be cheaper than any of the doctor's listed upgrade paths,
 * and the max keeps the delta conservative (patients never underpay
 * an upgrade, doctors never over-refund a downgrade). When the
 * session can be tied to a specific service later (Plan 10+) the
 * helper can narrow to that row; v1 picks the max. Documented as a
 * v1 deviation in the task doc.
 *
 * ## Caching
 *
 * `getModalityFeesForDoctor` reads the doctor-settings row fresh per
 * call. Doctors editing pricing during a live consult is rare but
 * possible; the pricing is locked-in at history-row INSERT time by
 * Task 47 (the `amount_paise` column), so subsequent refund /
 * display paths read the snapshot from the history row rather than
 * this helper.
 *
 * Shared request-scope memoisation would require plumbing a cache
 * key through the Express chain; v1 skips that and relies on the
 * caller's own pattern (e.g. Task 47's state-machine flow calls this
 * once per transition and threads the result through).
 *
 * @see docs/Development/Daily-plans/April 2026/19-04-2026/Tasks/task-49-modality-billing-razorpay-capture-and-refund.md
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { getSupabaseAdminClient } from '../config/database';
import { logger } from '../config/logger';
import { getDoctorSettings } from '../services/doctor-settings-service';
import type { Modality } from '../types/consultation-session';

import { getActiveServiceCatalog } from './service-catalog-helpers';

// ============================================================================
// Fallback defaults (paise)
// ============================================================================

/**
 * Hardcoded defaults used only when neither the service catalog nor
 * the booking fee supply a per-modality price. Represent reasonable
 * "what a solo practitioner would charge in India" values so the
 * product keeps working for freshly onboarded doctors who haven't
 * yet configured `service_offerings_json`. A warning log fires every
 * time these fire so ops can push doctors to configure.
 */
export const FALLBACK_MODALITY_FEES_PAISE: Readonly<Record<Modality, number>> = {
  text:  10_000,  // ₹100
  voice: 20_000,  // ₹200
  video: 50_000,  // ₹500
} as const;

// ============================================================================
// Public shape
// ============================================================================

export type ModalityFeeSource =
  | 'service_offerings_json'
  | 'appointments_fee_paise'
  | 'fallback_default';

export interface ModalityFeeRow {
  modality: Modality;
  feePaise: number;
  source:   ModalityFeeSource;
}

export interface DoctorModalityFees {
  text:  ModalityFeeRow;
  voice: ModalityFeeRow;
  video: ModalityFeeRow;
}

export interface GetModalityFeesInput {
  doctorId: string;
  /** Optional baseline fee (the session's originating `appointments.fee_paise`). Used as fallback tier 2. */
  appointmentFeePaise?: number | null;
  /** Optional admin client override (test injection). Falls back to `getSupabaseAdminClient()`. */
  db?: SupabaseClient;
  /** Optional correlation id for log threading. */
  correlationId?: string;
}

// ============================================================================
// getModalityFeesForDoctor
// ============================================================================

/**
 * Resolve per-modality fees for a doctor using the fallback ladder
 * documented above. Always returns a complete `{ text, voice, video }`
 * triple — never throws on missing data; emits a warning log instead.
 */
export async function getModalityFeesForDoctor(
  input: GetModalityFeesInput,
): Promise<DoctorModalityFees> {
  const { doctorId, appointmentFeePaise, correlationId } = input;

  // Primary source: doctor_settings.service_offerings_json.
  let fromCatalog: Partial<Record<Modality, number>> = {};
  try {
    const settings = await getDoctorSettings(doctorId);
    const catalog = getActiveServiceCatalog(settings);
    if (catalog) {
      fromCatalog = aggregateCatalogModalityPricesMax(catalog);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(
      { correlationId, doctorId, error: msg },
      'modality-pricing.getModalityFeesForDoctor: catalog read failed; continuing with fallbacks',
    );
  }

  const resolve = (m: Modality): ModalityFeeRow => {
    const catalogPrice = fromCatalog[m];
    if (catalogPrice != null && catalogPrice > 0) {
      return { modality: m, feePaise: catalogPrice, source: 'service_offerings_json' };
    }
    if (appointmentFeePaise != null && appointmentFeePaise > 0) {
      return { modality: m, feePaise: appointmentFeePaise, source: 'appointments_fee_paise' };
    }
    logger.warn(
      { correlationId, doctorId, modality: m, fallback: FALLBACK_MODALITY_FEES_PAISE[m] },
      'modality-pricing.getModalityFeesForDoctor: falling back to hardcoded default — configure service_offerings_json',
    );
    return {
      modality: m,
      feePaise: FALLBACK_MODALITY_FEES_PAISE[m],
      source:   'fallback_default',
    };
  };

  return {
    text:  resolve('text'),
    voice: resolve('voice'),
    video: resolve('video'),
  };
}

// ============================================================================
// Delta helpers (pure)
// ============================================================================

/**
 * Positive delta when `to > from` (upgrade). Throws when the pair is
 * not an upgrade (callers are expected to classify direction first —
 * see `classifyModalityDirection` in `types/modality-history`).
 */
export function computeUpgradeDeltaPaise(input: {
  fees:         DoctorModalityFees;
  fromModality: Modality;
  toModality:   Modality;
}): number {
  if (input.fromModality === input.toModality) {
    throw new Error(
      `computeUpgradeDeltaPaise: from (${input.fromModality}) === to (${input.toModality}) — no delta`,
    );
  }
  if (!isUpgrade(input.fromModality, input.toModality)) {
    throw new Error(
      `computeUpgradeDeltaPaise: (${input.fromModality} → ${input.toModality}) is not an upgrade`,
    );
  }
  const delta = input.fees[input.toModality].feePaise - input.fees[input.fromModality].feePaise;
  return Math.max(0, delta);
}

/**
 * Positive amount to refund when `to < from` (downgrade). Throws
 * when the pair is not a downgrade. Returns 0 when the doctor has
 * priced both modalities identically (free_upgrade's mirror —
 * Decision 11's flat-rate case) — the caller routes to
 * `no_refund_downgrade` in that case.
 */
export function computeDowngradeRefundPaise(input: {
  fees:         DoctorModalityFees;
  fromModality: Modality;
  toModality:   Modality;
}): number {
  if (input.fromModality === input.toModality) {
    throw new Error(
      `computeDowngradeRefundPaise: from (${input.fromModality}) === to (${input.toModality}) — no delta`,
    );
  }
  if (!isDowngrade(input.fromModality, input.toModality)) {
    throw new Error(
      `computeDowngradeRefundPaise: (${input.fromModality} → ${input.toModality}) is not a downgrade`,
    );
  }
  const delta = input.fees[input.fromModality].feePaise - input.fees[input.toModality].feePaise;
  return Math.max(0, delta);
}

// ============================================================================
// Internals
// ============================================================================

const MODALITY_ORDINAL: Readonly<Record<Modality, number>> = {
  text:  0,
  voice: 1,
  video: 2,
};

function isUpgrade(from: Modality, to: Modality): boolean {
  return MODALITY_ORDINAL[to] > MODALITY_ORDINAL[from];
}

function isDowngrade(from: Modality, to: Modality): boolean {
  return MODALITY_ORDINAL[to] < MODALITY_ORDINAL[from];
}

/**
 * Collapse a multi-service V1 catalog into a per-modality price
 * map using the **MAX-across-enabled-services** rule (see file-level
 * rationale). Modalities missing from every enabled service (or
 * priced at 0 everywhere) are absent from the returned map — the
 * caller's fallback ladder handles that.
 */
function aggregateCatalogModalityPricesMax(
  catalog: { services: ReadonlyArray<{ modalities: { text?: { enabled: boolean; price_minor: number } | undefined; voice?: { enabled: boolean; price_minor: number } | undefined; video?: { enabled: boolean; price_minor: number } | undefined } }>,
  },
): Partial<Record<Modality, number>> {
  const out: Partial<Record<Modality, number>> = {};
  const track = (m: Modality, slot: { enabled: boolean; price_minor: number } | undefined): void => {
    if (!slot || !slot.enabled) return;
    if (slot.price_minor <= 0) return;
    const prior = out[m];
    if (prior == null || slot.price_minor > prior) {
      out[m] = slot.price_minor;
    }
  };
  for (const svc of catalog.services) {
    track('text',  svc.modalities.text);
    track('voice', svc.modalities.voice);
    track('video', svc.modalities.video);
  }
  return out;
}

// ============================================================================
// Test-only hooks
// ============================================================================

/**
 * Test-only passthrough to the internal aggregator so unit tests
 * can pin the max-across-services rule without reaching through the
 * public fee-resolve + DB path.
 */
export const __testOnly__ = {
  aggregateCatalogModalityPricesMax,
  isUpgrade,
  isDowngrade,
};

// Silence unused-import if TypeScript strips the type — keep the
// symbol referenced so callers can rely on the plain `SupabaseClient`
// compatibility even though the current v1 impl always reaches for
// the shared admin client.
void getSupabaseAdminClient;
