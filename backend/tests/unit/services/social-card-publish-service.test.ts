/**
 * Scheduled send. Ids and status codes only.
 * The signed URL, the token, the caption, and the post URL stay out of the log.
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import axios from 'axios';
import { createCanvas, loadImage } from 'canvas';

jest.mock('axios');
jest.mock('../../../src/config/logger', () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn() },
}));
jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: jest.fn(),
}));
jest.mock('../../../src/services/social-card-service', () => ({
  updateSocialCard: jest.fn(),
  rememberSentPost: jest.fn(),
}));

import { logger } from '../../../src/config/logger';
import * as database from '../../../src/config/database';
import { rememberSentPost, updateSocialCard } from '../../../src/services/social-card-service';
import { runSocialCardPublishJob, sendSocialCardNow } from '../../../src/services/social-card-publish-service';

const mockedDb = database as jest.Mocked<typeof database>;
const mockedAxios = axios as jest.Mocked<typeof axios>;
const mockedUpdate = updateSocialCard as jest.MockedFunction<typeof updateSocialCard>;
const mockedRemember = rememberSentPost as jest.MockedFunction<typeof rememberSentPost>;
const mockedWarn = logger.warn as jest.MockedFunction<typeof logger.warn>;

const doctorId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const cardId = '11111111-1111-1111-1111-111111111111';
const signedUrl = 'https://files.example/photo?token=secret-file';
const accessToken = 'ig-token-secret';
const permalink = 'https://www.instagram.com/p/DummyPost01/';

function widePhoto(): Buffer {
  const canvas = createCanvas(2000, 1000);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#224466';
  ctx.fillRect(0, 0, 2000, 1000);
  return canvas.toBuffer('image/jpeg', { quality: 0.8 });
}

function storageFor(photo: Buffer) {
  const uploaded: Buffer[] = [];
  const signed = jest.fn().mockResolvedValue({
    data: { signedUrl },
    error: null,
  } as never);
  const remove = jest.fn().mockResolvedValue({ error: null } as never);
  return {
    uploaded,
    remove,
    bucket: {
      download: jest.fn().mockResolvedValue({ data: photo, error: null } as never),
      upload: jest.fn(async (_key: string, body: Buffer) => {
        uploaded.push(body);
        return { error: null };
      }),
      remove,
      createSignedUrl: signed,
    },
  };
}

function cardsChain(rows: unknown[]) {
  const chain = {
    select: jest.fn(),
    eq: jest.fn(),
    lte: jest.fn(),
    not: jest.fn(),
    is: jest.fn(),
    limit: jest.fn(),
    update: jest.fn(),
    maybeSingle: jest.fn().mockResolvedValue({ data: { id: cardId }, error: null } as never),
    then(onFulfilled: (value: { data: unknown[]; error: null }) => unknown) {
      return Promise.resolve(onFulfilled({ data: rows, error: null }));
    },
  };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.lte.mockReturnValue(chain);
  chain.not.mockReturnValue(chain);
  chain.is.mockReturnValue(chain);
  chain.limit.mockReturnValue(chain);
  chain.update.mockReturnValue(chain);
  return chain;
}

function instagramChain(row: unknown) {
  const chain = {
    select: jest.fn(),
    eq: jest.fn(),
    maybeSingle: jest.fn().mockResolvedValue({ data: row, error: null } as never),
  };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  return chain;
}

const dueCard = {
  id: cardId,
  doctor_id: doctorId,
  format: 'post',
  words: { caption: 'What a first visit costs' },
  file_path: `${doctorId}/photo.jpg`,
  publish_attempt_at: null,
  deleted_at: null,
  scheduled_at: '2026-10-13T08:00:00.000Z',
  stage: 'ready',
};

describe('social card publish', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('posts a due photo and does not log the file or the token', async () => {
    const cards = cardsChain([dueCard]);
    const files = storageFor(widePhoto());
    mockedDb.getSupabaseAdminClient.mockReturnValue({
      from: jest.fn((table: string) =>
        table === 'doctor_instagram'
          ? instagramChain({
              instagram_access_token: accessToken,
              instagram_page_id: '17841400000000000',
            })
          : cards
      ),
      storage: { from: jest.fn(() => files.bucket) },
    } as never);
    mockedAxios.post
      .mockResolvedValueOnce({ data: { id: 'creation-1' } } as never)
      .mockResolvedValueOnce({ data: { id: 'media-1' } } as never);
    mockedAxios.get
      .mockResolvedValueOnce({ data: { status_code: 'FINISHED' } } as never)
      .mockResolvedValueOnce({ data: { permalink } } as never);
    mockedUpdate.mockResolvedValue({ id: cardId } as never);

    const result = await runSocialCardPublishJob('corr-publish');

    expect(result).toEqual({ due: 1, posted: 1, failed: 0, skipped: 0 });
    expect(mockedUpdate).toHaveBeenCalledWith(cardId, { instagramUrl: permalink }, 'corr-publish', doctorId);
    expect(mockedRemember).toHaveBeenCalledWith(doctorId, cardId, 'media-1', expect.any(Buffer), 'corr-publish');
    const sent = files.uploaded[0];
    expect(sent?.[0]).toBe(0xff);
    const fitted = sent ? await loadImage(sent) : null;
    expect(fitted?.width).toBeLessThanOrEqual(1440);
    expect(fitted && fitted.width / fitted.height).toBeLessThanOrEqual(1.91);
    expect(files.remove).toHaveBeenCalled();
    const imageParam = mockedAxios.post.mock.calls[0]?.[2] as { params?: { image_url?: string } } | undefined;
    expect(imageParam?.params?.image_url).toBe(signedUrl);
    const logged = JSON.stringify(mockedWarn.mock.calls) + JSON.stringify((logger.info as jest.Mock).mock.calls);
    expect(logged).not.toContain(signedUrl);
    expect(logged).not.toContain(accessToken);
    expect(logged).not.toContain(permalink);
    expect(logged).not.toContain('What a first visit costs');
    expect(logged).not.toContain(`${doctorId}/photo.jpg`);
  });

  it('sends alt text, collaborators, and the AI label on a photo', async () => {
    const cards = cardsChain([
      {
        ...dueCard,
        words: {
          caption: 'What a first visit costs',
          altText: 'A fee card on the desk',
          collaborator: '@Clinic.Partner, @Clinic.Partner, not a name, third_doc',
          aiGenerated: true,
          location: 'The clinic',
          firstComment: 'https://example/page',
        },
      },
    ]);
    const files = storageFor(widePhoto());
    mockedDb.getSupabaseAdminClient.mockReturnValue({
      from: jest.fn((table: string) =>
        table === 'doctor_instagram'
          ? instagramChain({
              instagram_access_token: accessToken,
              instagram_page_id: '17841400000000000',
            })
          : cards
      ),
      storage: { from: jest.fn(() => files.bucket) },
    } as never);
    mockedAxios.post
      .mockResolvedValueOnce({ data: { id: 'creation-1' } } as never)
      .mockResolvedValueOnce({ data: { id: 'media-1' } } as never);
    mockedAxios.get
      .mockResolvedValueOnce({ data: { status_code: 'FINISHED' } } as never)
      .mockResolvedValueOnce({ data: { permalink } } as never);
    mockedUpdate.mockResolvedValue({ id: cardId } as never);

    await runSocialCardPublishJob('corr-publish');

    const params = (mockedAxios.post.mock.calls[0]?.[2] as { params?: Record<string, string> } | undefined)?.params;
    expect(params?.alt_text).toBe('A fee card on the desk');
    expect(params?.collaborators).toBe("['Clinic.Partner','third_doc']");
    expect(params?.is_ai_generated).toBe('true');
    expect(params?.share_to_feed).toBeUndefined();
    expect(params).not.toHaveProperty('location_id');
    const commentCall = mockedAxios.post.mock.calls[2];
    expect(commentCall?.[0]).toBe('https://graph.instagram.com/v21.0/media-1/comments');
    expect((commentCall?.[2] as { params?: { message?: string } } | undefined)?.params?.message).toBe(
      'https://example/page'
    );
    const logged = JSON.stringify(mockedWarn.mock.calls) + JSON.stringify((logger.info as jest.Mock).mock.calls);
    expect(logged).not.toContain('A fee card on the desk');
    expect(logged).not.toContain('Clinic.Partner');
    expect(logged).not.toContain('What a first visit costs');
    expect(logged).not.toContain('https://example/page');
  });

  it('shares a reel to the feed and does not send alt text on it', async () => {
    const cards = cardsChain([
      {
        ...dueCard,
        format: 'reel',
        file_path: `${doctorId}/clip.mp4`,
        words: {
          caption: 'Watch',
          shareToFeed: true,
          collaborator: 'clinic.partner, the other doctor',
          aiGenerated: true,
          altText: 'Should not ride on a reel',
        },
      },
    ]);
    const files = storageFor(widePhoto());
    mockedDb.getSupabaseAdminClient.mockReturnValue({
      from: jest.fn((table: string) =>
        table === 'doctor_instagram'
          ? instagramChain({
              instagram_access_token: accessToken,
              instagram_page_id: '17841400000000000',
            })
          : cards
      ),
      storage: { from: jest.fn(() => files.bucket) },
    } as never);
    mockedAxios.post
      .mockResolvedValueOnce({ data: { id: 'creation-1' } } as never)
      .mockResolvedValueOnce({ data: { id: 'media-1' } } as never);
    mockedAxios.get
      .mockResolvedValueOnce({ data: { status_code: 'FINISHED' } } as never)
      .mockResolvedValueOnce({ data: { permalink } } as never);
    mockedUpdate.mockResolvedValue({ id: cardId } as never);

    await runSocialCardPublishJob('corr-publish');

    const params = (mockedAxios.post.mock.calls[0]?.[2] as { params?: Record<string, string> } | undefined)?.params;
    expect(params?.media_type).toBe('REELS');
    expect(params?.share_to_feed).toBe('true');
    expect(params?.is_ai_generated).toBe('true');
    expect(params?.collaborators).toBe("['clinic.partner']");
    expect(params?.alt_text).toBeUndefined();
    expect(files.bucket.download).not.toHaveBeenCalled();
  });

  it('closes comments after the photo is up', async () => {
    const cards = cardsChain([
      {
        ...dueCard,
        words: { caption: 'Hello', commentsOff: true },
      },
    ]);
    const files = storageFor(widePhoto());
    mockedDb.getSupabaseAdminClient.mockReturnValue({
      from: jest.fn((table: string) =>
        table === 'doctor_instagram'
          ? instagramChain({
              instagram_access_token: accessToken,
              instagram_page_id: '17841400000000000',
            })
          : cards
      ),
      storage: { from: jest.fn(() => files.bucket) },
    } as never);
    mockedAxios.post
      .mockResolvedValueOnce({ data: { id: 'creation-1' } } as never)
      .mockResolvedValueOnce({ data: { id: 'media-1' } } as never)
      .mockResolvedValueOnce({ data: { success: true } } as never);
    mockedAxios.get
      .mockResolvedValueOnce({ data: { status_code: 'FINISHED' } } as never)
      .mockResolvedValueOnce({ data: { permalink } } as never);
    mockedUpdate.mockResolvedValue({ id: cardId } as never);

    const result = await runSocialCardPublishJob('corr-publish');

    expect(result.posted).toBe(1);
    const closeCall = mockedAxios.post.mock.calls[2];
    expect(closeCall?.[0]).toBe('https://graph.instagram.com/v21.0/media-1');
    const params = (closeCall?.[2] as { params?: Record<string, string> } | undefined)?.params;
    expect(params?.comment_enabled).toBe('false');
    expect(params?.access_token).toBe(accessToken);
    const logged = JSON.stringify(mockedWarn.mock.calls) + JSON.stringify((logger.info as jest.Mock).mock.calls);
    expect(logged).not.toContain(accessToken);
  });

  it('does not post the first comment when comments are off', async () => {
    const cards = cardsChain([
      {
        ...dueCard,
        words: { caption: 'Hello', firstComment: 'Book here', commentsOff: true },
      },
    ]);
    const files = storageFor(widePhoto());
    mockedDb.getSupabaseAdminClient.mockReturnValue({
      from: jest.fn((table: string) =>
        table === 'doctor_instagram'
          ? instagramChain({
              instagram_access_token: accessToken,
              instagram_page_id: '17841400000000000',
            })
          : cards
      ),
      storage: { from: jest.fn(() => files.bucket) },
    } as never);
    mockedAxios.post
      .mockResolvedValueOnce({ data: { id: 'creation-1' } } as never)
      .mockResolvedValueOnce({ data: { id: 'media-1' } } as never)
      .mockResolvedValueOnce({ data: { success: true } } as never);
    mockedAxios.get
      .mockResolvedValueOnce({ data: { status_code: 'FINISHED' } } as never)
      .mockResolvedValueOnce({ data: { permalink } } as never);
    mockedUpdate.mockResolvedValue({ id: cardId } as never);

    const result = await runSocialCardPublishJob('corr-publish');

    expect(result.posted).toBe(1);
    const urls = mockedAxios.post.mock.calls.map((call) => String(call[0]));
    expect(urls.some((url) => url.includes('/comments'))).toBe(false);
    const closeCall = mockedAxios.post.mock.calls[2];
    expect(closeCall?.[0]).toBe('https://graph.instagram.com/v21.0/media-1');
    const params = (closeCall?.[2] as { params?: Record<string, string> } | undefined)?.params;
    expect(params?.comment_enabled).toBe('false');
    const logged = JSON.stringify(mockedWarn.mock.calls) + JSON.stringify((logger.info as jest.Mock).mock.calls);
    expect(logged).not.toContain('Book here');
  });

  it('still marks the card posted when comments stay open', async () => {
    const cards = cardsChain([
      {
        ...dueCard,
        words: { caption: 'Hello', commentsOff: true },
      },
    ]);
    const files = storageFor(widePhoto());
    mockedDb.getSupabaseAdminClient.mockReturnValue({
      from: jest.fn((table: string) =>
        table === 'doctor_instagram'
          ? instagramChain({
              instagram_access_token: accessToken,
              instagram_page_id: '17841400000000000',
            })
          : cards
      ),
      storage: { from: jest.fn(() => files.bucket) },
    } as never);
    mockedAxios.isAxiosError.mockReturnValue(true);
    mockedAxios.post
      .mockResolvedValueOnce({ data: { id: 'creation-1' } } as never)
      .mockResolvedValueOnce({ data: { id: 'media-1' } } as never)
      .mockRejectedValueOnce({
        isAxiosError: true,
        response: { status: 400, data: { error: { code: 10 } } },
      } as never);
    mockedAxios.get
      .mockResolvedValueOnce({ data: { status_code: 'FINISHED' } } as never)
      .mockResolvedValueOnce({ data: { permalink } } as never);
    mockedUpdate.mockResolvedValue({ id: cardId } as never);

    const result = await runSocialCardPublishJob('corr-publish');

    expect(result).toEqual({ due: 1, posted: 1, failed: 0, skipped: 0 });
    expect(mockedUpdate).toHaveBeenCalledWith(cardId, { instagramUrl: permalink }, 'corr-publish', doctorId);
    const logged = JSON.stringify(mockedWarn.mock.calls);
    expect(logged).toContain('comments stayed open');
    expect(logged).not.toContain(accessToken);
    expect(logged).not.toContain(permalink);
  });

  it('still marks the card posted when the first comment does not go out', async () => {
    const cards = cardsChain([
      {
        ...dueCard,
        words: { caption: 'Hello', firstComment: 'The page is here' },
      },
    ]);
    const files = storageFor(widePhoto());
    mockedDb.getSupabaseAdminClient.mockReturnValue({
      from: jest.fn((table: string) =>
        table === 'doctor_instagram'
          ? instagramChain({
              instagram_access_token: accessToken,
              instagram_page_id: '17841400000000000',
            })
          : cards
      ),
      storage: { from: jest.fn(() => files.bucket) },
    } as never);
    mockedAxios.isAxiosError.mockReturnValue(true);
    mockedAxios.post
      .mockResolvedValueOnce({ data: { id: 'creation-1' } } as never)
      .mockResolvedValueOnce({ data: { id: 'media-1' } } as never)
      .mockRejectedValueOnce({
        isAxiosError: true,
        response: { status: 400, data: { error: { code: 10 } } },
      } as never);
    mockedAxios.get
      .mockResolvedValueOnce({ data: { status_code: 'FINISHED' } } as never)
      .mockResolvedValueOnce({ data: { permalink } } as never);
    mockedUpdate.mockResolvedValue({ id: cardId } as never);

    const result = await runSocialCardPublishJob('corr-publish');

    expect(result).toEqual({ due: 1, posted: 1, failed: 0, skipped: 0 });
    const logged = JSON.stringify(mockedWarn.mock.calls);
    expect(logged).toContain('first comment was not posted');
    expect(logged).not.toContain('The page is here');
    expect(logged).not.toContain(accessToken);
  });

  it('does not send a card the doctor will post', async () => {
    const cards = cardsChain([{ ...dueCard, words: { byHand: true, caption: 'x' } }]);
    mockedDb.getSupabaseAdminClient.mockReturnValue({
      from: jest.fn(() => cards),
      storage: { from: jest.fn() },
    } as never);

    const result = await runSocialCardPublishJob('corr-publish');

    expect(result).toEqual({ due: 0, posted: 0, failed: 0, skipped: 0 });
    expect(mockedAxios.post).not.toHaveBeenCalled();
    expect(cards.update).not.toHaveBeenCalled();
  });

  it('sends a photo reel as a short video', async () => {
    const cards = cardsChain([{ ...dueCard, format: 'reel', file_path: `${doctorId}/photo.jpg` }]);
    const files = storageFor(widePhoto());
    mockedDb.getSupabaseAdminClient.mockReturnValue({
      from: jest.fn((table: string) =>
        table === 'doctor_instagram'
          ? instagramChain({
              instagram_access_token: accessToken,
              instagram_page_id: '17841400000000000',
            })
          : cards
      ),
      storage: { from: jest.fn(() => files.bucket) },
    } as never);
    mockedAxios.post
      .mockResolvedValueOnce({ data: { id: 'creation-1' } } as never)
      .mockResolvedValueOnce({ data: { id: 'media-1' } } as never);
    mockedAxios.get
      .mockResolvedValueOnce({ data: { status_code: 'FINISHED' } } as never)
      .mockResolvedValueOnce({ data: { permalink } } as never);
    mockedUpdate.mockResolvedValue({ id: cardId } as never);

    const result = await runSocialCardPublishJob('corr-publish');

    expect(result).toEqual({ due: 1, posted: 1, failed: 0, skipped: 0 });
    const params = (mockedAxios.post.mock.calls[0]?.[2] as { params?: Record<string, string> } | undefined)?.params;
    expect(params?.media_type).toBe('REELS');
    expect(params?.video_url).toBe(signedUrl);
    expect(params?.image_url).toBeUndefined();
    expect(files.uploaded[0]?.subarray(4, 8).toString()).toBe('ftyp');
    const logged = JSON.stringify(mockedWarn.mock.calls) + JSON.stringify((logger.info as jest.Mock).mock.calls);
    expect(logged).not.toContain(signedUrl);
    expect(logged).not.toContain(accessToken);
  });

  it('leaves the card when Instagram is not connected', async () => {
    const cards = cardsChain([dueCard]);
    mockedDb.getSupabaseAdminClient.mockReturnValue({
      from: jest.fn((table: string) =>
        table === 'doctor_instagram' ? instagramChain(null) : cards
      ),
      storage: { from: jest.fn() },
    } as never);

    const result = await runSocialCardPublishJob('corr-publish');

    expect(result.failed).toBe(1);
    expect(result.posted).toBe(0);
    expect(mockedAxios.post).not.toHaveBeenCalled();
    expect(cards.update).toHaveBeenCalledWith(
      expect.objectContaining({ publish_error: 'not_connected' })
    );
  });

  it('records a rejection without logging the file address', async () => {
    const cards = cardsChain([dueCard]);
    const files = storageFor(widePhoto());
    mockedDb.getSupabaseAdminClient.mockReturnValue({
      from: jest.fn((table: string) =>
        table === 'doctor_instagram'
          ? instagramChain({
              instagram_access_token: accessToken,
              instagram_page_id: '17841400000000000',
            })
          : cards
      ),
      storage: { from: jest.fn(() => files.bucket) },
    } as never);
    mockedAxios.isAxiosError.mockReturnValue(true);
    mockedAxios.post.mockRejectedValue({
      isAxiosError: true,
      message: signedUrl,
      response: { status: 400 },
    } as never);

    const result = await runSocialCardPublishJob('corr-publish');

    expect(result.failed).toBe(1);
    expect(JSON.stringify(mockedWarn.mock.calls)).not.toContain(signedUrl);
    expect(cards.update).toHaveBeenCalledWith(
      expect.objectContaining({ publish_error: 'meta_rejected' })
    );
  });

  describe('when Instagram stumbles', () => {
    function connected(cards: ReturnType<typeof cardsChain>, files: ReturnType<typeof storageFor>): void {
      mockedDb.getSupabaseAdminClient.mockReturnValue({
        from: jest.fn((table: string) =>
          table === 'doctor_instagram'
            ? instagramChain({
                instagram_access_token: accessToken,
                instagram_page_id: '17841400000000000',
              })
            : cards
        ),
        storage: { from: jest.fn(() => files.bucket) },
      } as never);
    }

    function publishCalls(): unknown[][] {
      return mockedAxios.post.mock.calls.filter((call) => String(call[0]).endsWith('/media_publish'));
    }

    let wait: { mockRestore: () => void } | null = null;

    beforeEach(() => {
      mockedAxios.isAxiosError.mockReturnValue(true);
      wait = jest.spyOn(global, 'setTimeout').mockImplementation(((done: () => void) => {
        done();
        return 0;
      }) as never);
    });

    afterEach(() => {
      wait?.mockRestore();
      wait = null;
    });

    it('tries a passing error again and posts once', async () => {
      const cards = cardsChain([dueCard]);
      const files = storageFor(widePhoto());
      connected(cards, files);
      mockedAxios.post
        .mockRejectedValueOnce({
          isAxiosError: true,
          response: { status: 500, data: { error: { code: 2 } } },
        } as never)
        .mockResolvedValueOnce({ data: { id: 'creation-1' } } as never)
        .mockResolvedValueOnce({ data: { id: 'media-1' } } as never);
      mockedAxios.get
        .mockResolvedValueOnce({ data: { status_code: 'FINISHED' } } as never)
        .mockResolvedValueOnce({ data: { permalink } } as never);
      mockedUpdate.mockResolvedValue({ id: cardId } as never);

      const result = await runSocialCardPublishJob('corr-publish');

      expect(result).toEqual({ due: 1, posted: 1, failed: 0, skipped: 0 });
      expect(publishCalls()).toHaveLength(1);
      expect(mockedUpdate).toHaveBeenCalledWith(cardId, { instagramUrl: permalink }, 'corr-publish', doctorId);
      expect(cards.update).not.toHaveBeenCalledWith(expect.objectContaining({ publish_error: 'meta_rejected' }));
    });

    it('does not publish again when a dropped call already went up', async () => {
      const cards = cardsChain([dueCard]);
      const files = storageFor(widePhoto());
      connected(cards, files);
      mockedAxios.post
        .mockResolvedValueOnce({ data: { id: 'creation-1' } } as never)
        .mockRejectedValueOnce({ isAxiosError: true, code: 'ECONNABORTED', message: signedUrl } as never);
      mockedAxios.get
        .mockResolvedValueOnce({ data: { status_code: 'FINISHED' } } as never)
        .mockResolvedValueOnce({ data: { status_code: 'PUBLISHED' } } as never)
        .mockResolvedValueOnce({
          data: {
            data: [{ id: 'media-9', timestamp: new Date().toISOString(), caption: 'What a first visit costs' }],
          },
        } as never)
        .mockResolvedValueOnce({ data: { permalink } } as never);
      mockedUpdate.mockResolvedValue({ id: cardId } as never);

      const result = await runSocialCardPublishJob('corr-publish');

      expect(result).toEqual({ due: 1, posted: 1, failed: 0, skipped: 0 });
      expect(publishCalls()).toHaveLength(1);
      expect(mockedRemember).toHaveBeenCalledWith(doctorId, cardId, 'media-9', expect.any(Buffer), 'corr-publish');
      expect(mockedUpdate).toHaveBeenCalledWith(cardId, { instagramUrl: permalink }, 'corr-publish', doctorId);
      const logged = JSON.stringify(mockedWarn.mock.calls) + JSON.stringify((logger.info as jest.Mock).mock.calls);
      expect(logged).not.toContain(signedUrl);
      expect(logged).not.toContain('What a first visit costs');
    });

    it('takes a live post off Ready when its link does not come back', async () => {
      const cards = cardsChain([dueCard]);
      const files = storageFor(widePhoto());
      connected(cards, files);
      const down = { isAxiosError: true, response: { status: 503, data: {} } };
      mockedAxios.post
        .mockResolvedValueOnce({ data: { id: 'creation-1' } } as never)
        .mockResolvedValueOnce({ data: { id: 'media-1' } } as never);
      mockedAxios.get
        .mockResolvedValueOnce({ data: { status_code: 'FINISHED' } } as never)
        .mockRejectedValueOnce(down as never)
        .mockRejectedValueOnce(down as never)
        .mockRejectedValueOnce(down as never);

      const result = await runSocialCardPublishJob('corr-publish');

      expect(result).toEqual({ due: 1, posted: 1, failed: 0, skipped: 0 });
      expect(mockedUpdate).not.toHaveBeenCalled();
      expect(cards.update).toHaveBeenCalledWith(
        expect.objectContaining({ stage: 'posted', publish_error: null, publish_attempt_at: null })
      );
      expect(cards.update).not.toHaveBeenCalledWith(expect.objectContaining({ publish_error: 'meta_rejected' }));
      expect(mockedRemember).toHaveBeenCalledWith(doctorId, cardId, 'media-1', expect.any(Buffer), 'corr-publish');
    });

    it('waits for a video that Instagram is still working on', async () => {
      const cards = cardsChain([{ ...dueCard, format: 'post', file_path: `${doctorId}/clip.mp4` }]);
      const files = storageFor(widePhoto());
      connected(cards, files);
      mockedAxios.post
        .mockResolvedValueOnce({ data: { id: 'creation-1' } } as never)
        .mockResolvedValueOnce({ data: { id: 'media-1' } } as never);
      for (let i = 0; i < 12; i += 1) {
        mockedAxios.get.mockResolvedValueOnce({ data: { status_code: 'IN_PROGRESS' } } as never);
      }
      mockedAxios.get
        .mockResolvedValueOnce({ data: { status_code: 'FINISHED' } } as never)
        .mockResolvedValueOnce({ data: { permalink } } as never);
      mockedUpdate.mockResolvedValue({ id: cardId } as never);

      const result = await runSocialCardPublishJob('corr-publish');

      expect(result).toEqual({ due: 1, posted: 1, failed: 0, skipped: 0 });
      expect(publishCalls()).toHaveLength(1);
      const params = (mockedAxios.post.mock.calls[0]?.[2] as { params?: Record<string, string> } | undefined)?.params;
      expect(params?.media_type).toBe('REELS');
    });

    it('gives up on a video that never finishes and says so in the log', async () => {
      const cards = cardsChain([{ ...dueCard, format: 'post', file_path: `${doctorId}/clip.mp4` }]);
      const files = storageFor(widePhoto());
      connected(cards, files);
      let clock = Date.parse('2026-10-28T02:00:00.000Z');
      const now = jest.spyOn(Date, 'now').mockImplementation(() => {
        clock += 20000;
        return clock;
      });
      mockedAxios.post.mockResolvedValueOnce({ data: { id: 'creation-1' } } as never);
      mockedAxios.get.mockResolvedValue({ data: { status_code: 'IN_PROGRESS' } } as never);

      const result = await runSocialCardPublishJob('corr-publish');
      now.mockRestore();
      mockedAxios.get.mockReset();

      expect(result.failed).toBe(1);
      expect(publishCalls()).toHaveLength(0);
      expect(JSON.stringify(mockedWarn.mock.calls)).toContain('container_timeout');
      expect(cards.update).toHaveBeenCalledWith(expect.objectContaining({ publish_error: 'meta_rejected' }));
    });

    it('marks an expired Instagram login as not connected', async () => {
      const cards = cardsChain([dueCard]);
      const files = storageFor(widePhoto());
      connected(cards, files);
      mockedAxios.post.mockRejectedValueOnce({
        isAxiosError: true,
        response: { status: 400, data: { error: { code: 190 } } },
      } as never);

      const result = await runSocialCardPublishJob('corr-publish');

      expect(result.failed).toBe(1);
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
      expect(cards.update).toHaveBeenCalledWith(expect.objectContaining({ publish_error: 'not_connected' }));
    });
  });

  it('also sends a photo post to your story', async () => {
    const cards = cardsChain([
      {
        ...dueCard,
        words: { caption: 'What a first visit costs', shareToStory: true, collaborator: 'clinic.partner' },
      },
    ]);
    const files = storageFor(widePhoto());
    mockedDb.getSupabaseAdminClient.mockReturnValue({
      from: jest.fn((table: string) =>
        table === 'doctor_instagram'
          ? instagramChain({
              instagram_access_token: accessToken,
              instagram_page_id: '17841400000000000',
            })
          : cards
      ),
      storage: { from: jest.fn(() => files.bucket) },
    } as never);
    mockedAxios.post
      .mockResolvedValueOnce({ data: { id: 'creation-1' } } as never)
      .mockResolvedValueOnce({ data: { id: 'media-1' } } as never)
      .mockResolvedValueOnce({ data: { id: 'creation-story' } } as never)
      .mockResolvedValueOnce({ data: { id: 'media-story' } } as never);
    mockedAxios.get
      .mockResolvedValueOnce({ data: { status_code: 'FINISHED' } } as never)
      .mockResolvedValueOnce({ data: { permalink } } as never)
      .mockResolvedValueOnce({ data: { status_code: 'FINISHED' } } as never);
    mockedUpdate.mockResolvedValue({ id: cardId } as never);

    const result = await runSocialCardPublishJob('corr-publish');

    expect(result).toEqual({ due: 1, posted: 1, failed: 0, skipped: 0 });
    expect(mockedUpdate).toHaveBeenCalledWith(cardId, { instagramUrl: permalink }, 'corr-publish', doctorId);
    const story = files.uploaded[1];
    const storyShot = story ? await loadImage(story) : null;
    expect(storyShot && storyShot.width / storyShot.height).toBeCloseTo(9 / 16, 2);
    const storyParams = (mockedAxios.post.mock.calls[2]?.[2] as { params?: Record<string, string> } | undefined)?.params;
    expect(storyParams?.media_type).toBe('STORIES');
    expect(storyParams?.image_url).toBe(signedUrl);
    expect(storyParams?.caption).toBeUndefined();
    expect(storyParams?.collaborators).toBeUndefined();
    expect(mockedAxios.post.mock.calls[3]?.[0]).toBe('https://graph.instagram.com/v21.0/17841400000000000/media_publish');
    const logged = JSON.stringify(mockedWarn.mock.calls) + JSON.stringify((logger.info as jest.Mock).mock.calls);
    expect(logged).not.toContain(signedUrl);
    expect(logged).not.toContain(accessToken);
    expect(logged).not.toContain('What a first visit costs');
  });

  it('also sends a reel to your story as a video', async () => {
    const cards = cardsChain([
      {
        ...dueCard,
        format: 'reel',
        file_path: `${doctorId}/clip.mp4`,
        words: { caption: 'Watch', shareToStory: true, shareToFeed: true },
      },
    ]);
    const files = storageFor(widePhoto());
    mockedDb.getSupabaseAdminClient.mockReturnValue({
      from: jest.fn((table: string) =>
        table === 'doctor_instagram'
          ? instagramChain({
              instagram_access_token: accessToken,
              instagram_page_id: '17841400000000000',
            })
          : cards
      ),
      storage: { from: jest.fn(() => files.bucket) },
    } as never);
    mockedAxios.post
      .mockResolvedValueOnce({ data: { id: 'creation-1' } } as never)
      .mockResolvedValueOnce({ data: { id: 'media-1' } } as never)
      .mockResolvedValueOnce({ data: { id: 'creation-story' } } as never)
      .mockResolvedValueOnce({ data: { id: 'media-story' } } as never);
    mockedAxios.get
      .mockResolvedValueOnce({ data: { status_code: 'FINISHED' } } as never)
      .mockResolvedValueOnce({ data: { permalink } } as never)
      .mockResolvedValueOnce({ data: { status_code: 'FINISHED' } } as never);
    mockedUpdate.mockResolvedValue({ id: cardId } as never);

    const result = await runSocialCardPublishJob('corr-publish');

    expect(result.posted).toBe(1);
    const reelParams = (mockedAxios.post.mock.calls[0]?.[2] as { params?: Record<string, string> } | undefined)?.params;
    expect(reelParams?.media_type).toBe('REELS');
    expect(reelParams?.share_to_feed).toBe('true');
    const storyParams = (mockedAxios.post.mock.calls[2]?.[2] as { params?: Record<string, string> } | undefined)?.params;
    expect(storyParams?.media_type).toBe('STORIES');
    expect(storyParams?.video_url).toBe(signedUrl);
    expect(storyParams?.caption).toBeUndefined();
    expect(storyParams?.share_to_feed).toBeUndefined();
  });

  it('still marks the card posted when the story does not go out', async () => {
    const cards = cardsChain([
      {
        ...dueCard,
        words: { caption: 'Hello', shareToStory: true },
      },
    ]);
    const files = storageFor(widePhoto());
    mockedDb.getSupabaseAdminClient.mockReturnValue({
      from: jest.fn((table: string) =>
        table === 'doctor_instagram'
          ? instagramChain({
              instagram_access_token: accessToken,
              instagram_page_id: '17841400000000000',
            })
          : cards
      ),
      storage: { from: jest.fn(() => files.bucket) },
    } as never);
    mockedAxios.isAxiosError.mockReturnValue(true);
    mockedAxios.post
      .mockResolvedValueOnce({ data: { id: 'creation-1' } } as never)
      .mockResolvedValueOnce({ data: { id: 'media-1' } } as never)
      .mockRejectedValueOnce({
        isAxiosError: true,
        response: { status: 400, data: { error: { code: 10 } } },
      } as never);
    mockedAxios.get
      .mockResolvedValueOnce({ data: { status_code: 'FINISHED' } } as never)
      .mockResolvedValueOnce({ data: { permalink } } as never);
    mockedUpdate.mockResolvedValue({ id: cardId } as never);

    const result = await runSocialCardPublishJob('corr-publish');

    expect(result).toEqual({ due: 1, posted: 1, failed: 0, skipped: 0 });
    expect(mockedUpdate).toHaveBeenCalledWith(cardId, { instagramUrl: permalink }, 'corr-publish', doctorId);
    const logged = JSON.stringify(mockedWarn.mock.calls);
    expect(logged).toContain('story was not posted');
    expect(logged).not.toContain(accessToken);
    expect(logged).not.toContain(signedUrl);
    expect(logged).not.toContain('Hello');
  });

  it('sends each photo on a story as its own story', async () => {
    const cards = cardsChain([
      {
        ...dueCard,
        format: 'story',
        words: {
          line: 'Wash your hands',
          frameStore: [{ id: 'frame-1', path: `${doctorId}/${cardId}/second.jpg` }],
        },
      },
    ]);
    const files = storageFor(widePhoto());
    mockedDb.getSupabaseAdminClient.mockReturnValue({
      from: jest.fn((table: string) =>
        table === 'doctor_instagram'
          ? instagramChain({
              instagram_access_token: accessToken,
              instagram_page_id: '17841400000000000',
            })
          : cards
      ),
      storage: { from: jest.fn(() => files.bucket) },
    } as never);
    mockedAxios.post
      .mockResolvedValueOnce({ data: { id: 'creation-1' } } as never)
      .mockResolvedValueOnce({ data: { id: 'media-1' } } as never)
      .mockResolvedValueOnce({ data: { id: 'creation-2' } } as never)
      .mockResolvedValueOnce({ data: { id: 'media-2' } } as never);
    mockedAxios.get
      .mockResolvedValueOnce({ data: { status_code: 'FINISHED' } } as never)
      .mockResolvedValueOnce({ data: { permalink } } as never)
      .mockResolvedValueOnce({ data: { status_code: 'FINISHED' } } as never);
    mockedUpdate.mockResolvedValue({ id: cardId } as never);

    const result = await runSocialCardPublishJob('corr-publish');

    expect(result).toEqual({ due: 1, posted: 1, failed: 0, skipped: 0 });
    expect(files.uploaded).toHaveLength(2);
    for (const shot of files.uploaded) {
      const image = await loadImage(shot);
      expect(image.width / image.height).toBeCloseTo(9 / 16, 2);
    }
    const first = (mockedAxios.post.mock.calls[0]?.[2] as { params?: Record<string, string> } | undefined)?.params;
    const second = (mockedAxios.post.mock.calls[2]?.[2] as { params?: Record<string, string> } | undefined)?.params;
    expect(first?.media_type).toBe('STORIES');
    expect(second?.media_type).toBe('STORIES');
    expect(first?.caption).toBeUndefined();
    expect(second?.caption).toBeUndefined();
    expect(mockedAxios.post.mock.calls.some((call) => {
      const params = (call[2] as { params?: Record<string, string> } | undefined)?.params;
      return params?.media_type === 'CAROUSEL';
    })).toBe(false);
    const logged = JSON.stringify(mockedWarn.mock.calls) + JSON.stringify((logger.info as jest.Mock).mock.calls);
    expect(logged).not.toContain(signedUrl);
    expect(logged).not.toContain(accessToken);
    expect(logged).not.toContain('Wash your hands');
  });

  describe('sending quickly', () => {
    function connected(cards: ReturnType<typeof cardsChain>, files: ReturnType<typeof storageFor>): void {
      mockedDb.getSupabaseAdminClient.mockReturnValue({
        from: jest.fn((table: string) =>
          table === 'doctor_instagram'
            ? instagramChain({
                instagram_access_token: accessToken,
                instagram_page_id: '17841400000000000',
              })
            : cards
        ),
        storage: { from: jest.fn(() => files.bucket) },
      } as never);
    }

    function photoPosts(withComment = false): void {
      mockedAxios.post
        .mockResolvedValueOnce({ data: { id: 'creation-1' } } as never)
        .mockResolvedValueOnce({ data: { id: 'media-1' } } as never);
      if (withComment) mockedAxios.post.mockResolvedValueOnce({ data: { id: 'comment-1' } } as never);
      mockedAxios.get
        .mockResolvedValueOnce({ data: { status_code: 'FINISHED' } } as never)
        .mockResolvedValueOnce({ data: { permalink } } as never);
      mockedUpdate.mockResolvedValue({ id: cardId } as never);
    }

    it('reads a smaller copy of the photo from storage', async () => {
      const cards = cardsChain([dueCard]);
      const files = storageFor(widePhoto());
      connected(cards, files);
      photoPosts();

      const result = await runSocialCardPublishJob('corr-publish');

      expect(result.posted).toBe(1);
      expect(files.bucket.download).toHaveBeenCalledTimes(1);
      expect(files.bucket.download).toHaveBeenCalledWith(dueCard.file_path, {
        transform: expect.objectContaining({ width: 2500, height: 2500, resize: 'contain' }),
      });
    });

    it('falls back to the original photo when storage cannot resize it', async () => {
      const cards = cardsChain([dueCard]);
      const files = storageFor(widePhoto());
      files.bucket.download.mockResolvedValueOnce({ data: null, error: { message: 'no transform' } } as never);
      connected(cards, files);
      photoPosts();

      const result = await runSocialCardPublishJob('corr-publish');

      expect(result.posted).toBe(1);
      expect(files.bucket.download).toHaveBeenCalledTimes(2);
      expect(files.bucket.download).toHaveBeenLastCalledWith(dueCard.file_path);
      expect(files.uploaded).toHaveLength(1);
    });

    it('marks the card posted before the first comment goes up', async () => {
      const cards = cardsChain([{ ...dueCard, words: { caption: 'Hello', firstComment: 'Book here' } }]);
      const files = storageFor(widePhoto());
      connected(cards, files);
      photoPosts(true);

      const result = await runSocialCardPublishJob('corr-publish');

      expect(result.posted).toBe(1);
      const commentOrder = mockedAxios.post.mock.invocationCallOrder[2] ?? 0;
      expect(String(mockedAxios.post.mock.calls[2]?.[0])).toContain('/media-1/comments');
      expect(mockedUpdate.mock.invocationCallOrder[0]).toBeLessThan(commentOrder);
    });

    it('sends the story from a video before the card is posted', async () => {
      const cards = cardsChain([
        { ...dueCard, format: 'reel', file_path: `${doctorId}/clip.mp4`, words: { shareToStory: true } },
      ]);
      const files = storageFor(widePhoto());
      connected(cards, files);
      mockedAxios.post
        .mockResolvedValueOnce({ data: { id: 'creation-1' } } as never)
        .mockResolvedValueOnce({ data: { id: 'media-1' } } as never)
        .mockResolvedValueOnce({ data: { id: 'creation-story' } } as never)
        .mockResolvedValueOnce({ data: { id: 'media-story' } } as never);
      mockedAxios.get
        .mockResolvedValueOnce({ data: { status_code: 'FINISHED' } } as never)
        .mockResolvedValueOnce({ data: { permalink } } as never)
        .mockResolvedValueOnce({ data: { status_code: 'FINISHED' } } as never);
      mockedUpdate.mockResolvedValue({ id: cardId } as never);

      const result = await runSocialCardPublishJob('corr-publish');

      expect(result.posted).toBe(1);
      const storyOrder = mockedAxios.post.mock.invocationCallOrder[3] ?? Infinity;
      expect(storyOrder).toBeLessThan(mockedUpdate.mock.invocationCallOrder[0] ?? 0);
    });

    it('Post now sends just that card without scanning the board', async () => {
      const cards = cardsChain([]);
      cards.maybeSingle.mockResolvedValueOnce({ data: dueCard, error: null } as never);
      const files = storageFor(widePhoto());
      connected(cards, files);
      photoPosts();

      const outcome = await sendSocialCardNow(cardId, 'corr-now');

      expect(outcome).toBe('posted');
      expect(cards.eq).toHaveBeenCalledWith('id', cardId);
      expect(cards.lte).not.toHaveBeenCalled();
      expect(mockedUpdate).toHaveBeenCalledWith(cardId, { instagramUrl: permalink }, 'corr-now', doctorId);
      const logged = JSON.stringify((logger.info as jest.Mock).mock.calls);
      expect(logged).not.toContain(permalink);
      expect(logged).not.toContain(dueCard.file_path);
    });

    it('Post now leaves a card the doctor posts by hand', async () => {
      const cards = cardsChain([]);
      cards.maybeSingle.mockResolvedValueOnce({
        data: { ...dueCard, words: { byHand: true } },
        error: null,
      } as never);
      const files = storageFor(widePhoto());
      connected(cards, files);

      const outcome = await sendSocialCardNow(cardId, 'corr-now');

      expect(outcome).toBe('skipped');
      expect(mockedAxios.post).not.toHaveBeenCalled();
      expect(cards.update).not.toHaveBeenCalled();
    });
  });
});
