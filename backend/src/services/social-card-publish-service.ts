/**
 * Sends a Ready card when its time has arrived.
 * Logs ids and status codes only. Never a token, a file key, a caption, or a post URL.
 */

import axios from 'axios';
import { loadImage } from 'canvas';
import { randomUUID } from 'crypto';
import { getSupabaseAdminClient } from '../config/database';
import { logger } from '../config/logger';
import { feedRatio, toInstagramJpeg } from './instagram-media';
import { rememberSentPost, updateSocialCard } from './social-card-service';

const GRAPH = 'https://graph.instagram.com/v21.0';
const BUCKET = 'social-card-files';
const SIGNED_URL_SEC = 60 * 60;
const RETRY_MS = 15 * 60 * 1000;
const HTTP_TIMEOUT_MS = 15000;
const VIDEO_POLLS = 8;
const VIDEO_POLL_MS = 3000;

type PublishCode = 'not_connected' | 'meta_rejected';

type DueCard = {
  id: string;
  doctor_id: string;
  format: string | null;
  words: Record<string, unknown> | null;
  file_path: string;
  publish_attempt_at: string | null;
  deleted_at: string | null;
};

export type SocialCardPublishResult = {
  due: number;
  posted: number;
  failed: number;
  skipped: number;
};

function emptyResult(): SocialCardPublishResult {
  return { due: 0, posted: 0, failed: 0, skipped: 0 };
}

function isVideo(filePath: string): boolean {
  return /\.(mp4|mov)$/i.test(filePath);
}

function captionFor(card: DueCard): string | undefined {
  if (card.format === 'story') return undefined;
  const raw = card.words?.caption;
  const caption = typeof raw === 'string' ? raw.trim() : '';
  if (!caption) return undefined;
  return caption.slice(0, 2200);
}

function finishedOnPhone(words: DueCard['words']): boolean {
  if (!words) return false;
  for (const key of ['music', 'stickers', 'productTag']) {
    const value = words[key];
    if (typeof value === 'string' && value.trim()) return true;
  }
  return false;
}

function extraPicturePaths(card: DueCard): string[] {
  if (card.format === 'story' || card.format === 'reel' || isVideo(card.file_path)) return [];
  const raw = card.words?.frameStore;
  if (!Array.isArray(raw)) return [];
  const paths: string[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const path = (item as { path?: unknown }).path;
    if (typeof path !== 'string' || path.length > 300 || !/\.(jpe?g|png|webp)$/i.test(path)) continue;
    paths.push(path);
    if (paths.length === 9) break;
  }
  return paths;
}

