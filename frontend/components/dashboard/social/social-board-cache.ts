/**
 * Last board for this sitting, so opening Social paints before the network.
 * The copy is marketing cards already on this browser. It is keyed by the
 * signed-in doctor and dropped when that doctor changes.
 */

import { listSocialCards, type SocialCard } from "./social-cards";
import { clearSocialAnalyticsCache, warmSocialAnalytics } from "./social-analytics-cache";

const STORAGE_KEY = "clariva.social.board.v1";
const MAX_BYTES = 750_000;

type MemoryEntry = { key: string; cards: SocialCard[] };

let memory: MemoryEntry | null = null;
let ticket = 0;
const inflight = new Map<string, Promise<SocialCard[]>>();

function ownerKey(token: string): string | null {
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const json = JSON.parse(atob(padded)) as { sub?: unknown };
    return typeof json.sub === "string" && json.sub.length > 0 ? json.sub : null;
  } catch {
    return null;
  }
}

function cacheKey(token: string): string {
  return ownerKey(token) ?? token;
}

function isCardList(value: unknown): value is SocialCard[] {
  if (!Array.isArray(value)) return false;
  return value.every((item) => {
    if (!item || typeof item !== "object") return false;
    const card = item as Partial<SocialCard>;
    return typeof card.id === "string" && typeof card.title === "string" && typeof card.stage === "string";
  });
}

function readSession(key: string): SocialCard[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { key?: unknown; cards?: unknown };
    if (parsed.key !== key || !isCardList(parsed.cards)) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed.cards;
  } catch {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore a blocked store.
    }
    return null;
  }
}

function writeSession(key: string, cards: SocialCard[]): void {
  if (typeof window === "undefined") return;
  try {
    const payload = JSON.stringify({ key, cards });
    if (payload.length > MAX_BYTES) {
      sessionStorage.removeItem(STORAGE_KEY);
      return;
    }
    sessionStorage.setItem(STORAGE_KEY, payload);
  } catch {
    // Private mode or a full store. The memory copy still paints this sitting.
  }
}

function remember(token: string, cards: SocialCard[]): void {
  const key = cacheKey(token);
  memory = { key, cards };
  if (ownerKey(token)) writeSession(key, cards);
}

export function peekSocialCards(token: string): SocialCard[] | null {
  if (!token) return null;
  const key = cacheKey(token);
  if (memory?.key === key) return memory.cards;
  const stored = readSession(key);
  if (!stored) return null;
  memory = { key, cards: stored };
  return stored;
}

export function loadSocialBoard(token: string, options?: { fresh?: boolean }): Promise<SocialCard[]> {
  const key = cacheKey(token);
  if (!options?.fresh) {
    const pending = inflight.get(key);
    if (pending) return pending;
  }
  const current = ++ticket;
  const request = listSocialCards(token)
    .then((cards) => {
      if (current === ticket) remember(token, cards);
      return cards;
    })
    .finally(() => {
      if (inflight.get(key) === request) inflight.delete(key);
    });
  inflight.set(key, request);
  return request;
}

/** Start the board fetch before the Social screen mounts. No-ops once a copy exists. */
export function warmSocialCards(token: string): void {
  if (!token) return;
  if (memory?.key === cacheKey(token)) return;
  void loadSocialBoard(token).catch(() => undefined);
}

/** Board and the default analytics period, before Social is opened. */
export function warmSocial(token: string): void {
  warmSocialCards(token);
  warmSocialAnalytics(token);
}

export function clearSocialBoardCache(): void {
  ticket += 1;
  memory = null;
  inflight.clear();
  clearSocialAnalyticsCache();
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore a blocked store.
  }
}
