/**
 * Instagram Connect Service
 *
 * Service for doctor–Instagram linkage: resolve doctor_id from Instagram page ID
 * (e.g. from webhook payload) and OAuth connect flow (redirect, callback, save).
 *
 * IMPORTANT:
 * - No PHI in logs; no token/code in logs per COMPLIANCE.md
 * - Uses service role client for resolution and for save (callback has no user session)
 *
 * @see ARCHITECTURE.md - Service layer
 * @see docs/Work/Daily-plans/2026-02-06/e-task-2-webhook-resolution-page-id-to-doctor-id.md
 * @see docs/Work/Daily-plans/2026-02-06/e-task-3-instagram-connect-flow-oauth.md
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
import type { InstagramConnectStatePayload } from '../types/instagram-connect';
import type { InsertDoctorInstagram } from '../types/database';

// ============================================================================
// Constants (Instagram API with Instagram Login — ilr-18 / e-task-13)
// ============================================================================
// Doctor authorizes with Instagram credentials (no Facebook Page / Business Suite).
// Webhooks resolve on the Instagram professional account id stored in instagram_page_id.

const INSTAGRAM_OAUTH_AUTHORIZE = 'https://www.instagram.com/oauth/authorize';
const INSTAGRAM_OAUTH_ACCESS_TOKEN = 'https://api.instagram.com/oauth/access_token';
const INSTAGRAM_GRAPH_BASE = 'https://graph.instagram.com';
const FACEBOOK_GRAPH_BASE = 'https://graph.facebook.com/v18.0'; // debug_token still uses FB Graph
/** Business Login for Instagram scopes (messages + comments; no content_publish for MVP). */
const INSTAGRAM_BUSINESS_SCOPES = [
  'instagram_business_basic',
  'instagram_business_manage_messages',
  'instagram_business_manage_comments',
];
const META_HTTP_TIMEOUT_MS = 10000;

// ============================================================================
// Resolution: page_id → doctor_id
// ============================================================================

/**
 * Resolve doctor_id from Instagram page ID.
 *
 * Queries doctor_instagram by instagram_page_id (set when doctor connects
 * Instagram in e-task-3). Used by webhook worker to route incoming DMs
 * to the correct doctor.
 *
 * @param pageId - Instagram page/object ID (e.g. from webhook entry[0].id)
 * @param correlationId - Optional request correlation ID for audit logs
 * @returns doctor_id (UUID) if page is linked, null if no row found
 * @throws InternalError if service role client unavailable or query fails
 *
 * Logging: Only correlationId and pageId (no PHI) per COMPLIANCE.md.
 */
export async function getDoctorIdByPageId(
  pageId: string,
  correlationId?: string
): Promise<string | null> {
  if (!pageId || typeof pageId !== 'string') {
    return null;
  }

  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    throw new InternalError('Service role client not available for doctor resolution');
  }

  const { data, error } = await supabase
    .from('doctor_instagram')
    .select('doctor_id')
    .eq('instagram_page_id', pageId)
    .maybeSingle();

  if (error) {
    handleSupabaseError(error, correlationId ?? '');
  }

  if (data?.doctor_id) {
    logger.debug(
      { correlationId, pageId },
      'Resolved doctor from Instagram page ID'
    );
    return data.doctor_id as string;
  }

  logger.warn(
    { correlationId, pageId },
    'No doctor linked for Instagram page ID. Connect this Instagram account in the app (Settings → Instagram) so DMs receive replies.'
  );
  return null;
}

/**
 * Resolve doctor by trying multiple page IDs (e.g. from all webhook entries).
 * If none match and there is exactly one connected doctor, return that doctor (single-tenant fallback).
 * Logs "No doctor linked" only once when all lookups fail.
 */
