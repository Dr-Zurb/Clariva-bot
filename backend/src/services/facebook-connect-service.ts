/**
 * Facebook Page connect (facebook-messenger-channel · fbm-03).
 *
 * Facebook Login → long-lived user token → me/accounts → Page token →
 * doctor_facebook + subscribed_apps (messages).
 *
 * Never log tokens/codes (COMPLIANCE).
 */

import crypto from 'crypto';
import axios from 'axios';
import { getSupabaseAdminClient } from '../config/database';
import { env } from '../config/env';
import { logger } from '../config/logger';
import {
  ConflictError,
  InternalError,
  UnauthorizedError,
  ValidationError,
} from '../utils/errors';
import { handleSupabaseError } from '../utils/db-helpers';
import type { InsertDoctorFacebook } from '../types/database';

const FACEBOOK_OAUTH_DIALOG = 'https://www.facebook.com/v18.0/dialog/oauth';
const FACEBOOK_GRAPH_BASE = 'https://graph.facebook.com/v18.0';
const META_HTTP_TIMEOUT_MS = 10000;

/** Page Login scopes for Messenger DMs (p1). Comments fields added in p2 as needed. */
const FACEBOOK_PAGE_SCOPES = [
  'pages_show_list',
  'pages_messaging',
  'pages_manage_metadata',
  'pages_read_engagement',
  'pages_read_user_content',
  // Public reply on Page comments (requires permission Ready for testing on app).
  'pages_manage_engagement',
  // Required for /me/accounts to return Pages owned via Meta Business Manager.
  'business_management',
];

interface FacebookConnectStatePayload {
  n: string;
  d: string;
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requireFacebookOAuthConfig(): { appId: string; appSecret: string; redirectUri: string } {
  const appId = env.FACEBOOK_APP_ID;
  const appSecret = env.FACEBOOK_APP_SECRET;
  const redirectUri = env.FACEBOOK_REDIRECT_URI;
  if (!appId || !appSecret || !redirectUri) {
    throw new InternalError('Facebook OAuth not configured');
  }
  return { appId, appSecret, redirectUri };
}

export function createFacebookState(doctorId: string): string {
  const { appSecret } = requireFacebookOAuthConfig();
  const nonce = crypto.randomBytes(16).toString('hex');
  const payload: FacebookConnectStatePayload = { n: nonce, d: doctorId };
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', appSecret).update(payloadB64).digest('base64url');
  return `${payloadB64}.${sig}`;
}

export function verifyFacebookState(state: string): string {
  if (!state || typeof state !== 'string') {
    throw new ValidationError('Missing or invalid state parameter');
  }
  const { appSecret } = requireFacebookOAuthConfig();
  const parts = state.split('.');
  if (parts.length !== 2) {
    throw new ValidationError('Invalid state format');
  }
  const [payloadB64, sigB64] = parts;
  const expectedSig = crypto
    .createHmac('sha256', appSecret)
    .update(payloadB64)
    .digest('base64url');
  const sigBuf = Buffer.from(sigB64, 'base64url');
  const expectedBuf = Buffer.from(expectedSig, 'base64url');
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    throw new UnauthorizedError('Invalid state (CSRF check failed)');
  }
  let payload: FacebookConnectStatePayload;
  try {
    payload = JSON.parse(
      Buffer.from(payloadB64, 'base64url').toString('utf8')
    ) as FacebookConnectStatePayload;
  } catch {
    throw new ValidationError('Invalid state payload');
  }
  if (!payload.n || payload.n.length !== 32) {
    throw new ValidationError('Invalid state nonce');
  }
  if (!payload.d || !UUID_REGEX.test(payload.d)) {
    throw new ValidationError('Invalid state doctor id');
  }
  return payload.d;
}

export function buildFacebookOAuthUrl(state: string): string {
  const { appId, redirectUri } = requireFacebookOAuthConfig();
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    state,
    scope: FACEBOOK_PAGE_SCOPES.join(','),
    response_type: 'code',
  });
  return `${FACEBOOK_OAUTH_DIALOG}?${params.toString()}`;
}

