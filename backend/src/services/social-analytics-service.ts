/**
 * Social analytics, phase 9.
 * Counts only. No patient name, phone, comment, or DM.
 * Logs counts only.
 */

import { getSupabaseAdminClient } from '../config/database';
import { logger } from '../config/logger';
import { averageViews, loadInstagramOverlay, type InstagramSection } from './social-insights-service';
import { InternalError, ValidationError } from '../utils/errors';
import { handleSupabaseError } from '../utils/db-helpers';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export type AnalyticsFormat = 'post' | 'reel' | 'story';

export type AnalyticsPostInput = {
  id: string;
  title: string;
  format: AnalyticsFormat | null;
  topic: string | null;
  caption: string;
  instagramUrl: string | null;
  postedAt: string;
  mediaId: string | null;
  thumbPath: string | null;
};

export type AnalyticsEnquiry = { id: string; createdAt: string };
export type AnalyticsAppointment = {
  id: string;
  createdAt: string;
  conversationId: string | null;
  status?: string;
};
export type AnalyticsLinkBooking = { cardId: string; bookedOn: string; appointmentId: string | null };
export type AnalyticsLead = { mediaId: string; conversationId: string | null; createdAt: string };

export type CountPair = { value: number; previous: number };

export type AnalyticsPostRow = {
  id: string;
  title: string;
  format: AnalyticsFormat | null;
  topic: string | null;
  date: string;
  day: string;
  bookings: number;
  enquiries: number;
  instagramUrl: string | null;
  thumbUrl: string | null;
  caption: string;
  views?: number | null;
  likes?: number | null;
  comments?: number | null;
  saves?: number | null;
};

export type SocialAnalytics = {
  range: { from: string; to: string };
  previous: { from: string; to: string };
  tiles: {
    enquiries: CountPair;
    bookings: CountPair;
    conversion: CountPair | null;
    posts: CountPair;
  };
  days: { date: string; posts: number; enquiries: number; bookings: number; views?: number | null }[];
  best: AnalyticsPostRow[];
  formats: { format: AnalyticsFormat; posts: number; bookings: number; views?: number | null }[];
  instagram: InstagramSection | null;
  topics: { topic: string; posts: number; bookings: number }[];
  rhythm: {
    weeks: { label: string; posts: number }[];
    usual: { weekday: string; hour: string } | null;
  };
  posts: AnalyticsPostRow[];
  sentence: SocialSentence | null;
};

export type SocialSentence = { text: string; title: string | null };

const FORMAT_PLURAL: Record<AnalyticsFormat, string> = {
  post: 'Posts',
  reel: 'Reels',
  story: 'Stories',
};