export async function getDoctorIdByPageIds(
  pageIds: string[],
  correlationId?: string
): Promise<string | null> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    throw new InternalError('Service role client not available for doctor resolution');
  }
  for (const pageId of pageIds) {
    if (!pageId || typeof pageId !== 'string') continue;
    const { data, error } = await supabase
      .from('doctor_instagram')
      .select('doctor_id')
      .eq('instagram_page_id', pageId)
      .maybeSingle();
    if (error) handleSupabaseError(error, correlationId ?? '');
    if (data?.doctor_id) {
      logger.debug({ correlationId, pageId }, 'Resolved doctor from Instagram page ID');
      return data.doctor_id as string;
    }
    const { data: fbData, error: fbError } = await supabase
      .from('doctor_instagram')
      .select('doctor_id')
      .eq('facebook_page_id', pageId)
      .maybeSingle();
    if (fbError) handleSupabaseError(fbError, correlationId ?? '');
    if (fbData?.doctor_id) {
      logger.debug({ correlationId, pageId }, 'Resolved doctor from Facebook page ID (webhook entry.id)');
      return fbData.doctor_id as string;
    }
  }
  if (pageIds.length === 0) return null;
  const { data: allRows, error: listError } = await supabase
    .from('doctor_instagram')
    .select('doctor_id')
    .limit(2);
  if (listError) handleSupabaseError(listError, correlationId ?? '');
  if (allRows?.length === 1) {
    logger.info(
      { correlationId, pageIds },
      'Single doctor_instagram row: using it for webhook (page ID mismatch fallback)'
    );
    return allRows[0].doctor_id as string;
  }
  logger.warn(
    { correlationId, pageIds },
    'No doctor linked for Instagram page ID(s). Connect this Instagram account in the app (Settings → Instagram) so DMs receive replies.'
  );
  return null;
}

// ============================================================================
// Connection status for current doctor (e-task-5 frontend)
// ============================================================================

export interface ConnectionStatus {
  connected: boolean;
  username: string | null;
}

/**
 * Get connection status for a doctor (for settings UI).
 * Returns connected and optional username; no token in response (COMPLIANCE).
 *
 * @param doctorId - Authenticated doctor UUID (from req.user.id)
 * @param correlationId - Optional for logs
 */
export async function getConnectionStatus(
  doctorId: string,
  correlationId?: string
): Promise<ConnectionStatus> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    throw new InternalError('Service role client not available for status');
  }

  const { data, error } = await supabase
    .from('doctor_instagram')
    .select('instagram_username')
    .eq('doctor_id', doctorId)
    .maybeSingle();

  if (error) {
    handleSupabaseError(error, correlationId ?? '');
  }

  if (data) {
    return {
      connected: true,
      username: (data.instagram_username as string | null) ?? null,
    };
  }
  return { connected: false, username: null };
}

// ============================================================================
// Connection health (RBH-10) — Meta debug_token, 5-minute cache, no PHI in API
// ============================================================================

const HEALTH_CACHE_TTL_MS = 5 * 60 * 1000;
const TOKEN_EXPIRY_WARN_MS = 7 * 24 * 60 * 60 * 1000;
const STALE_DM_WARN_MS = 14 * 24 * 60 * 60 * 1000;

/** Dashboard / status API: safe summary for doctors */
export interface InstagramHealthSummary {
  level: 'ok' | 'warning' | 'error' | 'unknown' | 'not_connected';
  checkedAt: string | null;
  tokenExpiresAt: string | null;
  lastDmSuccessAt: string | null;
  message: string;
  reconnectRecommended: boolean;
}

function notConnectedHealth(): InstagramHealthSummary {
  return {
    level: 'not_connected',
    checkedAt: null,
    tokenExpiresAt: null,
    lastDmSuccessAt: null,
    message: 'Connect Instagram to enable automated replies.',
    reconnectRecommended: true,
  };
}

interface DoctorInstagramHealthRow {
  instagram_access_token: string;
  instagram_health_checked_at: string | null;
  instagram_health_level: string | null;
  instagram_health_error_code: string | null;
  instagram_token_expires_at: string | null;
  instagram_last_dm_success_at: string | null;
}

interface MetaDebugTokenData {
  app_id?: string;
  is_valid?: boolean;
  expires_at?: number;
  data_access_expires_at?: number;
  error?: { code?: number; subcode?: number; message?: string };
}

