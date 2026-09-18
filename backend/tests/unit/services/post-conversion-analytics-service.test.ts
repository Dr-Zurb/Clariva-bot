/**
 * pca-01: post funnel aggregation + first-touch (no PHI / comment_text).
 */

import { describe, it, expect } from '@jest/globals';
import {
  aggregatePostFunnel,
  buildFirstTouchMap,
} from '../../../src/services/post-conversion-analytics-service';

describe('buildFirstTouchMap', () => {
  it('picks earliest lead with media_id per conversation', () => {
    const map = buildFirstTouchMap([
      {
        conversation_id: 'c1',
        media_id: 'm-later',
        platform: 'instagram',
        created_at: '2026-07-20T12:00:00.000Z',
      },
      {
        conversation_id: 'c1',
        media_id: 'm-first',
        platform: 'instagram',
        created_at: '2026-07-10T12:00:00.000Z',
      },
      {
        conversation_id: 'c2',
        media_id: 'm-fb',
        platform: 'facebook',
        created_at: '2026-07-15T12:00:00.000Z',
      },
    ]);
    expect(map.get('c1')).toEqual({ mediaId: 'm-first', platform: 'instagram' });
    expect(map.get('c2')).toEqual({ mediaId: 'm-fb', platform: 'facebook' });
  });
});

describe('aggregatePostFunnel', () => {
  it('counts leads/interested/dms and attributes appointments first-touch', () => {
    const firstTouch = new Map([
      ['c1', { mediaId: 'post-a', platform: 'instagram' as const }],
    ]);
    const conversationsWithAnyLead = new Set(['c1']);

    const { sourceSplit, posts } = aggregatePostFunnel({
      windowLeads: [
        {
          id: 'l1',
          media_id: 'post-a',
          platform: 'instagram',
          intent: 'book_appointment',
          conversation_id: 'c1',
          created_at: '2026-07-10T12:00:00.000Z',
        },
        {
          id: 'l2',
          media_id: 'post-a',
          platform: 'instagram',
          intent: 'spam',
          conversation_id: null,
          created_at: '2026-07-11T12:00:00.000Z',
        },
        {
          id: 'l3',
          media_id: 'post-b',
          platform: 'facebook',
          intent: 'pricing_inquiry',
          conversation_id: null,
          created_at: '2026-07-12T12:00:00.000Z',
        },
      ],
      firstTouchByConversation: firstTouch,
      appointments: [
        {
          id: 'a1',
          conversation_id: 'c1',
          status: 'confirmed',
          created_at: '2026-07-15T12:00:00.000Z',
        },
        {
          id: 'a2',
          conversation_id: 'c-direct',
          status: 'pending',
          created_at: '2026-07-16T12:00:00.000Z',
        },
      ],
      conversationsWithAnyLead,
    });

    expect(sourceSplit).toEqual({
      commentAttributed: 1,
      directDm: 1,
      paidCommentAttributed: 1,
      paidDirectDm: 0,
    });

    const postA = posts.find((p) => p.mediaId === 'post-a');
    expect(postA).toMatchObject({
      platform: 'instagram',
      leads: 2,
      interested: 1,
      dms: 1,
      appointments: 1,
      paid: 1,
    });
    expect(postA!.conversionRate).toBe(0.5);

    const postB = posts.find((p) => p.mediaId === 'post-b');
    expect(postB).toMatchObject({
      leads: 1,
      interested: 1,
      appointments: 0,
      paid: 0,
    });
  });

  it('sorts by appointments then leads', () => {
    const { posts } = aggregatePostFunnel({
      windowLeads: [
        {
          id: '1',
          media_id: 'z',
          platform: 'instagram',
          intent: 'medical_query',
          conversation_id: null,
          created_at: '2026-07-01T00:00:00.000Z',
        },
        {
          id: '2',
          media_id: 'a',
          platform: 'instagram',
          intent: 'medical_query',
          conversation_id: null,
          created_at: '2026-07-01T00:00:00.000Z',
        },
        {
          id: '3',
          media_id: 'a',
          platform: 'instagram',
          intent: 'medical_query',
          conversation_id: null,
          created_at: '2026-07-01T00:00:00.000Z',
        },
      ],
      firstTouchByConversation: new Map(),
      appointments: [],
      conversationsWithAnyLead: new Set(),
    });
    expect(posts.map((p) => p.mediaId)).toEqual(['a', 'z']);
  });
});
