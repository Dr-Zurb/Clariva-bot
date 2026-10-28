/**
 * Sends a Ready card when its time has arrived.
 * Logs ids and status codes only. Never a token, a file key, a caption, or a post URL.
 */

import axios from 'axios';
import { loadImage } from 'canvas';
import { randomUUID } from 'crypto';
import { getSupabaseAdminClient } from '../config/database';
import { logger } from '../config/logger';
import { feedRatio, stillToReel, toInstagramJpeg } from './instagram-media';
import { rememberSentPost, updateSocialCard } from './social-card-service';

const GRAPH = 'https://graph.instagram.com/v21.0';
const BUCKET = 'social-card-files';
const SIGNED_URL_SEC = 60 * 60;
const RETRY_MS = 15 * 60 * 1000;
const HTTP_TIMEOUT_MS = 15000;
const CONTAINER_WAIT_MS = 5 * 60 * 1000;
const GRAPH_TRIES = 3;
const GRAPH_WAITS_MS = [2000, 6000];
const CLOCK_SLACK_MS = 2 * 60 * 1000;
/** Storage resizes up to 2500 px; Instagram keeps at most 1440 px wide. */
const SOURCE_EDGE = 2500;
const DUE_COLUMNS = 'id, doctor_id, format, words, file_path, publish_attempt_at, deleted_at, scheduled_at, stage';

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

function feedTarget(words: DueCard['words'], width: number, height: number): number {
  const crop = words?.crop;
  if (crop === 'square') return 1;
  if (crop === 'portrait') return 4 / 5;
  if (crop === 'landscape') return 16 / 9;
  return feedRatio(width, height);
}

function captionFor(card: DueCard): string | undefined {
  if (card.format === 'story') return undefined;
  return wordText(card.words, 'caption', 2200);
}

function wordText(words: DueCard['words'], key: string, max: number): string | undefined {
  const raw = words?.[key];
  if (typeof raw !== 'string') return undefined;
  const value = raw.trim();
  if (!value) return undefined;
  return value.slice(0, max);
}

function flagOn(words: DueCard['words'], key: string): boolean {
  return words?.[key] === true;
}

/** Up to three Instagram usernames. A phrase is left off the invite. */
function collaboratorParam(words: DueCard['words']): string | undefined {
  const raw = wordText(words, 'collaborator', 80);
  if (!raw) return undefined;
  const names: string[] = [];
  for (const part of raw.split(',')) {
    const name = part.trim().replace(/^@+/, '');
    if (!/^[A-Za-z0-9._]{1,30}$/.test(name)) continue;
    if (names.some((item) => item.toLowerCase() === name.toLowerCase())) continue;
    names.push(name);
    if (names.length === 3) break;
  }
  if (!names.length) return undefined;
  return `[${names.map((name) => `'${name}'`).join(',')}]`;
}

type ContainerKind = 'image' | 'reel' | 'story' | 'carousel-child' | 'carousel-parent';

function applyPublishFields(
  params: Record<string, string>,
  card: DueCard,
  kind: ContainerKind,
  childIndex = 0
): void {
  if (flagOn(card.words, 'aiGenerated') && kind !== 'carousel-child') {
    params.is_ai_generated = 'true';
  }
  if (kind === 'image' || (kind === 'carousel-child' && childIndex === 0)) {
    const alt = wordText(card.words, 'altText', 500);
    if (alt) params.alt_text = alt;
  }
  if (kind === 'image' || kind === 'reel' || kind === 'carousel-parent') {
    const collaborators = collaboratorParam(card.words);
    if (collaborators) params.collaborators = collaborators;
  }
  if (kind === 'reel' && card.format === 'reel' && flagOn(card.words, 'shareToFeed')) {
    params.share_to_feed = 'true';
  }
}

function heldBack(words: DueCard['words']): boolean {
  if (!words) return false;
  if (words.byHand === true) return true;
  for (const key of ['music', 'productTag']) {
    const value = words[key];
    if (typeof value === 'string' && value.trim()) return true;
  }
  return false;
}

