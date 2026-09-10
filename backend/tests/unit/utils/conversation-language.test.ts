import { describe, expect, it } from '@jest/globals';
import {
  applyClassifierLanguageRatchet,
  coerceClassifierLanguage,
  detectLanguageSignal,
  HI_LATN_WORDS,
  LANGUAGE_ACCUMULATION_WINDOW,
  languageUsesDevanagari,
  messageHasConfidentEnglishEvidence,
  languageUsesGurmukhi,
  PA_LATN_EXCLUSIVE_WORDS,
  resolveTurnLanguage,
  toStaticLocale,
  type ConversationLanguage,
  type LanguageResolution,
} from '../../../src/utils/conversation-language';

type ResolveCase = {
  name: string;
  stored: ConversationLanguage | null;
  text: string;
  expected: LanguageResolution;
  prior?: readonly string[];
};

const RESOLVE_CASES: ResolveCase[] = [
  // 4.1 — reported bug: ambiguous English greeting must not become Hinglish
  // LANG4-D1: render en, do not persist (changed=false) — thread stays undecided
  {
    name: 'hey hallo, stored=null → en render, undecided (changed=false)',
    stored: null,
    text: 'hey hallo',
    expected: { language: 'en', changed: false, reason: 'default' },
  },
  // 4.2 — single Roman marker is weak; never flips established English
  {
    name: 'kitna is the fee?, stored=en → stays en (one marker)',
    stored: 'en',
    text: 'kitna is the fee?',
    expected: { language: 'en', changed: false, reason: 'stored' },
  },
  // 4.3 — ≥2 distinct Hinglish markers → switch
  {
    name: 'mujhe kal appointment chahiye, stored=en → hi-Latn',
    stored: 'en',
    text: 'mujhe kal appointment chahiye',
    expected: { language: 'hi-Latn', changed: true, reason: 'markers' },
  },
  // 4.4 — Devanagari is strong on one message
  {
    name: 'Devanagari, stored=en → hi',
    stored: 'en',
    text: 'मुझे बुखार है',
    expected: { language: 'hi', changed: true, reason: 'script' },
  },
  // 4.5 — LANG-D2: no snap-back to English
  {
    name: 'plain English on hi-Latn thread → stays hi-Latn',
    stored: 'hi-Latn',
    text: 'ok sounds good, what time works?',
    expected: { language: 'hi-Latn', changed: false, reason: 'stored' },
  },
  // 4.6 — Gurmukhi / Roman Punjabi
  {
    name: 'Gurmukhi, stored=en → pa',
    stored: 'en',
    text: 'ਮੇਨੂੰ ਬੁਖ਼ਾਰ ਹੈ',
    expected: { language: 'pa', changed: true, reason: 'script' },
  },
  {
    name: 'Roman Punjabi menu tin din to, stored=null → pa-Latn',
    stored: null,
    text: 'menu tin din to',
    expected: { language: 'pa-Latn', changed: true, reason: 'markers' },
  },
  // 4.7 — LANG-D7 other scripts
  {
    name: 'Tamil script, stored=null → other',
    stored: null,
    text: 'எனக்கு காய்ச்சல்',
    expected: { language: 'other', changed: true, reason: 'script' },
  },
  {
    name: 'Bengali script, stored=en → other',
    stored: 'en',
    text: 'আমার জ্বর হয়েছে',
    expected: { language: 'other', changed: true, reason: 'script' },
  },
  // 4.8 — false positives (safety-messages guards)
  {
    name: 'English doc (doctor) is not Hindi — render en, stay undecided',
    stored: null,
    text:
      'hello how are you doc , so i checked my blood sugar today on empty stomach , its high , 199 , how do i manage , please guide me',
    expected: { language: 'en', changed: false, reason: 'default' },
  },
  {
    name: 'typography sans alone is not Hindi',
    stored: 'en',
    text: 'what font, sans or serif',
    expected: { language: 'en', changed: false, reason: 'stored' },
  },
  // 4.9 — same marker repeated still weak
  {
    name: 'kitna kitna, stored=en → stays en (one distinct marker)',
    stored: 'en',
    text: 'kitna kitna',
    expected: { language: 'en', changed: false, reason: 'stored' },
  },
  // empty / whitespace
  {
    name: 'empty text, stored=hi-Latn → keep stored',
    stored: 'hi-Latn',
    text: '   ',
    expected: { language: 'hi-Latn', changed: false, reason: 'stored' },
  },
  // LANG4-D1: empty on undecided → render en, do not persist
  {
    name: 'empty text, stored=null → en render, undecided (changed=false)',
    stored: null,
    text: '',
    expected: { language: 'en', changed: false, reason: 'default' },
  },
  // first-turn strong Hinglish
  {
    name: 'strong Hinglish on fresh thread → hi-Latn',
    stored: null,
    text: 'mujhe kal appointment chahiye',
    expected: { language: 'hi-Latn', changed: true, reason: 'markers' },
  },
  // LANG4-D1: weak first-turn renders English but thread stays undecided
  {
    name: 'single marker on fresh thread → en render, undecided (not hi-Latn)',
    stored: null,
    text: 'kitna?',
    expected: { language: 'en', changed: false, reason: 'default' },
  },
  // lang-15 — live reproduction: sparse Hinglish with shared Punjabi token
  {
    name: 'papa behosh padhe hain floor pe, stored=null → hi-Latn (live miss)',
    stored: null,
    text: 'papa behosh padhe hain floor pe',
    expected: { language: 'hi-Latn', changed: true, reason: 'markers' },
  },
  {
    name: 'papa behosh ho gaye hain mujhe dard hai → hi-Latn not pa-Latn',
    stored: null,
    text: 'papa behosh ho gaye hain, mujhe bahut dard hai',
    expected: { language: 'hi-Latn', changed: true, reason: 'markers' },
  },
  {
    name: 'menu tin din to dard hai → pa-Latn (exclusive wins)',
    stored: null,
    text: 'menu tin din to dard hai',
    expected: { language: 'pa-Latn', changed: true, reason: 'markers' },
  },
  {
    name: 'meri chhati vich dard → pa-Latn (exclusive vich + phrase)',
    stored: null,
    text: 'meri chhati vich dard',
    expected: { language: 'pa-Latn', changed: true, reason: 'markers' },
  },
];

