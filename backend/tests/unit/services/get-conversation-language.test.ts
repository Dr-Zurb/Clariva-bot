/**
 * lang-11: getConversationLanguage + coerceConversationLanguage unit tests.
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: jest.fn(),
}));

jest.mock('../../../src/config/logger', () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import * as database from '../../../src/config/database';
import { logger } from '../../../src/config/logger';
import {
  coerceConversationLanguage,
  getConversationLanguage,
} from '../../../src/services/conversation-service';

const mockedDb = database as jest.Mocked<typeof database>;
const mockedLogger = logger as jest.Mocked<typeof logger>;

function makeAdmin(language: unknown, opts?: { error?: boolean; missing?: boolean }) {
  const chain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue(
      (opts?.error
        ? { data: null, error: { message: 'query failed' } }
        : opts?.missing
          ? { data: null, error: null }
          : { data: { language }, error: null }) as never
    ),
  };
  return { from: jest.fn(() => chain) };
}

describe('coerceConversationLanguage', () => {
  it('returns en for null and invalid values', () => {
    expect(coerceConversationLanguage(null)).toBe('en');
    expect(coerceConversationLanguage(undefined)).toBe('en');
    expect(coerceConversationLanguage('fr')).toBe('en');
    expect(coerceConversationLanguage(42)).toBe('en');
  });

  it('accepts hi-Latn and other valid codes', () => {
    expect(coerceConversationLanguage('hi-Latn')).toBe('hi-Latn');
    expect(coerceConversationLanguage('hi')).toBe('hi');
    expect(coerceConversationLanguage('pa')).toBe('pa');
    expect(coerceConversationLanguage('other')).toBe('other');
  });
});

describe('getConversationLanguage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns stored language on happy path', async () => {
    mockedDb.getSupabaseAdminClient.mockReturnValue(makeAdmin('hi-Latn') as never);

    const lang = await getConversationLanguage('conv-1', 'corr-1');
    expect(lang).toBe('hi-Latn');
  });

  it('defaults to en and warns when conversation row is missing', async () => {
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      makeAdmin(null, { missing: true }) as never
    );

    const lang = await getConversationLanguage('conv-missing', 'corr-2');
    expect(lang).toBe('en');
    expect(mockedLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: 'conv-missing' }),
      'getConversationLanguage: conversation missing; defaulting to en'
    );
  });

  it('defaults to en when language column is null', async () => {
    mockedDb.getSupabaseAdminClient.mockReturnValue(makeAdmin(null) as never);

    const lang = await getConversationLanguage('conv-null', 'corr-3');
    expect(lang).toBe('en');
  });

  it('defaults to en and warns when stored language is invalid', async () => {
    mockedDb.getSupabaseAdminClient.mockReturnValue(makeAdmin('xx-invalid') as never);

    const lang = await getConversationLanguage('conv-bad', 'corr-4');
    expect(lang).toBe('en');
    expect(mockedLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: 'conv-bad' }),
      'getConversationLanguage: invalid stored language; defaulting to en'
    );
  });

  it('defaults to en when admin client is unavailable', async () => {
    mockedDb.getSupabaseAdminClient.mockReturnValue(null);

    const lang = await getConversationLanguage('conv-1', 'corr-5');
    expect(lang).toBe('en');
    expect(mockedLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: 'conv-1' }),
      'getConversationLanguage: admin client unavailable; defaulting to en'
    );
  });
});