function countWord(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function compared(label: string, pair: CountPair): string {
  if (pair.value === pair.previous) return `${label} were ${pair.value}, the same as the previous period.`;
  if (pair.value > pair.previous) return `${label} were ${pair.value}, up from ${pair.previous}.`;
  return `${label} were ${pair.value}, down from ${pair.previous}.`;
}

function leader<T>(rows: T[], score: (row: T) => number, allowSingle: boolean): T | null {
  if (rows.length === 0) return null;
  if (rows.length === 1 && !allowSingle) return null;
  const ranked = [...rows].sort((a, b) => score(b) - score(a));
  const top = ranked[0];
  if (!top || score(top) <= 0) return null;
  const next = ranked[1];
  if (next && score(top) <= score(next)) return null;
  return top;
}

export function socialAnalyticsSentence(report: Pick<SocialAnalytics, 'tiles' | 'formats' | 'topics' | 'posts' | 'instagram'>): SocialSentence | null {
  if (report.tiles.posts.value === 0) return null;

  const topicBookings = leader(report.topics, (row) => row.bookings, true);
  if (topicBookings) {
    return {
      text: `${topicBookings.topic} brought ${countWord(topicBookings.bookings, 'booking', 'bookings')}.`,
      title: topicBookings.topic.trim().slice(0, 200),
    };
  }
  const formatBookings = leader(report.formats, (row) => row.bookings, false);
  if (formatBookings) {
    return {
      text: `${FORMAT_PLURAL[formatBookings.format]} brought ${countWord(formatBookings.bookings, 'booking', 'bookings')}.`,
      title: `Another ${formatBookings.format}`,
    };
  }

  const topicEnquiries = report.topics
    .map((row) => ({
      topic: row.topic,
      enquiries: report.posts
        .filter((post) => (post.topic?.trim() ?? '') === row.topic)
        .reduce((sum, post) => sum + post.enquiries, 0),
    }));
  const topicEnquiry = leader(topicEnquiries, (row) => row.enquiries, true);
  if (topicEnquiry) {
    return {
      text: `${topicEnquiry.topic} brought ${countWord(topicEnquiry.enquiries, 'enquiry', 'enquiries')}.`,
      title: topicEnquiry.topic.trim().slice(0, 200),
    };
  }
  const formatEnquiries = report.formats.map((row) => ({
    format: row.format,
    enquiries: report.posts.filter((post) => post.format === row.format).reduce((sum, post) => sum + post.enquiries, 0),
  }));
  const formatEnquiry = leader(formatEnquiries, (row) => row.enquiries, false);
  if (formatEnquiry) {
    return {
      text: `${FORMAT_PLURAL[formatEnquiry.format]} brought ${countWord(formatEnquiry.enquiries, 'enquiry', 'enquiries')}.`,
      title: `Another ${formatEnquiry.format}`,
    };
  }

  const measured = report.formats.filter((row) => row.views != null);
  const formatViews = leader(measured, (row) => row.views ?? 0, false);
  if (formatViews && formatViews.views != null) {
    return {
      text: `${FORMAT_PLURAL[formatViews.format]} averaged ${formatViews.views} views.`,
      title: `Another ${formatViews.format}`,
    };
  }

  const views = report.instagram?.tiles.views ?? null;
  if (views) {
    const missed =
      report.tiles.bookings.value === 0 && report.tiles.enquiries.value > 0
        ? ` ${report.tiles.enquiries.value === 1 ? '1 enquiry did not become a booking.' : `${report.tiles.enquiries.value} enquiries did not become a booking.`}`
        : '';
    return { text: `${compared('Views', views)}${missed}`, title: null };
  }
  if (report.tiles.enquiries.value > 0 || report.tiles.enquiries.previous > 0) {
    return { text: compared('Enquiries', report.tiles.enquiries), title: null };
  }
  if (report.tiles.bookings.value > 0 || report.tiles.bookings.previous > 0) {
    return { text: compared('Bookings', report.tiles.bookings), title: null };
  }
  return null;
}

type BuiltPost = AnalyticsPostRow & { postedAt: string };

export function ymdInZone(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}

function hourInZone(iso: string, timeZone: string): number {
  const hour = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso));
  return Number(hour);
}

function weekdayInZone(iso: string, timeZone: string): number {
  const name = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'long' }).format(new Date(iso));
  const index = WEEKDAYS.indexOf(name);
  return index < 0 ? 0 : index;
}

export function shiftYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function inclusiveDays(from: string, to: string): number {
  const [y1, m1, d1] = from.split('-').map(Number);
  const [y2, m2, d2] = to.split('-').map(Number);
  const a = Date.UTC(y1 ?? 1970, (m1 ?? 1) - 1, d1 ?? 1);
  const b = Date.UTC(y2 ?? 1970, (m2 ?? 1) - 1, d2 ?? 1);
  return Math.round((b - a) / 86400000) + 1;
}

export function previousRange(from: string, to: string): { from: string; to: string } {
  const span = inclusiveDays(from, to);
  const prevTo = shiftYmd(from, -1);
  return { from: shiftYmd(prevTo, -(span - 1)), to: prevTo };
}

function inRange(ymd: string, from: string, to: string): boolean {
  return ymd >= from && ymd <= to;
}

