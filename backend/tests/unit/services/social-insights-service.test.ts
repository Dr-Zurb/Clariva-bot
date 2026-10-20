/**
 * Phase 10. Counts only. A missing permission keeps the clinic page.
 */

import { describe, expect, it } from '@jest/globals';
import {
  averageViews,
  buildInstagramOverlay,
  dueForRefresh,
  insightsPermissionDenied,
  metricsFor,
  normalizeInstagramUrl,
} from '../../../src/services/social-insights-service';

describe('social insights', () => {
  it('asks a story for a different set than a reel', () => {
    expect(metricsFor('story')).toEqual(['views', 'reach', 'shares']);
    expect(metricsFor('story')).not.toContain('likes');
    expect(metricsFor('story')).not.toContain('saved');
    expect(metricsFor('reel')).toContain('likes');
    expect(metricsFor('reel')).toContain('saved');
    expect(metricsFor('post')).not.toContain('ig_reels_avg_watch_time');
  });

  it('matches a post address without its query', () => {
    expect(normalizeInstagramUrl('https://www.instagram.com/p/DummyPost01/?img_index=1')).toBe(
      'https://www.instagram.com/p/dummypost01'
    );
    expect(normalizeInstagramUrl('not a url')).toBe('');
  });

  it('treats a viewer shortage as unmeasured and a missing grant as denied', () => {
    expect(insightsPermissionDenied(10, 'Not enough viewers')).toBe(false);
    expect(insightsPermissionDenied(10, 'Application does not have permission for this action')).toBe(true);
    expect(insightsPermissionDenied(200, undefined)).toBe(true);
    expect(insightsPermissionDenied(100, 'unsupported metric')).toBe(false);
  });

  it('reads a story hourly while it is live and leaves it after a day', () => {
    const postedAt = '2026-10-19T02:00:00.000Z';
    expect(
      dueForRefresh({ format: 'story', postedAt, measuredAt: null, now: '2026-10-19T03:30:00.000Z' })
    ).toBe(true);
    expect(
      dueForRefresh({
        format: 'story',
        postedAt,
        measuredAt: '2026-10-19T03:00:00.000Z',
        now: '2026-10-19T03:30:00.000Z',
      })
    ).toBe(false);
    expect(
      dueForRefresh({ format: 'story', postedAt, measuredAt: null, now: '2026-10-20T03:00:00.000Z' })
    ).toBe(false);
    expect(
      dueForRefresh({
        format: 'post',
        postedAt: '2026-10-19T00:00:00.000Z',
        measuredAt: '2026-10-19T01:00:00.000Z',
        now: '2026-10-19T08:00:00.000Z',
      })
    ).toBe(true);
  });

  it('sums daily views, keeps reach as a period total, and waits for a follower yesterday', () => {
    const hidden = buildInstagramOverlay({
      status: 'missing',
      from: '2026-10-13',
      to: '2026-10-19',
      accountDays: [{ day: '2026-10-19', followers: 10, views: 4 }],
      reachRows: [],
      stats: [],
    });
    expect(hidden.instagram).toBeNull();

    const shown = buildInstagramOverlay({
      status: 'ready',
      from: '2026-10-13',
      to: '2026-10-19',
      accountDays: [
        { day: '2026-10-05', followers: 8, views: 0 },
        { day: '2026-10-06', followers: 8, views: 2 },
        { day: '2026-10-12', followers: 10, views: 1 },
        { day: '2026-10-18', followers: 12, views: 3 },
        { day: '2026-10-19', followers: 14, views: 5 },
      ],
      reachRows: [
        { span: 7, reach: 40, previousReach: 20, interactions: 9, previousInteractions: 4 },
        { span: 30, reach: 100, previousReach: 80, interactions: 30, previousInteractions: 10 },
      ],
      stats: [
        { cardId: 'a', views: 11, likes: 2, comments: null, saves: 0 },
        { cardId: 'b', views: null, likes: null, comments: null, saves: null },
      ],
    });
    expect(shown.instagram?.tiles.views).toEqual({ value: 8, previous: 3 });
    const periodViews = buildInstagramOverlay({
      status: 'ready',
      from: '2026-10-13',
      to: '2026-10-19',
      accountDays: [],
      reachRows: [
        { span: 7, reach: 40, previousReach: 20, interactions: 9, previousInteractions: 4, views: 15, previousViews: 6 },
      ],
      stats: [],
    });
    expect(periodViews.instagram?.tiles.views).toEqual({ value: 15, previous: 6 });
    expect(shown.instagram?.tiles.reach).toEqual({ value: 40, previous: 20 });
    expect(shown.instagram?.tiles.reach?.value).not.toBe(1 + 3 + 5);
    expect(shown.instagram?.tiles.followers).toEqual({ value: 4, previous: 2 });
    expect(shown.byCard.get('a')?.saves).toBe(0);
    expect(shown.byCard.get('b')?.views).toBeNull();
    expect(averageViews([11, null, 5])).toBe(8);
    expect(averageViews([null, null])).toBeNull();
  });
});
