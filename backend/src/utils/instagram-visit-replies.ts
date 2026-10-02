/**
 * Instagram DM signpost. One word — visit — for queue, slot, and mixed days.
 * Facebook does not use this module.
 */

import { isSingleFeeCatalogMode } from './consultation-fees';
import { isBareFeeQuoteAcknowledgement } from './consultation-fees';
import {
  languageUsesDevanagari,
  languageUsesGurmukhi,
  toStaticLocale,
  type ConversationLanguage,
  type StaticMessageLocale,
} from './conversation-language';
import {
  isClinicalAdviceUserMessage,
  isHoursFaqUserMessage,
  isLocationFaqUserMessage,
  isOpsPaymentFaqUserMessage,
  isThanksOnlyUserMessage,
} from './instagram-faq-copy';

export type InstagramVisitKind =
  | 'silent'
  | 'menu'
  | 'health'
  | 'visits'
  | 'change'
  | 'cancel'
  | 'view'
  | 'times'
  | 'fee'
  | 'fees'
  | 'payment'
  | 'address'
  | 'address_hidden'
  | 'online'
  | 'non_text';

const VISIT_ASK =
  /\b(book(?:ing)?|tokens?|appointments?|queue|revisits?|visits?|follow[-\s]?ups?)\b/i;
const CHANGE_ASK = /\b(reschedule|change)\b/i;
const CANCEL_ASK = /\bcancel(?:lation)?\b/i;
const VIEW_ASK = /\b(my visit|my appointment|appointment status|visit status|status)\b/i;
const TIMES_ASK =
  /\b(timings?|availability|available|slots?|what time|open slots?|time kya|time batao)\b/i;
const PLACE_ASK = /\b(kahan|kidhar)\b/i;
const EMOJI_ONLY = /^(?:\p{Extended_Pictographic}|\uFE0F|\u200D|\s)+$/u;
const MENU_NUMBER =
  /^\s*(?:option|number|no\.?)?\s*([1-3])(?:st|nd|rd)?\s*[.)]?\s*(?:please|pls|plz)?\s*$/i;
const ACK_PHRASE =
  /\b(?:thank you so much|thanks a lot|thank you|thanks|thankyou|thx|ty|thanku|dhanyavaad|dhanyavad|shukriya|okay|okk|okey|ok|theek hai|thik hai|theek|thik|accha|acha|achha|hmm|hm|sure|cool|got it|all right|alright|ji)\b/gi;

function scriptOf(language: ConversationLanguage): 'native' | 'latin' {
  const locale = toStaticLocale(language);
  if (locale === 'hi' && languageUsesDevanagari(language)) return 'native';
  if (locale === 'pa' && languageUsesGurmukhi(language)) return 'native';
  return 'latin';
}

function line(
  language: ConversationLanguage,
  byLocale: Record<StaticMessageLocale, { native: string; latin: string } | string>
): string {
  const locale = toStaticLocale(language);
  const row = byLocale[locale];
  if (typeof row === 'string') return row;
  return scriptOf(language) === 'native' ? row.native : row.latin;
}

function visitFeeAmount(
  settings:
    | {
        catalog_mode?: string | null;
        appointment_fee_minor?: number | null;
        appointment_fee_currency?: string | null;
      }
    | null
    | undefined
): string | null {
  if (!isSingleFeeCatalogMode(settings)) return null;
  const minor = settings?.appointment_fee_minor;
  if (minor == null || minor <= 0) return null;
  const cur = (settings?.appointment_fee_currency || 'INR').toUpperCase();
  return cur === 'INR' ? `₹${Math.round(minor / 100)}` : `${(minor / 100).toFixed(2)} ${cur}`;
}

