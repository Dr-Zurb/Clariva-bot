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
  InstagramApiTokenResponse,
  InstagramLongLivedTokenResponse,
  InstagramMeResponse,
  InstagramConnectStatePayload,
} from '../types/instagram-connect';
import type { InsertDoctorInstagram } from '../types/database';

// ============================================================================
// Constants (Instagram API with Instagram Login - e-task-13)
// ============================================================================

const INSTAGRAM_OAUTH_AUTHORIZE = 'https://www.instagram.com/oauth/authorize';
const INSTAGRAM_OAUTH_ACCESS_TOKEN = 'https://api.instagram.com/oauth/access_token';
const INSTAGRAM_GRAPH_BASE = 'https://graph.instagram.com/v18.0';
/** Scopes for Instagram API with Instagram Login (Business login) */
const INSTAGRAM_SCOPES = [
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
 * Build Instagram OAuth URL for redirect (connect start).
 * Uses Instagram API with Instagram Login (www.instagram.com/oauth/authorize).
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
  return `${INSTAGRAM_OAUTH_AUTHORIZE}?${params.toString()}`;
}

export interface ExchangeCodeResult {
  accessToken: string;
  userId: string;
}

/**
 * Exchange authorization code for short-lived user access token.
 * Instagram API: POST to api.instagram.com/oauth/access_token.
 *
 * @param code - Authorization code from Instagram callback
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
  const form = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
    code,
  });
  try {
    const res = await axios.post<InstagramApiTokenResponse>(
      INSTAGRAM_OAUTH_ACCESS_TOKEN,
      form.toString(),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: META_HTTP_TIMEOUT_MS,
      }
    );
    const d = res.data;
    const fromArray = d?.data?.[0];
    const token = fromArray?.access_token ?? d?.access_token;
    const userId = fromArray?.user_id ?? d?.user_id;
    if (!token || !userId) {
      logger.warn({ correlationId }, 'Instagram token response missing access_token or user_id');
      throw new UnauthorizedError('Failed to get access token from Instagram');
    }
    return { accessToken: token, userId };
  } catch (err: unknown) {
    const status = axios.isAxiosError(err) ? err.response?.status : undefined;
    logger.warn(
      { correlationId, status, message: axios.isAxiosError(err) ? err.message : 'Token exchange failed' },
      'Instagram code exchange failed'
    );
    throw new UnauthorizedError('Failed to exchange code for access token');
  }
}

/**
 * Exchange short-lived user token for long-lived (≈60 days).
 * Instagram API: GET graph.instagram.com/access_token with grant_type=ig_exchange_token.
 */
export async function exchangeForLongLivedToken(
  shortLivedToken: string,
  correlationId: string
): Promise<string> {
  const appSecret = env.INSTAGRAM_APP_SECRET;
  if (!appSecret) {
    throw new InternalError('Instagram OAuth not configured');
  }
  const url = 'https://graph.instagram.com/access_token';
  const params = new URLSearchParams({
    grant_type: 'ig_exchange_token',
    client_secret: appSecret,
    access_token: shortLivedToken,
  });
  try {
    const res = await axios.get<InstagramLongLivedTokenResponse>(`${url}?${params.toString()}`, {
      timeout: META_HTTP_TIMEOUT_MS,
    });
    const token = res.data?.access_token;
    if (!token) {
      logger.warn({ correlationId }, 'Instagram long-lived response missing access_token');
      throw new UnauthorizedError('Failed to get long-lived token from Instagram');
    }
    return token;
  } catch (err: unknown) {
    logger.warn(
      { correlationId, message: axios.isAxiosError(err) ? err.message : 'Long-lived exchange failed' },
      'Instagram long-lived token exchange failed'
    );
    throw new UnauthorizedError('Failed to get long-lived access token');
  }
}

/**
 * Fetch Instagram user info (id, user_id, username) from /me.
 * Prefer id when present — it often matches webhook entry[].id (Meta can send different IDs).
 */
export async function getInstagramUserInfo(
  accessToken: string,
  correlationId: string
): Promise<{ id?: string; user_id: string; username: string | null }> {
  const url = `${INSTAGRAM_GRAPH_BASE}/me`;
  try {
    const res = await axios.get<InstagramMeResponse>(url, {
      params: { fields: 'id,user_id,username', access_token: accessToken },
      timeout: META_HTTP_TIMEOUT_MS,
    });
    const arr = res.data?.data;
    const first = Array.isArray(arr) ? arr[0] : undefined;
    const id = first?.id;
    const user_id = first?.user_id ?? '';
    const username = first?.username ?? null;
    return { id, user_id, username };
  } catch (err: unknown) {
    logger.debug(
      { correlationId, message: axios.isAxiosError(err) ? err.message : 'Me request failed' },
      'Could not fetch Instagram user info'
    );
    return { user_id: '', username: null };
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

  const token = data?.instagram_access_token;
  return typeof token === 'string' && token.length > 0 ? token : null;
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