async function fetchMetaDebugToken(
  inputToken: string,
  correlationId: string
): Promise<{ data: MetaDebugTokenData | null; requestFailed: boolean }> {
  const appId = env.INSTAGRAM_APP_ID;
  const appSecret = env.INSTAGRAM_APP_SECRET;
  if (!appId || !appSecret) {
    logger.warn({ correlationId }, 'Instagram health: app id/secret not configured');
    return { data: null, requestFailed: false };
  }
  const appAccessToken = `${appId}|${appSecret}`;
  const url = `${FACEBOOK_GRAPH_BASE}/debug_token`;
  try {
    const res = await axios.get<{ data?: MetaDebugTokenData }>(url, {
      params: {
        input_token: inputToken,
        access_token: appAccessToken,
      },
      timeout: META_HTTP_TIMEOUT_MS,
    });
    return { data: res.data?.data ?? null, requestFailed: false };
  } catch (err: unknown) {
    const status = axios.isAxiosError(err) ? err.response?.status : undefined;
    logger.warn(
      { correlationId, status, message: axios.isAxiosError(err) ? err.message : 'debug_token failed' },
      'Instagram health: Meta debug_token request failed'
    );
    return { data: null, requestFailed: true };
  }
}

function summarizeHealthFromMetaAndRow(
  debug: MetaDebugTokenData | null,
  lastDmSuccessAt: string | null,
  requestFailed: boolean
): {
  level: 'ok' | 'warning' | 'error' | 'unknown';
  errorCode: string | null;
  tokenExpiresAt: string | null;
  message: string;
  reconnectRecommended: boolean;
} {
  if (requestFailed) {
    return {
      level: 'unknown',
      errorCode: null,
      tokenExpiresAt: null,
      message:
        "We couldn't verify your Instagram token with Meta right now. If patients can't reach the bot, try reconnecting.",
      reconnectRecommended: false,
    };
  }
  if (!debug) {
    return {
      level: 'unknown',
      errorCode: null,
      tokenExpiresAt: null,
      message:
        'Could not read token details from Meta. Check server configuration or try reconnecting.',
      reconnectRecommended: false,
    };
  }
  if (debug.error?.code != null) {
    return {
      level: 'error',
      errorCode: String(debug.error.code),
      tokenExpiresAt: null,
      message: 'Instagram reported a problem with your access token. Reconnect your account.',
      reconnectRecommended: true,
    };
  }
  if (debug.is_valid === false) {
    return {
      level: 'error',
      errorCode: null,
      tokenExpiresAt: null,
      message: 'Your Instagram access token is no longer valid. Reconnect your account.',
      reconnectRecommended: true,
    };
  }
  if (debug.is_valid !== true) {
    return {
      level: 'unknown',
      errorCode: null,
      tokenExpiresAt: null,
      message: 'Meta returned an unexpected token status. Try reconnecting if problems continue.',
      reconnectRecommended: false,
    };
  }

  let tokenExpiresAt: string | null = null;
  let expMs: number | null = null;
  if (typeof debug.expires_at === 'number' && debug.expires_at > 0) {
    expMs = debug.expires_at * 1000;
    tokenExpiresAt = new Date(expMs).toISOString();
  }
  const now = Date.now();
  if (expMs != null && expMs < now + TOKEN_EXPIRY_WARN_MS) {
    return {
      level: 'warning',
      errorCode: null,
      tokenExpiresAt,
      message: 'Your Instagram access token expires soon. Reconnect to avoid interruptions.',
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
          'No automated DM reply has been recorded recently. If something seems off, reconnect or check Meta / inbox.',
        reconnectRecommended: false,
      };
    }
  }

  return {
    level: 'ok',
    errorCode: null,
    tokenExpiresAt,
    message: 'Instagram connection looks healthy.',
    reconnectRecommended: false,
  };
}

async function persistInstagramHealth(
  doctorId: string,
  summary: ReturnType<typeof summarizeHealthFromMetaAndRow>,
  tokenExpiresAtIso: string | null,
  correlationId: string
): Promise<void> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return;
  const { error } = await supabase
    .from('doctor_instagram')
    .update({
      instagram_health_checked_at: new Date().toISOString(),
      instagram_health_level: summary.level,
      instagram_health_error_code: summary.errorCode,
      instagram_token_expires_at: tokenExpiresAtIso,
    })
    .eq('doctor_id', doctorId);
  if (error) {
    logger.warn({ correlationId, doctorId }, 'Instagram health: failed to persist snapshot');
  }
}

