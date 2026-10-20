/**
 * Instagram post numbers, phase 10.
 * The tab reads stored rows. This job is the only caller of Instagram.
 * Logs counts and a status code. Never a token, a post address, a caption, or a patient field.
 */

import axios from 'axios';
import { getSupabaseAdminClient } from '../config/database';
import { logger } from '../config/logger';
import { getDoctorTimezone } from './doctor-settings-service';

const GRAPH = 'https://graph.instagram.com/v21.0';
const HOUR_MS = 60 * 60 * 1000;
const MEDIA_CAP = 15;
const MEDIA_PAGES = 4;

export type InsightFormat = 'post' | 'reel' | 'story';

export type CountPair = { value: number; previous: number };

export type InstagramSection = {
  tiles: {
    views: CountPair | null;
    reach: CountPair | null;
    interactions: CountPair | null;
    followers: CountPair | null;
  };
};

export type CardNumbers = {
  views: number | null;
  likes: number | null;
  comments: number | null;
  saves: number | null;
};

export type AccountDay = {
  day: string;
  followers: number | null;
  views: number | null;
};

export type ReachRow = {
  span: number;
  reach: number | null;
  previousReach: number | null;
  interactions: number | null;
  previousInteractions: number | null;
  views?: number | null;
  previousViews?: number | null;
};

export function metricsFor(format: InsightFormat | null): string[] {
  if (format === 'story') return ['views', 'reach', 'shares'];
  if (format === 'reel') {
    return ['views', 'reach', 'likes', 'comments', 'saved', 'shares', 'ig_reels_avg_watch_time'];
  }
  return ['views', 'reach', 'likes', 'comments', 'saved', 'shares'];
}

export function normalizeInstagramUrl(url: string): string {
  try {
    const parsed = new URL(url.trim());
    const path = parsed.pathname.replace(/\/+$/, '').toLowerCase();
    if (!path) return '';
    return `https://www.instagram.com${path}`;
  } catch {
    return '';
  }
}

export function insightsPermissionDenied(code: number | undefined, message: string | undefined): boolean {
  if (code === 190 || code === 200) return true;
  if (code === 10 && typeof message === 'string' && /permission/i.test(message)) return true;
  return false;
}

export function dueForRefresh(input: {
  format: InsightFormat | null;
  postedAt: string;
  measuredAt: string | null;
  now: string;
}): boolean {
  const age = Date.parse(input.now) - Date.parse(input.postedAt);
  if (!Number.isFinite(age) || age < 0) return false;
  const sinceMeasure = input.measuredAt ? Date.parse(input.now) - Date.parse(input.measuredAt) : Number.POSITIVE_INFINITY;
  if (input.format === 'story') {
    if (age > 24 * HOUR_MS) return false;
    return sinceMeasure >= HOUR_MS;
  }
  if (age > 90 * 24 * HOUR_MS) return false;
  if (age < 48 * HOUR_MS) return sinceMeasure >= 6 * HOUR_MS;
  return sinceMeasure >= 24 * HOUR_MS;
}

