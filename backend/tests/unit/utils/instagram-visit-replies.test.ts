import { describe, expect, it } from '@jest/globals';
import {
  classifyInstagramVisitTurn,
  instagramStopAck,
  renderInstagramVisitReply,
} from '../../../src/utils/instagram-visit-replies';

const URL = 'https://example.com/d/city-clinic';

function rendered(kind: Parameters<typeof renderInstagramVisitReply>[0]['kind']): string {
  return renderInstagramVisitReply({
    kind,
    language: 'en',
    accountName: 'City Clinic',
    url: URL,
    address: '12 Market Road',
    feeAmount: '₹500',
  });
}

describe('instagram visit replies', () => {
  it('uses visit for a book, token, or appointment ask', () => {
    for (const text of ['book', 'token', 'appointment', 'queue']) {
      expect(
        classifyInstagramVisitTurn({
          text,
          hasSingleFee: true,
          hasSharedAddress: false,
          onlineOnly: false,
        })
      ).toBe('visits');
    }
    expect(rendered('visits')).toBe(`Visits: ${URL}`);
    expect(rendered('menu')).toContain('Automated reply from City Clinic.');
    expect(rendered('menu')).not.toContain('Halo Aid');
  });

  it('drops the name when the profile name is missing', () => {
    expect(
      renderInstagramVisitReply({ kind: 'menu', language: 'en', url: URL })
    ).toContain('Automated reply.\nVisits:');
  });

  it('answers a single fee in chat and several fees with a link', () => {
    expect(
      classifyInstagramVisitTurn({
        text: 'fee?',
        hasSingleFee: true,
        hasSharedAddress: false,
        onlineOnly: false,
      })
    ).toBe('fee');
    expect(
      classifyInstagramVisitTurn({
        text: 'fee?',
        hasSingleFee: false,
        hasSharedAddress: false,
        onlineOnly: false,
      })
    ).toBe('fees');
    expect(rendered('fee')).toBe('Visit fee: ₹500.');
    expect(rendered('fees')).toBe(`Fees: ${URL}`);
  });

  it('sends times to the link and health asks to the scope line', () => {
    expect(
      classifyInstagramVisitTurn({
        text: 'what time is 5pm free',
        hasSingleFee: false,
        hasSharedAddress: false,
        onlineOnly: false,
      })
    ).toBe('times');
    expect(
      classifyInstagramVisitTurn({
        text: 'I have fever how much',
        hasSingleFee: true,
        hasSharedAddress: false,
        onlineOnly: false,
        signalsFeePricing: true,
      })
    ).toBe('health');
    expect(rendered('health')).toContain('Health questions are not answered');
    expect(rendered('health')).not.toContain(URL);
  });

  it('stays silent for thanks and keeps stop flat', () => {
    expect(
      classifyInstagramVisitTurn({
        text: 'thanks',
        hasSingleFee: false,
        hasSharedAddress: false,
        onlineOnly: false,
      })
    ).toBe('silent');
    expect(instagramStopAck('en')).toBe(
      'Automated replies are off. Send START to turn them on.'
    );
  });

  it('does not use a person, a question, or a mode word outside the link', () => {
    const kinds = [
      'menu',
      'health',
      'visits',
      'change',
      'cancel',
      'view',
      'times',
      'fee',
      'fees',
      'payment',
      'address',
      'address_hidden',
      'online',
      'non_text',
    ] as const;
    for (const kind of kinds) {
      const text = rendered(kind).replace(/https?:\/\/\S+/g, '');
      expect(text).not.toMatch(/\bI\b/);
      expect(text).not.toContain('?');
      expect(text).not.toMatch(/\b(appointment|booking|slot|token|queue|Halo Aid)\b/i);
    }
  });
});
