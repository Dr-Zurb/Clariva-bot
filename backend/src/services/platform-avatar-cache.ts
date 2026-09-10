/**
 * Cache Meta User Profile `profile_pic` URLs (they expire in a few days).
 * Uses the shared BullMQ Redis connection when available.
 */

import { getQueueConnection, getWebhookQueue, isQueueEnabled } from '../config/queue';
import { logger } from '../config/logger';

/** Meta profile_pic URLs expire after a few days — refresh before that. */
const AVATAR_TTL_SECONDS = 60 * 60 * 48; // 48h

function cacheKey(channel: string, platformExternalId: string): string {
  return `platform-avatar:v1:${channel}:${platformExternalId}`;
}

function ensureRedis() {
  if (!isQueueEnabled()) return null;
  const existing = getQueueConnection();
  if (existing) return existing;
  // Side-effect: initializes shared queue Redis connection.
  getWebhookQueue();
  return getQueueConnection();
}

export async function getCachedPlatformAvatar(
  channel: string,
  platformExternalId: string
): Promise<string | null> {
  const redis = ensureRedis();
  if (!redis || !platformExternalId?.trim()) return null;
  try {
    const url = await redis.get(cacheKey(channel, platformExternalId.trim()));
    return url && url.length > 0 ? url : null;
  } catch (err) {
    logger.debug(
      { message: err instanceof Error ? err.message : 'avatar cache get failed' },
      'platform avatar cache get skipped'
    );
    return null;
  }
}

export async function getCachedPlatformAvatars(
  refs: ReadonlyArray<{ channel: string; platformExternalId: string }>
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const redis = ensureRedis();
  if (!redis || refs.length === 0) return out;

  const unique = new Map<string, { channel: string; id: string }>();
  for (const r of refs) {
    const id = r.platformExternalId?.trim();
    const channel = r.channel?.trim();
    if (!id || !channel) continue;
    unique.set(`${channel}:${id}`, { channel, id });
  }
  if (unique.size === 0) return out;

  const entries = [...unique.values()];
  try {
    const values = await redis.mget(...entries.map((e) => cacheKey(e.channel, e.id)));
    entries.forEach((e, i) => {
      const v = values[i];
      if (v) out.set(`${e.channel}:${e.id}`, v);
    });
  } catch (err) {
    logger.debug(
      { message: err instanceof Error ? err.message : 'avatar cache mget failed' },
      'platform avatar cache mget skipped'
    );
  }
  return out;
}

export async function setCachedPlatformAvatar(
  channel: string,
  platformExternalId: string,
  profilePicUrl: string
): Promise<void> {
  const redis = ensureRedis();
  const id = platformExternalId?.trim();
  const url = profilePicUrl?.trim();
  if (!redis || !id || !url) return;
  try {
    await redis.set(cacheKey(channel, id), url, 'EX', AVATAR_TTL_SECONDS);
  } catch (err) {
    logger.debug(
      { message: err instanceof Error ? err.message : 'avatar cache set failed' },
      'platform avatar cache set skipped'
    );
  }
}
