/**
 * Unit tests for voice-call-quality-service (Sub-batch C · task-voice-C2).
 *
 * Pure-validation matrix only. The auth + insert paths require a live
 * Supabase admin client + a valid HS256-signed patient JWT; those are
 * exercised by the route-level integration test
 * (`backend/tests/integration/api/voice-quality.test.ts`) under the
 * `VOICE_QUALITY_INTEGRATION_TEST=1` skip gate.
 *
 * Doctrine: mirrors video sibling
 * (`tests/unit/services/video-call-quality-service.test.ts` if/when it
 * lands) — exercise `validateSample` + `validateBody` against the
 * documented contract. The validation surface is the most common
 * runtime failure point (frontend reporters can drift; the service
 * must fail loudly instead of silently coercing).
 */

import { describe, expect, it } from '@jest/globals';

jest.mock('../../../src/config/env', () => ({
  env: {
    SUPABASE_JWT_SECRET: 'test-secret-at-least-16-chars-long',
  },
}));
jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: jest.fn(),
}));
jest.mock('../../../src/config/logger', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

import {
  validateBody,
  validateSample,
  type VoiceQualitySample,
} from '../../../src/services/voice-call-quality-service';
import { ValidationError } from '../../../src/utils/errors';

describe('voice-call-quality-service · validateSample', () => {
  it('accepts a fully-populated sample', () => {
    const raw = {
      sampleSeq: 0,
      networkQualityLevel: 5,
      rttMs: 42,
      jitterMs: 7,
      packetLossPct: 0.5,
      audioInputLevel: 25.5,
      audioOutputLevel: 33.25,
      twilioRoomSid: 'RM' + 'a'.repeat(32),
    };
    const sample = validateSample(raw);
    expect(sample.sampleSeq).toBe(0);
    expect(sample.networkQualityLevel).toBe(5);
    expect(sample.rttMs).toBe(42);
    expect(sample.jitterMs).toBe(7);
    // packetLossPct is float-preserving
    expect(sample.packetLossPct).toBeCloseTo(0.5, 5);
    expect(sample.audioInputLevel).toBeCloseTo(25.5, 5);
    expect(sample.audioOutputLevel).toBeCloseTo(33.25, 5);
    expect(sample.twilioRoomSid).toBe(raw.twilioRoomSid);
  });

  it('accepts a sparse sample with only sampleSeq', () => {
    const sample = validateSample({ sampleSeq: 7 });
    expect(sample.sampleSeq).toBe(7);
    expect(sample.networkQualityLevel).toBeNull();
    expect(sample.rttMs).toBeNull();
    expect(sample.jitterMs).toBeNull();
    expect(sample.packetLossPct).toBeNull();
    expect(sample.audioInputLevel).toBeNull();
    expect(sample.audioOutputLevel).toBeNull();
    expect(sample.twilioRoomSid).toBeUndefined();
  });

  it('rejects non-object inputs', () => {
    expect(() => validateSample(null)).toThrow(ValidationError);
    expect(() => validateSample('hello')).toThrow(ValidationError);
    expect(() => validateSample(42)).toThrow(ValidationError);
  });

  it('requires sampleSeq', () => {
    expect(() => validateSample({})).toThrow(/sampleSeq.*required/);
    expect(() => validateSample({ sampleSeq: null })).toThrow(/sampleSeq/);
  });

  it('rejects negative sampleSeq', () => {
    expect(() => validateSample({ sampleSeq: -1 })).toThrow(ValidationError);
  });

  it('rejects out-of-range networkQualityLevel', () => {
    expect(() =>
      validateSample({ sampleSeq: 0, networkQualityLevel: 6 }),
    ).toThrow(/networkQualityLevel.*\[0, 5\]/);
    expect(() =>
      validateSample({ sampleSeq: 0, networkQualityLevel: -1 }),
    ).toThrow(/networkQualityLevel/);
  });

  it('rejects out-of-range rttMs', () => {
    expect(() =>
      validateSample({ sampleSeq: 0, rttMs: 60_001 }),
    ).toThrow(/rttMs/);
    expect(() =>
      validateSample({ sampleSeq: 0, rttMs: -1 }),
    ).toThrow(/rttMs/);
  });

  it('rejects out-of-range packetLossPct', () => {
    expect(() =>
      validateSample({ sampleSeq: 0, packetLossPct: 100.01 }),
    ).toThrow(/packetLossPct/);
    expect(() =>
      validateSample({ sampleSeq: 0, packetLossPct: -0.5 }),
    ).toThrow(/packetLossPct/);
  });

  it('rejects out-of-range audio levels', () => {
    expect(() =>
      validateSample({ sampleSeq: 0, audioInputLevel: 100.5 }),
    ).toThrow(/audioInputLevel/);
    expect(() =>
      validateSample({ sampleSeq: 0, audioOutputLevel: -1 }),
    ).toThrow(/audioOutputLevel/);
  });

  it('rejects non-finite numeric fields', () => {
    expect(() =>
      validateSample({ sampleSeq: 0, rttMs: Number.NaN }),
    ).toThrow(/rttMs/);
    expect(() =>
      validateSample({ sampleSeq: 0, jitterMs: Number.POSITIVE_INFINITY }),
    ).toThrow(/jitterMs/);
  });

  it('rejects non-string twilioRoomSid', () => {
    expect(() =>
      validateSample({ sampleSeq: 0, twilioRoomSid: 12345 as unknown }),
    ).toThrow(/twilioRoomSid/);
  });

  it('rejects oversized twilioRoomSid', () => {
    expect(() =>
      validateSample({ sampleSeq: 0, twilioRoomSid: 'R'.repeat(65) }),
    ).toThrow(/twilioRoomSid.*64/);
  });

  it('truncates sampleSeq to integer', () => {
    const sample = validateSample({ sampleSeq: 3.7 });
    expect(sample.sampleSeq).toBe(3);
  });

  it('preserves packet loss decimal precision', () => {
    const sample = validateSample({ sampleSeq: 0, packetLossPct: 12.34 });
    expect(sample.packetLossPct).toBeCloseTo(12.34, 5);
  });
});

describe('voice-call-quality-service · validateBody', () => {
  it('accepts a single-sample body', () => {
    const body = { samples: [{ sampleSeq: 0, rttMs: 50 }] };
    const samples = validateBody(body);
    expect(samples).toHaveLength(1);
    expect(samples[0]?.sampleSeq).toBe(0);
    expect(samples[0]?.rttMs).toBe(50);
  });

  it('accepts a 64-sample batch (typical 30-min call per side)', () => {
    const samples = Array.from({ length: 64 }, (_, i) => ({
      sampleSeq: i,
      rttMs: 40 + i,
    }));
    const result = validateBody({ samples });
    expect(result).toHaveLength(64);
    expect(result[0]?.sampleSeq).toBe(0);
    expect(result[63]?.sampleSeq).toBe(63);
  });

  it('rejects non-object body', () => {
    expect(() => validateBody(null)).toThrow(ValidationError);
    expect(() => validateBody('hello')).toThrow(ValidationError);
  });

  it('rejects body without `samples`', () => {
    expect(() => validateBody({})).toThrow(/samples.*array/);
    expect(() => validateBody({ samples: null })).toThrow(/samples/);
  });

  it('rejects empty samples array', () => {
    expect(() => validateBody({ samples: [] })).toThrow(/at least one/);
  });

  it('rejects oversized batch (over 256)', () => {
    const samples = Array.from({ length: 257 }, (_, i) => ({
      sampleSeq: i,
    }));
    expect(() => validateBody({ samples })).toThrow(/Batch too large/);
  });

  it('annotates batch index on inner sample errors', () => {
    const body = {
      samples: [
        { sampleSeq: 0 },
        { sampleSeq: 1 },
        { sampleSeq: -1 }, // <- invalid
      ],
    };
    expect(() => validateBody(body)).toThrow(/samples\[2\]/);
  });

  it('returns a typed VoiceQualitySample[]', () => {
    const body = { samples: [{ sampleSeq: 0 }] };
    const samples: VoiceQualitySample[] = validateBody(body);
    expect(samples[0]?.sampleSeq).toBe(0);
  });
});