function summaryFromCachedRow(row: DoctorInstagramHealthRow): InstagramHealthSummary {
  const checkedAt = row.instagram_health_checked_at;
  const tokenExpiresAt = row.instagram_token_expires_at;
  const lastDm = row.instagram_last_dm_success_at;
  const levelRaw = row.instagram_health_level;
  let level: InstagramHealthSummary['level'] = 'unknown';
  if (levelRaw === 'ok' || levelRaw === 'warning' || levelRaw === 'error' || levelRaw === 'unknown') {
    level = levelRaw;
  }

  let message = 'Could not confirm token health. Try again later or reconnect.';
  let reconnectRecommended = level === 'error';
  if (level === 'ok') {
    message = 'Instagram connection looks healthy.';
  } else if (level === 'warning') {
    message =
      'Check token expiry or recent DM activity. Reconnect if patients report the bot is not replying.';
    reconnectRecommended = true;
  } else if (level === 'error') {
    message = 'Instagram access token needs attention. Reconnect your account.';
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
 * Connection + health for dashboard (Meta debug_token, cached 5 minutes).
 */
export async function getInstagramDashboardStatus(
  doctorId: string,
  correlationId: string
): Promise<{
  connected: boolean;
  username: string | null;
  health: InstagramHealthSummary;
}> {
  const basic = await getConnectionStatus(doctorId, correlationId);
  if (!basic.connected) {
    return {
      ...basic,
      health: notConnectedHealth(),
    };
  }

  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    throw new InternalError('Service role client not available for Instagram health');
  }

  const { data, error } = await supabase
    .from('doctor_instagram')
    .select(
      'instagram_access_token, instagram_health_checked_at, instagram_health_level, instagram_health_error_code, instagram_token_expires_at, instagram_last_dm_success_at'
    )
    .eq('doctor_id', doctorId)
    .maybeSingle();

  if (error) handleSupabaseError(error, correlationId);

  const row = data as DoctorInstagramHealthRow | null;
  if (!row?.instagram_access_token) {
    return {
      ...basic,
      health: {
        level: 'unknown',
        checkedAt: null,
        tokenExpiresAt: null,
        lastDmSuccessAt: null,
        message: 'Connection data incomplete. Try reconnecting.',
        reconnectRecommended: true,
      },
    };
  }

  const checkedMs = row.instagram_health_checked_at
    ? new Date(row.instagram_health_checked_at).getTime()
    : 0;
  const cacheFresh =
    checkedMs > 0 && Date.now() - checkedMs < HEALTH_CACHE_TTL_MS && !!row.instagram_health_level;

  if (cacheFresh) {
    return { ...basic, health: summaryFromCachedRow(row) };
  }

  const { data: debugData, requestFailed } = await fetchMetaDebugToken(
    row.instagram_access_token,
    correlationId
  );
  const summary = summarizeHealthFromMetaAndRow(
    debugData,
    row.instagram_last_dm_success_at,
    requestFailed
  );
  const tokenExpiresIso =
    summary.tokenExpiresAt ??
    (typeof debugData?.expires_at === 'number' && debugData.expires_at > 0
      ? new Date(debugData.expires_at * 1000).toISOString()
      : null);

  await persistInstagramHealth(doctorId, summary, tokenExpiresIso, correlationId);

  return {
    ...basic,
    health: {
      level: summary.level,
      checkedAt: new Date().toISOString(),
      tokenExpiresAt: tokenExpiresIso,
      lastDmSuccessAt: row.instagram_last_dm_success_at,
      message: summary.message,
      reconnectRecommended: summary.reconnectRecommended,
    },
  };
}

/**
 * Force-refresh Instagram token health (ilr-04 + ilr-19).
 * 1) If stored expiry is within the warn window (or missing/past), attempt
 *    `ig_refresh_token` and persist the new token.
 * 2) Re-check via Meta debug_token (bypasses 5-min cache).
 * Returns null if not connected / no token.
 */
export async function forceRefreshInstagramHealth(
  doctorId: string,
  correlationId: string
): Promise<InstagramHealthSummary | null> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    throw new InternalError('Service role client not available for Instagram health refresh');
  }

  const { data, error } = await supabase
    .from('doctor_instagram')
    .select(
      'instagram_access_token, instagram_last_dm_success_at, instagram_token_expires_at'
    )
    .eq('doctor_id', doctorId)
    .maybeSingle();

  if (error) handleSupabaseError(error, correlationId);

  const row = data as Pick<
    DoctorInstagramHealthRow,
    'instagram_access_token' | 'instagram_last_dm_success_at' | 'instagram_token_expires_at'
  > | null;
  if (!row?.instagram_access_token) {
    return null;
  }

  let accessToken = row.instagram_access_token;
  const expiresMs = row.instagram_token_expires_at
    ? new Date(row.instagram_token_expires_at).getTime()
    : null;
  const needsRefresh =
    expiresMs == null ||
    Number.isNaN(expiresMs) ||
    expiresMs < Date.now() + TOKEN_EXPIRY_WARN_MS;

  if (needsRefresh) {
    const refreshed = await refreshInstagramLongLivedToken(accessToken, correlationId);
    if (refreshed) {
      accessToken = refreshed.accessToken;
      const newExpiresIso =
        refreshed.expiresIn != null
          ? new Date(Date.now() + refreshed.expiresIn * 1000).toISOString()
          : null;
      const { error: updateErr } = await supabase
        .from('doctor_instagram')
        .update({
          instagram_access_token: accessToken,
          ...(newExpiresIso ? { instagram_token_expires_at: newExpiresIso } : {}),
        })
        .eq('doctor_id', doctorId);
      if (updateErr) {
        logger.warn({ correlationId, doctorId }, 'Instagram: failed to persist refreshed token');
      } else {
        logger.info({ correlationId, doctorId }, 'Instagram long-lived token refreshed');
      }
    }
  }

  const { data: debugData, requestFailed } = await fetchMetaDebugToken(
    accessToken,
    correlationId
  );
  const summary = summarizeHealthFromMetaAndRow(
    debugData,
    row.instagram_last_dm_success_at,
    requestFailed
  );
  const tokenExpiresIso =
    summary.tokenExpiresAt ??
    (typeof debugData?.expires_at === 'number' && debugData.expires_at > 0
      ? new Date(debugData.expires_at * 1000).toISOString()
      : null);

  await persistInstagramHealth(doctorId, summary, tokenExpiresIso, correlationId);

  return {
    level: summary.level,
    checkedAt: new Date().toISOString(),
    tokenExpiresAt: tokenExpiresIso,
    lastDmSuccessAt: row.instagram_last_dm_success_at,
    message: summary.message,
    reconnectRecommended: summary.reconnectRecommended,
  };
}

