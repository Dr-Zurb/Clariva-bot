/**
 * Single language decision for receptionist DMs (bot-language-policy · lang-01).
 *
 * Pure and synchronous — no DB, no LLM. Callers resolve once per turn and
 * persist; emitters read the result (p2) instead of re-detecting.
 *
 * LANG-D2 (no automatic snap-back): there is no "strong English" signal.
 * A non-English conversation never returns to English on its own. Patients
 * routinely drop English sentences mid-Hinglish thread; snapping back is the
 * flip-flop this module exists to stop.
 *
 * LANG4-D1 (undecided ≠ English): `en` from the LANG-D1 default path is a
 * *rendering* default, not an established language. `changed` stays false so
 * callers do not persist it — `conversations.language` NULL remains load-bearing
 * ("undecided → English") until a strong signal is observed.
 */

export type ConversationLanguage =
  | 'en'
  | 'hi'
  | 'hi-Latn'
  | 'pa'
  | 'pa-Latn'
  | 'other';

/** 3-code table key used by static DM copy tables (lang-06 · LANG2-D2). */
export type StaticMessageLocale = 'en' | 'hi' | 'pa';

/**
 * Collapse the 6-code turn language onto the 3-code static tables.
 * `other` renders English (LANG-D7). Latin variants share the same table key as
 * their script siblings; Roman vs native copy is selected separately.
 */
export function toStaticLocale(language: ConversationLanguage): StaticMessageLocale {
  switch (language) {
    case 'en':
    case 'other':
      return 'en';
    case 'hi':
    case 'hi-Latn':
      return 'hi';
    case 'pa':
    case 'pa-Latn':
      return 'pa';
    default: {
      const _exhaustive: never = language;
      void _exhaustive;
      return 'en';
    }
  }
}

/** True when native Devanagari copy should be used (`hi`, not `hi-Latn`). */
export function languageUsesDevanagari(language: ConversationLanguage): boolean {
  return language === 'hi';
}

/** True when native Gurmukhi copy should be used (`pa`, not `pa-Latn`). */
export function languageUsesGurmukhi(language: ConversationLanguage): boolean {
  return language === 'pa';
}

export type LanguageSignal = {
  language: ConversationLanguage;
  confidence: 'strong' | 'weak' | 'none';
};

export type LanguageResolution = {
  language: ConversationLanguage;
  changed: boolean;
  reason: 'stored' | 'default' | 'script' | 'markers' | 'accumulated' | 'classifier';
};

/** Options for {@link resolveTurnLanguage}. */
export type ResolveTurnLanguageOptions = {
  /**
   * When true (acute emergency regex hit), a weak non-English signal is enough
   * to leave English / undecided. Booking threshold (≥2 markers) stays for
   * non-emergency turns — the cost matrix in a crisis is asymmetric.
   */
  acuteEmergency?: boolean;
};

/**
 * Max prior patient turns unioned with the current message for LANG4-D3
 * accumulation (lang-16). Oldest-first arrays are sliced from the end.
 */
export const LANGUAGE_ACCUMULATION_WINDOW = 3;

/**
 * Punjabi-exclusive Latin markers (lang-15 · LANG4-D2).
 * Presence of any exclusive token → Punjabi wins regardless of Hindi count.
 * Exported for the exclusive∩Hindi disjointness test.
 */
export const PA_LATN_EXCLUSIVE_WORDS: readonly string[] = [
  'menu',
  'naal',
  'vich',
  'chhati',
  'chhaati',
  'punjabi',
];

/**
 * Shared Latin markers used in both Punjabi and Hindi (lang-15).
 * Count once for each language — that is the point of the contention rewrite.
 * Safe default when a speaker cannot confirm exclusivity.
 */
export const PA_LATN_SHARED_WORDS: readonly string[] = [
  'meri',
  'mera',
  'behosh',
  'behoshi',
];

