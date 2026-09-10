import { describe, expect, it } from '@jest/globals';
import {
  LOBBY_FRESH_MS,
  resolveLobbyPresence,
} from '../../../src/utils/lobby-presence';

describe('resolveLobbyPresence', () => {
  const nowMs = Date.parse('2026-08-12T12:00:00.000Z');

  it('returns waiting when last_seen is fresh', () => {
    expect(
      resolveLobbyPresence({
        checkedInAt: new Date(nowMs - 60_000).toISOString(),
        lastSeenAt: new Date(nowMs - 30_000).toISOString(),
        nowMs,
      })
    ).toBe('waiting');
  });

  it('returns stepped_away when checked in but last_seen stale', () => {
    expect(
      resolveLobbyPresence({
        checkedInAt: new Date(nowMs - 10 * 60_000).toISOString(),
        lastSeenAt: new Date(nowMs - LOBBY_FRESH_MS - 1).toISOString(),
        nowMs,
      })
    ).toBe('stepped_away');
  });

  it('returns unknown when never checked in', () => {
    expect(
      resolveLobbyPresence({
        checkedInAt: null,
        lastSeenAt: null,
        nowMs,
      })
    ).toBe('unknown');
  });

  it('returns unknown for desk-only arrival (no lobby heartbeat)', () => {
    expect(
      resolveLobbyPresence({
        checkedInAt: new Date(nowMs - 60_000).toISOString(),
        lastSeenAt: null,
        nowMs,
      })
    ).toBe('unknown');
  });
});
