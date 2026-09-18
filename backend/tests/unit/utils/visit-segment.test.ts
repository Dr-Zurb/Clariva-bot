import { classifyVisitSegment } from '../../../src/utils/visit-segment';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-08-06T12:00:00Z');

describe('classifyVisitSegment', () => {
  it('returns new-30d for first completed visit in window', () => {
    expect(classifyVisitSegment([NOW - 5 * DAY], NOW)).toBe('new-30d');
  });

  it('returns revisit-30d when prior completed visit exists', () => {
    expect(classifyVisitSegment([NOW - 5 * DAY, NOW - 60 * DAY], NOW)).toBe(
      'revisit-30d'
    );
  });

  it('returns null when no completed visit in window', () => {
    expect(classifyVisitSegment([NOW - 60 * DAY], NOW)).toBe(null);
    expect(classifyVisitSegment([], NOW)).toBe(null);
  });
});
