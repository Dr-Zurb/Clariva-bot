/**
 * Turn weekly availability blocks into a short timings line.
 * Mixed visit types or mixed days stay off the chat and use the booking page.
 */

export type AvailabilityVisitType = 'in_clinic' | 'video' | 'voice' | 'text';

export interface AvailabilityTimingBlock {
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_available?: boolean;
  in_clinic?: boolean | null;
  video?: boolean | null;
  voice?: boolean | null;
  text?: boolean | null;
}

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

function minutesOf(time: string): number {
  const parts = time.split(':');
  const h = parseInt(parts[0] || '0', 10);
  const m = parseInt(parts[1] || '0', 10);
  return h * 60 + m;
}

function formatClock(totalMinutes: number): string {
  const h24 = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  const suffix = h24 >= 12 ? 'pm' : 'am';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

function typeKey(block: AvailabilityTimingBlock): string {
  const flags: AvailabilityVisitType[] = [];
  if (block.in_clinic !== false) flags.push('in_clinic');
  if (block.video !== false) flags.push('video');
  if (block.voice !== false) flags.push('voice');
  if (block.text !== false) flags.push('text');
  return flags.join(',');
}

function daySpan(days: number[]): string {
  const ordered = DAY_ORDER.filter((day) => days.includes(day));
  if (ordered.length === 0) return '';
  const runs: number[][] = [];
  for (const day of ordered) {
    const last = runs[runs.length - 1];
    const prev = last?.[last.length - 1];
    const prevIndex = prev === undefined ? -2 : DAY_ORDER.indexOf(prev as (typeof DAY_ORDER)[number]);
    const thisIndex = DAY_ORDER.indexOf(day as (typeof DAY_ORDER)[number]);
    if (last && thisIndex === prevIndex + 1) last.push(day);
    else runs.push([day]);
  }
  return runs
    .map((run) => {
      const first = DAY_SHORT[run[0]!] ?? '';
      const last = DAY_SHORT[run[run.length - 1]!] ?? '';
      return run.length >= 3 ? `${first}–${last}` : run.map((day) => DAY_SHORT[day]).join(', ');
    })
    .join(', ');
}

export type WeeklyTimingsLine =
  | { kind: 'quote'; text: string }
  | { kind: 'page' }
  | { kind: 'missing' };

/**
 * One line when every working day has the same hours and every block has the
 * same visit types. Otherwise the booking page is the timings answer.
 */
export function formatWeeklyTimingsLine(rows: AvailabilityTimingBlock[]): WeeklyTimingsLine {
  const open = rows.filter((row) => row.is_available !== false);
  if (open.length === 0) return { kind: 'missing' };

  const firstTypes = typeKey(open[0]!);
  if (open.some((row) => typeKey(row) !== firstTypes)) return { kind: 'page' };

  const byDay = new Map<number, string>();
  for (const row of open) {
    const range = `${minutesOf(row.start_time)}-${minutesOf(row.end_time)}`;
    const prev = byDay.get(row.day_of_week);
    byDay.set(row.day_of_week, prev ? `${prev}|${range}` : range);
  }

  const signatures = [...byDay.values()].map((value) =>
    value
      .split('|')
      .sort()
      .join('|')
  );
  if (new Set(signatures).size !== 1) return { kind: 'page' };

  const ranges = signatures[0]!
    .split('|')
    .map((pair) => {
      const [start, end] = pair.split('-').map((n) => parseInt(n, 10));
      return `${formatClock(start!)}–${formatClock(end!)}`;
    })
    .join(', ');

  return { kind: 'quote', text: `${daySpan([...byDay.keys()])} ${ranges}` };
}
