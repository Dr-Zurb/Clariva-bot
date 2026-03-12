/**
 * Date/Time Parser for Natural Language Slot Selection (e-task-2)
 *
 * Parses user messages like "Tuesday 2pm", "Mar 14 at 10am", "tomorrow 3pm"
 * into { date: 'YYYY-MM-DD', time: 'HH:MM' }.
 * Uses regex for common patterns; returns null when unclear.
 */

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTH_NAMES = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];
const MONTH_ABBREV = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

export interface ParsedDateTime {
  date: string; // YYYY-MM-DD
  time: string; // HH:MM (24h)
}

/**
 * Parse time from text: "2pm", "14:00", "2:30 pm", "10am".
 * Returns HH:MM in 24h or null.
 */
function parseTimeFromText(text: string): string | null {
  const t = text.trim().toLowerCase();
  // 24h: 14:00, 14:30, 9:00
  const h24 = /(\d{1,2}):(\d{2})\s*(am|pm)?/i.exec(t);
  if (h24) {
    let h = parseInt(h24[1]!, 10);
    const m = parseInt(h24[2]!, 10);
    const ampm = h24[3]?.toLowerCase();
    if (ampm === 'pm' && h < 12) h += 12;
    if (ampm === 'am' && h === 12) h = 0;
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
  }
  // 12h: 2pm, 10am, 2:30 pm
  const h12 = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i.exec(t);
  if (h12) {
    let h = parseInt(h12[1]!, 10);
    const m = parseInt(h12[2] ?? '0', 10);
    const ampm = h12[3]!.toLowerCase();
    if (ampm === 'pm' && h < 12) h += 12;
    if (ampm === 'am' && h === 12) h = 0;
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
  }
  return null;
}

/**
 * Get next occurrence of dayOfWeek (0=Sun) on or after refDate.
 */
function nextDayOfWeek(refDate: Date, dayOfWeek: number): Date {
  const d = new Date(refDate);
  const current = d.getDay();
  let diff = dayOfWeek - current;
  if (diff <= 0) diff += 7;
  d.setDate(d.getDate() + diff);
  return d;
}

/**
 * Parse date/time from user message.
 * @param text - User message (e.g. "Tuesday 2pm", "Mar 14 at 10am")
 * @param todayStr - Reference date YYYY-MM-DD
 * @returns Parsed { date, time } or null if unclear
 */
export function parseDateTimeFromMessage(
  text: string,
  todayStr: string
): ParsedDateTime | null {
  const trimmed = (text ?? '').trim().toLowerCase();
  if (!trimmed || trimmed.length > 100) return null;

  const today = new Date(todayStr + 'T12:00:00Z');
  const year = today.getUTCFullYear();

  let resolvedDate: Date | null = null;
  let resolvedTime: string | null = null;

  // Try to extract time first (often at end)
  const timePatterns = [
    /\b(\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/i,
    /\b(\d{1,2}:\d{2})\s*(?:am|pm)?\b/i,
    /\bat\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/i,
  ];
  let timeMatch: RegExpMatchArray | null = null;
  for (const re of timePatterns) {
    const m = trimmed.match(re);
    if (m) {
      timeMatch = m;
      resolvedTime = parseTimeFromText(m[1]!);
      break;
    }
  }

  // "tomorrow" or "tomorrow 2pm"
  if (/\btomorrow\b/.test(trimmed)) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() + 1);
    resolvedDate = d;
    if (!resolvedTime && timeMatch) resolvedTime = parseTimeFromText(timeMatch[1]!);
    if (!resolvedTime) resolvedTime = '09:00';
    if (resolvedDate) {
      return {
        date: resolvedDate.toISOString().slice(0, 10),
        time: resolvedTime,
      };
    }
  }

  // Day name: "Tuesday", "Tuesday 2pm", "on Tuesday at 2pm"
  for (let i = 0; i < DAY_NAMES.length; i++) {
    const re = new RegExp(`\\b${DAY_NAMES[i]}\\b`, 'i');
    if (re.test(trimmed)) {
      resolvedDate = nextDayOfWeek(today, i);
      if (!resolvedTime && timeMatch) resolvedTime = parseTimeFromText(timeMatch[1]!);
      if (resolvedDate && resolvedTime) {
        return {
          date: resolvedDate.toISOString().slice(0, 10),
          time: resolvedTime,
        };
      }
      if (resolvedDate && !resolvedTime) {
        // Date only - use 9am as default for "Tuesday" without time
        return {
          date: resolvedDate.toISOString().slice(0, 10),
          time: '09:00',
        };
      }
    }
  }

  // "Mar 14", "14 Mar", "March 14", "14 March", "Mar 14 2026"
  const datePatterns = [
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:\s*,?\s*(\d{4}))?\b/i,
    /\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?(?:\s+(\d{4}))?\b/i,
    /\b(\d{4})-(\d{2})-(\d{2})\b/,
  ];
  for (const re of datePatterns) {
    const m = trimmed.match(re);
    if (m) {
      let month: number;
      let day: number;
      let y = year;
      if (m[0]!.match(/^\d{4}-\d{2}-\d{2}$/)) {
        y = parseInt(m[1]!, 10);
        month = parseInt(m[2]!, 10) - 1;
        day = parseInt(m[3]!, 10);
      } else if (m[1]!.length <= 3 && /^[a-z]/i.test(m[1]!)) {
        month = MONTH_ABBREV.findIndex((mo) => mo.startsWith(m[1]!.toLowerCase().slice(0, 3)));
        if (month < 0) month = MONTH_NAMES.findIndex((mo) => mo.startsWith(m[1]!.toLowerCase()));
        day = parseInt(m[2]!, 10);
        if (m[3]) y = parseInt(m[3]!, 10);
      } else {
        day = parseInt(m[1]!, 10);
        month = MONTH_ABBREV.findIndex((mo) => mo.startsWith(m[2]!.toLowerCase().slice(0, 3)));
        if (month < 0) month = MONTH_NAMES.findIndex((mo) => mo.startsWith(m[2]!.toLowerCase()));
        if (m[3]) y = parseInt(m[3]!, 10);
      }
      if (month >= 0 && month <= 11 && day >= 1 && day <= 31) {
        const d = new Date(Date.UTC(y, month, day));
        resolvedDate = d;
        if (!resolvedTime && timeMatch) resolvedTime = parseTimeFromText(timeMatch[1]!);
        if (!resolvedTime) resolvedTime = '09:00';
        if (resolvedDate && resolvedTime) {
          return {
            date: resolvedDate.toISOString().slice(0, 10),
            time: resolvedTime,
          };
        }
      }
      break;
    }
  }

  // "next week Tuesday" - not implemented for now
  return null;
}
