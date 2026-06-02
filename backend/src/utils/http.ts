import type { Response } from 'express';

export interface SunsetHeaderOptions {
  /** ISO8601 — RFC 8594 prefers HTTP-date; most clients tolerate ISO8601. */
  sunsetDate: string;
  /** URL path to the successor endpoint (may include placeholders). */
  successor: string;
  /** Optional documentation URL for the `deprecation` link relation. */
  link?: string;
}

/**
 * RFC 8594-style deprecation headers for legacy HTTP endpoints (pdm-12).
 */
export function setSunsetHeaders(res: Response, opts: SunsetHeaderOptions): void {
  res.setHeader('Sunset', opts.sunsetDate);
  res.setHeader('Deprecation', 'true');
  const links: string[] = [`<${opts.successor}>; rel="successor-version"`];
  if (opts.link) {
    links.push(`<${opts.link}>; rel="deprecation"; type="text/html"`);
  }
  res.setHeader('Link', links.join(', '));
}
