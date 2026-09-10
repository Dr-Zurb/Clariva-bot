/**
 * Prefill amount for desk Collect. Catalog in-person prices come later;
 * this reads the legacy flat fee only.
 */

export function resolveDeskVisitQuote(settings: {
  appointment_fee_minor?: number | null;
  appointment_fee_currency?: string | null;
} | null): { amountMinor: number | null; currency: string } {
  const raw = settings?.appointment_fee_currency?.trim().toUpperCase() ?? '';
  const currency = /^[A-Z]{3}$/.test(raw) ? raw : 'INR';
  const minor = settings?.appointment_fee_minor;
  if (minor === null || minor === undefined || !Number.isInteger(minor) || minor < 0) {
    return { amountMinor: null, currency };
  }
  return { amountMinor: minor, currency };
}
