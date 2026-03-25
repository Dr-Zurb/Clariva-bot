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
 * @see docs/Development/Daily-plans/2026-02-06/e-task-2-webhook-resolution-page-id-to-doctor-id.md
 * @see docs/Development/Daily-plans/2026-02-06/e-task-3-instagram-connect-flow-oauth.md
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
// Constants (Facebook Login / Page-linked path - e-task-1 Week 3)
// ============================================================================
// Uses Facebook OAuth to obtain Page access token; Instagram must be linked to Page.
// Goal: test whether Messenger Platform webhook includes sender/recipient for real DMs.

const FACEBOOK_OAUTH_AUTHORIZE = 'https://www.facebook.com/v18.0/dialog/oauth';
const FACEBOOK_OAUTH_ACCESS_TOKEN = 'https://graph.facebook.com/v18.0/oauth/access_token';
const FACEBOOK_GRAPH_BASE = 'https://graph.facebook.com/v18.0';
/** Scopes for Page-linked Instagram (Messenger Platform).
 * pages_show_list + business_management: required for me/accounts to return Pages (incl. business-owned).
 * pages_read_engagement: required for GET /{page-id}?fields=instagram_business_account (Meta error #100).
 * instagram_basic: required for /{page-id}/instagram_accounts fallback.
 * pages_manage_metadata, pages_messaging, instagram_manage_messages: for Page token and Instagram DMs.
 * instagram_manage_comments: required for POST /{comment-id}/replies (public reply to comments).
 * Note: ads_management omitted to avoid App Review; Pages linked via Business Manager may need it later. */
const FACEBOOK_SCOPES = [
  'pages_show_list',
  'business_management',
  'pages_read_engagement',
  'instagram_basic',
  'pages_manage_metadata',
  'pages_messaging',
  'instagram_manage_messages',
  'instagram_manage_comments',
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
    throw new InternalError('Facebook OAuth not configured');
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
    throw new InternalError('Facebook OAuth not configured');
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
// OAuth URL and token exchange
// ============================================================================

/**
 * Build Facebook OAuth URL for redirect (connect start).
 * Uses Facebook Login (facebook.com/dialog/oauth) for Page-linked Instagram.
 *
 * @param state - Signed state from createState(doctorId)
 * @returns Full URL to redirect the user to
 */
export function buildMetaOAuthUrl(state: string): string {
  const appId = env.INSTAGRAM_APP_ID;
  const redirectUri = env.INSTAGRAM_REDIRECT_URI;
  if (!appId || !redirectUri) {
    throw new InternalError('Facebook OAuth not configured (missing app id or redirect URI)');
  }
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    scope: FACEBOOK_SCOPES.join(','),
    state,
    response_type: 'code',
  });
  return `${FACEBOOK_OAUTH_AUTHORIZE}?${params.toString()}`;
}

export interface ExchangeCodeResult {
  accessToken: string;
  userId: string;
}

/** Facebook OAuth token response */
interface FacebookTokenResponse {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
}

/** Facebook Page with Instagram Business Account */
interface FacebookPageWithIg {
  id: string;
  access_token: string;
  instagram_business_account?: { id: string; username?: string };
}

/**
 * Exchange authorization code for short-lived user access token.
 * Facebook OAuth: GET graph.facebook.com/oauth/access_token.
 *
 * @param code - Authorization code from Facebook callback
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
    throw new InternalError('Facebook OAuth not configured');
  }
  const params = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    redirect_uri: redirectUri,
    code,
  });
  try {
    const res = await axios.get<FacebookTokenResponse>(
      `${FACEBOOK_OAUTH_ACCESS_TOKEN}?${params.toString()}`,
      { timeout: META_HTTP_TIMEOUT_MS }
    );
    const token = res.data?.access_token;
    if (!token) {
      logger.warn({ correlationId }, 'Facebook token response missing access_token');
      throw new UnauthorizedError('Failed to get access token from Facebook');
    }
    const userId = await getFacebookUserId(token, correlationId);
    return { accessToken: token, userId };
  } catch (err: unknown) {
    const status = axios.isAxiosError(err) ? err.response?.status : undefined;
    logger.warn(
      { correlationId, status, message: axios.isAxiosError(err) ? err.message : 'Token exchange failed' },
      'Facebook code exchange failed'
    );
    throw new UnauthorizedError('Failed to exchange code for access token');
  }
}

async function getFacebookUserId(accessToken: string, _correlationId: string): Promise<string> {
  const res = await axios.get<{ id?: string }>(`${FACEBOOK_GRAPH_BASE}/me`, {
    params: { fields: 'id', access_token: accessToken },
    timeout: META_HTTP_TIMEOUT_MS,
  });
  const id = res.data?.id;
  if (!id) {
    throw new UnauthorizedError('Could not get Facebook user ID');
  }
  return id;
}

/**
 * Exchange short-lived user token for long-lived (≈60 days).
 * Facebook: GET graph.facebook.com/oauth/access_token with grant_type=fb_exchange_token.
 */