/**
 * Latin Hindi / Hinglish word markers — union of safety-messages.ts and the
 * Hindi-specific tokens from the retired localize-reply detector. English-only
 * tokens from that AND-heuristic (`appointment`, `doctor`, `book`) are
 * intentionally omitted: counting them as Hindi markers would flip English
 * booking messages to hi-Latn under the ≥2-marker rule.
 *
 * `meri`/`mera` also live in PA_LATN_SHARED_WORDS — a shared marker counts
 * once for each language under LANG4-D2.
 *
 * lang-15 §3.1 additions (high-frequency Hinglish from live misses): padhe,
 * padha, gaye, gaya, raha, rahe, rahi, gir, gira, bachao, jaldi, madad, uth, bula.
 * `behoshi` already covered via PA_LATN_SHARED_WORDS counting into Hindi too.
 *
 * Compressed spellings patients actually type (2026-08-02 live miss
 * `papa behosh ho gye`): gye, gya, gyi, rha, rhe, rhi, nhi, hogya, hogye,
 * kch, bhut, bhot. Each is \b-bounded; false-positive tests cover English
 * collisions (truth/girder/bulb already covered for uth/gir/bula).
 */
export const HI_LATN_WORDS: readonly string[] = [
  // safety-messages.ts body / symptoms
  'mujhe',
  'mere',
  'mera',
  'meri',
  'kya',
  'hai',
  'hain',
  'nahi',
  'nahin',
  'dard',
  'bukhar',
  'bukhhaar',
  'khansi',
  'khans',
  'jukam',
  'jukaam',
  'saans',
  'chakkar',
  'ulti',
  'tabiyat',
  'beech',
  // safety-messages.ts informal / fee
  'kitni',
  'kitna',
  'kitne',
  'acha',
  'accha',
  'bolo',
  'bhai',
  'yaar',
  'yar',
  'toh',
  'theek',
  'thik',
  'rupaye',
  'rupiya',
  'paise',
  'paisa',
  'zada',
  'zyada',
  'goli',
  'batado',
  'batao',
  'bohut',
  // former localize-reply Hindi-specific (not English loanwords)
  'kaise',
  'chahiye',
  'ka',
  'ki',
  'ke',
  'se',
  'mein',
  'ko',
  // Shared with PA_LATN_SHARED_WORDS — counts once per language (LANG4-D2)
  'behosh',
  'behoshi',
  // lang-15 §3.1 — high-frequency Hinglish (live reproduction gaps)
  'padhe',
  'padha',
  'gaye',
  'gaya',
  'raha',
  'rahe',
  'rahi',
  'gir',
  'gira',
  'bachao',
  'jaldi',
  'madad',
  'uth',
  'bula',
  // Compressed / informal spellings (patients drop vowels)
  'gye',
  'gya',
  'gyi',
  'rha',
  'rhe',
  'rhi',
  'nhi',
  'hogya',
  'hogye',
  'kch',
  'bhut',
  'bhot',
];

/** Multi-token Punjabi phrases — each match counts as one distinct marker. */
const PA_LATN_PHRASES: ReadonlyArray<{ id: string; re: RegExp }> = [
  { id: 'pa:menu+num', re: /\bmenu\s+(tin|ten|ik|do)\b/i },
  { id: 'pa:meri+chhati', re: /\bmeri\s+chhati\b/i },
  { id: 'pa:saas+nahi', re: /\bsaas\s+nahi\b/i },
  { id: 'pa:sass+nahi', re: /\bsass\s+nahi\b/i },
];

/**
 * Multi-token Hindi phrases. Bare English `sans` is NOT a word marker —
 * only `sans nahi` / `saans nahi` / `saas nahi` (breath distress).
 */
const HI_LATN_PHRASES: ReadonlyArray<{ id: string; re: RegExp }> = [
  { id: 'hi:breath+nahi', re: /\b(saas|saans|sans)\s+nahi\b/i },
  { id: 'hi:pet+dard', re: /\bpet\s+dard\b/i },
  { id: 'hi:sir+dard', re: /\bsir\s+dard\b/i },
  { id: 'hi:kitni+din', re: /\bkitni\s+din\b/i },
];