export async function exchangeFacebookCodeForUserToken(
  code: string,
  correlationId: string
): Promise<{ accessToken: string }> {
  const { appId, appSecret, redirectUri } = requireFacebookOAuthConfig();
  const cleanCode = code.includes('#') ? code.slice(0, code.indexOf('#')) : code;
  try {
    const res = await axios.get<{ access_token?: string }>(
      `${FACEBOOK_GRAPH_BASE}/oauth/access_token`,
      {
        params: {
          client_id: appId,
          client_secret: appSecret,
          redirect_uri: redirectUri,
          code: cleanCode,
        },
        timeout: META_HTTP_TIMEOUT_MS,
      }
    );
    const accessToken = res.data?.access_token;
    if (!accessToken) {
      throw new UnauthorizedError('Facebook token exchange returned no access_token');
    }
    return { accessToken };
  } catch (err: unknown) {
    if (err instanceof UnauthorizedError) throw err;
    logger.warn(
      { correlationId, message: axios.isAxiosError(err) ? err.message : 'code exchange failed' },
      'Facebook OAuth: code exchange failed'
    );
    throw new UnauthorizedError('Failed to exchange Facebook authorization code');
  }
}

export async function exchangeFacebookLongLivedUserToken(
  shortLivedToken: string,
  correlationId: string
): Promise<{ accessToken: string; expiresIn: number | null }> {
  const { appId, appSecret } = requireFacebookOAuthConfig();
  try {
    const res = await axios.get<{ access_token?: string; expires_in?: number }>(
      `${FACEBOOK_GRAPH_BASE}/oauth/access_token`,
      {
        params: {
          grant_type: 'fb_exchange_token',
          client_id: appId,
          client_secret: appSecret,
          fb_exchange_token: shortLivedToken,
        },
        timeout: META_HTTP_TIMEOUT_MS,
      }
    );
    const accessToken = res.data?.access_token;
    if (!accessToken) {
      throw new UnauthorizedError('Facebook long-lived exchange returned no access_token');
    }
    return {
      accessToken,
      expiresIn: typeof res.data.expires_in === 'number' ? res.data.expires_in : null,
    };
  } catch (err: unknown) {
    if (err instanceof UnauthorizedError) throw err;
    logger.warn(
      { correlationId, message: axios.isAxiosError(err) ? err.message : 'll exchange failed' },
      'Facebook OAuth: long-lived exchange failed'
    );
    throw new UnauthorizedError('Failed to obtain long-lived Facebook token');
  }
}

export interface FacebookPageChoice {
  pageId: string;
  pageName: string | null;
  pageAccessToken: string;
}

/**
 * List Pages the user manages; v1 picks the first (FBM1 OQ-2).
 */
/**
 * Fallback when /me/accounts is empty: read Page ids from token granular_scopes
 * (debug_token), then fetch each Page's access_token.
 */
async function selectFacebookPageFromTokenGranularScopes(
  userAccessToken: string,
  correlationId: string
): Promise<FacebookPageChoice | null> {
  const { appId, appSecret } = requireFacebookOAuthConfig();
  const appAccessToken = `${appId}|${appSecret}`;
  try {
    const debug = await axios.get<{
      data?: {
        granular_scopes?: Array<{ scope?: string; target_ids?: string[] }>;
      };
    }>(`${FACEBOOK_GRAPH_BASE}/debug_token`, {
      params: {
        input_token: userAccessToken,
        access_token: appAccessToken,
      },
      timeout: META_HTTP_TIMEOUT_MS,
    });
    const granular = debug.data?.data?.granular_scopes ?? [];
    const pageIds = new Set<string>();
    for (const entry of granular) {
      if (!entry?.scope?.startsWith('pages_')) continue;
      for (const id of entry.target_ids ?? []) {
        if (id) pageIds.add(String(id));
      }
    }
    for (const pageId of pageIds) {
      try {
        const pageRes = await axios.get<{
          id?: string;
          name?: string;
          access_token?: string;
        }>(`${FACEBOOK_GRAPH_BASE}/${encodeURIComponent(pageId)}`, {
          params: {
            fields: 'id,name,access_token',
            access_token: userAccessToken,
          },
          timeout: META_HTTP_TIMEOUT_MS,
        });
        if (pageRes.data?.id && pageRes.data.access_token) {
          logger.info(
            { correlationId, pageId: pageRes.data.id },
            'Facebook OAuth: resolved Page via debug_token granular_scopes'
          );
          return {
            pageId: String(pageRes.data.id),
            pageName:
              typeof pageRes.data.name === 'string' && pageRes.data.name.trim().length > 0
                ? pageRes.data.name.trim()
                : null,
            pageAccessToken: pageRes.data.access_token,
          };
        }
      } catch {
        // try next page id
      }
    }
    return null;
  } catch (err: unknown) {
    logger.warn(
      {
        correlationId,
        message: axios.isAxiosError(err) ? err.message : 'debug_token fallback failed',
      },
      'Facebook OAuth: granular_scopes Page fallback failed'
    );
    return null;
  }
}