function shiftYmd(ymd: string, days: number): string {
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

function spanFor(from: string, to: string): 7 | 30 | 90 | null {
  const span = inclusiveDays(from, to);
  if (span === 7 || span === 30 || span === 90) return span;
  return null;
}

function previousFrom(from: string, to: string): string {
  const span = inclusiveDays(from, to);
  return shiftYmd(from, -span);
}

function sumViews(days: AccountDay[], from: string, to: string): number | null {
  let total = 0;
  let seen = false;
  for (const row of days) {
    if (row.day < from || row.day > to) continue;
    if (row.views == null) continue;
    total += row.views;
    seen = true;
  }
  return seen ? total : null;
}

function followersOn(days: AccountDay[], day: string): number | null {
  const row = days.find((item) => item.day === day);
  return row?.followers ?? null;
}

function gained(days: AccountDay[], from: string, to: string): number | null {
  const end = followersOn(days, to);
  const start = followersOn(days, shiftYmd(from, -1));
  if (end == null || start == null) return null;
  return end - start;
}

function pair(value: number | null, previous: number | null): CountPair | null {
  if (value == null || previous == null) return null;
  return { value, previous };
}

export function dayViews(days: AccountDay[], from: string, to: string): Map<string, number | null> {
  const map = new Map<string, number | null>();
  for (const row of days) {
    if (row.day < from || row.day > to) continue;
    map.set(row.day, row.views);
  }
  return map;
}

export function averageViews(values: Array<number | null>): number | null {
  const known = values.filter((value): value is number => value != null);
  if (known.length === 0) return null;
  return Math.round(known.reduce((sum, value) => sum + value, 0) / known.length);
}

export function buildInstagramOverlay(input: {
  status: string | null;
  from: string;
  to: string;
  accountDays: AccountDay[];
  reachRows: ReachRow[];
  stats: { cardId: string; views: number | null; likes: number | null; comments: number | null; saves: number | null }[];
}): { instagram: InstagramSection | null; byCard: Map<string, CardNumbers> } {
  const byCard = new Map<string, CardNumbers>();
  if (input.status !== 'ready') return { instagram: null, byCard };
  for (const row of input.stats) {
    byCard.set(row.cardId, {
      views: row.views,
      likes: row.likes,
      comments: row.comments,
      saves: row.saves,
    });
  }
  const span = spanFor(input.from, input.to);
  const reach = span == null ? undefined : input.reachRows.find((row) => row.span === span);
  const prevStart = previousFrom(input.from, input.to);
  const prevEnd = shiftYmd(input.from, -1);
  const periodViews =
    reach && reach.views != null && reach.previousViews != null ? pair(reach.views, reach.previousViews) : null;
  const tiles = {
    views:
      periodViews ??
      pair(sumViews(input.accountDays, input.from, input.to), sumViews(input.accountDays, prevStart, prevEnd)),
    reach: reach ? pair(reach.reach, reach.previousReach) : null,
    interactions: reach ? pair(reach.interactions, reach.previousInteractions) : null,
    followers: pair(gained(input.accountDays, input.from, input.to), gained(input.accountDays, prevStart, prevEnd)),
  };
  const anyTile = tiles.views || tiles.reach || tiles.interactions || tiles.followers;
  const anyPost = input.stats.some(
    (row) => row.views != null || row.likes != null || row.comments != null || row.saves != null
  );
  if (!anyTile && !anyPost) return { instagram: null, byCard: new Map() };
  return { instagram: { tiles }, byCard };
}

function ymdInZone(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}

function missingStore(error: { code?: string }): boolean {
  return error.code === 'PGRST204' || error.code === 'PGRST205' || error.code === '42P01' || error.code === '42703';
}

type GraphFailure = { status?: number; code?: number; message?: string };

function graphFailure(err: unknown): GraphFailure {
  if (!axios.isAxiosError(err)) return {};
  const body = err.response?.data as { error?: { code?: unknown; message?: unknown } } | undefined;
  const code = body?.error?.code;
  const message = body?.error?.message;
  return {
    status: err.response?.status,
    code: typeof code === 'number' ? code : undefined,
    message: typeof message === 'string' ? message : undefined,
  };
}

async function graphGet(
  path: string,
  token: string,
  params: Record<string, string | number>
): Promise<{ data?: unknown; denied: boolean; failure: GraphFailure }> {
  try {
    const absolute = path.startsWith('http');
    const response = await axios.get(absolute ? path : `${GRAPH}/${path}`, {
      params: absolute ? undefined : { ...params, access_token: token },
      timeout: 15000,
    });
    return { data: response.data, denied: false, failure: {} };
  } catch (err: unknown) {
    const failure = graphFailure(err);
    return { data: undefined, denied: insightsPermissionDenied(failure.code, failure.message), failure };
  }
}

function metricValue(entry: { values?: { value?: unknown }[]; total_value?: { value?: unknown } }): number | null {
  const total = entry.total_value?.value;
  if (typeof total === 'number') return total;
  const first = entry.values?.[0]?.value;
  return typeof first === 'number' ? first : null;
}

function seriesPoints(
  body: unknown,
  timeZone: string
): { name: string; day: string; value: number }[] {
  const data = (body as { data?: unknown } | undefined)?.data;
  if (!Array.isArray(data)) return [];
  const points: { name: string; day: string; value: number }[] = [];
  for (const entry of data) {
    if (!entry || typeof entry !== 'object') continue;
    const name = (entry as { name?: unknown }).name;
    const values = (entry as { values?: unknown }).values;
    if (typeof name !== 'string' || !Array.isArray(values)) continue;
    for (const point of values) {
      if (!point || typeof point !== 'object') continue;
      const value = (point as { value?: unknown }).value;
      const endTime = (point as { end_time?: unknown }).end_time;
      if (typeof value !== 'number' || typeof endTime !== 'string') continue;
      const ended = new Date(Date.parse(endTime) - 1000).toISOString();
      points.push({ name, day: ymdInZone(ended, timeZone), value });
    }
  }
  return points;
}

function totalValue(body: unknown, name: string): number | null {
  const data = (body as { data?: unknown } | undefined)?.data;
  if (!Array.isArray(data)) return null;
  for (const entry of data) {
    if (!entry || typeof entry !== 'object') continue;
    if ((entry as { name?: unknown }).name !== name) continue;
    return metricValue(entry as { values?: { value?: unknown }[]; total_value?: { value?: unknown } });
  }
  return null;
}

type DueCard = {
  id: string;
  format: InsightFormat | null;
  instagram_url: string | null;
  instagram_media_id: string | null;
  postedAt: string;
  thumb_path: string | null;
};

async function setInsightsStatus(doctorId: string, status: 'ready' | 'missing' | null): Promise<void> {
  const admin = getSupabaseAdminClient();
  if (!admin) return;
  const { error } = await admin.from('doctor_instagram').update({ insights_status: status }).eq('doctor_id', doctorId);
  if (error && !missingStore(error)) {
    logger.warn({ errorCode: error.code }, 'social insights: status not saved');
  }
}

async function matchPostedMedia(
  doctorId: string,
  igUserId: string,
  token: string,
  cards: DueCard[]
): Promise<boolean> {
  const waiting = cards.filter((card) => !card.instagram_media_id && card.instagram_url);
  if (waiting.length === 0) return false;
  const found = new Map<string, string>();
  let path = `${igUserId}/media`;
  let params: Record<string, string | number> = { fields: 'id,permalink', limit: 25 };
  for (let page = 0; page < MEDIA_PAGES; page += 1) {
    const response = await graphGet(path, token, params);
    if (response.denied) throw Object.assign(new Error('permission'), { denied: true });
    const data = (response.data as { data?: { id?: string; permalink?: string }[]; paging?: { next?: string } } | undefined)
      ?.data;
    if (!Array.isArray(data)) break;
    for (const row of data) {
      if (!row?.id || !row.permalink) continue;
      const key = normalizeInstagramUrl(row.permalink);
      if (key) found.set(key, row.id);
    }
    const next = (response.data as { paging?: { next?: string } } | undefined)?.paging?.next;
    if (!next) break;
    path = next;
    params = {};
  }
  const admin = getSupabaseAdminClient();
  if (!admin) return false;
  let changed = false;
  for (const card of waiting) {
    const key = card.instagram_url ? normalizeInstagramUrl(card.instagram_url) : '';
    const mediaId = key ? found.get(key) : undefined;
    if (!mediaId) continue;
    const { error } = await admin
      .from('social_cards')
      .update({ instagram_media_id: mediaId })
      .eq('id', card.id)
      .eq('doctor_id', doctorId);
    if (!error) {
      card.instagram_media_id = mediaId;
      changed = true;
    }
  }
  return changed;
}

async function readMedia(
  card: DueCard,
  token: string
): Promise<{ numbers: Record<string, number | null>; denied: boolean; failure: GraphFailure } | null> {
  if (!card.instagram_media_id) return null;
  const metrics = metricsFor(card.format).join(',');
  const response = await graphGet(`${card.instagram_media_id}/insights`, token, { metric: metrics });
  if (response.denied) return { numbers: {}, denied: true, failure: response.failure };
  if (!response.data) return { numbers: {}, denied: false, failure: response.failure };
  const data = (response.data as { data?: unknown }).data;
  const numbers: Record<string, number | null> = {};
  if (!Array.isArray(data)) return { numbers, denied: false, failure: response.failure };
  for (const entry of data) {
    if (!entry || typeof entry !== 'object') continue;
    const name = (entry as { name?: unknown }).name;
    if (typeof name !== 'string') continue;
    numbers[name] = metricValue(entry as { values?: { value?: unknown }[]; total_value?: { value?: unknown } });
  }
  return { numbers, denied: false, failure: {} };
}

async function saveReach(
  row: {
    doctor_id: string;
    span: number;
    reach: number | null;
    previous_reach: number | null;
    interactions: number | null;
    previous_interactions: number | null;
    views: number | null;
    previous_views: number | null;
    measured_at: string;
  }
): Promise<boolean> {
  const admin = getSupabaseAdminClient();
  if (!admin) return false;
  const first = await admin.from('social_account_reach').upsert(row, { onConflict: 'doctor_id,span' });
  if (!first.error) return true;
  if (!missingStore(first.error)) {
    logger.warn({ errorCode: first.error.code }, 'social insights: reach not saved');
    return false;
  }
  const again = await admin.from('social_account_reach').upsert(
    {
      doctor_id: row.doctor_id,
      span: row.span,
      reach: row.reach,
      previous_reach: row.previous_reach,
      interactions: row.interactions,
      previous_interactions: row.previous_interactions,
      measured_at: row.measured_at,
    },
    { onConflict: 'doctor_id,span' }
  );
  if (!again.error) return true;
  if (!missingStore(again.error)) logger.warn({ errorCode: again.error.code }, 'social insights: reach not saved');
  return false;
}

async function refreshAccount(
  igUserId: string,
  token: string,
  doctorId: string,
  timeZone: string,
  nowSec: number
): Promise<{ denied: boolean; wrote: boolean; failure: GraphFailure }> {
  const admin = getSupabaseAdminClient();
  if (!admin) return { denied: false, wrote: false, failure: {} };
  let wrote = false;
  let failure: GraphFailure = {};

  const profile = await graphGet(igUserId, token, { fields: 'followers_count' });
  if (profile.denied && profile.failure.code === 190) return { denied: true, wrote: false, failure: profile.failure };
  const followers = (profile.data as { followers_count?: unknown } | undefined)?.followers_count;
  if (typeof followers === 'number') {
    const { error } = await admin.from('social_account_days').upsert(
      {
        doctor_id: doctorId,
        day: ymdInZone(new Date().toISOString(), timeZone),
        followers,
        measured_at: new Date().toISOString(),
      },
      { onConflict: 'doctor_id,day' }
    );
    if (!error) wrote = true;
    else if (!missingStore(error)) logger.warn({ errorCode: error.code }, 'social insights: day not saved');
  }

  const since = nowSec - 30 * 86400;
  const series = await graphGet(`${igUserId}/insights`, token, {
    metric: 'views',
    period: 'day',
    metric_type: 'time_series',
    since,
    until: nowSec,
  });
  if (series.denied) return { denied: true, wrote, failure: series.failure };
  if (series.failure.code) failure = series.failure;
  if (series.data) {
    const byDay = new Map<string, number>();
    for (const point of seriesPoints(series.data, timeZone)) {
      if (point.name === 'views') byDay.set(point.day, point.value);
    }
    for (const [day, views] of byDay) {
      const { error } = await admin.from('social_account_days').upsert(
        {
          doctor_id: doctorId,
          day,
          views,
          measured_at: new Date().toISOString(),
        },
        { onConflict: 'doctor_id,day' }
      );
      if (!error) wrote = true;
      else if (!missingStore(error)) logger.warn({ errorCode: error.code }, 'social insights: day not saved');
    }
  }

  for (const span of [7, 30, 90] as const) {
    const current = await graphGet(`${igUserId}/insights`, token, {
      metric: 'reach,total_interactions,views',
      period: 'day',
      metric_type: 'total_value',
      since: nowSec - span * 86400,
      until: nowSec,
    });
    if (current.denied) return { denied: true, wrote, failure: current.failure };
    const previous = await graphGet(`${igUserId}/insights`, token, {
      metric: 'reach,total_interactions,views',
      period: 'day',
      metric_type: 'total_value',
      since: nowSec - span * 2 * 86400,
      until: nowSec - span * 86400,
    });
    if (previous.denied) return { denied: true, wrote, failure: previous.failure };
    if (current.failure.code) failure = current.failure;
    if (!current.data && !previous.data) continue;
    const saved = await saveReach({
      doctor_id: doctorId,
      span,
      reach: current.data ? totalValue(current.data, 'reach') : null,
      previous_reach: previous.data ? totalValue(previous.data, 'reach') : null,
      interactions: current.data ? totalValue(current.data, 'total_interactions') : null,
      previous_interactions: previous.data ? totalValue(previous.data, 'total_interactions') : null,
      views: current.data ? totalValue(current.data, 'views') : null,
      previous_views: previous.data ? totalValue(previous.data, 'views') : null,
      measured_at: new Date().toISOString(),
    });
    if (saved) wrote = true;
  }
  return { denied: false, wrote, failure };
}

async function refreshDoctor(
  doctorId: string,
  igUserId: string,
  token: string,
  correlationId: string
): Promise<'ready' | 'missing' | 'skipped'> {
  const admin = getSupabaseAdminClient();
  if (!admin) return 'skipped';
  const timeZone = await getDoctorTimezone(doctorId);
  const cardsQuery = await admin
    .from('social_cards')
    .select('id, format, instagram_url, instagram_media_id, scheduled_at, updated_at, thumb_path')
    .eq('doctor_id', doctorId)
    .eq('stage', 'posted')
    .is('deleted_at', null);
  if (cardsQuery.error) {
    if (missingStore(cardsQuery.error)) return 'skipped';
    logger.warn({ correlationId, errorCode: cardsQuery.error.code }, 'social insights: cards skipped');
    return 'skipped';
  }
  const cards: DueCard[] = ((cardsQuery.data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: String(row.id),
    format: row.format === 'post' || row.format === 'reel' || row.format === 'story' ? row.format : null,
    instagram_url: typeof row.instagram_url === 'string' ? row.instagram_url : null,
    instagram_media_id: typeof row.instagram_media_id === 'string' ? row.instagram_media_id : null,
    postedAt: typeof row.scheduled_at === 'string' ? row.scheduled_at : String(row.updated_at ?? ''),
    thumb_path: typeof row.thumb_path === 'string' ? row.thumb_path : null,
  }));

  let denied = false;
  try {
    await matchPostedMedia(doctorId, igUserId, token, cards);
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'denied' in err) denied = true;
  }
  if (denied) {
    await setInsightsStatus(doctorId, 'missing');
    return 'missing';
  }

  const stats = await admin.from('social_card_stats').select('card_id, measured_at').eq('doctor_id', doctorId);
  const measured = new Map<string, string | null>();
  if (!stats.error) {
    for (const row of (stats.data ?? []) as { card_id?: string; measured_at?: string | null }[]) {
      if (row.card_id) measured.set(row.card_id, row.measured_at ?? null);
    }
  }
  const now = new Date().toISOString();
  const due = cards
    .filter((card) => card.instagram_media_id)
    .filter((card) =>
      dueForRefresh({
        format: card.format,
        postedAt: card.postedAt,
        measuredAt: measured.get(card.id) ?? null,
        now,
      })
    )
    .sort((a, b) => Number(b.format === 'story') - Number(a.format === 'story'))
    .slice(0, MEDIA_CAP);

  let wrote = false;
  for (const card of due) {
    const read = await readMedia(card, token);
    if (!read) continue;
    if (read.denied) {
      await setInsightsStatus(doctorId, 'missing');
      return 'missing';
    }
    if (read.failure.code) {
      logger.warn({ correlationId, status: read.failure.status, graphCode: read.failure.code }, 'social insights: post skipped');
      continue;
    }
    const numbers = read.numbers;
    if (Object.keys(numbers).length === 0) continue;
    const { error } = await admin.from('social_card_stats').upsert(
      {
        doctor_id: doctorId,
        card_id: card.id,
        views: numbers.views ?? null,
        reach: numbers.reach ?? null,
        likes: numbers.likes ?? null,
        comments: numbers.comments ?? null,
        saves: numbers.saved ?? null,
        shares: numbers.shares ?? null,
        watch_ms: numbers.ig_reels_avg_watch_time ?? null,
        measured_at: now,
        updated_at: now,
      },
      { onConflict: 'card_id' }
    );
    if (!error) wrote = true;
    else if (!missingStore(error)) logger.warn({ correlationId, errorCode: error.code }, 'social insights: post not saved');
  }

  const account = await refreshAccount(igUserId, token, doctorId, timeZone, Math.floor(Date.now() / 1000));
  if (account.denied) {
    await setInsightsStatus(doctorId, 'missing');
    return 'missing';
  }
  if (account.failure.code && !account.wrote) {
    logger.warn(
      { correlationId, status: account.failure.status, graphCode: account.failure.code },
      'social insights: account skipped'
    );
  }
  if (wrote || account.wrote) {
    await setInsightsStatus(doctorId, 'ready');
    return 'ready';
  }
  return 'skipped';
}