function collectWordMarkers(lower: string, words: readonly string[]): Set<string> {
  const found = new Set<string>();
  for (const w of words) {
    // Word-boundary match; short particles (ka/ki/ke/se/ko) still need \b.
    const re = new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (re.test(lower)) found.add(w);
  }
  return found;
}

function collectPhraseMarkers(
  text: string,
  phrases: ReadonlyArray<{ id: string; re: RegExp }>
): Set<string> {
  const found = new Set<string>();
  for (const p of phrases) {
    if (p.re.test(text)) found.add(p.id);
  }
  return found;
}

function confidenceFromCount(n: number): 'strong' | 'weak' | 'none' {
  if (n >= 2) return 'strong';
  if (n === 1) return 'weak';
  return 'none';
}

type LatinMarkerBags = {
  paExclusive: Set<string>;
  paShared: Set<string>;
  paPhrases: Set<string>;
  hiWords: Set<string>;
  hiPhrases: Set<string>;
};

function emptyLatinMarkerBags(): LatinMarkerBags {
  return {
    paExclusive: new Set(),
    paShared: new Set(),
    paPhrases: new Set(),
    hiWords: new Set(),
    hiPhrases: new Set(),
  };
}

function collectLatinMarkerBags(lower: string): LatinMarkerBags {
  return {
    paExclusive: collectWordMarkers(lower, PA_LATN_EXCLUSIVE_WORDS),
    paShared: collectWordMarkers(lower, PA_LATN_SHARED_WORDS),
    paPhrases: collectPhraseMarkers(lower, PA_LATN_PHRASES),
    hiWords: collectWordMarkers(lower, HI_LATN_WORDS),
    hiPhrases: collectPhraseMarkers(lower, HI_LATN_PHRASES),
  };
}

function mergeLatinMarkerBags(into: LatinMarkerBags, add: LatinMarkerBags): void {
  for (const v of add.paExclusive) into.paExclusive.add(v);
  for (const v of add.paShared) into.paShared.add(v);
  for (const v of add.paPhrases) into.paPhrases.add(v);
  for (const v of add.hiWords) into.hiWords.add(v);
  for (const v of add.hiPhrases) into.hiPhrases.add(v);
}

/** LANG4-D2 contention over pre-collected marker bags. */
function signalFromLatinMarkerBags(bags: LatinMarkerBags): LanguageSignal {
  const paCount = bags.paExclusive.size + bags.paShared.size + bags.paPhrases.size;
  // Shared tokens already in HI_LATN_WORDS — do not double-count via paShared.
  const hiCount = bags.hiWords.size + bags.hiPhrases.size;

  if (paCount === 0 && hiCount === 0) {
    return { language: 'en', confidence: 'none' };
  }

  // 1. Any Punjabi-exclusive token (or exclusive phrase) → Punjabi.
  // Exclusive evidence is decisive for *language*; treat as strong even when
  // the Punjabi bag is size 1 (otherwise `menu mujhe dard hai` stays weak and
  // LANG4-D1 never persists pa-Latn).
  if (bags.paExclusive.size > 0 || bags.paPhrases.size > 0) {
    return { language: 'pa-Latn', confidence: 'strong' };
  }

  // 2. Higher total wins.
  // 3. Exact tie on shared-only markers → Hindi (2026-08-02). Exclusive
  //    tokens already identified genuine Punjabi above; a shared-only tie is
  //    far more often Hindi, and the previous Punjabi tiebreak shipped English
  //    112 (via weak) or Punjabi copy to Hindi speakers.
  if (paCount > hiCount) {
    return { language: 'pa-Latn', confidence: confidenceFromCount(paCount) };
  }
  if (hiCount > paCount) {
    return { language: 'hi-Latn', confidence: confidenceFromCount(hiCount) };
  }
  return { language: 'hi-Latn', confidence: confidenceFromCount(hiCount) };
}

function reasonForAdoptedLanguage(
  language: ConversationLanguage
): 'script' | 'markers' {
  return language === 'hi' || language === 'pa' || language === 'other'
    ? 'script'
    : 'markers';
}

