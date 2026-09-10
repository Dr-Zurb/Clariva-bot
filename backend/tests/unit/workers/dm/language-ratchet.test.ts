/**
 * lang-17: LANG4-D4 invariant — nothing moves a thread from non-en toward en.
 */

import { describe, expect, it } from '@jest/globals';
import {
  applyClassifierLanguageRatchet,
  detectLanguageSignal,
  resolveTurnLanguage,
  type ConversationLanguage,
  type LanguageResolution,
} from '../../../../src/utils/conversation-language';

const LANGUAGES: ConversationLanguage[] = [
  'en',
  'hi',
  'hi-Latn',
  'pa',
  'pa-Latn',
  'other',
];

const CLASSIFIER_LABELS: Array<ConversationLanguage | 'unknown'> = [
  ...LANGUAGES,
  'unknown',
];

describe('language ratchet invariant (lang-17)', () => {
  it('no resolver×classifier combination moves non-en → en', () => {
    const violations: string[] = [];

    for (const stored of [null, ...LANGUAGES] as Array<ConversationLanguage | null>) {
      for (const text of [
        'hey hallo',
        'mujhe dard hai',
        'menu tin din to',
        'behosh',
        'ok thanks',
        '',
      ]) {
        const resolution = resolveTurnLanguage(stored, text);
        const markerConfidence = detectLanguageSignal(text).confidence;
        for (const classifier of CLASSIFIER_LABELS) {
          const after = applyClassifierLanguageRatchet(
            resolution,
            stored,
            classifier,
            { markerConfidence, messageText: text }
          );
          if (resolution.language !== 'en' && after.language === 'en') {
            violations.push(
              `stored=${stored} text=${JSON.stringify(text)} classifier=${classifier} ` +
                `before=${resolution.language}/${resolution.reason} after=${after.language}`
            );
          }
          // Also: never invent a snap-back when stored was non-en.
          if (
            stored != null &&
            stored !== 'en' &&
            after.language === 'en' &&
            after.changed
          ) {
            violations.push(
              `snap-back stored=${stored} classifier=${classifier} after=${after.language}`
            );
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('classifier cannot override a strong marker detection', () => {
    const base: LanguageResolution = {
      language: 'hi-Latn',
      changed: true,
      reason: 'markers',
    };
    expect(applyClassifierLanguageRatchet(base, null, 'en')).toEqual(base);
    expect(applyClassifierLanguageRatchet(base, null, 'pa-Latn')).toEqual(base);
  });
});
