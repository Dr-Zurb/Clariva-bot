/**
 * Context for consent / optional-extras turns — must run BEFORE global keyword deny lists.
 * See AI_BOT_BUILDING_PHILOSOPHY.md §4.8 (context before keywords).
 */

/** Assistant asked for optional visit notes, not a bare "deny consent" question. */
export function isOptionalExtrasConsentPrompt(assistantMessage: string | undefined): boolean {
  if (!assistantMessage?.trim()) return false;
  const c = assistantMessage.toLowerCase();
  // Current copy: special notes / allergies / medications (distinct from reason-for-visit triage)
  if (
    c.includes('special notes') &&
    c.includes('doctor') &&
    (c.includes('optional') || c.includes('say yes to continue'))
  ) {
    return true;
  }
  // Legacy copy: "Anything else you'd like the doctor to know..."
  return (
    (c.includes('anything else') && (c.includes('doctor') || c.includes('optional'))) ||
    (c.includes('anything else') && c.includes('say yes to continue')) ||
    (c.includes('anything else') && c.includes('extras'))
  );
}

const SKIP_EXTRAS_EXACT: readonly string[] = [
  'nothing',
  'skip',
  'nope',
  'no thanks',
  'no thank you',
  'all good',
  "that's all",
  'thats all',
  'no',
  'that\'s it',
  'thats it',
  'none',
  'no extras',
  'im good',
  "i'm good",
  'bas',
  'nahi bas',
];

/**
 * User declines to add optional notes — should NOT be treated as denying data consent.
 */
export function isSkipExtrasReply(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t) return true;
  for (const p of SKIP_EXTRAS_EXACT) {
    if (t === p || t === p + '.' || t.startsWith(p + ',')) return true;
  }
  if (/^no\s+[,;]?\s*(that'?s\s+)?it\b/.test(t)) return true;
  if (/^nope\s*[,;]?\s*(that'?s\s+)?it\b/.test(t)) return true;
  if (/^(nah|naah)\s*[,;]?\s*(that'?s\s+)?(all|it)\b/.test(t)) return true;
  return false;
}
