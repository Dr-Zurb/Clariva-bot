/**
 * lang-10: stage intake builders receive ctx.turnLanguage (not a hardcoded en).
 */

import { buildIntakeRequestMessage } from '../../../../../src/utils/dm-copy';
import type { ConversationLanguage } from '../../../../../src/utils/conversation-language';

describe('intake language plumbing (lang-10)', () => {
  const languages: ConversationLanguage[] = ['en', 'hi-Latn', 'pa', 'other'];

  it('buildIntakeRequestMessage accepts every turn language from stage context', () => {
    for (const language of languages) {
      const out = buildIntakeRequestMessage({
        language,
        variant: 'initial',
        practiceName: "Dr Zurb's Clinic",
        missing: ['name', 'age', 'phone', 'reason_for_visit'],
      });
      expect(out).toContain("**Dr Zurb's Clinic**");
      expect(out).toMatch(/- \*\*/);
    }
  });

  it('Hinglish turn language still keeps practice name and bullet structure (funnel smoke)', () => {
    const out = buildIntakeRequestMessage({
      language: 'hi-Latn',
      variant: 'still-need',
      missing: ['age', 'reason_for_visit'],
      includeEmail: false,
    });
    expect(out.split('\n').filter((l) => l.startsWith('- **'))).toHaveLength(2);
    expect(out).toContain('You can paste them in one message.');
  });
});
