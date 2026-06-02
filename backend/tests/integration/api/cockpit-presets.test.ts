/**
 * Cockpit Layout Presets — Route-Level Integration Smoke Test (CC-09)
 *
 * **SKIP-GATED.** Requires a running Supabase dev instance and a valid JWT.
 * Enable with `COCKPIT_PRESETS_INTEGRATION_TEST=1` in the environment.
 *
 * Without the gate the suite registers `describe.skip` — Jest still reports
 * pending tests but they never touch the network or database.
 *
 * When enabled, the tests exercise the full Express app (auth middleware →
 * service → Supabase) for GET / PUT / DELETE on
 *   /api/v1/settings/doctor/cockpit-presets
 *
 * @see backend/src/routes/api/v1/settings/doctor.ts
 * @see docs/Work/Daily-plans/May 2026/10-05-2026/cockpit-customization/Tasks/task-cc-09-presets-backend-service-endpoints.md
 */

import { describe, it, expect, beforeAll } from '@jest/globals';

const INTEGRATION_ENABLED = process.env.COCKPIT_PRESETS_INTEGRATION_TEST === '1';
const d = INTEGRATION_ENABLED ? describe : describe.skip;

const BASE_URL = process.env.BACKEND_URL ?? 'http://localhost:3001';
const JWT = process.env.TEST_DOCTOR_JWT ?? '';

const VALID_PRESET = {
  id: 'smoke-test-preset-001',
  name: 'Smoke Test Layout',
  created_at: new Date().toISOString(),
  layout: {
    slots: ['chart', 'body', 'rx'],
    widths: [26, 48, 26],
    collapsed: { chart: false, rx: false },
  },
};

async function req(
  method: string,
  path: string,
  body?: unknown
): Promise<{ status: number; json: unknown }> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${JWT}`,
      'Content-Type': 'application/json',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

d('Cockpit presets API smoke tests', () => {
  beforeAll(() => {
    if (!JWT) {
      throw new Error(
        'TEST_DOCTOR_JWT env var is required for cockpit-presets integration tests'
      );
    }
  });

  it('GET /cockpit-presets returns 200 with a presets array', async () => {
    const { status, json } = await req('GET', '/api/v1/settings/doctor/cockpit-presets');
    expect(status).toBe(200);
    expect(json).toHaveProperty('presets');
    expect(Array.isArray((json as { presets: unknown }).presets)).toBe(true);
  });

  it('PUT /cockpit-presets with valid payload returns 200 and the saved presets', async () => {
    const { status, json } = await req('PUT', '/api/v1/settings/doctor/cockpit-presets', {
      presets: [VALID_PRESET],
    });
    expect(status).toBe(200);
    const saved = (json as { presets: unknown[] }).presets;
    expect(Array.isArray(saved)).toBe(true);
    expect(saved).toHaveLength(1);
    expect((saved[0] as { id: string }).id).toBe(VALID_PRESET.id);
  });

  it('PUT /cockpit-presets with 6 presets returns 400', async () => {
    const sixPresets = Array.from({ length: 6 }, (_, i) => ({
      ...VALID_PRESET,
      id: `smoke-preset-${i}`,
      name: `Layout ${i}`,
    }));
    const { status } = await req('PUT', '/api/v1/settings/doctor/cockpit-presets', {
      presets: sixPresets,
    });
    expect(status).toBe(400);
  });

  it('DELETE /cockpit-presets/:id removes the preset and returns remaining array', async () => {
    const { status, json } = await req(
      'DELETE',
      `/api/v1/settings/doctor/cockpit-presets/${VALID_PRESET.id}`
    );
    expect(status).toBe(200);
    const remaining = (json as { presets: unknown[] }).presets;
    expect(Array.isArray(remaining)).toBe(true);
    expect(remaining.find((p) => (p as { id: string }).id === VALID_PRESET.id)).toBeUndefined();
  });

  it('DELETE /cockpit-presets/:id for unknown id returns 404', async () => {
    const { status } = await req(
      'DELETE',
      '/api/v1/settings/doctor/cockpit-presets/does-not-exist-xyz'
    );
    expect(status).toBe(404);
  });
});