/** Thanks, ok, and emoji. A mix such as "ok thanks" is the same. */
function isInstagramChatter(text: string): boolean {
  if (EMOJI_ONLY.test(text)) return true;
  const cleaned = text
    .replace(/\p{Extended_Pictographic}/gu, ' ')
    .replace(/[\uFE0F\u200D]/g, ' ')
    .replace(/[!.,?]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return false;
  ACK_PHRASE.lastIndex = 0;
  if (!ACK_PHRASE.test(cleaned)) return false;
  ACK_PHRASE.lastIndex = 0;
  return cleaned.replace(ACK_PHRASE, ' ').replace(/\s+/g, ' ').trim().length === 0;
}

export function classifyInstagramVisitTurn(input: {
  text: string;
  intent?: string | null;
  signalsFeePricing?: boolean;
  hasSingleFee: boolean;
  hasSharedAddress: boolean;
  onlineOnly: boolean;
}): InstagramVisitKind {
  const text = input.text.trim();
  if (!text) return 'menu';
  if (
    isInstagramChatter(text) ||
    isThanksOnlyUserMessage(text) ||
    isBareFeeQuoteAcknowledgement(text)
  ) {
    return 'silent';
  }
  const menuPick = MENU_NUMBER.exec(text)?.[1];
  if (menuPick === '1') return 'visits';
  if (menuPick === '2') return 'change';
  if (menuPick === '3') return 'times';
  if (
    /^(?:h+i+|he+y+|hello+|helo+|hlo+|hlw+|hy+|hiya|howdy|namaste|namaskar|gm|good\s+(morning|afternoon|evening|day)|how are you)(?:\s+(?:ji|sir|ma'?am|mam|madam|doctor|doc))?[\s!?.]*$/i.test(
      text
    )
  ) {
    return 'menu';
  }
  const clinical =
    input.intent === 'medical_query' ||
    input.intent === 'emergency' ||
    isClinicalAdviceUserMessage(text);
  if (clinical) return 'health';
  if (input.signalsFeePricing || isFeeAsk(text)) {
    return input.hasSingleFee ? 'fee' : 'fees';
  }
  if (isLocationFaqUserMessage(text) || PLACE_ASK.test(text)) {
    if (input.hasSharedAddress) return 'address';
    if (input.onlineOnly) return 'online';
    return 'address_hidden';
  }
  if (isOpsPaymentFaqUserMessage(text)) return 'payment';
  if (isHoursFaqUserMessage(text) || TIMES_ASK.test(text)) return 'times';
  if (input.intent === 'cancel_appointment' || CANCEL_ASK.test(text)) return 'cancel';
  if (input.intent === 'reschedule_appointment' || CHANGE_ASK.test(text)) return 'change';
  if (input.intent === 'check_appointment_status' || VIEW_ASK.test(text)) return 'view';
  if (input.intent === 'book_appointment' || VISIT_ASK.test(text)) return 'visits';
  return 'menu';
}

function isFeeAsk(text: string): boolean {
  return /\b(fees?|charges?|price|pricing|kitna|kitne|kitni|cost|how\s+much)\b/i.test(text);
}

const MENU_OPTIONS: Record<StaticMessageLocale, { native: string; latin: string } | string> = {
  en: '1. New visit / revisit / follow-up\n2. Change or cancel a visit\n3. Check availability',
  hi: {
    native: '1. नया visit / revisit / follow-up\n2. Visit बदलें या cancel करें\n3. Availability check करें',
    latin: '1. Naya visit / revisit / follow-up\n2. Visit badlein ya cancel karein\n3. Availability check karein',
  },
  pa: {
    native: '1. ਨਵਾਂ visit / revisit / follow-up\n2. Visit ਬਦਲੋ ਜਾਂ cancel ਕਰੋ\n3. Availability check ਕਰੋ',
    latin: '1. Nava visit / revisit / follow-up\n2. Visit badlo ja cancel karo\n3. Availability check karo',
  },
};

function menuBlock(language: ConversationLanguage, greet: boolean): string {
  const heading = greet
    ? line(language, {
        en: 'Hi, please choose from the following:',
        hi: { native: 'नमस्ते, इनमें से चुनें:', latin: 'Namaste, inme se chunein:' },
        pa: { native: 'ਸਤ ਸ੍ਰੀ ਅਕਾਲ, ਇਹਨਾਂ ਵਿੱਚੋਂ ਚੁਣੋ:', latin: 'Sat sri akal, inhan vichon chuno:' },
      })
    : line(language, {
        en: 'Please choose from the following:',
        hi: { native: 'इनमें से चुनें:', latin: 'Inme se chunein:' },
        pa: { native: 'ਇਹਨਾਂ ਵਿੱਚੋਂ ਚੁਣੋ:', latin: 'Inhan vichon chuno:' },
      });
  return `${heading}\n${line(language, MENU_OPTIONS)}`;
}

export function renderInstagramVisitReply(input: {
  kind: InstagramVisitKind;
  language: ConversationLanguage;
  url?: string | null;
  address?: string | null;
  feeAmount?: string | null;
  /** First menu in a chat. Later menus repeat without the greeting. */
  greet?: boolean;
  includeStopHint?: boolean;
}): string {
  if (input.kind === 'silent') return '';
  const url = input.url?.trim() || '';
  const withUrl = (label: string): string =>
    url ? `${label} ${url}` : label.replace(/:\s*$/, '.');
  const options = menuBlock(input.language, false);

  let body: string;
  switch (input.kind) {
    case 'health':
      body = [
        line(input.language, {
          en: 'Health questions are not answered in this chat.',
          hi: {
            native: 'इस chat में health questions का जवाब नहीं दिया जाता।',
            latin: 'Is chat mein health questions ka jawab nahi diya jata.',
          },
          pa: {
            native: 'ਇਸ chat ਵਿੱਚ health questions ਦਾ ਜਵਾਬ ਨਹੀਂ ਦਿੱਤਾ ਜਾਂਦਾ।',
            latin: 'Is chat vich health questions da jawab nahi ditta janda.',
          },
        }),
        options,
      ].join('\n');
      break;
    case 'fee':
      body = input.feeAmount
        ? `Visit fee: ${input.feeAmount}.`
        : withUrl('Fees:');
      break;
    case 'fees':
      body = withUrl('Fees:');
      break;
    case 'address':
      body = `Address: ${(input.address ?? '').trim()}`;
      break;
    case 'address_hidden':
      body = [
        line(input.language, {
          en: 'Address is not shared in this chat.',
          hi: {
            native: 'Address इस chat में share नहीं किया जाता।',
            latin: 'Address is chat mein share nahi kiya jata.',
          },
          pa: {
            native: 'Address ਇਸ chat ਵਿੱਚ share ਨਹੀਂ ਕੀਤਾ ਜਾਂਦਾ।',
            latin: 'Address is chat vich share nahi kita janda.',
          },
        }),
        options,
      ].join('\n');
      break;
    case 'online':
      body = [
        line(input.language, {
          en: 'Online visits only.',
          hi: { native: 'सिर्फ online visits.', latin: 'Sirf online visits.' },
          pa: { native: 'ਸਿਰਫ਼ online visits.', latin: 'Sirf online visits.' },
        }),
        options,
      ].join('\n');
      break;
    case 'times':
      body = withUrl('Availability:');
      break;
    case 'change':
    case 'cancel':
      body = withUrl('Change or cancel a visit:');
      break;
    case 'view':
      body = withUrl('View visits:');
      break;
    case 'payment':
      body = withUrl('Payment:');
      break;
    case 'non_text':
      body = [
        line(input.language, {
          en: 'Images and voice notes are not read here.',
          hi: {
            native: 'Images और voice notes यहाँ नहीं पढ़े जाते।',
            latin: 'Images aur voice notes yahan nahi padhe jate.',
          },
          pa: {
            native: 'Images ਅਤੇ voice notes ਇੱਥੇ ਨਹੀਂ ਪੜ੍ਹੇ ਜਾਂਦੇ।',
            latin: 'Images te voice notes ethe nahi parhe jande.',
          },
        }),
        options,
      ].join('\n');
      break;
    case 'visits':
      body = withUrl('New visit / revisit / follow-up:');
      break;
    case 'menu':
    default:
      body = menuBlock(input.language, input.greet === true);
      break;
  }

  if (!input.includeStopHint) return body;
  const hint = line(input.language, {
    en: 'Reply STOP to stop these messages.',
    hi: {
      native: 'ये messages बंद करने के लिए STOP reply करें।',
      latin: 'Ye messages band karne ke liye STOP reply karein.',
    },
    pa: {
      native: 'ਇਹ messages ਬੰਦ ਕਰਨ ਲਈ STOP reply ਕਰੋ।',
      latin: 'Eh messages band karan layi STOP reply karo.',
    },
  });
  return `${body}\n${hint}`;
}

export function instagramStopAck(language: ConversationLanguage): string {
  return line(language, {
    en: 'Messages are off. Reply START to turn them back on.',
    hi: {
      native: 'Messages बंद हैं। वापस चालू करने के लिए START reply करें।',
      latin: 'Messages band hain. Wapas chalu karne ke liye START reply karein.',
    },
    pa: {
      native: 'Messages ਬੰਦ ਹਨ। ਵਾਪਸ ਚਾਲੂ ਕਰਨ ਲਈ START reply ਕਰੋ।',
      latin: 'Messages band han. Wapas chalu karan layi START reply karo.',
    },
  });
}

export function instagramStartAck(input: {
  language: ConversationLanguage;
  url?: string | null;
}): string {
  const on = line(input.language, {
    en: 'Messages are on.',
    hi: { native: 'Messages चालू हैं।', latin: 'Messages chalu hain.' },
    pa: { native: 'Messages ਚਾਲੂ ਹਨ।', latin: 'Messages chalu han.' },
  });
  const menu = renderInstagramVisitReply({
    kind: 'menu',
    language: input.language,
    url: input.url,
  });
  return `${on}\n${menu}`;
}

export function instagramPauseReply(language: ConversationLanguage): string {
  return line(language, {
    en: 'Messages are paused here.',
    hi: { native: 'यहाँ messages pause हैं।', latin: 'Yahan messages pause hain.' },
    pa: { native: 'ਇੱਥੇ messages pause ਹਨ।', latin: 'Ithe messages pause han.' },
  });
}

export function instagramDeletionReply(kind: 'deleted' | 'none'): string {
  if (kind === 'deleted') return 'Stored details for this chat are deleted.';
  return 'No stored details for this chat.';
}

export function instagramCommentPrivateReply(input: {
  language: ConversationLanguage;
  url?: string | null;
  feeAmount?: string | null;
  askedFee: boolean;
}): string {
  const visits = renderInstagramVisitReply({
    kind: 'visits',
    language: input.language,
    url: input.url,
  });
  if (input.askedFee && input.feeAmount) {
    return `Visit fee: ${input.feeAmount}.\n${visits}`;
  }
  if (input.askedFee) {
    return renderInstagramVisitReply({
      kind: 'fees',
      language: input.language,
      url: input.url,
    });
  }
  return visits;
}

export function singleVisitFeeAmount(
  settings:
    | {
        catalog_mode?: string | null;
        appointment_fee_minor?: number | null;
        appointment_fee_currency?: string | null;
      }
    | null
    | undefined
): string | null {
  return visitFeeAmount(settings);
}
