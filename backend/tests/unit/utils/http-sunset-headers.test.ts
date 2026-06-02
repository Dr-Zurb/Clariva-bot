import type { Response } from 'express';
import { setSunsetHeaders } from '../../../src/utils/http';

describe('setSunsetHeaders (pdm-12)', () => {
  function mockRes(): Response & { headers: Record<string, string> } {
    const headers: Record<string, string> = {};
    return {
      headers,
      setHeader(name: string, value: string) {
        headers[name] = value;
      },
    } as Response & { headers: Record<string, string> };
  }

  it('sets Sunset and Deprecation with successor Link only', () => {
    const res = mockRes();
    setSunsetHeaders(res, {
      sunsetDate: '2026-08-01T00:00:00Z',
      successor: '/api/v1/opd/session?date=YYYY-MM-DD',
    });
    expect(res.headers.Sunset).toBe('2026-08-01T00:00:00Z');
    expect(res.headers.Deprecation).toBe('true');
    expect(res.headers.Link).toBe(
      '</api/v1/opd/session?date=YYYY-MM-DD>; rel="successor-version"',
    );
  });

  it('appends deprecation documentation link when provided', () => {
    const res = mockRes();
    const doc =
      'https://github.com/clariva-bot/clariva-bot/blob/main/docs/Reference/engineering/architecture/CONTRACTS.md#doctor-opd-session-snapshot-get-apiv1opdsession';
    setSunsetHeaders(res, {
      sunsetDate: '2026-08-01T00:00:00Z',
      successor: '/api/v1/opd/session?date=YYYY-MM-DD',
      link: doc,
    });
    expect(res.headers.Link).toContain('rel="successor-version"');
    expect(res.headers.Link).toContain('rel="deprecation"; type="text/html"');
    expect(res.headers.Link).toContain(doc);
  });
});