/**
 * Marker counts only (lang-18 telemetry). Never returns marker identities (LANG-D9).
 */
export function countLatinLanguageMarkers(text: string): {
  hiMarkerCount: number;
  paMarkerCount: number;
  paExclusiveCount: number;
} {
  const t = text.trim();
  if (!t || textHasIndicOrOtherScript(t)) {
    return { hiMarkerCount: 0, paMarkerCount: 0, paExclusiveCount: 0 };
  }
  const bags = collectLatinMarkerBags(t.toLowerCase());
  return {
    hiMarkerCount: bags.hiWords.size + bags.hiPhrases.size,
    paMarkerCount: bags.paExclusive.size + bags.paShared.size + bags.paPhrases.size,
    paExclusiveCount: bags.paExclusive.size + bags.paPhrases.size,
  };
}

/**
 * Detect language evidence in patient text. Exported for unit tests.
 * Does not apply stickiness — use {@link resolveTurnLanguage} for the turn decision.
 */
export function detectLanguageSignal(text: string): LanguageSignal {
  const t = text.trim();
  if (!t) {
    return { language: 'en', confidence: 'none' };
  }

  // Script tier — always strong (LANG-D3).
  if (/[\u0A00-\u0A7F]/.test(t)) {
    return { language: 'pa', confidence: 'strong' };
  }
  if (/[\u0900-\u097F]/.test(t)) {
    return { language: 'hi', confidence: 'strong' };
  }
  // LANG-D7 scripts → other (detected/stored; deterministic copy renders English).
  if (
    /[\u0980-\u09FF]/.test(t) || // Bengali
    /[\u0B80-\u0BFF]/.test(t) || // Tamil
    /[\u0C00-\u0C7F]/.test(t) || // Telugu
    /[\u0D00-\u0D7F]/.test(t) || // Malayalam
    /[\u0C80-\u0CFF]/.test(t) || // Kannada
    /[\u0B00-\u0B7F]/.test(t) || // Odia
    /[\u0600-\u06FF]/.test(t) // Urdu / Arabic
  ) {
    return { language: 'other', confidence: 'strong' };
  }

  return signalFromLatinMarkerBags(collectLatinMarkerBags(t.toLowerCase()));
}

/**
 * Union Latin markers across patient texts (oldest-first). Script-tier hits are
 * ignored here — accumulation is a Latin-marker escape hatch from English.
 */
function textHasIndicOrOtherScript(t: string): boolean {
  return (
    /[\u0A00-\u0A7F]/.test(t) || // Gurmukhi
    /[\u0900-\u097F]/.test(t) || // Devanagari
    /[\u0980-\u09FF]/.test(t) || // Bengali
    /[\u0B80-\u0BFF]/.test(t) || // Tamil
    /[\u0C00-\u0C7F]/.test(t) || // Telugu
    /[\u0D00-\u0D7F]/.test(t) || // Malayalam
    /[\u0C80-\u0CFF]/.test(t) || // Kannada
    /[\u0B00-\u0B7F]/.test(t) || // Odia
    /[\u0600-\u06FF]/.test(t) // Urdu / Arabic
  );
}

function accumulateLatinSignal(texts: readonly string[]): LanguageSignal {
  const union = emptyLatinMarkerBags();
  for (const raw of texts) {
    const t = raw.trim();
    if (!t) continue;
    // Skip script-tier turns in the union — they already resolve strong alone.
    if (textHasIndicOrOtherScript(t)) continue;
    mergeLatinMarkerBags(union, collectLatinMarkerBags(t.toLowerCase()));
  }
  return signalFromLatinMarkerBags(union);
}

/**
 * Resolve reply language for this turn from stored conversation language + new text.
 * Sticky: only a strong signal can change an established language (LANG-D2/D3).
 *
 * @param priorPatientTexts Oldest-first patient message contents (lang-16).
 *   Only consulted while `stored` is `null` or `'en'` (LANG4-D3). A reversed
 *   array silently changes which turns fall in {@link LANGUAGE_ACCUMULATION_WINDOW}.
 * @param options.acuteEmergency When true, weak non-English is enough to leave
 *   English (crisis cost asymmetry vs the booking ≥2-marker bar).
 */