export type SocialInsightsResult = {
  accounts: number;
  ready: number;
  missing: number;
  skipped: number;
};

export async function runSocialInsightsJob(correlationId: string): Promise<SocialInsightsResult> {
  const result: SocialInsightsResult = { accounts: 0, ready: 0, missing: 0, skipped: 0 };
  const admin = getSupabaseAdminClient();
  if (!admin) return result;
  const listed = await admin
    .from('doctor_instagram')
    .select('doctor_id, instagram_page_id, instagram_access_token, insights_status');
  let rows = listed.data as
    | { doctor_id?: string; instagram_page_id?: string; instagram_access_token?: string; insights_status?: string | null }[]
    | null;
  if (listed.error && missingStore(listed.error)) {
    const again = await admin.from('doctor_instagram').select('doctor_id, instagram_page_id, instagram_access_token');
    if (again.error) return result;
    rows = again.data as typeof rows;
  } else if (listed.error) {
    logger.warn({ correlationId, errorCode: listed.error.code }, 'social insights: accounts skipped');
    return result;
  }
  for (const row of rows ?? []) {
    if (!row.doctor_id || !row.instagram_page_id || !row.instagram_access_token) continue;
    if (row.insights_status === 'missing') {
      result.skipped += 1;
      continue;
    }
    result.accounts += 1;
    try {
      const outcome = await refreshDoctor(
        row.doctor_id,
        row.instagram_page_id,
        row.instagram_access_token,
        correlationId
      );
      if (outcome === 'ready') result.ready += 1;
      else if (outcome === 'missing') result.missing += 1;
      else result.skipped += 1;
    } catch {
      result.skipped += 1;
      logger.warn({ correlationId }, 'social insights: account skipped');
    }
  }
  logger.info(
    { correlationId, accounts: result.accounts, ready: result.ready, missing: result.missing, skipped: result.skipped },
    'social insights: tick complete'
  );
  return result;
}

