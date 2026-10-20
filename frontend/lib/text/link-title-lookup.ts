/**
 * Looks up a public page title for a link the doctor shared.
 * YouTube answers with the video name. Instagram does not, so the caller
 * keeps the short label. The request never follows a private address.
 */

import { lookup } from "node:dns/promises";
import { classifyLink, cleanLinkTitle } from "@/lib/text/link-card-title";

const FETCH_MS = 4000;
const DNS_MS = 2000;
const MAX_HTML = 65_536;
const MAX_HOPS = 3;

export type LinkTitleDeps = {
  fetch: typeof fetch;
  addresses: (hostname: string) => Promise<string[]>;
};

const defaultDeps: LinkTitleDeps = {
  fetch: globalThis.fetch.bind(globalThis),
  addresses: async (hostname) => {
    const records = await lookup(hostname, { all: true, verbatim: true });
    return records.map((record) => record.address);
  },
};

export async function lookupLinkTitle(raw: string, deps: LinkTitleDeps = defaultDeps): Promise<string | null> {
  try {
    const classified = classifyLink(raw);
    if (!classified || classified.kind === "instagram" || classified.kind === "instagram-reel" || classified.kind === "instagram-post") {
      return null;
    }
    if (classified.kind === "youtube") return await youtubeTitle(classified.url, deps);
    return await pageTitle(classified.url, deps);
  } catch {
    return null;
  }
}

async function youtubeTitle(page: URL, deps: LinkTitleDeps): Promise<string | null> {
  const endpoint = new URL("https://www.youtube.com/oembed");
  endpoint.searchParams.set("url", youtubeWatchUrl(page));
  endpoint.searchParams.set("format", "json");
  const response = await deps.fetch(endpoint, { signal: AbortSignal.timeout(FETCH_MS) });
  if (!response.ok) return null;
  const body = (await response.json()) as { title?: unknown };
  const title = typeof body.title === "string" ? cleanLinkTitle(body.title) : "";
  return title || null;
}

async function pageTitle(start: URL, deps: LinkTitleDeps): Promise<string | null> {
  let current = start;
  for (let hop = 0; hop < MAX_HOPS; hop += 1) {
    if (!(await hostIsPublic(current.hostname, deps))) return null;
    const response = await deps.fetch(current, {
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_MS),
      headers: {
        Accept: "text/html",
        "User-Agent": "Mozilla/5.0 (compatible; HaloAidLinkTitle/1.0)",
      },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return null;
      current = new URL(location, current);
      continue;
    }
    if (!response.ok) return null;
    const type = response.headers.get("content-type") ?? "";
    if (type && !type.includes("text/html") && !type.includes("application/xhtml")) return null;
    return htmlPageTitle(await readLimited(response, MAX_HTML));
  }
  return null;
}

export function htmlPageTitle(html: string): string | null {
  const patterns = [
    /<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']*)["'][^>]*>/i,
    /<meta[^>]*content=["']([^"']*)["'][^>]*property=["']og:title["'][^>]*>/i,
    /<meta[^>]*name=["']twitter:title["'][^>]*content=["']([^"']*)["'][^>]*>/i,
    /<meta[^>]*content=["']([^"']*)["'][^>]*name=["']twitter:title["'][^>]*>/i,
    /<title[^>]*>([\s\S]*?)<\/title>/i,
  ];
  for (const pattern of patterns) {
    const title = cleanLinkTitle(pattern.exec(html)?.[1] ?? "");
    if (title) return title;
  }
  return null;
}

function youtubeWatchUrl(page: URL): string {
  const host = page.hostname.replace(/^www\./i, "").toLowerCase();
  if (host === "youtu.be") {
    const id = page.pathname.split("/").filter(Boolean)[0];
    if (id) return watchUrl(id);
  }
  const shorts = /^\/shorts\/([^/?#]+)/.exec(page.pathname);
  if (shorts?.[1]) return watchUrl(shorts[1]);
  return page.toString();
}

function watchUrl(id: string): string {
  const watch = new URL("https://www.youtube.com/watch");
  watch.searchParams.set("v", id);
  return watch.toString();
}

async function hostIsPublic(hostname: string, deps: LinkTitleDeps): Promise<boolean> {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    return false;
  }
  if (isIpAddress(host)) return !isPrivateAddress(host);
  const addresses = await withTimeout(deps.addresses(host), DNS_MS);
  return addresses.length > 0 && addresses.every((address) => !isPrivateAddress(address));
}

function isIpAddress(host: string): boolean {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(host) || host.includes(":");
}

function isPrivateAddress(address: string): boolean {
  const raw = address.toLowerCase().replace(/^\[|\]$/g, "");
  if (raw === "::1" || raw.startsWith("fe80:") || raw.startsWith("fc") || raw.startsWith("fd")) return true;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(raw);
  const parts = (mapped?.[1] ?? raw).split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a >= 224) return true;
  return false;
}

async function readLimited(response: Response, max: number): Promise<string> {
  if (!response.body) return (await response.text()).slice(0, max);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < max) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    const slice = value.byteLength > max - total ? value.slice(0, max - total) : value;
    chunks.push(slice);
    total += slice.byteLength;
  }
  await reader.cancel().catch(() => undefined);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
