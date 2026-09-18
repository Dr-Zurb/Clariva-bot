/**
 * lang-23: comment outreach language — linked conversation only (LANG5-D6).
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('../../../src/services/conversation-service', () => ({
  findConversationByPlatformId: jest.fn(),
  getConversationLanguage: jest.fn(),
}));

import {
  findConversationByPlatformId,
  getConversationLanguage,
} from '../../../src/services/conversation-service';
import { resolveCommentOutreachLanguage } from '../../../src/services/comment-outreach-language';

const findConv = findConversationByPlatformId as jest.MockedFunction<
  typeof findConversationByPlatformId
>;
const getLang = getConversationLanguage as jest.MockedFunction<
  typeof getConversationLanguage
>;

describe('resolveCommentOutreachLanguage (LANG5-D6)', () => {
  beforeEach(() => {
    findConv.mockReset();
    getLang.mockReset();
  });

  it('returns en when no linked conversation', async () => {
    findConv.mockResolvedValue(null);
    await expect(
      resolveCommentOutreachLanguage('doc', 'instagram', 'ig-1', 'corr')
    ).resolves.toBe('en');
    expect(getLang).not.toHaveBeenCalled();
  });

  it('uses sticky language from linked conversation', async () => {
    findConv.mockResolvedValue({ id: 'conv-1' } as never);
    getLang.mockResolvedValue('hi-Latn');
    await expect(
      resolveCommentOutreachLanguage('doc', 'instagram', 'ig-1', 'corr')
    ).resolves.toBe('hi-Latn');
    expect(getLang).toHaveBeenCalledWith('conv-1', 'corr');
  });

  it('does not accept comment text as an input (API surface)', () => {
    expect(resolveCommentOutreachLanguage.length).toBe(4);
  });
});