export function resolveTurnLanguage(
  stored: ConversationLanguage | null,
  text: string,
  priorPatientTexts?: readonly string[],
  options?: ResolveTurnLanguageOptions
): LanguageResolution {
  const trimmed = text.trim();

  // Empty / whitespace / non-text: never switch on signal (lang-01 §3.4).
  if (!trimmed) {
    if (stored == null) {
      // LANG4-D1: render English, do not persist — thread stays undecided.
      return { language: 'en', changed: false, reason: 'default' };
    }
    return { language: stored, changed: false, reason: 'stored' };
  }

  const signal = detectLanguageSignal(trimmed);
  const canLeaveEnglish = stored == null || stored === 'en';

  // Strong current-message signal switches immediately (accumulation never delays).
  if (stored == null) {
    if (signal.confidence === 'strong') {
      return {
        language: signal.language,
        changed: true,
        reason: reasonForAdoptedLanguage(signal.language),
      };
    }
  } else if (signal.confidence === 'strong' && signal.language !== stored) {
    return {
      language: signal.language,
      changed: true,
      reason: reasonForAdoptedLanguage(signal.language),
    };
  }

  // Acute emergency: weak non-English is enough to leave English / undecided.
  // Does not move established non-en threads (LANG-D2). Never invents English.
  if (
    options?.acuteEmergency === true &&
    canLeaveEnglish &&
    signal.confidence === 'weak' &&
    signal.language !== 'en'
  ) {
    return {
      language: signal.language,
      changed: true,
      reason: 'markers',
    };
  }

  // LANG4-D3: accumulate only while undecided or English.
  if (canLeaveEnglish && signal.confidence !== 'none') {
    // Current message must contribute ≥1 marker (§2.4).
    const windowPrior = (priorPatientTexts ?? []).slice(-LANGUAGE_ACCUMULATION_WINDOW);
    const accumulated = accumulateLatinSignal([...windowPrior, trimmed]);
    if (
      accumulated.confidence === 'strong' &&
      (stored == null || accumulated.language !== stored)
    ) {
      return {
        language: accumulated.language,
        changed: true,
        reason: 'accumulated',
      };
    }
  }

  if (stored == null) {
    // LANG4-D1: render English, do not persist — thread stays undecided.
    return { language: 'en', changed: false, reason: 'default' };
  }

  return { language: stored, changed: false, reason: 'stored' };
}

const CLASSIFIER_LANGUAGE_VALUES: readonly ConversationLanguage[] = [
  'en',
  'hi',
  'hi-Latn',
  'pa',
  'pa-Latn',
  'other',
];

/**
 * Coerce a classifier language label. Absent / malformed / out-of-set → unknown.
 * Never throws (lang-17 §1.4).
 */
export function coerceClassifierLanguage(
  raw: unknown
): ConversationLanguage | 'unknown' {
  if (typeof raw !== 'string') return 'unknown';
  if (raw === 'unknown') return 'unknown';
  if ((CLASSIFIER_LANGUAGE_VALUES as readonly string[]).includes(raw)) {
    return raw as ConversationLanguage;
  }
  return 'unknown';
}

/**
 * High-frequency English evidence tokens for the LANG4-D4 English veto.
 * Used only when marker confidence is `none` — never competes with HI/PA wordlists.
 * Exported for unit tests.
 */
