/**
 * Scheduled send. Ids and status codes only.
 * The signed URL, the token, the caption, and the post URL stay out of the log.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
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
import { runSocialCardPublishJob } from '../../../src/services/social-card-publish-service';

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
});
