import type { ConversationState } from '../types/conversation';

/** Last bot message asked for booking details (Full name, Age, Reason for visit, etc.). */
export function lastBotMessageAskedForDetails(
  recentMessages: { sender_type: string; content: string }[]
): boolean {
  for (let i = recentMessages.length - 1; i >= 0; i--) {
    if (recentMessages[i].sender_type !== 'patient') {
      const c = (recentMessages[i].content ?? '').toLowerCase();
      return (
        c.includes('reason for visit') ||
        c.includes('full name') ||
        (c.includes('age') && c.includes('gender')) ||
        c.includes('mobile number')
      );
    }
  }
  return false;
}

/** Last bot message asked for consent (Ready to pick a time? Do I have your consent? Anything else? etc.). */
export function lastBotMessageAskedForConsent(
  recentMessages: { sender_type: string; content: string }[]
): boolean {
  for (let i = recentMessages.length - 1; i >= 0; i--) {
    if (recentMessages[i].sender_type !== 'patient') {
      const c = (recentMessages[i].content ?? '').toLowerCase();
      return (
        c.includes('ready to pick a time') ||
        c.includes('do i have your consent') ||
        c.includes('consent to use these details') ||
        (c.includes('anything else') && c.includes('say yes to continue')) ||
        (c.includes('consent') &&
          (c.includes('reply') ||
            c.includes('share') ||
            c.includes('scheduling') ||
            c.includes('appointment') ||
            c.includes('details') ||
            c.includes('clinic'))) ||
        /\b(i consent|say yes to consent|grant consent)\b/.test(c)
      );
    }
  }
  return false;
}

/** Last bot message asked for confirm (template or AI wording before consent / slot link). */
export function lastBotMessageAskedForConfirm(
  recentMessages: { sender_type: string; content: string }[]
): boolean {
  for (let i = recentMessages.length - 1; i >= 0; i--) {
    if (recentMessages[i].sender_type !== 'patient') {
      const c = (recentMessages[i].content ?? '').toLowerCase();
      if (c.includes('is this correct') && c.includes('reply yes')) return true;
      if (c.includes('anything else') && c.includes('say yes to continue') && !c.includes('detail')) {
        return false;
      }
      const mentionsDetailConfirm =
        (c.includes('confirm') && (c.includes('detail') || c.includes('correct'))) ||
        (c.includes('detail') && c.includes('correct')) ||
        c.includes('is this correct');
      const asksAffirmation =
        (c.includes('reply') && /\b(yes|yeah|yep|confirm|okay|ok)\b/.test(c)) ||
        /\byes,?\s+i\s+confirm\b/.test(c) ||
        c.includes('yes to proceed') ||
        (c.includes('slot') &&
          (c.includes('picker') || c.includes('pick') || c.includes('select') || c.includes('link')) &&
          (c.includes('confirm') || c.includes('correct')));
      return mentionsDetailConfirm && asksAffirmation;
    }
  }
  return false;
}

/** Last bot message asked for match confirmation (Same person? Reply Yes or No). */
export function lastBotMessageAskedForMatch(
  recentMessages: { sender_type: string; content: string }[]
): boolean {
  for (let i = recentMessages.length - 1; i >= 0; i--) {
    if (recentMessages[i].sender_type !== 'patient') {
      const c = (recentMessages[i].content ?? '').toLowerCase();
      return c.includes('same person') && (c.includes('reply yes') || c.includes('yes or no'));
    }
  }
  return false;
}

/** RBH-07: Prefer structured `lastPromptKind`; legacy conversations fall back to substring heuristics. */
export function effectiveAskedForDetails(
  state: ConversationState,
  recentMessages: { sender_type: string; content: string }[]
): boolean {
  return state.lastPromptKind === 'collect_details' || lastBotMessageAskedForDetails(recentMessages);
}

export function effectiveAskedForConsent(
  state: ConversationState,
  recentMessages: { sender_type: string; content: string }[]
): boolean {
  return (
    state.lastPromptKind === 'consent' ||
    state.lastPromptKind === 'consent_optional_extras' ||
    lastBotMessageAskedForConsent(recentMessages)
  );
}

export function effectiveAskedForConfirm(
  state: ConversationState,
  recentMessages: { sender_type: string; content: string }[]
): boolean {
  return state.lastPromptKind === 'confirm_details' || lastBotMessageAskedForConfirm(recentMessages);
}

export function effectiveAskedForMatch(
  state: ConversationState,
  recentMessages: { sender_type: string; content: string }[]
): boolean {
  return state.lastPromptKind === 'match_pick' || lastBotMessageAskedForMatch(recentMessages);
}
