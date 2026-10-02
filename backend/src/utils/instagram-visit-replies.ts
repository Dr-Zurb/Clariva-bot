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
import { instagramAccountNameForGreeting } from './instagram-greeting-copy';
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
  /\b(book(?:ing)?|token|tokens|appointment|appointments|queue|visit|visits)\b/i;
const CHANGE_ASK = /\b(reschedule|change)\b/i;
const CANCEL_ASK = /\bcancel(?:lation)?\b/i;
const VIEW_ASK = /\b(my visit|my appointment|appointment status|visit status|status)\b/i;
const TIMES_ASK = /\b(timings?|availability|slots?|what time|open slots?)\b/i;
const EMOJI_ONLY = /^(?:\p{Extended_Pictographic}|\uFE0F|\u200D|\s)+$/u;

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

export function instagramAutomatedPrefix(
  language: ConversationLanguage,
  accountName: string | null | undefined
): string {
  const from = instagramAccountNameForGreeting(accountName);
  if (!from) return 'Automated reply.';
  return line(language, {
    en: `Automated reply from ${from}.`,
    hi: {
      native: `${from} की ओर से automated reply.`,
      latin: `${from} ki taraf se automated reply.`,
    },
    pa: {
      native: `${from} ਵਲੋਂ automated reply.`,
      latin: `${from} vallon automated reply.`,
    },
  });
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
    isThanksOnlyUserMessage(text) ||
    isBareFeeQuoteAcknowledgement(text) ||
    EMOJI_ONLY.test(text)
  ) {
    return 'silent';
  }
  if (
    /^(hi|hello|hey|hiya|howdy|namaste|good\s+(morning|afternoon|evening|day)|how are you)[\s!?.]*$/i.test(
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
  if (isLocationFaqUserMessage(text)) {
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
  return /\b(fees?|charges?|price|pricing|kitna|kitne|cost)\b/i.test(text);
}

export function renderInstagramVisitReply(input: {
  kind: InstagramVisitKind;
  language: ConversationLanguage;
  accountName?: string | null;
  url?: string | null;
  address?: string | null;
  feeAmount?: string | null;
  includeStopHint?: boolean;
}): string {
  if (input.kind === 'silent') return '';
  const prefix = instagramAutomatedPrefix(input.language, input.accountName);
  const url = input.url?.trim() || '';
  const withUrl = (label: string): string =>
    url ? `${label} ${url}` : label.replace(/:\s*$/, '.');

  let body: string;
  switch (input.kind) {
    case 'health':
      body = [
        prefix,
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
        line(input.language, {
          en: 'Send visit, change, or cancel.',
          hi: {
            native: 'visit, change, या cancel भेजें।',
            latin: 'visit, change, ya cancel bhejein.',
          },
          pa: {
            native: 'visit, change, ਜਾਂ cancel ਭੇਜੋ।',
            latin: 'visit, change, ja cancel bhejo.',
          },
        }),
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
        withUrl('Visits:'),
      ].join('\n');
      break;
    case 'online':
      body = withUrl('Online visits only:');
      break;
    case 'times':
      body = withUrl('Visit times:');
      break;
    case 'change':
      body = withUrl('Change a visit:');
      break;
    case 'cancel':
      body = withUrl('Cancel a visit:');
      break;
    case 'view':
      body = withUrl('View visits:');
      break;
    case 'payment':
      body = withUrl('Payment:');
      break;
    case 'non_text':
      body = [
        prefix,
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
        withUrl('Visits:'),
      ].join('\n');
      break;
    case 'visits':
      body = withUrl('Visits:');
      break;
    case 'menu':
    default:
      body = [prefix, withUrl('Visits:')].join('\n');
      break;
  }

  if (!input.includeStopHint) return body;
  const hint = line(input.language, {
    en: 'Send STOP to turn off automated replies.',
    hi: {
      native: 'Automated replies बंद करने के लिए STOP भेजें।',
      latin: 'Automated replies band karne ke liye STOP bhejein.',
    },
    pa: {
      native: 'Automated replies ਬੰਦ ਕਰਨ ਲਈ STOP ਭੇਜੋ।',
      latin: 'Automated replies band karan layi STOP bhejo.',
    },
  });
  return `${body}\n${hint}`;
}

export function instagramStopAck(language: ConversationLanguage): string {
  return line(language, {
    en: 'Automated replies are off. Send START to turn them on.',
    hi: {
      native: 'Automated replies बंद हैं। चालू करने के लिए START भेजें।',
      latin: 'Automated replies band hain. Chalu karne ke liye START bhejein.',
    },
    pa: {
      native: 'Automated replies ਬੰਦ ਹਨ। ਚਾਲੂ ਕਰਨ ਲਈ START ਭੇਜੋ।',
      latin: 'Automated replies band han. Chalu karan layi START bhejo.',
    },
  });
}

export function instagramStartAck(input: {
  language: ConversationLanguage;
  accountName?: string | null;
  url?: string | null;
}): string {
  const on = line(input.language, {
    en: 'Automated replies are on.',
    hi: {
      native: 'Automated replies चालू हैं।',
      latin: 'Automated replies chalu hain.',
    },
    pa: {
      native: 'Automated replies ਚਾਲੂ ਹਨ।',
      latin: 'Automated replies chalu han.',
    },
  });
  const menu = renderInstagramVisitReply({
    kind: 'menu',
    language: input.language,
    accountName: input.accountName,
    url: input.url,
  });
  return `${on}\n${menu}`;
}

export function instagramDeletionReply(kind: 'deleted' | 'none'): string {
  if (kind === 'deleted') return 'Stored details for this chat are deleted.';
  return 'No stored details for this chat.';
}

export function instagramCommentPrivateReply(input: {
  language: ConversationLanguage;
  accountName?: string | null;
  url?: string | null;
  feeAmount?: string | null;
  askedFee: boolean;
}): string {
  const prefix = instagramAutomatedPrefix(input.language, input.accountName);
  const visits = renderInstagramVisitReply({
    kind: 'visits',
    language: input.language,
    url: input.url,
  });
  if (input.askedFee && input.feeAmount) {
    return `${prefix}\nVisit fee: ${input.feeAmount}.\n${visits}`;
  }
  if (input.askedFee) {
    const fees = renderInstagramVisitReply({
      kind: 'fees',
      language: input.language,
      url: input.url,
    });
    return `${prefix}\n${fees}`;
  }
  return `${prefix}\n${visits}`;
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
