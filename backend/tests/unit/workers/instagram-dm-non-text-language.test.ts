/**
 * lang-10: non-text ack uses sticky stored language (no message signal).
 */

import { resolveTurnLanguage } from '../../../src/utils/conversation-language';
import { buildNonTextAckMessage } from '../../../src/utils/dm-copy';

describe('instagram non-text ack language (lang-10)', () => {
  it('preserves hi-Latn when inbound text is empty', () => {
    const { language, changed } = resolveTurnLanguage('hi-Latn', '');
    expect(language).toBe('hi-Latn');
    expect(changed).toBe(false);
    // lang-25: hi-Latn → hi static arm (Roman Hindi proof translation).
    expect(buildNonTextAckMessage({ language })).toMatch(/images|voice notes/i);
    expect(buildNonTextAckMessage({ language })).not.toBe(
      buildNonTextAckMessage({ language: 'en' })
    );
  });

  it('defaults to en when no conversation language is stored yet', () => {
    const { language } = resolveTurnLanguage(null, '');
    expect(language).toBe('en');
    expect(buildNonTextAckMessage({ language })).toContain('voice notes');
  });
});
