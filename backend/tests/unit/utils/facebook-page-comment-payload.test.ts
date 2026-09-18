/**
 * fbm-09: Facebook Page feed comment payload helpers.
 */

import { describe, it, expect } from '@jest/globals';
import {
  isFacebookPageCommentPayload,
  extractFacebookCommentEventId,
  parseFacebookPageCommentPayload,
} from '../../../src/utils/webhook-event-id';

const PAGE_ID = '1041330372407980';

function payload(value: Record<string, unknown>) {
  return {
    object: 'page',
    entry: [
      {
        id: PAGE_ID,
        time: 1,
        changes: [{ field: 'feed', value }],
      },
    ],
  };
}

describe('Facebook Page comment payload helpers', () => {
  it('detects feed comment payloads', () => {
    expect(
      isFacebookPageCommentPayload(
        payload({
          item: 'comment',
          verb: 'add',
          comment_id: 'c1',
          from: { id: 'u1' },
          message: 'hi',
        })
      )
    ).toBe(true);
  });

  it('does not treat messaging DMs as comments', () => {
    expect(
      isFacebookPageCommentPayload({
        object: 'page',
        entry: [{ id: PAGE_ID, messaging: [{ message: { mid: 'm1', text: 'hi' } }] }],
      })
    ).toBe(false);
  });

  it('extracts comment_id as event id', () => {
    expect(
      extractFacebookCommentEventId(
        payload({
          item: 'comment',
          comment_id: 'c-99',
          from: { id: 'u1' },
        })
      )
    ).toBe('c-99');
  });

  it('parses add comment fields', () => {
    const parsed = parseFacebookPageCommentPayload(
      payload({
        item: 'comment',
        verb: 'add',
        comment_id: 'c1',
        post_id: `${PAGE_ID}_post`,
        from: { id: 'u1', name: 'PATIENT_TEST' },
        message: ' Book please ',
      })
    );
    expect(parsed).toEqual({
      commentId: 'c1',
      commenterUserId: 'u1',
      commentText: 'Book please',
      postId: `${PAGE_ID}_post`,
      pageId: PAGE_ID,
      verb: 'add',
      commenterUsername: 'PATIENT_TEST',
    });
  });
});
