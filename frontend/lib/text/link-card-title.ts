/**
 * A shared address becomes a readable card title.
 * Instagram does not give a reel name, so those stay a short label.
 */

const TITLE_MAX = 200;

export type SharedLinkKind = "instagram-reel" | "instagram-post" | "instagram" | "youtube" | "page";

export type ClassifiedLink = {
  url: URL;
  kind: SharedLinkKind;
  host: string;
};

export function classifyLink(raw: string): ClassifiedLink | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 500 || /\s/.test(trimmed)) return null;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  const host = url.hostname.replace(/^www\./i, "").toLowerCase();
  if (!host || !host.includes(".")) return null;
  return { url, kind: linkKind(host, url.pathname), host };
}

export function fallbackLinkTitle(raw: string): string {
  const classified = classifyLink(raw);
  if (!classified) return "Link";
  if (classified.kind === "instagram-reel") return "Instagram reel";
  if (classified.kind === "instagram-post") return "Instagram post";
  if (classified.kind === "instagram") return "Instagram";
  if (classified.kind === "youtube") return "YouTube";
  return classified.host.slice(0, TITLE_MAX);
}

export function cleanLinkTitle(value: string): string {
  const text = decodeEntities(value).replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  return text.slice(0, TITLE_MAX);
}

function linkKind(host: string, pathname: string): SharedLinkKind {
  const path = pathname.toLowerCase();
  if (host === "instagram.com" || host === "instagr.am") {
    if (path.startsWith("/reel/") || path.startsWith("/reels/")) return "instagram-reel";
    if (path.startsWith("/p/") || path.startsWith("/tv/")) return "instagram-post";
    return "instagram";
  }
  if (
    host === "youtube.com" ||
    host === "m.youtube.com" ||
    host === "music.youtube.com" ||
    host === "youtube-nocookie.com" ||
    host === "youtu.be"
  ) {
    return "youtube";
  }
  return "page";
}

function decodeEntities(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_, digits: string) => safeCodePoint(Number(digits)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => safeCodePoint(Number.parseInt(hex, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function safeCodePoint(code: number): string {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return "";
  return String.fromCodePoint(code);
}
