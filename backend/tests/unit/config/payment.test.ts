/**
 * Payment Config Unit Tests (e-task-4, 9.2)
 *
 * Tests selectGatewayByCountry routing: India → Razorpay; US/UK/EU → PayPal.
 * Uses fake placeholders per TESTING.md.
 */

import { describe, it, expect, jest } from '@jest/globals';
import { selectGatewayByCountry } from '../../../src/config/payment';

// Mock env for DEFAULT_DOCTOR_COUNTRY when doctorCountry is empty
jest.mock('../../../src/config/env', () => ({
  env: {
    DEFAULT_DOCTOR_COUNTRY: 'IN',
  },
}));

describe('Payment Config (e-task-4)', () => {
  describe('selectGatewayByCountry - 9.2 Routing', () => {
    it('returns razorpay for India doctor (IN)', () => {
      expect(selectGatewayByCountry('IN')).toBe('razorpay');
    });

    it('returns razorpay for India doctor (INDIA)', () => {
      expect(selectGatewayByCountry('INDIA')).toBe('razorpay');
    });

    it('returns razorpay for lowercase india', () => {
      expect(selectGatewayByCountry('india')).toBe('razorpay');
    });

    it('returns paypal for US doctor', () => {
      expect(selectGatewayByCountry('US')).toBe('paypal');
    });

    it('returns paypal for USA doctor', () => {
      expect(selectGatewayByCountry('USA')).toBe('paypal');
    });

    it('returns paypal for UK doctor', () => {
      expect(selectGatewayByCountry('UK')).toBe('paypal');
    });

    it('returns paypal for GB doctor', () => {
      expect(selectGatewayByCountry('GB')).toBe('paypal');
    });

    it('returns paypal for EU doctor', () => {
      expect(selectGatewayByCountry('EU')).toBe('paypal');
    });

    it('returns paypal for GBR doctor', () => {
      expect(selectGatewayByCountry('GBR')).toBe('paypal');
    });

    it('returns razorpay for empty doctorCountry (uses DEFAULT_DOCTOR_COUNTRY)', () => {
      expect(selectGatewayByCountry('')).toBe('razorpay');
    });

    it('returns razorpay for unknown country (India-first fallback)', () => {
      expect(selectGatewayByCountry('XX')).toBe('razorpay');
    });
  });
});