async function markFailure(id: string, code: PublishCode): Promise<void> {
  const admin = getSupabaseAdminClient();
  if (!admin) return;
  await admin
    .from('social_cards')
    .update({
      publish_error: code,
      publish_attempt_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('stage', 'ready');
}

async function claim(card: DueCard): Promise<boolean> {
  const admin = getSupabaseAdminClient();
  if (!admin) return false;
  let query = admin
    .from('social_cards')
    .update({ publish_attempt_at: new Date().toISOString(), publish_error: null })
    .eq('id', card.id)
    .eq('stage', 'ready');
  query = card.publish_attempt_at
    ? query.eq('publish_attempt_at', card.publish_attempt_at)
    : query.is('publish_attempt_at', null);
  const { data, error } = await query.select('id').maybeSingle();
  if (error || !data) return false;
  return true;
}

async function fileBytes(data: unknown): Promise<Buffer> {
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  if (data && typeof data === 'object' && 'arrayBuffer' in data && typeof data.arrayBuffer === 'function') {
    return Buffer.from(await data.arrayBuffer());
  }
  throw new Error('container');
}

async function waitForContainer(creationId: string, token: string): Promise<void> {
  for (let attempt = 0; attempt < VIDEO_POLLS; attempt += 1) {
    const res = await axios.get<{ status_code?: string }>(`${GRAPH}/${creationId}`, {
      params: { fields: 'status_code', access_token: token },
      timeout: HTTP_TIMEOUT_MS,
    });
    const status = res.data?.status_code;
    if (status === 'FINISHED' || status === 'PUBLISHED' || !status) return;
    if (status === 'ERROR' || status === 'EXPIRED') throw new Error('container');
    await new Promise((resolve) => setTimeout(resolve, VIDEO_POLL_MS));
  }
  throw new Error('container');
}

async function publishCarousel(
  igUserId: string,
  token: string,
  caption: string | undefined,
  urls: string[]
): Promise<string> {
  const children: string[] = [];
  for (const url of urls.slice(0, 10)) {
    const created = await axios.post<{ id?: string }>(`${GRAPH}/${igUserId}/media`, null, {
      params: { image_url: url, is_carousel_item: 'true', access_token: token },
      timeout: HTTP_TIMEOUT_MS,
    });
    if (!created.data?.id) throw new Error('container');
    await waitForContainer(created.data.id, token);
    children.push(created.data.id);
  }
  const parentParams: Record<string, string> = {
    media_type: 'CAROUSEL',
    children: children.join(','),
    access_token: token,
  };
  if (caption) parentParams.caption = caption;
  const parent = await axios.post<{ id?: string }>(`${GRAPH}/${igUserId}/media`, null, {
    params: parentParams,
    timeout: HTTP_TIMEOUT_MS,
  });
  if (!parent.data?.id) throw new Error('container');
  await waitForContainer(parent.data.id, token);
  return parent.data.id;
}

async function publishToInstagram(
  igUserId: string,
  token: string,
  card: DueCard,
  fileUrl: string,
  extraUrls: string[] = []
): Promise<{ url: string; mediaId: string }> {
  if (!/\.(jpe?g|png|webp|mp4|mov)$/i.test(card.file_path)) throw new Error('container');
  const video = isVideo(card.file_path);
  const caption = captionFor(card);
  const creationId =
    extraUrls.length > 0 && !video && card.format !== 'story'
      ? await publishCarousel(igUserId, token, caption, [fileUrl, ...extraUrls])
      : await createSingle(igUserId, token, card, fileUrl, video, caption);
  if (!(extraUrls.length > 0 && !video && card.format !== 'story')) {
    await waitForContainer(creationId, token);
  }

  const published = await axios.post<{ id?: string }>(`${GRAPH}/${igUserId}/media_publish`, null, {
    params: { creation_id: creationId, access_token: token },
    timeout: HTTP_TIMEOUT_MS,
  });
  const mediaId = published.data?.id;
  if (!mediaId) throw new Error('container');

  const permalink = await axios.get<{ permalink?: string }>(`${GRAPH}/${mediaId}`, {
    params: { fields: 'permalink', access_token: token },
    timeout: HTTP_TIMEOUT_MS,
  });
  const url = permalink.data?.permalink?.trim() ?? '';
  if (!url) throw new Error('container');
  return { url, mediaId };
}

async function createSingle(
  igUserId: string,
  token: string,
  card: DueCard,
  fileUrl: string,
  video: boolean,
  caption: string | undefined
): Promise<string> {
  const params: Record<string, string> = { access_token: token };
  if (card.format === 'story') params.media_type = 'STORIES';
  else if (video) params.media_type = 'REELS';
  if (video) params.video_url = fileUrl;
  else params.image_url = fileUrl;
  if (caption) params.caption = caption;

  const created = await axios.post<{ id?: string }>(`${GRAPH}/${igUserId}/media`, null, {
    params,
    timeout: HTTP_TIMEOUT_MS,
  });
  if (!created.data?.id) throw new Error('container');
  return created.data.id;
}

async function sendCard(card: DueCard, correlationId: string): Promise<'posted' | 'failed' | 'skipped'> {
  const admin = getSupabaseAdminClient();
  if (!admin) return 'skipped';
  const claimed = await claim(card);
  if (!claimed) return 'skipped';

  const { data: account, error } = await admin
    .from('doctor_instagram')
    .select('instagram_access_token, instagram_page_id')
    .eq('doctor_id', card.doctor_id)
    .maybeSingle();
  if (error || !account?.instagram_access_token || !account.instagram_page_id) {
    await markFailure(card.id, 'not_connected');
    return 'failed';
  }

  const storage = admin.storage.from(BUCKET);
  const prepared: string[] = [];
  let fileUrl = '';
  let thumbJpeg: Buffer | null = null;
  const extraUrls: string[] = [];
  try {
    if (isVideo(card.file_path)) {
      const signed = await storage.createSignedUrl(card.file_path, SIGNED_URL_SEC);
      if (signed.error || !signed.data?.signedUrl) throw new Error('container');
      fileUrl = signed.data.signedUrl;
    } else {
      const paths = [card.file_path, ...extraPicturePaths(card)];
      const buffers: Buffer[] = [];
      for (const path of paths) {
        const downloaded = await storage.download(path);
        if (downloaded.error || !downloaded.data) throw new Error('container');
        buffers.push(await fileBytes(downloaded.data));
      }
      const first = buffers[0];
      if (!first) throw new Error('container');
      const shape = card.format === 'story' ? 'story' : 'feed';
      const measured = shape === 'story' ? null : await loadImage(first);
      const shared = measured ? feedRatio(measured.width, measured.height) : undefined;
      const urls: string[] = [];
      for (const buffer of buffers) {
        const jpeg = await toInstagramJpeg(buffer, shape, shared);
        if (!thumbJpeg) thumbJpeg = jpeg;
        const key = `${card.doctor_id}/${card.id}/send-${randomUUID()}.jpg`;
        const uploaded = await storage.upload(key, jpeg, { contentType: 'image/jpeg', upsert: false });
        if (uploaded.error) throw new Error('container');
        prepared.push(key);
        const signed = await storage.createSignedUrl(key, SIGNED_URL_SEC);
        if (signed.error || !signed.data?.signedUrl) throw new Error('container');
        urls.push(signed.data.signedUrl);
      }
      fileUrl = urls[0] ?? '';
      extraUrls.push(...urls.slice(1));
      if (!fileUrl) throw new Error('container');
    }
  } catch {
    if (prepared.length > 0) await storage.remove(prepared);
    await markFailure(card.id, 'meta_rejected');
    return 'failed';
  }

  try {
    const published = await publishToInstagram(
      String(account.instagram_page_id),
      account.instagram_access_token,
      card,
      fileUrl,
      extraUrls
    );
    try {
      await updateSocialCard(card.id, { instagramUrl: published.url }, correlationId, card.doctor_id);
    } catch {
      await admin
        .from('social_cards')
        .update({ scheduled_at: null, publish_error: null, publish_attempt_at: null })
        .eq('id', card.id)
        .eq('stage', 'ready');
      logger.warn({ correlationId, cardId: card.id }, 'social card publish: sent, link not saved');
      return 'posted';
    }
    await rememberSentPost(card.doctor_id, card.id, published.mediaId, thumbJpeg, correlationId);
    await admin
      .from('social_cards')
      .update({ publish_error: null, publish_attempt_at: null })
      .eq('id', card.id);
    return 'posted';
  } catch (err: unknown) {
    const status = axios.isAxiosError(err) ? err.response?.status : undefined;
    const body = axios.isAxiosError(err) ? err.response?.data : undefined;
    const graphCode =
      body && typeof body === 'object' && 'error' in body
        ? (body as { error?: { code?: unknown } }).error?.code
        : undefined;
    logger.warn(
      { correlationId, cardId: card.id, status, graphCode: typeof graphCode === 'number' ? graphCode : undefined },
      'social card publish failed'
    );
    await markFailure(card.id, 'meta_rejected');
    return 'failed';
  } finally {
    if (prepared.length > 0) await storage.remove(prepared);
  }
}

export async function runSocialCardPublishJob(
  correlationId: string
): Promise<SocialCardPublishResult> {
  const result = emptyResult();
  const admin = getSupabaseAdminClient();
  if (!admin) {
    logger.error({ correlationId }, 'social card publish: no admin client');
    return result;
  }

  const now = new Date().toISOString();
  const { data, error } = await admin
    .from('social_cards')
    .select('id, doctor_id, format, words, file_path, publish_attempt_at, deleted_at, scheduled_at, stage')
    .eq('stage', 'ready')
    .lte('scheduled_at', now)
    .not('file_path', 'is', null)
    .limit(20);
  if (error) {
    logger.warn({ correlationId, errorCode: error.code }, 'social card publish: scan failed');
    return result;
  }

  const retryBefore = Date.now() - RETRY_MS;
  const due = ((data ?? []) as DueCard[]).filter((card) => {
    if (card.deleted_at || !card.file_path || finishedOnPhone(card.words)) return false;
    if (!card.publish_attempt_at) return true;
    return new Date(card.publish_attempt_at).getTime() < retryBefore;
  });
  result.due = due.length;

  for (const card of due) {
    const outcome = await sendCard(card, correlationId);
    if (outcome === 'posted') result.posted += 1;
    else if (outcome === 'failed') result.failed += 1;
    else result.skipped += 1;
  }

  logger.info(
    { correlationId, due: result.due, posted: result.posted, failed: result.failed },
    'social card publish: tick complete'
  );
  return result;
}