export async function selectFacebookPageForConnect(
  userAccessToken: string,
  correlationId: string
): Promise<FacebookPageChoice> {
  try {
    const res = await axios.get<{
      data?: Array<{ id?: string; name?: string; access_token?: string }>;
    }>(`${FACEBOOK_GRAPH_BASE}/me/accounts`, {
      params: {
        fields: 'id,name,access_token',
        access_token: userAccessToken,
        limit: 100,
      },
      timeout: META_HTTP_TIMEOUT_MS,
    });
    const pages = Array.isArray(res.data?.data) ? res.data.data : [];
    const first = pages.find((p) => p.id && p.access_token);
    if (first?.id && first.access_token) {
      return {
        pageId: String(first.id),
        pageName:
          typeof first.name === 'string' && first.name.trim().length > 0
            ? first.name.trim()
            : null,
        pageAccessToken: first.access_token,
      };
    }

    logger.info(
      { correlationId, meAccountsCount: pages.length },
      'Facebook OAuth: me/accounts empty; trying granular_scopes fallback'
    );
    const fromGranular = await selectFacebookPageFromTokenGranularScopes(
      userAccessToken,
      correlationId
    );
    if (fromGranular) return fromGranular;

    throw new ValidationError(
      'No Facebook Page found. Create a Page and grant access, then try again.'
    );
  } catch (err: unknown) {
    if (err instanceof ValidationError) throw err;
    logger.warn(
      { correlationId, message: axios.isAxiosError(err) ? err.message : 'me/accounts failed' },
      'Facebook OAuth: me/accounts failed'
    );
    throw new UnauthorizedError('Failed to list Facebook Pages');
  }
}

export async function getFacebookUserId(
  userAccessToken: string,
  correlationId: string
): Promise<string | null> {
  try {
    const res = await axios.get<{ id?: string }>(`${FACEBOOK_GRAPH_BASE}/me`, {
      params: { fields: 'id', access_token: userAccessToken },
      timeout: META_HTTP_TIMEOUT_MS,
    });
    return res.data?.id != null ? String(res.data.id) : null;
  } catch (err: unknown) {
    logger.warn(
      { correlationId, message: axios.isAxiosError(err) ? err.message : 'me failed' },
      'Facebook OAuth: me id lookup failed'
    );
    return null;
  }
}

/**
 * Subscribe the Page to app webhooks for Messenger messages.
 * Best-effort: logs warning on failure (doctor still connected).
 */
export async function subscribeFacebookPageApps(
  pageId: string,
  pageAccessToken: string,
  correlationId: string
): Promise<void> {
  try {
    await axios.post(
      `${FACEBOOK_GRAPH_BASE}/${encodeURIComponent(pageId)}/subscribed_apps`,
      null,
      {
        params: {
          subscribed_fields:
            'messages,messaging_postbacks,messaging_optins,message_deliveries,message_reads,feed',
          access_token: pageAccessToken,
        },
        timeout: META_HTTP_TIMEOUT_MS,
      }
    );
    logger.info({ correlationId, pageId }, 'Facebook Page subscribed_apps ok');
  } catch (err: unknown) {
    logger.warn(
      {
        correlationId,
        pageId,
        message: axios.isAxiosError(err) ? err.message : 'subscribed_apps failed',
      },
      'Facebook Page subscribed_apps failed'
    );
  }
}

