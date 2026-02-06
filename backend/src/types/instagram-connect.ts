/**
 * Instagram Connect (OAuth) Types
 *
 * Types for Meta OAuth token exchange and page list responses.
 * Used by instagram-connect-service (e-task-3). No PHI; no tokens in logs.
 *
 * @see docs/Development/Daily-plans/2026-02-06/e-task-3-instagram-connect-flow-oauth.md
 */

/** Meta token endpoint response (short-lived or long-lived exchange) */
export interface MetaTokenResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number;
}

/** Single page from GET /me/accounts */
export interface MetaPage {
  id: string;
  access_token: string;
  name?: string;
}

/** Meta /me/accounts response */
export interface MetaPageListResponse {
  data: MetaPage[];
  paging?: { cursors?: { before?: string; after?: string } };
}

/** Instagram Business Account fields from page (GET /{page-id}?fields=instagram_business_account) */
export interface MetaPageWithIgAccount {
  instagram_business_account?: {
    id: string;
    username?: string;
  };
}

/** Parsed state payload (CSRF-safe; contains nonce and doctor_id) */
export interface InstagramConnectStatePayload {
  n: string; // nonce
  d: string; // doctor_id
}
