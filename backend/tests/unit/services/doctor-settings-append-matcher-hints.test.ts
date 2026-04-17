/**
 * Plan 01 / Task 03 — Unit tests for `appendMatcherHintsOnDoctorCatalogOffering`.
 *
 * Covers:
 *  - no-op when patch is entirely empty / whitespace
 *  - appends to existing hints (semicolon-separated) via `appendMatcherHintFields`
 *  - populates hints when offering had none
 *  - service_key lookup is case-insensitive + trimmed
 *  - skips write + returns false when append yields no change (idempotency)
 *  - rejects when practice has no catalog
 *  - rejects when service not found in catalog
 *  - rejects when catalog is malformed
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import {
  appendMatcherHintsOnDoctorCatalogOffering,
  type MatcherHintsAppendPayload,
} from '../../../src/services/doctor-settings-service';
import * as database from '../../../src/config/database';
import { InternalError, ValidationError } from '../../../src/utils/errors';

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: jest.fn(),
}));

const mockedDb = database as jest.Mocked<typeof database>;

const doctorId = '550e8400-e29b-41d4-a716-446655440001';
const correlationId = 'corr-test-001';
const SVC_ID_A = '11111111-1111-4111-8111-111111111111';
const SVC_ID_B = '22222222-2222-4222-8222-222222222222';

type CatalogOfferingInput = {
  service_id: string;
  service_key: string;
  label: string;
  matcher_hints?: { keywords?: string; include_when?: string; exclude_when?: string };
};

function makeCatalog(offerings: CatalogOfferingInput[]) {
  return {
    version: 1,
    services: offerings.map((o) => ({
      ...o,
      modalities: { text: { enabled: true, price_minor: 50000 } },
    })),
  };
}

/**
 * Builds a Supabase-like mock that supports:
 *   from('doctor_settings').select(...).eq(...).maybeSingle()
 *   from('doctor_settings').update(...).eq(...)
 */
function buildSupabaseMock(selectRow: unknown, updateError: unknown = null) {
  const maybeSingle = jest.fn().mockResolvedValue({ data: selectRow, error: null } as never);
  const selectEq = jest.fn().mockReturnValue({ maybeSingle });
  const select = jest.fn().mockReturnValue({ eq: selectEq });

  const updateEq = jest.fn().mockResolvedValue({ error: updateError } as never);
  const update = jest.fn().mockReturnValue({ eq: updateEq });

  const from = jest.fn().mockImplementation(() => ({ select, update }));
  return {
    client: { from },
    mocks: { from, select, selectEq, maybeSingle, update, updateEq },
  };
}

function validCatchAllAndOne(
  existingHintsOnA?: { keywords?: string; include_when?: string; exclude_when?: string }
) {
  return makeCatalog([
    {
      service_id: SVC_ID_A,
      service_key: 'acne_treatment',
      label: 'Acne Treatment',
      ...(existingHintsOnA ? { matcher_hints: existingHintsOnA } : {}),
    },
    {
      service_id: SVC_ID_B,
      service_key: 'other',
      label: 'Other / not listed',
    },
  ]);
}