export async function saveDoctorFacebook(
  doctorId: string,
  input: {
    facebook_page_id: string;
    page_access_token: string;
    page_name?: string | null;
    facebook_user_id?: string | null;
    page_token_expires_at?: string | null;
  },
  correlationId: string
): Promise<void> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    throw new InternalError('Service role client not available for saving Facebook link');
  }

  const row: InsertDoctorFacebook = {
    doctor_id: doctorId,
    facebook_page_id: input.facebook_page_id,
    page_access_token: input.page_access_token.trim(),
    page_name: input.page_name ?? null,
    facebook_user_id: input.facebook_user_id ?? null,
    page_token_expires_at: input.page_token_expires_at ?? null,
    facebook_health_checked_at: null,
    facebook_health_level: null,
    facebook_health_error_code: null,
    facebook_last_dm_success_at: null,
  };

  const { error } = await supabase.from('doctor_facebook').upsert(row, {
    onConflict: 'doctor_id',
    ignoreDuplicates: false,
  });

  if (error) {
    if (error.code === '23505') {
      throw new ConflictError('This Facebook Page is already linked to another account');
    }
    handleSupabaseError(error, correlationId);
  }

  logger.info(
    { correlationId, doctorId, pageId: input.facebook_page_id },
    'Doctor Facebook connection saved'
  );
}

export async function disconnectFacebook(
  doctorId: string,
  correlationId?: string
): Promise<void> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    throw new InternalError('Service role client not available for Facebook disconnect');
  }

  const { data: existing } = await supabase
    .from('doctor_facebook')
    .select('facebook_page_id, page_access_token')
    .eq('doctor_id', doctorId)
    .maybeSingle();

  if (existing?.facebook_page_id && existing.page_access_token) {
    try {
      await axios.delete(
        `${FACEBOOK_GRAPH_BASE}/${encodeURIComponent(String(existing.facebook_page_id))}/subscribed_apps`,
        {
          params: { access_token: existing.page_access_token as string },
          timeout: META_HTTP_TIMEOUT_MS,
        }
      );
    } catch (err: unknown) {
      logger.warn(
        {
          correlationId,
          doctorId,
          message: axios.isAxiosError(err) ? err.message : 'unsubscribe failed',
        },
        'Facebook disconnect: subscribed_apps delete failed'
      );
    }
  }

  const { error } = await supabase.from('doctor_facebook').delete().eq('doctor_id', doctorId);
  if (error) handleSupabaseError(error, correlationId ?? '');
  logger.info({ correlationId, doctorId }, 'Doctor Facebook connection removed');
}

// ============================================================================
// Connection health (fbm-07) — Graph debug_token for Page tokens, 5-minute cache
// ============================================================================

const HEALTH_CACHE_TTL_MS = 5 * 60 * 1000;
const TOKEN_EXPIRY_WARN_MS = 7 * 24 * 60 * 60 * 1000;
const STALE_DM_WARN_MS = 14 * 24 * 60 * 60 * 1000;

export interface FacebookHealthSummary {
  level: 'ok' | 'warning' | 'error' | 'unknown' | 'not_connected';
  checkedAt: string | null;
  tokenExpiresAt: string | null;
  lastDmSuccessAt: string | null;
  message: string;
  reconnectRecommended: boolean;
}

type FacebookHealthProbeSummary = {
  level: 'ok' | 'warning' | 'error' | 'unknown';
  errorCode: string | null;
  tokenExpiresAt: string | null;
  message: string;
  reconnectRecommended: boolean;
};

interface DoctorFacebookHealthRow {
  facebook_page_id: string;
  page_name: string | null;
  page_access_token: string;
  page_token_expires_at: string | null;
  facebook_health_checked_at: string | null;
  facebook_health_level: string | null;
  facebook_health_error_code: string | null;
  facebook_last_dm_success_at: string | null;
}

function notConnectedFacebookHealth(): FacebookHealthSummary {
  return {
    level: 'not_connected',
    checkedAt: null,
    tokenExpiresAt: null,
    lastDmSuccessAt: null,
    message: 'Connect a Facebook Page to enable Messenger replies.',
    reconnectRecommended: true,
  };
}

type FacebookTokenProbe = {
  ok: boolean;
  requestFailed: boolean;
  invalidToken: boolean;
  errorCode: string | null;
  /** Unix seconds; 0 means never expires */
  expiresAtUnix: number | null;
};

