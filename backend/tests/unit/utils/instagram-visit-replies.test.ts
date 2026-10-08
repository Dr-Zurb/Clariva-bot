import { describe, expect, it } from '@jest/globals';
import {
  classifyInstagramVisitTurn,
  instagramStopAck,
  renderInstagramContinueReply,
  renderInstagramVisitReply,
} from '../../../src/utils/instagram-visit-replies';

const URL = 'https://example.com/d/city-clinic';

const MENU = [
  'Please choose from the following:',
  '1. New visit / revisit / follow-up',
  '2. Change or cancel a visit',
  '3. Check availability',
].join('\n');

function rendered(kind: Parameters<typeof renderInstagramVisitReply>[0]['kind']): string {
  return renderInstagramVisitReply({
    kind,
    language: 'en',
    url: URL,
    address: '12 Market Road',
    feeAmount: '₹500',
  });
}

describe('instagram continue reply', () => {
  it('names the connected page and adds STOP only when asked', () => {
    expect(
      renderInstagramContinueReply({
        pageName: 'Halo Aid Test',
        url: URL,
        includeStopHint: true,
      })
    ).toBe(
      [
        'Hello.',
        "Please continue on Halo Aid Test's page:",
        URL,
        'Reply STOP to stop these automated replies.',
      ].join('\n')
    );
    expect(renderInstagramContinueReply({ url: URL })).toBe(
      ['Hello.', 'Please continue on this page:', URL].join('\n')
    );
    expect(renderInstagramContinueReply({ pageName: '12345', url: URL })).toContain(
      'Please continue on this page:'
    );
  });
});

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
    expect(rendered('visits')).toBe(`New visit / revisit / follow-up: ${URL}`);
    expect(rendered('menu')).toBe(MENU);
    expect(rendered('menu')).not.toContain('Halo Aid');
  });

  it('greets only the first menu, then repeats the list without Hi', () => {
    expect(
      renderInstagramVisitReply({
        kind: 'menu',
        language: 'en',
        greet: true,
        includeStopHint: true,
      })
    ).toBe(
      [
        'Hi, please choose from the following:',
        '1. New visit / revisit / follow-up',
        '2. Change or cancel a visit',
        '3. Check availability',
        'Reply STOP to stop these automated replies.',
      ].join('\n')
    );
    expect(rendered('menu')).not.toMatch(/^Hi/);
    for (const kind of ['menu', 'health', 'non_text', 'address_hidden', 'online'] as const) {
      expect(rendered(kind)).not.toContain(URL);
      expect(rendered(kind)).not.toMatch(/^Hi/);
    }
  });

  it('routes each menu number and word to its link', () => {
    const route = (text: string) =>
      classifyInstagramVisitTurn({
        text,
        hasSingleFee: false,
        hasSharedAddress: false,
        onlineOnly: false,
      });
    expect(route('1')).toBe('visits');
    expect(route('2')).toBe('change');
    expect(route('3.')).toBe('times');
    expect(route('new visit')).toBe('visits');
    expect(route('revisit')).toBe('visits');
    expect(route('follow up')).toBe('visits');
    expect(route('follow-up')).toBe('visits');
    expect(route('change a visit')).toBe('change');
    expect(route('cancel a visit')).toBe('cancel');
    expect(route('availability')).toBe('times');
    expect(rendered('change')).toBe(`Change or cancel a visit: ${URL}`);
    expect(rendered('cancel')).toBe(`Change or cancel a visit: ${URL}`);
    expect(rendered('times')).toBe(`Availability: ${URL}`);
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
      'Messages are off. Reply START to turn them back on.'
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
      expect(text).not.toMatch(/\b(appointment|booking|slot|token|queue|Halo Aid|automated|consultation)\b/i);
    }
  });
});
