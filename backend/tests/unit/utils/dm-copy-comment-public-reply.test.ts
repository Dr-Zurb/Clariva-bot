/**
 * mca-02: public comment replies are uniquely tailored (username + rotation).
 */

import { describe, expect, it } from '@jest/globals';
import {
  buildCommentPublicReplyText,
  DM_COPY_ENGLISH_ONLY_EXCEPTIONS,
} from '../../../src/utils/dm-copy';

const VARIANTS = DM_COPY_ENGLISH_ONLY_EXCEPTIONS.COMMENT_PUBLIC_REPLY.variants;

describe('buildCommentPublicReplyText', () => {
  it('keeps the documented English first variant', () => {
    expect(DM_COPY_ENGLISH_ONLY_EXCEPTIONS.COMMENT_PUBLIC_REPLY.text).toBe(
      'Check your DM for more information.'
    );
    expect(VARIANTS).toContain(DM_COPY_ENGLISH_ONLY_EXCEPTIONS.COMMENT_PUBLIC_REPLY.text);
    expect(VARIANTS.length).toBeGreaterThanOrEqual(3);
  });

  it('is retry-stable for the same comment id', () => {
    const a = buildCommentPublicReplyText({ commentId: 'comment-stable-1' });
    const b = buildCommentPublicReplyText({ commentId: 'comment-stable-1' });
    expect(a).toBe(b);
    expect(VARIANTS).toContain(a);
  });

  it('can produce different variants for different comment ids', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 40; i += 1) {
      seen.add(buildCommentPublicReplyText({ commentId: `comment-${i}` }));
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it('prefixes a safe username and strips a leading @', () => {
    const body = buildCommentPublicReplyText({
      commentId: 'comment-user-1',
      username: '@clinic_fan',
    });
    expect(body.startsWith('@clinic_fan ')).toBe(true);
    expect(VARIANTS.some((v) => body.endsWith(v))).toBe(true);
  });

  it('drops an unsafe username instead of interpolating it', () => {
    const body = buildCommentPublicReplyText({
      commentId: 'comment-user-2',
      username: 'not a handle!!!',
    });
    expect(body.startsWith('@')).toBe(false);
    expect(VARIANTS).toContain(body);
  });
});