/**
 * Record last successful bot DM (worker). Best-effort; no throw.
 */
export async function recordInstagramLastDmSuccess(doctorId: string, correlationId?: string): Promise<void> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return;
  const { error } = await supabase
    .from('doctor_instagram')
    .update({ instagram_last_dm_success_at: new Date().toISOString() })
    .eq('doctor_id', doctorId);
  if (error) {
    logger.warn({ correlationId, doctorId }, 'Instagram: could not record last DM success time');
  }
}

// ============================================================================
// OAuth state (CSRF-safe)
// ============================================================================

/**
 * Create a signed state parameter for OAuth redirect.
 * Callback will verify signature and extract doctor_id.
 *
 * @param doctorId - Authenticated doctor UUID
 * @returns state string (base64url payload + '.' + base64url signature)
 */
export function createState(doctorId: string): string {
  const secret = env.INSTAGRAM_APP_SECRET;
  if (!secret) {
    throw new InternalError('Instagram OAuth not configured');
  }
  const nonce = crypto.randomBytes(16).toString('hex');
  const payload: InstagramConnectStatePayload = { n: nonce, d: doctorId };
  const payloadStr = JSON.stringify(payload);
  const payloadB64 = Buffer.from(payloadStr, 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');
  return `${payloadB64}.${sig}`;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Verify state parameter and return doctor_id.
 * Throws if state is missing, invalid, or tampered.
 *
 * @param state - state from callback query
 * @returns doctor_id (UUID)
 */
export function verifyState(state: string): string {
  if (!state || typeof state !== 'string') {
    throw new ValidationError('Missing or invalid state parameter');
  }
  const secret = env.INSTAGRAM_APP_SECRET;
  if (!secret) {
    throw new InternalError('Instagram OAuth not configured');
  }
  const parts = state.split('.');
  if (parts.length !== 2) {
    throw new ValidationError('Invalid state format');
  }
  const [payloadB64, sigB64] = parts;
  const expectedSig = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');
  const sigBuf = Buffer.from(sigB64, 'base64url');
  const expectedBuf = Buffer.from(expectedSig, 'base64url');
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    throw new UnauthorizedError('Invalid state (CSRF check failed)');
  }
  let payload: InstagramConnectStatePayload;
  try {
    const decoded = Buffer.from(payloadB64, 'base64url').toString('utf8');
    payload = JSON.parse(decoded) as InstagramConnectStatePayload;
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

// ============================================================================
// OAuth URL and token exchange (Instagram Login — ilr-18)
// ============================================================================

/**
 * Build Instagram Business Login OAuth URL for redirect (connect start).
 *
 * @param state - Signed state from createState(doctorId)
 * @returns Full URL to redirect the user to
 */
export function buildMetaOAuthUrl(state: string): string {
  const appId = env.INSTAGRAM_APP_ID;
  const redirectUri = env.INSTAGRAM_REDIRECT_URI;
  if (!appId || !redirectUri) {
    throw new InternalError('Instagram OAuth not configured (missing app id or redirect URI)');
  }
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    scope: INSTAGRAM_BUSINESS_SCOPES.join(','),
    state,
    response_type: 'code',
  });
  return `${INSTAGRAM_OAUTH_AUTHORIZE}?${params.toString()}`;
}

export interface ExchangeCodeResult {
  accessToken: string;
  /** Instagram professional account id from the short-lived exchange. */
  userId: string;
}

export interface LongLivedTokenResult {
  accessToken: string;
  /** Seconds until expiry when Meta returns expires_in (~60 days). */
  expiresIn: number | null;
}

export interface InstagramUserInfo {
  userId: string;
  username: string | null;
}

/**
 * Exchange authorization code for a short-lived Instagram user access token.
 * POST api.instagram.com/oauth/access_token (form body).
 *
 * @param code - Authorization code from Instagram callback (may include trailing #_)
 * @param correlationId - For logs only (no code in logs)
 */
export async function exchangeCodeForShortLivedToken(
  code: string,
  correlationId: string
): Promise<ExchangeCodeResult> {
  const appId = env.INSTAGRAM_APP_ID;
  const appSecret = env.INSTAGRAM_APP_SECRET;
  const redirectUri = env.INSTAGRAM_REDIRECT_URI;
  if (!appId || !appSecret || !redirectUri) {
    throw new InternalError('Instagram OAuth not configured');
  }
  // Meta sometimes appends #_ to the code; strip before exchange.
  const cleanCode = code.replace(/#_$/, '');
  const body = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
    code: cleanCode,
  });
  try {
    const res = await axios.post(INSTAGRAM_OAUTH_ACCESS_TOKEN, body.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: META_HTTP_TIMEOUT_MS,
    });
    const payload = res.data as {
      access_token?: string;
      user_id?: string | number;
      data?: Array<{ access_token?: string; user_id?: string | number }>;
    };
    const row = payload.data?.[0];
    const token = row?.access_token ?? payload.access_token;
    const rawUserId = row?.user_id ?? payload.user_id;
    const userId = rawUserId != null ? String(rawUserId) : '';
    if (!token || !userId) {
      logger.warn({ correlationId }, 'Instagram token response missing access_token or user_id');
      throw new UnauthorizedError('Failed to get access token from Instagram');
    }
    return { accessToken: token, userId };
  } catch (err: unknown) {
    if (err instanceof UnauthorizedError) throw err;
    const status = axios.isAxiosError(err) ? err.response?.status : undefined;
    logger.warn(
      { correlationId, status, message: axios.isAxiosError(err) ? err.message : 'Token exchange failed' },
      'Instagram code exchange failed'
    );
    throw new UnauthorizedError('Failed to exchange code for access token');
  }
}

