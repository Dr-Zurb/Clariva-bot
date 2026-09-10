/**
 * Post conversion analytics (pca-01 / plan-03).
 *
 * Aggregate-only: which posts (media_id) convert comment leads → DMs → appointments.
 * NEVER select or return comment_text (PHI).
 *
 * Attribution: first-touch comment lead per conversation (earliest created_at).
 * Date window: [from 00:00Z, to+1day 00:00Z) — same as dashboard insights.
 */

import { getSupabaseAdminClient } from '../config/database';
import { InternalError } from '../utils/errors';
import { handleSupabaseError } from '../utils/db-helpers';
import { logDataAccess } from '../utils/audit-logger';
import type { AppointmentStatus } from '../types/database';

/** Aligns with HIGH_INTENT_COMMENT in instagram-comment-webhook-handler. */
export const POST_FUNNEL_INTERESTED_INTENTS = [
  'book_appointment',
  'check_availability',
  'pricing_inquiry',
  'general_inquiry',
  'medical_query',
] as const;

export type PostFunnelPlatform = 'instagram' | 'facebook';

export interface PostFunnelSourceSplit {
  commentAttributed: number;
  directDm: number;
  paidCommentAttributed: number;
  paidDirectDm: number;
}

export interface PostFunnelRow {
  mediaId: string;
  platform: PostFunnelPlatform;
  leads: number;
  interested: number;
  dms: number;
  appointments: number;
  paid: number;
  /** appointments / leads (0 if no leads). */
  conversionRate: number;
}

export interface PostFunnelResult {
  range: { from: string; to: string };
  sourceSplit: PostFunnelSourceSplit;
  posts: PostFunnelRow[];
}

interface LeadRow {
  id: string;
  media_id: string | null;
  platform: string;
  intent: string | null;
  conversation_id: string | null;
  created_at: string;
}

interface AptRow {
  id: string;
  conversation_id: string | null;
  status: AppointmentStatus;
  created_at: string;
}

function startOfDayUtc(ymd: string): string {
  return `${ymd}T00:00:00.000Z`;
}

function exclusiveEndUtc(ymdTo: string): string {
  const [y, m, d] = ymdTo.split('-').map(Number);
  const dt = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
  dt.setUTCDate(dt.getUTCDate() + 1);
  return dt.toISOString();
}

function isInterestedIntent(intent: string | null | undefined): boolean {
  if (!intent) return false;
  return (POST_FUNNEL_INTERESTED_INTENTS as readonly string[]).includes(intent);
}

function isPaidStatus(status: AppointmentStatus): boolean {
  return status === 'confirmed' || status === 'completed';
}

function postKey(platform: string, mediaId: string): string {
  return `${platform}::${mediaId}`;
}

/**
 * Pure aggregator for unit tests — no DB.
 * `windowLeads` = leads in the date window with media_id.
 * `allLeadsForConvs` = all leads for conversations that have appointments (for first-touch).
 * `appointments` = appointments in the date window.
 */
export function aggregatePostFunnel(input: {
  windowLeads: LeadRow[];
  firstTouchByConversation: Map<string, { mediaId: string; platform: PostFunnelPlatform }>;
  appointments: AptRow[];
  conversationsWithAnyLead: Set<string>;
}): { sourceSplit: PostFunnelSourceSplit; posts: PostFunnelRow[] } {
  const byPost = new Map<
    string,
    {
      mediaId: string;
      platform: PostFunnelPlatform;
      leads: number;
      interested: number;
      dms: number;
      appointmentIds: Set<string>;
      paidIds: Set<string>;
    }
  >();

  for (const lead of input.windowLeads) {
    if (!lead.media_id) continue;
    const platform =
      lead.platform === 'facebook' ? 'facebook' : ('instagram' as PostFunnelPlatform);
    const key = postKey(platform, lead.media_id);
    let row = byPost.get(key);
    if (!row) {
      row = {
        mediaId: lead.media_id,
        platform,
        leads: 0,
        interested: 0,
        dms: 0,
        appointmentIds: new Set(),
        paidIds: new Set(),
      };
      byPost.set(key, row);
    }
    row.leads += 1;
    if (isInterestedIntent(lead.intent)) row.interested += 1;
    if (lead.conversation_id) row.dms += 1;
  }

  let commentAttributed = 0;
  let directDm = 0;
  let paidCommentAttributed = 0;
  let paidDirectDm = 0;

  for (const apt of input.appointments) {
    const convId = apt.conversation_id;
    const paid = isPaidStatus(apt.status);
    if (!convId || !input.conversationsWithAnyLead.has(convId)) {
      directDm += 1;
      if (paid) paidDirectDm += 1;
      continue;
    }
    commentAttributed += 1;
    if (paid) paidCommentAttributed += 1;

    const touch = input.firstTouchByConversation.get(convId);
    if (!touch) continue;
    const key = postKey(touch.platform, touch.mediaId);
    let row = byPost.get(key);
    if (!row) {
      // Appointment attributed to a post with no leads in the *window* — still show the post.
      row = {
        mediaId: touch.mediaId,
        platform: touch.platform,
        leads: 0,
        interested: 0,
        dms: 0,
        appointmentIds: new Set(),
        paidIds: new Set(),
      };
      byPost.set(key, row);
    }
    row.appointmentIds.add(apt.id);
    if (paid) row.paidIds.add(apt.id);
  }

  const posts: PostFunnelRow[] = [...byPost.values()]
    .map((r) => ({
      mediaId: r.mediaId,
      platform: r.platform,
      leads: r.leads,
      interested: r.interested,
      dms: r.dms,
      appointments: r.appointmentIds.size,
      paid: r.paidIds.size,
      conversionRate: r.leads > 0 ? r.appointmentIds.size / r.leads : 0,
    }))
    .sort((a, b) => {
      if (b.appointments !== a.appointments) return b.appointments - a.appointments;
      if (b.leads !== a.leads) return b.leads - a.leads;
      return a.mediaId.localeCompare(b.mediaId);
    });

  return {
    sourceSplit: {
      commentAttributed,
      directDm,
      paidCommentAttributed,
      paidDirectDm,
    },
    posts,
  };
}

