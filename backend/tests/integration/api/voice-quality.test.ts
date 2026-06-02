/**
 * Voice Quality ingest API — route-level integration smoke
 * (Sub-batch C · task-voice-C2).
 *
 * **SKIP-GATED.** Requires a running backend, a doctor JWT, and a
 * consultation session id the doctor owns. Enable with
 * `VOICE_QUALITY_INTEGRATION_TEST=1`.
 *
 * Mirrors the post-call-summary integration test pattern; we do not
 * exercise the patient-JWT branch here because that requires minting
 * a fresh HMAC token (tested in unit + service-layer tests). Doctor-
 * branch coverage proves the route + service + DB wiring round-trip.
 */

import { describe, it, expect } from '@jest/globals';

const INTEGRATION_ENABLED = process.env.VOICE_QUALITY_INTEGRATION_TEST === '1';
const d = INTEGRATION_ENABLED ? describe : describe.skip;

const BASE_URL = process.env.BACKEND_URL ?? 'http://localhost:3001';
const JWT_DOCTOR = process.env.TEST_DOCTOR_JWT ?? '';
const SESSION_ID = process.env.TEST_CONSULTATION_SESSION_ID ?? '';

interface SuccessEnvelope {
  success: true;
  data: { inserted: number; sessionId: string; role: string };
}

async function postSamples(
  sessionId: string,
  jwt: string,
  body: unknown,
): Promise<{ status: number; json: unknown }> {
  const res = await fetch(
    `${BASE_URL}/api/v1/consultation/${encodeURIComponent(sessionId)}/voice-quality`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jwt}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  );
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

d('POST /api/v1/consultation/:sessionId/voice-quality', () => {
  it('inserts a small batch and returns 201 with the inserted count', async () => {
    expect(JWT_DOCTOR).toBeTruthy();
    expect(SESSION_ID).toBeTruthy();

    const samples = [
      {
        sampleSeq: 0,
        networkQualityLevel: 5,
        rttMs: 38,
        jitterMs: 4,
        packetLossPct: 0.0,
        audioInputLevel: 22.5,
        audioOutputLevel: 30.0,
      },
      {
        sampleSeq: 1,
        networkQualityLevel: 4,
        rttMs: 95,
        jitterMs: 12,
        packetLossPct: 0.5,
      },
    ];

    const { status, json } = await postSamples(SESSION_ID, JWT_DOCTOR, {
      samples,
    });
    expect(status).toBe(201);
    const body = json as SuccessEnvelope;
    expect(body.success).toBe(true);
    expect(body.data.sessionId).toBe(SESSION_ID);
    expect(body.data.inserted).toBe(samples.length);
    expect(body.data.role).toBe('doctor');
  });

  it('returns 401 without Authorization', async () => {
    expect(SESSION_ID).toBeTruthy();
    const res = await fetch(
      `${BASE_URL}/api/v1/consultation/${encodeURIComponent(SESSION_ID)}/voice-quality`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ samples: [{ sampleSeq: 0 }] }),
      },
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 on empty samples array', async () => {
    expect(JWT_DOCTOR).toBeTruthy();
    expect(SESSION_ID).toBeTruthy();
    const { status } = await postSamples(SESSION_ID, JWT_DOCTOR, {
      samples: [],
    });
    expect(status).toBe(400);
  });

  it('returns 400 on missing sampleSeq', async () => {
    expect(JWT_DOCTOR).toBeTruthy();
    expect(SESSION_ID).toBeTruthy();
    const { status } = await postSamples(SESSION_ID, JWT_DOCTOR, {
      samples: [{ rttMs: 50 }],
    });
    expect(status).toBe(400);
  });
});