/**
 * Exchange short-lived Instagram user token for long-lived (≈60 days).
 * GET graph.instagram.com/access_token?grant_type=ig_exchange_token
 */
export async function exchangeForLongLivedToken(
  shortLivedToken: string,
  correlationId: string
): Promise<LongLivedTokenResult> {
  const appSecret = env.INSTAGRAM_APP_SECRET;
  if (!appSecret) {
    throw new InternalError('Instagram OAuth not configured');
  }
  try {
    const res = await axios.get<{
      access_token?: string;
      expires_in?: number;
    }>(`${INSTAGRAM_GRAPH_BASE}/access_token`, {
      params: {
        grant_type: 'ig_exchange_token',
        client_secret: appSecret,
        access_token: shortLivedToken,
      },
      timeout: META_HTTP_TIMEOUT_MS,
    });
    const token = res.data?.access_token;
    if (!token) {
      logger.warn({ correlationId }, 'Instagram long-lived response missing access_token');
      throw new UnauthorizedError('Failed to get long-lived token from Instagram');
    }
    const expiresIn =
      typeof res.data?.expires_in === 'number' && res.data.expires_in > 0
        ? res.data.expires_in
        : null;
    return { accessToken: token, expiresIn };
  } catch (err: unknown) {
    if (err instanceof UnauthorizedError) throw err;
    logger.warn(
      { correlationId, message: axios.isAxiosError(err) ? err.message : 'Long-lived exchange failed' },
      'Instagram long-lived token exchange failed'
    );
    throw new UnauthorizedError('Failed to get long-lived access token');
  }
}