describe('conversation-language (lang-01)', () => {
  describe('toStaticLocale', () => {
    it.each([
      ['en', 'en'],
      ['hi', 'hi'],
      ['hi-Latn', 'hi'],
      ['pa', 'pa'],
      ['pa-Latn', 'pa'],
      ['other', 'en'],
    ])('%s → %s', (language, expected) => {
      expect(toStaticLocale(language as ConversationLanguage)).toBe(expected);
    });
  });

  describe('languageUsesDevanagari', () => {
    it('is true only for native Hindi (hi)', () => {
      expect(languageUsesDevanagari('hi')).toBe(true);
      expect(languageUsesDevanagari('hi-Latn')).toBe(false);
      expect(languageUsesDevanagari('en')).toBe(false);
    });
  });

  describe('languageUsesGurmukhi', () => {
    it('is true only for native Punjabi (pa)', () => {
      expect(languageUsesGurmukhi('pa')).toBe(true);
      expect(languageUsesGurmukhi('pa-Latn')).toBe(false);
      expect(languageUsesGurmukhi('en')).toBe(false);
    });
  });

  describe('resolveTurnLanguage', () => {
    it.each(RESOLVE_CASES)('$name', ({ stored, text, expected, prior }) => {
      expect(resolveTurnLanguage(stored, text, prior)).toEqual(expected);
    });

    it('undefined and empty priorPatientTexts match no-history behaviour', () => {
      for (const { stored, text, expected } of RESOLVE_CASES) {
        expect(resolveTurnLanguage(stored, text)).toEqual(expected);
        expect(resolveTurnLanguage(stored, text, undefined)).toEqual(expected);
        expect(resolveTurnLanguage(stored, text, [])).toEqual(expected);
      }
    });
  });

  describe('lang-16 cross-turn accumulation (LANG4-D3)', () => {
    it(`exports LANGUAGE_ACCUMULATION_WINDOW === 3`, () => {
      expect(LANGUAGE_ACCUMULATION_WINDOW).toBe(3);
    });

    it('three one-marker Hinglish turns on NULL → hi-Latn accumulated on third', () => {
      // Same marker twice still counts once; third brings a new marker → strong.
      expect(resolveTurnLanguage(null, 'kitna?', [])).toEqual({
        language: 'en',
        changed: false,
        reason: 'default',
      });
      expect(resolveTurnLanguage(null, 'kitna?', ['kitna?'])).toEqual({
        language: 'en',
        changed: false,
        reason: 'default',
      });
      expect(resolveTurnLanguage(null, 'mujhe', ['kitna?', 'kitna?'])).toEqual({
        language: 'hi-Latn',
        changed: true,
        reason: 'accumulated',
      });
    });

    it('same three turns on established hi-Latn → inert (reason stored)', () => {
      expect(
        resolveTurnLanguage('hi-Latn', 'mujhe', ['kitna?', 'kitna?'])
      ).toEqual({
        language: 'hi-Latn',
        changed: false,
        reason: 'stored',
      });
    });

    it('history markers + plain English current → no switch (§2.4)', () => {
      expect(
        resolveTurnLanguage(null, 'ok sounds good', ['mujhe', 'chahiye'])
      ).toEqual({
        language: 'en',
        changed: false,
        reason: 'default',
      });
      expect(
        resolveTurnLanguage('en', 'ok sounds good', ['mujhe', 'chahiye'])
      ).toEqual({
        language: 'en',
        changed: false,
        reason: 'stored',
      });
    });

    it('strong current message → reason markers, not accumulated', () => {
      expect(
        resolveTurnLanguage(null, 'mujhe kal appointment chahiye', ['kitna?'])
      ).toEqual({
        language: 'hi-Latn',
        changed: true,
        reason: 'markers',
      });
    });

    it('window: 4 turns back excluded, 3 back included', () => {
      // Oldest has Punjabi-exclusive; if included, union would be pa-Latn.
      // Window keeps last 3 prior + current → Hindi-only → hi-Latn.
      const prior = [
        'menu tin din to', // 4 back — excluded
        'kitna',
        'dard',
        'mujhe',
      ];
      expect(resolveTurnLanguage(null, 'hai', prior)).toEqual({
        language: 'hi-Latn',
        changed: true,
        reason: 'accumulated',
      });

      // 3 back includes exclusive menu → pa-Latn wins contention.
      const priorWithMenuInWindow = [
        'hello',
        'menu tin din to', // 3 back — included
        'kitna',
        'dard',
      ];
      expect(resolveTurnLanguage(null, 'hai', priorWithMenuInWindow)).toEqual({
        language: 'pa-Latn',
        changed: true,
        reason: 'accumulated',
      });
    });

    it('Punjabi-exclusive in earlier turn + weak Hindi current → union pa-Latn', () => {
      // Current alone is weak (one marker); exclusive in prior makes union Punjabi.
      expect(resolveTurnLanguage(null, 'dard', ['menu tin din to'])).toEqual({
        language: 'pa-Latn',
        changed: true,
        reason: 'accumulated',
      });
    });

    it('accumulation also escapes explicitly persisted en', () => {
      expect(resolveTurnLanguage('en', 'mujhe', ['kitna?', 'dard'])).toEqual({
        language: 'hi-Latn',
        changed: true,
        reason: 'accumulated',
      });
    });
  });

  describe('detectLanguageSignal', () => {
    it('returns none/en for hey hallo', () => {
      expect(detectLanguageSignal('hey hallo')).toEqual({
        language: 'en',
        confidence: 'none',
      });
    });

    it('returns weak hi-Latn for a single fee marker', () => {
      expect(detectLanguageSignal('kitna is the fee?')).toEqual({
        language: 'hi-Latn',
        confidence: 'weak',
      });
    });

    it('returns strong hi-Latn for ≥2 markers', () => {
      expect(detectLanguageSignal('mujhe kal appointment chahiye')).toEqual({
        language: 'hi-Latn',
        confidence: 'strong',
      });
    });

    it('returns strong pa-Latn for Roman Punjabi (not hi-Latn)', () => {
      expect(detectLanguageSignal('menu tin din to')).toEqual({
        language: 'pa-Latn',
        confidence: 'strong',
      });
    });

    it('treats sans nahi as Hindi breath distress (phrase)', () => {
      const signal = detectLanguageSignal('sans nahi aa rahi');
      expect(signal.language).toBe('hi-Latn');
      expect(signal.confidence).not.toBe('none');
    });

    it('does not treat bare English sans as Hindi', () => {
      expect(detectLanguageSignal('Use Comic Sans for the poster')).toEqual({
        language: 'en',
        confidence: 'none',
      });
    });

    it('counts repeated kitna as one distinct marker (weak)', () => {
      expect(detectLanguageSignal('kitna kitna')).toEqual({
        language: 'hi-Latn',
        confidence: 'weak',
      });
    });

    it('detects informal yar / goli as strong hi-Latn', () => {
      // yar + goli + batado = 3 distinct
      expect(detectLanguageSignal('yar ek goli batado')).toEqual({
        language: 'hi-Latn',
        confidence: 'strong',
      });
    });
  });

  describe('lang-15 marker contention (LANG4-D2)', () => {
    it('PA_LATN_EXCLUSIVE_WORDS and HI_LATN_WORDS are disjoint', () => {
      const hi = new Set(HI_LATN_WORDS);
      const overlap = PA_LATN_EXCLUSIVE_WORDS.filter((w) => hi.has(w));
      expect(overlap).toEqual([]);
    });

    it('live reproduction: papa behosh padhe hain floor pe → hi-Latn strong', () => {
      expect(detectLanguageSignal('papa behosh padhe hain floor pe')).toEqual({
        language: 'hi-Latn',
        confidence: 'strong',
      });
    });

    it('shared behosh does not suppress Hindi when Hindi scores higher', () => {
      expect(
        detectLanguageSignal('papa behosh ho gaye hain, mujhe bahut dard hai')
      ).toEqual({
        language: 'hi-Latn',
        confidence: 'strong',
      });
    });

    it('exclusive menu still wins despite Hindi tokens', () => {
      expect(detectLanguageSignal('menu tin din to dard hai')).toEqual({
        language: 'pa-Latn',
        confidence: 'strong',
      });
    });

    it('single exclusive token is strong (establishes pa-Latn)', () => {
      // paCount=1 would be weak under count rules; exclusive is decisive.
      expect(detectLanguageSignal('menu mujhe dard hai')).toEqual({
        language: 'pa-Latn',
        confidence: 'strong',
      });
      expect(resolveTurnLanguage(null, 'menu mujhe dard hai')).toEqual({
        language: 'pa-Latn',
        changed: true,
        reason: 'markers',
      });
    });

    it('meri chhati vich dard → pa-Latn (exclusive + phrase)', () => {
      expect(detectLanguageSignal('meri chhati vich dard')).toEqual({
        language: 'pa-Latn',
        confidence: 'strong',
      });
    });

    it('bare shared+Hindi markers: meri tabiyat → hi-Latn strong', () => {
      // meri (shared, in both) + tabiyat (Hindi) → pa=1, hi=2 → Hindi
      expect(detectLanguageSignal('meri tabiyat')).toEqual({
        language: 'hi-Latn',
        confidence: 'strong',
      });
    });

    it('exact tie on shared-only marker → Hindi (LANG4-D2 tiebreak flip)', () => {
      // behosh alone: paShared=1, hiWords={behosh}=1 → tie → hi-Latn weak
      expect(detectLanguageSignal('behosh')).toEqual({
        language: 'hi-Latn',
        confidence: 'weak',
      });
    });

    it('live miss: papa behosh ho gye → hi-Latn strong', () => {
      expect(detectLanguageSignal('papa behosh ho gye')).toEqual({
        language: 'hi-Latn',
        confidence: 'strong',
      });
      expect(resolveTurnLanguage(null, 'papa behosh ho gye')).toEqual({
        language: 'hi-Latn',
        changed: true,
        reason: 'markers',
      });
    });

    it('compressed spellings participate (gye/rha/nhi/hogya)', () => {
      expect(detectLanguageSignal('wo gye hain').confidence).not.toBe('none');
      expect(detectLanguageSignal('dard rha hai').language).toBe('hi-Latn');
      expect(detectLanguageSignal('nhi aa rha').language).toBe('hi-Latn');
      expect(detectLanguageSignal('behosh hogya').language).toBe('hi-Latn');
    });

    it('acute emergency: weak non-English leaves English', () => {
      // Single shared marker is weak; without acuteEmergency → en default.
      expect(resolveTurnLanguage(null, 'behosh')).toEqual({
        language: 'en',
        changed: false,
        reason: 'default',
      });
      expect(
        resolveTurnLanguage(null, 'behosh', [], { acuteEmergency: true })
      ).toEqual({
        language: 'hi-Latn',
        changed: true,
        reason: 'markers',
      });
      // Does not disturb established non-en (LANG-D2).
      expect(
        resolveTurnLanguage('pa-Latn', 'behosh', [], { acuteEmergency: true })
      ).toEqual({
        language: 'pa-Latn',
        changed: false,
        reason: 'stored',
      });
    });

    it('Gurmukhi → pa and Devanagari → hi unaffected', () => {
      expect(detectLanguageSignal('ਮੇਨੂੰ ਬੁਖ਼ਾਰ ਹੈ')).toEqual({
        language: 'pa',
        confidence: 'strong',
      });
      expect(detectLanguageSignal('मुझे बुखार है')).toEqual({
        language: 'hi',
        confidence: 'strong',
      });
    });

    it.each([
      ['padhe', 'wo floor pe padhe hain'],
      ['padha', 'wo padha hua tha'],
      ['gaye', 'wo gaye hain'],
      ['gaya', 'wo gaya hai'],
      ['raha', 'dard raha hai'],
      ['rahe', 'wo rahe hain'],
      ['rahi', 'saans nahi aa rahi'],
      ['gir', 'wo gir gaye'],
      ['gira', 'wo gira hai'],
      ['bachao', 'bachao mujhe'],
      ['jaldi', 'jaldi aao'],
      ['madad', 'madad chahiye'],
      ['uth', 'uth nahi paa raha'],
      ['bula', 'doctor ko bula do'],
    ])('lang-15 §3.1 marker %s participates in detection', (_marker, text) => {
      const signal = detectLanguageSignal(text);
      expect(signal.language).toBe('hi-Latn');
      expect(signal.confidence).not.toBe('none');
    });

    it('false-positive guards: gir/raha/uth/bula do not fire on English', () => {
      expect(detectLanguageSignal('the girder is safe')).toEqual({
        language: 'en',
        confidence: 'none',
      });
      expect(detectLanguageSignal('Abraham Lincoln spoke')).toEqual({
        language: 'en',
        confidence: 'none',
      });
      expect(detectLanguageSignal('truth matters most')).toEqual({
        language: 'en',
        confidence: 'none',
      });
      expect(detectLanguageSignal('the bulb is bright')).toEqual({
        language: 'en',
        confidence: 'none',
      });
      expect(detectLanguageSignal('is the doc available')).toEqual({
        language: 'en',
        confidence: 'none',
      });
      expect(detectLanguageSignal('what font, sans or serif')).toEqual({
        language: 'en',
        confidence: 'none',
      });
      // Compressed-spelling false positives
      expect(detectLanguageSignal('the gyroscope failed')).toEqual({
        language: 'en',
        confidence: 'none',
      });
      expect(detectLanguageSignal('rhapsody in blue')).toEqual({
        language: 'en',
        confidence: 'none',
      });
    });
  });

  describe('lang-17 classifier ratchet (LANG4-D4)', () => {
    it('coerceClassifierLanguage treats garbage as unknown', () => {
      expect(coerceClassifierLanguage('hi-Latn')).toBe('hi-Latn');
      expect(coerceClassifierLanguage('unknown')).toBe('unknown');
      expect(coerceClassifierLanguage(null)).toBe('unknown');
      expect(coerceClassifierLanguage('french')).toBe('unknown');
      expect(coerceClassifierLanguage(12)).toBe('unknown');
    });

    it('undecided + marker none + no English evidence + classifier hi-Latn → adopt (fill-in)', () => {
      const text = 'hey hallo';
      const base = resolveTurnLanguage(null, text);
      expect(base.language).toBe('en');
      expect(detectLanguageSignal(text).confidence).toBe('none');
      expect(messageHasConfidentEnglishEvidence(text)).toBe(false);
      expect(
        applyClassifierLanguageRatchet(base, null, 'hi-Latn', {
          markerConfidence: 'none',
          messageText: text,
        })
      ).toEqual({
        language: 'hi-Latn',
        changed: true,
        reason: 'classifier',
      });
    });

    it('undecided + marker none + English evidence vetoes classifier adopt (LANG4-D4 amend)', () => {
      const text = 'mild chest discomfort after gym';
      const base = resolveTurnLanguage(null, text);
      expect(base.language).toBe('en');
      expect(detectLanguageSignal(text).confidence).toBe('none');
      expect(messageHasConfidentEnglishEvidence(text)).toBe(true);
      expect(
        applyClassifierLanguageRatchet(base, null, 'hi-Latn', {
          markerConfidence: 'none',
          messageText: text,
        })
      ).toEqual(base);
    });

    it('live repro: severe asthma no inhaler left stays English (was Devanagari)', () => {
      const text = 'severe asthma no inhaler left';
      const base = resolveTurnLanguage(null, text);
      expect(base.language).toBe('en');
      expect(detectLanguageSignal(text).confidence).toBe('none');
      expect(messageHasConfidentEnglishEvidence(text)).toBe(true);
      expect(
        applyClassifierLanguageRatchet(base, null, 'hi', {
          markerConfidence: 'none',
          messageText: text,
        })
      ).toEqual(base);
    });

    it('native-script guard: Latin text never adopts sticky hi / pa', () => {
      const text = 'zzz qqq';
      const base = resolveTurnLanguage(null, text);
      expect(base.language).toBe('en');
      expect(messageHasConfidentEnglishEvidence(text)).toBe(false);
      expect(
        applyClassifierLanguageRatchet(base, null, 'hi', {
          markerConfidence: 'none',
          messageText: text,
        }).language
      ).toBe('hi-Latn');
      expect(
        applyClassifierLanguageRatchet(base, null, 'pa', {
          markerConfidence: 'none',
          messageText: text,
        }).language
      ).toBe('pa-Latn');
    });

    it('native script in text still adopts native hi', () => {
      const text = 'मुझे कुछ पूछना है';
      const base = resolveTurnLanguage(null, text);
      // Devanagari resolves deterministically; classifier is not needed.
      expect(base.language).toBe('hi');
    });

    it('historical English booking phrasing is not sticky-trapped as hi-Latn', () => {
      const text = 'chest pain last year but fine now, want appointment';
      // chest pain is an acute marker path elsewhere; ratchet veto still holds on EN evidence.
      expect(messageHasConfidentEnglishEvidence(text)).toBe(true);
      const base = resolveTurnLanguage(null, text);
      expect(
        applyClassifierLanguageRatchet(base, null, 'hi-Latn', {
          markerConfidence: 'none',
          messageText: text,
        })
      ).toEqual(base);
    });

    it('weak marker hold is not overturned by classifier (LANG-D3)', () => {
      const text = 'kitna is the fee?';
      const base = resolveTurnLanguage(null, text);
      expect(base.language).toBe('en');
      expect(detectLanguageSignal(text).confidence).toBe('weak');
      expect(
        applyClassifierLanguageRatchet(base, null, 'hi-Latn', {
          markerConfidence: 'weak',
          messageText: text,
        })
      ).toEqual(base);
    });

    it('classifier other is inert (LANG-D7 — would sticky-trap with English render)', () => {
      const base = resolveTurnLanguage(null, 'hey hallo');
      expect(
        applyClassifierLanguageRatchet(base, null, 'other', {
          markerConfidence: 'none',
        })
      ).toEqual(base);
    });

    it('classifier en is inert even on undecided', () => {
      const base = resolveTurnLanguage(null, 'hey hallo');
      expect(applyClassifierLanguageRatchet(base, null, 'en')).toEqual(base);
      expect(applyClassifierLanguageRatchet(base, null, 'unknown')).toEqual(base);
    });

    it('markers win over classifier en', () => {
      const base = resolveTurnLanguage(null, 'mujhe kal appointment chahiye');
      expect(base.language).toBe('hi-Latn');
      expect(applyClassifierLanguageRatchet(base, null, 'en')).toEqual(base);
    });

    it('established language is never moved by classifier', () => {
      const hi = resolveTurnLanguage('hi-Latn', 'ok thanks');
      expect(applyClassifierLanguageRatchet(hi, 'hi-Latn', 'en')).toEqual(hi);
      const en = resolveTurnLanguage('en', 'kitna?');
      expect(applyClassifierLanguageRatchet(en, 'en', 'hi-Latn')).toEqual(en);
    });
  });
});
