import { rewriteOAuthFrontendPathToBridge } from '../../../src/utils/oauth-frontend-redirect';

describe('rewriteOAuthFrontendPathToBridge', () => {
  it('rewrites legacy dashboard hub paths to the Instagram bridge', () => {
    const url = new URL('https://app.example/dashboard/settings/integrations');
    rewriteOAuthFrontendPathToBridge(url, '/auth/instagram-return');
    expect(url.pathname).toBe('/auth/instagram-return');
  });

  it('rewrites /dashboard/settings and /dashboard/settings/instagram', () => {
    for (const path of ['/dashboard/settings', '/dashboard/settings/instagram']) {
      const url = new URL(`https://app.example${path}`);
      rewriteOAuthFrontendPathToBridge(url, '/auth/instagram-return');
      expect(url.pathname).toBe('/auth/instagram-return');
    }
  });

  it('leaves an existing bridge path unchanged', () => {
    const url = new URL('https://app.example/auth/instagram-return');
    rewriteOAuthFrontendPathToBridge(url, '/auth/instagram-return');
    expect(url.pathname).toBe('/auth/instagram-return');
  });

  it('rewrites dashboard targets to the Facebook bridge', () => {
    const url = new URL('https://app.example/dashboard/settings');
    rewriteOAuthFrontendPathToBridge(url, '/auth/facebook-return');
    expect(url.pathname).toBe('/auth/facebook-return');
  });
});