function extraPicturePaths(card: DueCard): string[] {
  if (card.format === 'reel' || isVideo(card.file_path)) return [];
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

type GraphFacts = { status?: number; graphCode?: number; graphSubcode?: number };

function graphFacts(err: unknown): GraphFacts {
  if (!axios.isAxiosError(err)) return {};
  const body = err.response?.data as { error?: { code?: unknown; error_subcode?: unknown } } | undefined;
  const code = body?.error?.code;
  const subcode = body?.error?.error_subcode;
  return {
    status: err.response?.status,
    graphCode: typeof code === 'number' ? code : undefined,
    graphSubcode: typeof subcode === 'number' ? subcode : undefined,
  };
}

/**
 * A dropped connection, a 5xx, an Instagram error marked as passing, or a
 * container that is not ready yet (9007). A rate limit is not.
 */
function passing(err: unknown): boolean {
  if (!axios.isAxiosError(err)) return false;
  if (!err.response) return typeof err.code === 'string';
  const body = err.response.data as { error?: { code?: unknown; is_transient?: unknown } } | undefined;
  if (body?.error?.is_transient === true) return true;
  const code = body?.error?.code;
  if (code === 1 || code === 2 || code === -1 || code === 9007) return true;
  return err.response.status >= 500;
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function graphWait(attempt: number): number {
  return GRAPH_WAITS_MS[Math.min(attempt, GRAPH_WAITS_MS.length) - 1] ?? 0;
}

/** Only for calls that cannot put anything on Instagram twice. */
async function graphRetry<T>(call: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await call();
    } catch (err: unknown) {
      if (attempt >= GRAPH_TRIES || !passing(err)) throw err;
      await pause(graphWait(attempt));
    }
  }
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

/** The post is on Instagram without a saved link. It leaves Ready so it is never sent again. */
async function keepLive(id: string): Promise<void> {
  const admin = getSupabaseAdminClient();
  if (!admin) return;
  const { error } = await admin
    .from('social_cards')
    .update({ stage: 'posted', publish_error: null, publish_attempt_at: null })
    .eq('id', id)
    .eq('stage', 'ready');
  if (!error) return;
  await admin
    .from('social_cards')
    .update({ scheduled_at: null, publish_error: null, publish_attempt_at: null })
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

type Bucket = ReturnType<NonNullable<ReturnType<typeof getSupabaseAdminClient>>['storage']['from']>;

async function resizedBytes(storage: Bucket, path: string): Promise<Buffer | null> {
  try {
    const resized = await storage.download(path, {
      transform: { width: SOURCE_EDGE, height: SOURCE_EDGE, resize: 'contain', quality: 95 },
    });
    if (resized.error || !resized.data) return null;
    const bytes = await fileBytes(resized.data);
    await loadImage(bytes);
    return bytes;
  } catch {
    return null;
  }
}

/** A smaller copy when storage can resize it; the original otherwise. */
async function pictureBytes(storage: Bucket, path: string): Promise<Buffer> {
  const resized = await resizedBytes(storage, path);
  if (resized) return resized;
  const downloaded = await storage.download(path);
  if (downloaded.error || !downloaded.data) throw new Error('container');
  return fileBytes(downloaded.data);
}

/** Waits for every task, so nothing is still uploading when the send cleans up. */
async function settleAll<T>(tasks: Promise<T>[]): Promise<T[]> {
  const settled = await Promise.allSettled(tasks);
  const values: T[] = [];
  for (const item of settled) {
    if (item.status === 'rejected') throw item.reason;
    values.push(item.value);
  }
  return values;
}

/** Extras after the post is up. A miss is logged and the post stays. */
async function tryExtra(
  step: () => Promise<unknown>,
  message: string,
  correlationId: string,
  cardId: string
): Promise<void> {
  try {
    await step();
  } catch (err: unknown) {
    const { status, graphCode } = graphFacts(err);
    logger.warn({ correlationId, cardId, status, graphCode }, message);
  }
}

async function containerStatus(creationId: string, token: string): Promise<string | undefined> {
  const res = await graphRetry(() =>
    axios.get<{ status_code?: string }>(`${GRAPH}/${creationId}`, {
      params: { fields: 'status_code', access_token: token },
      timeout: HTTP_TIMEOUT_MS,
    })
  );
  return res.data?.status_code;
}

/** A photo is ready in a second or two; a video can take minutes. Checks often at first, then less. */
function containerPause(elapsed: number): number {
  if (elapsed < 4000) return 1000;
  if (elapsed < 30000) return 2000;
  if (elapsed < 120000) return 4000;
  return 10000;
}

async function waitForContainer(creationId: string, token: string): Promise<void> {
  const started = Date.now();
  for (;;) {
    const status = await containerStatus(creationId, token);
    if (status === 'FINISHED' || status === 'PUBLISHED' || !status) return;
    if (status === 'ERROR' || status === 'EXPIRED') throw new Error('container_error');
    const elapsed = Date.now() - started;
    if (elapsed >= CONTAINER_WAIT_MS) throw new Error('container_timeout');
    await pause(containerPause(elapsed));
  }
}

async function publishCarousel(
  igUserId: string,
  token: string,
  card: DueCard,
  caption: string | undefined,
  urls: string[]
): Promise<string> {
  const children = await Promise.all(
    urls.slice(0, 10).map(async (url, index) => {
      const childParams: Record<string, string> = {
        image_url: url,
        is_carousel_item: 'true',
        access_token: token,
      };
      applyPublishFields(childParams, card, 'carousel-child', index);
      const created = await graphRetry(() =>
        axios.post<{ id?: string }>(`${GRAPH}/${igUserId}/media`, null, {
          params: childParams,
          timeout: HTTP_TIMEOUT_MS,
        })
      );
      if (!created.data?.id) throw new Error('container');
      await waitForContainer(created.data.id, token);
      return created.data.id;
    })
  );
  const parentParams: Record<string, string> = {
    media_type: 'CAROUSEL',
    children: children.join(','),
    access_token: token,
  };
  if (caption) parentParams.caption = caption;
  applyPublishFields(parentParams, card, 'carousel-parent');
  const parent = await graphRetry(() =>
    axios.post<{ id?: string }>(`${GRAPH}/${igUserId}/media`, null, {
      params: parentParams,
      timeout: HTTP_TIMEOUT_MS,
    })
  );
  if (!parent.data?.id) throw new Error('container');
  await waitForContainer(parent.data.id, token);
  return parent.data.id;
}

/** The newest post since the send began. The caption must match when the card has one. */
async function findSentMedia(
  igUserId: string,
  token: string,
  card: DueCard,
  since: number
): Promise<string | null> {
  const edge = card.format === 'story' ? 'stories' : 'media';
  const res = await graphRetry(() =>
    axios.get<{ data?: { id?: string; timestamp?: string; caption?: string }[] }>(`${GRAPH}/${igUserId}/${edge}`, {
      params: { fields: 'id,timestamp,caption', limit: 5, access_token: token },
      timeout: HTTP_TIMEOUT_MS,
    })
  );
  const caption = captionFor(card)?.trim();
  for (const item of res.data?.data ?? []) {
    if (!item.id) continue;
    const at = Date.parse(item.timestamp ?? '');
    if (Number.isNaN(at) || at < since) continue;
    if (caption && item.caption?.trim() !== caption) continue;
    return item.id;
  }
  return null;
}

/**
 * A container goes up once. After a failed or dropped call, Instagram is asked
 * whether it already went up before the call is tried again.
 * Null means the post is live and its id did not come back.
 */
async function publishContainer(
  igUserId: string,
  token: string,
  card: DueCard,
  creationId: string
): Promise<string | null> {
  const since = Date.now() - CLOCK_SLACK_MS;
  for (let attempt = 1; ; attempt += 1) {
    let failure: unknown = new Error('container');
    try {
      const published = await axios.post<{ id?: string }>(`${GRAPH}/${igUserId}/media_publish`, null, {
        params: { creation_id: creationId, access_token: token },
        timeout: HTTP_TIMEOUT_MS,
      });
      if (published.data?.id) return published.data.id;
    } catch (err: unknown) {
      failure = err;
    }
    const status = await containerStatus(creationId, token).catch(() => undefined);
    if (status === 'PUBLISHED') return findSentMedia(igUserId, token, card, since).catch(() => null);
    if (!passing(failure)) throw failure;
    if (attempt >= GRAPH_TRIES) {
      const found = await findSentMedia(igUserId, token, card, since).catch(() => null);
      if (found) return found;
      throw failure;
    }
    await pause(graphWait(attempt));
  }
}

async function permalinkFor(mediaId: string, token: string): Promise<string | null> {
  const res = await graphRetry(() =>
    axios.get<{ permalink?: string }>(`${GRAPH}/${mediaId}`, {
      params: { fields: 'permalink', access_token: token },
      timeout: HTTP_TIMEOUT_MS,
    })
  );
  return res.data?.permalink?.trim() || null;
}

/** Throws only when nothing went up. A live post never comes back as a failure. */
async function publishToInstagram(
  igUserId: string,
  token: string,
  card: DueCard,
  fileUrl: string,
  extraUrls: string[] = []
): Promise<{ url: string | null; mediaId: string | null }> {
  if (!/\.(jpe?g|png|webp|mp4|mov)$/i.test(card.file_path)) throw new Error('container');
  const video = isVideo(card.file_path) || card.format === 'reel';
  const caption = captionFor(card);
  const creationId =
    extraUrls.length > 0 && !video && card.format !== 'story'
      ? await publishCarousel(igUserId, token, card, caption, [fileUrl, ...extraUrls])
      : await createSingle(igUserId, token, card, fileUrl, video, caption);
  if (!(extraUrls.length > 0 && !video && card.format !== 'story')) {
    await waitForContainer(creationId, token);
  }

  const mediaId = await publishContainer(igUserId, token, card, creationId);
  if (!mediaId) return { url: null, mediaId: null };
  const url = await permalinkFor(mediaId, token).catch(() => null);
  return { url, mediaId };
}

async function postFirstComment(mediaId: string, token: string, message: string): Promise<void> {
  await axios.post(`${GRAPH}/${mediaId}/comments`, null, {
    params: { message, access_token: token },
    timeout: HTTP_TIMEOUT_MS,
  });
}

async function closeComments(mediaId: string, token: string): Promise<void> {
  await axios.post(`${GRAPH}/${mediaId}`, null, {
    params: { comment_enabled: 'false', access_token: token },
    timeout: HTTP_TIMEOUT_MS,
  });
}

/** A second container. The caption, comment, and collaborators stay on the post. */
async function publishStoryAlongside(
  igUserId: string,
  token: string,
  card: DueCard,
  urls: string[],
  video: boolean
): Promise<void> {
  for (const url of urls) {
    const params: Record<string, string> = {
      media_type: 'STORIES',
      access_token: token,
    };
    if (video) params.video_url = url;
    else params.image_url = url;
    applyPublishFields(params, card, 'story');
    const created = await graphRetry(() =>
      axios.post<{ id?: string }>(`${GRAPH}/${igUserId}/media`, null, {
        params,
        timeout: HTTP_TIMEOUT_MS,
      })
    );
    if (!created.data?.id) throw new Error('container');
    await waitForContainer(created.data.id, token);
    const published = await axios.post<{ id?: string }>(`${GRAPH}/${igUserId}/media_publish`, null, {
      params: { creation_id: created.data.id, access_token: token },
      timeout: HTTP_TIMEOUT_MS,
    });
    if (!published.data?.id) throw new Error('container');
  }
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
  const kind = card.format === 'story' ? 'story' : video ? 'reel' : 'image';
  applyPublishFields(params, card, kind);

  const created = await graphRetry(() =>
    axios.post<{ id?: string }>(`${GRAPH}/${igUserId}/media`, null, {
      params,
      timeout: HTTP_TIMEOUT_MS,
    })
  );
  if (!created.data?.id) throw new Error('container');
  return created.data.id;
}

async function sendCard(card: DueCard, correlationId: string): Promise<'posted' | 'failed' | 'skipped'> {
  const admin = getSupabaseAdminClient();
  if (!admin) return 'skipped';
  const [claimed, lookup] = await Promise.all([
    claim(card),
    admin
      .from('doctor_instagram')
      .select('instagram_access_token, instagram_page_id')
      .eq('doctor_id', card.doctor_id)
      .maybeSingle(),
  ]);
  if (!claimed) return 'skipped';
  const { data: account, error } = lookup;
  if (error || !account?.instagram_access_token || !account.instagram_page_id) {
    await markFailure(card.id, 'not_connected');
    return 'failed';
  }

  const storage = admin.storage.from(BUCKET);
  const prepared: string[] = [];
  let fileUrl = '';
  let thumbJpeg: Buffer | null = null;
  const extraUrls: string[] = [];
  const storyUrls: string[] = [];
  const stageFile = async (body: Buffer, ext: 'jpg' | 'mp4'): Promise<string> => {
    const key = `${card.doctor_id}/${card.id}/send-${randomUUID()}.${ext}`;
    const uploaded = await storage.upload(key, body, {
      contentType: ext === 'mp4' ? 'video/mp4' : 'image/jpeg',
      upsert: false,
    });
    if (uploaded.error) throw new Error('container');
    prepared.push(key);
    const signed = await storage.createSignedUrl(key, SIGNED_URL_SEC);
    if (signed.error || !signed.data?.signedUrl) throw new Error('container');
    return signed.data.signedUrl;
  };
  try {
    if (isVideo(card.file_path)) {
      const signed = await storage.createSignedUrl(card.file_path, SIGNED_URL_SEC);
      if (signed.error || !signed.data?.signedUrl) throw new Error('container');
      fileUrl = signed.data.signedUrl;
    } else if (card.format === 'reel') {
      const jpeg = await toInstagramJpeg(
        await pictureBytes(storage, card.file_path),
        'story',
        undefined,
        card.words?.storyPlace === 'fit' ? 'fit' : 'fill'
      );
      thumbJpeg = jpeg;
      fileUrl = await stageFile(await stillToReel(jpeg), 'mp4');
    } else {
      const paths = [card.file_path, ...extraPicturePaths(card)];
      const buffers = await Promise.all(paths.map((path) => pictureBytes(storage, path)));
      const first = buffers[0];
      if (!first) throw new Error('container');
      const shape = card.format === 'story' ? 'story' : 'feed';
      const measured = shape === 'story' ? null : await loadImage(first);
      const shared = measured ? feedTarget(card.words, measured.width, measured.height) : undefined;
      const storyPlace = card.words?.storyPlace === 'fit' ? 'fit' : 'fill';
      const withStory = card.format === 'post' && flagOn(card.words, 'shareToStory');
      const staged = await settleAll(
        buffers.map(async (buffer) => {
          const jpeg = await toInstagramJpeg(buffer, shape, shared, shape === 'story' ? storyPlace : 'fill');
          const url = await stageFile(jpeg, 'jpg');
          const storyUrl = withStory ? await stageFile(await toInstagramJpeg(buffer, 'story'), 'jpg') : null;
          return { jpeg, url, storyUrl };
        })
      );
      thumbJpeg = staged[0]?.jpeg ?? null;
      fileUrl = staged[0]?.url ?? '';
      extraUrls.push(...staged.slice(1).map((item) => item.url));
      for (const item of staged) if (item.storyUrl) storyUrls.push(item.storyUrl);
      if (!fileUrl) throw new Error('container');
    }
  } catch {
    if (prepared.length > 0) await storage.remove(prepared);
    await markFailure(card.id, 'meta_rejected');
    return 'failed';
  }

  try {
    const igUserId = String(account.instagram_page_id);
    const token = account.instagram_access_token;
    const published = await publishToInstagram(igUserId, token, card, fileUrl, extraUrls);
    const mediaId = published.mediaId;
    const extra = (step: () => Promise<unknown>, message: string): Promise<void> =>
      tryExtra(step, message, correlationId, card.id);
    const storyVideo = isVideo(card.file_path) || card.format === 'reel';
    const wantsStory = (card.format === 'post' || card.format === 'reel') && flagOn(card.words, 'shareToStory');
    const storyCopies = storyVideo ? (fileUrl ? [fileUrl] : []) : storyUrls;
    const alongside = wantsStory ? storyCopies : [];
    const sendStories = async (): Promise<void> => {
      if (card.format === 'story' && extraUrls.length > 0) {
        await extra(
          () => publishStoryAlongside(igUserId, token, card, extraUrls, false),
          'social card publish: story was not posted'
        );
      }
      if (alongside.length > 0) {
        await extra(
          () => publishStoryAlongside(igUserId, token, card, alongside, storyVideo),
          'social card publish: story was not posted'
        );
      }
    };
    // Saving the link removes the original file, and a story from a video reads that file.
    const storiesFirst = isVideo(card.file_path) && alongside.length > 0;
    if (storiesFirst) await sendStories();

    let linked = false;
    if (published.url) {
      try {
        await updateSocialCard(card.id, { instagramUrl: published.url }, correlationId, card.doctor_id);
        linked = true;
      } catch {
        linked = false;
      }
    }
    if (!linked) {
      await keepLive(card.id);
      logger.warn({ correlationId, cardId: card.id }, 'social card publish: sent, link not saved');
    }

    const firstComment =
      card.format === 'story' || flagOn(card.words, 'commentsOff')
        ? undefined
        : wordText(card.words, 'firstComment', 500);
    if (firstComment && mediaId) {
      await extra(
        () => postFirstComment(mediaId, token, firstComment),
        'social card publish: first comment was not posted'
      );
    }
    if (flagOn(card.words, 'commentsOff') && card.format !== 'story' && mediaId) {
      await extra(() => closeComments(mediaId, token), 'social card publish: comments stayed open');
    }
    if (!storiesFirst) await sendStories();
    if (mediaId) await rememberSentPost(card.doctor_id, card.id, mediaId, thumbJpeg, correlationId);
    await admin
      .from('social_cards')
      .update({ publish_error: null, publish_attempt_at: null })
      .eq('id', card.id);
    return 'posted';
  } catch (err: unknown) {
    const facts = graphFacts(err);
    const reason = err instanceof Error && err.message.startsWith('container_') ? err.message : undefined;
    logger.warn({ correlationId, cardId: card.id, ...facts, reason }, 'social card publish failed');
    await markFailure(card.id, facts.graphCode === 190 ? 'not_connected' : 'meta_rejected');
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
    .select(DUE_COLUMNS)
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
    if (card.deleted_at || !card.file_path || heldBack(card.words)) return false;
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

/** Post now: sends this one card straight away instead of scanning every due card. */
export async function sendSocialCardNow(
  cardId: string,
  correlationId: string
): Promise<'posted' | 'failed' | 'skipped'> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    logger.error({ correlationId }, 'social card publish: no admin client');
    return 'skipped';
  }
  const { data, error } = await admin
    .from('social_cards')
    .select(DUE_COLUMNS)
    .eq('id', cardId)
    .eq('stage', 'ready')
    .maybeSingle();
  const card = data as DueCard | null;
  if (error || !card || card.deleted_at || !card.file_path || heldBack(card.words)) return 'skipped';
  const outcome = await sendCard(card, correlationId);
  logger.info({ correlationId, cardId, outcome }, 'social card publish: sent now');
  return outcome;
}
