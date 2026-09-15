/**
 * Locked Halo Aid pricing sheet (P1-D4).
 * Product constants — not env. Nothing else hardcodes these rupees.
 *
 * @see docs/Reference/business/PRICING_MODEL_DECISIONS.md
 */

export const BASE_MINOR = 99_900;
export const INCLUDED_CONSULTS = 20;
export const PER_CONSULT_MINOR = 4_900;
export const CAP_MINOR = 1_249_900;
export const GST_PERCENT = 18;

/** P1.6 — previous same-day consult shorter than this voids the continuation. */
export const SAME_ENCOUNTER_MAX_SECONDS = 120;

export const BILLING_TZ = 'Asia/Kolkata';

export const CAP_REACHED_COPY =
  'You have hit the monthly maximum. Every further consult this month is free.';

export interface MonthlyBillInput {
  billableCount: number;
  baseMinor?: number;
  includedConsults?: number;
  perConsultMinor?: number;
  capMinor?: number;
}

export interface MonthlyBill {
  baseMinor: number;
  meteredMinor: number;
  subtotalMinor: number;
  cappedMinor: number;
  gstMinor: number;
  totalMinor: number;
  capReached: boolean;
}

export function computeMonthlyBill(input: MonthlyBillInput): MonthlyBill {
  const billableCount = Math.max(0, Math.floor(input.billableCount));
  const included = input.includedConsults ?? INCLUDED_CONSULTS;
  const baseMinor = input.baseMinor ?? BASE_MINOR;
  const perConsultMinor = input.perConsultMinor ?? PER_CONSULT_MINOR;
  const capMinor = input.capMinor ?? CAP_MINOR;
  const meteredCount = Math.max(0, billableCount - included);
  const meteredMinor = meteredCount * perConsultMinor;
  const subtotalMinor = baseMinor + meteredMinor;
  const capReached = subtotalMinor > capMinor;
  const cappedMinor = Math.min(subtotalMinor, capMinor);
  const gstMinor = Math.round((cappedMinor * GST_PERCENT) / 100);
  const totalMinor = cappedMinor + gstMinor;
  return {
    baseMinor,
    meteredMinor,
    subtotalMinor,
    cappedMinor,
    gstMinor,
    totalMinor,
    capReached,
  };
}

export function isBaseWaived(billingPeriod: string, waivedUntil: string | null | undefined): boolean {
  if (!waivedUntil) return false;
  return billingPeriod <= waivedUntil;
}

/** GST-inclusive rupees doctors hear (B7): ₹1,179 · ₹58 · ₹14,749. */
export function gstInclusiveRupees(exGstMinor: number): number {
  return Math.round((exGstMinor / 100) * (1 + GST_PERCENT / 100));
}

export function consultsUntilCap(
  billableCount: number,
  levels?: Omit<MonthlyBillInput, 'billableCount'>
): number {
  const opts = levels ?? {};
  const start = Math.max(0, Math.floor(billableCount));
  if (computeMonthlyBill({ billableCount: start, ...opts }).capReached) return 0;
  let n = start;
  const guard = start + 5000;
  while (!computeMonthlyBill({ billableCount: n + 1, ...opts }).capReached) {
    n += 1;
    if (n >= guard) return 0;
  }
  return n + 1 - start;
}
