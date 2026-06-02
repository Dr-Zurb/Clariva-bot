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
  appendExamplesEntry,
  appendMatcherHintsOnDoctorCatalogOffering,
  type MatcherHintsAppendPayload,
} from '../../../src/services/doctor-settings-service';
import * as database from '../../../src/config/database';
import { InternalError, ValidationError } from '../../../src/utils/errors';
import {
  MATCHER_HINT_EXAMPLE_MAX_CHARS,
  MATCHER_HINT_EXAMPLES_MAX_COUNT,
} from '../../../src/utils/service-catalog-schema';

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
  matcher_hints?: {
    examples?: string[];
    keywords?: string;
    include_when?: string;
    exclude_when?: string;
  };
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
  existingHintsOnA?: {
    examples?: string[];
    keywords?: string;
    include_when?: string;
    exclude_when?: string;
  }
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

  it('legacy-only offering (no examples) preserves the existing legacy-append behavior (Task 13 back-compat regression)', async () => {
    // Pre-Task-13 contract: when an offering has no `examples`, the writer falls
    // back to the legacy `appendMatcherHintFields` path byte-for-byte. This test
    // pins the back-compat branch so a future cleanup (deleting the legacy branch
    // once telemetry shows zero v1-only hits in 30 days — see Task 13 Decision log)
    // doesn't silently regress the un-migrated catalogs that still exist.
    const catalog = validCatchAllAndOne({ keywords: 'acne', include_when: 'pimples' });
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
      service_offerings_json?: {
        services?: { service_key: string; matcher_hints?: unknown }[];
      };
    };
    const saved = updateArg.service_offerings_json!.services!.find(
      (s) => s.service_key === 'acne_treatment'
    ) as {
      matcher_hints?: {
        examples?: string[];
        keywords?: string;
        include_when?: string;
      };
    };
    expect(saved.matcher_hints?.examples).toBeUndefined();
    expect(saved.matcher_hints?.keywords).toBe('acne; cystic');
    expect(saved.matcher_hints?.include_when).toBe('pimples; severe acne');
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

describe('appendExamplesEntry (Task 13 — pure helper)', () => {
  it('appends a new fragment, trims whitespace, returns changed=true', () => {
    const { next, changed } = appendExamplesEntry(
      ['acne on my back', 'cystic pimples'],
      '   severe acne breakout   '
    );
    expect(changed).toBe(true);
    expect(next).toEqual(['acne on my back', 'cystic pimples', 'severe acne breakout']);
  });

  it('is idempotent / case-insensitive on duplicates: returns changed=false and the original list', () => {
    const existing = ['acne on my back', 'CYSTIC pimples'];
    const { next, changed } = appendExamplesEntry(existing, '  cystic PIMPLES  ');
    expect(changed).toBe(false);
    expect(next).toEqual(existing);
  });

  it('truncates fragments that exceed maxLen (defaults to MATCHER_HINT_EXAMPLE_MAX_CHARS)', () => {
    const long = 'x'.repeat(MATCHER_HINT_EXAMPLE_MAX_CHARS + 50);
    const { next, changed } = appendExamplesEntry(['seed'], long);
    expect(changed).toBe(true);
    expect(next[1]!.length).toBe(MATCHER_HINT_EXAMPLE_MAX_CHARS);
  });

  it('returns changed=false for empty / whitespace-only fragments without writing', () => {
    const existing = ['seed'];
    expect(appendExamplesEntry(existing, '').changed).toBe(false);
    expect(appendExamplesEntry(existing, '   ').changed).toBe(false);
  });

  it('FIFO-evicts the oldest entry when adding past the cap (Task 13 Decision log)', () => {
    const full = Array.from({ length: MATCHER_HINT_EXAMPLES_MAX_COUNT }, (_, i) => `phrase-${i}`);
    const { next, changed } = appendExamplesEntry(full, 'newest patient phrase');
    expect(changed).toBe(true);
    expect(next.length).toBe(MATCHER_HINT_EXAMPLES_MAX_COUNT);
    expect(next[0]).toBe('phrase-1');
    expect(next[next.length - 1]).toBe('newest patient phrase');
  });
});

describe('appendMatcherHintsOnDoctorCatalogOffering — Routing v2 examples-aware branch (Task 13)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('v2 offering + new fragment → fragment appended to examples[], legacy fields stay absent', async () => {
    const catalog = validCatchAllAndOne({ examples: ['acne on my back', 'cystic pimples'] });
    const { client, mocks } = buildSupabaseMock({ service_offerings_json: catalog });
    mockedDb.getSupabaseAdminClient.mockReturnValue(client as never);

    const result = await appendMatcherHintsOnDoctorCatalogOffering(
      doctorId,
      correlationId,
      'acne_treatment',
      { include_when: 'severe acne breakout' }
    );
    expect(result).toBe(true);
    expect(mocks.update).toHaveBeenCalledTimes(1);

    const updateArg = (mocks.update.mock.calls[0]![0] ?? {}) as {
      service_offerings_json?: {
        services?: { service_key: string; matcher_hints?: unknown }[];
      };
    };
    const saved = updateArg.service_offerings_json!.services!.find(
      (s) => s.service_key === 'acne_treatment'
    ) as {
      matcher_hints?: {
        examples?: string[];
        keywords?: string;
        include_when?: string;
        exclude_when?: string;
      };
    };
    expect(saved.matcher_hints?.examples).toEqual([
      'acne on my back',
      'cystic pimples',
      'severe acne breakout',
    ]);
    expect(saved.matcher_hints?.keywords).toBeUndefined();
    expect(saved.matcher_hints?.include_when).toBeUndefined();
  });

  it('v2 offering + already-present fragment (case-insensitive) → no DB write, returns false', async () => {
    const catalog = validCatchAllAndOne({ examples: ['acne on my back', 'cystic pimples'] });
    const { client, mocks } = buildSupabaseMock({ service_offerings_json: catalog });
    mockedDb.getSupabaseAdminClient.mockReturnValue(client as never);

    const result = await appendMatcherHintsOnDoctorCatalogOffering(
      doctorId,
      correlationId,
      'acne_treatment',
      { include_when: '  CYSTIC pimples  ' }
    );
    expect(result).toBe(false);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('v2 offering at the 24-entry cap + new fragment → oldest entry dropped, total stays ≤ 24', async () => {
    const fullExamples = Array.from(
      { length: MATCHER_HINT_EXAMPLES_MAX_COUNT },
      (_, i) => `existing-phrase-${i}`
    );
    const catalog = validCatchAllAndOne({ examples: fullExamples });
    const { client, mocks } = buildSupabaseMock({ service_offerings_json: catalog });
    mockedDb.getSupabaseAdminClient.mockReturnValue(client as never);

    const result = await appendMatcherHintsOnDoctorCatalogOffering(
      doctorId,
      correlationId,
      'acne_treatment',
      { include_when: 'newest learner phrase' }
    );
    expect(result).toBe(true);

    const updateArg = (mocks.update.mock.calls[0]![0] ?? {}) as {
      service_offerings_json?: {
        services?: { service_key: string; matcher_hints?: { examples?: string[] } }[];
      };
    };
    const saved = updateArg.service_offerings_json!.services!.find(
      (s) => s.service_key === 'acne_treatment'
    )!;
    const examples = saved.matcher_hints!.examples!;
    expect(examples.length).toBe(MATCHER_HINT_EXAMPLES_MAX_COUNT);
    expect(examples[0]).toBe('existing-phrase-1');
    expect(examples[examples.length - 1]).toBe('newest learner phrase');
  });

  it('mixed-shape offering (examples + legacy keywords) + new fragment → appended to examples only, legacy keywords byte-identical', async () => {
    const catalog = validCatchAllAndOne({
      examples: ['acne on my back'],
      keywords: 'acne, pimples, dermatology',
      include_when: 'on the face',
    });
    const { client, mocks } = buildSupabaseMock({ service_offerings_json: catalog });
    mockedDb.getSupabaseAdminClient.mockReturnValue(client as never);

    const result = await appendMatcherHintsOnDoctorCatalogOffering(
      doctorId,
      correlationId,
      'acne_treatment',
      { include_when: 'cystic acne breakout' }
    );
    expect(result).toBe(true);

    const updateArg = (mocks.update.mock.calls[0]![0] ?? {}) as {
      service_offerings_json?: {
        services?: { service_key: string; matcher_hints?: unknown }[];
      };
    };
    const saved = updateArg.service_offerings_json!.services!.find(
      (s) => s.service_key === 'acne_treatment'
    ) as {
      matcher_hints?: {
        examples?: string[];
        keywords?: string;
        include_when?: string;
      };
    };
    expect(saved.matcher_hints?.examples).toEqual([
      'acne on my back',
      'cystic acne breakout',
    ]);
    expect(saved.matcher_hints?.keywords).toBe('acne, pimples, dermatology');
    expect(saved.matcher_hints?.include_when).toBe('on the face');
  });

  it('v2 offering + only exclude_when payload → routes through single-string merge (same field in v1/v2)', async () => {
    const catalog = validCatchAllAndOne({
      examples: ['acne on my back'],
      exclude_when: 'hair loss',
    });
    const { client, mocks } = buildSupabaseMock({ service_offerings_json: catalog });
    mockedDb.getSupabaseAdminClient.mockReturnValue(client as never);

    const result = await appendMatcherHintsOnDoctorCatalogOffering(
      doctorId,
      correlationId,
      'acne_treatment',
      { exclude_when: 'wig consultation' }
    );
    expect(result).toBe(true);

    const updateArg = (mocks.update.mock.calls[0]![0] ?? {}) as {
      service_offerings_json?: {
        services?: { service_key: string; matcher_hints?: unknown }[];
      };
    };
    const saved = updateArg.service_offerings_json!.services!.find(
      (s) => s.service_key === 'acne_treatment'
    ) as {
      matcher_hints?: { examples?: string[]; exclude_when?: string };
    };
    expect(saved.matcher_hints?.examples).toEqual(['acne on my back']);
    expect(saved.matcher_hints?.exclude_when).toBe('hair loss; wig consultation');
  });

  it('v2 offering + keywords-only payload (caller fallback path) → folds kw into a single examples entry', async () => {
    const catalog = validCatchAllAndOne({ examples: ['acne on my back'] });
    const { client, mocks } = buildSupabaseMock({ service_offerings_json: catalog });
    mockedDb.getSupabaseAdminClient.mockReturnValue(client as never);

    const result = await appendMatcherHintsOnDoctorCatalogOffering(
      doctorId,
      correlationId,
      'acne_treatment',
      { keywords: 'persistent hormonal acne' }
    );
    expect(result).toBe(true);

    const updateArg = (mocks.update.mock.calls[0]![0] ?? {}) as {
      service_offerings_json?: {
        services?: { service_key: string; matcher_hints?: unknown }[];
      };
    };
    const saved = updateArg.service_offerings_json!.services!.find(
      (s) => s.service_key === 'acne_treatment'
    ) as {
      matcher_hints?: { examples?: string[]; keywords?: string };
    };
    expect(saved.matcher_hints?.examples).toEqual([
      'acne on my back',
      'persistent hormonal acne',
    ]);
    expect(saved.matcher_hints?.keywords).toBeUndefined();
  });
});
