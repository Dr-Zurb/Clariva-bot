/**
 * text-C7 — PWA share-target staging bridge.
 *
 * OS share sheet → SW POST intercept → Cache API → this module hands
 * blobs to the text consult composer via sessionStorage key handoff.
 */

import { requestTextSessionToken } from "@/lib/api";

/** Versioned cache bucket written by `frontend/public/sw.js`. */
export const SHARE_TARGET_CACHE_NAME = "share-target-staging-v1";

/** sessionStorage key for cache entry ids between `/c/share-target` and `/c/text/...`. */
export const SHARE_TARGET_PENDING_FILES_KEY = "share-target-pending-files";

/** Prefix for per-session HMAC tokens (see `/c/text/[sessionId]/page.tsx`). */
export const TEXT_CONSULT_TOKEN_PREFIX = "clariva.consult.text.token.";

/** localStorage registry of recent text consult visits (60 min window). */
export const TEXT_CONSULT_RECENT_KEY = "clariva.consult.text.recent";

export const SHARE_TARGET_STALE_MS = 30 * 60 * 1000;
export const TEXT_CONSULT_RECENT_WINDOW_MS = 60 * 60 * 1000;
export const MAX_SHARE_FILES = 5;
export const SHARE_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;

/** Share-target accepts images + PDF per manifest; composer also allows text/plain from picker. */
export const SHARE_TARGET_MIME_PREFIXES = ["image/", "application/pdf"] as const;

export interface TextConsultRecentEntry {
  sessionId: string;
  practiceName?: string;
  scheduledStartAt?: string;
  lastVisitedAt: number;
}

export interface ActiveTextConsult {
  sessionId: string;
  practiceName?: string;
  scheduledStartAt?: string;
}

export function isShareTargetMimeAllowed(mime: string): boolean {
  if (!mime) return false;
  return SHARE_TARGET_MIME_PREFIXES.some(
    (prefix) => prefix.endsWith("/") ? mime.startsWith(prefix) : mime === prefix,
  );
}

export function parseShareTargetKeys(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(",")
    .map((k) => k.trim())
    .filter((k) => k.startsWith("share-target-"));
}

export function persistPendingShareKeys(keys: string[]): void {
  if (typeof window === "undefined" || keys.length === 0) return;
  try {
    sessionStorage.setItem(SHARE_TARGET_PENDING_FILES_KEY, keys.join(","));
  } catch {
    // Private mode / quota — caller surfaces attach failure.
  }
}

export function readPendingShareKeys(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return parseShareTargetKeys(sessionStorage.getItem(SHARE_TARGET_PENDING_FILES_KEY));
  } catch {
    return [];
  }
}

export function clearPendingShareKeys(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(SHARE_TARGET_PENDING_FILES_KEY);
  } catch {
    // ignore
  }
}

export function registerTextConsultVisit(entry: Omit<TextConsultRecentEntry, "lastVisitedAt">): void {
  if (typeof window === "undefined") return;
  try {
    const now = Date.now();
    const raw = localStorage.getItem(TEXT_CONSULT_RECENT_KEY);
    const list: TextConsultRecentEntry[] = raw ? (JSON.parse(raw) as TextConsultRecentEntry[]) : [];
    const filtered = list.filter(
      (e) => e.sessionId !== entry.sessionId && now - e.lastVisitedAt < TEXT_CONSULT_RECENT_WINDOW_MS,
    );
    filtered.unshift({
      ...entry,
      lastVisitedAt: now,
    });
    localStorage.setItem(TEXT_CONSULT_RECENT_KEY, JSON.stringify(filtered.slice(0, 10)));
  } catch {
    // Non-fatal — share-target can still scan sessionStorage tokens.
  }
}

function readRecentConsultEntries(): TextConsultRecentEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(TEXT_CONSULT_RECENT_KEY);
    if (!raw) return [];
    const now = Date.now();
    return (JSON.parse(raw) as TextConsultRecentEntry[]).filter(
      (e) => now - e.lastVisitedAt < TEXT_CONSULT_RECENT_WINDOW_MS,
    );
  } catch {
    return [];
  }
}

/** Session ids with a persisted HMAC token in this tab's sessionStorage. */
export function listCandidateSessionIds(): string[] {
  if (typeof window === "undefined") return [];
  const ids = new Set<string>();
  try {
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const key = sessionStorage.key(i);
      if (!key?.startsWith(TEXT_CONSULT_TOKEN_PREFIX)) continue;
      const sessionId = key.slice(TEXT_CONSULT_TOKEN_PREFIX.length);
      if (sessionId) ids.add(sessionId);
    }
  } catch {
    // ignore
  }
  for (const entry of readRecentConsultEntries()) {
    ids.add(entry.sessionId);
  }
  return Array.from(ids);
}

