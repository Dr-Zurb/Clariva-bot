/**
 * Phase 9 counts. No patient fields.
 */

import { describe, expect, it } from '@jest/globals';
import {
  aggregateSocialAnalytics,
  previousRange,
  socialAnalyticsSentence,
  ymdInZone,
  type AnalyticsPostInput,
  type SocialAnalytics,
} from '../../../src/services/social-analytics-service';

const ZONE = 'Asia/Kolkata';

function post(partial: Partial<AnalyticsPostInput> & Pick<AnalyticsPostInput, 'id'>): AnalyticsPostInput {
  return {
    title: partial.id,
    format: 'post',
    topic: null,
    caption: '',
    instagramUrl: null,
    postedAt: '2026-10-18T12:30:00.000Z',
    mediaId: null,
    thumbPath: null,
    ...partial,
  };
}

describe('social analytics', () => {
  it('keeps a late evening in India on that calendar day', () => {
    expect(ymdInZone('2026-10-18T18:29:00.000Z', ZONE)).toBe('2026-10-18');
    expect(ymdInZone('2026-10-18T18:30:00.000Z', ZONE)).toBe('2026-10-19');
  });

  it('counts a chat booking and a link booking once, and hides a blank conversion', () => {
    expect(previousRange('2026-10-12', '2026-10-18')).toEqual({
      from: '2026-10-05',
      to: '2026-10-11',
    });

    const report = aggregateSocialAnalytics({
      from: '2026-10-12',
      to: '2026-10-18',
      timeZone: ZONE,
      nowYmd: '2026-10-19',
      posts: [
        post({
          id: 'card-1',
          title: 'Fees',
          topic: 'Fees',
          mediaId: 'media-1',
          caption: 'What a first visit costs',
        }),
        post({
          id: 'card-2',
          title: 'Quiet reel',
          format: 'reel',
          postedAt: '2026-10-16T08:00:00.000Z',
        }),
        post({
          id: 'card-3',
          title: 'Nothing yet',
          postedAt: '2026-10-17T08:00:00.000Z',
        }),
      ],
      enquiries: [
        { id: 'c1', createdAt: '2026-10-18T10:00:00.000Z' },
        { id: 'c4', createdAt: '2026-10-17T10:00:00.000Z' },
        { id: 'c-old', createdAt: '2026-10-10T10:00:00.000Z' },
        { id: 'c-next', createdAt: '2026-10-18T18:30:00.000Z' },
      ],
      appointments: [
        { id: 'a1', createdAt: '2026-10-18T10:00:00.000Z', conversationId: 'c1' },
        { id: 'a3', createdAt: '2026-10-17T11:00:00.000Z', conversationId: 'c4' },
        { id: 'a-cancel', createdAt: '2026-10-17T12:00:00.000Z', conversationId: 'c4', status: 'cancelled' },
        { id: 'a-other', createdAt: '2026-10-17T12:00:00.000Z', conversationId: 'not-instagram' },
      ],
      linkBookings: [
        { cardId: 'card-1', bookedOn: '2026-10-18', appointmentId: 'a1' },
        { cardId: 'card-2', bookedOn: '2026-10-16', appointmentId: 'a2' },
      ],
      leads: [
        { mediaId: 'media-1', conversationId: 'c1', createdAt: '2026-10-18T09:00:00.000Z' },
        { mediaId: 'media-1', conversationId: 'c1', createdAt: '2026-10-18T09:30:00.000Z' },
        { mediaId: 'media-1', conversationId: 'c4', createdAt: '2026-10-17T09:00:00.000Z' },
      ],
      instagramConversationIds: ['c1', 'c4', 'c-old', 'c-next'],
    });

    expect(report.tiles.enquiries).toEqual({ value: 2, previous: 1 });
    expect(report.tiles.bookings.value).toBe(3);
    expect(report.tiles.conversion).toEqual({ value: 150, previous: 0 });
    expect(report.posts.find((row) => row.id === 'card-1')?.bookings).toBe(2);
    expect(report.posts.find((row) => row.id === 'card-1')?.enquiries).toBe(2);
    expect(report.posts.find((row) => row.id === 'card-2')?.bookings).toBe(1);
    expect(report.best.map((row) => row.id)).not.toContain('card-3');
    expect(report.topics.map((row) => row.topic)).toEqual(['Fees']);
    expect(report.days).toHaveLength(7);
    expect(report.days.reduce((sum, day) => sum + day.bookings, 0)).toBe(report.tiles.bookings.value);
    expect(report.rhythm.usual).toBeNull();

    const quiet = aggregateSocialAnalytics({
      from: '2026-10-12',
      to: '2026-10-18',
      timeZone: ZONE,
      nowYmd: '2026-10-19',
      posts: [],
      enquiries: [],
      appointments: [],
      linkBookings: [],
      leads: [],
      instagramConversationIds: [],
    });
    expect(quiet.tiles.conversion).toBeNull();
    expect(quiet.tiles.posts.value).toBe(0);
  });

  it('names a usual day only after four posts in eight weeks', () => {
    const posts = [0, 1, 2, 3].map((index) =>
      post({ id: `p${index}`, postedAt: '2026-10-18T12:30:00.000Z' })
    );
    const report = aggregateSocialAnalytics({
      from: '2026-10-13',
      to: '2026-10-19',
      timeZone: ZONE,
      nowYmd: '2026-10-19',
      posts,
      enquiries: [],
      appointments: [],
      linkBookings: [],
      leads: [],
      instagramConversationIds: [],
    });
    expect(report.rhythm.weeks).toHaveLength(8);
    expect(report.rhythm.weeks[7]).toEqual({ label: '18 Oct', posts: 4 });
    expect(report.rhythm.usual).toEqual({ weekday: 'Sunday', hour: '6 pm' });
  });

  it('writes one sentence from the counts on the page', () => {
    const base = {
      tiles: {
        enquiries: { value: 0, previous: 0 },
        bookings: { value: 0, previous: 0 },
        conversion: null,
        posts: { value: 2, previous: 0 },
      },
      formats: [],
      topics: [],
      posts: [],
      instagram: null,
    } satisfies Pick<SocialAnalytics, 'tiles' | 'formats' | 'topics' | 'posts' | 'instagram'>;

    expect(socialAnalyticsSentence({ ...base, tiles: { ...base.tiles, posts: { value: 0, previous: 0 } } })).toBeNull();

    expect(
      socialAnalyticsSentence({
        ...base,
        topics: [
          { topic: 'Fees', posts: 1, bookings: 2 },
          { topic: 'Cough', posts: 1, bookings: 1 },
        ],
      })
    ).toEqual({ text: 'Fees brought 2 bookings.', title: 'Fees' });

    expect(
      socialAnalyticsSentence({
        ...base,
        formats: [
          { format: 'reel', posts: 1, bookings: 1, views: 4 },
          { format: 'post', posts: 1, bookings: 0, views: 12 },
        ],
      })
    ).toEqual({ text: 'Reels brought 1 booking.', title: 'Another reel' });

    expect(
      socialAnalyticsSentence({
        ...base,
        tiles: { ...base.tiles, enquiries: { value: 3, previous: 0 } },
        formats: [
          { format: 'post', posts: 2, bookings: 0 },
          { format: 'reel', posts: 1, bookings: 0 },
        ],
        posts: [
          { format: 'post', topic: null, enquiries: 0, id: 'a', title: 'a', date: '', day: '', bookings: 0, instagramUrl: null, thumbUrl: null, caption: '' },
          { format: 'reel', topic: null, enquiries: 3, id: 'b', title: 'b', date: '', day: '', bookings: 0, instagramUrl: null, thumbUrl: null, caption: '' },
        ],
      })
    ).toEqual({ text: 'Reels brought 3 enquiries.', title: 'Another reel' });

    expect(
      socialAnalyticsSentence({
        ...base,
        formats: [
          { format: 'reel', posts: 1, bookings: 0, views: 12 },
          { format: 'post', posts: 2, bookings: 0, views: 4 },
        ],
      })
    ).toEqual({ text: 'Reels averaged 12 views.', title: 'Another reel' });

    expect(
      socialAnalyticsSentence({
        ...base,
        tiles: {
          enquiries: { value: 3, previous: 0 },
          bookings: { value: 0, previous: 0 },
          conversion: { value: 0, previous: 0 },
          posts: { value: 3, previous: 0 },
        },
        formats: [{ format: 'post', posts: 3, bookings: 0, views: 6 }],
        instagram: {
          tiles: {
            views: { value: 20, previous: 5 },
            reach: { value: 1, previous: 1 },
            interactions: { value: 2, previous: 0 },
            followers: null,
          },
        },
      })
    ).toEqual({
      text: 'Views were 20, up from 5. 3 enquiries did not become a booking.',
      title: null,
    });
  });
});
