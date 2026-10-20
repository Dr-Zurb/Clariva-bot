/**
 * Last analytics report for this sitting, so the tab paints before the network.
 * Keyed by the signed-in doctor and the period. A different doctor replaces it.
 */

import { insightsRangeFromDays } from "@/components/dashboard/insights/InsightsRangeControl";
import { getSocialAnalytics, type SocialAnalyticsReport } from "./social-cards";

const STORAGE_KEY = "clariva.social.analytics.v1";
const MAX_BYTES = 750_000;

type MemoryEntry = { key: string; report: SocialAnalyticsReport };

const memory = new Map<string, SocialAnalyticsReport>();
const inflight = new Map<string, Promise<SocialAnalyticsReport>>();
let ticket = 0;

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

function cacheKey(token: string, from: string, to: string): string {
  return `${ownerKey(token) ?? token}:${from}:${to}`;
}

function isReport(value: unknown): value is SocialAnalyticsReport {
  if (!value || typeof value !== "object") return false;
  const report = value as Partial<SocialAnalyticsReport>;
  return Boolean(report.tiles && report.range && Array.isArray(report.posts) && Array.isArray(report.days));
}

function readSession(key: string): SocialAnalyticsReport | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { key?: unknown; report?: unknown };
    if (parsed.key !== key || !isReport(parsed.report)) {
      if (parsed.key !== key) sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed.report;
  } catch {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore a blocked store.
    }
    return null;
  }
}

function remember(token: string, from: string, to: string, report: SocialAnalyticsReport): void {
  const key = cacheKey(token, from, to);
  memory.set(key, report);
  if (!ownerKey(token) || typeof window === "undefined") return;
  try {
    const payload = JSON.stringify({ key, report });
    if (payload.length > MAX_BYTES) {
      sessionStorage.removeItem(STORAGE_KEY);
      return;
    }
    sessionStorage.setItem(STORAGE_KEY, payload);
  } catch {
    // The memory copy still paints this sitting.
  }
}

export function peekSocialAnalytics(token: string, from: string, to: string): SocialAnalyticsReport | null {
  if (!token) return null;
  const key = cacheKey(token, from, to);
  const known = memory.get(key);
  if (known) return known;
  const stored = readSession(key);
  if (!stored) return null;
  memory.set(key, stored);
  return stored;
}

export function loadSocialAnalytics(
  token: string,
  from: string,
  to: string,
  options?: { fresh?: boolean }
): Promise<SocialAnalyticsReport> {
  const key = cacheKey(token, from, to);
  if (!options?.fresh) {
    const pending = inflight.get(key);
    if (pending) return pending;
  }
  const current = ++ticket;
  const request = getSocialAnalytics(token, from, to)
    .then((report) => {
      if (current === ticket) remember(token, from, to, report);
      return report;
    })
    .finally(() => {
      if (inflight.get(key) === request) inflight.delete(key);
    });
  inflight.set(key, request);
  return request;
}

/** Default 30-day report, the period Analytics opens on. */
export function warmSocialAnalytics(token: string): void {
  if (!token) return;
  const range = insightsRangeFromDays(30);
  if (peekSocialAnalytics(token, range.from, range.to)) return;
  void loadSocialAnalytics(token, range.from, range.to).catch(() => undefined);
}

export function clearSocialAnalyticsCache(): void {
  ticket += 1;
  memory.clear();
  inflight.clear();
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore a blocked store.
  }
}
