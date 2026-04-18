/**
 * Context for consent / optional-extras turns — must run BEFORE global keyword deny lists.
 * See AI_BOT_BUILDING_PHILOSOPHY.md §4.8 (context before keywords).
 */

/** Assistant asked for optional visit notes, not a bare "deny consent" question. */
export function isOptionalExtrasConsentPrompt(assistantMessage: string | undefined): boolean {
  if (!assistantMessage?.trim()) return false;
  const c = assistantMessage.toLowerCase();
  // Current copy (2026-04-18, Task 04): "Any notes for the doctor? (allergies, current medicines,
  // anything else — optional) / Reply **Yes** when you're ready to pick a time."
  if (
    c.includes('notes for the doctor') &&
    (c.includes('optional') || c.includes('ready to pick a time'))
  ) {
    return true;
  }
  // Previous copy (pre-2026-04-18): "Got it! Any special notes for the doctor — like allergies,
  // medications, or preferences? (optional) Or just say Yes to continue." — still in conversation
  // history for conversations that started before the Task 04 rollout.
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