export async function loadInstagramOverlay(
  doctorId: string,
  from: string,
  to: string
): Promise<{ instagram: InstagramSection | null; byCard: Map<string, CardNumbers>; dayViews: Map<string, number | null> }> {
  const empty = { instagram: null, byCard: new Map<string, CardNumbers>(), dayViews: new Map<string, number | null>() };
  const admin = getSupabaseAdminClient();
  if (!admin) return empty;
  const statusQuery = await admin.from('doctor_instagram').select('insights_status').eq('doctor_id', doctorId).maybeSingle();
  if (statusQuery.error) return empty;
  const status = (statusQuery.data as { insights_status?: string | null } | null)?.insights_status ?? null;
  if (status !== 'ready') return empty;

  const prevStart = previousFrom(from, to);
  const [daysQuery, wideReach, statsQuery] = await Promise.all([
    admin
      .from('social_account_days')
      .select('day, followers, views')
      .eq('doctor_id', doctorId)
      .gte('day', shiftYmd(prevStart, -1))
      .lte('day', to),
    admin
      .from('social_account_reach')
      .select('span, reach, previous_reach, interactions, previous_interactions, views, previous_views')
      .eq('doctor_id', doctorId),
    admin.from('social_card_stats').select('card_id, views, likes, comments, saves').eq('doctor_id', doctorId),
  ]);
  if (daysQuery.error) return empty;
  const reachQuery =
    wideReach.error && missingStore(wideReach.error)
      ? await admin
          .from('social_account_reach')
          .select('span, reach, previous_reach, interactions, previous_interactions')
          .eq('doctor_id', doctorId)
      : wideReach;
  if (reachQuery.error || statsQuery.error) return empty;

  const accountDays: AccountDay[] = ((daysQuery.data ?? []) as { day?: string; followers?: number | null; views?: number | null }[]).map(
    (row) => ({
      day: String(row.day ?? '').slice(0, 10),
      followers: typeof row.followers === 'number' ? row.followers : null,
      views: typeof row.views === 'number' ? row.views : null,
    })
  );
  const overlay = buildInstagramOverlay({
    status,
    from,
    to,
    accountDays,
    reachRows: ((reachQuery.data ?? []) as {
      span?: number;
      reach?: number | null;
      previous_reach?: number | null;
      interactions?: number | null;
      previous_interactions?: number | null;
      views?: number | null;
      previous_views?: number | null;
    }[]).map((row) => ({
      span: Number(row.span),
      reach: typeof row.reach === 'number' ? row.reach : null,
      previousReach: typeof row.previous_reach === 'number' ? row.previous_reach : null,
      interactions: typeof row.interactions === 'number' ? row.interactions : null,
      previousInteractions: typeof row.previous_interactions === 'number' ? row.previous_interactions : null,
      views: typeof row.views === 'number' ? row.views : null,
      previousViews: typeof row.previous_views === 'number' ? row.previous_views : null,
    })),
    stats: ((statsQuery.data ?? []) as {
      card_id?: string;
      views?: number | null;
      likes?: number | null;
      comments?: number | null;
      saves?: number | null;
    }[])
      .filter((row) => row.card_id)
      .map((row) => ({
        cardId: String(row.card_id),
        views: typeof row.views === 'number' ? row.views : null,
        likes: typeof row.likes === 'number' ? row.likes : null,
        comments: typeof row.comments === 'number' ? row.comments : null,
        saves: typeof row.saves === 'number' ? row.saves : null,
      })),
  });
  return { instagram: overlay.instagram, byCard: overlay.byCard, dayViews: dayViews(accountDays, from, to) };
}
