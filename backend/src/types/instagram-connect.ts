/**
 * Instagram Connect (OAuth) Types
 *
 * Types for Instagram API with Instagram Login OAuth token exchange and user info.
 * Used by instagram-connect-service. No PHI; no tokens in logs.
 *
 * @see docs/Development/Daily-plans/2026-02-06/e-task-3-instagram-connect-flow-oauth.md
 * @see docs/Development/Daily-plans/2026-02-06/e-task-13-instagram-api-instagram-login-migration.md
 */

/** Instagram API code exchange response (POST api.instagram.com/oauth/access_token) */
export interface InstagramApiTokenResponse {
  data: Array<{
    access_token: string;
    user_id: string;
    permissions?: string;
  }>;
}

/** Long-lived token exchange response (GET graph.instagram.com/access_token) */
export interface InstagramLongLivedTokenResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number;
}

/** Instagram API /me response (GET graph.instagram.com/me) - data is array */
export interface InstagramMeResponse {
  data?: Array<{
    user_id?: string;
    username?: string;
  }>;
}

/** Parsed state payload (CSRF-safe; contains nonce and doctor_id) */
export interface InstagramConnectStatePayload {
  n: string; // nonce
  d: string; // doctor_id
}
