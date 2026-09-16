import { getFreshBrowserAccessToken } from "@/lib/auth/browser-access-token";

/**
 * Browser fetch that retries once after a 401 with a refreshed session JWT.
 * Server callers keep the token they already have (SSR / layout).
 */
export async function authorizedFetch(
  url: string,
  options: RequestInit & { token?: string },
  retried = false
): Promise<Response> {
  const { token, headers: initHeaders, ...rest } = options;
  const headers = new Headers(initHeaders);
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(url, {
    ...rest,
    headers,
    cache: rest.cache ?? "no-store",
  });

  if (res.status === 401 && !retried && token) {
    const fresh = await getFreshBrowserAccessToken(token);
    if (fresh && fresh !== token) {
      return authorizedFetch(url, { ...options, token: fresh }, true);
    }
  }

  return res;
}