/**
 * Probe a Page access token via Facebook Graph debug_token (app access token).
 */
export async function probeFacebookPageToken(
  pageAccessToken: string,
  correlationId: string
): Promise<FacebookTokenProbe> {
  try {
    const { appId, appSecret } = requireFacebookOAuthConfig();
    const res = await axios.get<{
      data?: {
        is_valid?: boolean;
        app_id?: string;
        expires_at?: number;
        error?: { code?: number; message?: string };
      };
    }>(`${FACEBOOK_GRAPH_BASE}/debug_token`, {
      params: {
        input_token: pageAccessToken,
        access_token: `${appId}|${appSecret}`,
      },
      timeout: META_HTTP_TIMEOUT_MS,
    });
    const data = res.data?.data;
    if (!data) {
      return { ok: false, requestFailed: true, invalidToken: false, errorCode: null, expiresAtUnix: null };
    }
    const expiresAtUnix =
      typeof data.expires_at === 'number' && !Number.isNaN(data.expires_at)
        ? data.expires_at
        : null;
    if (data.is_valid === true) {
      return {
        ok: true,
        requestFailed: false,
        invalidToken: false,
        errorCode: null,
        expiresAtUnix,
      };
    }
    const errCode = data.error?.code;
    return {
      ok: false,
      requestFailed: false,
      invalidToken: true,
      errorCode: errCode != null ? String(errCode) : 'invalid',
      expiresAtUnix,
    };
  } catch (err: unknown) {
    const status = axios.isAxiosError(err) ? err.response?.status : undefined;
    const graphCode = axios.isAxiosError(err)
      ? (err.response?.data as { error?: { code?: number } } | undefined)?.error?.code
      : undefined;
    const invalidToken =
      status === 401 ||
      status === 403 ||
      status === 400 ||
      graphCode === 190 ||
      graphCode === 102;
    logger.warn(
      {
        correlationId,
        status,
        graphCode: graphCode ?? null,
        message: axios.isAxiosError(err) ? err.message : 'debug_token probe failed',
      },
      'Facebook health: debug_token probe failed'
    );
    return {
      ok: false,
      requestFailed: !invalidToken,
      invalidToken,
      errorCode: graphCode != null ? String(graphCode) : status != null ? String(status) : null,
      expiresAtUnix: null,
    };
  }
}

function summarizeFacebookHealthFromProbe(
  probe: FacebookTokenProbe,
  lastDmSuccessAt: string | null,
  storedExpiresAt: string | null
): FacebookHealthProbeSummary {
  if (probe.requestFailed) {
    return {
      level: 'unknown',
      errorCode: probe.errorCode,
      tokenExpiresAt: storedExpiresAt,
      message:
        "We couldn't verify your Facebook Page token with Meta right now. If patients can't reach the bot, try reconnecting.",
      reconnectRecommended: false,
    };
  }
  if (probe.invalidToken || !probe.ok) {
    return {
      level: 'error',
      errorCode: probe.errorCode,
      tokenExpiresAt: storedExpiresAt,
      message: 'Your Facebook Page access token is no longer valid. Reconnect your Page.',
      reconnectRecommended: true,
    };
  }

  let tokenExpiresAt = storedExpiresAt;
  if (probe.expiresAtUnix != null && probe.expiresAtUnix > 0) {
    tokenExpiresAt = new Date(probe.expiresAtUnix * 1000).toISOString();
  } else if (probe.expiresAtUnix === 0) {
    tokenExpiresAt = null;
  }

  const now = Date.now();
  let expMs: number | null = null;
  if (tokenExpiresAt) {
    const parsed = new Date(tokenExpiresAt).getTime();
    if (!Number.isNaN(parsed)) expMs = parsed;
  }
  if (expMs != null && expMs < now + TOKEN_EXPIRY_WARN_MS) {
    return {
      level: 'warning',
      errorCode: null,
      tokenExpiresAt,
      message:
        expMs < now
          ? 'Your Facebook Page access token has expired. Reconnect your Page.'
          : 'Your Facebook Page access token expires soon. Reconnect to avoid interruptions.',
      reconnectRecommended: true,
    };
  }

  if (lastDmSuccessAt) {
    const last = new Date(lastDmSuccessAt).getTime();
    if (!Number.isNaN(last) && now - last > STALE_DM_WARN_MS) {
      return {
        level: 'warning',
        errorCode: null,
        tokenExpiresAt,
        message:
          'No automated Messenger reply has been recorded recently. If something seems off, reconnect or check Meta / inbox.',
        reconnectRecommended: false,
      };
    }
  }

  return {
    level: 'ok',
    errorCode: null,
    tokenExpiresAt,
    message: 'Facebook Page connection looks healthy.',
    reconnectRecommended: false,
  };
}