export const ENGLISH_EVIDENCE_WORDS: readonly string[] = [
  // Closed-class / function words
  'the',
  'a',
  'an',
  'is',
  'are',
  'was',
  'were',
  'am',
  'be',
  'been',
  'being',
  'i',
  'im',
  'ive',
  'you',
  'we',
  'they',
  'he',
  'she',
  'it',
  'my',
  'your',
  'our',
  'their',
  'this',
  'that',
  'these',
  'those',
  'and',
  'or',
  'but',
  'if',
  'of',
  'to',
  'for',
  'with',
  'from',
  'on',
  'in',
  'at',
  'by',
  'as',
  'after',
  'before',
  'now',
  'then',
  'than',
  'too',
  'also',
  'just',
  'only',
  'not',
  'yes',
  'please',
  'thanks',
  'thank',
  'want',
  'need',
  'have',
  'has',
  'had',
  'do',
  'does',
  'did',
  'can',
  'could',
  'will',
  'would',
  'should',
  'may',
  'might',
  'must',
  'about',
  'into',
  'over',
  'under',
  'again',
  'once',
  'here',
  'there',
  'when',
  'where',
  'what',
  'which',
  'who',
  'how',
  'why',
  'because',
  'so',
  'very',
  'really',
  'still',
  'already',
  // Common clinic / symptom English (A7.2 FP vector)
  'last',
  'year',
  'years',
  'today',
  'tomorrow',
  'morning',
  'evening',
  'night',
  'week',
  'month',
  'fine',
  'mild',
  'severe',
  'since',
  'feeling',
  'feel',
  'felt',
  'got',
  'get',
  'getting',
  'appointment',
  'doctor',
  'book',
  'booking',
  'slot',
  'fee',
  'fees',
  'consult',
  'consultation',
  'clinic',
  'hospital',
  'pain',
  'discomfort',
  'tightness',
  'pressure',
  'burning',
  'breath',
  'breathing',
  'breathless',
  'gym',
  'workout',
  'exercise',
  'chest',
  'blood',
  'high',
  'low',
  'no',
  'left',
  'out',
  'off',
  'more',
  'less',
  // Common clinical English nouns patients send as telegraphic phrases
  'asthma',
  'inhaler',
  'fever',
  'cough',
  'cold',
  'headache',
  'diabetes',
  'sugar',
  'rash',
  'swelling',
  'vomiting',
  'nausea',
  'dizzy',
  'dizziness',
  'weakness',
  'tablet',
  'tablets',
  'medicine',
  'medicines',
  'report',
  'reports',
  'test',
  'scan',
  'injection',
  'allergy',
  'infection',
];

const ENGLISH_EVIDENCE_SET = new Set(ENGLISH_EVIDENCE_WORDS);

/**
 * ≥ this many distinct evidence tokens → confidently English (veto classifier adopt).
 *
 * One is enough because the veto only runs when the Indic wordlist found **nothing**
 * (`markerConfidence === 'none'`). The costs are asymmetric: a false adopt is sticky
 * and unrecoverable under LANG-D2, while a false veto only leaves the thread
 * undecided — the next turn's markers can still decide it.
 */
const ENGLISH_EVIDENCE_MIN_HITS = 1;

const DEVANAGARI_RE = /[\u0900-\u097F]/;
const GURMUKHI_RE = /[\u0A00-\u0A7F]/;

/**
 * True when the message looks confidently English by function/content evidence.
 * Pure. Used to veto classifier adoption on wordlist-miss English (LANG4-D4 amend).
 */
