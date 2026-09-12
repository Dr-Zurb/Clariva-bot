import type { NextRequest } from "next/server";

/**
 * Public origin for redirects.
 *
 * Render's Next process listens on `localhost:10000`. `request.url` /
 * `nextUrl.origin` are that internal address, so a post-auth redirect
 * built from them sends Safari to a host that does not exist on the
 * doctor's laptop.
 */
const PRODUCTION_ORIGIN = "https://haloaid.com";

function firstHeader(request: NextRequest, name: string): string | undefined {
  return request.headers.get(name)?.split(",")[0]?.trim() || undefined;
}

function isRenderInternalHost(host: string): boolean {
  const hostname = host.split(":")[0]?.toLowerCase();
  return host === "localhost:10000" || hostname === "0.0.0.0";
}

export function publicRequestOrigin(request: NextRequest): string {
  const url = new URL(request.url);
  const forwardedHost = firstHeader(request, "x-forwarded-host");
  const forwardedProto = firstHeader(request, "x-forwarded-proto");

  if (forwardedHost) {
    const hostname = forwardedHost.split(":")[0]?.toLowerCase() ?? "";
    if (hostname === "haloaid.com" || hostname === "www.haloaid.com") {
      return `https://${hostname}`;
    }
    const proto =
      forwardedProto === "http" || forwardedProto === "https"
        ? forwardedProto
        : hostname === "localhost" || hostname === "127.0.0.1"
          ? "http"
          : "https";
    return `${proto}://${forwardedHost}`;
  }

  if (isRenderInternalHost(url.host)) {
    return PRODUCTION_ORIGIN;
  }

  return url.origin;
}
