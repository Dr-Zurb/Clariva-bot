/**
 * Meta OAuth returns cross-site; a 302 straight into /dashboard/* often drops
 * SameSite=Lax Supabase cookies (middleware → /login). Rewrite legacy dashboard
 * targets to the public bridge; the client then navigates same-site.
 */
export function rewriteOAuthFrontendPathToBridge(
  url: URL,
  bridgePath: '/auth/instagram-return' | '/auth/facebook-return'
): void {
  const path = url.pathname.replace(/\/$/, '') || '/';
  if (path.startsWith('/dashboard')) {
    url.pathname = bridgePath;
  }
}