function eachDay(from: string, to: string): string[] {
  const days: string[] = [];
  let cursor = from;
  const guard = inclusiveDays(from, to);
  for (let i = 0; i < guard; i += 1) {
    days.push(cursor);
    cursor = shiftYmd(cursor, 1);
  }
  return days;
}

function dayLabel(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const utc = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1, 12));
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(utc);
}

function shortLabel(ymd: string): string {
  const [, m, d] = ymd.split('-').map(Number);
  return `${d} ${MONTHS[(m ?? 1) - 1]}`;
}

function hourLabel(hour: number): string {
  const suffix = hour >= 12 ? 'pm' : 'am';
  const clock = hour % 12 === 0 ? 12 : hour % 12;
  return `${clock} ${suffix}`;
}

function mode(values: number[]): number {
  const counts = new Map<number, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  let best = values[0] ?? 0;
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

function captionLine(words: unknown): string {
  if (!words || typeof words !== 'object') return '';
  const raw = (words as { caption?: unknown }).caption;
  if (typeof raw !== 'string') return '';
  return raw.split('\n').map((part) => part.trim()).find(Boolean) ?? '';
}

function startOfWeekYmd(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
  dt.setUTCDate(dt.getUTCDate() - dt.getUTCDay());
  return dt.toISOString().slice(0, 10);
}

type WindowCount = {
  enquiries: number;
  bookings: number;
  postBookings: Map<string, number>;
  postEnquiries: Map<string, number>;
  chatIds: Set<string>;
  chatByDay: Map<string, Set<string>>;
};

function windowCount(
  input: {
    enquiries: AnalyticsEnquiry[];
    appointments: AnalyticsAppointment[];
    linkBookings: AnalyticsLinkBooking[];
    leads: AnalyticsLead[];
    posts: AnalyticsPostInput[];
    instagramConversationIds: Set<string>;
  },
  from: string,
  to: string,
  timeZone: string
): WindowCount {
  const enquiryIds = new Set<string>();
  for (const row of input.enquiries) {
    if (inRange(ymdInZone(row.createdAt, timeZone), from, to)) enquiryIds.add(row.id);
  }

  const chatIds = new Set<string>();
  const chatByDay = new Map<string, Set<string>>();
  for (const row of input.appointments) {
    if (row.status === 'cancelled') continue;
    if (!row.conversationId || !input.instagramConversationIds.has(row.conversationId)) continue;
    const day = ymdInZone(row.createdAt, timeZone);
    if (!inRange(day, from, to)) continue;
    chatIds.add(row.id);
    const onDay = chatByDay.get(day) ?? new Set<string>();
    onDay.add(row.id);
    chatByDay.set(day, onDay);
  }

  const bookingIds = new Set(chatIds);
  let anonymous = 0;
  const postAppointments = new Map<string, Set<string>>();
  const postAnonymous = new Map<string, number>();
  const claim = (cardId: string, appointmentId: string | null): void => {
    if (appointmentId) {
      const held = postAppointments.get(cardId) ?? new Set<string>();
      held.add(appointmentId);
      postAppointments.set(cardId, held);
      return;
    }
    postAnonymous.set(cardId, (postAnonymous.get(cardId) ?? 0) + 1);
  };
  const claimed = new Set<string>();

  for (const row of input.linkBookings) {
    if (!inRange(row.bookedOn, from, to)) continue;
    if (row.appointmentId) {
      bookingIds.add(row.appointmentId);
      claimed.add(row.appointmentId);
    } else {
      anonymous += 1;
    }
    claim(row.cardId, row.appointmentId);
  }

  const mediaToCard = new Map<string, string>();
  for (const post of input.posts) {
    if (post.mediaId) mediaToCard.set(post.mediaId, post.id);
  }
  const conversationToCard = new Map<string, string>();
  const postEnquiryConversations = new Map<string, Set<string>>();
  for (const lead of input.leads) {
    const cardId = mediaToCard.get(lead.mediaId);
    if (!cardId || !lead.conversationId) continue;
    conversationToCard.set(lead.conversationId, cardId);
    if (!inRange(ymdInZone(lead.createdAt, timeZone), from, to)) continue;
    const seen = postEnquiryConversations.get(cardId) ?? new Set<string>();
    seen.add(lead.conversationId);
    postEnquiryConversations.set(cardId, seen);
  }

  for (const row of input.appointments) {
    if (!chatIds.has(row.id) || !row.conversationId || claimed.has(row.id)) continue;
    const cardId = conversationToCard.get(row.conversationId);
    if (!cardId) continue;
    claim(cardId, row.id);
  }

  const postBookings = new Map<string, number>();
  const cardIds = new Set([...postAppointments.keys(), ...postAnonymous.keys()]);
  for (const cardId of cardIds) {
    postBookings.set(cardId, (postAppointments.get(cardId)?.size ?? 0) + (postAnonymous.get(cardId) ?? 0));
  }
  const postEnquiries = new Map<string, number>();
  for (const [cardId, conversations] of postEnquiryConversations) {
    postEnquiries.set(cardId, conversations.size);
  }

  return {
    enquiries: enquiryIds.size,
    bookings: bookingIds.size + anonymous,
    postBookings,
    postEnquiries,
    chatIds,
    chatByDay,
  };
}

function bookingsOnDay(
  date: string,
  linkBookings: AnalyticsLinkBooking[],
  chatIds: Set<string>,
  chatByDay: Map<string, Set<string>>,
  placed: Set<string>
): number {
  const ids = new Set(chatByDay.get(date) ?? []);
  for (const id of ids) placed.add(id);
  let extra = 0;
  for (const row of linkBookings) {
    if (row.bookedOn !== date) continue;
    if (row.appointmentId && (chatIds.has(row.appointmentId) || placed.has(row.appointmentId))) continue;
    if (row.appointmentId) {
      ids.add(row.appointmentId);
      placed.add(row.appointmentId);
    } else {
      extra += 1;
    }
  }
  return ids.size + extra;
}

function strip(post: BuiltPost): AnalyticsPostRow {
  return {
    id: post.id,
    title: post.title,
    format: post.format,
    topic: post.topic,
    date: post.date,
    day: post.day,
    bookings: post.bookings,
    enquiries: post.enquiries,
    instagramUrl: post.instagramUrl,
    thumbUrl: post.thumbUrl,
    caption: post.caption,
  };
}

export function aggregateSocialAnalytics(input: {
  from: string;
  to: string;
  timeZone: string;
  nowYmd: string;
  posts: AnalyticsPostInput[];
  enquiries: AnalyticsEnquiry[];
  appointments: AnalyticsAppointment[];
  linkBookings: AnalyticsLinkBooking[];
  leads: AnalyticsLead[];
  instagramConversationIds: string[];
}): SocialAnalytics {
  if (input.from > input.to) throw new ValidationError('The period is backwards');
  if (inclusiveDays(input.from, input.to) > 90) throw new ValidationError('Choose 7, 30, or 90 days');
  const timeZone = input.timeZone || 'Asia/Kolkata';
  const previous = previousRange(input.from, input.to);
  const shared = {
    enquiries: input.enquiries,
    appointments: input.appointments,
    linkBookings: input.linkBookings,
    leads: input.leads,
    posts: input.posts,
    instagramConversationIds: new Set(input.instagramConversationIds),
  };
  const current = windowCount(shared, input.from, input.to, timeZone);
  const prior = windowCount(shared, previous.from, previous.to, timeZone);

  const postedOn = (from: string, to: string): AnalyticsPostInput[] =>
    input.posts.filter((post) => inRange(ymdInZone(post.postedAt, timeZone), from, to));
  const currentPosts = postedOn(input.from, input.to);
  const previousPosts = postedOn(previous.from, previous.to);

  const rate = (bookings: number, enquiries: number): number | null => {
    if (enquiries <= 0) return null;
    return Math.round((bookings / enquiries) * 100);
  };
  const currentRate = rate(current.bookings, current.enquiries);
  const previousRate = rate(prior.bookings, prior.enquiries);

  const built: BuiltPost[] = currentPosts.map((post) => {
    const date = ymdInZone(post.postedAt, timeZone);
    return {
      id: post.id,
      title: post.title,
      format: post.format,
      topic: post.topic,
      date,
      day: dayLabel(date),
      bookings: current.postBookings.get(post.id) ?? 0,
      enquiries: current.postEnquiries.get(post.id) ?? 0,
      instagramUrl: post.instagramUrl,
      thumbUrl: null,
      caption: post.caption,
      postedAt: post.postedAt,
    };
  });
  built.sort((a, b) => b.postedAt.localeCompare(a.postedAt));

  const placed = new Set<string>();
  const days = eachDay(input.from, input.to).map((date) => ({
    date,
    posts: built.filter((post) => post.date === date).length,
    enquiries: input.enquiries.filter((row) => ymdInZone(row.createdAt, timeZone) === date).length,
    bookings: bookingsOnDay(date, input.linkBookings, current.chatIds, current.chatByDay, placed),
  }));

  const best = [...built]
    .filter((post) => post.bookings > 0 || post.enquiries > 0)
    .sort((a, b) => b.bookings - a.bookings || b.enquiries - a.enquiries || b.postedAt.localeCompare(a.postedAt))
    .slice(0, 3)
    .map(strip);

  const formats: SocialAnalytics['formats'] = [];
  for (const format of ['post', 'reel', 'story'] as const) {
    const rows = built.filter((post) => post.format === format);
    if (rows.length === 0) continue;
    formats.push({
      format,
      posts: rows.length,
      bookings: rows.reduce((sum, post) => sum + post.bookings, 0),
    });
  }

  const topicMap = new Map<string, { posts: number; bookings: number }>();
  for (const post of built) {
    const topic = post.topic?.trim() ?? '';
    if (!topic) continue;
    const found = topicMap.get(topic) ?? { posts: 0, bookings: 0 };
    found.posts += 1;
    found.bookings += post.bookings;
    topicMap.set(topic, found);
  }
  const topics = [...topicMap.entries()]
    .map(([topic, row]) => ({ topic, posts: row.posts, bookings: row.bookings }))
    .sort((a, b) => b.bookings - a.bookings || a.topic.localeCompare(b.topic));

  const weekStart = startOfWeekYmd(input.nowYmd);
  const weeks = [];
  for (let i = 7; i >= 0; i -= 1) {
    const start = shiftYmd(weekStart, -7 * i);
    const end = shiftYmd(start, 6);
    const posts = input.posts.filter((post) => {
      const ymd = ymdInZone(post.postedAt, timeZone);
      return ymd >= start && ymd <= end;
    }).length;
    weeks.push({ label: shortLabel(start), posts });
  }

  const recent = input.posts.filter((post) => {
    const ymd = ymdInZone(post.postedAt, timeZone);
    return ymd >= shiftYmd(weekStart, -7 * 7) && ymd <= shiftYmd(weekStart, 6);
  });
  const usual =
    recent.length >= 4
      ? {
          weekday: WEEKDAYS[mode(recent.map((post) => weekdayInZone(post.postedAt, timeZone)))] ?? 'Sunday',
          hour: hourLabel(mode(recent.map((post) => hourInZone(post.postedAt, timeZone)))),
        }
      : null;

  const report: SocialAnalytics = {
    range: { from: input.from, to: input.to },
    previous,
    tiles: {
      enquiries: { value: current.enquiries, previous: prior.enquiries },
      bookings: { value: current.bookings, previous: prior.bookings },
      conversion: currentRate === null ? null : { value: currentRate, previous: previousRate ?? 0 },
      posts: { value: currentPosts.length, previous: previousPosts.length },
    },
    days,
    best,
    formats,
    topics,
    rhythm: { weeks, usual },
    posts: built.map(strip),
    instagram: null,
    sentence: null,
  };
  report.sentence = socialAnalyticsSentence(report);
  return report;
}

function missingStore(error: { code?: string }): boolean {
  return error.code === 'PGRST204' || error.code === 'PGRST205' || error.code === '42P01' || error.code === '42703';
}

function padBound(ymd: string, days: number): string {
  return `${shiftYmd(ymd, days)}T00:00:00.000Z`;
}

export async function readSocialAnalytics(
  doctorId: string,
  from: string,
  to: string,
  correlationId: string
): Promise<SocialAnalytics> {
  if (from > to) throw new ValidationError('The period is backwards');
  const admin = getSupabaseAdminClient();
  if (!admin) throw new InternalError('Service role client not available');
  const previous = previousRange(from, to);
  const lower = padBound(previous.from, -2);
  const upper = padBound(to, 3);

  const [zoneRow, cardQuery, conversations, appointments, bookings, leads, overlay] = await Promise.all([
    admin.from('doctor_settings').select('timezone').eq('doctor_id', doctorId).maybeSingle(),
    admin
      .from('social_cards')
      .select(
        'id, title, format, topic, words, scheduled_at, updated_at, instagram_url, instagram_media_id, thumb_path, stage, deleted_at'
      )
      .eq('doctor_id', doctorId)
      .eq('stage', 'posted')
      .is('deleted_at', null),
    admin.from('conversations').select('id, created_at').eq('doctor_id', doctorId).eq('platform', 'instagram'),
    admin
      .from('appointments')
      .select('id, created_at, conversation_id, status')
      .eq('doctor_id', doctorId)
      .gte('created_at', lower)
      .lt('created_at', upper),
    admin
      .from('social_card_link_bookings')
      .select('card_id, booked_on, appointment_id')
      .eq('doctor_id', doctorId)
      .gte('booked_on', previous.from)
      .lte('booked_on', to),
    admin
      .from('comment_leads')
      .select('media_id, conversation_id, created_at')
      .eq('doctor_id', doctorId)
      .eq('platform', 'instagram')
      .order('created_at', { ascending: false })
      .limit(2000),
    loadInstagramOverlay(doctorId, from, to),
  ]);
  const timeZone =
    !zoneRow.error && typeof (zoneRow.data as { timezone?: unknown } | null)?.timezone === 'string'
      ? ((zoneRow.data as { timezone: string }).timezone.trim() || 'Asia/Kolkata')
      : 'Asia/Kolkata';

  let cardRows = cardQuery.data as Record<string, unknown>[] | null;
  if (cardQuery.error && missingStore(cardQuery.error)) {
    const again = await admin
      .from('social_cards')
      .select('id, title, format, topic, words, scheduled_at, updated_at, instagram_url, stage, deleted_at')
      .eq('doctor_id', doctorId)
      .eq('stage', 'posted')
      .is('deleted_at', null);
    if (again.error) handleSupabaseError(again.error, correlationId);
    cardRows = again.data as Record<string, unknown>[] | null;
  } else if (cardQuery.error) {
    handleSupabaseError(cardQuery.error, correlationId);
  }

  if (conversations.error) handleSupabaseError(conversations.error, correlationId);
  if (appointments.error) handleSupabaseError(appointments.error, correlationId);
  const linkRows = bookings.error && missingStore(bookings.error) ? [] : bookings.data;
  if (bookings.error && !missingStore(bookings.error)) handleSupabaseError(bookings.error, correlationId);
  const leadRows = leads.error ? [] : leads.data;
  if (leads.error && !missingStore(leads.error)) {
    logger.warn({ correlationId, errorCode: leads.error.code }, 'social analytics: leads skipped');
  }

  const posts: AnalyticsPostInput[] = ((cardRows ?? []) as Record<string, unknown>[]).map((row) => ({
    id: String(row.id),
    title: typeof row.title === 'string' ? row.title : '',
    format: row.format === 'post' || row.format === 'reel' || row.format === 'story' ? row.format : null,
    topic: typeof row.topic === 'string' ? row.topic : null,
    caption: captionLine(row.words),
    instagramUrl: typeof row.instagram_url === 'string' ? row.instagram_url : null,
    postedAt: typeof row.scheduled_at === 'string' ? row.scheduled_at : String(row.updated_at ?? ''),
    mediaId: typeof row.instagram_media_id === 'string' ? row.instagram_media_id : null,
    thumbPath: typeof row.thumb_path === 'string' ? row.thumb_path : null,
  }));

  const conversationRows = (conversations.data ?? []) as { id: string; created_at: string }[];
  const result = aggregateSocialAnalytics({
    from,
    to,
    timeZone,
    nowYmd: ymdInZone(new Date().toISOString(), timeZone),
    posts,
    enquiries: conversationRows.map((row) => ({ id: row.id, createdAt: row.created_at })),
    appointments: (
      (appointments.data ?? []) as {
        id: string;
        created_at: string;
        conversation_id: string | null;
        status: string;
      }[]
    ).map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      conversationId: row.conversation_id,
      status: row.status,
    })),
    linkBookings: ((linkRows ?? []) as { card_id: string; booked_on: string; appointment_id: string | null }[]).map(
      (row) => ({ cardId: row.card_id, bookedOn: String(row.booked_on).slice(0, 10), appointmentId: row.appointment_id })
    ),
    leads: ((leadRows ?? []) as { media_id: string | null; conversation_id: string | null; created_at: string }[])
      .filter((row) => typeof row.media_id === 'string' && row.media_id)
      .map((row) => ({
        mediaId: row.media_id as string,
        conversationId: row.conversation_id,
        createdAt: row.created_at,
      })),
    instagramConversationIds: conversationRows.map((row) => row.id),
  });

  const thumbs = new Map<string, string>();
  await Promise.all(
    posts.map(async (post) => {
      if (!post.thumbPath) return;
      try {
        const signed = await admin.storage.from('social-card-files').createSignedUrl(post.thumbPath, 60 * 60);
        if (signed.data?.signedUrl) thumbs.set(post.id, signed.data.signedUrl);
      } catch {
        // The row still shows. The picture is optional.
      }
    })
  );
  const withThumbs = (row: AnalyticsPostRow): AnalyticsPostRow => ({
    ...row,
    thumbUrl: thumbs.get(row.id) ?? null,
  });
  result.posts = result.posts.map(withThumbs);
  result.best = result.best.map(withThumbs);

  result.instagram = overlay.instagram;
  if (overlay.instagram) {
    result.days = result.days.map((day) => ({ ...day, views: overlay.dayViews.get(day.date) ?? null }));
    result.posts = result.posts.map((row) => {
      const stats = overlay.byCard.get(row.id);
      return stats ? { ...row, ...stats } : row;
    });
    result.best = [...result.posts]
      .filter((post) => post.bookings > 0 || post.enquiries > 0 || (post.views ?? 0) > 0)
      .sort(
        (a, b) =>
          b.bookings - a.bookings ||
          b.enquiries - a.enquiries ||
          (b.views ?? -1) - (a.views ?? -1) ||
          b.date.localeCompare(a.date)
      )
      .slice(0, 3);
    result.formats = result.formats.map((row) => ({
      ...row,
      views: averageViews(result.posts.filter((post) => post.format === row.format).map((post) => post.views ?? null)),
    }));
  }
  result.sentence = socialAnalyticsSentence(result);

  logger.info(
    {
      correlationId,
      posts: result.tiles.posts.value,
      enquiries: result.tiles.enquiries.value,
      bookings: result.tiles.bookings.value,
    },
    'social analytics: read'
  );
  return result;
}
