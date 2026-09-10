/**
 * Inbox list date window policy (max 365d, default 30d, no unbounded).
 */

import { describe, it, expect } from '@jest/globals';
import { validateListInteractionsQuery } from '../../../src/utils/validation';
import { ValidationError } from '../../../src/utils/errors';

describe('validateListInteractionsQuery date policy', () => {
  it('defaults to last 30 days when dates omitted', () => {
    const q = validateListInteractionsQuery({});
    expect(q.dateFrom).toBeTruthy();
    expect(q.dateTo).toBeTruthy();
    const span = Date.parse(q.dateTo) - Date.parse(q.dateFrom);
    expect(span).toBeGreaterThan(29 * 24 * 60 * 60 * 1000);
    expect(span).toBeLessThanOrEqual(30 * 24 * 60 * 60 * 1000 + 2000);
  });

  it('rejects ranges over 365 days', () => {
    expect(() =>
      validateListInteractionsQuery({
        dateFrom: '2025-01-01T00:00:00.000Z',
        dateTo: '2026-07-01T00:00:00.000Z',
      })
    ).toThrow(ValidationError);
  });

  it('rejects dateFrom more than 1 year ago', () => {
    expect(() =>
      validateListInteractionsQuery({
        dateFrom: '2024-01-01T00:00:00.000Z',
        dateTo: '2024-01-15T00:00:00.000Z',
      })
    ).toThrow(ValidationError);
  });

  it('parses includeCounts query flag', () => {
    expect(validateListInteractionsQuery({ includeCounts: 'false' }).includeCounts).toBe(
      false
    );
    expect(validateListInteractionsQuery({ includeCounts: 'true' }).includeCounts).toBe(
      true
    );
    expect(validateListInteractionsQuery({}).includeCounts).toBeUndefined();
  });
});