describe('appendMatcherHintsOnDoctorCatalogOffering', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns false without touching DB when patch is entirely empty / whitespace', async () => {
    const { client, mocks } = buildSupabaseMock(null);
    mockedDb.getSupabaseAdminClient.mockReturnValue(client as never);

    const patch: MatcherHintsAppendPayload = {
      keywords: '',
      include_when: '   ',
      exclude_when: '\n\t',
    };
    const result = await appendMatcherHintsOnDoctorCatalogOffering(
      doctorId,
      correlationId,
      'acne_treatment',
      patch
    );
    expect(result).toBe(false);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('throws InternalError when supabase admin client is null', async () => {
    mockedDb.getSupabaseAdminClient.mockReturnValue(null as never);
    await expect(
      appendMatcherHintsOnDoctorCatalogOffering(doctorId, correlationId, 'acne_treatment', {
        include_when: 'severe acne',
      })
    ).rejects.toBeInstanceOf(InternalError);
  });

  it('rejects when practice has no catalog row', async () => {
    const { client } = buildSupabaseMock({ service_offerings_json: null });
    mockedDb.getSupabaseAdminClient.mockReturnValue(client as never);

    await expect(
      appendMatcherHintsOnDoctorCatalogOffering(doctorId, correlationId, 'acne_treatment', {
        include_when: 'severe acne',
      })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects when catalog JSON is malformed', async () => {
    const { client } = buildSupabaseMock({
      service_offerings_json: { version: 999, services: 'not-an-array' },
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(client as never);

    await expect(
      appendMatcherHintsOnDoctorCatalogOffering(doctorId, correlationId, 'acne_treatment', {
        include_when: 'severe acne',
      })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects when serviceKey is not in catalog', async () => {
    const { client } = buildSupabaseMock({
      service_offerings_json: validCatchAllAndOne(),
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(client as never);

    await expect(
      appendMatcherHintsOnDoctorCatalogOffering(doctorId, correlationId, 'does_not_exist', {
        include_when: 'severe acne',
      })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('appends include_when onto an offering that had no prior hints, and persists update', async () => {
    const catalog = validCatchAllAndOne();
    const { client, mocks } = buildSupabaseMock({ service_offerings_json: catalog });
    mockedDb.getSupabaseAdminClient.mockReturnValue(client as never);

    const result = await appendMatcherHintsOnDoctorCatalogOffering(
      doctorId,
      correlationId,
      'acne_treatment',
      { include_when: 'severe acne on back' }
    );
    expect(result).toBe(true);

    expect(mocks.update).toHaveBeenCalledTimes(1);
    const updateArg = (mocks.update.mock.calls[0]![0] ?? {}) as {
      service_offerings_json?: { services?: { service_key: string; matcher_hints?: unknown }[] };
    };
    const saved = updateArg.service_offerings_json!.services!.find(
      (s) => s.service_key === 'acne_treatment'
    ) as { matcher_hints?: { include_when?: string } } | undefined;
    expect(saved?.matcher_hints?.include_when).toBe('severe acne on back');
  });

  it('appends with semicolon separator when prior hints already exist', async () => {
    const catalog = validCatchAllAndOne({
      keywords: 'acne',
      include_when: 'pimples',
    });
    const { client, mocks } = buildSupabaseMock({ service_offerings_json: catalog });
    mockedDb.getSupabaseAdminClient.mockReturnValue(client as never);

    const result = await appendMatcherHintsOnDoctorCatalogOffering(
      doctorId,
      correlationId,
      'acne_treatment',
      { keywords: 'cystic', include_when: 'severe acne' }
    );
    expect(result).toBe(true);

    const updateArg = (mocks.update.mock.calls[0]![0] ?? {}) as {
      service_offerings_json?: { services?: { service_key: string; matcher_hints?: unknown }[] };
    };
    const saved = updateArg.service_offerings_json!.services!.find(
      (s) => s.service_key === 'acne_treatment'
    ) as {
      matcher_hints?: { keywords?: string; include_when?: string; exclude_when?: string };
    };
    expect(saved.matcher_hints?.keywords).toBe('acne; cystic');
    expect(saved.matcher_hints?.include_when).toBe('pimples; severe acne');
    expect(saved.matcher_hints?.exclude_when).toBeUndefined();
  });

  it('matches service_key case-insensitively with trim', async () => {
    const catalog = validCatchAllAndOne();
    const { client, mocks } = buildSupabaseMock({ service_offerings_json: catalog });
    mockedDb.getSupabaseAdminClient.mockReturnValue(client as never);

    const result = await appendMatcherHintsOnDoctorCatalogOffering(
      doctorId,
      correlationId,
      '  ACNE_TREATMENT  ',
      { exclude_when: 'not for hair' }
    );
    expect(result).toBe(true);
    expect(mocks.update).toHaveBeenCalledTimes(1);
  });

  it('is idempotent: skips DB write and returns false when merge yields unchanged hints', async () => {
    // Edge: only whitespace-after-trim input doesn't even reach the DB (covered by empty-patch
    // test above). This test forces the "unchanged" branch by providing a fragment that
    // appendMatcherHintFields truncates away to match the existing value — achievable by
    // having an existing value already at the max cap and appending more (slice truncation
    // preserves the existing prefix exactly).
    //
    // Simpler: set existing keywords at the cap, then attempt to append "anything" — the
    // truncated result equals the existing prefix, so nothing changes.
    const existing = 'a'.repeat(400); // keywords max
    const catalog = validCatchAllAndOne({ keywords: existing });
    const { client, mocks } = buildSupabaseMock({ service_offerings_json: catalog });
    mockedDb.getSupabaseAdminClient.mockReturnValue(client as never);

    const result = await appendMatcherHintsOnDoctorCatalogOffering(
      doctorId,
      correlationId,
      'acne_treatment',
      { keywords: 'zzz' }
    );
    expect(result).toBe(false);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