export function messageHasConfidentEnglishEvidence(text: string): boolean {
  const tokens = text
    .toLowerCase()
    .match(/[a-z']+/g);
  if (!tokens || tokens.length === 0) return false;
  const hits = new Set<string>();
  for (const tok of tokens) {
    const normalized = tok.replace(/'/g, '');
    if (normalized.length < 2) continue;
    if (ENGLISH_EVIDENCE_SET.has(normalized)) hits.add(normalized);
    if (hits.size >= ENGLISH_EVIDENCE_MIN_HITS) return true;
  }
  return false;
}

/** Options for {@link applyClassifierLanguageRatchet}. */
export type ClassifierLanguageRatchetOptions = {
  /**
   * Current-message marker confidence from {@link detectLanguageSignal}.
   * When `weak`, the classifier must not adopt — LANG-D3 already decided a
   * single marker is not enough to leave English (`kitna is the fee?`).
   * Classifier fill-in is for wordlist **misses** (`none`), not threshold holds.
   */
  markerConfidence?: LanguageSignal['confidence'];
  /**
   * Current patient message. When marker confidence is `none` and this text has
   * confident English evidence, classifier adoption is vetoed (LANG4-D4 amend).
   */
  messageText?: string;
};

/**
 * LANG4-D4 ratchet (lang-17): classifier may move a thread *off* English on an
 * undecided thread only. Deterministic markers always win. Classifier `en` is
 * never evidence — a model that labels everything English cannot undo the phase.
 *
 * Amend (2026-08-03): on marker `none`, confident English evidence vetoes
 * adoption so pure-English first messages cannot sticky-trap as `hi-Latn`.
 * Fill-in remains for genuine wordlist misses without English evidence.
 *
 * Pure. The resolver stays unaware of the classifier.
 */
export function applyClassifierLanguageRatchet(
  resolution: LanguageResolution,
  storedBefore: ConversationLanguage | null,
  classifierLanguage: ConversationLanguage | 'unknown',
  options?: ClassifierLanguageRatchetOptions
): LanguageResolution {
  // Rule 3: classifier en / unknown / other — no effect, ever.
  // `other` still renders English (LANG-D7); adopting it as sticky would trap
  // the thread without changing patient-visible language.
  if (
    classifierLanguage === 'en' ||
    classifierLanguage === 'unknown' ||
    classifierLanguage === 'other'
  ) {
    return resolution;
  }

  // Rule 4: established language (including explicitly persisted en) — no effect.
  if (storedBefore != null) {
    return resolution;
  }

  // Rule 1: deterministic non-en already won — keep it.
  if (resolution.language !== 'en') {
    return resolution;
  }

  // LANG-D3: a weak marker that did not clear the booking bar must not be
  // overturned by the classifier (mixed English + one Hinglish fee word).
  if (options?.markerConfidence === 'weak') {
    return resolution;
  }

  const messageText = options?.messageText;

  // LANG4-D4 amend: wordlist miss + confidently English → stay undecided/en.
  // Keeps fill-in for short/ambiguous or unknown-Hinglish misses without EN evidence.
  if (
    (options?.markerConfidence === 'none' || options?.markerConfidence === undefined) &&
    messageText != null &&
    messageHasConfidentEnglishEvidence(messageText)
  ) {
    return resolution;
  }

  // Native-script guard: text with no Devanagari cannot justify sticky `hi`
  // (same for Gurmukhi / `pa`) — a Latin message is at most the Latin variant.
  let adopted = classifierLanguage;
  if (messageText != null) {
    if (adopted === 'hi' && !DEVANAGARI_RE.test(messageText)) adopted = 'hi-Latn';
    if (adopted === 'pa' && !GURMUKHI_RE.test(messageText)) adopted = 'pa-Latn';
  }

  // Rule 2: undecided + wordlist miss rendered en + classifier hi/pa → adopt.
  return {
    language: adopted,
    changed: true,
    reason: 'classifier',
  };
}

/**
 * Flat LLM instruction for the resolved turn language (lang-04).
 * `other` renders English copy (LANG-D7).
 */
export function buildLanguageReplyDirective(turnLanguage: ConversationLanguage): string {
  let languageLine: string;
  switch (turnLanguage) {
    case 'en':
    case 'other':
      languageLine = 'LANGUAGE: Reply in English.';
      break;
    case 'hi':
      languageLine = 'LANGUAGE: Reply in Hindi, in Devanagari script.';
      break;
    case 'hi-Latn':
      languageLine =
        'LANGUAGE: Reply in Hinglish — Hindi written in Latin script, the way the patient is writing.';
      break;
    case 'pa':
      languageLine = 'LANGUAGE: Reply in Punjabi, in Gurmukhi script.';
      break;
    case 'pa-Latn':
      languageLine = 'LANGUAGE: Reply in Punjabi written in Latin script.';
      break;
    default: {
      const _exhaustive: never = turnLanguage;
      void _exhaustive;
      languageLine = 'LANGUAGE: Reply in English.';
      break;
    }
  }
  return (
    `${languageLine}\n` +
    'Do not switch language mid-reply. Do not translate the practice name, doctor name, or ₹ amounts.'
  );
}