async function persistFacebookHealth(
  doctorId: string,
  summary: FacebookHealthProbeSummary,
  tokenExpiresAtIso: string | null,
  correlationId: string
): Promise<void> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return;
  const { error } = await supabase
    .from('doctor_facebook')
    .update({
      facebook_health_checked_at: new Date().toISOString(),
      facebook_health_level: summary.level,
      facebook_health_error_code: summary.errorCode,
      page_token_expires_at: tokenExpiresAtIso,
    })
    .eq('doctor_id', doctorId);
  if (error) {
    logger.warn({ correlationId, doctorId }, 'Facebook health: failed to persist snapshot');
  }
}

function facebookSummaryFromCachedRow(row: DoctorFacebookHealthRow): FacebookHealthSummary {
  const checkedAt = row.facebook_health_checked_at;
  const tokenExpiresAt = row.page_token_expires_at;
  const lastDm = row.facebook_last_dm_success_at;
  const levelRaw = row.facebook_health_level;
  let level: FacebookHealthSummary['level'] = 'unknown';
  if (levelRaw === 'ok' || levelRaw === 'warning' || levelRaw === 'error' || levelRaw === 'unknown') {
    level = levelRaw;
  }

  let message = 'Could not confirm Page token health. Try again later or reconnect.';
  let reconnectRecommended = level === 'error';
  if (level === 'ok') {
    message = 'Facebook Page connection looks healthy.';
  } else if (level === 'warning') {
    message =
      'Check token expiry or recent Messenger activity. Reconnect if patients report the bot is not replying.';
    reconnectRecommended = true;
  } else if (level === 'error') {
    message = 'Facebook Page access token needs attention. Reconnect your Page.';
  }

  return {
    level,
    checkedAt,
    tokenExpiresAt,
    lastDmSuccessAt: lastDm,
    message,
    reconnectRecommended,
  };
}

/**
 * Connection + health for dashboard (debug_token, cached 5 minutes).
 */
export async function getFacebookConnectionStatus(
  doctorId: string,
  correlationId?: string
): Promise<{
  connected: boolean;
  pageName: string | null;
  pageId: string | null;
  health: FacebookHealthSummary;
}> {
  const corr = correlationId ?? 'unknown';
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    throw new InternalError('Service role client not available for Facebook status');
  }

  const { data, error } = await supabase
    .from('doctor_facebook')
    .select(
      'facebook_page_id, page_name, page_access_token, page_token_expires_at, facebook_health_checked_at, facebook_health_level, facebook_health_error_code, facebook_last_dm_success_at'
    )
    .eq('doctor_id', doctorId)
    .maybeSingle();

  if (error) handleSupabaseError(error, corr);

  const row = data as DoctorFacebookHealthRow | null;
  if (!row?.facebook_page_id || !row.page_access_token) {
    return {
      connected: false,
      pageName: null,
      pageId: null,
      health: notConnectedFacebookHealth(),
    };
  }

  const basic = {
    connected: true as const,
    pageName: (row.page_name as string | null) ?? null,
    pageId: String(row.facebook_page_id),
  };

  const checkedMs = row.facebook_health_checked_at
    ? new Date(row.facebook_health_checked_at).getTime()
    : 0;
  const cacheFresh =
    checkedMs > 0 &&
    Date.now() - checkedMs < HEALTH_CACHE_TTL_MS &&
    !!row.facebook_health_level &&
    row.facebook_health_level !== 'unknown';

  if (cacheFresh) {
    return { ...basic, health: facebookSummaryFromCachedRow(row) };
  }

  const probe = await probeFacebookPageToken(row.page_access_token, corr);
  const summary = summarizeFacebookHealthFromProbe(
    probe,
    row.facebook_last_dm_success_at,
    row.page_token_expires_at
  );
  const tokenExpiresIso = summary.tokenExpiresAt ?? row.page_token_expires_at;

  await persistFacebookHealth(doctorId, summary, tokenExpiresIso, corr);

  return {
    ...basic,
    health: {
      level: summary.level,
      checkedAt: new Date().toISOString(),
      tokenExpiresAt: tokenExpiresIso,
      lastDmSuccessAt: row.facebook_last_dm_success_at,
      message: summary.message,
      reconnectRecommended: summary.reconnectRecommended,
    },
  };
}

