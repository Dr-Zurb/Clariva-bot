import { describe, it, expect } from '@jest/globals';
import { extractRazorpayWebhookHints } from '../../../../src/services/billing/razorpay-webhook-hints';

describe('extractRazorpayWebhookHints', () => {
  it('reads appointment_id from payment notes', () => {
    const body = Buffer.from(
      JSON.stringify({
        payload: {
          payment: {
            entity: {
              id: 'pay_1',
              order_id: 'order_1',
              notes: { appointment_id: 'apt-uuid' },
            },
          },
        },
      })
    );
    const hints = extractRazorpayWebhookHints(body);
    expect(hints.appointmentId).toBe('apt-uuid');
    expect(hints.gatewayOrderIds).toEqual(expect.arrayContaining(['order_1', 'pay_1']));
  });

  it('returns empty hints for invalid JSON', () => {
    expect(extractRazorpayWebhookHints(Buffer.from('not-json'))).toEqual({
      appointmentId: null,
      gatewayOrderIds: [],
    });
  });
});
