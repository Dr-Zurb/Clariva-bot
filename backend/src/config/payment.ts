/**
 * Payment Gateway Configuration
 *
 * Configuration for Razorpay (India) and PayPal (International).
 * Used by payment adapters and service.
 *
 * IMPORTANT:
 * - No PCI data in config
 * - Keys from env (RAZORPAY_*, PAYPAL_*)
 */

import { env } from './env';

// ============================================================================
// Razorpay Config (India - INR)
// ============================================================================

export const razorpayConfig = {
  keyId: env.RAZORPAY_KEY_ID,
  keySecret: env.RAZORPAY_KEY_SECRET,
  baseUrl: 'https://api.razorpay.com/v1',
  /** Default currency for India */
  defaultCurrency: 'INR' as const,
} as const;

export function isRazorpayConfigured(): boolean {
  return !!(razorpayConfig.keyId && razorpayConfig.keySecret);
}

// ============================================================================
// PayPal Config (International - USD, EUR, GBP)
// ============================================================================

export const paypalConfig = {
  clientId: env.PAYPAL_CLIENT_ID,
  clientSecret: env.PAYPAL_CLIENT_SECRET,
  mode: env.PAYPAL_MODE,
  baseUrl:
    env.PAYPAL_MODE === 'live'
      ? 'https://api-m.paypal.com'
      : 'https://api-m.sandbox.paypal.com',
  /** Default currency for international */
  defaultCurrency: 'USD' as const,
} as const;

export function isPayPalConfigured(): boolean {
  return !!(paypalConfig.clientId && paypalConfig.clientSecret);
}

// ============================================================================
// Region Routing (Doctor Country -> Gateway)
// ============================================================================

/** India and India-like regions use Razorpay */
const RAZORPAY_COUNTRIES = new Set(['IN', 'INDIA']);

/** International regions use PayPal */
const PAYPAL_COUNTRIES = new Set(['US', 'USA', 'UK', 'EU', 'GB', 'GBR']);

export type PaymentGatewayChoice = 'razorpay' | 'paypal';

/**
 * Select gateway by doctor country.
 * India (IN) -> Razorpay; US/UK/EU -> PayPal; default -> Razorpay for MVP (India-first fallback)
 */
export function selectGatewayByCountry(doctorCountry: string): PaymentGatewayChoice {
  const normalized = (doctorCountry || env.DEFAULT_DOCTOR_COUNTRY || 'IN')
    .trim()
    .toUpperCase()
    .slice(0, 3);
  if (RAZORPAY_COUNTRIES.has(normalized) || normalized.startsWith('IN')) {
    return 'razorpay';
  }
  if (
    PAYPAL_COUNTRIES.has(normalized) ||
    normalized.startsWith('US') ||
    normalized.startsWith('UK') ||
    normalized.startsWith('EU') ||
    normalized.startsWith('GB')
  ) {
    return 'paypal';
  }
  // Default: Razorpay for MVP (India-first)
  return 'razorpay';
}