export async function exchangeForLongLivedToken(
  shortLivedToken: string,
  correlationId: string
): Promise<string> {
  const appId = env.INSTAGRAM_APP_ID;
  const appSecret = env.INSTAGRAM_APP_SECRET;
  if (!appId || !appSecret) {
    throw new InternalError('Facebook OAuth not configured');
  }
  const params = new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: shortLivedToken,
  });
  try {
    const res = await axios.get<FacebookTokenResponse>(
      `${FACEBOOK_OAUTH_ACCESS_TOKEN}?${params.toString()}`,
      { timeout: META_HTTP_TIMEOUT_MS }
    );
    const token = res.data?.access_token;
    if (!token) {
      logger.warn({ correlationId }, 'Facebook long-lived response missing access_token');
      throw new UnauthorizedError('Failed to get long-lived token from Facebook');
    }
    return token;
  } catch (err: unknown) {
    logger.warn(
      { correlationId, message: axios.isAxiosError(err) ? err.message : 'Long-lived exchange failed' },
      'Facebook long-lived token exchange failed'
    );
    throw new UnauthorizedError('Failed to get long-lived access token');
  }
}

/**
 * Fetch user's Pages and get Page token + Instagram Business Account.
 * Returns first Page that has instagram_business_account linked.
 * Fallback: if me/accounts omits instagram_business_account (Business Manager linking),
 * query each Page separately with its token.
 *
 * @param userAccessToken - Long-lived user access token
 * @param correlationId - For logs only
 */