function loadStoredHmacToken(sessionId: string): string {
  if (typeof window === "undefined") return "";
  try {
    return sessionStorage.getItem(`${TEXT_CONSULT_TOKEN_PREFIX}${sessionId}`) ?? "";
  } catch {
    return "";
  }
}

function metadataForSession(sessionId: string): Pick<TextConsultRecentEntry, "practiceName" | "scheduledStartAt"> {
  const hit = readRecentConsultEntries().find((e) => e.sessionId === sessionId);
  return {
    practiceName: hit?.practiceName,
    scheduledStartAt: hit?.scheduledStartAt,
  };
}

/**
 * Resolve live text consults the patient can share into.
 * No dedicated list API — exchange stored HMAC tokens and keep `live` rows.
 */
export async function resolveActiveTextConsults(): Promise<ActiveTextConsult[]> {
  const sessionIds = listCandidateSessionIds();
  const live: ActiveTextConsult[] = [];

  await Promise.all(
    sessionIds.map(async (sessionId) => {
      const token = loadStoredHmacToken(sessionId);
      if (!token) return;
      try {
        const res = await requestTextSessionToken(sessionId, token);
        if (res.data.sessionStatus !== "live") return;
        const meta = metadataForSession(sessionId);
        live.push({
          sessionId,
          practiceName: res.data.practiceName ?? meta.practiceName,
          scheduledStartAt: res.data.scheduledStartAt ?? meta.scheduledStartAt,
        });
      } catch {
        // Expired / invalid token — skip silently.
      }
    }),
  );

  live.sort((a, b) => {
    const ta = a.scheduledStartAt ? Date.parse(a.scheduledStartAt) : 0;
    const tb = b.scheduledStartAt ? Date.parse(b.scheduledStartAt) : 0;
    return tb - ta;
  });

  return live;
}

export function extensionForMime(mime: string): string {
  switch (mime) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/heic":
      return "heic";
    case "image/heif":
      return "heif";
    case "image/gif":
      return "gif";
    case "application/pdf":
      return "pdf";
    default:
      if (mime.startsWith("image/")) return mime.slice("image/".length) || "img";
      return "bin";
  }
}

export function blobToShareFile(blob: Blob, mime: string, index: number): File {
  const ext = extensionForMime(mime);
  const name = `shared-${index + 1}.${ext}`;
  return new File([blob], name, { type: mime || blob.type || "application/octet-stream" });
}

export async function readStagedFilesFromCache(keys: string[]): Promise<File[]> {
  if (typeof caches === "undefined" || keys.length === 0) return [];
  const cache = await caches.open(SHARE_TARGET_CACHE_NAME);
  const files: File[] = [];

  for (let i = 0; i < keys.length && files.length < MAX_SHARE_FILES; i += 1) {
    const key = keys[i];
    const response = await cache.match(key);
    if (!response) continue;
    const mime = response.headers.get("Content-Type") ?? "application/octet-stream";
    if (!isShareTargetMimeAllowed(mime)) continue;
    const blob = await response.blob();
    if (blob.size > SHARE_ATTACHMENT_MAX_BYTES) continue;
    files.push(blobToShareFile(blob, mime, files.length));
  }

  return files;
}

export async function clearShareStaging(keys: string[]): Promise<void> {
  if (typeof caches === "undefined" || keys.length === 0) return;
  try {
    const cache = await caches.open(SHARE_TARGET_CACHE_NAME);
    await Promise.all(keys.map((key) => cache.delete(key)));
  } catch {
    // Best-effort cleanup.
  }
}

/**
 * Consume pending share-target files: read cache → File[], then clear staging.
 * Throws when keys were present but no readable blobs remain.
 */
export async function consumePendingShareTargetFiles(): Promise<File[]> {
  const keys = readPendingShareKeys();
  if (keys.length === 0) return [];
  const files = await readStagedFilesFromCache(keys);
  clearPendingShareKeys();
  await clearShareStaging(keys);
  if (files.length === 0) {
    throw new Error("share-target-staging-empty");
  }
  return files;
}

/** Lazily register the consult service worker (required for share-target POST intercept). */
export async function registerConsultServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js");
  } catch {
    return null;
  }
}

/** Web Share Target Level 2 is Android installed-PWA only; iOS Safari has no share_target. */
export function isShareTargetPlatformSupported(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const isIos =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return !isIos;
}
