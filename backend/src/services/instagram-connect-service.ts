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
import type {
  MetaTokenResponse,
  MetaPageListResponse,
  MetaPageWithIgAccount,
  InstagramConnectStatePayload,
} from '../types/instagram-connect';
import type { InsertDoctorInstagram } from '../types/database';

// ============================================================================
// Constants
// ============================================================================

const META_GRAPH_BASE = 'https://graph.facebook.com/v18.0';
const META_OAUTH_DIALOG = 'https://www.facebook.com/v18.0/dialog/oauth';
/** Scopes for Instagram messaging and page access (Meta docs) */
const INSTAGRAM_SCOPES = [
  'pages_show_list',
  'pages_read_engagement',
  'instagram_basic',
  'instagram_manage_messages',
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

  logger.debug(
    { correlationId, pageId },
    'No doctor linked for Instagram page ID'
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
// OAuth URL and token exchange
// ============================================================================

/**
 * Build Meta OAuth URL for redirect (connect start).
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
    scope: INSTAGRAM_SCOPES.join(','),
    state,
    response_type: 'code',
  });
  return `${META_OAUTH_DIALOG}?${params.toString()}`;
}

/**
 * Exchange authorization code for short-lived user access token.
 *
 * @param code - Authorization code from Meta callback
 * @param correlationId - For logs only (no code in logs)
 */
export async function exchangeCodeForShortLivedToken(
  code: string,
  correlationId: string
): Promise<string> {
  const appId = env.INSTAGRAM_APP_ID;
  const appSecret = env.INSTAGRAM_APP_SECRET;
  const redirectUri = env.INSTAGRAM_REDIRECT_URI;
  if (!appId || !appSecret || !redirectUri) {
    throw new InternalError('Instagram OAuth not configured');
  }
  const url = `${META_GRAPH_BASE}/oauth/access_token`;
  const params = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    redirect_uri: redirectUri,
    code,
  });
  try {
    const res = await axios.get<MetaTokenResponse>(`${url}?${params.toString()}`, {
      timeout: META_HTTP_TIMEOUT_MS,
    });
    const token = res.data?.access_token;
    if (!token) {
      logger.warn({ correlationId }, 'Meta token response missing access_token');
      throw new UnauthorizedError('Failed to get access token from Meta');
    }
    return token;
  } catch (err: unknown) {
    const status = axios.isAxiosError(err) ? err.response?.status : undefined;
    logger.warn(
      { correlationId, status, message: axios.isAxiosError(err) ? err.message : 'Token exchange failed' },
      'Meta code exchange failed'
    );
    throw new UnauthorizedError('Failed to exchange code for access token');
  }
}

/**
 * Exchange short-lived user token for long-lived (≈60 days).
 */
export async function exchangeForLongLivedToken(
  shortLivedToken: string,
  correlationId: string
): Promise<string> {
  const appId = env.INSTAGRAM_APP_ID;
  const appSecret = env.INSTAGRAM_APP_SECRET;
  if (!appId || !appSecret) {
    throw new InternalError('Instagram OAuth not configured');
  }
  const url = `${META_GRAPH_BASE}/oauth/access_token`;
  const params = new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: shortLivedToken,
  });
  try {
    const res = await axios.get<MetaTokenResponse>(`${url}?${params.toString()}`, {
      timeout: META_HTTP_TIMEOUT_MS,
    });
    const token = res.data?.access_token;
    if (!token) {
      logger.warn({ correlationId }, 'Meta long-lived response missing access_token');
      throw new UnauthorizedError('Failed to get long-lived token from Meta');
    }
    return token;
  } catch (err: unknown) {
    logger.warn(
      { correlationId, message: axios.isAxiosError(err) ? err.message : 'Long-lived exchange failed' },
      'Meta long-lived token exchange failed'
    );
    throw new UnauthorizedError('Failed to get long-lived access token');
  }
}

/**
 * Fetch Facebook Pages for the user (with page access tokens).
 */
export async function getPageList(
  userAccessToken: string,
  correlationId: string
): Promise<{ id: string; access_token: string; name?: string }[]> {
  const url = `${META_GRAPH_BASE}/me/accounts`;
  try {
    const res = await axios.get<MetaPageListResponse>(url, {
      params: { access_token: userAccessToken, fields: 'id,access_token,name' },
      timeout: META_HTTP_TIMEOUT_MS,
    });
    const data = res.data?.data;
    if (!Array.isArray(data)) {
      logger.warn({ correlationId }, 'Meta page list missing data array');
      return [];
    }
    return data.map((p) => ({ id: p.id, access_token: p.access_token, name: p.name }));
  } catch (err: unknown) {
    logger.warn(
      { correlationId, message: axios.isAxiosError(err) ? err.message : 'Page list failed' },
      'Meta page list failed'
    );
    throw new UnauthorizedError('Failed to fetch connected pages');
  }
}

/**
 * Fetch Instagram Business Account username for a page (optional display).
 */
export async function getInstagramUsername(
  pageId: string,
  pageAccessToken: string,
  correlationId: string
): Promise<string | null> {
  const url = `${META_GRAPH_BASE}/${pageId}`;
  try {
    const res = await axios.get<MetaPageWithIgAccount>(url, {
      params: {
        access_token: pageAccessToken,
        fields: 'instagram_business_account{username}',
      },
      timeout: META_HTTP_TIMEOUT_MS,
    });
    const ig = res.data?.instagram_business_account;
    if (!ig?.username) return null;
    return ig.username;
  } catch {
    // Non-fatal; return null and continue without username
    logger.debug({ correlationId, pageId }, 'Could not fetch Instagram username for page');
    return null;
  }
}

// ============================================================================
// Persist connection (upsert doctor_instagram)
// ============================================================================

export interface SaveDoctorInstagramInput {
  instagram_page_id: string;
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
    instagram_access_token: input.instagram_access_token,
    instagram_username: input.instagram_username ?? null,
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