export async function getPageTokenAndInstagramAccount(
  userAccessToken: string,
  correlationId: string
): Promise<{
  pageAccessToken: string;
  instagramPageId: string;
  facebookPageId: string;
  instagramUsername: string | null;
}> {
  const url = `${FACEBOOK_GRAPH_BASE}/me/accounts`;
  const params = {
    fields: 'id,access_token,instagram_business_account{id,username}',
    access_token: userAccessToken,
  };
  try {
    const res = await axios.get<{ data?: FacebookPageWithIg[] }>(url, {
      params,
      timeout: META_HTTP_TIMEOUT_MS,
    });
    const pages = res.data?.data ?? [];
    const pageIds = pages.map((p) => p.id).filter(Boolean);
    logger.info(
      { correlationId, pageCount: pages.length, pageIds },
      'Facebook me/accounts: pages returned'
    );

    // First pass: use instagram_business_account from me/accounts if present
    for (const page of pages) {
      const ig = page.instagram_business_account;
      if (ig?.id && page.access_token && page.id) {
        return {
          pageAccessToken: page.access_token,
          instagramPageId: ig.id,
          facebookPageId: page.id,
          instagramUsername: ig.username ?? null,
        };
      }
    }

    // Fallback: me/accounts sometimes omits instagram_business_account for Business-linked assets.
    // Try Page token first (can work with ads_management); then user token (needs pages_read_engagement).
    for (const page of pages) {
      if (!page.access_token || !page.id) continue;
      const tokensToTry = [page.access_token, userAccessToken];
      for (const token of tokensToTry) {
        try {
          const pageRes = await axios.get<{ instagram_business_account?: { id: string; username?: string } }>(
            `${FACEBOOK_GRAPH_BASE}/${page.id}`,
            {
              params: {
                fields: 'instagram_business_account',
                access_token: token,
              },
              timeout: META_HTTP_TIMEOUT_MS,
            }
          );
          const ig = pageRes.data?.instagram_business_account;
          if (ig?.id && page.id) {
            logger.info(
              { correlationId, pageId: page.id },
              'Resolved Instagram via Page lookup fallback (me/accounts omitted it)'
            );
            return {
              pageAccessToken: page.access_token,
              instagramPageId: ig.id,
              facebookPageId: page.id,
              instagramUsername: ig.username ?? null,
            };
          }
          // instagram_business_account empty (common with Business Manager linking).
          // Try /{page-id}/instagram_accounts - requires instagram_basic. Try both tokens.
          const tokensForIgAccounts = [page.access_token, userAccessToken];
          for (const igToken of tokensForIgAccounts) {
            try {
              const igAccountsRes = await axios.get<{ data?: Array<{ id: string; username?: string }> }>(
                `${FACEBOOK_GRAPH_BASE}/${page.id}/instagram_accounts`,
                {
                  params: { fields: 'id,username', access_token: igToken },
                  timeout: META_HTTP_TIMEOUT_MS,
                }
              );
              const firstIg = igAccountsRes.data?.data?.[0];
              if (firstIg?.id && page.id) {
                logger.info(
                  { correlationId, pageId: page.id },
                  'Resolved Instagram via instagram_accounts fallback (Business Manager linking)'
                );
                return {
                  pageAccessToken: page.access_token,
                  instagramPageId: firstIg.id,
                  facebookPageId: page.id,
                  instagramUsername: firstIg.username ?? null,
                };
              }
              const count = igAccountsRes.data?.data?.length ?? 0;
              logger.info(
                { correlationId, pageId: page.id, igAccountCount: count },
                'instagram_accounts returned empty or no matching account'
              );
              break; // Don't retry with other token if we got a response
            } catch (igAccErr: unknown) {
              const status = axios.isAxiosError(igAccErr) ? igAccErr.response?.status : undefined;
              const metaBody = axios.isAxiosError(igAccErr) ? igAccErr.response?.data : undefined;
              logger.warn(
                { correlationId, pageId: page.id, status, metaBody },
                'instagram_accounts fallback failed'
              );
              if (igToken === tokensForIgAccounts[tokensForIgAccounts.length - 1]) break;
            }
          }
          logger.debug(
            { correlationId, pageId: page.id, hasIg: !!ig },
            'Page lookup: no instagram_business_account'
          );
          break; // Got response but no ig; try next page
        } catch (pageErr: unknown) {
          const status = axios.isAxiosError(pageErr) ? pageErr.response?.status : undefined;
          const errMsg = axios.isAxiosError(pageErr) ? pageErr.message : String(pageErr);
          const metaBody = axios.isAxiosError(pageErr) ? pageErr.response?.data : undefined;
          const usedPageToken = token === page.access_token;
          logger.warn(
            { correlationId, pageId: page.id, status, message: errMsg, metaBody, usedPageToken },
            'Page lookup for instagram_business_account failed'
          );
          if (token === tokensToTry[tokensToTry.length - 1]) break;
        }
      }
    }

    logger.warn(
      { correlationId, pageCount: pages.length },
      'No Facebook Page with linked Instagram Business Account found'
    );
    throw new UnauthorizedError(
      'No Facebook Page with linked Instagram account found. Please link your Instagram Professional account to a Facebook Page in Meta Business Settings.'
    );
  } catch (err: unknown) {
    if (err instanceof UnauthorizedError) throw err;
    logger.warn(
      { correlationId, message: axios.isAxiosError(err) ? err.message : 'Pages request failed' },
      'Could not fetch Facebook Pages'
    );
    throw new UnauthorizedError('Failed to get Page and Instagram account from Facebook');
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
  instagram_page_id: string;
  facebook_page_id?: string | null;
  instagram_access_token: string;
  instagram_username?: string | null;
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
    instagram_health_checked_at: null,
    instagram_health_level: null,
    instagram_health_error_code: null,
    instagram_token_expires_at: null,
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
 * @see docs/Development/Daily-plans/2026-02-06/e-task-4-instagram-disconnect-endpoint.md
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