/**
 * Refresh a valid long-lived Instagram user token (extends ~60 days).
 * GET graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token
 * Returns null on failure (caller should nudge reconnect). Never logs the token.
 */
export async function refreshInstagramLongLivedToken(
  longLivedToken: string,
  correlationId: string
): Promise<LongLivedTokenResult | null> {
  try {
    const res = await axios.get<{
      access_token?: string;
      expires_in?: number;
    }>(`${INSTAGRAM_GRAPH_BASE}/refresh_access_token`, {
      params: {
        grant_type: 'ig_refresh_token',
        access_token: longLivedToken,
      },
      timeout: META_HTTP_TIMEOUT_MS,
    });
    const token = res.data?.access_token;
    if (!token) {
      logger.warn({ correlationId }, 'Instagram token refresh missing access_token');
      return null;
    }
    const expiresIn =
      typeof res.data?.expires_in === 'number' && res.data.expires_in > 0
        ? res.data.expires_in
        : null;
    return { accessToken: token, expiresIn };
  } catch (err: unknown) {
    const status = axios.isAxiosError(err) ? err.response?.status : undefined;
    logger.warn(
      { correlationId, status, message: axios.isAxiosError(err) ? err.message : 'refresh failed' },
      'Instagram token refresh failed'
    );
    return null;
  }
}

/**
 * Fetch Instagram professional account id + username for a user token.
 * GET graph.instagram.com/me?fields=user_id,username
 */
export async function getInstagramUserInfo(
  accessToken: string,
  correlationId: string
): Promise<InstagramUserInfo> {
  try {
    const res = await axios.get<{
      user_id?: string | number;
      id?: string | number;
      username?: string;
      data?: Array<{ user_id?: string | number; id?: string | number; username?: string }>;
    }>(`${INSTAGRAM_GRAPH_BASE}/v18.0/me`, {
      params: {
        fields: 'user_id,username',
        access_token: accessToken,
      },
      timeout: META_HTTP_TIMEOUT_MS,
    });
    const row = res.data?.data?.[0] ?? res.data;
    const rawId = row?.user_id ?? row?.id;
    const userId = rawId != null ? String(rawId) : '';
    if (!userId) {
      logger.warn({ correlationId }, 'Instagram /me missing user_id');
      throw new UnauthorizedError('Could not get Instagram account id');
    }
    const username =
      typeof row?.username === 'string' && row.username.trim().length > 0
        ? row.username.trim()
        : null;
    return { userId, username };
  } catch (err: unknown) {
    if (err instanceof UnauthorizedError) throw err;
    logger.warn(
      { correlationId, message: axios.isAxiosError(err) ? err.message : '/me failed' },
      'Instagram /me request failed'
    );
    throw new UnauthorizedError('Failed to get Instagram account info');
  }
}

// ============================================================================
// Get doctor token for sending (e-task-14)
// ============================================================================

/**
 * Get the Instagram access token for a doctor (for sending replies).
 * Used by webhook worker; token is never logged (COMPLIANCE).
 *
 * @param doctorId - Doctor UUID (from getDoctorIdByPageId)
 * @param correlationId - Optional for audit
 * @returns access token or null if no row
 */
/**
 * Get the stored Instagram page ID for a doctor (from connect flow).
 * Use this for Conversations API calls; webhook entry.id can be a different ID
 * (e.g. Facebook Page ID) that graph.instagram.com does not accept.
 *
 * @param doctorId - Doctor UUID
 * @param correlationId - Optional for audit
 * @returns instagram_page_id or null
 */