/** Resolve doctor from Page id (webhook entry.id). */
export async function getDoctorIdByFacebookPageId(
  pageId: string,
  correlationId?: string
): Promise<string | null> {
  if (!pageId || !pageId.trim()) return null;
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    throw new InternalError('Service role client not available for Facebook page lookup');
  }
  const { data, error } = await supabase
    .from('doctor_facebook')
    .select('doctor_id')
    .eq('facebook_page_id', pageId.trim())
    .maybeSingle();
  if (error) handleSupabaseError(error, correlationId ?? '');
  return data?.doctor_id ? String(data.doctor_id) : null;
}

export async function getFacebookPageAccessTokenForDoctor(
  doctorId: string,
  correlationId?: string
): Promise<string | null> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    throw new InternalError('Service role client not available for Facebook token lookup');
  }
  const { data, error } = await supabase
    .from('doctor_facebook')
    .select('page_access_token')
    .eq('doctor_id', doctorId)
    .maybeSingle();
  if (error) handleSupabaseError(error, correlationId ?? '');
  const token = data?.page_access_token;
  return typeof token === 'string' && token.trim().length > 0 ? token.trim() : null;
}

export async function getStoredFacebookPageIdForDoctor(
  doctorId: string,
  correlationId?: string
): Promise<string | null> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    throw new InternalError('Service role client not available for Facebook page id lookup');
  }
  const { data, error } = await supabase
    .from('doctor_facebook')
    .select('facebook_page_id')
    .eq('doctor_id', doctorId)
    .maybeSingle();
  if (error) handleSupabaseError(error, correlationId ?? '');
  return data?.facebook_page_id ? String(data.facebook_page_id) : null;
}

/** Best-effort last DM success timestamp for health UI. */
export async function recordFacebookLastDmSuccess(
  doctorId: string,
  correlationId?: string
): Promise<void> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return;
  const { error } = await supabase
    .from('doctor_facebook')
    .update({ facebook_last_dm_success_at: new Date().toISOString() })
    .eq('doctor_id', doctorId);
  if (error) {
    logger.warn({ correlationId, doctorId }, 'Facebook: could not record last DM success time');
  }
}

/**
 * Public reply on a Facebook Page comment.
 * POST /{comment-id}/comments (Page token).
 */
export async function replyToFacebookComment(
  commentId: string,
  message: string,
  pageAccessToken: string,
  correlationId: string
): Promise<{ replyId: string } | null> {
  if (!commentId || !message?.trim() || !pageAccessToken) {
    return null;
  }
  try {
    const res = await axios.post<{ id?: string }>(
      `${FACEBOOK_GRAPH_BASE}/${encodeURIComponent(commentId)}/comments`,
      null,
      {
        params: {
          message: message.trim(),
          access_token: pageAccessToken.trim(),
        },
        timeout: META_HTTP_TIMEOUT_MS,
      }
    );
    const replyId = res.data?.id;
    if (replyId) {
      logger.info({ correlationId, commentId }, 'Facebook comment public reply ok');
      return { replyId: String(replyId) };
    }
    return null;
  } catch (err: unknown) {
    const status = axios.isAxiosError(err) ? err.response?.status : undefined;
    logger.warn(
      {
        correlationId,
        commentId,
        status,
        message: axios.isAxiosError(err) ? err.message : 'comment reply failed',
      },
      'Facebook comment public reply failed'
    );
    return null;
  }
}
