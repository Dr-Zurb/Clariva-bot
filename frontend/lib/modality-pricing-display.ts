"use client";

/**
 * Shared modality-pricing display helpers (Plan 09 · Task 51).
 *
 * Two concerns:
 *
 *   1. **`formatInrPaise(paise)`** — the canonical INR formatter used
 *      by every modality-change modal (Task 50 + Task 51 + Task 52).
 *      Delegates to `Intl.NumberFormat('en-IN', 'INR')` with no
 *      fractional digits so `35000 → "₹350"` (matches booking-time
 *      UI convention).
 *
 *   2. **`fetchModalityPricing(token, sessionId)`** — reads the
 *      per-modality fee table the backend exposes via the
 *      `GET /modality-change/state` response's optional `pricing`
 *      block. Task 47's initial `/state` implementation does NOT
 *      yet surface the `pricing` block (inbox follow-up); this
 *      helper returns `null` in that case so callers can fall back
 *      to server-computed deltas passed via props (the modal
 *      contracts already accept `deltaPaise` / `refundAmountPaise`
 *      as props, so absence of the pricing block is non-blocking).
 *
 * @see frontend/components/consultation/ModalityUpgradeApprovalModal.tsx
 * @see frontend/components/consultation/DoctorUpgradeInitiationModal.tsx
 * @see frontend/components/consultation/ModalityDowngradeModal.tsx
 */

import { requireApiBaseUrl } from "@/lib/api-base";
import type { Modality } from "@/types/modality-change";

// ----------------------------------------------------------------------------
// formatInrPaise
// ----------------------------------------------------------------------------

const INR_FORMATTER = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

/**
 * Convert minor-unit paise to a display string — `35000 → "₹350"`.
 * Always rounded (no fractional rupees) so the displayed price matches
 * the pricing catalogue's enforced rupee granularity.
 */
export function formatInrPaise(paise: number): string {
  return INR_FORMATTER.format(Math.round(paise / 100));
}

// ----------------------------------------------------------------------------
// fetchModalityPricing
// ----------------------------------------------------------------------------

export interface ModalityPricingResponse {
  /** Per-modality absolute fee (paise). */
  fees: Record<Modality, { feePaise: number }>;
  /**
   * Upgrade delta from the CURRENT modality to each target. Only the
   * keys for target modalities strictly-greater than current are
   * populated (e.g. if current = voice, keys = { video: 35000 }).
   */
  upgradeDeltaPaiseFromCurrent: Partial<Record<Modality, number>>;
  /**
   * Downgrade delta from the CURRENT modality to each target. Keys
   * strictly-less than current (e.g. if current = video, keys =
   * { voice: 35000, text: 50000 }).
   */
  downgradeDeltaPaiseFromCurrent: Partial<Record<Modality, number>>;
}

/**
 * Fetch per-session modality pricing. Returns `null` when the
 * backend's `/state` response doesn't include a `pricing` block yet
 * (v1 — backend extension is an inbox follow-up tied to Task 47).
 *
 * Calling surface mirrors `getModalityChangeState` — we hit the
 * same endpoint but project only the pricing slice. Using a separate
 * helper (rather than extending `getModalityChangeState` to return
 * both) keeps the modal contracts independent of the pricing hook:
 * the modal can still render using prop-provided deltas when the
 * backend extension isn't in place yet.
 */
export async function fetchModalityPricing(
  token: string,
  sessionId: string,
): Promise<ModalityPricingResponse | null> {
  const res = await fetch(
    `${requireApiBaseUrl()}/api/v1/consultation/${encodeURIComponent(sessionId)}/modality-change/state`,
    {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    },
  );
  if (!res.ok) {
    // Non-2xx here is a generic surface error — callers that need
    // pricing should render a "price not available" label and allow
    // the doctor to proceed; the server will re-compute authoritative
    // amounts at request time anyway.
    return null;
  }
  const json = (await res.json().catch(() => null)) as
    | {
        success?: boolean;
        data?: {
          state?: {
            pricing?: ModalityPricingResponse;
          } | null;
        };
      }
    | null;
  const pricing = json?.data?.state?.pricing;
  if (!pricing) return null;
  return pricing;
}