export async function getStoredInstagramPageIdForDoctor(
  doctorId: string,
  correlationId?: string
): Promise<string | null> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    throw new InternalError('Service role client not available for page ID lookup');
  }
  const { data, error } = await supabase
    .from('doctor_instagram')
    .select('instagram_page_id')
    .eq('doctor_id', doctorId)
    .maybeSingle();
  if (error) handleSupabaseError(error, correlationId ?? '');
  const id = data?.instagram_page_id;
  return id != null && String(id).length > 0 ? String(id) : null;
}

export async function getInstagramAccessTokenForDoctor(
  doctorId: string,
  correlationId?: string
): Promise<string | null> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    throw new InternalError('Service role client not available for token lookup');
  }

  const { data, error } = await supabase
    .from('doctor_instagram')
    .select('instagram_access_token')
    .eq('doctor_id', doctorId)
    .maybeSingle();

  if (error) {
    handleSupabaseError(error, correlationId ?? '');
  }

  const raw = data?.instagram_access_token;
  if (typeof raw !== 'string') return null;
  const token = raw.trim();
  return token.length > 0 ? token : null;
}

// ============================================================================
// Persist connection (upsert doctor_instagram)
// ============================================================================

export interface SaveDoctorInstagramInput {
  /** Instagram professional account id (webhook entry.id). */
  instagram_page_id: string;
  facebook_page_id?: string | null;
  instagram_access_token: string;
  instagram_username?: string | null;
  /**
   * ilr-02: Facebook app-scoped user id. Instagram Login does not provide one —
   * leave null; Meta data-deletion for IG-login connections is incomplete until
   * Meta provides a mappable identifier (document in ilr-17/18).
   */
  facebook_user_id?: string | null;
  /** ISO expiry from long-lived / refresh exchange when known. */
  instagram_token_expires_at?: string | null;
}

/**
 * Upsert doctor_instagram for the given doctor.
 * On unique violation (instagram_page_id already linked to another doctor), throws ConflictError.
 *
 * @param doctorId - Authenticated doctor UUID (from state)
 * @param input - page_id, token, optional username
 * @param correlationId - For audit; no token in logs
 */
export async function saveDoctorInstagram(
  doctorId: string,
  input: SaveDoctorInstagramInput,
  correlationId: string
): Promise<void> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    throw new InternalError('Service role client not available for saving Instagram link');
  }

  const row: InsertDoctorInstagram = {
    doctor_id: doctorId,
    instagram_page_id: input.instagram_page_id,
    facebook_page_id: input.facebook_page_id ?? null,
    instagram_access_token: input.instagram_access_token.trim(),
    instagram_username: input.instagram_username ?? null,
    facebook_user_id: input.facebook_user_id ?? null,
    instagram_health_checked_at: null,
    instagram_health_level: null,
    instagram_health_error_code: null,
    instagram_token_expires_at: input.instagram_token_expires_at ?? null,
  };

  const { error } = await supabase
    .from('doctor_instagram')
    .upsert(row, {
      onConflict: 'doctor_id',
      ignoreDuplicates: false,
    });

  if (error) {
    if (error.code === '23505') {
      throw new ConflictError('This Instagram page is already linked to another account');
    }
    handleSupabaseError(error, correlationId);
  }

  logger.info(
    { correlationId, doctorId, pageId: input.instagram_page_id },
    'Doctor Instagram connection saved'
  );
}

// ============================================================================
// Disconnect (e-task-4)
// ============================================================================

/**
 * Remove the doctor's Instagram link (delete row from doctor_instagram).
 * Idempotent: if no row exists for doctor_id, completes successfully.
 *
 * @param doctorId - Authenticated doctor UUID (from req.user.id)
 * @param correlationId - For audit; no token in logs
 * @throws InternalError if admin client unavailable or delete fails
 *
 * @see docs/Work/Daily-plans/2026-02-06/e-task-4-instagram-disconnect-endpoint.md
 */
export async function disconnectInstagram(
  doctorId: string,
  correlationId?: string
): Promise<void> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    throw new InternalError('Service role client not available for disconnect');
  }

  const { error } = await supabase
    .from('doctor_instagram')
    .delete()
    .eq('doctor_id', doctorId);

  if (error) {
    handleSupabaseError(error, correlationId ?? '');
  }

  logger.info(
    { correlationId, doctorId },
    'Doctor Instagram connection removed'
  );
}