/**
 * Build first-touch map: conversation_id → earliest lead with media_id.
 */
export function buildFirstTouchMap(
  leads: Array<{
    conversation_id: string | null;
    media_id: string | null;
    platform: string;
    created_at: string;
  }>
): Map<string, { mediaId: string; platform: PostFunnelPlatform }> {
  const map = new Map<string, { mediaId: string; platform: PostFunnelPlatform; at: string }>();
  for (const lead of leads) {
    if (!lead.conversation_id || !lead.media_id) continue;
    const platform =
      lead.platform === 'facebook' ? 'facebook' : ('instagram' as PostFunnelPlatform);
    const existing = map.get(lead.conversation_id);
    if (!existing || lead.created_at < existing.at) {
      map.set(lead.conversation_id, {
        mediaId: lead.media_id,
        platform,
        at: lead.created_at,
      });
    }
  }
  const out = new Map<string, { mediaId: string; platform: PostFunnelPlatform }>();
  for (const [convId, v] of map) {
    out.set(convId, { mediaId: v.mediaId, platform: v.platform });
  }
  return out;
}

export async function getPostFunnel(input: {
  doctorId: string;
  from: string;
  to: string;
  platform?: PostFunnelPlatform;
  correlationId: string;
}): Promise<PostFunnelResult> {
  const admin = getSupabaseAdminClient();
  if (!admin) throw new InternalError('Service role client not available');

  const { doctorId, from, to, platform, correlationId } = input;
  const rangeStart = startOfDayUtc(from);
  const rangeEndExclusive = exclusiveEndUtc(to);

  // Aggregate columns only — never comment_text.
  let leadsQ = admin
    .from('comment_leads')
    .select('id, media_id, platform, intent, conversation_id, created_at')
    .eq('doctor_id', doctorId)
    .not('media_id', 'is', null)
    .gte('created_at', rangeStart)
    .lt('created_at', rangeEndExclusive);

  if (platform) {
    leadsQ = leadsQ.eq('platform', platform);
  }

  const { data: windowLeadsRaw, error: leadsErr } = await leadsQ;
  if (leadsErr) handleSupabaseError(leadsErr, correlationId);
  const windowLeads = (windowLeadsRaw ?? []) as LeadRow[];

  const { data: aptsRaw, error: aptErr } = await admin
    .from('appointments')
    .select('id, conversation_id, status, created_at')
    .eq('doctor_id', doctorId)
    .gte('created_at', rangeStart)
    .lt('created_at', rangeEndExclusive);
  if (aptErr) handleSupabaseError(aptErr, correlationId);
  const appointments = (aptsRaw ?? []) as AptRow[];

  const convIds = [
    ...new Set(
      appointments
        .map((a) => a.conversation_id)
        .filter((id): id is string => Boolean(id))
    ),
  ];

  let firstTouchByConversation = new Map<
    string,
    { mediaId: string; platform: PostFunnelPlatform }
  >();
  const conversationsWithAnyLead = new Set<string>();

  if (convIds.length > 0) {
    // Chunk in case of large sets (PostgREST .in limits).
    const CHUNK = 200;
    const touchLeads: Array<{
      conversation_id: string | null;
      media_id: string | null;
      platform: string;
      created_at: string;
    }> = [];
    for (let i = 0; i < convIds.length; i += CHUNK) {
      const chunk = convIds.slice(i, i + CHUNK);
      const { data, error } = await admin
        .from('comment_leads')
        .select('conversation_id, media_id, platform, created_at')
        .eq('doctor_id', doctorId)
        .in('conversation_id', chunk);
      if (error) handleSupabaseError(error, correlationId);
      for (const row of data ?? []) {
        touchLeads.push(row as (typeof touchLeads)[number]);
        const cid = (row as { conversation_id: string | null }).conversation_id;
        if (cid) conversationsWithAnyLead.add(cid);
      }
    }
    firstTouchByConversation = buildFirstTouchMap(touchLeads);
  }

  const { sourceSplit, posts } = aggregatePostFunnel({
    windowLeads,
    firstTouchByConversation,
    appointments,
    conversationsWithAnyLead,
  });

  // Optional platform filter on posts (appointments already doctor-scoped; filter rows).
  const filteredPosts = platform
    ? posts.filter((p) => p.platform === platform)
    : posts;

  await logDataAccess(correlationId, doctorId, 'post_funnel_insights');

  return {
    range: { from, to },
    sourceSplit,
    posts: filteredPosts,
  };
}
