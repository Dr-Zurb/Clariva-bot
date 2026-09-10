import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockGet = jest.fn<(...args: string[]) => Promise<string | null>>();
const mockMget = jest.fn<(...args: string[]) => Promise<(string | null)[]>>();
const mockSet = jest.fn<
  (...args: Array<string | number>) => Promise<'OK'>
>();
const mockRedis = { get: mockGet, mget: mockMget, set: mockSet };

jest.mock('../../../src/config/queue', () => ({
  isQueueEnabled: jest.fn(() => true),
  getQueueConnection: jest.fn(() => mockRedis),
  getWebhookQueue: jest.fn(),
}));

jest.mock('../../../src/config/logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import {
  getCachedPlatformAvatar,
  getCachedPlatformAvatars,
  setCachedPlatformAvatar,
} from '../../../src/services/platform-avatar-cache';

describe('platform-avatar-cache', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('gets a cached avatar URL', async () => {
    mockGet.mockResolvedValueOnce('https://cdn.example/pic.jpg');
    await expect(
      getCachedPlatformAvatar('instagram', 'igsid-1')
    ).resolves.toBe('https://cdn.example/pic.jpg');
    expect(mockGet).toHaveBeenCalledWith('platform-avatar:v1:instagram:igsid-1');
  });

  it('mgets unique refs into a map', async () => {
    // Insertion order after dedupe: instagram:a, facebook:b, instagram:missing
    mockMget.mockResolvedValueOnce([
      'https://cdn.example/a.jpg',
      'https://cdn.example/b.jpg',
      null,
    ]);
    const map = await getCachedPlatformAvatars([
      { channel: 'instagram', platformExternalId: 'a' },
      { channel: 'instagram', platformExternalId: 'a' },
      { channel: 'facebook', platformExternalId: 'b' },
      { channel: 'instagram', platformExternalId: 'missing' },
    ]);
    expect(map.get('instagram:a')).toBe('https://cdn.example/a.jpg');
    expect(map.get('facebook:b')).toBe('https://cdn.example/b.jpg');
    expect(map.has('instagram:missing')).toBe(false);
  });

  it('sets with 48h TTL', async () => {
    mockSet.mockResolvedValueOnce('OK');
    await setCachedPlatformAvatar(
      'instagram',
      'igsid-1',
      'https://cdn.example/pic.jpg'
    );
    expect(mockSet).toHaveBeenCalledWith(
      'platform-avatar:v1:instagram:igsid-1',
      'https://cdn.example/pic.jpg',
      'EX',
      60 * 60 * 48
    );
  });
});
